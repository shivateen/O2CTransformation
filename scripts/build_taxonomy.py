#!/usr/bin/env python3
"""
build_taxonomy.py — Generates src/data/taxonomy.json: the generic, function-agnostic
navigation spine for the Process Transformation Accelerator.

The accelerator is agnostic to function/process. A business SME drives:

    Objective -> Function -> Process -> Mission -> Capability -> Patterns (+ DAGs) -> Skills

This generator builds that tree. AR Collections (Order-to-Cash) is fully populated
against the real 31-pattern library (patterns.json); four other functions ship as
"sample" entries with self-contained stub patterns so the framework is provably
agnostic and demoable end-to-end.

Pattern resolution at runtime: each capability carries patternIds. The Mission Builder resolves
an id against the real library (window.PIQ.patterns) first, then falls back to
taxonomy.stubPatterns. Stub patterns share the exact shape of real ones so every
downstream stage (fitment, runtime) renders them identically.
"""
import os, json, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "src", "data")


def load_ar_patterns():
    with open(os.path.join(DATA, "patterns.json"), encoding="utf-8") as f:
        return json.load(f)


def ids_for_category(patterns, category):
    return [p["id"] for p in patterns if p["category"] == category]


# ---------------------------------------------------------------------------
# Mission persona map (RACI) — "who holds this mission?"
#
# Accountable comes from the mission's existing `owner`. Responsible/Consulted are
# authored here, drawn from the SAME role vocabulary the L4 process maps already use
# (processmaps.json roleHeaderNode lanes) so the persona map and the swimlane maps an
# SME can open never disagree on a job title. Approvers are DERIVED at build time from
# the real pattern hitlGates — the gate text already names the actor.
# ---------------------------------------------------------------------------

MISSION_PERSONAS = {
    # -- O.1 Order Management (lanes: order-intake-validation, credit-check-approval) --
    "o2c-m1":  {"responsible": ["Customer Service Representative", "Order Management Specialist",
                                "Sales Operations Manager"],
                "consulted": ["Credit Risk Analyst", "Master Data Steward"]},
    "o2c-m2":  {"responsible": ["Order Management Specialist", "Order Fulfilment Coordinator",
                                "Supply Planner"],
                "consulted": ["Sales Operations Manager"]},
    "o2c-m3":  {"responsible": ["Customer Service Representative", "Order Management Specialist",
                                "Third-Party Fulfilment Coordinator"],
                "consulted": ["Logistics Dispatch Manager"]},
    # -- O.2 Pricing & Rebates -------------------------------------------------
    "o2c-m4":  {"responsible": ["Contract Administrator", "Pricing Analyst", "Revenue Controller"],
                "consulted": ["Sales Operations Manager", "Legal Counsel"]},
    "o2c-m5":  {"responsible": ["Trade Rebate Analyst", "Pricing Analyst", "Revenue Controller"],
                "consulted": ["Finance Controller"]},
    "o2c-m6":  {"responsible": ["Pricing Analyst", "Master Data Steward", "Sales Operations Manager"],
                "consulted": ["Revenue Controller"]},
    # -- O.3 Logistics (lanes: outbound-delivery-fulfilment) -------------------
    "o2c-m7":  {"responsible": ["Order Fulfilment Coordinator", "Warehouse Operations Lead",
                                "Logistics Dispatch Manager"],
                "consulted": ["Customer Service Representative"]},
    "o2c-m8":  {"responsible": ["Freight Settlement Analyst", "Logistics Dispatch Manager",
                                "Transport Planner"],
                "consulted": ["Finance Controller"]},
    "o2c-m9":  {"responsible": ["Export Documentation Specialist", "Trade Compliance Analyst"],
                "consulted": ["Legal Counsel", "Logistics Dispatch Manager"]},
    "o2c-m21": {"responsible": ["Customer Compliance Analyst", "Deductions Analyst",
                                "Logistics Dispatch Manager"],
                "consulted": ["Billing Team Lead"]},
    # -- O.4 Direct Store Delivery --------------------------------------------
    "o2c-m10": {"responsible": ["Route Planner", "DSD Operations Analyst"],
                "consulted": ["Sales Operations Manager"]},
    "o2c-m11": {"responsible": ["Route Sales Representative", "DSD Field Supervisor",
                                "DSD Operations Analyst"],
                "consulted": ["Route Planner"]},
    "o2c-m12": {"responsible": ["Route Settlement Clerk", "DSD Operations Analyst",
                                "Cash Application Analyst"],
                "consulted": ["AR Controller"]},
    # -- O.5 Invoicing & Price Corrections (lanes: invoice-generation, billing-adjustments) --
    "o2c-m13": {"responsible": ["Billing Specialist", "Invoice-to-Cash Analyst", "Billing Team Lead"],
                "consulted": ["Revenue Controller"]},
    "o2c-m14": {"responsible": ["Billing Specialist", "Invoice-to-Cash Analyst",
                                "Revenue Controller", "Billing Team Lead"],
                "consulted": ["Dispute Resolution Analyst"]},
    # -- O.6 Accounts Receivable (lanes: collections-*, payment-*, deduction-identification) --
    "o2c-m15": {"responsible": ["Credit Risk Analyst", "Credit Manager", "Order Management Specialist"],
                "consulted": ["AR Controller", "Sales Operations Manager"]},
    "o2c-m16": {"responsible": ["Collections Analyst", "Collections Specialist",
                                "Collections Strategy Lead", "AR Controller"],
                "consulted": ["Credit & Risk Lead", "Credit & Collections Manager"]},
    "o2c-m17": {"responsible": ["Cash Application Specialist", "Cash Application Analyst",
                                "AR Reconciliation Lead", "Treasury Operations Analyst"],
                "consulted": ["AR Controller"]},
    "o2c-m18": {"responsible": ["Deductions Analyst", "Dispute Resolution Analyst",
                                "Cash Application Analyst", "AR Reconciliation Lead"],
                "consulted": ["Billing Team Lead", "Customer Compliance Analyst"]},
    # -- O.7 Returns Management -----------------------------------------------
    "o2c-m19": {"responsible": ["Returns Coordinator", "Claims Analyst", "Warehouse Operations Lead"],
                "consulted": ["Revenue Controller"]},
    "o2c-m20": {"responsible": ["Returnable Asset Coordinator", "Route Sales Representative"],
                "consulted": ["Finance Controller"]},
    # -- O.8 OTC Transformation & Process Governance ---------------------------
    "o2c-m22": {"responsible": ["Process Design Lead", "Regional Process Owner",
                                "Data Governance Analyst"],
                "consulted": ["Finance Controller"]},
    "o2c-m23": {"responsible": ["Master Data Steward", "Data Governance Analyst",
                                "Master Data Requestor", "Master Data Manager"],
                "consulted": ["Finance Controller"]},
    "o2c-m24": {"responsible": ["EDI Integration Analyst", "Digital Channel Analyst",
                                "Master Data Steward"],
                "consulted": ["Customer Compliance Analyst"]},
    "o2c-m25": {"responsible": ["Controls Analyst", "Data Governance Analyst"],
                "consulted": ["Internal Audit Lead", "Finance Controller"]},
    "o2c-m26": {"responsible": ["Transformation Analyst", "Change & Adoption Lead",
                                "Process Design Lead"],
                "consulted": ["Finance Controller", "Global Process Owner (OTC)"]},
}

# Verbs that separate the actor from the action in a HITL gate string, e.g.
# "Collections VP approves delivery block" -> "Collections VP".
_GATE_VERBS = re.compile(
    r"\s+(?:co-)?(approves?|approval|signs?\s+off|sign-off|authoris\w*|authoriz\w*|confirms?|"
    r"reassigns?|releases?|reviews?|validates?|accepts?|waives?|decides?|escalates?|"
    r"clears?|challenges?|provides?|arbitrates?|rules?|recertifies|resolves?|assigns?|"
    r"adjusts?|selects?|overrides?|verifies|certifies|blocks?|writes?|agrees?|"
    r"determines?|nominates?|extends?|grants?|rejects?|holds?)\b",
    re.I)

# Modal/auxiliary tail left behind when a gate reads "CFO must approve ...".
_MODAL_TAIL = re.compile(r"\s+(must|should|shall|will|needs?\s+to|has\s+to|to)$", re.I)

# Gate text sometimes leads with a bare noun that is not a person.
_NOT_A_ROLE = {"cost-centre", "cost centre", "access", "manual", "system", "auto", "none"}

# Bare titles that are only meaningful when qualified ("VP" vs "Collections VP").
_GENERIC_TITLES = {"vp", "manager", "director", "lead", "head", "controller", "owner"}


def _approver_from_gate(text):
    """Pull the actor phrase(s) out of a HITL gate string.

    Returns a list, because a gate may name co-approvers
    ("Collections VP + Sales Director co-approve"). Returns [] when the gate names
    no recognisable role — we never invent a persona.
    """
    s = (text or "").strip()
    if not s:
        return []
    m = _GATE_VERBS.search(s)
    head = (s[:m.start()] if m else s).strip(" .,:;-")
    out = []
    # split co-approvers, but never on "&" — that would tear "FP&A lead" in half
    for part in re.split(r"\s*(?:\+|,|\band\b)\s*", head):
        actor = _MODAL_TAIL.sub("", part.strip(" .,:;-")).strip(" .,:;-")
        if not actor or len(actor) > 46 or actor.lower() in _NOT_A_ROLE:
            continue
        if not re.search(r"[A-Za-z]", actor):
            continue
        out.append(actor)
    return out


def _dedupe_roles(roles):
    """Collapse the same person written different ways.

    'VP Collections' and 'Collections VP' are one role (same word set, first form
    wins), and a bare generic title is dropped when a qualified variant of it is
    already present ('VP' next to 'Collections VP').
    """
    kept, seen = [], set()
    for r in roles:
        key = tuple(sorted(w.lower() for w in re.split(r"[\s/&+-]+", r) if w))
        if key and key not in seen:
            seen.add(key)
            kept.append(r)
    out = []
    for r in kept:
        low = r.lower()
        if low in _GENERIC_TITLES and any(
                o is not r and low in [w.lower() for w in o.split()] for o in kept):
            continue    # a qualified variant already covers this one
        out.append(r)
    return out


def _initials(role):
    """'Collections Lead' -> 'CL'. Skips connectives and parentheticals."""
    skip = {"and", "of", "the", "for", "&", "/"}
    words = [w for w in re.split(r"[\s/&]+", re.sub(r"\(.*?\)", "", role or ""))
             if w and w.lower() not in skip and w[0].isalnum()]
    return ("".join(w[0] for w in words[:2]) or "?").upper()


def build_mission_personas(mission, by_id):
    """Assemble the RACI map for one mission.

    accountable — the mission's existing `owner` (stub missions have none, and their
                  `name` is already a job title, so fall back to that).
    responsible — authored above from the process-map role vocabulary.
    approvers   — derived from the hitlGates of every pattern the mission's
                  capabilities reference. Real data, so it stays honest as the
                  pattern library grows.
    """
    authored = MISSION_PERSONAS.get(mission["id"], {})
    owner = mission.get("owner") or mission.get("name") or ""

    approvers = []
    for cap in mission.get("capabilities", []):
        for pid in cap.get("patternIds", []):
            pat = by_id.get(pid)
            if not pat:
                continue
            for gate in (pat.get("hitlGates") or []):
                approvers.extend(_approver_from_gate(gate))

    return {
        "accountable": {"role": owner, "initials": _initials(owner)},
        "responsible": list(authored.get("responsible", [])),
        "approvers": _dedupe_roles(approvers)[:4],
        "consulted": list(authored.get("consulted", [])),
    }


# ---------------------------------------------------------------------------
# Capability KPI numerics
#
# Capabilities carry a KPI *label* only. This table gives every label a baseline and
# a target so Run & Monitor can show a mission KPI moving as the queue is cleared.
# Fixed values, no RNG — the demo must be reproducible. The three labels that also
# appear in roi.json are pinned to the SAME numbers so the two screens never
# contradict each other on stage.
# ---------------------------------------------------------------------------

KPI_METRICS = {
    # -- pinned to roi.json ----------------------------------------------------
    "DSO (days)":              ("days", 45, 35, "down"),     # roi.kpis DSO
    "Auto-match %":            ("%", 35, 85, "up"),          # roi.kpis Auto-Match
    "Dispute cycle time":      ("days", 25, 12, "down"),     # roi.kpis Dispute Cycle
    "Leakage $":               ("$M", 3.6, 1.5, "down"),     # 2.1M prevented = roi.outcomes
    "Benefits realized $":     ("$M", 1.8, 8.4, "up"),       # roi.meta year1Total
    # -- Order Management ------------------------------------------------------
    "Clean-order rate %":      ("%", 82, 96, "up"),
    "Order cycle time":        ("hrs", 26, 9, "down"),
    "Cost per order":          ("$", 14.2, 8.6, "down"),
    "O2C cycle time":          ("days", 38, 27, "down"),
    "Fill rate %":             ("%", 91, 98, "up"),
    "Allocation effectiveness": ("%", 74, 92, "up"),
    # -- Pricing & Rebates -----------------------------------------------------
    "Contract compliance %":   ("%", 86, 97, "up"),
    "Accrual accuracy %":      ("%", 88, 98, "up"),
    "Settlement accuracy":     ("%", 90, 99, "up"),
    "Pricing errors":          ("/mo", 240, 60, "down"),
    # -- Logistics -------------------------------------------------------------
    "OTIF %":                  ("%", 91, 98, "up"),
    "Cost per drop":           ("$", 12.4, 9.1, "down"),
    "Freight variance $":      ("$K", 420, 140, "down"),
    "Compliance rate %":       ("%", 87, 98, "up"),
    "Chargeback $":            ("$K", 680, 210, "down"),
    # -- Direct Store Delivery -------------------------------------------------
    "Sales per route":         ("$", 3850, 4600, "up"),
    "Drops per day":           ("/route", 28, 34, "up"),
    "Distributor vs own perf": ("pts", -6, 2, "up"),
    "Settlement variance $":   ("$K", 310, 60, "down"),
    "Exception rate %":        ("%", 18, 5, "down"),
    # -- Billing ---------------------------------------------------------------
    "Touchless billing %":     ("%", 68, 94, "up"),
    "Cost per invoice":        ("$", 3.8, 1.6, "down"),
    "Correction cycle time":   ("days", 9, 3, "down"),
    # -- Accounts Receivable ---------------------------------------------------
    "Bad-debt write-off $":    ("$M", 2.4, 0.9, "down"),
    "Projected DSO":           ("days", 47, 36, "down"),
    "Cost per collection":     ("$", 6.4, 2.9, "down"),
    # -- Returns ---------------------------------------------------------------
    "Salvage recovery %":      ("%", 42, 68, "up"),
    "Asset float $":           ("$M", 5.1, 2.6, "down"),
    # -- Governance ------------------------------------------------------------
    "Template adherence %":    ("%", 64, 93, "up"),
    "Variant count":           ("", 148, 42, "down"),
    "Data quality score":      ("%", 76, 95, "up"),
    "EDI error rate %":        ("%", 11, 2, "down"),
    "Control exceptions":      ("", 34, 6, "down"),
    # -- sample (stub) functions ----------------------------------------------
    "Fraud & duplicate leakage $": ("$K", 940, 180, "down"),
    "Days Payable Outstanding":    ("days", 32, 42, "up"),
    "Aged breaks":                 ("", 210, 25, "down"),
    "Close cycle days":            ("days", 8, 4, "down"),
    "Day-1 readiness %":           ("%", 62, 94, "up"),
    "Open compliance gaps":        ("", 28, 4, "down"),
    "Stockout incidents":          ("/mo", 46, 9, "down"),
    "Forecast accuracy %":         ("%", 71, 92, "up"),
    "Variance cycle time":         ("days", 6, 2, "down"),
    "Idle cash $":                 ("$M", 12.4, 4.2, "down"),
    "Unhedged exposure $":         ("$M", 8.6, 2.1, "down"),
    "Penalty exposure $":          ("$K", 540, 90, "down"),
    "Determination error %":       ("%", 9, 1.5, "down"),
    "Expense leakage $":           ("$K", 380, 70, "down"),
    "Auto-approval %":             ("%", 44, 88, "up"),
    "Open SoD conflicts":          ("", 63, 8, "down"),
}


def build_capability_metric(kpi):
    """Baseline/target for a capability KPI label. Unlisted labels fall back to a
    shape inferred from the label itself so a new capability never renders blank."""
    hit = KPI_METRICS.get(kpi)
    if hit is None:
        label = (kpi or "").lower()
        if "$" in label:
            hit = ("$K", 500, 150, "down")
        elif "%" in label or "rate" in label or "accuracy" in label:
            hit = ("%", 65, 92, "up")
        elif "time" in label or "days" in label or "cycle" in label:
            hit = ("days", 20, 8, "down")
        else:
            hit = ("", 100, 30, "down")
    unit, baseline, target, better = hit
    return {"unit": unit, "baseline": baseline, "target": target, "better": better}


