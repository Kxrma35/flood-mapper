# predict_server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np

app = Flask(__name__)
CORS(app)

model    = joblib.load("flood_model.pkl")
scaler   = joblib.load("scaler.pkl")
FEATURES = joblib.load("features.pkl")

@app.route("/predict", methods=["POST"])
def predict():
    """
    Expects JSON:
    {
      "zones": [
        { "name": "Mathare", "latitude": -1.258, "longitude": 36.859,
          "rainfall_mm": 12, "rain_3h_mm": 28, "rain_6h_mm": 45,
          "humidity": 80, "wind_speed": 12, "month": 4 }
      ]
    }
    """
    zones = request.json.get("zones", [])
    results = []

    for z in zones:
        try:
            X = np.array([[z[f] for f in FEATURES]])
            X_s = scaler.transform(X)
            prob = float(model.predict_proba(X_s)[0][1])
            results.append({
                "name": z.get("name"),
                "lat":  z.get("latitude"),
                "lng":  z.get("longitude"),
                "flood_probability": round(prob, 3),
                "risk_level": "HIGH" if prob > 0.65 else "MEDIUM" if prob > 0.35 else "LOW"
            })
        except Exception as e:
            results.append({"name": z.get("name"), "error": str(e)})

    return jsonify(results)

if __name__ == "__main__":
    app.run(port=5001)