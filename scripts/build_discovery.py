#!/usr/bin/env python3
"""
build_discovery.py — Generate src/data/discovery.json for the Discovery Engine module.

Mirrors deck slides 16-17:
  1. SIFT THE MATH  (Isolation Forests)  — statistical outliers in payment velocity
  2. SIFT THE TEXT  (Vector Embeddings)  — clustered semantic excuses
  3. SYNTHESIZE     (LLM Narrative)       — a named Candidate Pattern (#32)
  + the closed loop: Discover -> Approve -> Detect -> Act -> Attribute -> Learn

Produces the scatter points, the embedding bubbles, and the fully-specified candidate
so the UI can dramatise "the system finds the next pattern." Deterministic (seeded).
Re-run:  python scripts/build_discovery.py
"""
import json, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "discovery.json")
PATTERNS = os.path.join(ROOT, "src", "data", "patterns.json")
rng = random.Random(32)  # the candidate id


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def main():
    n_existing = len(json.load(open(PATTERNS, encoding="utf-8"))["patterns"])
    candidate_id = n_existing + 1

    # --- Stage 1: Isolation Forest scatter ---
    # x = historical avg days-to-pay, y = recent avg days-to-pay. On-diagonal = stable.
    # The anomaly: a Retail cluster that historically paid ~Day 12 now pays ~Day 30.
    normal = []
    for _ in range(46):
        x = rng.uniform(8, 34)
        y = clamp(x + rng.uniform(-3, 3), 5, 40)
        normal.append({"x": round(x, 1), "y": round(y, 1)})
    anomaly = []
    for _ in range(9):
        x = rng.uniform(10.5, 13.5)
        y = rng.uniform(27.5, 32.5)
        anomaly.append({"x": round(x, 1), "y": round(y, 1)})

    # --- Stage 2: vector-embedding clusters (2D projection) ---
    # sizes = how many customers voiced that excuse this fortnight; one is spiking.
    clusters = [
        {"label": "Pricing dispute", "x": 0.24, "y": 0.30, "size": 11, "anomaly": False},
        {"label": "Short shipment", "x": 0.38, "y": 0.66, "size": 8, "anomaly": False},
        {"label": "Portal / format error", "x": 0.70, "y": 0.24, "size": 6, "anomaly": False},
        {"label": "Missing PO / backup", "x": 0.62, "y": 0.74, "size": 7, "anomaly": False},
        {"label": "‘Treasury timing / cash management’", "x": 0.50, "y": 0.50, "size": 14, "anomaly": True},
    ]

    # --- Stage 3: the synthesised Candidate Pattern ---
    candidate = {
        "id": candidate_id,
        "proposedName": "Seasonal Treasury Squeeze",
        "vertical": "Retail / CPG",
        "proposedCategory": "Credit Risk & Insolvency Indicators",
        "proposedFeature": "Seasonal_Delay_Cluster",
        "statSignal": "Isolation Forest flagged 9 Retail accounts paying ~Day 30 against their Day-12 norm (anomaly score 0.91). No existing rule covers this — it is a statistical signal, not a known tactic.",
        "textSignal": "Vector clustering surfaced a spike of 14 ‘treasury timing / cash management’ excuses across the same vertical within one fortnight — a coordinated excuse, not isolated delays.",
        "narrative": "A cohort of Retail customers is synchronising payment delays to their own treasury cycles — stretching from Day 12 to Day 30 during the post-holiday liquidity crunch, then normalising. This is not dispute behaviour and not insolvency; it is seasonal float optimisation at our expense.",
        "estImpact": 4_200_000,
        "candidateConfidence": 0.88,
        "anomalyScore": 0.91,
        "affectedCustomers": 14,
        "proposedDAG": [
            {"tier": "primary", "condition": "IF Seasonal_Delay_Cluster detected AND first season",
             "actions": ["Offer_Dynamic_Discount (pull-forward incentive)", "Internal_Alert_to_AE"], "hitl": None},
            {"tier": "escalation", "condition": "ELSE IF recurs 2+ seasons OR Amount > $250K",
             "actions": ["Negotiate_Pre-Season_Payment_Plan", "Update_CRM_Task"], "hitl": None},
            {"tier": "escalation", "condition": "ELSE IF cohort-wide AND float impact > $1M",
             "actions": ["Tighten_Seasonal_Terms", "Trigger_Credit_Review"], "hitl": "Treasury VP approves seasonal terms change"},
        ],
    }

    # --- the closed loop (slide 17) ---
    loop = [
        {"step": 1, "name": "Discover", "desc": "Candidate surfaces with statistical signal, text cluster, and LLM narrative."},
        {"step": 2, "name": "Approve", "desc": "SME panel reviews: Is it real? Is it actionable? What's the counter-strategy?"},
        {"step": 3, "name": "Detect", "desc": "Pattern added to repository — versioned, effective-dated, scanning all customers."},
        {"step": 4, "name": "Act", "desc": "Actions assembled and queued per governance model (HITL → Policy → Autonomous)."},
        {"step": 5, "name": "Attribute", "desc": "Outcomes traced back — did the counter-strategy work? What was recovered?"},
        {"step": 6, "name": "Learn", "desc": "Calibrate confidence scores. Repository grows. The system compounds."},
    ]

    out = {
        "meta": {
            "title": "ProcessIQ — Continuous Discovery",
            "existingPatternCount": n_existing,
            "candidateId": candidate_id,
            "note": "The LLM explains the anomaly; it does not invent it. Candidates are proposals, not conclusions — an SME panel gates every promotion.",
        },
        "stage1": {"normal": normal, "anomaly": anomaly,
                   "xLabel": "Historical avg days-to-pay", "yLabel": "Recent avg days-to-pay"},
        "stage2": {"clusters": clusters},
        "candidate": candidate,
        "loop": loop,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"Wrote discovery.json -> {os.path.relpath(OUT, ROOT)}")
    print(f"Existing patterns: {n_existing} | candidate: #{candidate_id} '{candidate['proposedName']}'")
    print(f"Scatter: {len(normal)} normal + {len(anomaly)} anomaly | clusters: {len(clusters)} | est impact ${candidate['estImpact']:,}")


if __name__ == "__main__":
    main()