def stub(pid, name, category, priority, feature, mental, happy, branches, gates):
    """Build a stub pattern with the same shape as a real library pattern."""
    return {
        "id": pid,
        "name": name,
        "category": category,
        "priority": priority,
        "priorityRank": {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}[priority],
        "mentalModel": mental,
        "sample": True,
        "sources": {
            "sap": ["(sample mapping — connect your system of record)"],
            "oracle": ["(sample mapping — connect your system of record)"],
        },
        "layer1_logicalMapping": "Sample logical mapping for the " + name + " pattern.",
        "layer2_eventSeries": "Sample event series derived from the source timeline.",
        "layer3_feature": feature,
        "featureSlug": feature.lower().replace("_", "-"),
        "conceptualSQL": "-- sample trigger for " + feature + "\nSELECT * FROM source WHERE signal = '" + feature + "'",
        "originalDAG": happy,
        "branchingDAG": branches,
        "hitlGates": gates,
    }


def br(condition, actions, tier, hitl=None, esc=None):
    b = {"condition": condition, "actions": actions, "hitl": hitl, "tier": tier}
    if esc is not None:
        b["escLevel"] = esc
    return b


def realpat(pid, name, category, priority, feature, mental, sap, oracle, l1, l2,
            happy, branches, gates):
    """A fully-specified pattern with real source mappings (not a sample stub).
    Same shape as a library pattern in patterns.json so every downstream stage
    renders it identically; sample=False so it carries no 'sample' badge."""
    return {
        "id": pid,
        "name": name,
        "category": category,
        "priority": priority,
        "priorityRank": {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}[priority],
        "mentalModel": mental,
        "sample": False,
        "sources": {"sap": sap, "oracle": oracle},
        "layer1_logicalMapping": l1,
        "layer2_eventSeries": l2,
        "layer3_feature": feature,
        "featureSlug": feature.lower().replace("_", "-"),
        "conceptualSQL": "-- pre-calculated trigger for " + feature +
                         "\nSELECT * FROM ap_signals WHERE signal = '" + feature + "'",
        "originalDAG": happy,
        "branchingDAG": branches,
        "hitlGates": gates,
        "calibration": {
            "defaultThreshold": "0-%d days" % (2 + pid % 3),
            "calibratedThreshold": "0-%d days" % (2 + pid % 3 + 3 + pid % 4),
            "traceCount": 8000 + (pid * 373) % 12000,
            "additionalCoverage": 60 + (pid * 29) % 260,
            "method": "PM4Py conformance analysis",
        },
    }


def build_themes():
    """Business themes — the CFO-level outcomes a transformation drives. Each theme
    spans multiple functions, carries a compound (cross-function) KPI, and names the
    cross-process patterns that only emerge when per-process signals are correlated."""
    return [
        {
            "id": "working-capital",
            "name": "Working Capital Optimization",
            "icon": "trending-up",
            "accent": "#1E8E7E",
            "tagline": "Collect faster, pay smarter, deploy idle cash — compress the cash conversion cycle.",
            "compoundKPI": {
                "name": "Cash Conversion Cycle",
                "formula": "DSO + DIO - DPO",
                "unit": "days",
                "current": 58,
                "target": 38,
            },
            "functionIds": ["o2c"],
            "processIds": ["o2c-ar", "o2c-billing", "o2c-dsd"],
            "crossProcessPatterns": [
                {
                    "id": "ccp-1",
                    "name": "Bilateral Cash Squeeze",
                    "description": "Customer delays payment (DSO up) while supplier demands early payment (DPO down). Working capital squeezed from both sides simultaneously.",
                    "triggers": ["Pattern #27 (Creeping Payment Terms) in O2C", "Early Pay Discount pressure in P2P"],
                    "compoundImpact": "2x working capital erosion vs. either signal alone",
                    "response": "Synchronized collections push + supplier payment renegotiation",
                },
                {
                    "id": "ccp-2",
                    "name": "Quarter-End Cash Cliff",
                    "description": "Customers ghost at quarter-end (O2C Pattern #30) while supplier payments concentrate in same period.",
                    "triggers": ["Pattern #30 (EOQ Ghosting) in O2C", "Supplier payment clustering in P2P"],
                    "compoundImpact": "Cash position drops 40-60% in final 5 business days of quarter",
                    "response": "Pre-emptive collection calls week 3 of quarter + supplier payment staggering",
                },
            ],
        },
        {
            "id": "revenue-leakage",
            "name": "Revenue Leakage Prevention",
            "icon": "shield-alert",
            "accent": "#C62828",
            "tagline": "Stop money walking out the door through disputes, deductions, write-offs, and pricing errors.",
            "compoundKPI": {
                "name": "Revenue Leakage Rate",
                "formula": "(Disputes Written Off + Invalid Deductions + Bad Debt + Refund Fraud) / Gross Revenue",
                "unit": "%",
                "current": 2.8,
                "target": 0.9,
            },
            "functionIds": ["o2c"],
            "processIds": ["o2c-pricing", "o2c-billing", "o2c-ar", "o2c-logistics", "o2c-returns"],
            "crossProcessPatterns": [
                {
                    "id": "ccp-3",
                    "name": "Bust-Out Composite Signal",
                    "description": "Customer simultaneously: gaming dispute timing (Collections), requesting duplicate refunds (Cash App), credit score dropping (Credit). Individual signals are flags — together it is bust-out fraud.",
                    "triggers": ["Pattern #1 (29th-Day Tactic)", "Pattern #25 (Duplicate Payment Bait)", "Pattern #19 (Bust-Out Fraud Precursor)", "Pattern #22 (Bureau Downgrade)"],
                    "compoundImpact": "Average loss per bust-out event: $180K-$500K",
                    "response": "Immediate credit freeze + legal hold + CFO notification",
                },
            ],
        },
        {
            "id": "close-acceleration",
            "name": "Accelerate the Order-to-Cash Cycle",
            "icon": "clock",
            "accent": "#1E5F8E",
            "tagline": "Compress the end-to-end cycle — clean order capture to cash applied — so working capital is freed and customers are served faster.",
            "compoundKPI": {
                "name": "O2C Cycle Time",
                "formula": "Day of final GL posting - Day 1 of close",
                "unit": "days",
                "current": 10,
                "target": 4,
            },
            "functionIds": ["o2c"],
            "processIds": ["o2c-ordmgmt", "o2c-billing", "o2c-ar", "o2c-governance"],
            "crossProcessPatterns": [
                {
                    "id": "ccp-4",
                    "name": "Unapplied Cash Close Block",
                    "description": "Unapplied cash from Cash App blocks AR subledger reconciliation in R2R, which blocks trial balance, which delays close.",
                    "triggers": ["Pattern #24 (Remittance Decoupling)", "Pattern #26 (Unapplied Cash Weaponization)"],
                    "compoundImpact": "Each $1M unapplied cash adds ~0.5 days to close cycle",
                    "response": "Auto-match waterfall runs Day -3 before close; exceptions routed to Cash App team with 24-hour SLA",
                },
            ],
        },
        {
            "id": "controls-integrity",
            "name": "Control Credit Risk & Compliance",
            "icon": "shield-check",
            "accent": "#6D4B9C",
            "tagline": "Keep credit exposure inside appetite and the order-to-cash controls fraud-safe — credit scoring, price overrides, cash handling and segregation of duties.",
            "compoundKPI": {
                "name": "Control Health Score",
                "formula": "1 - (Deficiencies + Exceptions + Overrides) / Total Controls Tested",
                "unit": "%",
                "current": 87,
                "target": 97,
            },
            "functionIds": ["o2c"],
            "processIds": ["o2c-ar", "o2c-pricing", "o2c-governance"],
            "crossProcessPatterns": [
                {
                    "id": "ccp-5",
                    "name": "Override Cascade",
                    "description": "Sales rep overrides credit hold (Pattern #29) on a customer who is already exploiting dispute process (Pattern #1). Two control failures compound: customer gets goods on credit while delaying payment on existing invoices.",
                    "triggers": ["Pattern #29 (Strategic Shielding)", "Pattern #1 (29th-Day Tactic)", "Pattern #21 (Credit Block Bypass)"],
                    "compoundImpact": "SOX finding: segregation of duties failure + credit risk exposure",
                    "response": "Block override if customer has active dispute manipulation pattern; auto-escalate to Credit VP",
                },
            ],
        },
        {
            "id": "cash-visibility",
            "name": "Cash Visibility & Forecasting",
            "icon": "eye",
            "accent": "#F57F17",
            "tagline": "See your cash 13 weeks out with 90%+ accuracy. Predict customer payment behavior, not just due dates.",
            "compoundKPI": {
                "name": "13-Week Forecast Accuracy",
                "formula": "1 - |Forecast - Actual| / Actual",
                "unit": "%",
                "current": 64,
                "target": 92,
            },
            "functionIds": ["o2c"],
            "processIds": ["o2c-ar", "o2c-billing"],
            "crossProcessPatterns": [
                {
                    "id": "ccp-6",
                    "name": "Payment Behavior Drift",
                    "description": "Pattern #27 (Creeping Payment Terms) + Pattern #31 (Chronic Promise Breaker) together predict that a customer segment's actual payment date is drifting 2-3 days per quarter. Standard forecast models using contractual terms miss this.",
                    "triggers": ["Pattern #27 (Creeping Payment Terms)", "Pattern #31 (Chronic Promise Breaker)", "Pattern #17 (Check is in the Mail)"],
                    "compoundImpact": "Forecast error of $2-5M per quarter from payment timing drift",
                    "response": "Override forecast model with behavioral prediction for flagged customers",
                },
            ],
        },
    ]


