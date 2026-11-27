# build_flood_data.py
# Builds FloodSafe's flood areas and flood records from public sources:
#   - OpenStreetMap (ODbL): Nairobi's suburbs and the settlements the reports below name,
#     for names and map points.
#   - SPACE4ALL (University of Twente), FASTFLOOD flood hazard for Nairobi (CC BY 4.0):
#     modelled flood depth on a 100 m grid for a 10-12 hour storm.
#   - DesInventar Sendai, Kenya database (KEN-DLD): dated flood reports filed under Nairobi.
#   - UNITAR-UNOSAT flood impact analysis of Nairobi on 1 May 2024 (CC BY-SA).
#   - Reports naming the worst-hit settlements: SPACE4ALL's "Diagnostic of Urban Flooding in
#     Nairobi" (2024) and WRI's "Flooding in Nairobi's Informal Settlements" (2026).
#   - ml/flood_reports.json: dated Nairobi floods since 2017 from news and agency reports,
#     summarised by hand with a link to each report.
# A place becomes a flood area only with evidence of real flooding: a study names it, a
# DesInventar or news report of a flood names it, or the 2024 satellite image shows flooding
# near it. The
# modelled hazard is shown for each area but never decides which areas are listed.
#
#   pip install pyogrio shapely pandas   # only needed for this script
#   python ml/build_flood_data.py
#     -> backend/data/flood-areas.json, backend/data/flood-records.json,
#        frontend/public/flood-zones.geojson, frontend/public/flood-hazard.png
import json
import math
import os
import re
import tempfile
import time
import urllib.parse
import urllib.request
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib
from datetime import date

import numpy as np
import pandas as pd
import pyogrio.raw
import shapely
import shapely.affinity
import shapely.geometry

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
AREAS_PATH = os.path.join(ROOT, "backend", "data", "flood-areas.json")
RECORDS_PATH = os.path.join(ROOT, "backend", "data", "flood-records.json")
GEOJSON_PATH = os.path.join(ROOT, "frontend", "public", "flood-zones.geojson")
REPORTS_PATH = os.path.join(HERE, "flood_reports.json")
HAZARD_PNG_PATH = os.path.join(ROOT, "frontend", "public", "flood-hazard.png")

DESINVENTAR_ZIP = "https://www.desinventar.net/DesInventar/download/DI_export_ken.zip"
UNOSAT_ZIP = "https://unosat.org/static/unosat_filesystem/3834/FL20240426KEN_gdb.zip"
HAZARD_CSV = "https://zenodo.org/records/18659986/files/FloodHazard_Nairobi.csv?download=1"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

RADIUS_M = 1000  # an area is the land within this distance of its OpenStreetMap point

AREA_SOURCES = {
    "osm": {
        "name": "OpenStreetMap: place names and points",
        "url": "https://www.openstreetmap.org/copyright",
        "terms": "© OpenStreetMap contributors, ODbL.",
    },
    "space4all_model": {
        "name": "SPACE4ALL (University of Twente), city-scale flood hazard modelled with FASTFLOOD, Nairobi",
        "url": "https://zenodo.org/records/18659986",
        "terms": "CC BY 4.0. A simplified model of one 10-12 hour storm that ignores drains and culverts and was not calibrated.",
    },
    "space4all_report": {
        "name": "SPACE4ALL, Diagnostic of Urban Flooding in Nairobi: Report 2024",
        "url": "https://kenyaclimatedirectory.org/resources/6904e4c4502d2",
        "terms": "Names Mathare, Kibera and Korogocho as disproportionately affected.",
    },
    "wri_brief": {
        "name": "WRI, Flooding in Nairobi's Informal Settlements (issue brief, 2026)",
        "url": "https://doi.org/10.46830/wriib.25.00024",
        "terms": "Names Mathare, Mukuru and Kibera among the hardest hit in 2024; surveyed Mukuru Viwandani.",
    },
}
RECORD_SOURCES = {
    "desinventar": {
        "name": "DesInventar Sendai, Kenya disaster loss database (KEN-DLD)",
        "url": "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=ken",
        "terms": "Owned by the contributing Kenyan institutions; shared publicly with a request for citation.",
    },
    "reports": {
        "name": "News and agency reports of Nairobi floods since 2017 (ml/flood_reports.json)",
        "url": "https://github.com/Kxrma35/flood-mapper/blob/main/ml/flood_reports.json",
        "terms": "Summarised in FloodSafe's own words, with a link to each report.",
    },
    "unosat": {
        "name": "UNITAR-UNOSAT, Flood impact analysis in Nairobi, Kenya, as of 1 May 2024 (preliminary, not field-validated)",
        "url": "https://data.humdata.org/dataset/70148c8d-4d8a-4e70-8c03-c9bb8370cfb7",
        "terms": "CC BY-SA. The per-area figures here are derived from it and shared under the same licence.",
    },
}

