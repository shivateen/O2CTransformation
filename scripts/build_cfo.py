#!/usr/bin/env python3
"""
build_cfo.py — Generate src/data/cfo.json: the CFO consumption layer data.

The CFO layer is the inverse of the Studio: outcomes first, patterns underneath.
Synthetic, deterministic data for the 4 sub-views (Command Center, Intelligence,
Scenarios, Trajectory) plus a 13-week cash forecast.

This project has no separate themes.json / compounds.json — themes (and their
cross-process compound patterns) live inside taxonomy.json, and the CFO UI reads
those at runtime. So cfo.json is self-contained for the CFO-specific data and only
references real pattern ids (validated here against patterns.json) and the five
real theme ids (working-capital, revenue-leakage, close-acceleration,
controls-integrity, cash-visibility).

  python scripts/build_cfo.py
"""
import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATTERNS = os.path.join(ROOT, "src", "data", "patterns.json")
OUT = os.path.join(ROOT, "src", "data", "cfo.json")


def build():
    return {
        "meta": {
            "title": "ProcessIQ — CFO Consumption Layer",
            "asOfDate": "2025-06-27",
            "asOfWeek": "W26",
        },

        # ---- embedded compound patterns (self-contained; ids referenced below) ----
        "compounds": {
            "CP-001": {"name": "Bust-Out Fraud Setup",
                       "description": "Dispute-timing gaming, duplicate refund requests and credit deterioration firing together — the classic bust-out precursor.",
                       "patternIds": [1, 22, 25]},
            "CP-002": {"name": "Bilateral Cash Squeeze",
                       "description": "Customer stretches payment while a supplier demands early payment — working capital squeezed from both sides at once.",
                       "patternIds": [27]},
            "CP-004": {"name": "Override Cascade",
                       "description": "A credit-hold override on a customer already gaming the dispute process — two control failures compounding into SOX + credit-risk exposure.",
                       "patternIds": [29, 1, 21]},
            "CP-007": {"name": "Payment Behaviour Drift",
                       "description": "Creeping payment terms plus chronic broken promises signal a segment whose actual pay date drifts every quarter — invisible to term-based forecasts.",
                       "patternIds": [27, 31, 17]},
            "CP-008": {"name": "Coordinated Payment Avoidance",
                       "description": "Legal-entity shell game, portal sabotage and partial breadcrumbing all active for one customer — deliberate, orchestrated avoidance.",
                       "patternIds": [13, 14, 20]},
        },

        "commandCenter": {
            "agentAutonomy": {
                "current": 0.73, "target": 0.90,
                "trend": [0.45, 0.52, 0.58, 0.63, 0.68, 0.73],
                "trendLabels": ["W21", "W22", "W23", "W24", "W25", "W26"],
            },
            "decisionQueue": [
                {"id": "DQ-001", "type": "credit-override",
                 "title": "Credit limit override — Acme Industrial",
                 "summary": "Sales requested a $2.1M limit increase. Agent recommends approval with conditions: 90-day review and enhanced monitoring.",
                 "agentRecommendation": "approve-conditional", "confidence": 0.87,
                 "exposure": 2100000, "urgency": "high", "triggeringPatterns": [19, 20],
                 "themeId": "controls-integrity", "submittedAgo": "2h",
                 "actions": ["approve", "override", "defer"]},
                {"id": "DQ-002", "type": "write-off",
                 "title": "Write-off approval — $340K aged balance",
                 "summary": "Meridian Corp balance aged 180+ days, all collection attempts exhausted. Agent recommends write-off with bad-debt provision. Patterns #20 (breadcrumbing) and #22 (bureau downgrade) both active.",
                 "agentRecommendation": "approve", "confidence": 0.92,
                 "exposure": 340000, "urgency": "medium", "triggeringPatterns": [20, 22],
                 "themeId": "controls-integrity", "submittedAgo": "1d",
                 "actions": ["approve", "override", "defer"]},
                {"id": "DQ-003", "type": "policy-change",
                 "title": "Auto-resolve threshold — disputes under $5K",
                 "summary": "Agent proposes auto-resolving disputes under $5,000 where root cause is a pricing error and the customer is in good standing. Projected: 40% smaller dispute queue, $180K annual savings, 0.3% revenue exposure.",
                 "agentRecommendation": "approve", "confidence": 0.78,
                 "exposure": 180000, "urgency": "low", "triggeringPatterns": [3, 4],
                 "themeId": "revenue-leakage", "submittedAgo": "3d",
                 "actions": ["approve", "reject", "modify-threshold"]},
                {"id": "DQ-004", "type": "compound-alert",
                 "title": "Compound pattern alert — Bust-Out Fraud Setup",
                 "summary": "GlobalTech showing simultaneous dispute-timing gaming (#1), duplicate refund requests (#25) and credit deterioration (#22). Classic bust-out precursor. Agent has placed a credit hold pending review.",
                 "agentRecommendation": "escalate", "confidence": 0.94,
                 "exposure": 2500000, "urgency": "critical", "triggeringPatterns": [1, 22, 25],
                 "compoundId": "CP-001", "themeId": "controls-integrity", "submittedAgo": "45m",
                 "actions": ["confirm-hold", "release", "investigate"]},
                {"id": "DQ-005", "type": "new-pattern",
                 "title": "New pattern discovered — Seasonal credit-line stacking",
                 "summary": "Discovery Engine identified a recurring pattern: 3 customers request temporary Q4 credit increases, draw down fully, then dispute 15% of invoices in Q1. Not in the current library. Agent recommends adding it as pattern #32.",
                 "agentRecommendation": "add-to-library", "confidence": 0.71,
                 "exposure": 890000, "urgency": "low", "triggeringPatterns": [],
                 "themeId": "controls-integrity", "submittedAgo": "5d",
                 "actions": ["approve", "reject", "investigate"]},
            ],
        },

        "intelligence": {
            "insights": [
                {"id": "INS-001", "severity": "warn",
                 "headline": "DSO increased 3 days this week",
                 "narrative": "Two strategic accounts (Acme Industrial, GlobalTech) delayed payments past 60 days — together $4.2M in open AR. Pattern #29 (Strategic Shielding) detected for Acme; Pattern #20 (Partial Breadcrumbing) for GlobalTech. Collections agents have escalated both.",
                 "themeId": "working-capital", "patternIds": [29, 20],
                 "impact": {"metric": "DSO", "delta": "+3 days", "direction": "worse"}, "weekOf": "W26"},
                {"id": "INS-002", "severity": "good",
                 "headline": "Cash auto-match rate crossed 80%",
                 "narrative": "Auto-match reached 82% this week, up from 35% at go-live. The matching layer now handles 3,200 of 3,900 weekly payment lines untouched. Remaining exceptions concentrate in 4 customers who change remittance formats monthly.",
                 "themeId": "cash-visibility", "patternIds": [24, 25, 26],
                 "impact": {"metric": "Auto-Match", "delta": "+47% since go-live", "direction": "better"}, "weekOf": "W26"},
                {"id": "INS-003", "severity": "alert",
                 "headline": "New compound pattern — coordinated payment avoidance",
                 "narrative": "Compound CP-008 fired for the first time: legal-entity shell game (#13), portal sabotage (#14) and partial breadcrumbing (#20) all active for NorthStar Holdings. Total exposure $850K. Agent has flagged it for CFO review.",
                 "themeId": "controls-integrity", "patternIds": [13, 14, 20], "compoundId": "CP-008",
                 "impact": {"metric": "Bad Debt", "delta": "$850K exposure", "direction": "worse"}, "weekOf": "W26"},
                {"id": "INS-004", "severity": "good",
                 "headline": "Deduction recovery rate up 12% this month",
                 "narrative": "Invalid deduction recovery improved to 52% from 40%. Driver: the Trade Promo Matching agent now auto-validates 65% of trade deductions against TPM records. Non-trade deductions — mostly pricing errors — still need manual investigation.",
                 "themeId": "revenue-leakage", "patternIds": [3, 4, 8],
                 "impact": {"metric": "Deduction Recovery", "delta": "+12%", "direction": "better"}, "weekOf": "W26"},
                {"id": "INS-005", "severity": "info",
                 "headline": "Decision queue shrinking — 40% fewer escalations",
                 "narrative": "CFO-level escalations dropped from 23/week to 14/week over the last month as confidence thresholds self-adjust. Credit-override approvals are now 89% aligned with agent recommendations.",
                 "themeId": "close-acceleration", "patternIds": [],
                 "impact": {"metric": "Autonomy", "delta": "-40% escalations", "direction": "better"}, "weekOf": "W26"},
                {"id": "INS-006", "severity": "warn",
                 "headline": "Dispute volume spike — 3 customers filing at once",
                 "narrative": "Pricing disputes from customers #204, #318 and #412 rose 4x this week, all referencing the same Q1 promotional schedule that expired 90 days ago. Pattern #7 (Stale Promo Exploitation) detected. Agent recommends updating the pricing master and issuing clarification notices.",
                 "themeId": "revenue-leakage", "patternIds": [7, 8],
                 "impact": {"metric": "Dispute Cycle", "delta": "+8 days avg", "direction": "worse"}, "weekOf": "W26"},
            ],
            "compoundRadar": [
                {"compoundId": "CP-001", "activeCustomers": 1, "totalExposure": 2500000, "status": "escalated"},
                {"compoundId": "CP-002", "activeCustomers": 3, "totalExposure": 1400000, "status": "monitoring"},
                {"compoundId": "CP-004", "activeCustomers": 2, "totalExposure": 1100000, "status": "monitoring"},
                {"compoundId": "CP-007", "activeCustomers": 1, "totalExposure": 1600000, "status": "escalated"},
                {"compoundId": "CP-008", "activeCustomers": 1, "totalExposure": 850000, "status": "new"},
            ],
        },

        "scenarios": {"available": [
            {"id": "SCN-001", "name": "Tighten credit limits 20%",
             "description": "Reduce all credit limits by 20% across the portfolio.", "lever": "credit-limit",
             "parameters": [{"name": "reduction", "type": "slider", "min": 5, "max": 40, "default": 20, "unit": "%", "step": 1}],
             "impacts": [
                 {"metric": "DSO", "baseCase": 42, "projected": 38, "unit": "days", "direction": "better"},
                 {"metric": "Bad Debt", "baseCase": 2100000, "projected": 1400000, "unit": "$", "direction": "better"},
                 {"metric": "Revenue at Risk", "baseCase": 0, "projected": 3200000, "unit": "$", "direction": "worse"}],
             "tradeoff": "Lower bad debt and DSO, but $3.2M revenue at risk from customers who may not accept tighter terms."},
            {"id": "SCN-002", "name": "Auto-resolve disputes under $5K",
             "description": "Automatically accept dispute claims below threshold when root cause is internal (pricing error, late delivery).", "lever": "dispute-threshold",
             "parameters": [{"name": "threshold", "type": "slider", "min": 1000, "max": 25000, "default": 5000, "unit": "$", "step": 1000}],
             "impacts": [
                 {"metric": "Dispute Cycle", "baseCase": 25, "projected": 12, "unit": "days", "direction": "better"},
                 {"metric": "Dispute Queue", "baseCase": 340, "projected": 204, "unit": "cases", "direction": "better"},
                 {"metric": "Revenue Leakage", "baseCase": 0, "projected": 180000, "unit": "$", "direction": "worse"}],
             "tradeoff": "40% smaller dispute queue and faster resolution, but $180K annual exposure from auto-accepted claims."},
            {"id": "SCN-003", "name": "Move top-10 customers to prepay/COD",
             "description": "Require prepayment or COD for the 10 highest-risk customers currently on net terms.", "lever": "payment-terms",
             "parameters": [{"name": "customerCount", "type": "slider", "min": 5, "max": 20, "default": 10, "unit": "customers", "step": 1}],
             "impacts": [
                 {"metric": "DSO", "baseCase": 42, "projected": 36, "unit": "days", "direction": "better"},
                 {"metric": "Bad Debt", "baseCase": 2100000, "projected": 1100000, "unit": "$", "direction": "better"},
                 {"metric": "Customer Churn", "baseCase": 0, "projected": 3, "unit": "customers", "direction": "worse"}],
             "tradeoff": "Significant DSO and bad-debt improvement, but risk losing 3 customers ($1.8M combined revenue)."},
            {"id": "SCN-004", "name": "Increase agent autonomy threshold",
             "description": "Raise the confidence threshold below which agents must escalate to human review.", "lever": "autonomy-threshold",
             "parameters": [{"name": "confidenceThreshold", "type": "slider", "min": 60, "max": 95, "default": 80, "unit": "%", "step": 1}],
             "impacts": [
                 {"metric": "Decision Queue", "baseCase": 14, "projected": 8, "unit": "/week", "direction": "better"},
                 {"metric": "Analyst Capacity", "baseCase": 9600, "projected": 11200, "unit": "hrs freed", "direction": "better"},
                 {"metric": "Error Rate", "baseCase": 2.1, "projected": 3.8, "unit": "%", "direction": "worse"}],
             "tradeoff": "43% fewer escalations and more analyst capacity, but agent-decision error rate rises from 2.1% to 3.8%."},
        ]},

        "trajectory": {
            "phases": [
                {"id": 1, "name": "Trust Foundation", "period": "M1–M3", "status": "complete", "pctComplete": 100},
                {"id": 2, "name": "Collections + Cash App", "period": "M4–M6", "status": "complete", "pctComplete": 100},
                {"id": 3, "name": "Disputes + Deductions", "period": "M7–M9", "status": "active", "pctComplete": 65},
                {"id": 4, "name": "Autonomous AR", "period": "M10–M12", "status": "upcoming", "pctComplete": 0},
            ],
            "agentMaturity": {
                "labels": ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"],
                "manual": [85, 72, 60, 45, 35, 28, 22, 18, 15],
                "hitl": [12, 22, 30, 35, 38, 37, 35, 32, 28],
                "autonomous": [3, 6, 10, 20, 27, 35, 43, 50, 57],
            },
            "kpiTrajectory": [
                {"metric": "DSO", "unit": "days", "target": 35,
                 "actual": [45, 44, 43, 42, 41, 40, 39, 38, 42],
                 "forecast": [42, 40, 38, 37, 36, 35],
                 "confidenceBand": {"upper": [44, 43, 42, 41, 40, 39], "lower": [40, 37, 34, 33, 32, 31]}},
                {"metric": "CEI", "unit": "%", "target": 90,
                 "actual": [72, 74, 76, 78, 80, 82, 83, 84, 85],
                 "forecast": [85, 86, 87, 88, 89, 90],
                 "confidenceBand": {"upper": [87, 89, 91, 92, 93, 94], "lower": [83, 83, 83, 84, 85, 86]}},
                {"metric": "Auto-Match", "unit": "%", "target": 85,
                 "actual": [35, 42, 50, 58, 65, 70, 75, 78, 82],
                 "forecast": [82, 83, 84, 84, 85, 85],
                 "confidenceBand": {"upper": [84, 86, 88, 89, 90, 90], "lower": [80, 80, 80, 79, 80, 80]}},
            ],
            "cumulativeROI": {
                "labels": ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"],
                "investment": [500000, 900000, 1200000, 1400000, 1500000, 1600000, 1650000, 1700000, 1750000, 1800000, 1850000, 1900000],
                "returns": [0, 0, 200000, 700000, 1500000, 2600000, 3800000, 5100000, 6500000, 7500000, 8200000, 8400000],
                "breakeven": "M5",
            },
            "boardScorecard": [
                {"metric": "Working Capital Released", "target": 4200000, "actual": 3100000, "status": "on-track"},
                {"metric": "Revenue Leakage Prevented", "target": 2100000, "actual": 1800000, "status": "on-track"},
                {"metric": "Bad Debt Reduction", "target": 2100000, "actual": 1400000, "status": "at-risk"},
                {"metric": "Agent Autonomy", "target": 0.90, "actual": 0.73, "status": "on-track"},
                {"metric": "Decision Queue Reduction", "target": 5, "actual": 14, "status": "on-track"},
            ],
        },

        "cashForecast": {
            "weeks": ["W27", "W28", "W29", "W30", "W31", "W32", "W33", "W34", "W35", "W36", "W37", "W38", "W39"],
            "inflows": [2800000, 3100000, 2400000, 3500000, 2900000, 2700000, 3200000, 2600000, 3800000, 3400000, 2500000, 3100000, 2900000],
            "outflows": [2200000, 2400000, 2100000, 2800000, 2300000, 2500000, 2600000, 2200000, 2900000, 2700000, 2300000, 2500000, 2400000],
            "netPosition": [600000, 700000, 300000, 700000, 600000, 200000, 600000, 400000, 900000, 700000, 200000, 600000, 500000],
            "confidenceBand": {
                "upper": [800000, 1000000, 600000, 1100000, 1000000, 600000, 1100000, 900000, 1400000, 1200000, 700000, 1100000, 1000000],
                "lower": [400000, 400000, 0, 300000, 200000, -200000, 100000, -100000, 400000, 200000, -300000, 100000, 0],
            },
        },
    }


def main():
    data = build()
    # validate referenced pattern ids exist (warn only — non-fatal)
    try:
        ids = {p["id"] for p in json.load(open(PATTERNS, encoding="utf-8"))["patterns"]}
        refs = set()
        for dq in data["commandCenter"]["decisionQueue"]:
            refs |= set(dq.get("triggeringPatterns", []))
        for ins in data["intelligence"]["insights"]:
            refs |= set(ins.get("patternIds", []))
        for cp in data["compounds"].values():
            refs |= set(cp.get("patternIds", []))
        missing = sorted(r for r in refs if r not in ids)
        if missing:
            print("  WARNING: cfo.json references pattern ids not in patterns.json:", missing)
    except Exception as e:
        print("  (pattern validation skipped:", e, ")")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Wrote %s (%d decisions, %d insights, %d scenarios)" % (
        os.path.relpath(OUT, ROOT), len(data["commandCenter"]["decisionQueue"]),
        len(data["intelligence"]["insights"]), len(data["scenarios"]["available"])))


if __name__ == "__main__":
    main()
