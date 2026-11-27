# predict_server.py
import os
import warnings

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np

app = Flask(__name__)
CORS(app)

HERE = os.path.dirname(os.path.abspath(__file__))

# Rows are built in FEATURES order, so the scaler's column-name check adds nothing.
warnings.filterwarnings("ignore", message="X does not have valid feature names")

try:
    model    = joblib.load(os.path.join(HERE, "flood_model.pkl"))
    scaler   = joblib.load(os.path.join(HERE, "scaler.pkl"))
    FEATURES = joblib.load(os.path.join(HERE, "features.pkl"))
    MODEL_READY = True
except FileNotFoundError:
    MODEL_READY = False
    print("WARNING: No model files found. Run train_model.py first.")


@app.route("/predict", methods=["POST"])
def predict():
    """
    Expects {"zones": [{"name", "latitude", "longitude", <every name in features.pkl>}]}
    """
    if not MODEL_READY:
        return jsonify({"error": "Model not loaded. Run ml/train_model.py first."}), 503

    zones = (request.get_json(silent=True) or {}).get("zones", [])
    results = []

    for z in zones:
        missing = [f for f in FEATURES if f not in z]
        if missing:
            results.append({"name": z.get("name"), "error": f"missing features: {', '.join(missing)}"})
            continue

        try:
            X = np.array([[z[f] for f in FEATURES]], dtype=float)
        except (TypeError, ValueError):
            X = None
        if X is None or not np.isfinite(X).all():
            results.append({"name": z.get("name"), "error": "features must all be numbers"})
            continue

        prob = float(model.predict_proba(scaler.transform(X))[0][1])
        results.append({
            "name": z.get("name"),
            "lat":  z.get("latitude"),
            "lng":  z.get("longitude"),
            "flood_probability": round(prob, 3),
            "risk_level": "HIGH" if prob > 0.65 else "MEDIUM" if prob > 0.35 else "LOW"
        })

    return jsonify(results)

if __name__ == "__main__":
    app.run(port=5001)