def build_stub_functions():
    """Four sample functions, each with a self-contained library of stub patterns."""
    stubs = {}        # id -> stub pattern
    functions = []

    def add(pid, *args):
        stubs[str(pid)] = stub(pid, *args)
        return pid

    def addr(pid, name, category, priority, feature, mental, sap, oracle, l1, l2,
             happy, branches, gates):
        stubs[str(pid)] = realpat(pid, name, category, priority, feature, mental,
                                  sap, oracle, l1, l2, happy, branches, gates)
        return pid

    # ---- 2000 · Procure-to-Pay (real patterns — powers Working Capital theme) --
    # Fully-specified P2P patterns with real SAP source mappings (EKKO, EKPO, BSEG,
    # LFA1, EBAN, RBKP) so the Working Capital theme carries real patterns from both
    # O2C and P2P. Same shape as the O2C library; no 'sample' badge; function is live.
    OR_AP = ["AP_INVOICES_ALL (invoice header)", "AP_INVOICE_LINES_ALL (line detail)"]
    p2p = [
        # Category A · Invoice & Payment Integrity
        addr(2002, "Duplicate Invoice Injection", "Invoice & Payment Integrity", "Critical",
            "Duplicate_Fingerprint",
            "The 'new' invoice is last month's bill wearing a disguise — a tweaked PO reference and a rounded total, "
            "but the same vendor and the same economic amount. Pay both and we've bought the same thing twice. I match "
            "on the fingerprint, not the invoice number.",
            ["RBKP (invoice receipt header)", "BSEG (posted payables)", "EKPO (PO line reference)"],
            OR_AP,
            "Vendor + net amount + baseline date on the incoming invoice, fingerprinted and matched against every "
            "posted and open payable to catch a re-bill that changed only its surface identifiers.",
            "Invoice arrival → fingerprint(vendor+amount+date) → match against posted & open items → exact vs. fuzzy "
            "(rounded amount / alternate PO) → block or clear before payment.",
            ["Fingerprint_Invoice(vendor+amount+date)", "Match_Against_Posted_And_Open", "Auto_Block_If_Match", "Notify_AP"],
            [br("IF No_Fingerprint_Match", ["Auto_Continue_Processing"], "primary"),
             br("ELSE IF Exact_Match", ["Auto_Block", "Flag_Duplicate"], "primary"),
             br("ELSE IF Fuzzy_Match(rounded/alt-PO)", ["Hold_Payment", "Route_To_AP_Review", "Attach_Candidate_Pair"],
                "escalation", hitl="AP analyst confirms duplicate", esc=1)],
            ["AP analyst confirms duplicate"]),
        addr(2003, "Ghost Vendor", "Invoice & Payment Integrity", "Critical",
            "Ghost_Vendor",
            "A vendor master appears, invoices start flowing, but there's no goods receipt and no service entry behind "
            "any of them — and the bank details were added the same week the first invoice landed. No receipt, fresh "
            "master, new bank: that's a ghost vendor until someone proves otherwise.",
            ["LFA1 (vendor master + creation date)", "RBKP (invoice receipt)", "EKKO (PO / goods-receipt link)"],
            ["AP_SUPPLIERS (supplier master)", "AP_INVOICES_ALL (invoice header)", "RCV_TRANSACTIONS (receipts)"],
            "Each invoice is joined to its goods-receipt / service-entry evidence and to the age of the vendor master "
            "and its bank record; invoices with no receipt behind a freshly-created master are held.",
            "Vendor master created → invoices submitted → check for matching GR / service entry → cross-check master & "
            "bank-record age → no receipt + new master + new bank ⇒ freeze.",
            ["Match_Invoice_To_Receipt", "Check_Vendor_Master_Age", "Detect_No_GR_No_Service", "Hold_Payment"],
            [br("IF GR_Or_Service_Exists", ["Auto_Continue_Processing"], "primary"),
             br("ELSE IF No_Receipt AND Established_Vendor", ["Request_Proof_Of_Delivery", "Notify_Requester"],
                "escalation", hitl="Requester confirms goods/services received", esc=1),
             br("ELSE IF No_Receipt AND New_Master AND New_Bank", ["Freeze_Vendor", "Open_Fraud_Case", "Notify_Security"],
                "escalation", hitl="Controller confirms suspected ghost vendor", esc=2)],
            ["Requester confirms goods/services received", "Controller confirms suspected ghost vendor"]),
        addr(2006, "Three-Way Match Override Abuse", "Invoice & Payment Integrity", "High",
            "ThreeWay_Override",
            "The GR/IR quantity mismatch keeps getting force-released by the same clerk with no note — same vendor, same "
            "override, every month. One override is judgement; a habit of overrides with no investigation is a control "
            "hole. I re-open the pattern, not just the single invoice.",
            ["RBKP (invoice / block-release)", "EKPO (PO vs GR quantities)", "BSEG (posted amount)"],
            ["AP_HOLDS_ALL (holds & releases)", "AP_INVOICES_ALL (invoice header)", "RCV_TRANSACTIONS (receipts)"],
            "Every match block release is attributed to a user and vendor and tested for a recurring override with no "
            "attached investigation evidence — the signature of a rubber-stamped control.",
            "GR/IR mismatch → block → who released it and how often → is there investigation evidence → repeat override "
            "with none ⇒ re-impose block and route to controls.",
            ["Track_Match_Overrides(user+vendor)", "Detect_Repeat_Override", "Check_Investigation_Evidence", "Route_By_Pattern"],
            [br("IF Within_Tolerance_Or_Justified", ["Auto_Release"], "primary"),
             br("ELSE IF First_Override AND Documented", ["Allow", "Monitor"], "primary"),
             br("ELSE IF Repeat_Override AND No_Evidence", ["Re_Impose_Block", "Route_To_Controls", "Flag_SoD_Risk"],
                "escalation", hitl="Controls reviews override pattern", esc=1)],
            ["Controls reviews override pattern"]),

        # Category B · Spend & Terms Control (working-capital levers)
        addr(2001, "Early Pay Discount Trap", "Spend & Terms Control", "High",
            "Early_Pay_Misfire",
            "The 2/10 net-30 says pay by day 10 for the discount — but the payment run grabs it on autopilot even when "
            "our own cash is tight and the discount doesn't beat our cost of cash. I only take the early pay when the "
            "math actually works.",
            ["EKKO (payment terms ZTERM)", "RBKP (invoice header, baseline date)", "BSEG (open payables, discount fields)"],
            ["AP_TERMS (discount terms)", "AP_PAYMENT_SCHEDULES_ALL (schedule)", "AP_INVOICES_ALL (invoice header)"],
            "Discount terms and baseline date, joined to the projected cash position on the proposed pay date, decide "
            "whether taking the early-payment discount earns more than holding the cash.",
            "Discount window opens → payment-run selection date vs. day-10 deadline → cash position on that date → "
            "captured discount value vs. cost of cash → pay early only when it wins.",
            ["Read_Payment_Terms", "Compute_Discount_Value", "Compare_Cost_Of_Cash", "Schedule_By_Cash_Position"],
            [br("IF Discount_Value > Cost_Of_Cash AND Cash_Available", ["Auto_Schedule_Early_Payment"], "primary"),
             br("ELSE IF Discount_Value <= Cost_Of_Cash", ["Defer_To_Net_Due_Date", "Log_Discount_Declined"], "primary"),
             br("ELSE IF Cash_Tight AND Discount_Marginal", ["Route_To_Treasury", "Attach_Cash_Forecast"],
                "escalation", hitl="Treasury approves early pay vs. hold", esc=1)],
            ["Treasury approves early pay vs. hold"]),
        addr(2004, "PO Split Below Approval Threshold", "Spend & Terms Control", "High",
            "Split_Under_Threshold",
            "One requisition became three POs to the same vendor in the same week, each landing just under the approval "
            "limit. Individually each auto-approves; together it's a decision someone senior should sign. I aggregate the "
            "window before releasing any of them.",
            ["EBAN (purchase requisition)", "EKKO (PO header)", "EKPO (PO item)"],
            ["POR_REQUISITION_HEADERS_ALL (requisitions)", "PO_HEADERS_ALL (PO header)", "PO_LINES_ALL (PO lines)"],
            "POs are aggregated by vendor, requester and rolling window and compared against the approval tiers to catch "
            "a spend deliberately sliced to stay under each individual gate.",
            "Requisition → multiple POs to one vendor in a window → aggregate value → does the total cross an approval "
            "tier that no single PO did → re-tier before release.",
            ["Aggregate_POs(vendor+requester+window)", "Compare_To_Approval_Tiers", "Detect_SubThreshold_Split", "Re_Tier_Approval"],
            [br("IF Aggregate < threshold", ["Auto_Approve_Each"], "primary"),
             br("ELSE IF Split_Crosses_Tier", ["Bundle_For_Higher_Approver", "Attach_Split_Evidence"],
                "escalation", hitl="Cost-centre owner approves aggregated spend", esc=1),
             br("ELSE IF Repeat_Splitter > 2 windows", ["Flag_To_Procurement", "Open_Policy_Review"], "escalation", esc=1)],
            ["Cost-centre owner approves aggregated spend"]),
        addr(2005, "Retroactive Price Change", "Spend & Terms Control", "High",
            "Retro_Price_Change",
            "The PO was approved at one unit price; the invoice matches a price that was quietly edited on the PO after "
            "approval but before matching. The three-way match passes because the PO was changed to fit the invoice — I "
            "check the price against the approved version, not the current one.",
            ["EKPO (PO item price + change history)", "EKKO (PO header)", "RBKP (invoice receipt)"],
            ["PO_LINES_ALL (PO line price)", "PO_LINE_LOCATIONS_ALL (shipments)", "AP_INVOICE_LINES_ALL (invoice lines)"],
            "The invoice price is matched against the PO price as approved (from change history), not the current PO "
            "value, so a post-approval edit that silently lifts the price is caught before it clears.",
            "PO approved at price P → PO line price edited after approval → invoice matches the edited price → compare "
            "against approved P → block increases beyond tolerance.",
            ["Read_PO_Price_History", "Compare_Approved_vs_Current", "Detect_PostApproval_Edit", "Match_Against_Approved_Price"],
            [br("IF Price_Unchanged_Since_Approval", ["Auto_Post"], "primary"),
             br("ELSE IF Edit_Within_Tolerance AND Documented", ["Auto_Post", "Log_Change"], "primary"),
             br("ELSE IF PostApproval_Increase > tolerance", ["Block_Invoice", "Route_To_Buyer", "Request_Price_Justification"],
                "escalation", hitl="Buyer confirms approved price change", esc=1)],
            ["Buyer confirms approved price change"]),
        addr(2007, "Payment Term Erosion", "Spend & Terms Control", "Medium",
            "DPO_Erosion",
            "Contract says net-45 but we're actually paying this vendor on day 30 — the effective DPO has drifted a week "
            "short of what we negotiated. Paying early for no discount is just giving working capital away. I catch the "
            "drift and hold to terms.",
            ["BSEG (clearing / payment dates)", "EKKO (contracted terms ZTERM)", "LFA1 (vendor master terms)"],
            ["AP_PAYMENT_SCHEDULES_ALL (payment dates)", "AP_INVOICES_ALL (invoice header)", "AP_TERMS (terms)"],
            "Effective DPO per vendor is computed from actual clearing dates and compared to the contracted terms to "
            "surface systematic early payment that surrenders working capital for no discount.",
            "Actual payment dates → effective DPO by vendor → compare to contract terms → early with no discount benefit "
            "⇒ reschedule to net due; systemic ⇒ treasury.",
            ["Compute_Effective_DPO(vendor)", "Compare_To_Contract_Terms", "Detect_Early_Drift", "Reschedule_To_Terms"],
            [br("IF DPO_At_Or_Above_Terms", ["No_Action"], "primary"),
             br("ELSE IF Early AND No_Discount_Benefit", ["Auto_Reschedule_To_Net_Due", "Log_WC_Recovered"], "primary"),
             br("ELSE IF Early_By_Policy_Or_Discount", ["Keep_Schedule", "Annotate_Reason"], "primary"),
             br("ELSE IF Systemic_Early_Across_Vendors", ["Route_To_Treasury", "Propose_Terms_Reset"],
                "escalation", hitl="Treasury approves payment-timing policy", esc=1)],
            ["Treasury approves payment-timing policy"]),
        addr(2008, "Supplier Concentration Risk", "Spend & Terms Control", "Medium",
            "Supplier_Concentration",
            "One supplier now takes more than 40% of this category's spend. That's convenient until they raise prices or "
            "fail — concentration quietly hands them the leverage. I surface it while there's still time to qualify a "
            "second source.",
            ["EKKO (PO spend by vendor)", "EKPO (category / material group)", "LFA1 (vendor master)"],
            ["PO_HEADERS_ALL (PO header)", "PO_LINES_ALL (category spend)", "POZ_SUPPLIERS (supplier master)"],
            "Category spend is aggregated by vendor to compute each supplier's share; a share above policy flags a "
            "concentration risk before pricing power or a supplier failure becomes the company's problem.",
            "Spend by category and vendor → concentration share → above 40% with alternatives ⇒ dual-source; sole-source "
            "or above 60% ⇒ escalate a risk assessment.",
            ["Aggregate_Spend_By_Category_Vendor", "Compute_Concentration_Share", "Detect_Over_Threshold", "Flag_For_Sourcing"],
            [br("IF Share < 40%", ["No_Action"], "primary"),
             br("ELSE IF Share >= 40% AND Alternatives_Exist", ["Recommend_Dual_Source", "Notify_Category_Manager"],
                "escalation", hitl="Category manager approves sourcing action", esc=1),
             br("ELSE IF Share >= 60% OR Sole_Source", ["Escalate_Procurement_Lead", "Open_Risk_Assessment"], "escalation", esc=1)],
            ["Category manager approves sourcing action"]),
    ]
    functions.append({
        "id": "p2p", "name": "Procure-to-Pay", "short": "P2P", "icon": "🧾",
        "accent": "#7c4dff", "status": "live",
        "tagline": "Invoice integrity, matching, and payment timing that protects cash.",
        "valueChain": build_p2p_value_chain(),
        "processes": [{
            "id": "p2p-ap", "name": "AP Invoice Processing & Working Capital",
            "desc": "From invoice receipt to payment — duplicates, ghost vendors, matching integrity, and payment timing that protects cash.",
            "missions": [
                {"id": "p2p-ap-analyst", "name": "AP Analyst", "capabilities": [
                    {"id": "p2p-o-integrity", "name": "Stop duplicate, ghost & fraudulent payments",
                     "kpi": "Fraud & duplicate leakage $", "patternIds": [2002, 2003, 2006]},
                ]},
                {"id": "p2p-treasury", "name": "Treasury / Working Capital Analyst", "capabilities": [
                    {"id": "p2p-o-wc", "name": "Protect cash through payment timing",
                     "kpi": "Days Payable Outstanding", "patternIds": [2001, 2007]},
                ]},
                {"id": "p2p-buyer", "name": "Category / Procurement Manager", "capabilities": [
                    {"id": "p2p-o-spend", "name": "Control spend leakage & supplier terms",
                     "kpi": "Contract compliance %", "patternIds": [2004, 2005, 2008]},
                ]},
            ],
        }],
    })

    # ---- 3000 · Record-to-Report ----------------------------------------------
    r2r = [
        # Category A · Reconciliation Integrity
        add(3001, "Stuck Reconciliation Item", "Reconciliation Integrity", "High",
            "Aging_Recon_Break",
            "This GL-to-subledger break has rolled forward three closes. Is it a timing item that will clear, or a real difference someone must own? Age it and route.",
            ["Pull_Recon_Breaks", "Classify_Timing_vs_Real", "Auto_Clear_Timing", "Assign_Owner"],
            [br("IF Timing_Difference", ["Auto_Clear + Document"], "primary"),
             br("ELSE IF Aging > 2 periods", ["Assign_To_Owner", "Escalate_Controller"], "escalation",
                hitl="Controller signs off write-off", esc=1)],
            ["Controller signs off write-off"]),
        add(3004, "Bank Reconciliation Outlier", "Reconciliation Integrity", "High", "Bank_Recon_Outlier",
            "A bank line has sat unmatched for two weeks — not an in-transit item, it's stopped clearing. Either a "
            "payment failed silently or something posted twice. I chase the outlier now, before it's buried in next "
            "month's noise.",
            ["Pull_Bank_vs_Ledger", "Auto_Match_Clearing_Items", "Isolate_Unmatched_Outliers", "Investigate_And_Clear"],
            [br("IF All_Matched", ["Auto_Certify"], "primary"),
             br("ELSE IF In_Transit < grace", ["Auto_Carry_Forward"], "primary"),
             br("ELSE IF Unmatched > grace", ["Trace_Root_Cause", "Route_To_GL_Accountant"],
                "escalation", hitl="GL accountant clears bank outlier", esc=1)],
            ["GL accountant clears bank outlier"]),
        add(3005, "Suspense Account Creep", "Reconciliation Integrity", "Medium", "Suspense_Aging",
            "The suspense and clearing accounts are quietly filling up — items land there 'temporarily' and never "
            "leave. A growing suspense balance is unreconciled risk in disguise; I age it and force each item to a home.",
            ["Scan_Suspense_Clearing_Accounts", "Age_Parked_Items", "Propose_Reclass", "Drain_To_Correct_Account"],
            [br("IF Suspense_Near_Zero", ["No_Action"], "primary"),
             br("ELSE IF Item_Reclassifiable", ["Auto_Reclass + Document"], "primary"),
             br("ELSE IF Aged > 2 periods", ["Assign_Owner", "Escalate_Controller"],
                "escalation", hitl="Controller approves write-off", esc=1)],
            ["Controller approves write-off"]),
        add(3006, "Auto-Certified Reconciliation", "Reconciliation Integrity", "Medium", "RubberStamp_Recon",
            "This account was certified 'reconciled' in four seconds flat, same as every month — but the supporting "
            "balance hasn't moved and nobody attached evidence. A rubber-stamped rec isn't a control; I re-open the "
            "risky ones for a real look.",
            ["Measure_Certification_Behaviour", "Check_Evidence_Attached", "Flag_RubberStamp_Recons", "Route_High_Risk_For_Review"],
            [br("IF Evidenced_Review", ["Accept_Certification"], "primary"),
             br("ELSE IF Low_Risk_Account", ["Accept + Sample_Later"], "primary"),
             br("ELSE IF High_Risk AND No_Evidence", ["Re_Open_Reconciliation", "Notify_Controller"],
                "escalation", hitl="Controller reviews certification quality", esc=1)],
            ["Controller reviews certification quality"]),
        # Category B · Close Orchestration & Control
        add(3002, "Late / Missing Accrual", "Close Orchestration & Control", "High",
            "Accrual_Gap",
            "A recurring accrual that posted every month is missing this period. Did the activity stop, or did someone forget? Detect the gap before the books close.",
            ["Scan_Recurring_Accruals", "Detect_Missing", "Estimate_Amount", "Propose_Journal"],
            [br("IF Within_Materiality", ["Auto_Propose_Journal"], "primary"),
             br("ELSE IF Material", ["Route_To_Accountant", "Attach_Trend"], "escalation",
                hitl="Accountant approves accrual", esc=1)],
            ["Accountant approves accrual"]),
        add(3003, "Intercompany Out-of-Balance", "Close Orchestration & Control", "Critical",
            "IC_Imbalance",
            "Entity A booked the charge; Entity B never picked it up. Every day this lingers it distorts the consolidation. Match the legs and chase the missing one.",
            ["Match_IC_Legs", "Detect_Imbalance", "Identify_Missing_Leg", "Notify_Counterparty"],
            [br("IF Both_Legs_Posted", ["Auto_Eliminate"], "primary"),
             br("ELSE IF One_Leg_Missing", ["Notify_Counterparty_Entity", "Open_IC_Case"], "escalation",
                hitl="Group accountant approves true-up", esc=1)],
            ["Group accountant approves true-up"]),
        add(3007, "Close Task Critical-Path Slip", "Close Orchestration & Control", "High", "Close_CriticalPath",
            "A close task just slipped and it's on the critical path — every downstream task is now waiting on it. I "
            "don't need a status meeting; I need to know who the one bottleneck is and nudge them before the whole "
            "close moves a day right.",
            ["Track_Close_Task_Status", "Compute_Critical_Path", "Detect_Blocking_Slip", "Auto_Nudge_Bottleneck"],
            [br("IF On_Schedule", ["Auto_Confirm_Progress"], "primary"),
             br("ELSE IF Slip AND Off_Critical_Path", ["Auto_Nudge_Owner"], "primary"),
             br("ELSE IF Slip AND On_Critical_Path", ["Escalate_Controller", "Flag_Close_Delay_Risk"],
                "escalation", hitl="Controller approves close plan change", esc=1)],
            ["Controller approves close plan change"]),
        add(3008, "Period Cut-Off Error", "Close Orchestration & Control", "Medium", "CutOff_Error",
            "A big invoice for in-period services posted two days after the cut-off, into the next month. Booked in the "
            "wrong period it distorts both months' results. I catch cut-off errors at close, not when the auditor does.",
            ["Scan_Transactions_Around_CutOff", "Test_Service_vs_Posting_Date", "Detect_Wrong_Period", "Propose_Reclass_Journal"],
            [br("IF Correct_Period", ["Auto_Pass"], "primary"),
             br("ELSE IF Clear_CutOff_Error AND Immaterial", ["Auto_Reclass_Journal"], "primary"),
             br("ELSE IF Material", ["Propose_Adjusting_Entry", "Escalate_Controller"],
                "escalation", hitl="Controller approves cut-off adjustment", esc=1)],
            ["Controller approves cut-off adjustment"]),
    ]
    functions.append({
        "id": "r2r", "name": "Record-to-Report", "short": "R2R", "icon": "📒",
        "accent": "#0aa3a3", "status": "sample",
        "tagline": "A faster, cleaner close — reconciliations, accruals, intercompany.",
        "valueChain": build_r2r_value_chain(),
        "processes": [{
            "id": "r2r-close", "name": "Financial Close & Reconciliation",
            "desc": "Period-end: clear breaks, post accruals, balance intercompany.",
            "missions": [
                {"id": "r2r-gl", "name": "GL Accountant", "capabilities": [
                    {"id": "r2r-o-recon", "name": "Keep reconciliations clean & current",
                     "kpi": "Aged breaks", "patternIds": [3001, 3004, 3005, 3006]},
                ]},
                {"id": "r2r-controller", "name": "Controller", "capabilities": [
                    {"id": "r2r-o-close", "name": "Run a controlled, on-time close",
                     "kpi": "Close cycle days", "patternIds": [3002, 3003, 3007, 3008]},
                ]},
            ],
        }],
    })

    # ---- 4000 · Hire-to-Retire -------------------------------------------------
    h2r = [
        # Category A · Provisioning & Readiness
        add(4001, "Stalled Onboarding Provisioning", "Provisioning & Readiness", "High",
            "Provisioning_Stall",
            "Day-one is in 48 hours and laptop, accounts, and badge are still 'pending'. Which task is the bottleneck, and who do I nudge before the new hire shows up to nothing?",
            ["Track_Provisioning_Tasks", "Detect_Stall", "Identify_Bottleneck", "Auto_Nudge_Owner"],
            [br("IF All_On_Track", ["Auto_Confirm_Ready"], "primary"),
             br("ELSE IF Task_Stalled < SLA", ["Auto_Nudge_Owner"], "primary"),
             br("ELSE IF Past_SLA", ["Escalate_HRBP", "Flag_Day1_Risk"], "escalation",
                hitl="HRBP confirms day-1 readiness", esc=1)],
            ["HRBP confirms day-1 readiness"]),
        add(4003, "Manager Onboarding No-Show", "Provisioning & Readiness", "Medium", "Manager_Prep_Gap",
            "Day-one is 48 hours out and the hiring manager still hasn't done a single onboarding task — no buddy, no "
            "equipment sign-off, no first-week plan. The new hire will show up to a manager who forgot they were "
            "coming. I nudge the manager before the impression is set.",
            ["Track_Manager_Onboarding_Tasks", "Detect_Incomplete", "Auto_Nudge_Manager", "Confirm_Ready"],
            [br("IF Manager_Tasks_Complete", ["Auto_Confirm_Ready"], "primary"),
             br("ELSE IF Incomplete < SLA", ["Auto_Nudge_Manager"], "primary"),
             br("ELSE IF Past_SLA", ["Escalate_HRBP", "Flag_Day1_Risk"], "escalation",
                hitl="HRBP confirms day-1 readiness", esc=1)],
            ["HRBP confirms day-1 readiness"]),
        add(4004, "Access Not Ready Day-1", "Provisioning & Readiness", "High", "Access_Provisioning_Gap",
            "Laptop's here, but the accounts — email, VPN, the core app — still aren't provisioned and start is "
            "tomorrow. A new hire who can't log in on day one loses their first week and their first impression. "
            "I chase the access owner, not just the asset.",
            ["Track_Access_Requests", "Detect_Unprovisioned_Systems", "Auto_Expedite_With_IT", "Verify_Login_Ready"],
            [br("IF All_Access_Ready", ["Auto_Confirm_Ready"], "primary"),
             br("ELSE IF Pending < SLA", ["Auto_Expedite_IT_Ticket"], "primary"),
             br("ELSE IF Critical_System AND Past_SLA", ["Escalate_IT_Lead", "Provision_Temp_Access"],
                "escalation", hitl="IT lead approves expedited provisioning", esc=1)],
            ["IT lead approves expedited provisioning"]),
        add(4005, "Ghost-Start Risk", "Provisioning & Readiness", "Medium", "NoShow_Signal",
            "The new hire has gone quiet — didn't confirm start details, didn't open the pre-boarding portal, and it's "
            "a hot market. Ghosting after accept is real, and every provisioned laptop and licence is sunk cost if they "
            "no-show. I re-engage now and warn the manager to keep a backup warm.",
            ["Track_PreBoarding_Engagement", "Score_NoShow_Risk", "Auto_ReEngage_Candidate", "Alert_If_Elevated"],
            [br("IF Engaged", ["No_Action"], "primary"),
             br("ELSE IF Quiet < window", ["Auto_ReEngage_Candidate"], "primary"),
             br("ELSE IF High_NoShow_Risk", ["Notify_HRBP_And_Manager", "Hold_Further_Provisioning"],
                "escalation", hitl="HRBP confirms candidate still starting", esc=1)],
            ["HRBP confirms candidate still starting"]),
        # Category B · Compliance & Eligibility
        add(4002, "Missing Compliance Document", "Compliance & Eligibility", "Critical",
            "Doc_Gap",
            "Right-to-work paperwork still isn't on file and the start date is locked. Chase it now, or we have a compliance exposure on day one.",
            ["Checklist_Required_Docs", "Detect_Missing", "Auto_Request_From_Hire", "Block_If_Unresolved"],
            [br("IF Complete", ["Auto_Clear_Gate"], "primary"),
             br("ELSE IF Missing AND > 24h_to_start", ["Auto_Request_Document"], "primary"),
             br("ELSE IF Missing AND imminent", ["Escalate_Compliance", "Hold_Start"], "escalation",
                hitl="Compliance approves conditional start", esc=1)],
            ["Compliance approves conditional start"]),
        add(4006, "Background-Check Stall", "Compliance & Eligibility", "High", "BGCheck_Stall",
            "The background check has been 'in progress' for two weeks and the start date is locked. Let them start "
            "before it clears and we've got an unvetted person in a sensitive role; hold it blindly and we lose the "
            "hire. I chase the vendor and prep the conditional-start call.",
            ["Track_BGCheck_Status", "Detect_Stall", "Auto_Chase_Vendor", "Assess_Conditional_Start"],
            [br("IF Cleared", ["Auto_Clear_Gate"], "primary"),
             br("ELSE IF In_Progress < SLA", ["Auto_Chase_Vendor"], "primary"),
             br("ELSE IF Stalled AND Start_Imminent", ["Escalate_Compliance", "Propose_Conditional_Start"],
                "escalation", hitl="Compliance approves conditional start", esc=1)],
            ["Compliance approves conditional start"]),
        add(4007, "Expiring Work Authorization", "Compliance & Eligibility", "High", "WorkAuth_Expiry",
            "This hire's work permit expires four months after they start — right in the middle of probation. An "
            "expiring authorization nobody's tracking becomes an illegal-to-employ problem overnight. I flag the "
            "renewal runway now, while there's still time to act.",
            ["Read_Work_Authorization", "Compute_Expiry_Runway", "Detect_Short_Runway", "Schedule_Renewal_Track"],
            [br("IF Long_Runway", ["Log + Monitor"], "primary"),
             br("ELSE IF Runway < policy", ["Auto_Open_Renewal_Case", "Notify_Compliance"],
                "escalation", hitl="Compliance approves sponsorship/renewal", esc=1),
             br("ELSE IF Expires_During_Probation", ["Escalate_Compliance", "Flag_Employment_Risk"], "escalation", esc=1)],
            ["Compliance approves sponsorship/renewal"]),
        add(4008, "Certification / License Gap", "Compliance & Eligibility", "Medium", "License_Gap",
            "This role legally requires a professional licence, and the one on file can't be verified against the "
            "register — maybe lapsed, maybe never held. Putting an unlicensed person in a regulated seat is a fine and "
            "a headline. I verify at source before day one.",
            ["Identify_Required_Licenses", "Verify_Against_Registry", "Detect_Gap", "Request_Evidence"],
            [br("IF Verified_Valid", ["Auto_Clear_Gate"], "primary"),
             br("ELSE IF Pending_Verification", ["Auto_Request_Evidence"], "primary"),
             br("ELSE IF Unverifiable AND Regulated_Role", ["Hold_Start", "Escalate_Compliance"],
                "escalation", hitl="Compliance confirms licensing", esc=1)],
            ["Compliance confirms licensing"]),
    ]
    functions.append({
        "id": "h2r", "name": "Hire-to-Retire", "short": "HR", "icon": "👤",
        "accent": "#e0529c", "status": "sample",
        "tagline": "Onboarding that's ready on day one, compliantly.",
        "valueChain": build_h2r_value_chain(),
        "processes": [{
            "id": "h2r-onboard", "name": "Employee Onboarding",
            "desc": "From offer-accept to productive day-one — provisioning and compliance.",
            "missions": [
                {"id": "h2r-hrbp", "name": "HR Business Partner", "capabilities": [
                    {"id": "h2r-o-prov", "name": "Guarantee day-one readiness",
                     "kpi": "Day-1 readiness %", "patternIds": [4001, 4003, 4004, 4005]},
                ]},
                {"id": "h2r-comp", "name": "Compliance Officer", "capabilities": [
                    {"id": "h2r-o-doc", "name": "Close compliance & eligibility gaps pre-start",
                     "kpi": "Open compliance gaps", "patternIds": [4002, 4006, 4007, 4008]},
                ]},
            ],
        }],
    })

    # ---- 5000 · Supply Chain ---------------------------------------------------
    sc = [
        add(5001, "Stockout Risk Signal", "Inventory & Availability", "High",
            "Stockout_Lead",
            "Demand is trending up and on-hand cover just dropped below lead time. Do I expedite, substitute, or ride it out? Decide before the shelf goes empty.",
            ["Read_Demand_Signal", "Compute_Cover_vs_LeadTime", "Detect_Risk", "Propose_Replenishment"],
            [br("IF Cover >= LeadTime", ["No_Action"], "primary"),
             br("ELSE IF Risk AND Auto_Replen_Eligible", ["Auto_Raise_Replenishment_PO"], "primary"),
             br("ELSE IF Critical_SKU", ["Propose_Expedite", "Notify_Planner"], "escalation",
                hitl="Planner approves expedite cost", esc=1)],
            ["Planner approves expedite cost"]),
        add(5002, "Delivery Slippage", "Order Fulfillment Exceptions", "Medium",
            "ETA_Slip",
            "The carrier's ETA just slipped past the customer's promised date. Do I re-route, split the shipment, or proactively tell the customer? Don't let them find out first.",
            ["Track_Shipment_ETA", "Detect_Slip", "Assess_Impact", "Trigger_Customer_Comms"],
            [br("IF On_Time", ["No_Action"], "primary"),
             br("ELSE IF Slip < grace", ["Auto_Notify_Customer"], "primary"),
             br("ELSE IF Slip > grace", ["Propose_Reroute", "Escalate_Logistics"], "escalation",
                hitl="Logistics lead approves reroute", esc=1)],
            ["Logistics lead approves reroute"]),
    ]
    functions.append({
        "id": "sc", "name": "Supply Chain", "short": "SC", "icon": "📦",
        "accent": "#f08a24", "status": "sample",
        "tagline": "Availability and on-time delivery, exception-first.",
        "processes": [{
            "id": "sc-fulfill", "name": "Order Fulfillment & Replenishment",
            "desc": "Keep shelves stocked and promises kept — stockouts and slippage.",
            "missions": [
                {"id": "sc-planner", "name": "Supply Planner", "capabilities": [
                    {"id": "sc-o-stock", "name": "Prevent stockouts on critical SKUs",
                     "kpi": "Stockout incidents", "patternIds": [5001]},
                ]},
                {"id": "sc-logistics", "name": "Logistics Coordinator", "capabilities": [
                    {"id": "sc-o-eta", "name": "Protect on-time-in-full delivery",
                     "kpi": "OTIF %", "patternIds": [5002]},
                ]},
            ],
        }],
    })

    # ---- 6000 · Financial Planning & Analysis (Plan-to-Perform) ---------------
    fpa = [
        # Category A · Forecast Integrity & Bias
        add(6000, "Budget Sandbagging", "Forecast Integrity & Bias", "High", "Sandbag_Signal",
            "The regional budget landed 15% below current run-rate — right after their bonus was tied to budget "
            "attainment. That's not conservatism, it's a sandbag: lowball the plan so any outcome looks like a beat.",
            ["Compare_Budget_vs_RunRate", "Score_Sandbag_Risk", "Attach_Trend_Evidence", "Flag_For_Challenge"],
            [br("IF Budget within run-rate band", ["Auto_Accept_Submission"], "primary"),
             br("ELSE IF Below_Band AND Incentive_Linked", ["Request_Justification", "Route_To_FP&A_Review"],
                "escalation", hitl="FP&A lead challenges submission", esc=1),
             br("ELSE IF Repeat_Sandbagger", ["Escalate_Finance_Director", "Propose_Stretch_Target"], "escalation", esc=1)],
            ["FP&A lead challenges submission"]),
        add(6001, "Hockey-Stick Forecast", "Forecast Integrity & Bias", "Medium", "BackLoaded_Curve",
            "Every quarter the forecast crawls flat then miraculously spikes in the final month to hit the number. "
            "The back-loaded hockey stick almost never lands — I discount the miracle month before it's baked in.",
            ["Read_Forecast_Curve", "Detect_BackLoading", "Compare_To_History", "Risk_Adjust_Outlook"],
            [br("IF Curve_Linear", ["Auto_Accept_Forecast"], "primary"),
             br("ELSE IF BackLoaded AND History_Misses", ["Apply_Haircut", "Flag_Delivery_Risk"],
                "escalation", hitl="FP&A lead approves haircut", esc=1),
             br("ELSE IF Extreme_Spike", ["Request_Weekly_Milestones", "Escalate_Business_Partner"], "escalation", esc=1)],
            ["FP&A lead approves haircut"]),
        add(6002, "Forecast Drift", "Forecast Integrity & Bias", "Medium", "Assumption_Staleness",
            "The forecast still assumes 8% growth three months after the market turned. Nobody refreshed the driver — "
            "the gap between what we're steering by and reality is widening silently.",
            ["Check_Assumption_Freshness", "Compare_Drivers_To_Actuals", "Detect_Drift", "Prompt_Refresh"],
            [br("IF Assumptions_Current", ["No_Action"], "primary"),
             br("ELSE IF Drift < tolerance", ["Auto_Nudge_Owner"], "primary"),
             br("ELSE IF Drift > tolerance", ["Recompute_Driver_Based_Forecast", "Escalate_FP&A"],
                "escalation", hitl="FP&A lead approves reforecast", esc=1)],
            ["FP&A lead approves reforecast"]),
        add(6003, "Reforecast Trigger Miss", "Forecast Integrity & Bias", "High", "Reforecast_Trigger",
            "A material event just hit — a lost contract, an FX swing — but no reforecast was triggered. The number "
            "the business is steering by is already wrong and nobody's noticed.",
            ["Monitor_Material_Events", "Assess_Forecast_Impact", "Trigger_Reforecast", "Notify_Stakeholders"],
            [br("IF No_Material_Event", ["No_Action"], "primary"),
             br("ELSE IF Impact < threshold", ["Log_Event + Watch"], "primary"),
             br("ELSE IF Impact > threshold", ["Mandate_Reforecast", "Escalate_CFO_Office"],
                "escalation", hitl="Finance director approves reforecast scope", esc=1)],
            ["Finance director approves reforecast scope"]),
        # Category B · Variance Explanation & Insight
        add(6004, "Unexplained Variance", "Variance Explanation & Insight", "High", "Variance_Unexplained",
            "A $2M unfavourable variance and the commentary just says 'timing'. Timing three months running isn't "
            "timing — it's a miss nobody wants to name. I want the real driver, not a placeholder word.",
            ["Pull_Variance_By_Driver", "Test_Commentary_Quality", "Decompose_Root_Cause", "Request_Real_Explanation"],
            [br("IF Variance < materiality", ["Auto_Accept_Commentary"], "primary"),
             br("ELSE IF Generic_Commentary", ["Reject_Commentary", "Request_Driver_Detail"],
                "escalation", hitl="Business partner provides root cause", esc=1),
             br("ELSE IF Recurring_Unexplained", ["Escalate_Controller", "Open_Deep_Dive"], "escalation", esc=1)],
            ["Business partner provides root cause"]),
        add(6005, "Offsetting Variance Masking", "Variance Explanation & Insight", "Medium", "Offsetting_Variance",
            "Net variance is near zero, so it looks clean — but it's a big favourable price hiding an equally big "
            "unfavourable volume. The net tells a comforting lie; the components tell the real story.",
            ["Decompose_Net_Variance", "Detect_Offsetting_Components", "Surface_Gross_Drivers", "Report_Components"],
            [br("IF Components_Aligned", ["Auto_Accept"], "primary"),
             br("ELSE IF Offsetting_Detected", ["Split_Report_By_Driver", "Flag_Hidden_Risk"],
                "escalation", hitl="FP&A lead reviews component story", esc=1)],
            ["FP&A lead reviews component story"]),
        add(6006, "Phasing / Timing Distortion", "Variance Explanation & Insight", "Medium", "Phasing_Artifact",
            "The whole variance is phasing — spend that shifted a month, not real overspend. Raising an alarm on a "
            "calendar artefact wastes everyone's time; I reclass it to the right period and move on.",
            ["Trace_Variance_To_Period", "Detect_Phasing", "Reclass_To_Correct_Period", "Annotate_Timing"],
            [br("IF Not_Phasing", ["Route_As_Real_Variance"], "primary"),
             br("ELSE IF Pure_Phasing", ["Auto_Reclass + Annotate"], "primary"),
             br("ELSE IF Mixed", ["Split_Phasing_vs_Real", "Route_Real_Portion"], "escalation", esc=1)],
            []),
        add(6007, "Allocation Dispute", "Variance Explanation & Insight", "Medium", "Allocation_Split",
            "The cost centre is up in arms about a variance driven entirely by a corporate allocation they don't "
            "control. Before anyone's judged on it, I separate what they own from what was pushed down to them.",
            ["Split_Controllable_vs_Allocated", "Attribute_Allocation_Source", "Restate_On_Controllable", "Notify_Both_Owners"],
            [br("IF Fully_Controllable", ["Route_To_Cost_Centre"], "primary"),
             br("ELSE IF Allocation_Driven", ["Restate_Controllable_View", "Redirect_To_Allocation_Owner"], "primary"),
             br("ELSE IF Disputed_Split", ["Escalate_FP&A_Arbitration"], "escalation", hitl="FP&A lead arbitrates allocation", esc=1)],
            ["FP&A lead arbitrates allocation"]),
    ]
    functions.append({
        "id": "fpa", "name": "Financial Planning & Analysis", "short": "FP&A", "icon": "📊",
        "accent": "#3f5efb", "status": "sample",
        "tagline": "Rolling forecast, variance insight, and decision support — the perform half of finance.",
        "valueChain": build_fpa_value_chain(),
        "processes": [{
            "id": "fpa-plan", "name": "Forecasting & Variance Management",
            "desc": "Keep the forecast honest and the variances explained — bias out, insight in.",
            "missions": [
                {"id": "fpa-analyst", "name": "FP&A Analyst", "capabilities": [
                    {"id": "fpa-o-fc", "name": "Keep the rolling forecast accurate & bias-free",
                     "kpi": "Forecast accuracy %", "patternIds": [6000, 6001, 6002, 6003]},
                ]},
                {"id": "fpa-partner", "name": "Finance Business Partner", "capabilities": [
                    {"id": "fpa-o-var", "name": "Deliver explained, timely variances",
                     "kpi": "Variance cycle time", "patternIds": [6004, 6005, 6006, 6007]},
                ]},
            ],
        }],
    })

    # ---- 7000 · Treasury & Cash Management ------------------------------------
    tcm = [
        # Category A · Liquidity & Cash Efficiency
        add(7000, "Idle Balance Sweep Miss", "Liquidity & Cash Efficiency", "High", "Idle_Balance",
            "€4M sat in a non-interest current account over the weekend while another entity drew on an overdraft. "
            "We paid to borrow what we already had — sweep the idle balance before it costs us on both sides.",
            ["Scan_Account_Balances", "Detect_Idle_Above_Target", "Compute_Sweep", "Execute_Cash_Sweep"],
            [br("IF Balances_At_Target", ["No_Action"], "primary"),
             br("ELSE IF Idle AND Auto_Sweep_Eligible", ["Auto_Sweep_To_Concentration"], "primary"),
             br("ELSE IF Idle AND Restricted_Account", ["Propose_Manual_Transfer", "Notify_Cash_Manager"],
                "escalation", hitl="Cash manager approves transfer", esc=1)],
            ["Cash manager approves transfer"]),
        add(7001, "Cash-Forecast Variance", "Liquidity & Cash Efficiency", "High", "CashForecast_Miss",
            "Actual cash came in €3M under the 5-day forecast — a major customer paid late and nobody flagged it. "
            "If the forecast is this wrong we could walk into a funding gap blind.",
            ["Compare_Actual_vs_Forecast_Cash", "Detect_Material_Miss", "Trace_Driver", "Update_Liquidity_View"],
            [br("IF Within_Tolerance", ["No_Action"], "primary"),
             br("ELSE IF Miss AND Timing", ["Reforecast_Short_Term", "Notify_Cash_Manager"], "primary"),
             br("ELSE IF Miss AND Funding_Risk", ["Trigger_Contingency_Funding", "Escalate_Treasurer"],
                "escalation", hitl="Treasurer approves contingency draw", esc=1)],
            ["Treasurer approves contingency draw"]),
        add(7002, "Trapped Cash", "Liquidity & Cash Efficiency", "Medium", "Trapped_Cash",
            "We keep counting the Brazil balance as available, but repatriation rules mean we can't actually move it "
            "without a haircut. Trapped cash on the dashboard is a liquidity illusion — I ring-fence it.",
            ["Classify_Cash_By_Availability", "Detect_Restrictions", "Ring_Fence_Trapped", "Restate_Available_Liquidity"],
            [br("IF Fully_Available", ["Include_In_Liquidity"], "primary"),
             br("ELSE IF Restricted", ["Exclude_From_Available", "Flag_Repatriation_Cost"], "primary"),
             br("ELSE IF Repatriation_Opportunity", ["Propose_Upstream_Plan", "Escalate_Treasury"],
                "escalation", hitl="Treasurer approves repatriation", esc=1)],
            ["Treasurer approves repatriation"]),
        add(7003, "Duplicate / Fat-Finger Payment", "Liquidity & Cash Efficiency", "Critical", "Duplicate_Wire",
            "A €500k payment matches one released two hours ago — same beneficiary, same amount. A duplicate wire is "
            "near-impossible to claw back, so I hold it and verify before it ever leaves the building.",
            ["Fingerprint_Payment(beneficiary+amount+ref)", "Match_Against_Recent_Releases", "Hold_Suspected_Duplicate", "Route_For_Verification"],
            [br("IF No_Match", ["Auto_Release_Payment"], "primary"),
             br("ELSE IF Exact_Duplicate", ["Block_Payment", "Alert_Payments_Team"],
                "escalation", hitl="Cash manager confirms not duplicate", esc=1),
             br("ELSE IF Fuzzy_Match", ["Hold_For_Review", "Attach_Candidate_Pair"], "escalation", esc=1)],
            ["Cash manager confirms not duplicate"]),
        # Category B · Financial Risk & Covenant
        add(7004, "FX Exposure Drift", "Financial Risk & Covenant", "High", "FX_Drift",
            "Net USD exposure has drifted 20% past the hedge-policy band as receivables piled up. Unhedged drift is "
            "just a P&L surprise waiting for the next rate move — bring it back inside the band.",
            ["Aggregate_Net_FX_Exposure", "Compare_To_Hedge_Policy", "Detect_Band_Breach", "Propose_Hedge"],
            [br("IF Within_Policy_Band", ["No_Action"], "primary"),
             br("ELSE IF Breach AND Standard_Instrument", ["Propose_Forward_Hedge", "Notify_Risk_Analyst"],
                "escalation", hitl="Treasury risk approves hedge", esc=1),
             br("ELSE IF Large_Breach", ["Escalate_Treasurer", "Model_Hedge_Options"], "escalation", esc=1)],
            ["Treasury risk approves hedge"]),
        add(7005, "Covenant Early-Warning", "Financial Risk & Covenant", "Critical", "Covenant_Proximity",
            "Projected leverage is creeping toward the 3.0x covenant with two months to the test date. I flag it now, "
            "while there's still room to act — discovering a breach on the test date is discovering it too late.",
            ["Project_Covenant_Ratios", "Compare_To_Thresholds", "Detect_Proximity", "Alert_With_Runway"],
            [br("IF Ample_Headroom", ["No_Action"], "primary"),
             br("ELSE IF Proximity < buffer", ["Model_Mitigations", "Notify_Treasurer"],
                "escalation", hitl="Treasurer reviews covenant plan", esc=1),
             br("ELSE IF Breach_Projected", ["Escalate_CFO", "Prepare_Waiver_Case"], "escalation", esc=2)],
            ["Treasurer reviews covenant plan"]),
        add(7006, "Counterparty Concentration", "Financial Risk & Covenant", "Medium", "Counterparty_Concentration",
            "We're holding more with a single bank than policy allows — and its rating just went on negative watch. "
            "Concentration is fine right up until the counterparty isn't, so I rebalance before the headline.",
            ["Aggregate_Exposure_By_Counterparty", "Compare_To_Limits", "Overlay_Credit_Signals", "Propose_Rebalance"],
            [br("IF Within_Limits", ["No_Action"], "primary"),
             br("ELSE IF Over_Limit", ["Propose_Diversification", "Notify_Risk_Analyst"],
                "escalation", hitl="Treasury risk approves reallocation", esc=1),
             br("ELSE IF Rating_Downgrade", ["Reduce_Exposure", "Escalate_Treasurer"], "escalation", esc=1)],
            ["Treasury risk approves reallocation"]),
        add(7007, "Interest-Rate Reset Surprise", "Financial Risk & Covenant", "Medium", "Rate_Reset",
            "A large floating-rate facility resets next week into a higher-rate environment, and the forecast still "
            "uses the old coupon. The reset will quietly blow the interest budget unless we price it in now.",
            ["Scan_Upcoming_Resets", "Reprice_At_Forward_Curve", "Compare_To_Budget", "Update_Interest_Forecast"],
            [br("IF Reset_Immaterial", ["Auto_Update_Forecast"], "primary"),
             br("ELSE IF Material_Increase", ["Flag_Budget_Impact", "Notify_Risk_Analyst"],
                "escalation", hitl="Treasury risk reviews hedge option", esc=1)],
            ["Treasury risk reviews hedge option"]),
    ]
    functions.append({
        "id": "tcm", "name": "Treasury & Cash Management", "short": "TCM", "icon": "🏦",
        "accent": "#1f9d76", "status": "sample",
        "tagline": "Cash visibility, liquidity, and FX / covenant risk — money in motion.",
        "valueChain": build_tcm_value_chain(),
        "processes": [{
            "id": "tcm-cash", "name": "Cash & Liquidity Management",
            "desc": "See the cash, sweep the idle, and catch the risk before it's a surprise.",
            "missions": [
                {"id": "tcm-manager", "name": "Cash Manager", "capabilities": [
                    {"id": "tcm-o-cash", "name": "Maximise cash visibility & yield",
                     "kpi": "Idle cash $", "patternIds": [7000, 7001, 7002, 7003]},
                ]},
                {"id": "tcm-risk", "name": "Treasury Risk Analyst", "capabilities": [
                    {"id": "tcm-o-risk", "name": "Contain FX & covenant risk",
                     "kpi": "Unhedged exposure $", "patternIds": [7004, 7005, 7006, 7007]},
                ]},
            ],
        }],
    })

    # ---- 8000 · Tax Management ------------------------------------------------
    tax = [
        # Category A · Compliance & Filing Integrity
        add(8000, "Filing-Deadline Slip", "Compliance & Filing Integrity", "Critical", "Filing_Deadline",
            "The VAT return is due in three days and three entities still haven't closed. A missed filing is an "
            "automatic penalty plus interest — I chase the stragglers now, not on day four when it's already a fine.",
            ["Track_Return_Calendar", "Detect_At_Risk_Filings", "Chase_Owners", "Escalate_If_Stalled"],
            [br("IF All_On_Track", ["Auto_Confirm_Ready"], "primary"),
             br("ELSE IF At_Risk < SLA", ["Auto_Remind_Owner"], "primary"),
             br("ELSE IF Past_Internal_SLA", ["Escalate_Tax_Manager", "Prepare_Extension_If_Available"],
                "escalation", hitl="Tax manager approves extension/priority", esc=1)],
            ["Tax manager approves extension/priority"]),
        add(8001, "Return-to-Ledger Mismatch", "Compliance & Filing Integrity", "High", "ReturnLedger_Delta",
            "The output tax on the draft return is €90k off the GL control account. File that and you've either "
            "overpaid or handed an auditor a thread to pull — I reconcile the delta before anything is submitted.",
            ["Compare_Return_To_GL", "Compute_Delta", "Trace_Difference", "Reconcile_Before_Filing"],
            [br("IF Delta = 0", ["Auto_Proceed_To_File"], "primary"),
             br("ELSE IF Delta_Explained", ["Document_Reconciliation", "Proceed"], "primary"),
             br("ELSE IF Delta_Unexplained", ["Hold_Filing", "Escalate_Tax_Manager"],
                "escalation", hitl="Tax manager approves adjustment", esc=1)],
            ["Tax manager approves adjustment"]),
        add(8002, "Credit-Note Timing Gap", "Compliance & Filing Integrity", "Medium", "CreditNote_Period",
            "A big credit note landed after the period cut-off but relates to in-period sales. Claim it in the wrong "
            "period and the reclaim gets denied — I place it where the underlying transaction lives.",
            ["Match_CreditNote_To_Sale", "Determine_Correct_Period", "Apply_In_Right_Return", "Document_Basis"],
            [br("IF Same_Period", ["Auto_Apply"], "primary"),
             br("ELSE IF Cross_Period_Clear", ["Assign_To_Original_Period", "Adjust_Return"], "primary"),
             br("ELSE IF Ambiguous", ["Route_To_Tax_Specialist"], "escalation", hitl="Tax specialist confirms period", esc=1)],
            ["Tax specialist confirms period"]),
        add(8003, "e-Invoicing Clearance Reject", "Compliance & Filing Integrity", "High", "Clearance_Reject",
            "The authority's real-time clearance platform bounced 40 invoices on a format rule. Until they're fixed and "
            "re-cleared, those sales can't legally ship — this is a today problem, not a month-end one.",
            ["Ingest_Clearance_Responses", "Detect_Rejections", "Diagnose_Format_Error", "Auto_Correct_And_Resubmit"],
            [br("IF Cleared", ["Release_Invoice"], "primary"),
             br("ELSE IF Known_Format_Error", ["Auto_Fix + Resubmit"], "primary"),
             br("ELSE IF Unknown_Reject", ["Hold_Shipment", "Escalate_Tax_Specialist"],
                "escalation", hitl="Tax specialist resolves clearance rule", esc=1)],
            ["Tax specialist resolves clearance rule"]),
        # Category B · Determination & Position
        add(8004, "Reverse-Charge Miscode", "Determination & Position", "High", "ReverseCharge_Flag",
            "This cross-border service should be reverse-charged but it's coded standard-rated. Wrong mechanism means "
            "a wrong return on both sides of the border — I catch it at determination, not in an audit.",
            ["Read_Transaction_Attributes", "Determine_Correct_Mechanism", "Detect_Miscode", "Correct_Tax_Treatment"],
            [br("IF Treatment_Correct", ["Auto_Continue"], "primary"),
             br("ELSE IF Clear_Miscode", ["Auto_Reclassify + Log"], "primary"),
             br("ELSE IF Complex_Cross_Border", ["Route_To_Tax_Specialist"], "escalation", hitl="Tax specialist confirms treatment", esc=1)],
            ["Tax specialist confirms treatment"]),
        add(8005, "Nexus Threshold Breach", "Determination & Position", "High", "Nexus_Threshold",
            "Sales into this state just crossed the economic-nexus threshold and we're not registered there. Every day "
            "unregistered is tax we should be collecting and will end up paying out of margin — register before it compounds.",
            ["Track_Sales_By_Jurisdiction", "Compare_To_Nexus_Thresholds", "Detect_Breach", "Initiate_Registration"],
            [br("IF Below_Threshold", ["Monitor"], "primary"),
             br("ELSE IF Breach_Recent", ["Flag_Registration_Need", "Notify_Tax_Manager"],
                "escalation", hitl="Tax manager approves registration", esc=1),
             br("ELSE IF Breach_Aged", ["Quantify_Back_Liability", "Escalate_Tax_Director"], "escalation", esc=1)],
            ["Tax manager approves registration"]),
        add(8006, "Exemption-Certificate Gap", "Determination & Position", "Medium", "Cert_Expiry",
            "We're treating this customer as exempt, but the certificate on file expired last quarter. No valid "
            "certificate means no exemption — the assessment lands on us, so I chase the cert before we invoice again.",
            ["Check_Certificate_Validity", "Detect_Expired_Or_Missing", "Request_Renewal", "Suspend_Exemption_If_Unresolved"],
            [br("IF Valid_Certificate", ["Apply_Exemption"], "primary"),
             br("ELSE IF Expired AND Grace", ["Auto_Request_Renewal"], "primary"),
             br("ELSE IF Missing AND Invoicing", ["Charge_Tax_Provisionally", "Notify_Tax_Analyst"],
                "escalation", hitl="Tax analyst confirms exemption status", esc=1)],
            ["Tax analyst confirms exemption status"]),
        add(8007, "Rate-Change Lag", "Determination & Position", "Medium", "Rate_Staleness",
            "The jurisdiction changed the rate effective the 1st and our tax engine still has the old one. Every "
            "invoice since is wrong by the delta — I refresh the rate and sweep the mispriced ones before the return is built.",
            ["Monitor_Statutory_Rate_Changes", "Compare_To_Engine_Config", "Detect_Stale_Rate", "Update_And_Restate"],
            [br("IF Rate_Current", ["No_Action"], "primary"),
             br("ELSE IF Stale AND No_Invoices_Yet", ["Auto_Update_Rate"], "primary"),
             br("ELSE IF Stale AND Invoices_Issued", ["Update_Rate", "Flag_Mispriced_For_Correction"],
                "escalation", hitl="Tax analyst approves corrections", esc=1)],
            ["Tax analyst approves corrections"]),
    ]
    functions.append({
        "id": "tax", "name": "Tax Management", "short": "TAX", "icon": "🧮",
        "accent": "#2d6cdf", "status": "sample",
        "tagline": "Determination, compliance, and provisioning — accurate, penalty-free tax.",
        "valueChain": build_tax_value_chain(),
        "processes": [{
            "id": "tax-comp", "name": "Indirect Tax Compliance & Filing",
            "desc": "File on time and right — reconcile to the ledger, determine at source, never miss a deadline.",
            "missions": [
                {"id": "tax-analyst", "name": "Tax Analyst", "capabilities": [
                    {"id": "tax-o-file", "name": "File on time and accurately",
                     "kpi": "Penalty exposure $", "patternIds": [8000, 8001, 8002, 8003]},
                ]},
                {"id": "tax-specialist", "name": "Tax Specialist", "capabilities": [
                    {"id": "tax-o-det", "name": "Get determination right at source",
                     "kpi": "Determination error %", "patternIds": [8004, 8005, 8006, 8007]},
                ]},
            ],
        }],
    })

    # ---- 9000 · Travel & Expense Management -----------------------------------
    tne = [
        # Category A · Expense Integrity & Fraud
        add(9000, "Duplicate Receipt Submission", "Expense Integrity & Fraud", "High", "Duplicate_Claim",
            "The same restaurant receipt shows up on two reports a month apart — once on the card feed, once as a "
            "manual claim. Pay both and we've bought that dinner twice. I fingerprint the receipt, not the report.",
            ["Fingerprint_Receipt(merchant+amount+date)", "Match_Across_Reports_And_Card", "Flag_Duplicate", "Block_Second_Claim"],
            [br("IF No_Match", ["Auto_Approve_Line"], "primary"),
             br("ELSE IF Exact_Duplicate", ["Auto_Reject_Duplicate", "Notify_Claimant"], "primary"),
             br("ELSE IF Card_vs_Manual_Overlap", ["Hold_For_Review", "Route_To_Auditor"],
                "escalation", hitl="Expense auditor confirms duplicate", esc=1)],
            ["Expense auditor confirms duplicate"]),
        add(9001, "Split-to-Dodge-Limit", "Expense Integrity & Fraud", "Medium", "Claim_Split",
            "A €300 dinner split into two €150 claims to stay under the receipt-required line. The split itself is the "
            "tell — I reassemble the pieces and apply the rule to the whole.",
            ["Aggregate_Related_Lines(merchant+day)", "Compare_To_Thresholds", "Detect_Sub_Limit_Split", "Re_Apply_Rule"],
            [br("IF No_Splitting", ["Auto_Continue"], "primary"),
             br("ELSE IF Split_Detected", ["Merge_And_Require_Receipt", "Flag_For_Review"],
                "escalation", hitl="Expense auditor reviews split", esc=1)],
            ["Expense auditor reviews split"]),
        add(9002, "Weekend / Personal Blur", "Expense Integrity & Fraud", "Medium", "Personal_Blur",
            "The hotel spans Saturday and Sunday with no meeting on the calendar. Personal days dressed up as business "
            "travel — I carve out the private portion before reimbursing it.",
            ["Cross_Ref_Dates_To_Calendar", "Detect_Non_Business_Days", "Split_Business_vs_Personal", "Reimburse_Business_Only"],
            [br("IF All_Business", ["Auto_Approve"], "primary"),
             br("ELSE IF Clear_Personal_Days", ["Auto_Deduct_Personal", "Notify_Claimant"], "primary"),
             br("ELSE IF Disputed", ["Route_To_Auditor"], "escalation", hitl="Expense auditor rules on split", esc=1)],
            ["Expense auditor rules on split"]),
        add(9003, "Mileage / Per-Diem Inflation", "Expense Integrity & Fraud", "Medium", "Mileage_Inflation",
            "Claimed mileage is 40% over the map distance for that route, and it's a recurring habit for this claimant. "
            "Inflated distance every trip is small money that adds up — I check it against the route, not the honour system.",
            ["Compute_Route_Distance", "Compare_To_Claimed", "Detect_Inflation", "Cap_At_Standard"],
            [br("IF Within_Tolerance", ["Auto_Approve"], "primary"),
             br("ELSE IF Over AND One_Off", ["Auto_Cap + Notify"], "primary"),
             br("ELSE IF Repeat_Inflator", ["Flag_Pattern", "Route_To_Auditor"],
                "escalation", hitl="Expense auditor reviews claimant pattern", esc=1)],
            ["Expense auditor reviews claimant pattern"]),
        # Category B · Policy & Flow
        add(9004, "Out-of-Policy Class/Rate", "Policy & Flow", "Medium", "Policy_Breach",
            "Business-class flight on a route policy caps at economy, no exception on file. It's not fraud — but it "
            "clears silently unless the rule actually bites. I hold it for the exception it needs.",
            ["Evaluate_Against_Policy", "Detect_Out_Of_Policy", "Check_Exception_On_File", "Route_By_Rule"],
            [br("IF In_Policy", ["Auto_Approve"], "primary"),
             br("ELSE IF Breach AND Exception_Exists", ["Auto_Approve + Log_Exception"], "primary"),
             br("ELSE IF Breach AND No_Exception", ["Hold_For_Approval", "Notify_Manager"],
                "escalation", hitl="Cost-centre manager approves exception", esc=1)],
            ["Cost-centre manager approves exception"]),
        add(9005, "Missing-Receipt Loop", "Policy & Flow", "Medium", "Missing_Receipt",
            "Third reminder and the receipt still isn't attached; the report just ages while the claimant ignores it. "
            "I auto-remind, then auto-hold — a claim can't sit in limbo forever waiting on one attachment.",
            ["Detect_Missing_Receipt", "Auto_Remind_Claimant", "Escalate_On_Timeout", "Hold_Until_Resolved"],
            [br("IF Receipt_Present", ["Auto_Continue"], "primary"),
             br("ELSE IF Missing < window", ["Auto_Remind"], "primary"),
             br("ELSE IF Missing > window", ["Hold_Reimbursement", "Notify_Manager"],
                "escalation", hitl="Manager approves receipt waiver", esc=1)],
            ["Manager approves receipt waiver"]),
        add(9006, "Late Submission Beyond Window", "Policy & Flow", "Medium", "Late_Submission",
            "This expense is four months old — past the submission window and the VAT-reclaim deadline. Late claims "
            "quietly cost us the tax recovery, so I flag the reclaim loss before it's just accepted.",
            ["Check_Expense_Date_vs_Window", "Detect_Late_Submission", "Quantify_Reclaim_Loss", "Route_By_Policy"],
            [br("IF Within_Window", ["Auto_Continue"], "primary"),
             br("ELSE IF Late AND Within_Grace", ["Approve + Flag_No_Reclaim"], "primary"),
             br("ELSE IF Beyond_Grace", ["Route_To_Manager", "Attach_Policy"],
                "escalation", hitl="Manager approves late claim", esc=1)],
            ["Manager approves late claim"]),
        add(9007, "Manager Rubber-Stamp", "Policy & Flow", "Medium", "RubberStamp_Approval",
            "This approver clears every report in under three seconds flat — flags and all. A rubber-stamp isn't a "
            "control; I re-route the flagged reports somewhere they'll actually be read.",
            ["Measure_Approval_Behaviour", "Detect_RubberStamp_Pattern", "Re_Route_Flagged_Reports", "Notify_Controls"],
            [br("IF Approver_Reviews", ["Auto_Continue"], "primary"),
             br("ELSE IF RubberStamp AND No_Flags", ["Allow + Monitor"], "primary"),
             br("ELSE IF RubberStamp AND Flagged_Items", ["Redirect_To_Independent_Review", "Escalate_Controls"],
                "escalation", hitl="Controls reviews approval quality", esc=1)],
            ["Controls reviews approval quality"]),
    ]
    functions.append({
        "id": "tne", "name": "Travel & Expense", "short": "T&E", "icon": "💳",
        "accent": "#d68910", "status": "sample",
        "tagline": "Expense capture, policy, and reimbursement — spend that behaves.",
        "valueChain": build_tne_value_chain(),
        "processes": [{
            "id": "tne-exp", "name": "Expense Audit & Compliance",
            "desc": "Catch the leakage and keep reimbursement frictionless — audit smart, pay clean.",
            "missions": [
                {"id": "tne-auditor", "name": "Expense Auditor", "capabilities": [
                    {"id": "tne-o-audit", "name": "Catch out-of-policy & fraudulent spend",
                     "kpi": "Expense leakage $", "patternIds": [9000, 9001, 9002, 9003]},
                ]},
                {"id": "tne-analyst", "name": "T&E Analyst", "capabilities": [
                    {"id": "tne-o-flow", "name": "Frictionless, compliant reimbursement",
                     "kpi": "Auto-approval %", "patternIds": [9004, 9005, 9006, 9007]},
                ]},
            ],
        }],
    })

    # ---- 10000 · Internal Controls & Compliance (SOX / GRC) -------------------
    icc = [
        # Category A · Control-Failure Signals
        add(10000, "Journal-Entry Anomaly", "Control-Failure Signals", "High", "JE_Anomaly",
            "A manual top-side journal, round number, posted on the last day of the quarter by someone who never posts "
            "journals. Every red flag for earnings management sitting on one line — I stop and ask before it hits the books.",
            ["Scan_Manual_Journals", "Score_Anomaly(round+timing+poster)", "Attach_Context", "Route_High_Risk"],
            [br("IF Score_Low", ["Auto_Pass"], "primary"),
             br("ELSE IF Elevated", ["Request_Support", "Notify_Controls_Analyst"],
                "escalation", hitl="Controls analyst reviews journal", esc=1),
             br("ELSE IF High_Risk", ["Hold_Posting", "Escalate_Controller"], "escalation", esc=2)],
            ["Controls analyst reviews journal"]),
        add(10001, "Control-Owner Gap", "Control-Failure Signals", "Medium", "Owner_Gap",
            "A key control's owner left three weeks ago and nobody's been reassigned. An unowned control isn't "
            "operating — it's just a paragraph in a binder. I reassign it before the next test proves it dead.",
            ["Map_Controls_To_Owners", "Detect_Vacant_Ownership", "Propose_Reassignment", "Notify_Control_Manager"],
            [br("IF Owner_Active", ["No_Action"], "primary"),
             br("ELSE IF Vacant < grace", ["Auto_Nudge_Manager"], "primary"),
             br("ELSE IF Vacant > grace", ["Flag_Control_At_Risk", "Escalate_Controls_Lead"],
                "escalation", hitl="Controls lead reassigns owner", esc=1)],
            ["Controls lead reassigns owner"]),
        add(10002, "Master-Data Change Without Approval", "Control-Failure Signals", "High", "Unapproved_Change",
            "A vendor's bank detail changed outside the approval workflow — and then a payment went to it. "
            "Change-without-approval followed by a payment is the exact shape of invoice fraud; I freeze and investigate.",
            ["Monitor_Master_Data_Changes", "Match_To_Approval_Records", "Detect_Unapproved", "Correlate_With_Payments"],
            [br("IF Change_Approved", ["Auto_Pass"], "primary"),
             br("ELSE IF Unapproved AND No_Payment", ["Flag_For_Review", "Notify_Controls"],
                "escalation", hitl="Controls analyst validates change", esc=1),
             br("ELSE IF Unapproved AND Payment_Made", ["Freeze_Vendor", "Open_Investigation", "Alert_Security"],
                "escalation", hitl="Controller confirms suspected fraud", esc=2)],
            ["Controls analyst validates change", "Controller confirms suspected fraud"]),
        add(10003, "After-Hours Privileged Access", "Control-Failure Signals", "Medium", "OffHours_Privilege",
            "A privileged admin logged into the finance system at 3am from a new location and touched payment config. "
            "Maybe it's a legitimate fix — but 'explain or freeze' is the only safe default for privilege at that hour.",
            ["Monitor_Privileged_Sessions", "Detect_Anomalous_Access(time+geo+action)", "Request_Justification", "Contain_If_Unexplained"],
            [br("IF Normal_Pattern", ["Auto_Pass"], "primary"),
             br("ELSE IF Anomalous AND Justified", ["Log + Clear"], "primary"),
             br("ELSE IF Anomalous AND Unexplained", ["Suspend_Session", "Escalate_Security"],
                "escalation", hitl="Security approves account suspension", esc=1)],
            ["Security approves account suspension"]),
        # Category B · Segregation of Duties & Access
        add(10004, "Toxic SoD Combination", "Segregation of Duties & Access", "Critical", "Toxic_SoD",
            "This user can both create a vendor and release a payment. That single combination is how invoice fraud "
            "happens — I break the conflict before it's exploited, not while writing the post-mortem.",
            ["Analyze_User_Entitlements", "Detect_Toxic_Combination", "Propose_Mitigation", "Enforce_Separation"],
            [br("IF No_Conflict", ["Auto_Pass"], "primary"),
             br("ELSE IF Conflict AND Mitigating_Control", ["Log_Mitigation + Monitor"], "primary"),
             br("ELSE IF Conflict AND Unmitigated", ["Remove_Conflicting_Access", "Notify_Access_Owner"],
                "escalation", hitl="Access owner approves entitlement change", esc=1)],
            ["Access owner approves entitlement change"]),
        add(10005, "Access-Creep After Role Change", "Segregation of Duties & Access", "High", "Access_Creep",
            "They moved from AP to Treasury six months ago but kept every AP entitlement on the way. Access nobody "
            "revoked just widens the blast radius — I strip the stale rights back to the current role.",
            ["Compare_Access_To_Current_Role", "Detect_Residual_Entitlements", "Propose_Revocation", "Recertify_With_Manager"],
            [br("IF Access_Matches_Role", ["No_Action"], "primary"),
             br("ELSE IF Residual_Low_Risk", ["Auto_Revoke + Notify"], "primary"),
             br("ELSE IF Residual_Sensitive", ["Route_To_Manager_Recert", "Flag_SoD_Risk"],
                "escalation", hitl="Manager recertifies access", esc=1)],
            ["Manager recertifies access"]),
        add(10006, "Dormant Privileged Account", "Segregation of Duties & Access", "Medium", "Dormant_Account",
            "A super-user account hasn't logged in for 90 days but is still enabled. Dormant privilege is free real "
            "estate for an attacker — I disable it now and make someone re-justify it if it's really needed.",
            ["Scan_Privileged_Accounts", "Detect_Dormancy", "Disable_Provisionally", "Notify_Owner_To_Justify"],
            [br("IF Recently_Active", ["No_Action"], "primary"),
             br("ELSE IF Dormant AND Non_Critical", ["Auto_Disable + Notify"], "primary"),
             br("ELSE IF Dormant AND Critical_System", ["Route_To_Access_Owner"],
                "escalation", hitl="Access owner confirms disable", esc=1)],
            ["Access owner confirms disable"]),
        add(10007, "Emergency-Access Never Closed", "Segregation of Duties & Access", "Medium", "Firefighter_Open",
            "Firefighter access was granted for a go-live three weeks ago and never revoked. Temporary access that "
            "outlives its reason is just a standing hole in the wall — I close it and log what it did while open.",
            ["Track_Emergency_Grants", "Detect_Expired_Window", "Review_Actions_Taken", "Revoke_Access"],
            [br("IF Within_Window", ["Monitor"], "primary"),
             br("ELSE IF Expired AND Clean_Log", ["Auto_Revoke + Archive_Log"], "primary"),
             br("ELSE IF Expired AND Suspicious_Actions", ["Revoke + Escalate_Controls"],
                "escalation", hitl="Controls reviews firefighter activity", esc=1)],
            ["Controls reviews firefighter activity"]),
    ]
    functions.append({
        "id": "icc", "name": "Internal Controls & Compliance", "short": "GRC", "icon": "🛡️",
        "accent": "#c0392b", "status": "sample",
        "tagline": "Continuous control monitoring and segregation of duties — trust, evidenced.",
        "valueChain": build_icc_value_chain(),
        "processes": [{
            "id": "icc-ccm", "name": "Continuous Control Monitoring & SoD",
            "desc": "Catch control failures and toxic access before they become losses — assurance, continuously.",
            "missions": [
                {"id": "icc-analyst", "name": "Controls Analyst", "capabilities": [
                    {"id": "icc-o-detect", "name": "Detect control failures early",
                     "kpi": "Control exceptions", "patternIds": [10000, 10001, 10002, 10003]},
                ]},
                {"id": "icc-access", "name": "Access Reviewer", "capabilities": [
                    {"id": "icc-o-sod", "name": "Prevent toxic access combinations",
                     "kpi": "Open SoD conflicts", "patternIds": [10004, 10005, 10006, 10007]},
                ]},
            ],
        }],
    })

    return functions, stubs


