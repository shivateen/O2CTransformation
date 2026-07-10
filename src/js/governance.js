/* ProcessIQ — Action & Governance (Module 4)
 * Deck slides 13-14: the brain decides, pre-built deterministic blocks execute.
 *  - Interactive Action-DAG execution simulator with live Saga rollback
 *  - The three trust modes (Assisted -> Policy-Approved -> Autonomous)
 *  - The four enterprise governance guarantees */
(function () {
  "use strict";
  var E = window.ProcessIQEngine;
  var patterns = window.PIQ.patterns;

  // patterns whose flat DAG has >=2 mutating steps make the best Saga demos
  function dagSteps(p) {
    return (p.originalDAG || []).map(function (v) { return E.classifyAction(v); });
  }
  function writeCount(p) { return dagSteps(p).filter(function (s) { return s.mutating; }).length; }

  var state = {
    mode: "assisted",        // assisted | policy | autonomous
    patId: pickDefault(),
    injectFail: false,
    failStep: 2,             // 1-indexed
    run: null,               // execution state per step
  };
  function pickDefault() {
    var best = patterns.slice().sort(function (a, b) { return writeCount(b) - writeCount(a); });
    return best[0].id;
  }
  function pat() { return patterns.filter(function (p) { return p.id === state.patId; })[0]; }
  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var MODES = {
    supervised: {
      label: "Supervised", tag: "DAY 1", color: "#c0392b",
      blurb: "Nothing runs without a human. Every action — including read-only lookups — is queued for explicit approval before it executes. This is day one of a deployment, before the system has earned any trust.",
      bullets: ["Every action requires human approval", "READ and WRITE steps alike are gated", "No autonomous execution — full oversight", "Establishes the audit baseline", "Trust is earned from here, not assumed"],
      gate: function () { return true; },  // everything gated — reads included
    },
    assisted: {
      label: "Cautious", tag: "EARLY", color: "var(--sense)",
      blurb: "Read-only lookups run automatically; every WRITE to the ERP is queued for human approval. The AI detects, evidences, and drafts the action payload — a human authorizes anything that changes a record.",
      bullets: ["Reads & lookups run automatically", "Every WRITE queued for approval", "AI drafts the action payload", "Human authorizes state changes", "Full audit trail"],
      gate: function (step) { return step.mutating; },  // gate writes; auto on reads
    },
    policy: {
      label: "Balanced", tag: "EARNED", color: "var(--decide)",
      blurb: "Standing authorization for low-risk, reversible actions. CFO + Controller approve the POLICY (versioned, effective-dated); the system applies within bounds and gates only the rest.",
      bullets: ["Standing authorization for low-risk, reversible actions", "Policy versioned & effective-dated", "CFO + Controller approve the POLICY", "System applies automatically within bounds", "Audit trail for every execution"],
      gate: function (step) { return step.mutating && step.highRisk; },  // gate only high-risk writes
    },
    autonomous: {
      label: "Autonomous", tag: "MATURE", color: "var(--act)",
      blurb: "Full closed-loop execution — only after calibration proves accuracy. Outcome attribution validates every action; underperforming patterns are flagged; rollback is always available.",
      bullets: ["Full closed-loop execution", "Only after calibration proves accuracy", "Outcome attribution validates every action", "Underperforming patterns flagged", "Rollback always available", "Cryptographic audit log"],
      gate: function () { return false; },  // nothing gated
    },
  };

  // a write step is "high-risk" if it touches credit/delivery/legal/portal
  var HIGH_RISK = /Delivery_Block|Legal|Credit_Review|Reduce_Credit|Disable|Mandate_Prepayment|CFO/i;

  function buildRun() {
    var steps = dagSteps(pat()).map(function (s, i) {
      return {
        i: i, verb: s.verb, mutating: s.mutating, compensable: s.compensable,
        highRisk: s.mutating && HIGH_RISK.test(s.verb),
        status: "idle",  // idle | gated | running | committed | failed | rolledback
      };
    });
    steps.forEach(function (s) { if (MODES[state.mode].gate(s)) s.status = "gated"; });
    return steps;
  }

  /* ---------------- render ---------------- */
  function render(view) {
    state.run = buildRun();
    view.innerHTML = '<div class="gov"></div>';
    var root = view.querySelector(".gov");

    root.appendChild(headerEl());
    root.appendChild(modeStrip());

    var grid = el("div", "gov-grid");
    grid.appendChild(simulatorCard());
    grid.appendChild(guaranteesCard());
    root.appendChild(grid);
    wireControls(root);
    paintSteps();
  }

  function headerEl() {
    return el("div", "gov-head",
      '<div class="kv">From Decision to Action · deck slides 13–14</div>' +
      '<h2 style="font-size:22px;margin:2px 0 4px">Brain and Hands Are Separated</h2>' +
      '<p style="margin:0;color:var(--muted);max-width:760px">The AI decides <em>which</em> counter-strategy to run. Pre-built, tested, versioned API blocks do the executing. The AI never writes free-form code into SAP — it composes governed, rollback-ready blocks.</p>');
  }

  /* trust-mode selector */
  function modeStrip() {
    var wrap = el("div", "modestrip");
    var tabs = Object.keys(MODES).map(function (k, i) {
      var m = MODES[k];
      return '<button class="modecard' + (state.mode === k ? " on" : "") + '" data-mode="' + k + '" style="--mc:' + m.color + '">' +
        '<div class="mt"><span class="mtag">' + m.tag + '</span> Mode ' + (i + 1) + '</div>' +
        '<div class="mname">' + m.label + '</div>' +
        '<div class="mblurb">' + esc(m.blurb) + '</div></button>';
    }).join("");
    wrap.innerHTML = '<div class="modetabs">' + tabs + '</div>' +
      '<div class="trustline"><span>Human-in-the-Loop by default</span><div class="tarrow"></div><span>Autonomous by earned trust</span></div>';
    return wrap;
  }

  /* ---- DAG execution simulator ---- */
  function simulatorCard() {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">▸</span>Skill DAG — Execution Simulator</h4>';
    var pad = el("div", "pad");
    var opts = patterns.slice().sort(function (a, b) { return writeCount(b) - writeCount(a); })
      .map(function (p) { return '<option value="' + p.id + '"' + (p.id === state.patId ? " selected" : "") + '>#' + p.id + ' · ' + esc(p.name) + '</option>'; }).join("");
    pad.innerHTML =
      '<div class="simbar"><select id="simPat" class="search" style="flex:1">' + opts + '</select></div>' +
      '<div class="simctrl">' +
        '<button class="btn go sm" id="simRun">▶ Execute DAG</button>' +
        '<button class="btn ghost sm" id="simReset">Reset</button>' +
        '<label class="failtog"><input type="checkbox" id="simFail"' + (state.injectFail ? " checked" : "") + '/> Inject failure at step <select id="simFailStep"></select></label>' +
      '</div>' +
      '<div class="execdag" id="execDag"></div>' +
      '<div class="simlog" id="simLog"></div>';
    card.appendChild(pad);
    return card;
  }

  function paintSteps() {
    var host = document.getElementById("execDag"); if (!host) return;
    host.innerHTML = state.run.map(function (s) {
      var cls = "estep st-" + s.status;
      var badge = s.mutating ? '<span class="sg' + (s.highRisk ? " hr" : "") + '">' + (s.highRisk ? "HIGH-RISK WRITE" : "WRITE · ↺ SAGA") + '</span>'
        : '<span class="sg read">READ / NOTIFY</span>';
      var icon = { idle: "○", gated: "🔒", running: "◐", committed: "✓", failed: "✕", rolledback: "↺" }[s.status];
      return '<div class="' + cls + '"><span class="ei">' + icon + '</span>' +
        '<div class="ev"><span class="evn mono">' + esc(s.verb) + '</span>' + badge + '</div></div>';
    }).join("");
    // failstep options
    var sel = document.getElementById("simFailStep");
    if (sel && sel.options.length !== state.run.length) {
      sel.innerHTML = state.run.map(function (s, i) { return '<option value="' + (i + 1) + '"' + ((i + 1) === state.failStep ? " selected" : "") + '>' + (i + 1) + '</option>'; }).join("");
    }
  }

  function log(msg, kind) {
    var l = document.getElementById("simLog"); if (!l) return;
    var row = el("div", "logrow" + (kind ? " " + kind : ""), msg);
    l.appendChild(row); l.scrollTop = l.scrollHeight;
  }

  function execute() {
    state.run = buildRun();
    paintSteps();
    document.getElementById("simLog").innerHTML = "";
    var mode = MODES[state.mode];
    log("Mode: <b>" + mode.label + "</b> — " + (state.mode === "assisted" ? "all steps queued for human approval" : state.mode === "policy" ? "low-risk steps auto-apply; high-risk gated" : "full closed-loop, attribution on"), "muted");

    var i = 0, committed = [];
    function next() {
      if (i >= state.run.length) { log("✓ DAG complete — outcome attribution recording.", "ok"); return; }
      var s = state.run[i];
      if (s.status === "gated") {
        log("🔒 Step " + (i + 1) + " <b>" + s.verb + "</b> — awaiting human approval (" + mode.label + ")", "gate");
        i++; return setTimeout(next, 420);
      }
      s.status = "running"; paintSteps();
      setTimeout(function () {
        var willFail = state.injectFail && (i + 1) === state.failStep;
        if (willFail) {
          s.status = "failed"; paintSteps();
          log("✕ Step " + (i + 1) + " <b>" + s.verb + "</b> FAILED (ERP record locked / API error)", "err");
          return rollback(committed);
        }
        s.status = "committed"; paintSteps();
        if (s.compensable) committed.push(s);
        log((s.mutating ? "✓ Committed: " : "✓ Done: ") + "<b>" + s.verb + "</b>" + (s.mutating ? " (compensating step registered)" : ""), "ok");
        i++; setTimeout(next, 520);
      }, 560);
    }
    next();
  }

  // Saga: on failure, compensate previously-committed writes in reverse order.
  function rollback(committed) {
    if (!committed.length) { log("No prior writes to compensate. System consistent. SAP untouched beyond the failed call.", "muted"); return; }
    log("↺ Saga triggered — rolling back " + committed.length + " committed write(s) in reverse:", "warn");
    var k = committed.length - 1;
    (function undo() {
      if (k < 0) { log("↺ Rollback complete — ledger restored to pre-DAG state. No partial execution, no corruption.", "warn"); return; }
      var s = committed[k];
      s.status = "rolledback"; paintSteps();
      log("   ↺ Compensated: <b>" + s.verb + "</b>", "warn");
      k--; setTimeout(undo, 480);
    })();
  }

  /* ---- governance guarantees ---- */
  function guaranteesCard() {
    var wrap = el("div");
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">⊕</span>Enterprise-Grade Governance</h4>';
    var pad = el("div", "pad");
    var G = [
      ["↺", "Saga Pattern", "Every multi-step DAG has compensating transactions. Step 3 fails → steps 2 & 1 auto-rollback. Try it in the simulator."],
      ["⟳", "Idempotent Retry", "Locked ERP records trigger wait-and-retry, not failure. Re-running a step never double-posts."],
      ["⊕", "System of Record", "SAP / Oracle remains the system of record — always. The AI operates strictly within ERP boundaries."],
      ["⊘", "No Hallucination", "Deterministic, versioned API blocks — not generated code. The AI never touches the ERP without governance."],
    ];
    pad.innerHTML = '<div class="guars">' + G.map(function (g) {
      return '<div class="guar"><div class="gi">' + g[0] + '</div><div><div class="gn">' + g[1] + '</div><div class="gd">' + esc(g[2]) + '</div></div></div>';
    }).join("") + '</div>';
    card.appendChild(pad);
    wrap.appendChild(card);

    // current-mode characteristics
    var m = MODES[state.mode];
    var mc = el("div", "card"); mc.style.marginTop = "18px";
    mc.innerHTML = '<h4><span class="num" style="background:' + m.color + '">' + m.tag.charAt(0) + '</span>' + m.label + ' Mode</h4>' +
      '<div class="pad"><ul class="modelist">' + m.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join("") + '</ul></div>';
    wrap.appendChild(mc);
    return wrap;
  }

  /* ---- controls ---- */
  function wireControls(root) {
    root.querySelector(".modetabs").onclick = function (e) {
      var b = e.target.closest("[data-mode]"); if (!b) return;
      state.mode = b.dataset.mode;
      render(document.getElementById("view"));
    };
    document.getElementById("simPat").onchange = function () { state.patId = +this.value; state.run = buildRun(); paintSteps(); document.getElementById("simLog").innerHTML = ""; };
    document.getElementById("simRun").onclick = execute;
    document.getElementById("simReset").onclick = function () { state.run = buildRun(); paintSteps(); document.getElementById("simLog").innerHTML = ""; };
    document.getElementById("simFail").onchange = function () { state.injectFail = this.checked; };
    var fs = document.getElementById("simFailStep");
    if (fs) fs.onchange = function () { state.failStep = +this.value; };
  }

  window.PIQ.modules.governance = { render: render };
})();
