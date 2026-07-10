#!/usr/bin/env python3
"""
build_roi.py — Generate src/data/roi.json for the ROI & Attribution module.

Mirrors deck slides 19-20:
  Tier 1 — KPIs (table stakes)        : DSO, CEI, Auto-Match, Dispute Time, Deduction Auto
  Tier 2 — Business Outcomes (scorecard): working capital, leakage, bad debt, capacity
  Cumulative Value Trajectory          : $0 -> $2.1M -> $5.2M -> $8.4M+
  Attribution                          : every dollar traced to a real pattern (from patterns.json)

Deterministic (seeded) so the demo is identical each build.
Re-run:  python scripts/build_roi.py
"""
import json, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "roi.json")
PATTERNS = os.path.join(ROOT, "src", "data", "patterns.json")
rng = random.Random(840)  # tied to the $8.4M headline

YEAR1_TOTAL = 8_400_000

# Tier 1 — KPIs (deck slide 19). better: "down" = lower is better.
KPIS = [
    {"name": "DSO", "unit": "days", "before": 45, "after": 35, "better": "down", "note": "Days Sales Outstanding"},
    {"name": "CEI", "unit": "%", "before": 72, "after": 90, "better": "up", "note": "Collection Effectiveness Index"},
    {"name": "Auto-Match", "unit": "%", "before": 35, "after": 85, "better": "up", "note": "Cash auto-applied"},
    {"name": "Dispute Cycle", "unit": "days", "before": 25, "after": 12, "better": "down", "note": "Time to resolve"},
    {"name": "Deduction Auto", "unit": "%", "before": 0, "after": 40, "better": "up", "note": "Auto-dispositioned", "isNew": True},
]

# Tier 2 — Business Outcomes (deck slide 19). Illustrative Year-1 figures.
OUTCOMES = [
    {"icon": "$", "label": "Working Capital Released", "value": 4_200_000, "unit": "$",
     "desc": "DSO compression freeing cash — measured, attributed, auditable."},
    {"icon": "⊘", "label": "Revenue Leakage Prevented", "value": 2_100_000, "unit": "$",
     "desc": "Deductions caught, disputes won, unearned discounts reversed."},
    {"icon": "↓", "label": "Bad Debt Reduction", "value": 2_100_000, "unit": "$",
     "desc": "Credit-risk patterns detected before write-off."},
    {"icon": "→", "label": "Expert Capacity Freed", "value": 9_600, "unit": "fte",
     "desc": "Analyst FTE-hours redirected from triage to strategic engagement."},
]

# Theme-level KPI rollup — how per-process KPIs compose into a compound (cross-
# function) KPI. Illustrative, at ~$1B revenue. Mirrors taxonomy.themes ids.
THEMES = [
    {
        "id": "working-capital",
        "compoundKPI": {"name": "Cash Conversion Cycle", "formula": "DSO + DIO - DPO",
                        "current": 58, "target": 38, "unit": "days"},
        "contributors": [
            {"kpi": "DSO", "process": "O2C Collections", "current": 45, "target": 35, "weight": 0.45,
             "patterns": ["Creeping Payment Terms", "29th-Day Tactic", "Chronic Promise Breaker"]},
            {"kpi": "DPO", "process": "P2P Payments", "current": 32, "target": 42, "weight": 0.35,
             "patterns": ["Payment Term Erosion", "Early Pay Discount Trap"]},
            {"kpi": "DIO", "process": "Inventory", "current": 45, "target": 35, "weight": 0.20,
             "patterns": ["Supplier Concentration Risk"]},
        ],
        "impact": "$27M freed working capital at $1B revenue",
    },
]

# Cumulative trajectory (deck slide 20).
TRAJECTORY = [
    {"period": "M1-3", "label": "Foundation", "cumulative": 0},
    {"period": "M4-6", "label": "First recoveries", "cumulative": 2_100_000},
    {"period": "M7-9", "label": "Scaling patterns", "cumulative": 5_200_000},
    {"period": "M10-12", "label": "Compound gains", "cumulative": 8_400_000},
]

WEIGHT = {"Critical": 5.0, "High": 3.0, "Medium": 1.6, "Low": 0.8}


def main():
    patterns = json.load(open(PATTERNS, encoding="utf-8"))["patterns"]

    # weight each pattern, take the top contributors, allocate ~80% of the total
    scored = []
    for p in patterns:
        w = WEIGHT.get(p["priority"], 1.0) * (0.7 + rng.random() * 0.6)
        scored.append((w, p))
    scored.sort(key=lambda x: -x[0])
    top = scored[:10]

    top_pool = round(YEAR1_TOTAL * 0.82)
    wsum = sum(w for w, _ in top)
    attribution = []
    allocated = 0
    for w, p in top:
        rec = round(top_pool * w / wsum, -3)
        allocated += rec
        # customers: bigger recoveries span more accounts, with variation
        cust = max(3, int(rec / rng.randint(55_000, 110_000)))
        attribution.append({
            "patternId": p["id"],
            "name": p["name"],
            "category": p["category"],
            "featureSlug": p["featureSlug"],
            "priority": p["priority"],
            "recovery": rec,
            "customers": cust,
        })
    attribution.sort(key=lambda a: -a["recovery"])
    # remainder bucketed as the long tail of remaining patterns
    remainder = YEAR1_TOTAL - allocated
    other_count = len(patterns) - len(top)
    attribution.append({
        "patternId": None, "name": f"{other_count} other patterns", "category": "Long tail",
        "featureSlug": None, "priority": None, "recovery": remainder,
        "customers": rng.randint(40, 70), "isOther": True,
    })

    out = {
        "meta": {
            "title": "ProcessIQ — ROI & Attribution",
            "year1Total": YEAR1_TOTAL,
            "patternCount": len(patterns),
            "note": "Illustrative model. Figures are attributed to patterns, decisions, and actions — every dollar is traceable.",
        },
        "kpis": KPIS,
        "outcomes": OUTCOMES,
        "themes": THEMES,
        "trajectory": TRAJECTORY,
        "attribution": attribution,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"Wrote roi.json -> {os.path.relpath(OUT, ROOT)}")
    print(f"Year-1 total ${YEAR1_TOTAL:,} | top {len(top)} patterns + long tail")
    print("Top 3 contributors:")
    for a in attribution[:3]:
        print(f"  #{a['patternId']} {a['name']:<28} ${a['recovery']:>10,}  ({a['customers']} customers)")
    check = sum(a["recovery"] for a in attribution)
    print(f"Attribution sums to ${check:,} (target ${YEAR1_TOTAL:,})")


if __name__ == "__main__":
    main()