def _area(name, subs, procId=None):
    """One L3 process area with its L4 sub-processes. A procId marks it BUILT —
    navigable, resolving to that process; otherwise it is landscape context."""
    a = {"name": name, "sub": subs}
    if procId:
        a["built"] = True
        a["procId"] = procId
    return a


def build_o2c_value_chain():
    """The full Order-to-Cash process taxonomy (L1 value chain → L2 groups →
    L3 process areas → L4 sub-processes). Only the Bill-to-Cash areas are backed
    by a real pattern library today (procId → the built AR process); every other
    area is landscape context, rendered but not yet navigable.
    """
    area = _area
    return {
        "name": "Order-to-Cash Value Chain",
        "groups": [
            {"id": "md", "name": "Master Data", "tone": "md", "areas": [
                area("Master Data", [
                    "Data Prep & Request Validation", "Data collection & validation",
                    "Approval & Syndication", "Ongoing Data Maintenance"],
                    procId="o2c-governance"),
            ]},
            {"id": "o2d", "name": "Order to Deliver", "tone": "o2d", "areas": [
                area("Order Mgmt", [
                    "Order Intake & validation", "Order Modification / Cancellation",
                    "Credit Check & Approval", "Outbound Delivery & fulfilment"],
                    procId="o2c-ordmgmt"),
                area("Order Fulfilment", [
                    "Stock Allocation & Mgmt", "Delivery Creation",
                    "Logistics Operations", "Warehouse Mgmt & Logistics"]),
                area("Customer Billing", [
                    "Invoice Generation", "Invoice validation & dispute handling",
                    "Credit Note / Debit Note processing", "Billing adjustments"],
                    procId="o2c-billing"),
            ]},
            {"id": "b2c", "name": "Bill to Cash", "note": "Collections & Cash apps",
             "tone": "b2c", "areas": [
                area("Collections Mgmt", [
                    "Collections Strategy", "Collections correspondence & escalation",
                    "Promise to pay / payment plan capture", "Provisions & writeoff"],
                    procId="o2c-ar"),
                area("Cash Application", [
                    "Payment Identification", "Payment matching & reconciliation",
                    "Deduction identification", "Cash posting & adjustment"],
                    procId="o2c-ar"),
            ]},
            {"id": "claims", "name": "Claims", "tone": "claims", "areas": [
                area("Claims Mgmt", [
                    "Claims Registration", "Claims Validation",
                    "Claims Approval", "Claims Settlement"]),
            ]},
        ],
    }