# Settlements the reports name, by OpenStreetMap element, so a repeated name can't pick the
# wrong place (OpenStreetMap has two Sowetos, for example).
NAMED_IN_REPORTS = {
    "node/11155030940": ["space4all_report", "wri_brief"],  # Mathare
    "node/11007276790": ["space4all_report", "wri_brief"],  # Kibera
    "node/289911998": ["space4all_report"],                 # Korogocho
    "node/10271095499": ["wri_brief"],                      # Mukuru Kwa Njenga
    "node/10271125000": ["wri_brief"],                      # Mukuru Kwa Ruben
    "node/11407583745": ["wri_brief"],                      # Viwandani (Mukuru Viwandani)
}
# The CBD isn't tagged as a place in OpenStreetMap; this is its "Central Business District" area.
CBD = "way/239077078"
DISPLAY_NAMES = {CBD: "CBD"}
# Other spellings reports use for the same place.
ALIASES = {
    "CBD": ["central business district"],
    "Kibera": ["kibra"],
    "Babadogo": ["baba dogo"],
    "Mukuru Kwa Ruben": ["mukuru kwa reuben"],
    "Langata": ["lang'ata"],
}

IMPACTS = {"muertos": "deaths", "heridos": "injured", "desaparece": "missing", "afectados": "people_affected",
           "evacuados": "evacuated", "vivdest": "houses_destroyed", "vivafec": "houses_damaged"}
UNOSAT_MIN_FLOODED_PCT = 1
UNOSAT_MIN_STRUCTURES = 10


def fetch(url, data=None, attempts=3):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "FloodSafe-data-builder"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                return res.read()
        except urllib.error.HTTPError as err:
            if err.code not in (429, 502, 503, 504) or attempt == attempts - 1:
                raise
            time.sleep(30)


def download_zip(url, folder):
    path = os.path.join(folder, os.path.basename(url))
    with open(path, "wb") as out:
        out.write(fetch(url))
    with zipfile.ZipFile(path) as z:
        z.extractall(folder)


def osm_places():
    ids = lambda kind: ",".join(k.split("/")[1] for k in NAMED_IN_REPORTS if k.startswith(kind))
    query = f"""[out:json][timeout:90];
area["name"="Nairobi"]["boundary"="administrative"]["admin_level"="4"]->.nairobi;
(node["place"="suburb"]["name"](area.nairobi); node(id:{ids("node")}); way(id:{CBD.split("/")[1]}););
out center tags;"""
    elements = json.loads(fetch(OVERPASS_URL, urllib.parse.urlencode({"data": query}).encode()))["elements"]
    places = []
    for e in elements:
        key = f"{e['type']}/{e['id']}"
        point = e.get("center") or e
        places.append({"name": DISPLAY_NAMES.get(key, e["tags"]["name"]), "osm": key,
                       "latitude": round(point["lat"], 5), "longitude": round(point["lon"], 5)})
    missing = set(NAMED_IN_REPORTS) - {p["osm"] for p in places}
    if missing:
        raise RuntimeError(f"OpenStreetMap no longer has {sorted(missing)}; check NAMED_IN_REPORTS")
    return places


