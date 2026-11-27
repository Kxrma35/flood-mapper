# check_records.py
# Tests the saved model against real recorded floods (backend/data/flood-records.json, built
# by build_flood_records.py): did it reach HIGH anywhere in Nairobi during each flood?
#   - DesInventar's rain-related flood reports: that day or the day before (reports are
#     often dated the next day).
#   - UNOSAT's April-May 2024 event: from the event code's date to the satellite image.
#   - News and agency reports since 2017 (ml/flood_reports.json): the flood's date(s) and the
#     day before.
# Each result is compared with how often the model reaches HIGH in any window of the same
# length in the same years, so a hit can be told apart from a model that is always HIGH.
# Years already in zone_history.csv.gz are read from it; only the rest are downloaded.
#
#   python ml/check_records.py   -> ml/record_check.csv and a printed summary
import json
import os
from datetime import date, timedelta

import joblib
import pandas as pd

from features import prepare
from fetch_history import download

HERE = os.path.dirname(os.path.abspath(__file__))
HISTORY_PATH = os.path.join(HERE, "zone_history.csv.gz")
RECORDS_PATH = os.path.join(HERE, "..", "backend", "data", "flood-records.json")
OUTPUT_PATH = os.path.join(HERE, "record_check.csv")
RAIN_CAUSES = {"Rain", "Flood", "El Niño"}  # DesInventar's own cause field
HIGH = 0.65  # predict_server.py's HIGH cut-off


def flood_windows(data):
    windows = []
    desinventar = [r for r in data["records"] if r["source"] == "desinventar"]
    for day in sorted({r["date"] for r in desinventar if r["cause"] in RAIN_CAUSES and len(r["date"]) == 10}):
        same_day = [r for r in desinventar if r["date"] == day and r["cause"] in RAIN_CAUSES]
        windows.append({
            "source": "DesInventar",
            "start": pd.Timestamp(day) - pd.Timedelta(days=1),
            "end": pd.Timestamp(day),
            "what": "; ".join(r["place"] or "Nairobi (no place given)" for r in same_day),
        })
    event = data["satellite_2024"]
    windows.append({
        "source": "UNOSAT",
        "start": pd.Timestamp(event["event_start"]),
        "end": pd.Timestamp(event["date"]),
        "what": f"event {event['event']} (satellite image {event['date']})",
    })
    reports = {}
    for r in data["records"]:
        if r["source"] == "reports":
            reports.setdefault(r["source_id"], r)
    for r in sorted(reports.values(), key=lambda r: r["date"]):
        windows.append({
            "source": "Reports",
            "start": pd.Timestamp(r["date"]) - pd.Timedelta(days=1),
            "end": pd.Timestamp(r.get("date_end") or r["date"]),
            "what": r["source_id"],
        })
    return windows


ARCHIVE_DELAY_DAYS = 6  # the archive lags a few days behind today


def history(first_year, last_year):
    saved = pd.read_csv(HISTORY_PATH)
    saved_years = set(pd.to_datetime(saved["datetime"]).dt.year)
    missing = [y for y in range(first_year, last_year + 1) if y not in saved_years]
    parts = [saved[pd.to_datetime(saved["datetime"]).dt.year.between(first_year, last_year)]]
    # Download each run of missing years separately, so saved years in between aren't fetched again.
    runs = []
    for year in missing:
        if runs and year == runs[-1][1] + 1:
            runs[-1][1] = year
        else:
            runs.append([year, year])
    latest = date.today() - timedelta(days=ARCHIVE_DELAY_DAYS)
    for start, end in runs:
        end_date = min(date(end, 12, 31), latest)
        parts.append(download(f"{start}-01-01", end_date.isoformat()))
    return pd.concat(parts, ignore_index=True)


def main():
    with open(RECORDS_PATH) as f:
        windows = flood_windows(json.load(f))
    first, last = min(w["start"] for w in windows), max(w["end"] for w in windows)

    bundle = joblib.load(os.path.join(HERE, "model.joblib"))
    df = prepare(history(first.year, last.year))
    df["probability"] = bundle["model"].predict_proba(bundle["scaler"].transform(df[bundle["features"]].values))[:, 1]

    # City-wide: the highest value in any of Nairobi's grid cells on each day.
    daily = df.groupby(df["datetime"].dt.normalize()).agg(
        probability=("probability", "max"),
        rain_mm_per_hr=("precipitation_mm", "max"),
        rain_24h_mm=("rain_24h_mm", "max"),
        rain_72h_mm=("rain_72h_mm", "max"),
    )

    rows = []
    for w in windows:
        span = daily.loc[w["start"]:w["end"]]
        rows.append({
            "source": w["source"],
            "from": w["start"].date(),
            "to": w["end"].date(),
            "what": w["what"],
            "max_rain_mm_per_hr": round(span["rain_mm_per_hr"].max(), 1),
            "max_rain_24h_mm": round(span["rain_24h_mm"].max(), 1),
            "max_rain_72h_mm": round(span["rain_72h_mm"].max(), 1),
            "max_probability": round(span["probability"].max(), 3),
            "model_high": bool(span["probability"].max() > HIGH),
        })
    result = pd.DataFrame(rows)
    result.to_csv(OUTPUT_PATH, index=False)
    print(result.drop(columns="what").to_string(index=False))

    print()
    for source, group in result.groupby("source", sort=False):
        lengths = (pd.to_datetime(group["to"]) - pd.to_datetime(group["from"])).dt.days + 1
        length = int(lengths.max())
        each = f"{length} days each" if lengths.nunique() == 1 else f"up to {length} days each"
        years = daily.loc[str(group["from"].min().year):str(group["to"].max().year)]
        any_high = (years["probability"] > HIGH).astype(int).rolling(length, min_periods=1).max()
        y0, y1 = years.index.min().year, years.index.max().year
        print(f"{source}: HIGH in {int(group['model_high'].sum())} of {len(group)} recorded flood "
              f"{'window' if len(group) == 1 else 'windows'} ({each}). In {y0 if y0 == y1 else f'{y0}-{y1}'}, "
              f"{any_high.mean():.1%} of all {length}-day windows had a HIGH.")
    print(f"Saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
