#!/usr/bin/env python3
"""
build_portfolio.py — Generate src/data/portfolio.json

A synthetic but internally-consistent AR book for the ProcessIQ Cognitive Cockpit demo.
Every open invoice carries:
  - the SAP/Oracle-style document keys (BELNR, KUNNR ...)
  - an event series (Layer 2 timeline: Posted -> Call -> P2P -> Dispute ...)
  - raw 'signals' the cognitive engine reads to compute Layer-3 features

Most invoices are designed to TRIGGER a specific behavioural pattern (groundTruth),
a few are clean/paying-normally so the engine's confidence scoring is believable.

Deterministic (fixed seed) so the demo is identical on every build.
Re-run:  python scripts/build_portfolio.py
"""
import json, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "portfolio.json")
rng = random.Random(20260629)  # demo date as seed

# "Today" anchors all DPD math. Matches the deck's 29-JUN-2026.
TODAY = "2026-06-29"

CUSTOMERS = [
    ("C-100487", "Halberd Industrial Group", "Manufacturing", "Net-30", 2_400_000, 750000),
    ("C-100231", "Meridian Logistics LLC", "Transport", "Net-45", 1_100_000, 400000),
    ("C-100922", "Crestfall Retail Holdings", "Retail", "Net-30", 3_200_000, 1500000),
    ("C-100654", "Vanta Pharma Distribution", "Pharma", "Net-60", 5_600_000, 2000000),
    ("C-100311", "Northwind Foods Co", "CPG", "Net-30", 890_000, 300000),
    ("C-100778", "Apex Construction Partners", "Construction", "Net-45", 1_750_000, 600000),
    ("C-100545", "Solano Energy Services", "Energy", "Net-30", 4_100_000, 1200000),
    ("C-100899", "Brightline Medical Supply", "Healthcare", "Net-60", 2_900_000, 900000),
    ("C-100412", "Quanta Semiconductors", "Technology", "Net-30", 6_200_000, 2500000),
    ("C-100367", "Ridgeway Automotive", "Automotive", "Net-45", 1_300_000, 450000),
    ("C-100720", "Lumen Office Products", "B2B Supply", "Net-30", 540_000, 200000),
    ("C-100588", "Coastal Beverage Dist", "Beverage", "Net-30", 980_000, 350000),
]

# Each spec produces one invoice that triggers (or doesn't) a pattern.
# featureSlug must match a detector in the engine. signals feed those detectors.
# fields: (custIdx, amount, dpd, featureSlug, signals, eventSeries)
def ev(*pairs):
    return [{"day": d, "label": l} for d, l in pairs]

SPECS = [
    # --- Dispute & Deduction Manipulation ---
    (0, 340_000, 30, "dispute-proximity",
     {"disputeProximity": 1, "disputeReasonSpecificity": 0.12, "disputeCountYTD": 3,
      "lateDisputeRate": 0.73, "resolutionRatio": 0.98, "strategicAccount": True, "dpd": 30},
     ev((0, "Invoice Posted"), (15, "First Call"), (22, "Promise to Pay"),
        (28, "Promise Broken"), (29, "Dispute Filed — 'Missing POD'"))),

    (2, 95_000, 12, "volume-vs-threshold",
     {"splitCount": 10, "splitAmountEach": 9500, "totalSplit": 95000, "within24h": True, "instance": 2, "dpd": 12},
     ev((0, "Invoice Posted"), (10, "10 disputes filed in 4 hours"), (12, "All under $10K threshold"))),

    (4, 42_000, 5, "micro-deduction-density",
     {"deductionCount": 63, "deductionTotal": 2520, "monthEndFriday": True, "avgDeduction": 40, "dpd": 5},
     ev((0, "Batch Payment Received"), (0, "63 micro-deductions ($40 avg)"), (0, "4PM month-end Friday"))),

    (9, 28_000, 18, "doc-request-frequency",
     {"docRequestCount": 4, "loopDays": 34, "reasonsCycled": ["POD", "PO", "Contract", "Signature"], "dpd": 18},
     ev((0, "Invoice Posted"), (8, "Requested POD"), (16, "Requested PO"),
        (24, "Requested Contract"), (32, "Requested Signature"))),

    # --- Intentional Stalling & Delay Tactics ---
    (5, 78_000, 41, "contact-shift-frequency",
     {"contactShiftCount": 4, "amount": 78000, "strategicAccount": False, "dpd": 41},
     ev((0, "Invoice Posted"), (12, "AP: 'ask Procurement'"), (20, "Procurement: 'ask Plant Mgr'"),
        (30, "Plant Mgr: 'ask AP'"), (38, "Loop repeats"))),

    (1, 210_000, 47, "nlp-keyword-flag",
     {"migrationKeywords": True, "stallDuration": 33, "p2pDate": None, "dpd": 47},
     ev((0, "Invoice Posted"), (20, "Note: 'ERP migration go-live'"), (33, "Note: 'cannot process 3 wks'"))),

    (7, 64_000, 36, "po-mismatch-flag",
     {"poNull": True, "disputeReasonNoPO": True, "emailPOEvidence": True, "dpd": 36},
     ev((0, "Order placed — no PO"), (30, "Invoice rejected: 'lacks PO'"), (36, "Email PO located in archive"))),

    # --- Credit Risk & Insolvency Indicators (Critical) ---
    (8, 99_000, 8, "credit-limit-velocity",
     {"velocityRatio": 0.92, "ordersLast7d": 5, "creditLimit": 100000, "refusingCalls": True,
      "historicalMonthlyAvg": 10000, "dpd": 8},
     ev((0, "5 orders in 7 days"), (3, "Total $99K vs $100K limit"), (6, "Customer dodging calls"))),

    (3, 200_000, 22, "min-viable-payment",
     {"paymentRatio": 0.025, "repeatCount": 3, "dnbDeclining": True, "openBalance": 200000, "dpd": 22},
     ev((0, "Owes $200K"), (10, "Wired exactly $5K"), (22, "3rd breadcrumb in 90 days"))),

    (11, 9_900, 64, "threshold-proximity",
     {"openAR": 9800, "reviewLimit": 10000, "skimmingDays": 130, "dpd": 64},
     ev((0, "Balance hits $9,800"), (30, "Tiny payment"), (60, "Orders more — stays under $10K"))),

    # --- Cash Application & Remittance Friction ---
    (6, 1_000_000, 6, "remittance-lag",
     {"remittanceLag": 7, "amount": 1000000, "unappliedStatus": True, "dpd": 6},
     ev((0, "Wire received $1M"), (0, "No remittance PDF"), (6, "40 invoices unidentified"))),

    # --- Relationship & Contractual Abuse ---
    (10, 14_000, 9, "discount-date-delta",
     {"unearnedDiscount": 280, "paidDay": 45, "discountDay": 10, "amount": 14000, "dpd": 9},
     ev((0, "Invoice Posted"), (45, "Paid Day 45"), (45, "Took 2% Day-10 discount"))),

    (3, 480_000, 38, "broken-p2p-ratio",
     {"brokenP2PRatio": 0.80, "p2pCount": 5, "brokenCount": 4, "dpd": 38},
     ev((0, "Invoice Posted"), (10, "P2P logged"), (18, "P2P broken (#4)"), (30, "New P2P logged"))),

    (2, 620_000, 26, "velocity-of-delay",
     {"velocityDelta": 11, "quarters": 3, "trend": [30, 34, 41], "dpd": 26},
     ev((0, "Q1 avg 30d"), (90, "Q2 avg 34d"), (180, "Q3 avg 41d"))),

    # --- Clean / normal-paying (engine should NOT fire) ---
    (0, 120_000, 4, None,
     {"dpd": 4, "disputeProximity": 0, "paymentRatio": 1.0},
     ev((0, "Invoice Posted"), (2, "Acknowledged"), (4, "Scheduled for payment"))),

    (4, 56_000, 0, None,
     {"dpd": 0, "paymentRatio": 1.0},
     ev((0, "Invoice Posted"), (0, "Auto-matched remittance"))),

    (8, 310_000, 11, None,
     {"dpd": 11, "disputeProximity": 0},
     ev((0, "Invoice Posted"), (5, "First Call — cooperative"), (11, "Promise to Pay Day 20"))),
]