def build_p2p_value_chain():
    """Procure-to-Pay lifecycle. The AP invoice + matching areas resolve to the
    built AP process; the rest map the surrounding source-to-pay landscape."""
    area = _area
    return {
        "name": "Procure-to-Pay Value Chain",
        "groups": [
            {"id": "sup", "name": "Supplier & Master Data", "tone": "md", "areas": [
                area("Vendor Onboarding & Master Data", [
                    "Vendor Registration & Validation", "Bank Detail Verification",
                    "Compliance & Risk Screening", "Ongoing Vendor Maintenance"]),
            ]},
            {"id": "s2c", "name": "Source to Contract", "tone": "violet", "areas": [
                area("Sourcing & RFQ", [
                    "Sourcing Event Setup", "Bid Evaluation & Award",
                    "Negotiation & Savings", "Supplier Selection"]),
                area("Contract Management", [
                    "Contract Authoring", "Approval & Signature",
                    "Compliance Monitoring", "Renewal & Expiry"]),
            ]},
            {"id": "p2r", "name": "Purchase to Receipt", "tone": "o2d", "areas": [
                area("Requisition Management", [
                    "Requisition Intake", "Budget & Policy Check",
                    "Requisition Approval", "PR-to-PO Conversion"]),
                area("PO Management", [
                    "PO Creation & Dispatch", "Change / Cancellation",
                    "Order Confirmation", "Expediting & Follow-up"]),
                area("Goods & Service Receipt", [
                    "Goods Receipt Posting", "Service Entry Sheet",
                    "Quality Inspection", "Returns & Rejections"]),
            ]},
            {"id": "i2p", "name": "Invoice to Pay", "note": "AP automation",
             "tone": "b2c", "areas": [
                area("Invoice Processing", [
                    "Invoice Capture & Coding", "Duplicate Detection",
                    "Non-PO Routing", "Approval Workflow"], procId="p2p-ap"),
                area("Matching & Exceptions", [
                    "2/3-Way Matching", "Tolerance & Variance",
                    "Exception Resolution", "GR/IR Clearing"], procId="p2p-ap"),
                area("Payment Execution", [
                    "Payment Proposal", "Discount Capture",
                    "Payment Run & Remittance", "Bank Reconciliation"]),
            ]},
        ],
    }


