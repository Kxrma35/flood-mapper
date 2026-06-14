# train_model.py
import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report
import joblib

df = pd.read_csv("your-flood-data.csv")

# ── Feature engineering ──────────────────────────────────────────
df["month"] = pd.to_datetime(df["date"]).dt.month  # if date column exists

# Simulate rolling rain if not in dataset (replace with real values if available)
df["rain_3h_mm"] = df["rainfall_mm"].rolling(3, min_periods=1).sum()
df["rain_6h_mm"] = df["rainfall_mm"].rolling(6, min_periods=1).sum()

# Flood label: zone floods when rainfall exceeds its threshold
df["flood"] = (df["rainfall_mm"] >= df["rain_threshold_mm"]).astype(int)

# ── Features matching what Open-Meteo gives us live ──────────────
FEATURES = [
    "rainfall_mm",      # current hour precipitation
    "rain_3h_mm",       # 3-hour cumulative
    "rain_6h_mm",       # 6-hour cumulative
    "humidity",         # relativehumidity_2m
    "wind_speed",       # windspeed_10m
    "month",            # seasonality (Nairobi has 2 rainy seasons)
    "latitude",
    "longitude",
]

df = df.dropna(subset=FEATURES + ["flood"])
X = df[FEATURES]
y = df["flood"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s  = scaler.transform(X_test)

model = GradientBoostingClassifier(n_estimators=200, max_depth=4, random_state=42)
model.fit(X_train_s, y_train)

print(classification_report(y_test, model.predict(X_test_s)))

joblib.dump(model,   "flood_model.pkl")
joblib.dump(scaler,  "scaler.pkl")
joblib.dump(FEATURES, "features.pkl")
print("Model saved!")