def matcher(places):
    """Finds the place a report's text names, longest name first. Names shared by two places
    are ambiguous and never matched, and a river named after a place isn't the place."""
    counts = {}
    for p in places:
        counts[p["name"]] = counts.get(p["name"], 0) + 1
    keys = [(key, p["name"]) for p in places if counts[p["name"]] == 1
            for key in [p["name"].lower(), *ALIASES.get(p["name"], [])]]
    keys.sort(key=lambda k: len(k[0]), reverse=True)

    def place_for(text):
        text = text.lower()
        for key, name in keys:
            if re.search(rf"\b{re.escape(key)}\b(?!\s+river)", text):
                return name
        return None
    return place_for


def number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return 0


def desinventar_floods(xml_path, place_for):
    records = []
    for _, el in ET.iterparse(xml_path):
        if el.tag == "fichas":
            break
        if el.tag != "TR" or el.find("evento") is None:
            continue
        if el.findtext("evento") == "FLOOD" and el.findtext("name0") == "NAIROBI":
            year, month, day = (int(number(el.findtext(k))) for k in ("fechano", "fechames", "fechadia"))
            place = (el.findtext("lugar") or "").strip()
            records.append({
                "date": f"{year}-{month:02d}-{day:02d}" if day else f"{year}-{month:02d}" if month else str(year),
                "place": place or None,
                "zone": place_for(place),
                "cause": (el.findtext("causa") or "").strip() or None,
                "impacts": {name: int(number(el.findtext(k))) for k, name in IMPACTS.items() if number(el.findtext(k)) > 0},
                "description": (el.findtext("di_comments") or "").strip() or None,
                "reported_by": (el.findtext("fuentes") or "").strip() or None,
                "source": "desinventar",
                "source_id": (el.findtext("serial") or "").strip(),
            })
        el.clear()
    return sorted(records, key=lambda r: (r["date"], r["source_id"]))


def news_reports(place_for):
    """One record per area a report names (or one Nairobi-wide record if it names none)."""
    with open(REPORTS_PATH) as f:
        reports = json.load(f)
    records = []
    for report in reports:
        named = {}
        for place in report["places"]:
            area = place_for(place)
            if area:
                named.setdefault(area, []).append(place)
        base = {
            "date": report["date"],
            "date_end": report.get("date_end"),
            "date_note": report.get("date_note"),
            "cause": "Rain",
            "impacts": report.get("impacts", {}),
            "description": report["description"],
            "reported_by": report.get("reported_by"),
            "source": "reports",
            "source_id": report["id"],
            "links": report["sources"],
        }
        if named:
            records += [{**base, "zone": area, "place": ", ".join(places)} for area, places in named.items()]
        else:
            records.append({**base, "zone": None, "place": ", ".join(report["places"])})
    return records


