import pandas as pd
import numpy as np

np.random.seed(42)
n = 1000

zones = [
    {"name": "Mathare",   "lat": -1.2611, "lon": 36.8500, "threshold": 15},
    {"name": "Kibera",    "lat": -1.3133, "lon": 36.7833, "threshold": 12},
    {"name": "Westlands", "lat": -1.2667, "lon": 36.8000, "threshold": 20},
    {"name": "CBD",       "lat": -1.2864, "lon": 36.8172, "threshold": 18},
    {"name": "Eastleigh", "lat": -1.2750, "lon": 36.8500, "threshold": 14},
    {"name": "Kasarani",  "lat": -1.2167, "lon": 36.9000, "threshold": 22},
]

# Use pandas date_range and sample with pandas, not numpy
dates = pd.date_range("2020-01-01", "2023-12-31", freq="h")
sampled_dates = dates[np.random.choice(len(dates), size=n, replace=False)]

rows = []
for date in sampled_dates:
    zone = zones[np.random.randint(len(zones))]
    month = date.month  # now a pandas Timestamp — .month works fine
    is_rainy = month in [3, 4, 5, 10, 11, 12]
    rainfall = np.random.exponential(18 if is_rainy else 4)

    rows.append({
        "date":              date.strftime("%Y-%m-%d %H:%M:%S"),
        "latitude":          round(zone["lat"] + np.random.normal(0, 0.005), 6),
        "longitude":         round(zone["lon"] + np.random.normal(0, 0.005), 6),
        "rainfall_mm":       round(rainfall, 2),
        "rain_threshold_mm": zone["threshold"],
        "humidity":          round(np.random.uniform(55, 98) if is_rainy else np.random.uniform(30, 70), 1),
        "wind_speed":        round(np.random.exponential(5), 2),
    })

df = pd.DataFrame(rows)
df.to_csv("flood_data.csv", index=False)

flood_rate = (df["rainfall_mm"] >= df["rain_threshold_mm"]).mean()
print(f"Generated {n} rows across {len(zones)} Nairobi zones")
print(f"Flood rate: {flood_rate:.1%}")
print(f"Columns: {list(df.columns)}")