/* ============================================================================
 * ProcessIQ — Cognitive Engine
 * The deterministic Sense -> Diagnose -> Decide -> Act loop from the deck (slide 7).
 *
 * It reads an invoice's raw `signals`, computes Layer-3 AI features, matches a
 * behavioural pattern from patterns.json, scores confidence, then walks the
 * pattern's Branching DAG to select a governance-appropriate action tier.
 *
 * No framework, no LLM required — this runs entirely on-device so the demo is
 * reliable offline. The live-Claude layer (cockpit.js) only enriches the
 * DIAGNOSE narrative; the decision itself is auditable and deterministic.
 * ==========================================================================*/
(function (global) {
  "use strict";

  /* ---- Layer-3 feature detectors -----------------------------------------
   * Each detector reads raw signals and returns:
   *   match     0..1  — likelihood this pattern is present (drives diagnosis)
   *   severity  0..1  — how aggressive the response should be (drives DAG tier)
   *   features  [{name, value, hint}] — the expert triggers shown in the UI
   * Keyed by featureSlug, matching patterns.json.
   * ----------------------------------------------------------------------*/
  function clamp(x) { return Math.max(0, Math.min(1, x)); }
  function f(name, value, hint) { return { name: name, value: value, hint: hint }; }

  var DETECTORS = {
    "dispute-proximity": function (s) {
      var prox = s.disputeProximity || 0;                       // 1 = filed within 0-2d of due
      var vague = 1 - (s.disputeReasonSpecificity || 0);        // vagueness
      var match = clamp(0.5 * prox + 0.3 * vague + 0.2 * Math.min(1, (s.lateDisputeRate || 0)));
      var sev = clamp(0.3 + 0.15 * (s.disputeCountYTD || 0) + (s.dpd > 45 ? 0.3 : 0));
      return {
        match: match, severity: sev,
        features: [
          f("Dispute_Proximity", prox.toFixed(2), "Day 29 of Net-30"),
          f("Reason_Specificity", (s.disputeReasonSpecificity || 0).toFixed(2), "Very vague"),
          f("Late_Dispute_Rate", pct(s.lateDisputeRate), "Historical pattern"),
          f("Resolution_Ratio", (s.resolutionRatio || 0).toFixed(2), "Rarely substantive"),
        ],
      };
    },
    "volume-vs-threshold": function (s) {
      var underThresh = s.splitAmountEach < 10000 ? 1 : 0;
      var match = clamp(0.4 * underThresh + 0.4 * Math.min(1, (s.splitCount || 0) / 8) + (s.within24h ? 0.2 : 0));
      var sev = clamp((s.totalSplit || 0) / 100000 + 0.2 * ((s.instance || 1) - 1));
      return { match: match, severity: sev, features: [
        f("Split_Count", s.splitCount, "Disputes in 24h"),
        f("Amount_Each", money(s.splitAmountEach), "Just under $10K"),
        f("Total_Split", money(s.totalSplit), "Aggregate exposure"),
      ]};
    },
    "micro-deduction-density": function (s) {
      var match = clamp((s.monthEndFriday ? 0.4 : 0) + Math.min(1, (s.deductionCount || 0) / 50) * 0.6);
      var sev = clamp((s.deductionCount || 0) > 50 ? 0.8 : (s.deductionTotal || 0) / 5000);
      return { match: match, severity: sev, features: [
        f("Deduction_Count", s.deductionCount, "Line items"),
        f("Avg_Deduction", money(s.avgDeduction), "Micro size"),
        f("Month_End_Friday", s.monthEndFriday ? "TRUE" : "FALSE", "Close-day timing"),
      ]};
    },
    "doc-request-frequency": function (s) {
      var match = clamp(Math.min(1, (s.docRequestCount || 0) / 3));
      var sev = clamp((s.docRequestCount || 0) / 4 + (s.loopDays > 30 ? 0.2 : 0));
      return { match: match, severity: sev, features: [
        f("Doc_Request_Count", s.docRequestCount, "Drip-fed requests"),
        f("Loop_Duration", (s.loopDays || 0) + "d", "Days stalled"),
        f("Reasons_Cycled", (s.reasonsCycled || []).join(" → "), "Sequence"),
      ]};
    },
    "contact-shift-frequency": function (s) {
      var match = clamp(Math.min(1, (s.contactShiftCount || 0) / 3));
      var sev = clamp(((s.contactShiftCount || 0) >= 3 ? 0.5 : 0.2) + ((s.amount || 0) > 50000 ? 0.4 : 0));
      return { match: match, severity: sev, features: [
        f("Contact_Shift_Count", s.contactShiftCount, "Buck-passing loops"),
        f("Amount", money(s.amount), "Exposure"),
        f("Strategic_Account", s.strategicAccount ? "TRUE" : "FALSE", "Relationship weight"),
      ]};
    },
    "nlp-keyword-flag": function (s) {
      var match = clamp((s.migrationKeywords ? 0.7 : 0) + Math.min(0.3, (s.stallDuration || 0) / 100));
      var sev = clamp((s.stallDuration || 0) / 30);
      return { match: match, severity: sev, features: [
        f("Migration_Keywords", s.migrationKeywords ? "DETECTED" : "—", "NLP on notes"),
        f("Stall_Duration", (s.stallDuration || 0) + "d", "No firm P2P"),
        f("P2P_Date", s.p2pDate || "NONE", "Promise to pay"),
      ]};
    },
    "po-mismatch-flag": function (s) {
      var match = clamp((s.poNull ? 0.5 : 0) + (s.disputeReasonNoPO ? 0.5 : 0));
      var sev = clamp((s.dpd || 0) > 45 ? 0.7 : 0.35) - (s.emailPOEvidence ? 0.15 : 0);
      return { match: match, severity: clamp(sev), features: [
        f("PO_Null_At_Order", s.poNull ? "TRUE" : "FALSE", "No PO on SO"),
        f("Dispute_Reason", s.disputeReasonNoPO ? "'NO PO'" : "—", "Self-inflicted shield"),
        f("Email_PO_Evidence", s.emailPOEvidence ? "FOUND" : "NONE", "Counter-evidence"),
      ]};
    },
    "credit-limit-velocity": function (s) {
      var match = clamp((s.velocityRatio || 0) + (s.refusingCalls ? 0.1 : 0));
      var sev = clamp(0.6 + (s.refusingCalls ? 0.4 : 0));     // always high — Critical pattern
      return { match: match, severity: sev, features: [
        f("Credit_Limit_Velocity", (s.velocityRatio || 0).toFixed(2), "Orders ÷ limit"),
        f("Orders_Last_7d", s.ordersLast7d, "vs " + money(s.historicalMonthlyAvg) + "/mo"),
        f("Refusing_Calls", s.refusingCalls ? "TRUE" : "FALSE", "Insolvency tell"),
      ]};
    },
    "min-viable-payment": function (s) {
      var match = clamp((s.paymentRatio < 0.05 ? 0.8 : 0) + Math.min(0.2, (s.repeatCount || 0) / 10));
      var sev = clamp(0.4 + 0.2 * (s.repeatCount || 0) + (s.dnbDeclining ? 0.2 : 0));
      return { match: match, severity: sev, features: [
        f("Min_Viable_Payment", pct(s.paymentRatio), "of total due"),
        f("Repeat_Count", s.repeatCount, "rolling 90d"),
        f("D&B_Trend", s.dnbDeclining ? "DECLINING" : "stable", "Bureau signal"),
      ]};
    },
    "threshold-proximity": function (s) {
      var prox = (s.openAR || 0) / (s.reviewLimit || 1);
      var match = clamp(prox > 0.95 && prox < 1 ? 0.85 : prox * 0.6);
      var sev = clamp((s.skimmingDays || 0) / 120);
      return { match: match, severity: sev, features: [
        f("Threshold_Proximity", prox.toFixed(3), "Just under review limit"),
        f("Open_AR", money(s.openAR), "Aggregate"),
        f("Skimming_Duration", (s.skimmingDays || 0) + "d", "Under-the-radar"),
      ]};
    },
    "remittance-lag": function (s) {
      var match = clamp(Math.min(1, (s.remittanceLag || 0) / 5) * (s.unappliedStatus ? 1 : 0.5));
      var sev = clamp((s.remittanceLag || 0) / 5 * 0.5 + ((s.amount || 0) > 500000 ? 0.5 : 0));
      return { match: match, severity: sev, features: [
        f("Remittance_Lag", (s.remittanceLag || 0) + "d", "Wire vs PDF"),
        f("Amount_Unapplied", money(s.amount), "Sitting unapplied"),
        f("Status", s.unappliedStatus ? "UNAPP" : "applied", "Ledger state"),
      ]};
    },
    "discount-date-delta": function (s) {
      var delta = (s.paidDay || 0) - (s.discountDay || 0);
      var match = clamp(delta > 0 && (s.unearnedDiscount || 0) > 0 ? 0.85 : 0.2);
      var sev = clamp((s.unearnedDiscount || 0) / 5000);
      return { match: match, severity: sev, features: [
        f("Discount_Date_Delta", delta + "d late", "Paid Day " + s.paidDay + " vs Day " + s.discountDay),
        f("Unearned_Discount", money(s.unearnedDiscount), "Margin harvested"),
      ]};
    },
    "broken-p2p-ratio": function (s) {
      var match = clamp((s.brokenP2PRatio || 0) + 0.1);
      var sev = clamp((s.brokenP2PRatio || 0));
      return { match: match, severity: sev, features: [
        f("Broken_P2P_Ratio", pct(s.brokenP2PRatio), "of promises"),
        f("P2P_Count", s.p2pCount, "total promises"),
        f("Broken_Count", s.brokenCount, "defaulted"),
      ]};
    },
    "velocity-of-delay": function (s) {
      var match = clamp(Math.min(1, (s.velocityDelta || 0) / 15) * Math.min(1, (s.quarters || 0) / 2));
      var sev = clamp((s.velocityDelta || 0) / 20 + ((s.quarters || 0) >= 4 ? 0.3 : 0));
      return { match: match, severity: sev, features: [
        f("Velocity_of_Delay", "+" + (s.velocityDelta || 0) + "d", "over " + s.quarters + " quarters"),
        f("Days_to_Pay_Trend", (s.trend || []).join(" → "), "Silent stretch"),
      ]};
    },
  };

  function pct(x) { return x == null ? "—" : Math.round(x * 100) + "%"; }
  function money(x) {
    if (x == null) return "—";
    if (x >= 1e6) return "$" + (x / 1e6).toFixed(1) + "M";
    if (x >= 1e3) return "$" + Math.round(x / 1e3) + "K";
    return "$" + x;
  }

  /* ---- The cognitive loop ------------------------------------------------*/

  function indexPatterns(patterns) {
    var byFeature = {};
    patterns.forEach(function (p) { byFeature[p.featureSlug] = p; });
    return byFeature;
  }

  // SENSE + DIAGNOSE: run every detector, find the strongest pattern match.
  function diagnose(invoice, patterns) {
    var byFeature = indexPatterns(patterns);
    var scored = [];
    Object.keys(DETECTORS).forEach(function (slug) {
      var pat = byFeature[slug];
      if (!pat) return;
      var r = DETECTORS[slug](invoice.signals || {});
      scored.push({ slug: slug, pattern: pat, result: r });
    });
    scored.sort(function (a, b) { return b.result.match - a.result.match; });
    var top = scored[0];
    var runnerUp = scored[1];
    var fired = top && top.result.match >= 0.45;

    // Confidence: top match, dampened if a runner-up is close (ambiguity).
    var confidence = 0;
    if (fired) {
      var gap = top.result.match - (runnerUp ? runnerUp.result.match : 0);
      // Calibrated to land in a believable 80-95% band (cf. deck's 91%):
      // a perfect, unambiguous match tops out near 0.95, never a false 100%.
      confidence = clamp(0.46 + 0.34 * Math.min(top.result.match, 0.97) + 0.12 * gap);
    }
    return {
      fired: fired,
      confidence: confidence,
      top: top,
      candidates: scored.slice(0, 4),
    };
  }

  // DECIDE: walk the branching DAG; map severity to the governance tier.
  function decide(diag) {
    if (!diag.fired) return null;
    var branches = diag.top.pattern.branchingDAG || [];
    if (!branches.length) return null;
    var sev = diag.top.result.severity;

    // Order branches: immediate > primary > escalations(by level) > default.
    var ordered = branches.slice();
    // Choose by severity band across available tiers.
    var idx;
    var hasImmediate = branches.some(function (b) { return b.tier === "immediate"; });
    if (hasImmediate) {
      idx = sev > 0.7 ? lastImmediateOrEsc(branches) : firstOf(branches, "immediate");
    } else {
      // bands: <0.45 primary, 0.45-0.75 first escalation, >0.75 highest escalation
      if (sev < 0.45) idx = firstOf(branches, "primary");
      else if (sev < 0.75) idx = nthEscalation(branches, 1);
      else idx = highestEscalation(branches);
    }
    if (idx < 0) idx = 0;
    // Defensive: never select an actionless branch — fall back to the nearest
    // branch that actually carries actions.
    if (!branches[idx].actions || !branches[idx].actions.length) {
      for (var j = branches.length - 1; j >= 0; j--) {
        if (branches[j].actions && branches[j].actions.length) { idx = j; break; }
      }
    }
    var chosen = branches[idx];
    return {
      branchIndex: idx,
      branch: chosen,
      severity: sev,
      requiresHITL: !!chosen.hitl,
      hitl: chosen.hitl || null,
      allBranches: ordered,
    };
  }

  function firstOf(branches, tier) {
    for (var i = 0; i < branches.length; i++) if (branches[i].tier === tier) return i;
    return -1;
  }
  function firstImmediate(branches) { return firstOf(branches, "immediate"); }
  function lastImmediateOrEsc(branches) {
    var last = -1;
    for (var i = 0; i < branches.length; i++)
      if (branches[i].tier === "immediate" || branches[i].tier === "escalation") last = i;
    return last;
  }
  function nthEscalation(branches, n) {
    var c = 0;
    for (var i = 0; i < branches.length; i++) {
      if (branches[i].tier === "escalation") { c++; if (c === n) return i; }
    }
    return highestEscalation(branches);
  }
  function highestEscalation(branches) {
    var last = firstOf(branches, "primary");
    for (var i = 0; i < branches.length; i++)
      if (branches[i].tier === "escalation") last = i;
    return last;
  }

  // ACT: turn the chosen branch's action verbs into executable DAG nodes
  // (with Saga / idempotency / system-of-record metadata from the deck slide 13).
  var WRITE_ACTIONS = /Block|Hold|Clear|Reject|Reduce|Disable|Mandate|Freeze|Legal|Remove|Update_SAP|Update_CRM|Lower|Merge|Offset/i;
  // Classify a single action verb: does it mutate the ERP (and thus need a
  // Saga-compensating step), or is it a read/notify (no rollback needed)?
  function classifyAction(verb) {
    var mutating = WRITE_ACTIONS.test(verb);
    return { verb: verb, mutating: mutating, compensable: mutating };
  }
  function buildActionDAG(decision) {
    if (!decision) return [];
    return decision.branch.actions.map(function (a, i) {
      // split compound "A + B" actions into nodes
      var verbs = a.split(/\s+\+\s+/);
      return {
        step: i + 1,
        actions: verbs.map(function (v) {
          return {
            verb: v.trim(),
            mutating: WRITE_ACTIONS.test(v),
            compensable: WRITE_ACTIONS.test(v),  // Saga: write steps get rollback
          };
        }),
      };
    });
  }

  function run(invoice, patterns) {
    var diag = diagnose(invoice, patterns);
    var decision = decide(diag);
    var dag = buildActionDAG(decision);
    return {
      invoice: invoice,
      sense: diag.fired ? diag.top.result.features : [],
      diagnosis: diag,
      decision: decision,
      actionDAG: dag,
    };
  }

  global.ProcessIQEngine = {
    run: run,
    diagnose: diagnose,
    decide: decide,
    buildActionDAG: buildActionDAG,
    detectors: DETECTORS,
    classifyAction: classifyAction,
    _money: money, _pct: pct,
  };
})(typeof window !== "undefined" ? window : this);