def build_r2r_value_chain():
    """Record-to-Report lifecycle. The reconciliation + period-end close areas
    resolve to the built Financial Close process; the rest map the landscape."""
    area = _area
    return {
        "name": "Record-to-Report Value Chain",
        "groups": [
            {"id": "record", "name": "Record & Capture", "tone": "o2d", "areas": [
                area("Journal & Transaction Processing", [
                    "Journal Entry Capture", "Recurring & Accrual Journals",
                    "Cost Allocations", "Sub-ledger Postings"]),
            ]},
            {"id": "close", "name": "Reconcile & Close", "note": "The built core",
             "tone": "b2c", "areas": [
                area("Account Reconciliation", [
                    "Balance Sheet Reconciliation", "Bank Reconciliation",
                    "Break Identification & Aging", "Reconciliation Sign-off"],
                    procId="r2r-close"),
                area("Period-End Close", [
                    "Close Task Orchestration", "Accrual & Provision Review",
                    "Intercompany Balancing", "Pre-close Validation"],
                    procId="r2r-close"),
            ]},
            {"id": "consol", "name": "Consolidate & Adjust", "tone": "violet", "areas": [
                area("Consolidation", [
                    "Data Collection & Mapping", "Intercompany Elimination",
                    "Currency Translation", "Minority Interest & Equity"]),
            ]},
            {"id": "report", "name": "Report & Disclose", "tone": "slate", "areas": [
                area("Financial & Management Reporting", [
                    "Statutory Financial Statements", "Management Reporting",
                    "Regulatory & Tax Reporting", "Disclosure & Filing"]),
            ]},
        ],
    }


