from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import joblib
import pandas as pd

app = FastAPI()

# Loaded once at startup
model = joblib.load("flood_model.pkl")
scaler = joblib.load("scaler.pkl")
FEATURES = joblib.load("features.pkl")  # ['rainfall_mm', 'rain_3h_mm', ...]

class Zone(BaseModel):
    name: str
    latitude: float
    longitude: float
    precipitation_mm: float   # maps to rainfall_mm
    rain_3h_mm: float
    rain_6h_mm: float
    humidity: float
    wind_speed: float
    month: int

class PredictRequest(BaseModel):
    zones: List[Zone]

@app.post("/predict")
def predict(req: PredictRequest):
    rows = []
    for z in req.zones:
        rows.append({
            "rainfall_mm": z.precipitation_mm,
            "rain_3h_mm":  z.rain_3h_mm,
            "rain_6h_mm":  z.rain_6h_mm,
            "humidity":    z.humidity,
            "wind_speed":  z.wind_speed,
            "month":       z.month,
            "latitude":    z.latitude,
            "longitude":   z.longitude,
        })

    df = pd.DataFrame(rows)[FEATURES]
    X_scaled = scaler.transform(df)

    preds = model.predict(X_scaled)
    probs = model.predict_proba(X_scaled)[:, 1]

    results = []
    for z, pred, prob in zip(req.zones, preds, probs):
        risk = "high" if prob >= 0.7 else "medium" if prob >= 0.4 else "low"
        results.append({
            "name": z.name,
            "latitude": z.latitude,
            "longitude": z.longitude,
            "flood_predicted": bool(pred),
            "flood_probability": round(float(prob), 3),
            "risk": risk,
        })

    return {"zones": results}