def circle(lat, lon, metres=RADIUS_M, points=64):
    dlat = metres / 111_320
    dlon = metres / (111_320 * math.cos(math.radians(lat)))
    return shapely.affinity.scale(shapely.Point(lon, lat).buffer(1, points // 4), dlon, dlat)


class Unosat:
    def __init__(self, gdb):
        layer = lambda name: shapely.union_all(shapely.from_wkb(pyogrio.raw.read(gdb, layer=name)[2]))
        self.analysed = layer("PL_20240501_AnalysisExtent_Nairobi_Kiambu")
        self.flooded = layer("PL_20240501_FloodExtent_Nairobi_Kiambu")
        self.cloud = layer("PL_20240501_CloudObstruction_Nairobi_Kiambu")
        meta, _, geoms, fields = pyogrio.raw.read(gdb, layer="PL_20240501_AffectedStructureNairobi_Kiambu")
        damage = fields[list(meta["fields"]).index("Grouped_Damage_Classes")]
        # The Nairobi and Kiambu analyses overlap, so some structures appear twice.
        xy = {(round(shapely.get_x(p), 6), round(shapely.get_y(p), 6)) for p in shapely.from_wkb(geoms)[damage == 1]}
        self.xs, self.ys = map(np.array, zip(*xy))

    def near(self, place):
        area = circle(place["latitude"], place["longitude"])
        covered = area.intersection(self.analysed)
        share = lambda geom: round(100 * geom.area / area.area, 1)
        if share(covered) < 50:
            return {"analysed": False}
        return {
            "analysed": True,
            "analysed_pct": share(covered),
            "cloud_pct": share(covered.intersection(self.cloud)),
            "flooded_pct": share(covered.intersection(self.flooded)),
            "affected_structures": int(shapely.contains_xy(area, self.xs, self.ys).sum()),
        }


def hazard_near(cells, place):
    """Share of land modelled to flood deeper than 10 cm and 1 m, or None outside the model."""
    lat, lon = place["latitude"], place["longitude"]
    dlat, dlon = RADIUS_M / 111_320, RADIUS_M / (111_320 * math.cos(math.radians(lat)))
    inside = cells[np.hypot((cells.latitude - lat) / dlat, (cells.longitude - lon) / dlon) <= 1]
    cell_m2 = ((cells.lat_max - cells.lat_min) * 111_320 * (cells.lon_max - cells.lon_min) * 111_320 * math.cos(math.radians(lat))).median()
    if len(inside) < 0.5 * math.pi * RADIUS_M ** 2 / cell_m2:
        return None
    return {"wet_pct": round(100 * (inside.flood_hazard >= 1).mean(), 1),
            "deep_pct": round(100 * (inside.flood_hazard == 2).mean(), 1)}


# The map's flood-depth layer: transparent outside the model, a faint tint where it has under
# 10 cm (so "dry" and "not modelled" look different), then 10 cm-1 m and over 1 m.
HAZARD_PALETTE = [(0, 0, 0, 0), (255, 255, 255, 26), (79, 195, 247, 140), (13, 71, 161, 215)]
HAZARD_PNG_SCALE = 2  # pixels per cell edge; the grid's columns shift a little from row to row


def hazard_png(cells, path):
    """Draws every cell's own box onto an image and returns the image's [[south, west], [north, east]]."""
    south, west, north, east = cells.lat_min.min(), cells.lon_min.min(), cells.lat_max.max(), cells.lon_max.max()
    dy = (cells.lat_max - cells.lat_min).median() / HAZARD_PNG_SCALE
    dx = (cells.lon_max - cells.lon_min).median() / HAZARD_PNG_SCALE
    height, width = int(round((north - south) / dy)), int(round((east - west) / dx))
    pixels = np.zeros((height, width), dtype=np.uint8)
    for level in (0, 1, 2):  # deeper cells drawn last, so they win where boxes overlap
        for c in cells[cells.flood_hazard == level].itertuples():
            top, bottom = int(round((north - c.lat_max) / dy)), int(round((north - c.lat_min) / dy))
            left, right = int(round((c.lon_min - west) / dx)), int(round((c.lon_max - west) / dx))
            pixels[top:bottom, left:right] = level + 1

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    rows = b"".join(b"\x00" + row.tobytes() for row in pixels)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0))
           + chunk(b"PLTE", bytes(v for colour in HAZARD_PALETTE for v in colour[:3]))
           + chunk(b"tRNS", bytes(colour[3] for colour in HAZARD_PALETTE))
           + chunk(b"IDAT", zlib.compress(rows, 9))
           + chunk(b"IEND", b""))
    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "wb") as f:
        f.write(png)
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, path)
    return [[round(south, 6), round(west, 6)], [round(north, 6), round(east, 6)]]


def write_json(path, data, indent=1):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)
        f.write("\n")
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, path)