def build_h2r_value_chain():
    """Hire-to-Retire lifecycle. The onboarding provisioning + compliance areas
    resolve to the built Employee Onboarding process; the rest map the landscape."""
    area = _area
    return {
        "name": "Hire-to-Retire Lifecycle",
        "groups": [
            {"id": "hire", "name": "Attract & Hire", "tone": "violet", "areas": [
                area("Recruitment & Sourcing", [
                    "Job Requisition", "Sourcing & Screening",
                    "Interview Management", "Offer & Negotiation"]),
            ]},
            {"id": "onboard", "name": "Onboard", "note": "Day-1 readiness",
             "tone": "md", "areas": [
                area("Pre-boarding & Provisioning", [
                    "Offer Acceptance Handover", "IT & Asset Provisioning",
                    "Workspace & Access Setup", "Provisioning Tracking"],
                    procId="h2r-onboard"),
                area("Compliance & Day-1", [
                    "Right-to-Work Verification", "Document Collection",
                    "Background Checks", "Day-1 Readiness Gate"],
                    procId="h2r-onboard"),
            ]},
            {"id": "manage", "name": "Manage & Develop", "tone": "o2d", "areas": [
                area("Core HR & Master Data", [
                    "Employee Master Data", "Org & Position Mgmt",
                    "Time & Attendance", "Leave & Absence"]),
                area("Payroll & Benefits", [
                    "Payroll Processing", "Benefits Administration",
                    "Expense & Reimbursement", "Statutory & Tax Filing"]),
                area("Talent & Performance", [
                    "Goal & Performance Mgmt", "Learning & Development",
                    "Compensation Review", "Succession Planning"]),
            ]},
            {"id": "retire", "name": "Offboard & Retire", "tone": "slate", "areas": [
                area("Separation Management", [
                    "Resignation / Termination", "Exit Clearance & Deprovisioning",
                    "Final Settlement", "Records Retention"]),
            ]},
        ],
    }


def build_fpa_value_chain():
    """Financial Planning & Analysis — Plan-to-Perform. Forecast + variance
    areas resolve to the built process; the rest map the landscape."""
    area = _area
    return {
        "name": "Plan-to-Perform Value Chain",
        "groups": [
            {"id": "plan", "name": "Plan & Target", "tone": "violet", "areas": [
                area("Strategic Planning", [
                    "Long-Range Planning", "Target Setting",
                    "Driver & Assumption Library", "Capital Allocation"]),
                area("Annual Budgeting", [
                    "Budget Calendar & Templates", "Bottom-Up Build",
                    "Top-Down Challenge", "Budget Consolidation"]),
            ]},
            {"id": "forecast", "name": "Forecast & Variance", "note": "The built core",
             "tone": "md", "areas": [
                area("Rolling Forecast", [
                    "Forecast Refresh", "Driver-Based Projection",
                    "Bias & Sandbag Detection", "Reforecast Triggers"], procId="fpa-plan"),
                area("Variance Analysis", [
                    "Actual-vs-Plan Bridge", "Variance Commentary",
                    "Phasing & Timing Split", "Controllable vs Allocated"], procId="fpa-plan"),
            ]},
            {"id": "report", "name": "Report & Steer", "tone": "o2d", "areas": [
                area("Management Reporting", [
                    "Monthly Business Review", "Flash & Board Reporting",
                    "KPI & Scorecard", "Profitability Analysis"]),
            ]},
            {"id": "decide", "name": "Decision Support", "tone": "slate", "areas": [
                area("Scenario & Investment", [
                    "Scenario Modeling", "Sensitivity Analysis",
                    "Business Case & ROI", "What-If Simulation"]),
            ]},
        ],
    }


def build_tcm_value_chain():
    """Treasury & Cash Management. Cash positioning + bank sweeps resolve to the
    built process; the rest map the landscape."""
    area = _area
    return {
        "name": "Treasury & Cash Value Chain",
        "groups": [
            {"id": "position", "name": "Plan & Position", "tone": "violet", "areas": [
                area("Cash Forecasting & Liquidity", [
                    "Short-Term Cash Forecast", "Liquidity Planning",
                    "Working-Capital Levers", "Funding Strategy"]),
            ]},
            {"id": "cash", "name": "Cash & Liquidity", "note": "The built core",
             "tone": "md", "areas": [
                area("Cash Positioning", [
                    "Daily Cash Position", "Idle-Balance Sweep",
                    "Forecast-vs-Actual Cash", "Trapped-Cash Watch"], procId="tcm-cash"),
                area("Bank Recon & Payments", [
                    "Bank Reconciliation", "Payment Release Controls",
                    "Duplicate-Payment Guard", "Bank-Fee Analysis"], procId="tcm-cash"),
            ]},
            {"id": "bank", "name": "Bank & Accounts", "tone": "o2d", "areas": [
                area("Payment Factory", [
                    "Payment Orchestration", "In-House Bank",
                    "Bank Account Mgmt", "Signatory & Mandate Control"]),
            ]},
            {"id": "risk", "name": "Debt, Investment & FX", "tone": "slate", "areas": [
                area("Financial Risk", [
                    "FX Exposure & Hedging", "Interest-Rate Risk",
                    "Covenant Monitoring", "Counterparty Risk"]),
            ]},
        ],
    }


def build_tax_value_chain():
    """Tax Management. Compliance & filing + reconciliation resolve to the built
    process; the rest map the landscape."""
    area = _area
    return {
        "name": "Tax Management Value Chain",
        "groups": [
            {"id": "determine", "name": "Determine", "tone": "violet", "areas": [
                area("Tax Determination", [
                    "Rate & Rule Engine", "Reverse-Charge Logic",
                    "Exemption & Certificates", "Master Data & Nexus"]),
            ]},
            {"id": "comply", "name": "Comply & File", "note": "The built core",
             "tone": "md", "areas": [
                area("Compliance & Filing", [
                    "Return Preparation", "Deadline Management",
                    "e-Invoicing & Clearance", "Filing & Submission"], procId="tax-comp"),
                area("Reconciliation & Payment", [
                    "Return-to-Ledger Recon", "Credit-Note Timing",
                    "Tax Payment", "Refund & Reclaim"], procId="tax-comp"),
            ]},
            {"id": "provision", "name": "Provision & Report", "tone": "o2d", "areas": [
                area("Provision & Reporting", [
                    "Current-Tax Provision", "Deferred Tax",
                    "Effective-Rate Analysis", "Statutory Disclosure"]),
            ]},
            {"id": "audit", "name": "Audit & Controversy", "tone": "slate", "areas": [
                area("Audit Management", [
                    "Audit Response", "Assessment Tracking",
                    "Rulings & Positions", "Dispute Resolution"]),
            ]},
        ],
    }


def build_tne_value_chain():
    """Travel & Expense. Expense audit + policy resolve to the built process;
    the rest map the landscape."""
    area = _area
    return {
        "name": "Travel & Expense Value Chain",
        "groups": [
            {"id": "book", "name": "Request & Book", "tone": "violet", "areas": [
                area("Travel Request & Booking", [
                    "Trip Request & Approval", "Online Booking Tool",
                    "Cash Advances", "Pre-Trip Policy Check"]),
            ]},
            {"id": "capture", "name": "Capture & Audit", "note": "The built core",
             "tone": "md", "areas": [
                area("Expense Capture & Audit", [
                    "Receipt Capture & OCR", "Duplicate-Claim Detection",
                    "Fraud & Anomaly Scoring", "Mileage & Per-Diem Check"], procId="tne-exp"),
                area("Policy & Compliance", [
                    "Policy Rule Engine", "Out-of-Policy Flagging",
                    "Missing-Receipt Chase", "Submission-Window Control"], procId="tne-exp"),
            ]},
            {"id": "reimburse", "name": "Approve & Reimburse", "tone": "o2d", "areas": [
                area("Approval & Reimbursement", [
                    "Approval Workflow", "Reimbursement Run",
                    "Payroll / AP Posting", "VAT Reclaim"]),
            ]},
            {"id": "control", "name": "Analyze & Control", "tone": "slate", "areas": [
                area("Spend Analytics", [
                    "Category Spend Analysis", "Card Program Mgmt",
                    "Vendor & Rate Leakage", "Compliance Dashboards"]),
            ]},
        ],
    }


def build_icc_value_chain():
    """Internal Controls & Compliance (SOX/GRC). Continuous monitoring + SoD
    resolve to the built process; the rest map the landscape."""
    area = _area
    return {
        "name": "Internal Controls & Compliance Value Chain",
        "groups": [
            {"id": "design", "name": "Design & Scope", "tone": "violet", "areas": [
                area("Risk & Control Design", [
                    "Risk Assessment", "Control Framework",
                    "Scoping & Materiality", "Control Documentation"]),
            ]},
            {"id": "operate", "name": "Operate & Monitor", "note": "The built core",
             "tone": "md", "areas": [
                area("Continuous Control Monitoring", [
                    "Journal-Entry Testing", "Master-Data Change Watch",
                    "Config & Threshold Monitors", "Privileged-Access Alerts"], procId="icc-ccm"),
                area("Segregation of Duties", [
                    "Toxic-Combination Detection", "Access-Creep Review",
                    "Dormant-Account Sweep", "Emergency-Access Control"], procId="icc-ccm"),
            ]},
            {"id": "certify", "name": "Test & Certify", "tone": "o2d", "areas": [
                area("Testing & Certification", [
                    "Control Testing", "Evidence Collection",
                    "Sub-Certification", "Management Sign-off"]),
            ]},
            {"id": "remediate", "name": "Remediate & Report", "tone": "slate", "areas": [
                area("Issue & Assurance", [
                    "Deficiency Logging", "Remediation Tracking",
                    "Internal Audit Liaison", "Regulatory Reporting"]),
            ]},
        ],
    }


