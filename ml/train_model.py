# train_model.py
# Same pipeline as nairobi_flood_model.ipynb: hourly Open-Meteo history for
# central Nairobi -> features -> rule-based flood label -> calibrated GBM.
import os

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import brier_score_loss, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "nairobi_raw.csv")

df = pd.read_csv(DATA)

# ── Cleaning ─────────────────────────────────────────────────────
df["datetime"] = pd.to_datetime(df["datetime"])
df = df.dropna(subset=["precipitation_mm"])
df = df[(df["precipitation_mm"] >= 0) & (df["precipitation_mm"] < 300)]
df["humidity"]    = df["humidity"].clip(0, 100)
df["wind_speed"]  = df["wind_speed"].clip(0, 100)
df["cloud_cover"] = df["cloud_cover"].clip(0, 100)
df = df.drop_duplicates(subset=["datetime"]).sort_values("datetime").reset_index(drop=True)

# ── Feature engineering (backend/lib/model-features.js mirrors this) ─
df["rain_3h_mm"]  = df["precipitation_mm"].rolling(3,  min_periods=1).sum()
df["rain_6h_mm"]  = df["precipitation_mm"].rolling(6,  min_periods=1).sum()
df["rain_24h_mm"] = df["precipitation_mm"].rolling(24, min_periods=1).sum()
df["rain_48h_mm"] = df["precipitation_mm"].rolling(48, min_periods=1).sum()

df["is_heavy_rain"]   = (df["precipitation_mm"] > 7.5).astype(int)
df["is_rainy_season"] = df["month"].isin([3, 4, 5, 10, 11, 12]).astype(int)
df["is_peak_month"]   = df["month"].isin([4, 11]).astype(int)
df["is_afternoon"]    = df["hour"].between(14, 17).astype(int)
df["is_night"]        = (df["hour"] <= 5).astype(int)
df["humidity_rain"]   = df["humidity"] * df["precipitation_mm"] / 100

# Label from rainfall rules, not recorded floods.
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
    "latitude", "longitude",
]

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

joblib.dump(model,    os.path.join(HERE, "flood_model.pkl"))
joblib.dump(scaler,   os.path.join(HERE, "scaler.pkl"))
joblib.dump(FEATURES, os.path.join(HERE, "features.pkl"))
print("Model saved!")
