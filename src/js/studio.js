/* Setup · Mission Control — Mission Builder
 * The SME's guided front door: Objective → Function → Process → Missions → Capabilities →
 * Patterns → Skills. Choosing a process pulls in ALL its participating missions (and their
 * capabilities) by default — the SME can then narrow scope. The in-scope capabilities
 * surface the union of matching patterns; selecting patterns assembles the union of
 * skills; configuring those skills hands off to Discover & Fit.
 *
 * Patterns are the unit of variation handling and dynamic skill sequencing;
 * the happy path (originalDAG) is the straight-through spine recorded for agentivisation.
 */
(function () {
  "use strict";
  var PRIO = window.PIQ.meta.priorityLegend;

  // step machine — Objective is the top-level business-outcome lens above Function
  var STEPS = ["Objective", "Function", "Process", "Missions", "Capabilities", "Patterns", "Skills"];
  var state = { step: 0 };

  // lucide-style objective icon names → emoji (no icon library is inlined)
  var THEME_ICONS = { "trending-up": "📈", "shield-alert": "🚨", "clock": "⏱️",
    "shield-check": "🛡️", "eye": "👁️" };
  function themeIcon(name) { return THEME_ICONS[name] || "◆"; }

  // Friendly short labels for the objective "Spans" badge (readable CFO-facing names).
  // Falls back to the taxonomy function's own short, then the raw id.
  var FN_SHORT = { o2c: "O2C", p2p: "P2P", r2r: "R2R", sc: "SC", tcm: "Treasury",
    icc: "GRC", fpa: "FP&A", tax: "Tax", tne: "T&E", h2r: "HR" };
  function fnShort(id) { return FN_SHORT[id] || (fnById(id) ? fnById(id).short : id); }

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function C() { return window.PIQ.composition; }
  function objective() { return window.PIQ.objective(); }
  function fnById(id) { return (window.PIQ.tax.functions || []).filter(function (f) { return f.id === id; })[0]; }

  /* resume at the furthest resolved step when re-entering the Mission Builder */
  function resumeStep() {
    var c = C();
    if (c.patternIds.length) return 6;
    if (c.capIds.length) return 5;
    if (c.missionIds.length) return 4;
    if (c.procId) return 3;
    if (c.fnId) return 2;
    if (c.objectiveId) return 1;
    return 0;
  }

  function render(view) {
    state.step = resumeStep();
    view.innerHTML = '<div class="studio"></div>';
    draw(view.querySelector(".studio"));
  }

  function draw(root) {
    root.innerHTML = "";
    root.appendChild(intro());
    root.appendChild(rail());
    var wrap = el("div", "st-work");
    var body = el("div", "st-body");
    wrap.appendChild(body);
    var sum = summaryCard();
    if (sum) wrap.appendChild(sum);
    root.appendChild(wrap);
    drawStep(body);
    if (window.PIQ.persistComposition) window.PIQ.persistComposition();
  }

  /* Mission control workspace — the always-on recap of every selection so far.
     Answers "what have I picked?" without leaving the current step. */
  function summaryCard() {
    var c = C(), f = window.PIQ.fn();
    if (!f && !objective()) return null;
    var p = proc();
    var missions = window.PIQ.missions();
    var caps = window.PIQ.capabilities();
    var pats = window.PIQ.selectedPatterns();
    var t = objective();

    var rows = [
      ["Objective", t && t.name],
      ["Function", f && f.name],
      ["Process", p && p.name]
    ].filter(function (x) { return x[1]; }).map(function (x) {
      return '<div class="sum-row"><span class="sum-k">' + x[0] + '</span>' +
        '<span class="sum-v">' + esc(x[1]) + '</span></div>';
    }).join("");

    rows += chipRow("Missions", missions.map(function (r) { return r.name; }));
    rows += chipRow("Capabilities", caps.map(function (o) { return o.name; }));

    var patBlock = "";
    if (pats.length) {
      var chips = pats.map(function (pt) {
        return '<span class="sum-chip">' + esc(pt.name) + (pt.sample ? ' <i>sample</i>' : '') + '</span>';
      }).join("");
      patBlock = '<div class="sum-row col"><span class="sum-k">Patterns <b>' + pats.length + '</b></span>' +
        '<div class="sum-chips">' + chips + '</div></div>';
    }

    var skillRow = "";
    var keys = Object.keys(c.skills);
    if (keys.length) {
      var nConf = keys.filter(function (k) { return c.skills[k].configured; }).length;
      skillRow = '<div class="sum-row"><span class="sum-k">Skills</span>' +
        '<span class="sum-v">' + nConf + ' / ' + keys.length + ' configured</span></div>';
    }

    var card = el("div", "st-summary",
      '<div class="sum-h"><span>Mission control workspace</span>' +
      (c.live ? '<span class="cr-live">● LIVE</span>' : '') + '</div>' +
      rows + patBlock + skillRow);
    return card;
  }

  function chipRow(label, names) {
    if (!names.length) return "";
    var chips = names.map(function (n) { return '<span class="sum-chip">' + esc(n) + '</span>'; }).join("");
    return '<div class="sum-row col"><span class="sum-k">' + label + ' <b>' + names.length + '</b></span>' +
      '<div class="sum-chips">' + chips + '</div></div>';
  }

  function intro() {
    return el("div", "st-intro",
      '<div><div class="kv">Setup · Mission Control</div>' +
      '<h2>Configure your mission control center</h2>' +
      '<p class="st-lede">Define the business objective, map to a function and process, select the missions to execute, ' +
      'configure capabilities and the skills that power them. The accelerator is function-agnostic — start anywhere.</p></div>' +
      '<button class="btn ghost sm" id="stReset">Start over</button>');
  }

  function rail() {
    var done = resumeStep();
    var r = el("div", "st-rail");
    r.innerHTML = STEPS.map(function (s, i) {
      var cls = i === state.step ? "on" : (i < done || isResolved(i) ? "done" : "");
      var reachable = i <= done;
      return '<button class="st-step ' + cls + '" data-i="' + i + '"' + (reachable ? "" : " disabled") + '>' +
        '<span class="st-dot">' + (isResolved(i) && i !== state.step ? "✓" : (i + 1)) + '</span>' +
        '<span class="st-name">' + s + '</span>' + chosen(i) + '</button>';
    }).join('<span class="st-sep"></span>');
    r.querySelectorAll(".st-step").forEach(function (b) {
      if (b.hasAttribute("disabled")) return;
      b.onclick = function () { state.step = +b.dataset.i; redraw(); };
    });
    return r;
  }

  function isResolved(i) {
    var c = C();
    return [!!c.objectiveId, !!c.fnId, !!c.procId, c.missionIds.length > 0, c.capIds.length > 0, c.patternIds.length > 0,
            Object.keys(c.skills).length > 0][i];
  }
  function chosen(i) {
    var c = C(), f = window.PIQ.fn(), t = objective();
    var label = "";
    if (i === 0 && t) label = t.name;
    else if (i === 1 && f) label = f.name;
    else if (i === 2 && f && c.procId) label = (proc() || {}).name;
    else if (i === 3 && c.missionIds.length) label = c.missionIds.length + " mission" + (c.missionIds.length > 1 ? "s" : "");
    else if (i === 4 && c.capIds.length) label = c.capIds.length + " capabilit" + (c.capIds.length > 1 ? "ies" : "y");
    else if (i === 5 && c.patternIds.length) label = c.patternIds.length + " selected";
    else if (i === 6 && Object.keys(c.skills).length) label = Object.keys(c.skills).length + " configured";
    return label ? '<small class="st-chose">' + esc(label) + '</small>' : "";
  }

  function proc() { var f = window.PIQ.fn(); return f && f.processes.filter(function (p) { return p.id === C().procId; })[0]; }

  /* re-derive scope when the mission / capability set changes.
     Capabilities default to every capability of the in-scope missions; patterns
     default to the union across those capabilities. Structural changes reset skills. */
  function syncCapabilities(keepCapSelection) {
    var c = C(), p = proc(); if (!p) return;
    var valid = [];
    p.missions.forEach(function (r) {
      if (c.missionIds.indexOf(r.id) < 0) return;
      (r.capabilities || []).forEach(function (o) { valid.push(o.id); });
    });
    if (keepCapSelection) {
      // drop capabilities whose mission was removed
      c.capIds = c.capIds.filter(function (id) { return valid.indexOf(id) >= 0; });
    } else {
      c.capIds = valid.slice();
    }
    syncPatterns();
  }
  function syncPatterns() {
    var c = C();
    c.patternIds = window.PIQ.capabilityPatternIds();
    c.skills = {};
  }

  function redraw() { draw(document.querySelector(".studio")); }

  /* ---------------- steps ---------------- */
  function drawStep(body) {
    if (state.step > 0) body.appendChild(backBtn());
    [stepObjective, stepFunction, stepProcess, stepMissions, stepCapabilities, stepPatterns, stepSkills][state.step](body);
    var rb = document.getElementById("stReset");
    if (rb) rb.onclick = function () { window.PIQ.resetComposition(); state.step = 0; redraw(); };
  }

  function backBtn() {
    var b = el("button", "btn ghost sm st-back", "← Back to " + STEPS[state.step - 1]);
    b.onclick = function () { state.step = Math.max(0, state.step - 1); redraw(); };
    return b;
  }

  function pickGrid(items, build, onPick, isSel) {
    var g = el("div", "pickgrid");
    items.forEach(function (it) {
      var card = el("div", "pickcard" + (isSel && isSel(it) ? " sel" : ""), build(it));
      card.onclick = function () { onPick(it); };
      g.appendChild(card);
    });
    return g;
  }

  /* Step 0 · Objective — the CFO-level outcome. Optional: spans functions, carries a
     compound KPI, and (when chosen) filters the function list to what it touches. */
  function stepObjective(body) {
    var c = C();
    var objectives = window.PIQ.tax.themes || [];
    body.appendChild(el("div", "st-q", "Which <b>business objective</b> are you pursuing?"));
    body.appendChild(el("p", "st-hint",
      "Objectives are the outcomes a CFO steers by — they span multiple functions and roll up to a compound KPI. " +
      "Pick one to focus the journey on the functions that move it, or skip straight to a function for a bottoms-up build."));
    var grid = pickGrid(objectives, function (t) {
      var on = c.objectiveId === t.id;
      var k = t.compoundKPI || {};
      var fns = (t.functionIds || []).map(fnShort).join(" · ");
      return '<div class="pc-ico" style="--ac:' + t.accent + '">' + themeIcon(t.icon) + '</div>' +
        '<div class="pc-main"><div class="pc-t">' + esc(t.name) + '</div>' +
        '<div class="pc-d">' + esc(t.tagline) + '</div></div>' +
        '<div class="pc-kpi"><span class="pck-n">' + esc(k.name) + '</span>' +
          '<span class="pck-v">' + esc(k.current) + ' <i>→</i> <b>' + esc(k.target) + '</b> ' + esc(k.unit) + '</span></div>' +
        '<div class="pc-meta">Spans <b>' + esc(fns) + '</b></div>' +
        (on ? '<div class="pc-on">✓</div>' : '');
    }, function (t) {
      if (c.objectiveId !== t.id) {
        c.objectiveId = t.id;
        // if the current function isn't in the objective, clear the downstream selection
        if (c.fnId && (t.functionIds || []).indexOf(c.fnId) < 0) {
          c.fnId = null; c.procId = null; c.missionIds = []; c.capIds = []; c.patternIds = []; c.skills = {};
        }
      }
      state.step = 1;
      redraw();
    }, function (t) { return c.objectiveId === t.id; });
    body.appendChild(grid);
    body.appendChild(nextBar("An objective is optional — a lens, not a gate",
      "Skip — go direct to function →", function () { c.objectiveId = null; state.step = 1; redraw(); }));
  }

  function stepFunction(body) {
    var c = C(), t = objective();
    if (t) {
      var k = t.compoundKPI || {};
      var banner = el("div", "st-themebar",
        '<div class="stt-ic" style="--ac:' + t.accent + '">' + themeIcon(t.icon) + '</div>' +
        '<div class="stt-main"><div class="stt-n">' + esc(t.name) + '</div>' +
        '<div class="stt-k">' + esc(k.name) + ' <b>' + esc(k.current) + ' → ' + esc(k.target) + ' ' + esc(k.unit) + '</b></div></div>' +
        '<button class="linkbtn" id="stChTheme">change objective</button>');
      body.appendChild(banner);
      banner.querySelector("#stChTheme").onclick = function () { state.step = 0; redraw(); };
    }
    body.appendChild(el("div", "st-q", t
      ? "Which <b>function</b> inside “" + esc(t.name) + "” does this objective map to?"
      : "Which <b>function</b> does this objective map to?"));
    // This accelerator is scoped to Order-to-Cash — the only function on offer.
    var funcs = window.PIQ.objectiveFunctions().filter(function (f) { return f.id === "o2c"; });
    var grid = pickGrid(funcs, function (f) {
      var on = C().fnId === f.id;
      return '<div class="pc-ico" style="--ac:' + f.accent + '">' + f.icon + '</div>' +
        '<div class="pc-main"><div class="pc-t">' + esc(f.name) +
        ' <span class="pc-tag">' + esc(f.short) + '</span></div>' +
        '<div class="pc-d">' + esc(f.tagline) + '</div></div>' +
        '<div class="pc-meta"><span class="pc-n">' + f.patternCount + '</span> patterns ' +
        '<span class="statusbadge ' + f.status + '">' + (f.status === "live" ? "Fully built" : "Sample") + '</span></div>' +
        (on ? '<div class="pc-on">✓</div>' : '');
    }, function (f) {
      var c = C();
      if (c.fnId !== f.id) { c.fnId = f.id; c.procId = null; c.missionIds = []; c.capIds = []; c.patternIds = []; c.skills = {}; }
      // auto-advance; a single-process function pre-selects it — UNLESS it carries a
      // value-chain map, where the SME must pick a built area from the taxonomy matrix.
      var single = f.processes.length === 1 && !f.valueChain;
      if (single) { c.procId = f.processes[0].id; selectAllMissions(); }
      state.step = single ? 3 : 2;
      redraw();
    });
    body.appendChild(grid);
  }

  // a process participates through its full set of missions — select them all
  function selectAllMissions() {
    var c = C(), p = proc(); if (!p) return;
    c.missionIds = p.missions.map(function (r) { return r.id; });
    syncCapabilities(false);
  }

  function stepProcess(body) {
    var f = window.PIQ.fn(); if (!f) { state.step = 1; return redraw(); }
    var c = C();
    // Functions that carry a value-chain map (O2C) present the full process
    // taxonomy; only the built areas are navigable. Others use the card list.
    if (f.valueChain) return stepProcessMatrix(body, f, c);

    body.appendChild(el("div", "st-q", "Which <b>process</b> inside " + esc(f.name) + "?"));
    body.appendChild(pickGrid(f.processes, function (p) {
      var on = c.procId === p.id;
      return '<div class="pc-main"><div class="pc-t">' + esc(p.name) + '</div>' +
        '<div class="pc-d">' + esc(p.desc) + '</div></div>' +
        '<div class="pc-meta">' + p.missions.length + ' missions</div>' + (on ? '<div class="pc-on">✓</div>' : '');
    }, function (p) {
      if (c.procId !== p.id) { c.procId = p.id; selectAllMissions(); }  // all missions participate by default
      redraw();   // stay on the Process tab and reveal its hierarchy
    }, function (p) { return c.procId === p.id; }));

    var p = proc();
    if (p) {
      body.appendChild(hierarchy(f, p));
      body.appendChild(swimlane(f, p));
      body.appendChild(nextBar(p.missions.length + " mission" + (p.missions.length !== 1 ? "s" : "") + " mapped",
        "Continue → Missions", function () { state.step = 3; redraw(); }));
    }
  }

  /* O2C process selection — objective-aware. When a business objective is chosen,
     the processes it makes relevant are spotlighted and the rest dimmed (still
     selectable). The full L1–L4 value-chain landscape is shown below for context. */
  function stepProcessMatrix(body, f, c) {
    var obj = objective();
    var relevant = window.PIQ.objectiveProcessIds();
    var relSet = {}; relevant.forEach(function (id) { relSet[id] = 1; });
    var driven = obj && relevant.length;
    var nRel = f.processes.filter(function (p) { return relSet[p.id]; }).length;

    if (driven) {
      body.appendChild(el("div", "st-q",
        "Processes for <b>" + esc(f.name) + "</b> — spotlighting <b>" + esc(obj.name) + "</b>"));
      body.appendChild(el("p", "st-hint",
        nRel + " of " + f.processes.length + " processes move this objective most. " +
        "Highlighted cards are the ones to compose first; the rest are dimmed but still selectable."));
    } else {
      body.appendChild(el("div", "st-q", "Which <b>process</b> inside " + esc(f.name) + "?"));
      body.appendChild(el("p", "st-hint",
        "Pick a business objective on the previous step to spotlight the processes that move it — or choose any process to compose it."));
    }

    var grid = el("div", "pickgrid proc-grid");
    f.processes.forEach(function (p) {
      var isRel = !!relSet[p.id];
      var caps = 0, pats = {};
      p.missions.forEach(function (m) {
        caps += (m.capabilities || []).length;
        (m.capabilities || []).forEach(function (cc) {
          (cc.patternIds || []).forEach(function (id) { pats[id] = 1; });
        });
      });
      var nPat = Object.keys(pats).length;
      var cls = "pickcard proc-card" + (c.procId === p.id ? " sel" : "") +
        (driven ? (isRel ? " relevant" : " dim") : "");
      var card = el("div", cls,
        '<div class="pc-main"><div class="pc-t">' + esc(p.name) +
          (driven && isRel ? ' <span class="relbadge">★ Relevant</span>' : '') + '</div>' +
        '<div class="pc-d">' + esc(p.desc) + '</div></div>' +
        '<div class="pc-meta">' + p.missions.length + ' missions · ' + caps + ' capabilities' +
          (nPat ? ' · <b>' + nPat + '</b> patterns' : ' · <span class="muted">no patterns yet</span>') + '</div>' +
        (c.procId === p.id ? '<div class="pc-on">✓</div>' : ''));
      card.onclick = function () {
        if (c.procId !== p.id) { c.procId = p.id; selectAllMissions(); }
        redraw();
      };
      grid.appendChild(card);
    });
    body.appendChild(grid);

    var p = proc();
    if (p) {
      body.appendChild(hierarchy(f, p));
      body.appendChild(swimlane(f, p));
      body.appendChild(nextBar('Selected: ' + p.name + ' · ' + p.missions.length +
        " mission" + (p.missions.length !== 1 ? "s" : "") + " mapped",
        "Continue → Missions", function () { state.step = 3; redraw(); }));
    } else {
      body.appendChild(nextBar("Pick a process to compose it", "", null));
    }

    // Full value-chain landscape (L1 → L4) for context; built areas remain clickable.
    body.appendChild(el("div", "st-subq",
      "Full " + esc(f.name) + " value-chain landscape <small>L1 → L4 · click a built area, or a map ⤢ to open its process map</small>"));
    body.appendChild(valueChainNode(f, c));
  }

  /* The L1 value chain › L2 groups › L3 process areas › L4 sub-processes.
     Built areas select their process; L4 items with a process map open it. */
  function valueChainNode(f, c) {
    var vc = f.valueChain, live = f.status === "live";
    var chain = el("div", "vc");
    chain.appendChild(el("div", "vc-l1", '<span class="vc-arrow">↔</span>' + esc(vc.name)));
    var groups = el("div", "vc-groups");
    vc.groups.forEach(function (g) {
      var gEl = el("div", "vc-group tone-" + g.tone);
      gEl.style.flex = g.areas.length;
      gEl.appendChild(el("div", "vc-ghead",
        esc(g.name) + (g.note ? ' <small>' + esc(g.note) + '</small>' : '')));
      var areas = el("div", "vc-areas");
      g.areas.forEach(function (a) {
        var built = !!a.built;
        var col = el("div", "vc-col" + (built ? " built" : "") +
          (built && c.procId === a.procId ? " sel" : ""));
        col.appendChild(el("div", "vc-area",
          '<span class="vc-lvl">L3</span>' + esc(a.name) +
          (built ? '<span class="vc-badge">' + (live ? "Built ✓" : "Sample ✓") + '</span>'
                 : '<span class="vc-badge ctx">Roadmap</span>')));
        var subs = el("div", "vc-subs");
        (a.sub || []).forEach(function (s) {
          var pm = window.PIQ.processMap;
          var hasMap = pm && pm.has(s);
          var sub = el("div", "vc-sub" + (hasMap ? " hasmap" : ""),
            '<span class="vc-lvl">L4</span>' + esc(s) +
            (hasMap ? '<span class="vc-map" title="View process map">⤢</span>' : ''));
          if (hasMap) { sub.onclick = function (ev) { ev.stopPropagation(); pm.open(s); }; }
          subs.appendChild(sub);
        });
        col.appendChild(subs);
        if (built) col.onclick = function () { pickBuiltArea(a); };
        areas.appendChild(col);
      });
      gEl.appendChild(areas);
      groups.appendChild(gEl);
    });
    chain.appendChild(groups);
    return chain;
  }

  function pickBuiltArea(a) {
    var c = C();
    if (c.procId !== a.procId) { c.procId = a.procId; selectAllMissions(); }
    redraw();   // reveal the selected process's L1–L4 tree + Continue bar
  }

  /* ---- Process map: swimlanes by mission across the cognitive spine ----
     One lane per in-scope mission; columns are the Sense → Diagnose → Decide → Act
     stages the accelerator runs. Each cell holds the skills that mission's
     patterns contribute in that stage, so the SME sees mission presence across the
     process (and where each mission's work is straight-through vs approval-gated). */
  var SWL_PHASES = [
    { name: "Sense", sub: "observe" }, { name: "Diagnose", sub: "analyse" },
    { name: "Decide", sub: "route" }, { name: "Act", sub: "execute" }
  ];
  var SWL_COLORS = ["#8e44ad", "#2980b9", "#16a085", "#d68910", "#c0392b", "#7c4dff", "#e0529c"];

  // classify a skill key into a cognitive stage (0..3), first match wins
  function phaseOf(key) {
    var t = " " + key.toLowerCase() + " ";
    if (/read|pull|scan|monitor|track|fingerprint|ingest|watch|extract|checklist|cross_ref|parse|measure|_history/.test(t)) return 0;
    if (/classif|score|detect|diagnos|match|decompose|test|determin|identif|assess|compar|comput|reconcile|trace|estimat|verif|evaluat|check|isolat|project|analyz|split|quantif|aggregat|overlay|_variance|age_/.test(t)) return 1;
    if (/decide|route|propose|assign|tier|flag|prioriti|bundle|recommend|escalat/.test(t)) return 2;
    return 3; // Act — post/clear/update/hold/notify/send/apply/… and anything else
  }

  // the in-scope pattern ids a single mission contributes
  function rolePatternIds(r) {
    var c = C(), out = [], seen = {};
    (r.capabilities || []).forEach(function (o) {
      if (c.capIds.indexOf(o.id) < 0) return;
      (o.patternIds || []).forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    });
    return out;
  }

  function shortBlock(label) {
    var s = String(label).split("(")[0].trim();
    return s.length > 24 ? s.slice(0, 23) + "…" : s;
  }

  var SWL_CAP = 5;   // chips shown per cell before "+N more"

  function swimlane(f, p) {
    var missions = window.PIQ.missions();
    var wrap = el("div", "swl-wrap");
    if (!missions.length) return wrap;
    var mode = state.swlMode || "happy";   // "happy" = straight-through spine, "all" = + variations

    var head = el("div", "swl-head");
    head.appendChild(el("div", "st-subq",
      "Process map <small>swimlanes by mission · Sense → Diagnose → Decide → Act · presence across the flow</small>"));
    var toggle = el("div", "swl-toggle",
      '<button class="swl-mode' + (mode === "happy" ? " on" : "") + '" data-m="happy">Happy path</button>' +
      '<button class="swl-mode' + (mode === "all" ? " on" : "") + '" data-m="all">All actions</button>');
    toggle.querySelectorAll(".swl-mode").forEach(function (b) {
      b.onclick = function () { state.swlMode = b.dataset.m; redraw(); };
    });
    head.appendChild(toggle);
    wrap.appendChild(head);

    var grid = el("div", "swl");
    grid.appendChild(el("div", "swl-corner", "Mission"));
    SWL_PHASES.forEach(function (ph, idx) {
      grid.appendChild(el("div", "swl-phase p" + idx,
        '<span class="swl-pn">' + ph.name + '</span><span class="swl-ps">' + ph.sub + '</span>' +
        (idx < 3 ? '<i class="swl-arr">→</i>' : '')));
    });

    missions.forEach(function (r, ri) {
      var skills = window.PIQ.collectSkills(rolePatternIds(r));
      if (mode === "happy") skills = skills.filter(function (b) { return b.source === "happy"; });
      var buckets = [[], [], [], []], seen = {};
      skills.forEach(function (b) {
        var ph = phaseOf(b.key), k = ph + "|" + b.label;
        if (seen[k]) return; seen[k] = 1;
        buckets[ph].push(b);
      });
      var present = buckets.filter(function (x) { return x.length; }).length;
      var rc = SWL_COLORS[ri % SWL_COLORS.length];

      var pers = window.PIQ.personas(r);
      var roleEl = el("div", "swl-role",
        '<span class="swl-dot" style="background:' + rc + '"></span>' +
        '<span class="swl-rt"><b>' + esc(r.name) + '</b>' +
        (pers.accountable.role ? '<em class="swl-own">' + esc(pers.accountable.role) + '</em>' : '') +
        '<small>' + present + ' of 4 stages</small></span>');
      roleEl.style.setProperty("--rc", rc);
      grid.appendChild(roleEl);

      buckets.forEach(function (cell, idx) {
        var c = el("div", "swl-cell p" + idx + (cell.length ? "" : " empty"));
        c.style.setProperty("--rc", rc);
        if (!cell.length) { c.innerHTML = '<span class="swl-none">—</span>'; grid.appendChild(c); return; }
        cell.forEach(function (b, bi) {
          var fit = window.PIQ.fitment(b);
          var chip = el("span", "swl-chip f-" + fit.mode + (bi >= SWL_CAP ? " swl-hide" : ""),
            esc(shortBlock(b.label)));
          chip.title = b.label + " — " + fit.tier + " · used by " + b.patterns.length +
            " pattern" + (b.patterns.length !== 1 ? "s" : "");
          c.appendChild(chip);
        });
        if (cell.length > SWL_CAP) {
          var more = el("button", "swl-more", "+" + (cell.length - SWL_CAP) + " more");
          more.onclick = function () {
            c.querySelectorAll(".swl-hide").forEach(function (x) { x.classList.remove("swl-hide"); });
            more.remove();
          };
          c.appendChild(more);
        }
        grid.appendChild(c);
      });
    });
    wrap.appendChild(grid);

    wrap.appendChild(el("div", "swl-legend",
      '<span class="swl-lg"><i class="lg-auto"></i>Straight-through</span>' +
      '<span class="swl-lg"><i class="lg-hitl"></i>Approval-gated</span>' +
      '<span class="swl-lgn">' +
      (mode === "happy" ? "Happy-path spine — the straight-through flow. Switch to All actions for exception handling."
                        : "All skills incl. variation handling. Hover a chip for detail.") +
      '</span>'));
    return wrap;
  }

  /* L1–L4 process-hierarchy tree: Function › Process › Mission › Capability.
     Hovering a mission (L3) reveals its detail card. */
  function hierarchy(f, p) {
    var wrap = el("div", "phier-wrap");
    wrap.appendChild(el("div", "st-subq", "Process hierarchy <small>L1 → L4 · hover a mission for detail</small>"));
    var tree = el("div", "phier");
    tree.appendChild(node(1, f.name, f.icon));
    var l2 = el("div", "ph-children");
    l2.appendChild(node(2, p.name));
    var l3 = el("div", "ph-children");
    p.missions.forEach(function (r) {
      var branch = el("div", "ph-branch");
      branch.appendChild(missionNode(r));
      var l4 = el("div", "ph-children");
      (r.capabilities || []).forEach(function (o) { l4.appendChild(node(4, o.name, null, o.kpi)); });
      branch.appendChild(l4);
      l3.appendChild(branch);
    });
    l2.appendChild(l3);
    tree.appendChild(l2);
    wrap.appendChild(tree);
    return wrap;
  }

  function node(lvl, name, icon, sub) {
    return el("div", "ph-node l" + lvl,
      '<span class="ph-lvl">L' + lvl + '</span>' +
      (icon ? '<span class="ph-ico">' + icon + '</span>' : '') +
      '<span class="ph-nm">' + esc(name) + '</span>' +
      (sub ? '<small class="ph-sub">' + esc(sub) + '</small>' : ''));
  }

  function missionNode(r) {
    var s = missionStats(r);
    return el("div", "ph-node l3 persona",
      '<span class="ph-lvl">L3</span><span class="ph-nm">' + esc(r.name) + '</span>' +
      '<small class="ph-sub">' + r.capabilities.length + ' cap · ' + s.patterns + ' patterns</small>' +
      missionPop(r, s));
  }

  // derive a mission's scope from its capabilities' patterns → skills → fitment
  function missionStats(r) {
    var ids = {}, out = [];
    (r.capabilities || []).forEach(function (o) {
      (o.patternIds || []).forEach(function (id) { if (!ids[id]) { ids[id] = 1; out.push(id); } });
    });
    var skills = window.PIQ.collectSkills(out);
    var auto = 0, hitl = 0;
    skills.forEach(function (b) { (window.PIQ.fitment(b).mode === "auto" ? auto++ : hitl++); });
    return { patterns: out.length, skills: skills.length, auto: auto, hitl: hitl };
  }

  /* ---- Mission persona map (RACI) --------------------------------------
     "Who holds this mission?" — accountable owner, the roles that operate it,
     the approvers the HITL gates actually name, and who is consulted. */
  function ownerChip(pers) {
    if (!pers.accountable.role) return "";
    return '<span class="pc-persona"><i class="rav">' + esc(pers.accountable.initials) + '</i>' +
      esc(pers.accountable.role) + '</span>';
  }
  function roleChips(list) {
    if (!list || !list.length) return '<span class="rchip none">—</span>';
    return list.map(function (x) { return '<span class="rchip">' + esc(x) + '</span>'; }).join("");
  }
  function raciBlock(r) {
    var p = window.PIQ.personas(r);
    var rows = [
      ["Accountable", p.accountable.role ? [p.accountable.role] : [], "a"],
      ["Operates", p.responsible, "r"],
      ["Approves", p.approvers, "x"],
      ["Consulted", p.consulted, "c"],
    ].map(function (row) {
      return '<div class="raci-row"><span class="raci-lab ' + row[2] + '">' + row[0] + '</span>' +
        '<span class="raci-roles">' + roleChips(row[1]) + '</span></div>';
    }).join("");
    return '<div class="raci">' + rows + '</div>';
  }

  /* All missions × their holders in one table — the at-a-glance answer, so an
     SME never has to hover each card to find out who owns what. */
  function personaMatrix(p) {
    var wrap = el("div", "pmx-wrap");
    wrap.appendChild(el("div", "st-subq",
      "Mission persona map <small>who holds each mission · accountable owner, operating roles and the approvers the HITL gates name</small>"));
    var t = el("div", "pmx");
    t.appendChild(el("div", "pmx-h",
      '<span>Mission</span><span>Accountable</span><span>Operates</span><span>Approves</span><span>Cadence</span>'));
    p.missions.forEach(function (r) {
      var pers = window.PIQ.personas(r);
      var inScope = C().missionIds.indexOf(r.id) >= 0;
      t.appendChild(el("div", "pmx-r" + (inScope ? "" : " off"),
        '<span class="pmx-m">' + esc(r.name) + '</span>' +
        '<span class="pmx-a">' + (pers.accountable.role
          ? '<i class="rav">' + esc(pers.accountable.initials) + '</i>' + esc(pers.accountable.role)
          : '—') + '</span>' +
        '<span class="pmx-c">' + roleChips(pers.responsible) + '</span>' +
        '<span class="pmx-c">' + roleChips(pers.approvers) + '</span>' +
        '<span class="pmx-cd">' + esc(pers.cadence || "—") + '</span>'));
    });
    wrap.appendChild(t);
    return wrap;
  }

  function missionPop(r, s) {
    var total = (s.auto + s.hitl) || 1;
    var autoPct = Math.round(s.auto / total * 100);
    var caps = (r.capabilities || []).map(function (o) {
      return '<li><b>' + esc(o.name) + '</b><span>' + esc(o.kpi) + '</span></li>';
    }).join("");
    return '<div class="persona-pop">' +
      '<div class="pp-h">' + esc(r.name) + '</div>' +
      '<div class="pp-lab">Who holds this mission</div>' + raciBlock(r) +
      '<div class="pp-lab">Capabilities</div><ul class="pp-objs">' + caps + '</ul>' +
      '<div class="pp-stats"><div><b>' + s.patterns + '</b><span>patterns</span></div>' +
      '<div><b>' + s.skills + '</b><span>skills</span></div></div>' +
      '<div class="pp-lab">Automation mix</div>' +
      '<div class="pp-mix"><div class="pp-bar"><i style="width:' + autoPct + '%"></i></div>' +
      '<span>' + s.auto + ' auto · ' + s.hitl + ' approval</span></div></div>';
  }

  /* Missions — multi-select, defaulting to every mission in the process. */
  function stepMissions(body) {
    var p = proc(); if (!p) { state.step = 2; return redraw(); }
    var c = C();
    body.appendChild(el("div", "st-q",
      "Select the <b>missions</b> for " + esc(p.name) +
      '<button class="linkbtn" id="stAllP">' + (c.missionIds.length === p.missions.length ? "clear all" : "select all") + '</button>'));
    body.appendChild(el("p", "st-hint",
      "Every mission in the process is included by default — the agents coordinate across all of them. Deselect any you want to leave out of scope."));
    body.appendChild(pickGrid(p.missions, function (r) {
      var on = c.missionIds.indexOf(r.id) >= 0;
      var caps = r.capabilities.map(function (o) { return o.name; }).join(" · ");
      var pers = window.PIQ.personas(r);
      var extra = window.PIQ.missionRoleCount(r) - 1;   // roles beyond the accountable owner
      return '<div class="pc-main"><div class="pc-t">' + esc(r.name) + '</div>' +
        '<div class="pc-d">' + esc(caps) + '</div></div>' +
        '<div class="pc-meta">' + ownerChip(pers) +
        (pers.cadence ? '<span class="pc-tag">' + esc(pers.cadence) + '</span>' : '') +
        '<span class="pc-sep">' + r.capabilities.length + ' capabilities</span>' +
        (extra > 0 ? '<span class="pc-sep">+' + extra + ' roles</span>' : '') + '</div>' +
        (on ? '<div class="pc-on">✓</div>' : '');
    }, function (r) { toggleMission(r); redraw(); },
       function (r) { return c.missionIds.indexOf(r.id) >= 0; }));
    body.appendChild(nextBar(c.missionIds.length + " mission" + (c.missionIds.length !== 1 ? "s" : "") + " in scope",
      c.missionIds.length ? "Choose capabilities →" : "", function () { state.step = 4; redraw(); }));
    // supplementary context below the sticky CTA, as the Process step does with its
    // value-chain landscape
    body.appendChild(personaMatrix(p));
    var all = document.getElementById("stAllP");
    if (all) all.onclick = function (e) {
      e.stopPropagation();
      c.missionIds = c.missionIds.length === p.missions.length ? [] : p.missions.map(function (r) { return r.id; });
      syncCapabilities(false); redraw();
    };
  }
  function toggleMission(r) {
    var c = C(), i = c.missionIds.indexOf(r.id);
    if (i >= 0) c.missionIds.splice(i, 1); else c.missionIds.push(r.id);
    syncCapabilities(false);   // re-derive capabilities + patterns for the new mission set
  }

  /* Capabilities — multi-select, grouped by mission, all in scope by default. */
  function stepCapabilities(body) {
    var c = C(), missions = window.PIQ.missions();
    if (!missions.length) { state.step = 3; return redraw(); }
    var allCapIds = [];
    missions.forEach(function (r) { (r.capabilities || []).forEach(function (o) { allCapIds.push(o.id); }); });
    body.appendChild(el("div", "st-q",
      "Which <b>capabilities</b> should the agents deliver?" +
      '<button class="linkbtn" id="stAllO">' + (c.capIds.length === allCapIds.length ? "clear all" : "select all") + '</button>'));
    body.appendChild(el("p", "st-hint",
      "Capabilities are grouped by mission. All are in scope by default; each maps to the KPI it moves and the patterns that deliver it."));
    missions.forEach(function (r) {
      body.appendChild(el("div", "obj-group-h", esc(r.name)));
      body.appendChild(pickGrid(r.capabilities, function (o) {
        var on = c.capIds.indexOf(o.id) >= 0;
        return '<div class="pc-main"><div class="pc-t">' + esc(o.name) + '</div>' +
          '<div class="pc-d">Measured by <b>' + esc(o.kpi) + '</b></div></div>' +
          '<div class="pc-meta"><span class="pc-n">' + o.patternCount + '</span> patterns</div>' +
          (on ? '<div class="pc-on">✓</div>' : '');
      }, function (o) { toggleCapability(o); redraw(); },
         function (o) { return c.capIds.indexOf(o.id) >= 0; }));
    });
    var np = c.patternIds.length;
    body.appendChild(nextBar(c.capIds.length + " capabilit" + (c.capIds.length !== 1 ? "ies" : "y") + " · " + np + " pattern" + (np !== 1 ? "s" : ""),
      c.capIds.length ? "Review patterns →" : "", function () { state.step = 5; redraw(); }));
    var all = document.getElementById("stAllO");
    if (all) all.onclick = function (e) {
      e.stopPropagation();
      c.capIds = c.capIds.length === allCapIds.length ? [] : allCapIds.slice();
      syncPatterns(); redraw();
    };
  }
  function toggleCapability(o) {
    var c = C(), i = c.capIds.indexOf(o.id);
    if (i >= 0) c.capIds.splice(i, 1); else c.capIds.push(o.id);
    syncPatterns();
  }

  function stepPatterns(body) {
    var c = C();
    var ids = window.PIQ.capabilityPatternIds(); if (!ids.length) { state.step = 4; return redraw(); }
    var pats = ids.map(window.PIQ.pattern).filter(Boolean);
    var p0 = proc();
    body.appendChild(el("div", "st-q",
      "Select the <b>patterns</b> to deploy for “" + esc(p0 ? p0.name : "this process") + "”" +
      '<button class="linkbtn" id="stAll">' + (c.patternIds.length === pats.length ? "clear all" : "select all") + '</button>'));
    body.appendChild(el("p", "st-hint",
      "Each pattern encodes the analyst's judgement: a happy path (straight-through) plus a branching DAG that handles the variations. " +
      "Tick the circle to add a pattern; click the card to open its detail and customise the happy-path DAG."));

    var grid = el("div", "patgrid");
    pats.forEach(function (p) {
      var sel = c.patternIds.indexOf(p.id) >= 0;
      var branches = (p.branchingDAG || []).length;
      var gates = (p.hitlGates || []).length;
      var happy = window.PIQ.happyDAG(p.id);
      var custom = window.PIQ.dagCustomised(p.id);
      var flow = happy.slice(0, 4).map(function (s) { return '<span class="mini-b">' + esc(window.PIQ.prettify(s)) + '</span>'; }).join('<i>→</i>');
      var card = el("div", "patcard" + (sel ? " sel" : ""),
        '<div class="pat-top"><span class="pat-prio" style="background:' + PRIO[p.priority] + '"></span>' +
        '<div class="pat-n">' + esc(p.name) + (p.sample ? ' <span class="statusbadge sample">sample</span>' : '') +
          (custom ? ' <span class="dagbadge">✎ DAG edited</span>' : '') + '</div>' +
        '<button class="pat-check' + (sel ? " on" : "") + '" title="' + (sel ? "Remove from composition" : "Add to composition") + '">' + (sel ? "✓" : "+") + '</button></div>' +
        '<div class="pat-mm">“' + esc(trim(p.mentalModel, 150)) + '”</div>' +
        '<div class="pat-flow"><span class="flab">Happy path</span>' + (flow || '<span class="muted">no steps</span>') +
          (happy.length > 4 ? '<i>→</i><span class="mini-b more">+' + (happy.length - 4) + '</span>' : '') + '</div>' +
        '<div class="pat-foot"><span>' + branches + ' variation branches · ' +
          (gates ? '🔒 ' + gates + ' gate' + (gates > 1 ? "s" : "") : 'no gates') + '</span>' +
        '<span class="pat-cue">✎ details &amp; DAG</span></div>');
      card.onclick = function () { openPatternDetail(p); };
      card.querySelector(".pat-check").onclick = function (e) {
        e.stopPropagation();
        var i = c.patternIds.indexOf(p.id);
        if (i >= 0) c.patternIds.splice(i, 1); else c.patternIds.push(p.id);
        c.skills = {};   // selection changed → reconfigure
        redraw();
      };
      grid.appendChild(card);
    });
    body.appendChild(grid);
    body.appendChild(nextBar(c.patternIds.length + " pattern" + (c.patternIds.length !== 1 ? "s" : "") + " selected",
      c.patternIds.length ? "Configure skills →" : "", function () { state.step = 6; redraw(); }));

    var all = document.getElementById("stAll");
    if (all) all.onclick = function (e) {
      e.stopPropagation();
      c.patternIds = c.patternIds.length === pats.length ? [] : pats.map(function (p) { return p.id; });
      c.skills = {}; redraw();
    };
  }

  /* ---- Pattern detail + happy-path DAG editor (opened from a pattern card) --
     Shows the full pattern (mental model, 3-layer mapping, branching DAG, gates)
     and lets the SME reorder / enable-disable the happy-path steps. Edits persist
     into PIQ.composition.dag and flow through collectSkills → swimlane, the
     skill configurator, Fitment and Runtime. */
  function layer(n, title, desc, extra) {
    return '<div class="dlayer"><div class="lh"><span class="ln">' + n + '</span>' + title + '</div>' +
      '<div class="ld">' + desc + '</div>' + (extra || "") + '</div>';
  }
  function pdlgEsc(e) { if (e.key === "Escape") closePatternDetail(); }
  function closePatternDetail() {
    var b = document.querySelector(".pdlg-back");
    if (b) { b.remove(); document.removeEventListener("keydown", pdlgEsc); redraw(); }
  }
  function openPatternDetail(p) {
    closePatternDetail();
    var back = el("div", "pdlg-back");
    var dlg = el("div", "pdlg");
    back.appendChild(dlg);
    back.addEventListener("mousedown", function (e) { if (e.target === back) closePatternDetail(); });
    document.addEventListener("keydown", pdlgEsc);
    document.body.appendChild(back);
    renderPatternDetail(dlg, p);
  }
  // materialise a per-pattern DAG override (seeded from the original) for editing
  function ensureDag(id) {
    var c = C(); if (!c.dag) c.dag = {};
    if (!c.dag[id]) c.dag[id] = { steps: window.PIQ.dagSteps(id).map(function (s) { return { k: s.k, on: s.on }; }) };
    return c.dag[id];
  }
  function afterDagEdit() { C().skills = {}; if (window.PIQ.persistComposition) window.PIQ.persistComposition(); }

  function renderPatternDetail(dlg, p) {
    var c = C();
    var sel = c.patternIds.indexOf(p.id) >= 0;
    var custom = window.PIQ.dagCustomised(p.id);
    var steps = window.PIQ.dagSteps(p.id);
    var onCount = steps.filter(function (s) { return s.on; }).length;

    var rows = steps.map(function (s, i) {
      var tag = s.added ? ' <span class="dstep-added">added</span>' : '';
      var rm = s.added ? '<button class="dstep-rm" data-rm="' + i + '" title="Remove skill">✕</button>' : '';
      return '<div class="dstep' + (s.on ? "" : " off") + (s.added ? " added" : "") + '">' +
        '<div class="dstep-ord">' +
          '<button data-mv="-1" data-i="' + i + '"' + (i === 0 ? " disabled" : "") + '>↑</button>' +
          '<button data-mv="1" data-i="' + i + '"' + (i === steps.length - 1 ? " disabled" : "") + '>↓</button></div>' +
        '<span class="dstep-n">' + (i + 1) + '</span>' +
        '<div class="dstep-k mono">' + esc(window.PIQ.prettify(s.k)) + tag + '</div>' +
        '<button class="dstep-tog' + (s.on ? " on" : "") + '" data-tog="' + i + '">' + (s.on ? "On" : "Off") + '</button>' + rm +
      '</div>';
    }).join("");

    var prev = window.PIQ.happyDAG(p.id).map(function (s) {
      return '<span class="mini-b">' + esc(window.PIQ.prettify(s)) + '</span>'; }).join('<i>→</i>')
      || '<span class="muted">no steps enabled</span>';

    var branches = (p.branchingDAG || []).map(function (b) {
      var verbs = (b.actions || []).map(function (a) { return '<span class="verb">' + esc(a) + '</span>'; }).join("");
      var hitl = b.hitl ? '<div class="b-hitl">🔒 HITL: ' + esc(b.hitl) + '</div>' : "";
      return '<div class="branch t-' + b.tier + '"><div class="b-cond mono">' + esc(b.condition) + '</div>' +
        '<div class="b-acts">' + verbs + '</div>' + hitl + '</div>';
    }).join("");

    dlg.innerHTML =
      '<div class="pdlg-head"><div class="pnum lg" style="background:' + PRIO[p.priority] + '">' + p.id + '</div>' +
      '<div class="pdlg-ht"><h2>' + esc(p.name) + (p.sample ? ' <span class="statusbadge sample">sample</span>' : '') + '</h2>' +
      '<div class="pdlg-cat">' + esc(p.category) + '</div></div>' +
      '<span class="badge" style="background:' + PRIO[p.priority] + '">' + p.priority + '</span>' +
      '<span class="badge ghost mono">' + esc(p.layer3_feature) + '</span>' +
      '<button class="pdlg-x" id="pdlgClose" title="Close">✕</button></div>' +

      '<div class="pdlg-body">' +
      '<div class="mental">“' + esc(p.mentalModel) + '”<span class="who">— the analyst\'s mental model</span></div>' +
      '<div class="d-grid">' +
        layer("1", "Logical Mapping", esc(p.layer1_logicalMapping), "") +
        layer("2", "Event Series", esc(p.layer2_eventSeries), "") +
        layer("3", "AI Feature", '<b>' + esc(p.layer3_feature) + '</b> — pre-calculated trigger', "") +
      '</div>' +

      '<div class="dedit"><div class="dedit-h"><h4>Happy-path DAG ' +
        '<span class="muted">reorder & enable/disable — flows to Fitment &amp; Runtime</span></h4>' +
        (custom ? '<button class="linkbtn" id="dagReset">reset to default</button>' : '') + '</div>' +
        '<div class="dsteps">' + rows + '</div>' +
        '<div class="dadd"><input id="dagAddInput" class="dadd-in" autocomplete="off" ' +
          'placeholder="+ Add a skill — search the repository or type your own…"/>' +
          '<div class="dadd-list" id="dagAddList"></div></div>' +
        '<div class="dprev"><span class="flab">Resulting sequence <b>' + onCount + '/' + steps.length + '</b></span>' + prev + '</div>' +
      '</div>' +

      '<div class="d-sec"><h4>Branching DAG <span class="muted">variation handling · read-only</span></h4>' +
        '<div class="branches">' + (branches || '<span class="muted">none</span>') + '</div></div>' +
      (p.hitlGates && p.hitlGates.length ? '<div class="gatebar">🔒 HITL gates: ' + p.hitlGates.map(esc).join(" · ") + '</div>' : '') +
      '</div>' +

      '<div class="pdlg-foot"><span class="muted">' + (custom ? "✎ DAG customised for this composition" : "Default DAG") + '</span>' +
        '<div class="pdlg-actions">' +
        '<button class="btn ' + (sel ? "ghost" : "go") + ' sm" id="pdlgSel">' + (sel ? "Remove from composition" : "Add to composition") + '</button>' +
        '<button class="btn ghost sm" id="pdlgDone">Done</button></div></div>';

    dlg.querySelector("#pdlgClose").onclick = closePatternDetail;
    dlg.querySelector("#pdlgDone").onclick = closePatternDetail;
    dlg.querySelector("#pdlgSel").onclick = function () {
      var i = c.patternIds.indexOf(p.id);
      if (i >= 0) c.patternIds.splice(i, 1); else c.patternIds.push(p.id);
      c.skills = {};
      if (window.PIQ.persistComposition) window.PIQ.persistComposition();
      renderPatternDetail(dlg, p);
    };
    var rst = dlg.querySelector("#dagReset");
    if (rst) rst.onclick = function () { window.PIQ.resetDag(p.id); afterDagEdit(); renderPatternDetail(dlg, p); };
    dlg.querySelectorAll("[data-mv]").forEach(function (b) {
      b.onclick = function () {
        var d = ensureDag(p.id), i = +b.dataset.i, j = i + (+b.dataset.mv);
        if (j < 0 || j >= d.steps.length) return;
        var t = d.steps[i]; d.steps[i] = d.steps[j]; d.steps[j] = t;
        afterDagEdit(); renderPatternDetail(dlg, p);
      };
    });
    dlg.querySelectorAll("[data-tog]").forEach(function (b) {
      b.onclick = function () {
        var d = ensureDag(p.id); d.steps[+b.dataset.tog].on = !d.steps[+b.dataset.tog].on;
        afterDagEdit(); renderPatternDetail(dlg, p);
      };
    });
    dlg.querySelectorAll("[data-rm]").forEach(function (b) {
      b.onclick = function () {
        var d = ensureDag(p.id); d.steps.splice(+b.dataset.rm, 1);
        afterDagEdit(); renderPatternDetail(dlg, p);
      };
    });
    var addIn = dlg.querySelector("#dagAddInput");
    if (addIn) {
      addIn.oninput = function () { fillAddList(dlg, p); };
      addIn.onkeydown = function (e) {
        if (e.key === "Enter") {
          var v = addIn.value.trim();
          if (v) { addBlock(p.id, v.replace(/\s+/g, "_")); renderPatternDetail(dlg, p); focusAdd(dlg); }
        }
      };
    }
    fillAddList(dlg, p);
  }

  function focusAdd(dlg) { var i = dlg.querySelector("#dagAddInput"); if (i) i.focus(); }
  function addBlock(id, key) {
    key = (key || "").trim(); if (!key) return;
    ensureDag(id).steps.push({ k: key, on: true, added: true });
    afterDagEdit();
  }
  // populate the add-skill suggestion list from the repository, filtered by the search box
  function fillAddList(dlg, p) {
    var inp = dlg.querySelector("#dagAddInput"), list = dlg.querySelector("#dagAddList");
    if (!inp || !list) return;
    var typed = inp.value.trim(), q = typed.toLowerCase();
    var have = {}; window.PIQ.dagSteps(p.id).forEach(function (s) { have[s.k] = 1; });
    var repo = window.PIQ.actionRepository().filter(function (k) {
      return !have[k] && (!q || k.toLowerCase().indexOf(q) >= 0);
    });
    var html = repo.slice(0, 8).map(function (k) {
      return '<button class="dadd-opt" data-add="' + esc(k) + '">' + esc(window.PIQ.prettify(k)) + '</button>';
    }).join("");
    if (typed && repo.indexOf(typed.replace(/\s+/g, "_")) < 0) {
      html += '<button class="dadd-opt custom" data-add="' + esc(typed.replace(/\s+/g, "_")) + '">+ Add custom “' + esc(typed) + '”</button>';
    }
    list.innerHTML = html || '<span class="dadd-none">No matching skills — type a name to add your own.</span>';
    list.querySelectorAll("[data-add]").forEach(function (b) {
      b.onclick = function () { addBlock(p.id, b.dataset.add); renderPatternDetail(dlg, p); focusAdd(dlg); };
    });
  }

  /* ---- the configurator: the heart of the hand-off to Discover & Fit ---- */
  var TECHS = ["LLM Agent", "Email / SMTP", "SAP BAPI/RFC", "Oracle REST", "RPA Bot", "Workflow / BPM", "Webhook / API", "Data Query"];
  function defaultTech(block) {
    var t = block.key.toLowerCase();
    if (/email|smtp|notify|alert|comms/.test(t)) return "Email / SMTP";
    if (/sap|bsid|update_sap|dunning|toggle/.test(t)) return "SAP BAPI/RFC";
    if (/oracle|fusion/.test(t)) return "Oracle REST";
    if (/generate|narrative|propose|classif|estimate|assess/.test(t)) return "LLM Agent";
    if (/escalate|route|approv|review|case/.test(t)) return "Workflow / BPM";
    if (/post|clear|match|reconcile|raise|schedule/.test(t)) return "RPA Bot";
    if (/pull|read|scan|compute|track|fingerprint/.test(t)) return "Data Query";
    return "LLM Agent";
  }

  function stepSkills(body) {
    var c = C();
    if (!c.patternIds.length) { state.step = 5; return redraw(); }
    var skills = window.PIQ.collectSkills(c.patternIds);
    // seed config for any unconfigured skill
    skills.forEach(function (b) {
      if (!c.skills[b.key]) {
        var fit = window.PIQ.fitment(b);
        c.skills[b.key] = { mode: fit.mode, tech: defaultTech(b), configured: false };
      }
    });

    var happy = skills.filter(function (b) { return b.source === "happy"; });
    var vary = skills.filter(function (b) { return b.source !== "happy"; });
    body.appendChild(el("div", "st-q", "Configure the <b>skills</b>"));
    body.appendChild(el("p", "st-hint",
      "These are the atomic actions your selected patterns sequence. Happy-path skills are straight-through candidates; " +
      "variation skills fire only when a pattern's branch matches. Set the technology and execution mode for each."));

    body.appendChild(skillGroup("Happy path — straight-through spine", "happy", happy, c));
    body.appendChild(skillGroup("Variation handling — fires on pattern match", "vary", vary, c));

    var nConf = Object.keys(c.skills).filter(function (k) { return c.skills[k].configured; }).length;
    body.appendChild(nextBar(nConf + " / " + skills.length + " skills configured",
      "Send to Discover & Fit →", function () {
        // mark all touched; commit and advance stage
        skills.forEach(function (b) { c.skills[b.key].configured = true; });
        window.PIQ.go("fitment");
      }));
  }

  function skillGroup(title, kind, skills, c) {
    var g = el("div", "blkgroup k-" + kind);
    if (!skills.length) return g;
    g.appendChild(el("div", "blk-h", title + ' <span class="blk-c">' + skills.length + '</span>'));
    var list = el("div", "blklist");
    skills.forEach(function (b) {
      var cfg = c.skills[b.key];
      var fit = window.PIQ.fitment(b);
      var row = el("div", "blk" + (cfg.configured ? " done" : ""));
      var techOpts = TECHS.map(function (t) { return '<option' + (t === cfg.tech ? " selected" : "") + '>' + t + '</option>'; }).join("");
      row.innerHTML =
        '<div class="blk-tag k-' + kind + '"></div>' +
        '<div class="blk-main"><div class="blk-name">' + esc(b.label) + '</div>' +
        '<div class="blk-key mono">' + esc(b.key) + '</div>' +
        '<div class="blk-sub">used by ' + b.patterns.length + ' pattern' + (b.patterns.length > 1 ? "s" : "") + (b.hitl ? ' · <span class="blk-hitl">needs approval</span>' : '') + '</div></div>' +
        '<div class="blk-fit"><span class="fitchip f-' + fit.mode + '">' + fit.tier + '</span></div>' +
        '<select class="blk-tech" data-k="' + esc(b.key) + '">' + techOpts + '</select>' +
        '<div class="blk-mode" data-k="' + esc(b.key) + '">' +
          '<button class="mode' + (cfg.mode === "auto" ? " on" : "") + '" data-m="auto">Auto</button>' +
          '<button class="mode' + (cfg.mode === "hitl" ? " on" : "") + '" data-m="hitl">Approval</button></div>';
      list.appendChild(row);
    });
    g.appendChild(list);
    // wiring
    g.querySelectorAll(".blk-tech").forEach(function (s) {
      s.onchange = function () { c.skills[s.dataset.k].tech = s.value; c.skills[s.dataset.k].configured = true; markDone(s); };
    });
    g.querySelectorAll(".blk-mode").forEach(function (m) {
      m.onclick = function (e) {
        var b = e.target.closest("[data-m]"); if (!b) return;
        c.skills[m.dataset.k].mode = b.dataset.m; c.skills[m.dataset.k].configured = true;
        m.querySelectorAll(".mode").forEach(function (x) { x.classList.toggle("on", x === b); });
        markDone(m);
      };
    });
    return g;
  }
  function markDone(node) { var row = node.closest(".blk"); if (row) row.classList.add("done"); }

  function nextBar(label, cta, onNext) {
    var bar = el("div", "st-next");
    bar.innerHTML = '<span class="nx-label">' + esc(label) + '</span>' +
      (cta ? '<button class="btn go" id="stNext">' + esc(cta) + '</button>' : '');
    var b = bar.querySelector("#stNext"); if (b) b.onclick = onNext;
    return bar;
  }

  function trim(s, n) { s = s || ""; return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  window.PIQ.modules.studio = { render: render };
})();