def build_ar_function(patterns):
    """Order-to-Cash — full mission/capability structure from Aswin's O2C Excel:
    8 process areas, 26 missions, 36 capabilities. Only O.6 Accounts Receivable
    links the real 31-pattern behavioural library (patterns 1-31); every other
    process area carries patternIds=[] — capability gaps Tiger would build next.
    Capability ids (OC-*) are enterprise assets reused across missions."""
    return {
        "id": "o2c", "name": "Order-to-Cash", "short": "O2C", "icon": "💵",
        "accent": "#e67e22", "status": "live",
        "tagline": "From contract to cash — one leak-free standard across all routes to market.",
        "valueChain": build_o2c_value_chain(),
        "processes": [
            # -- O.1 Order Management --------------------------------------
            {
                "id": "o2c-ordmgmt", "name": "Order Management",
                "desc": "Capture and promise every order clean and reliable, first time, across direct, indirect and third-party flows.",
                "missions": [
                    {"id": "o2c-m1", "name": "Clean-first-time order capture rate at target",
                     "description": "Process standard, special and indirect sales orders without manual rework",
                     "owner": "Order Management Operations Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-1", "name": "Monitor clean-order rate and order-block root causes by market, channel and order type", "kpi": "Clean-order rate %", "patternIds": [], "scope": "Sale From Stock; Special Order Processing; Indirect Sales"},
                        {"id": "OC-2", "name": "Measure order cycle time from capture to confirmation and quantify automation opportunities", "kpi": "Order cycle time", "patternIds": [], "scope": ""},
                        {"id": "OC-28", "name": "Measure end-to-end OTC cost per order, invoice and collection against benchmarks", "kpi": "Cost per order", "patternIds": [], "scope": ""},
                        {"id": "OC-29", "name": "Measure end-to-end O2C cycle time and quantify working-capital impact", "kpi": "O2C cycle time", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m2", "name": "Promise dates reliable with fill-rate protected",
                     "description": "Manage availability-to-promise so commitments reflect real supply",
                     "owner": "Order Management Operations Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-3", "name": "Project product availability against open orders and quantify fill-rate risk", "kpi": "Fill rate %", "patternIds": [], "scope": "Advanced Available-To-Promise Processing"},
                        {"id": "OC-4", "name": "Simulate allocation and substitution scenarios when supply is short", "kpi": "Allocation effectiveness", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m3", "name": "Third-party orders flow touchless across all parties",
                     "description": "Manage third-party and drop-ship order processing end to end",
                     "owner": "Order Management Operations Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-1", "name": "Monitor clean-order rate and order-block root causes by market, channel and order type", "kpi": "Clean-order rate %", "patternIds": [], "scope": "Third Party Order Processing with and without Advanced"},
                        {"id": "OC-2", "name": "Measure order cycle time from capture to confirmation and quantify automation opportunities", "kpi": "Order cycle time", "patternIds": [], "scope": ""},
                     ]},
                ],
            },
            # -- O.2 Pricing & Rebates ------------------------------------
            {
                "id": "o2c-pricing", "name": "Pricing & Rebates",
                "desc": "Execute pricing and trade agreements so agreed terms equal invoiced terms and every rebate is settled accurately.",
                "missions": [
                    {"id": "o2c-m4", "name": "Contract terms executed as negotiated",
                     "description": "Manage customer and buying-group contracts through their lifecycle",
                     "owner": "Contract & Rebates Operations Lead", "cadence": "Monthly",
                     "capabilities": [
                        {"id": "OC-5", "name": "Monitor contract execution against negotiated terms with compliance flagging", "kpi": "Contract compliance %", "patternIds": [], "scope": "Multi-Company Code Contracts / Buying Group"},
                     ]},
                    {"id": "o2c-m5", "name": "Trade rebates accrued and settled accurately",
                     "description": "Administer conditional rebate agreements from accrual through settlement",
                     "owner": "Contract & Rebates Operations Lead", "cadence": "Monthly",
                     "capabilities": [
                        {"id": "OC-6", "name": "Measure rebate accrual accuracy and project settlement liabilities", "kpi": "Accrual accuracy %", "patternIds": [], "scope": "Conditional Contracts - Fixed, Variable and Multi-Customer"},
                        {"id": "OC-7", "name": "Reconcile trade rebate settlements against claims and flag over/under-payment", "kpi": "Settlement accuracy", "patternIds": [], "scope": ""},
                        {"id": "OC-9", "name": "Quantify gross-to-net leakage from pricing errors, rebate mis-accruals and unearned deductions", "kpi": "Leakage $", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m6", "name": "Price master and deals accurate at order entry",
                     "description": "Maintain sales deals and pricing conditions so invoices price right first time",
                     "owner": "Pricing Operations Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-8", "name": "Monitor pricing-condition and deal-master integrity before orders are impacted", "kpi": "Pricing errors", "patternIds": [], "scope": "Maintain Sales Deals; Maintain Pricing Condition"},
                        {"id": "OC-9", "name": "Quantify gross-to-net leakage from pricing errors, rebate mis-accruals and unearned deductions", "kpi": "Leakage $", "patternIds": [], "scope": ""},
                     ]},
                ],
            },
            # -- O.3 Logistics --------------------------------------------
            {
                "id": "o2c-logistics", "name": "Logistics",
                "desc": "Deliver every order complete, on time, at target cost, compliant with trade regulations and retailer requirements.",
                "missions": [
                    {"id": "o2c-m7", "name": "OTIF at target with delivery cost controlled",
                     "description": "Run outbound delivery and packing operations for customer orders",
                     "owner": "Logistics Operations Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-10", "name": "Measure OTIF and delivery-failure root causes by customer, route and site", "kpi": "OTIF %", "patternIds": [], "scope": "Outbound Delivery Process with Batch Search Strategy; IM Based Packing"},
                        {"id": "OC-11", "name": "Measure delivery and freight cost per case/drop and project network optimization", "kpi": "Cost per drop", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m8", "name": "Freight cost at target with settlements accurate",
                     "description": "Manage freight orders and settlement across own and carrier fleets",
                     "owner": "Logistics Operations Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-11", "name": "Measure delivery and freight cost per case/drop and project network optimization", "kpi": "Cost per drop", "patternIds": [], "scope": "Freight Order Management; Freight Settlement"},
                        {"id": "OC-12", "name": "Reconcile freight settlements against contracted carrier rates and flag variances", "kpi": "Freight variance $", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m9", "name": "Exports compliant and on time in every market",
                     "description": "Manage international trade and export order processing",
                     "owner": "Trade Compliance Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-13", "name": "Monitor export documentation, screening and trade-compliance status", "kpi": "Compliance rate %", "patternIds": [], "scope": "International Trade Exports"},
                     ]},
                    {"id": "o2c-m21", "name": "Retailer compliance fines and chargebacks minimized",
                     "description": "Manage retailer compliance programs (OTIF, ASN, labeling) and prevent chargebacks at root cause",
                     "owner": "Customer Compliance Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-30", "name": "Monitor retailer compliance scorecards and quantify chargebacks by customer and root cause", "kpi": "Chargeback $", "patternIds": [], "scope": ""},
                        {"id": "OC-10", "name": "Measure OTIF and delivery-failure root causes by customer, route and site", "kpi": "OTIF %", "patternIds": [], "scope": ""},
                        {"id": "OC-24", "name": "Measure dispute and deduction cycle time, win rates and recovery value", "kpi": "Dispute cycle time", "patternIds": [], "scope": ""},
                     ]},
                ],
            },
            # -- O.4 Direct Store Delivery --------------------------------
            {
                "id": "o2c-dsd", "name": "Direct Store Delivery",
                "desc": "Run route-to-market operations profitably with every route settled same-day.",
                "missions": [
                    {"id": "o2c-m10", "name": "Route plans maximize sales per route at target cost",
                     "description": "Prepare and optimize routes across all route models",
                     "owner": "DSD Route Planning Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-14", "name": "Optimize route plans against sales potential and cost to serve", "kpi": "Sales per route", "patternIds": [], "scope": "Pre-Sales / Pre-Order / Van Sales Route Preparation"},
                        {"id": "OC-15", "name": "Measure route productivity across route models and markets", "kpi": "Drops per day", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m11", "name": "Route execution delivers sales and delivery targets",
                     "description": "Run in-market route execution on own fleet and distributor fleets",
                     "owner": "DSD Field Operations Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-10", "name": "Measure OTIF and delivery-failure root causes by customer, route and site", "kpi": "OTIF %", "patternIds": [], "scope": "Pre-Sales / Pre-Order / Van Sales Route Execution"},
                        {"id": "OC-15", "name": "Measure route productivity across route models and markets", "kpi": "Drops per day", "patternIds": [], "scope": ""},
                        {"id": "OC-16", "name": "Monitor in-flight route execution with same-day exception alerts", "kpi": "Exception rate %", "patternIds": [], "scope": ""},
                        {"id": "OC-18", "name": "Measure distributor-operated route performance against own-fleet benchmarks", "kpi": "Distributor vs own perf", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m12", "name": "Every route settled same-day with zero unexplained variance",
                     "description": "Reconcile and settle routes - cash, stock, empties and driver accountability",
                     "owner": "DSD Settlement Office Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-16", "name": "Monitor in-flight route execution with same-day exception alerts", "kpi": "Exception rate %", "patternIds": [], "scope": "Pre-Sales / Pre-Order / Van Sales Route Settlement"},
                        {"id": "OC-17", "name": "Reconcile route settlements and flag driver and distributor variances", "kpi": "Settlement variance $", "patternIds": [], "scope": ""},
                        {"id": "OC-27", "name": "Track returnable-asset float and quantify loss, deposit balances and recovery actions", "kpi": "Asset float $", "patternIds": [], "scope": ""},
                     ]},
                ],
            },
            # -- O.5 Invoicing & Price Corrections ------------------------
            {
                "id": "o2c-billing", "name": "Invoicing & Price Corrections",
                "desc": "Bill every delivery accurately, first time, and make corrections rare and fast.",
                "missions": [
                    {"id": "o2c-m13", "name": "Touchless, accurate billing at target rate",
                     "description": "Run invoice billing for all order and non-order flows",
                     "owner": "Billing Operations Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-19", "name": "Monitor touchless-billing rate and invoice-accuracy defects by root cause", "kpi": "Touchless billing %", "patternIds": [], "scope": "Invoice Billing Process; FI Invoice without Sales Order"},
                        {"id": "OC-28", "name": "Measure end-to-end OTC cost per order, invoice and collection against benchmarks", "kpi": "Cost per invoice", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m14", "name": "Corrections resolved fast with root causes eliminated",
                     "description": "Process invoice corrections and drive pricing-error prevention",
                     "owner": "Billing Operations Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-8", "name": "Monitor pricing-condition and deal-master integrity before orders are impacted", "kpi": "Pricing errors", "patternIds": [], "scope": "Invoice Correction Process"},
                        {"id": "OC-9", "name": "Quantify gross-to-net leakage from pricing errors, rebate mis-accruals and unearned deductions", "kpi": "Leakage $", "patternIds": [], "scope": ""},
                        {"id": "OC-20", "name": "Measure correction cycle time and credit/debit note volumes with prevention tracking", "kpi": "Correction cycle time", "patternIds": [], "scope": ""},
                     ]},
                ],
            },
            # -- O.6 Accounts Receivable (the 31 real patterns live here) --
            {
                "id": "o2c-ar", "name": "Accounts Receivable",
                "desc": "Convert invoices to cash quickly, with credit risk controlled and disputes resolved at root cause.",
                "missions": [
                    {"id": "o2c-m15", "name": "Credit risk within appetite without blocking good sales",
                     "description": "Manage customer credit lines, scoring and blocked-order resolution",
                     "owner": "Credit & Risk Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-21", "name": "Score customer credit risk and project exposure against limits", "kpi": "Bad-debt write-off $", "patternIds": [19, 20, 21, 22, 23], "scope": "Credit Management"},
                        {"id": "OC-25", "name": "Project receivables and DSO by market with early warning of deterioration", "kpi": "Projected DSO", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m16", "name": "DSO at target with overdues collected systematically",
                     "description": "Run collections and dunning across markets and segments",
                     "owner": "Collections Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-22", "name": "Prioritize collections worklists by value at risk, promise-to-pay tracking and dunning effectiveness", "kpi": "DSO (days)", "patternIds": [10, 11, 12, 13, 14, 15, 16, 17, 18], "scope": "Collections Management; Dunning"},
                        {"id": "OC-25", "name": "Project receivables and DSO by market with early warning of deterioration", "kpi": "Projected DSO", "patternIds": [], "scope": ""},
                        {"id": "OC-29", "name": "Measure end-to-end O2C cycle time and quantify working-capital impact", "kpi": "O2C cycle time", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m17", "name": "Cash applied same-day at target auto-match rate",
                     "description": "Apply incoming payments across all channels and instruments",
                     "owner": "Cash Application Lead", "cadence": "Daily",
                     "capabilities": [
                        {"id": "OC-23", "name": "Measure auto-match rates in cash application and quantify remittance-quality improvement", "kpi": "Auto-match %", "patternIds": [24, 25, 26], "scope": "Incoming Payments; Lockbox Process; Cash Application"},
                        {"id": "OC-28", "name": "Measure end-to-end OTC cost per order, invoice and collection against benchmarks", "kpi": "Cost per collection", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m18", "name": "Disputes and deductions resolved fast with recovery maximized",
                     "description": "Process dispute cases and drive deduction root-cause elimination",
                     "owner": "Disputes & Deductions Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-7", "name": "Reconcile trade rebate settlements against claims and flag over/under-payment", "kpi": "Settlement accuracy", "patternIds": [], "scope": "Dispute Case Processing"},
                        {"id": "OC-9", "name": "Quantify gross-to-net leakage from pricing errors, rebate mis-accruals and unearned deductions", "kpi": "Leakage $", "patternIds": [27, 28, 29, 30, 31], "scope": ""},
                        {"id": "OC-24", "name": "Measure dispute and deduction cycle time, win rates and recovery value", "kpi": "Dispute cycle time", "patternIds": [1, 2, 3, 4, 5, 6, 7, 8, 9], "scope": ""},
                     ]},
                ],
            },
            # -- O.7 Returns Management -----------------------------------
            {
                "id": "o2c-returns", "name": "Returns Management",
                "desc": "Recover value from returns and returnable assets with minimal leakage.",
                "missions": [
                    {"id": "o2c-m19", "name": "Returns processed fast with credit accuracy and salvage maximized",
                     "description": "Manage customer returns end to end, from authorization to credit and disposition",
                     "owner": "Returns & Claims Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-26", "name": "Measure returns rates, credit accuracy and salvage recovery by customer and product", "kpi": "Salvage recovery %", "patternIds": [], "scope": "Advanced Customer Returns"},
                     ]},
                    {"id": "o2c-m20", "name": "Returnable-asset float minimized with empties fully accounted",
                     "description": "Manage empties and returnable-asset loops (crates, kegs, pallets, bottles)",
                     "owner": "Returnable Assets Manager", "cadence": "Monthly",
                     "capabilities": [
                        {"id": "OC-27", "name": "Track returnable-asset float and quantify loss, deposit balances and recovery actions", "kpi": "Asset float $", "patternIds": [], "scope": "Empties and Returnables Management"},
                     ]},
                ],
            },
            # -- O.8 OTC Transformation & Process Governance --------------
            {
                "id": "o2c-governance", "name": "OTC Transformation & Process Governance",
                "desc": "Own the global OTC process design and continuously transform it toward one leak-free standard.",
                "missions": [
                    {"id": "o2c-m22", "name": "One global OTC standard adopted with deviations governed",
                     "description": "Own the global OTC process design and template so every market runs one standard",
                     "owner": "Global Process Owner (OTC)", "cadence": "Monthly",
                     "capabilities": [
                        {"id": "OC-31", "name": "Measure process standardization and template adherence by market", "kpi": "Template adherence %", "patternIds": [], "scope": ""},
                        {"id": "OC-32", "name": "Mine end-to-end process flows to detect variants, rework loops and automation opportunities", "kpi": "Variant count", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m23", "name": "OTC master data accurate and complete at point of use",
                     "description": "Govern customer, pricing and credit master data so transactions run right first time",
                     "owner": "OTC Master Data Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-33", "name": "Monitor customer, pricing and credit master data quality with defect flagging", "kpi": "Data quality score", "patternIds": [], "scope": ""},
                        {"id": "OC-8", "name": "Monitor pricing-condition and deal-master integrity before orders are impacted", "kpi": "Pricing errors", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m24", "name": "Digital channels onboarded fast with EDI error rates at target",
                     "description": "Onboard and run digital order channels (EDI, portals, e-commerce) so orders arrive clean and touchless",
                     "owner": "Digital Channel Integration Lead", "cadence": "Weekly",
                     "capabilities": [
                        {"id": "OC-34", "name": "Monitor EDI and digital order failure rates by trading partner and root cause", "kpi": "EDI error rate %", "patternIds": [], "scope": ""},
                        {"id": "OC-1", "name": "Monitor clean-order rate and order-block root causes by market, channel and order type", "kpi": "Clean-order rate %", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m25", "name": "OTC control health at target with SoD conflicts resolved",
                     "description": "Operate OTC controls (credit notes, price overrides, cash handling, SoD) so the process stays fraud-safe",
                     "owner": "OTC Controls Lead", "cadence": "Monthly",
                     "capabilities": [
                        {"id": "OC-35", "name": "Monitor OTC control health and segregation-of-duties conflicts with anomaly detection", "kpi": "Control exceptions", "patternIds": [], "scope": ""},
                     ]},
                    {"id": "o2c-m26", "name": "Deployments on plan with adoption and benefits delivered",
                     "description": "Drive market deployments, adoption and benefits realization of the OTC transformation",
                     "owner": "Transformation PMO Lead", "cadence": "Monthly",
                     "capabilities": [
                        {"id": "OC-36", "name": "Track deployment progress, user adoption and benefits realization against business case", "kpi": "Benefits realized $", "patternIds": [], "scope": ""},
                        {"id": "OC-28", "name": "Measure end-to-end OTC cost per order, invoice and collection against benchmarks", "kpi": "Cost per order", "patternIds": [], "scope": ""},
                        {"id": "OC-29", "name": "Measure end-to-end O2C cycle time and quantify working-capital impact", "kpi": "O2C cycle time", "patternIds": [], "scope": ""},
                     ]},
                ],
            },
        ],
        "patternCount": 31,
    }


def main():
    data = load_ar_patterns()
    patterns = data["patterns"]

    ar = build_ar_function(patterns)
    stub_funcs, stub_patterns = build_stub_functions()
    functions = [ar] + stub_funcs
    themes = build_themes()

    # roll up counts for the picker chrome, and derive the persona map + KPI numerics.
    # by_id spans the real library AND the stub patterns so sample functions derive
    # approvers from their own gates exactly the way O2C does.
    # (stubPatterns is keyed by str(id) for JSON; capability patternIds are ints)
    by_id = {p["id"]: p for p in patterns}
    by_id.update({int(k): v for k, v in stub_patterns.items()})

    for f in functions:
        n = 0
        for p in f["processes"]:
            for r in p["missions"]:
                for o in r["capabilities"]:
                    o["patternCount"] = len(o["patternIds"])
                    o["metric"] = build_capability_metric(o.get("kpi"))
                    n += len(o["patternIds"])
                r["personas"] = build_mission_personas(r, by_id)
        f["patternCount"] = n

    out = {
        "meta": {
            "title": "Tiger Mission Control — Navigation Spine",
            "tagline": "From business objective to running agent — one continuous pipeline.",
            "note": "Function-agnostic. Order-to-Cash is fully built; other functions are samples that prove the framework generalises.",
            "stages": [
                {"id": "design", "n": 1, "name": "Setup",
                 "sub": "Mission Control",
                 "blurb": "Pick the mission, choose the patterns, configure the skills."},
                {"id": "fit", "n": 2, "name": "Discover & Fit",
                 "sub": "Pattern discovery & skill fitment",
                 "blurb": "Assess every skill for agent fit; record and agentivise the happy path."},
                {"id": "build", "n": 3, "name": "Build",
                 "sub": "Skill configuration",
                 "blurb": "Bind configured skills into an executable, governed agent chain."},
                {"id": "run", "n": 4, "name": "Run & Monitor",
                 "sub": "Mission execution",
                 "blurb": "Straight-through on the happy path; variations matched to patterns and routed for approval."},
            ],
            "functionCount": len(functions),
            "themeCount": len(themes),
        },
        "themes": themes,
        "functions": functions,
        "stubPatterns": stub_patterns,
    }

    path = os.path.join(DATA, "taxonomy.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print("Built", os.path.relpath(path, ROOT),
          "(%d themes, %d functions, %d sample patterns)" % (len(themes), len(functions), len(stub_patterns)))


if __name__ == "__main__":
    main()
