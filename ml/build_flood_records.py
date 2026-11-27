# build_flood_records.py
# Builds backend/data/flood-records.json from two public sources of real flood records:
#   - DesInventar Sendai, Kenya database (KEN-DLD): dated flood reports filed under Nairobi.
#   - UNITAR-UNOSAT flood impact analysis of Nairobi on 1 May 2024 (event FL20240426KEN).
# Reports are matched to zones by place name only: DesInventar's coordinates are often
# missing or placeholders. Both sources are incomplete, so "no record" never means "no flood".
#
#   pip install pyogrio shapely        # only needed for this script
#   python ml/build_flood_records.py   -> backend/data/flood-records.json
import json
import math
import os
import re
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date

import pyogrio.raw
import shapely
import shapely.affinity

HERE = os.path.dirname(os.path.abspath(__file__))
ZONES_PATH = os.path.join(HERE, "..", "backend", "data", "sample-zones.json")
OUTPUT_PATH = os.path.join(HERE, "..", "backend", "data", "flood-records.json")

DESINVENTAR_ZIP = "https://www.desinventar.net/DesInventar/download/DI_export_ken.zip"
UNOSAT_ZIP = "https://unosat.org/static/unosat_filesystem/3834/FL20240426KEN_gdb.zip"
SOURCES = {
    "desinventar": {
        "name": "DesInventar Sendai, Kenya disaster loss database (KEN-DLD)",
        "url": "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=ken",
        "terms": "Owned by the contributing Kenyan institutions; shared publicly with a request for citation.",
    },
    "unosat": {
        "name": "UNITAR-UNOSAT, Flood impact analysis in Nairobi, Kenya, as of 1 May 2024 (preliminary, not field-validated)",
        "url": "https://data.humdata.org/dataset/70148c8d-4d8a-4e70-8c03-c9bb8370cfb7",
        "terms": "CC BY-SA. The per-zone figures here are derived from it and shared under the same licence.",
    },
}

# Other names a report may use for a sample zone. A river named after an area isn't the area.
ALIASES = {"Mathare Valley": ["mathare"], "Eastlands": ["buruburu"], "CBD": ["central business district"]}
IMPACTS = {"muertos": "deaths", "heridos": "injured", "desaparece": "missing", "afectados": "people_affected",
           "evacuados": "evacuated", "vivdest": "houses_destroyed", "vivafec": "houses_damaged"}
NEAR_ZONE_M = 1000


def download(url, folder):
    path = os.path.join(folder, os.path.basename(url))
    req = urllib.request.Request(url, headers={"User-Agent": "FloodSafe-data-builder"})
    with urllib.request.urlopen(req, timeout=300) as res, open(path, "wb") as out:
        out.write(res.read())
    with zipfile.ZipFile(path) as z:
        z.extractall(folder)


def zone_for(place, zones):
    text = place.lower()
    for zone in zones:
        for key in [zone["name"].lower(), *ALIASES.get(zone["name"], [])]:
            match = re.search(rf"\b{re.escape(key)}\b(?!\s+river)", text)
            if match:
                return zone["name"]
    return None


def number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return 0


def desinventar_floods(xml_path, zones):
    records = []
    for _, el in ET.iterparse(xml_path):
        if el.tag == "fichas":
            break
        if el.tag != "TR" or el.find("evento") is None:
            continue
        if el.findtext("evento") == "FLOOD" and el.findtext("name0") == "NAIROBI":
            year, month, day = (int(number(el.findtext(k))) for k in ("fechano", "fechames", "fechadia"))
            when = f"{year}-{month:02d}-{day:02d}" if day else f"{year}-{month:02d}" if month else str(year)
            place = (el.findtext("lugar") or "").strip()
            impacts = {name: int(number(el.findtext(k))) for k, name in IMPACTS.items() if number(el.findtext(k)) > 0}
            records.append({
                "date": when,
                "place": place or None,
                "zone": zone_for(place, zones),
                "cause": (el.findtext("causa") or "").strip() or None,
                "impacts": impacts,
                "description": (el.findtext("di_comments") or "").strip() or None,
                "reported_by": (el.findtext("fuentes") or "").strip() or None,
                "source": "desinventar",
                "source_id": (el.findtext("serial") or "").strip(),
            })
        el.clear()
    return sorted(records, key=lambda r: (r["date"], r["source_id"]))


def layer(gdb, name):
    _, _, geoms, _ = pyogrio.raw.read(gdb, layer=name)
    return shapely.union_all(shapely.from_wkb(geoms))


def circle(lat, lon, metres):
    dlat = metres / 111_320
    dlon = metres / (111_320 * math.cos(math.radians(lat)))
    return shapely.affinity.scale(shapely.Point(lon, lat).buffer(1, 64), dlon, dlat)


def unosat_by_zone(gdb, zones):
    analysed = layer(gdb, "PL_20240501_AnalysisExtent_Nairobi_Kiambu")
    flooded = layer(gdb, "PL_20240501_FloodExtent_Nairobi_Kiambu")
    cloud = layer(gdb, "PL_20240501_CloudObstruction_Nairobi_Kiambu")
    meta, _, geoms, fields = pyogrio.raw.read(gdb, layer="PL_20240501_AffectedStructureNairobi_Kiambu")
    damage = fields[list(meta["fields"]).index("Grouped_Damage_Classes")]
    points = shapely.from_wkb(geoms)[damage == 1]
    # The Nairobi and Kiambu analyses overlap, so some structures appear twice.
    xy = {(round(shapely.get_x(p), 6), round(shapely.get_y(p), 6)) for p in points}
    xs, ys = zip(*xy)

    result = {}
    for zone in zones:
        area = circle(zone["latitude"], zone["longitude"], NEAR_ZONE_M)
        covered = area.intersection(analysed)
        share = lambda geom: round(100 * geom.area / area.area, 1)
        if share(covered) < 50:
            result[zone["name"]] = {"analysed": False}
            continue
        result[zone["name"]] = {
            "analysed": True,
            "analysed_pct": share(covered),
            "cloud_pct": share(covered.intersection(cloud)),
            "flooded_pct": share(covered.intersection(flooded)),
            "affected_structures": int(shapely.contains_xy(area, xs, ys).sum()),
        }
    return result


def main():
    with open(ZONES_PATH) as f:
        zones = json.load(f)
    with tempfile.TemporaryDirectory() as folder:
        print("Downloading DesInventar Kenya export...")
        download(DESINVENTAR_ZIP, folder)
        records = desinventar_floods(os.path.join(folder, "DI_export_ken.xml"), zones)
        print("Downloading UNOSAT 1 May 2024 Nairobi analysis...")
        download(UNOSAT_ZIP, folder)
        satellite = unosat_by_zone(os.path.join(folder, "FL20240426KEN.gdb"), zones)

    output = {
        "built": date.today().isoformat(),
        "sources": SOURCES,
        "near_zone_m": NEAR_ZONE_M,
        "records": records,
        # The event code's date (26 April) to the image date: when the flooding it maps happened.
        "satellite_2024": {"event": "FL20240426KEN", "event_start": "2024-04-26", "date": "2024-05-01",
                           "source": "unosat", "zones": satellite},
    }
    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(OUTPUT_PATH), suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(output, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.chmod(tmp_path, 0o644)
    os.replace(tmp_path, OUTPUT_PATH)
    matched = sum(1 for r in records if r["zone"])
    print(f"Saved {len(records)} Nairobi flood records ({matched} matched to a zone) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
