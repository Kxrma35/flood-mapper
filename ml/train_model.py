# train_model.py
# Hourly Open-Meteo history for each zone's weather grid cell (ml/fetch_history.py)
# -> features -> rule-based flood label -> calibrated GBM. The pipeline follows
# nairobi_flood_model.ipynb, which analysed the central cell only (nairobi_raw.csv).
import os
import tempfile

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import brier_score_loss, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "zone_history.csv.gz")

df = pd.read_csv(DATA)
CELL = ["latitude", "longitude"]

# ── Cleaning ─────────────────────────────────────────────────────
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

# ── Feature engineering (backend/lib/model-features.js mirrors this) ─
# Rolling totals within each grid cell, so they never mix rain from different places.
rain = df.groupby(CELL)["precipitation_mm"]
for hours in (3, 6, 24, 48):
    df[f"rain_{hours}h_mm"] = rain.transform(lambda s: s.rolling(hours, min_periods=1).sum())

df["is_heavy_rain"]   = (df["precipitation_mm"] > 7.5).astype(int)
df["is_rainy_season"] = df["month"].isin([3, 4, 5, 10, 11, 12]).astype(int)
df["is_peak_month"]   = df["month"].isin([4, 11]).astype(int)
df["is_afternoon"]    = df["hour"].between(14, 17).astype(int)
df["is_night"]        = (df["hour"] <= 5).astype(int)
df["humidity_rain"]   = df["humidity"] * df["precipitation_mm"] / 100

# Label from rainfall rules, not recorded floods: the same rule for every place, applied to
# that place's own rain. It can't capture one area flooding more easily than another.
df["flood"] = (
    (df["precipitation_mm"] > 10) |
    (df["rain_3h_mm"]  > 25)      |
    (df["rain_24h_mm"] > 50)
).astype(int)

FEATURES = [
    "precipitation_mm", "rain_3h_mm", "rain_6h_mm", "rain_24h_mm", "rain_48h_mm",
    "humidity", "wind_speed", "temperature", "cloud_cover",
    "month", "hour", "day_of_year",
    "is_rainy_season", "is_peak_month", "is_afternoon", "is_night",
    "is_heavy_rain", "humidity_rain",
]
# No latitude/longitude: the label doesn't depend on place, so location could only add
# spurious "this area rains more" patterns. Zones differ through their own weather.

X = df[FEATURES]
y = df["flood"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s  = scaler.transform(X_test)

base_model = GradientBoostingClassifier(
    n_estimators=200, max_depth=4, learning_rate=0.1, subsample=0.8, random_state=42
)
model = CalibratedClassifierCV(base_model, cv=3, method="sigmoid")
model.fit(X_train_s, y_train)

y_proba = model.predict_proba(X_test_s)[:, 1]
print(classification_report(y_test, model.predict(X_test_s), target_names=["No Flood", "Flood"]))
print(f"ROC-AUC : {roc_auc_score(y_test, y_proba):.4f}")
print(f"Brier   : {brier_score_loss(y_test, y_proba):.4f}")
print("\nRows and rule-labelled flood hours per grid cell:")
print(df.groupby("zones")["flood"].agg(rows="size", flood_hours="sum").to_string())

# One bundle, written to a temporary file and swapped in at once, so the ML service can
# never load a model, scaler and feature list from different training runs.
fd, tmp_path = tempfile.mkstemp(dir=HERE, suffix=".tmp")
os.close(fd)
joblib.dump({"model": model, "scaler": scaler, "features": FEATURES}, tmp_path)
os.replace(tmp_path, os.path.join(HERE, "model.joblib"))
print("Model saved to ml/model.joblib")
