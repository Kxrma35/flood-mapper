# threshold_tradeoff.py
# Compares candidate flood rules against the recorded floods (backend/data/flood-records.json):
# how many each rule catches, and how often it would warn somewhere in Nairobi. The model learns
# whichever rule it is trained on, so this shows what a retrained model would do.
#
# Warnings on days with no recorded flood are not all false alarms: the records are incomplete.
#
#   python ml/threshold_tradeoff.py   -> ml/threshold_tradeoff.csv and the best rules printed
import itertools
import json
import os

import pandas as pd

from check_records import RECORDS_PATH, flood_windows, history
from features import RULE, prepare

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(HERE, "threshold_tradeoff.csv")
COLUMNS = {"1h": "precipitation_mm", "3h": "rain_3h_mm", "24h": "rain_24h_mm", "72h": "rain_72h_mm"}
CURRENT = {window: RULE[column] for window, column in COLUMNS.items()}  # the rule training uses now
CANDIDATES = {"1h": [10, 8], "3h": [25, 20], "24h": [50, 40, 30, 25, 20], "72h": [60, 55, 50, 45, 40, 30]}
RECENT_FROM = 2018  # weather data before about 2017 is much smoother


def evaluate(daily, windows, rule):
    """Days the rule fires anywhere in Nairobi, and which flood windows it catches."""
    fires = pd.concat([daily[COLUMNS[k]] > v for k, v in rule.items()], axis=1).any(axis=1)
    caught = [bool(fires.loc[w["start"]:w["end"]].any()) for w in windows]
    recent_days = fires[fires.index.year >= RECENT_FROM]
    # A spell is a run of consecutive warning days: how often a warning starts.
    starts = recent_days & ~recent_days.shift(1, fill_value=False)
    return {
        **{f"rain_{k}_over": v for k, v in rule.items()},
        "recent_caught": sum(c for c, w in zip(caught, windows) if w["end"].year >= RECENT_FROM),
        "older_caught": sum(c for c, w in zip(caught, windows) if w["end"].year < RECENT_FROM),
        "warning_days_pct": round(100 * recent_days.mean(), 1),
        "warning_days_per_year": round(recent_days.groupby(recent_days.index.year).sum().mean(), 1),
        "warning_spells_per_year": round(starts.groupby(starts.index.year).sum().mean(), 1),
        "caught": "; ".join(f"{w['start'].date()}" for c, w in zip(caught, windows) if c),
    }


def main():
    with open(RECORDS_PATH) as f:
        windows = flood_windows(json.load(f))
    first, last = min(w["start"] for w in windows), max(w["end"] for w in windows)
    df = prepare(history(first.year, last.year))
    # City-wide: each window's highest total in any of Nairobi's grid cells on each day.
    daily = df.groupby(df["datetime"].dt.normalize())[list(COLUMNS.values())].max()

    rules = [dict(zip(CANDIDATES, values)) for values in itertools.product(*CANDIDATES.values())]
    result = pd.DataFrame([evaluate(daily, windows, rule) for rule in rules])
    result["current"] = [rule == CURRENT for rule in rules]
    result.to_csv(OUTPUT_PATH, index=False)

    recent_total = sum(w["end"].year >= RECENT_FROM for w in windows)
    older_total = len(windows) - recent_total
    # Best trade-offs: for each number of recent floods caught, the rule with the fewest warning days.
    best = (result.sort_values(["recent_caught", "warning_days_pct", "older_caught"], ascending=[True, True, False])
                  .groupby("recent_caught").head(1))
    best = best[best["warning_days_pct"] == best["warning_days_pct"].cummax()]
    cols = ["rain_1h_over", "rain_3h_over", "rain_24h_over", "rain_72h_over", "recent_caught", "older_caught",
            "warning_days_pct", "warning_days_per_year", "warning_spells_per_year", "caught"]
    print(f"Recent floods: {recent_total} ({RECENT_FROM} on); older DesInventar floods: {older_total}.")
    print("Current rule:")
    print(result[result["current"]][cols].to_string(index=False))
    print("\nFewest warning days for each number of recent floods caught:")
    print(best[cols].to_string(index=False))
    print(f"\nSaved all {len(result)} rules to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
