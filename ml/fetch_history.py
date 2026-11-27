# fetch_history.py
# Downloads hourly weather history (Open-Meteo archive, the same source as nairobi_raw.csv)
# for every zone's location, so the model can be trained on each area's own rainfall.
# Zones that fall in the same model grid cell (about 8 km) share one download.
#
#   python ml/fetch_history.py            -> ml/zone_history.csv.gz
import json
import os
import tempfile
import time
import urllib.parse
import urllib.request

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ZONES_PATH = os.path.join(HERE, "..", "backend", "data", "sample-zones.json")
OUTPUT_PATH = os.path.join(HERE, "zone_history.csv.gz")
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
START, END = "2018-01-01", "2024-12-31"
VARIABLES = {
    "precipitation": "precipitation_mm",
    "rain": "rain_mm",
    "relative_humidity_2m": "humidity",
    "wind_speed_10m": "wind_speed",
    "temperature_2m": "temperature",
    "cloud_cover": "cloud_cover",
}


def get(params):
    url = ARCHIVE_URL + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=300) as res:
        return json.load(res)


def grid_cells(zones):
    """Asks for one day at every zone to learn which grid cell each one falls in."""
    data = get({
        "latitude": ",".join(str(z["latitude"]) for z in zones),
        "longitude": ",".join(str(z["longitude"]) for z in zones),
        "hourly": "precipitation",
        "start_date": START,
        "end_date": START,
        "timezone": "Africa/Nairobi",
    })
    data = data if isinstance(data, list) else [data]
    cells = {}
    for zone, result in zip(zones, data):
        key = (result["latitude"], result["longitude"])
        cells.setdefault(key, []).append(zone["name"])
    return cells


def main():
    with open(ZONES_PATH) as f:
        zones = json.load(f)

    frames = []
    for (lat, lon), names in grid_cells(zones).items():
        print(f"Downloading {START}..{END} for cell ({lat}, {lon}): {', '.join(names)}")
        data = get({
            "latitude": lat,
            "longitude": lon,
            "hourly": ",".join(VARIABLES),
            "start_date": START,
            "end_date": END,
            "timezone": "Africa/Nairobi",
        })
        frame = pd.DataFrame(data["hourly"]).rename(columns={"time": "datetime", **VARIABLES})
        frame.insert(0, "zones", ";".join(names))
        frame.insert(1, "latitude", lat)
        frame.insert(2, "longitude", lon)
        frames.append(frame)
        time.sleep(1)  # be gentle with the free archive API

    history = pd.concat(frames, ignore_index=True)
    # Write to a temporary file and swap it in, so an interrupted run can't leave a broken file.
    fd, tmp_path = tempfile.mkstemp(dir=HERE, suffix=".csv.gz.tmp")
    os.close(fd)
    history.to_csv(tmp_path, index=False, compression="gzip")
    os.replace(tmp_path, OUTPUT_PATH)
    print(f"Saved {len(history):,} rows for {len(frames)} grid cells to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