def main():
    print("Reading place names from OpenStreetMap...")
    places = osm_places()
    place_for = matcher(places)

    with tempfile.TemporaryDirectory() as folder:
        print("Downloading DesInventar Kenya export...")
        download_zip(DESINVENTAR_ZIP, folder)
        records = desinventar_floods(os.path.join(folder, "DI_export_ken.xml"), place_for)
        records = sorted(records + news_reports(place_for), key=lambda r: (r["date"], r["source_id"]))
        print("Downloading UNOSAT 1 May 2024 Nairobi analysis...")
        download_zip(UNOSAT_ZIP, folder)
        unosat = Unosat(os.path.join(folder, "FL20240426KEN.gdb"))
        print("Downloading SPACE4ALL flood hazard...")
        hazard_path = os.path.join(folder, "FloodHazard_Nairobi.csv")
        with open(hazard_path, "wb") as out:
            out.write(fetch(HAZARD_CSV))
        cells = pd.read_csv(hazard_path, encoding="utf-8-sig")

    named_in = lambda source: {r["zone"] for r in records if r["zone"] and r["source"] == source}
    in_desinventar, in_reports = named_in("desinventar"), named_in("reports")
    areas, satellite = [], {}
    for place in places:
        seen = unosat.near(place)
        evidence = list(NAMED_IN_REPORTS.get(place["osm"], []))
        if place["name"] in in_desinventar:
            evidence.append("desinventar")
        if place["name"] in in_reports:
            evidence.append("reports")
        if seen["analysed"] and (seen["flooded_pct"] >= UNOSAT_MIN_FLOODED_PCT or seen["affected_structures"] >= UNOSAT_MIN_STRUCTURES):
            evidence.append("unosat")
        if evidence:
            areas.append({**place, "evidence": evidence, "hazard": hazard_near(cells, place)})
            satellite[place["name"]] = seen
    areas.sort(key=lambda a: a["name"])
    city = {"wet_pct": round(100 * (cells.flood_hazard >= 1).mean(), 1),
            "deep_pct": round(100 * (cells.flood_hazard == 2).mean(), 1)}

    built = date.today().isoformat()
    os.makedirs(os.path.dirname(HAZARD_PNG_PATH), exist_ok=True)
    hazard_bounds = hazard_png(cells, HAZARD_PNG_PATH)
    write_json(AREAS_PATH, {"built": built, "radius_m": RADIUS_M, "sources": AREA_SOURCES,
                            "city_hazard": city, "areas": areas})
    write_json(RECORDS_PATH, {
        "built": built,
        "sources": RECORD_SOURCES,
        "near_zone_m": RADIUS_M,
        "records": records,
        # The event code's date (26 April) to the image date: when the flooding it maps happened.
        "satellite_2024": {"event": "FL20240426KEN", "event_start": "2024-04-26", "date": "2024-05-01",
                           "source": "unosat", "zones": dict(sorted(satellite.items()))},
    })
    write_json(GEOJSON_PATH, {
        "type": "FeatureCollection",
        "floodsafe": {"built": built, "radius_m": RADIUS_M, "city_hazard": city,
                      "hazard_layer": {"url": "/flood-hazard.png", "bounds": hazard_bounds},
                      "sources": {**AREA_SOURCES, **RECORD_SOURCES}},
        "features": [{
            "type": "Feature",
            "properties": {"name": a["name"], "risk": "documented", "rain_threshold": None,
                           "evidence": a["evidence"], "hazard": a["hazard"], "osm": a["osm"]},
            "geometry": shapely.geometry.mapping(shapely.set_precision(circle(a["latitude"], a["longitude"]), 1e-5)),
        } for a in areas],
    }, indent=None)

    matched = sum(1 for r in records if r["zone"] and r["source"] == "desinventar")
    print(f"{len(areas)} flood areas from {len(places)} places; {sum(r['source'] == 'desinventar' for r in records)} DesInventar "
          f"records ({matched} matched to an area); {len(json.load(open(REPORTS_PATH)))} news reports naming "
          f"{len(in_reports)} areas")


if __name__ == "__main__":
    main()