CATEGORY_OF = {
    "dispute-proximity": "Dispute & Deduction Manipulation",
    "volume-vs-threshold": "Dispute & Deduction Manipulation",
    "micro-deduction-density": "Dispute & Deduction Manipulation",
    "doc-request-frequency": "Dispute & Deduction Manipulation",
    "contact-shift-frequency": "Intentional Stalling & Delay Tactics",
    "nlp-keyword-flag": "Intentional Stalling & Delay Tactics",
    "po-mismatch-flag": "Intentional Stalling & Delay Tactics",
    "credit-limit-velocity": "Credit Risk & Insolvency Indicators",
    "min-viable-payment": "Credit Risk & Insolvency Indicators",
    "threshold-proximity": "Credit Risk & Insolvency Indicators",
    "remittance-lag": "Cash Application & Remittance Friction",
    "discount-date-delta": "Relationship & Contractual Abuse",
    "broken-p2p-ratio": "Relationship & Contractual Abuse",
    "velocity-of-delay": "Relationship & Contractual Abuse",
}


def main():
    invoices = []
    n = 4500000
    for i, (ci, amount, dpd, slug, signals, events) in enumerate(SPECS):
        cust = CUSTOMERS[ci]
        n += rng.randint(11, 97)
        belnr = str(n)
        posted_offset = -(dpd + int(cust[3].split("-")[1]))  # days before today
        invoices.append({
            "invoiceId": f"#{belnr}",
            "belnr": belnr,
            "kunnr": cust[0],
            "customer": cust[1],
            "vertical": cust[2],
            "terms": cust[3],
            "amount": amount,
            "currency": "USD",
            "dpd": dpd,
            "status": "Open" if dpd >= 0 else "Current",
            "creditLimit": cust[5],
            "groundTruthFeature": slug,
            "groundTruthCategory": CATEGORY_OF.get(slug),
            "signals": signals,
            "eventSeries": events,
        })

    book = {
        "meta": {
            "asOfDate": TODAY,
            "title": "ProcessIQ — Synthetic AR Portfolio",
            "customerCount": len(CUSTOMERS),
            "invoiceCount": len(invoices),
            "openValue": sum(iv["amount"] for iv in invoices),
            "valueAtRisk": sum(iv["amount"] for iv in invoices if iv["groundTruthFeature"]),
        },
        "customers": [
            {"kunnr": c[0], "name": c[1], "vertical": c[2], "terms": c[3],
             "ytdRevenue": c[4], "creditLimit": c[5]} for c in CUSTOMERS
        ],
        "invoices": invoices,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(book, f, indent=2, ensure_ascii=False)
    triggers = sum(1 for iv in invoices if iv["groundTruthFeature"])
    print(f"Wrote {len(invoices)} invoices ({triggers} pattern-triggering, "
          f"{len(invoices)-triggers} clean) -> {os.path.relpath(OUT, ROOT)}")
    print(f"Open value ${book['meta']['openValue']:,} | "
          f"value at risk ${book['meta']['valueAtRisk']:,}")


if __name__ == "__main__":
    main()
