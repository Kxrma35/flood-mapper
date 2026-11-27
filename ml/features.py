# features.py
# Cleaning, model features and the rainfall-rule label, shared by train_model.py and
# check_records.py. backend/lib/model-features.js mirrors the features for live predictions.
import json
import os

import pandas as pd

CELL = ["latitude", "longitude"]

FEATURES = [
    "precipitation_mm", "rain_3h_mm", "rain_6h_mm", "rain_24h_mm", "rain_48h_mm", "rain_72h_mm",
    "humidity", "wind_speed", "temperature", "cloud_cover",
    "month", "hour", "day_of_year",
    "is_rainy_season", "is_peak_month", "is_afternoon", "is_night",
    "is_heavy_rain", "humidity_rain",
]
# No latitude/longitude: the label doesn't depend on place, so location could only add
# spurious "this area rains more" patterns. Zones differ through their own weather.


def prepare(df):
    """Hourly history with zones/latitude/longitude/datetime columns -> cleaned rows with FEATURES."""
    df = df.copy()
    df["datetime"]    = pd.to_datetime(df["datetime"])
    df["hour"]        = df["datetime"].dt.hour
    df["month"]       = df["datetime"].dt.month
    df["day_of_year"] = df["datetime"].dt.day_of_year
    df = df.dropna(subset=["precipitation_mm"])
    df = df[(df["precipitation_mm"] >= 0) & (df["precipitation_mm"] < 300)]
    df["humidity"]    = df["humidity"].clip(0, 100)
    df["wind_speed"]  = df["wind_speed"].clip(0, 100)
    df["cloud_cover"] = df["cloud_cover"].clip(0, 100)
    df = df.drop_duplicates(subset=CELL + ["datetime"]).sort_values(CELL + ["datetime"]).reset_index(drop=True)

    # Rolling totals within each grid cell, so they never mix rain from different places.
    rain = df.groupby(CELL)["precipitation_mm"]
    for hours in (3, 6, 24, 48, 72):
        df[f"rain_{hours}h_mm"] = rain.transform(lambda s: s.rolling(hours, min_periods=1).sum())

    df["is_heavy_rain"]   = (df["precipitation_mm"] > 7.5).astype(int)
    df["is_rainy_season"] = df["month"].isin([3, 4, 5, 10, 11, 12]).astype(int)
    df["is_peak_month"]   = df["month"].isin([4, 11]).astype(int)
    df["is_afternoon"]    = df["hour"].between(14, 17).astype(int)
    df["is_night"]        = (df["hour"] <= 5).astype(int)
    df["humidity_rain"]   = df["humidity"] * df["precipitation_mm"] / 100
    return df


# The training label's rainfall rule, in mm over each window: a flood hour is one where any
# total is above its threshold. Short downpours, or rain building up over three days (the
# April-May 2024 and 6-7 March 2026 floods came from days of moderate rain). The 72-hour
# threshold was chosen with threshold_tradeoff.py against the recorded floods. The backend reads
# the same file to tell the AI chat what counts as heavy rain.
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "data", "flood-rule.json")) as f:
    RULE = json.load(f)


def rule_label(df):
    """The training label: a rainfall rule, not recorded floods. check_records.py tests it."""
    return pd.concat([df[column] > limit for column, limit in RULE.items()], axis=1).any(axis=1).astype(int)
