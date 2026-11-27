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

from features import FEATURES, prepare, rule_label

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "zone_history.csv.gz")

df = prepare(pd.read_csv(DATA))
df["flood"] = rule_label(df)

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
os.chmod(tmp_path, 0o644)  # mkstemp creates files readable by the owner only
os.replace(tmp_path, os.path.join(HERE, "model.joblib"))
print("Model saved to ml/model.joblib")
