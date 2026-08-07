/* Setup · Mission Control — Transformation Builder
 * FIVE sections, built for executive consumption:
 *   Objective → Processes & KPIs → Persona Missions → Patterns → Action Chains.
 *
 * The Action Chains section carries the two chain types the data already models:
 *   Standard Action Chain — pattern.originalDAG, the straight-through happy path
 *                           (editable: reorder / switch blocks off)
 *   Dynamic Action Chain  — pattern.branchingDAG, the variation branches with
 *                           their conditions, HITL gates and escalation tiers
 *
 * The hierarchy is UNCHANGED in the model — Function, Capability and Skill are
 * still real levels, they are just no longer steps the SME clicks through:
 *   - Function is FIXED: this is an O2C-scoped accelerator, so it is context in
 *     the section header, not a choice. composition.fnId is still set.
 *   - Process becomes a read-mostly IMPACT MAP: the objective already declares
 *     which processes it moves (theme.processIds), so scope is derived and the
 *     SME only narrows it. Scope is a SET — composition.procIds.
 *   - Capability is AUTO-SCOPED (syncCapabilities), which is what the old step
 *     defaulted to anyway.
 *   - Skills are AUTO-CONFIGURED (autoConfigureSkills) because Fitment and the
 *     Build engine read those executors to validate. Per-skill overrides still
 *     live in Discover & Fit.
 *
 * A Mission is persona-owned; a Capability is a reusable KPI instrument.
 */
(function () {
  "use strict";
  var PRIO = window.PIQ.meta.priorityLegend;

  var STEPS = ["Objective", "Processes & KPIs", "Persona Missions", "Patterns", "Action Chains"];
  var S_OBJ = 0, S_PROC = 1, S_MIS = 2, S_PAT = 3, S_CHAIN = 4;
  var state = { step: 0 };
  var O2C = "o2c";   // this accelerator is Order-to-Cash scoped

  // lucide-style objective icon names → emoji (no icon library is inlined)
  var THEME_ICONS = { "trending-up": "📈", "shield-alert": "🚨", "clock": "⏱️",
    "shield-check": "🛡️", "eye": "👁️" };
  function themeIcon(name) { return THEME_ICONS[name] || "◆"; }

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function C() { return window.PIQ.composition; }
  function objective() { return window.PIQ.objective(); }
  function fnById(id) { return (window.PIQ.tax.functions || []).filter(function (f) { return f.id === id; })[0]; }

  /* Resume at the furthest resolved section. Processes, missions, patterns and
     chains all auto-derive from the objective, so once an objective is picked
     every later section is reachable. */
  function resumeStep() {
    var c = C();
    if (c.patternIds.length) return S_CHAIN;
    if (c.missionIds.length) return S_PAT;
    if ((c.procIds || []).length) return S_MIS;
    if (c.objectiveId) return S_PROC;
    return S_OBJ;
  }

  function render(view) {
    ensureFunction();
    state.step = resumeStep();
    view.innerHTML = '<div class="studio"></div>';
    draw(view.querySelector(".studio"));
  }

  /* The function is not a choice in this build — it is always Order-to-Cash.
     composition.fnId still carries it so every downstream module resolves. */
  function ensureFunction() {
    var c = C();
    if (c.fnId !== O2C) {
      c.fnId = O2C;
      if (!(c.procIds || []).length && !c.procId) { c.procIds = []; }
    }
  }

  function draw(root) {
    state.seen = Math.max(state.seen || 0, state.step);   // progress high-water mark
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
    if (window.PIQ.refreshNav) window.PIQ.refreshNav();
  }

  /* Mission control workspace — the always-on recap of every selection so far.
     Answers "what have I picked?" without leaving the current step. */
  /* The summary mirrors the five sections. Capability is deliberately not
     surfaced as a row — it is auto-scoped — but the KPIs it carries are, because
     the KPI is what the objective is actually measured on. */
  function summaryCard() {
    var c = C(), t = objective();
    if (!t && !(c.procIds || []).length) return null;
    var procs = window.PIQ.procs();
    var missions = window.PIQ.missions();
    var pats = window.PIQ.selectedPatterns();

    var rows = "";
    if (t) {
      var k = t.compoundKPI || {};
      rows += '<div class="sum-row"><span class="sum-k">Objective</span>' +
        '<span class="sum-v">' + esc(t.name) + '</span></div>';
      if (k.name) {
        rows += '<div class="sum-row"><span class="sum-k">Compound KPI</span>' +
          '<span class="sum-v">' + esc(k.name) + ' · ' + esc(k.current) + ' → ' + esc(k.target) +
          ' ' + esc(k.unit || "") + '</span></div>';
      }
    }
    rows += chipRow("Processes", procs.map(function (p) { return p.name; }));
    rows += chipRow("KPIs", scopeKpis().map(function (x) { return x.kpi; }));
    rows += chipRow("Missions", missions.map(function (r) {
      var pr = window.PIQ.personas(r);
      return pr.accountable.role ? r.name + " — " + pr.accountable.role : r.name;
    }));

    var patBlock = "";
    if (pats.length) {
      var chips = pats.map(function (pt) {
        return '<span class="sum-chip">' + esc(pt.name) + (pt.sample ? ' <i>sample</i>' : '') + '</span>';
      }).join("");
      patBlock = '<div class="sum-row col"><span class="sum-k">Patterns <b>' + pats.length + '</b></span>' +
        '<div class="sum-chips">' + chips + '</div></div>';
    }

    var chainRow = "";
    if (pats.length) {
      var ch = window.PIQ.chainCounts();
      chainRow = '<div class="sum-row"><span class="sum-k">Action chains</span>' +
        '<span class="sum-v">' + ch.standard + ' standard · ' + ch.dynamic + ' dynamic</span></div>';
    }

    return el("div", "st-summary",
      '<div class="sum-h"><span>Transformation workspace</span>' +
      (c.live ? '<span class="cr-live">● LIVE</span>' : '') + '</div>' +
      '<div class="sum-cap">Function · Order-to-Cash</div>' +
      rows + patBlock + chainRow);
  }

  /* Distinct KPIs across the in-scope capabilities — the measurement surface of
     the whole composition. Deduped by KPI name, keeping the first metric seen. */
  function scopeKpis() {
    var seen = {}, out = [];
    window.PIQ.missions().forEach(function (r) {
      (r.capabilities || []).forEach(function (o) {
        if (C().capIds.indexOf(o.id) < 0 || seen[o.kpi]) return;
        seen[o.kpi] = 1;
        out.push({ kpi: o.kpi, metric: o.metric || {}, capId: o.id, capName: o.name });
      });
    });
    return out;
  }

  function chipRow(label, names) {
    if (!names.length) return "";
    var chips = names.map(function (n) { return '<span class="sum-chip">' + esc(n) + '</span>'; }).join("");
    return '<div class="sum-row col"><span class="sum-k">' + label + ' <b>' + names.length + '</b></span>' +
      '<div class="sum-chips">' + chips + '</div></div>';
  }

  function intro() {
    return el("div", "st-intro",
      '<div><div class="kv">Setup — Order-to-Cash Transformation</div>' +
      '<h2>Compose the transformation</h2>' +
      '<p class="st-lede">Five sections: name the <b>objective</b>, see the <b>processes and KPIs</b> it moves, ' +
      'choose the <b>persona missions</b> that pursue it, review the <b>patterns</b> underneath, and compose the ' +
      '<b>action chains</b> — standard and dynamic — that execute it.</p></div>' +
      '<button class="btn ghost sm" id="stReset">Start over</button>');
  }

  function rail() {
    var done = resumeStep();
    var r = el("div", "st-rail");
    r.innerHTML = STEPS.map(function (s, i) {
      // everything auto-derives from the objective, so isResolved() alone would
      // tick every section at once — progress is the furthest section visited
      var cls = i === state.step ? "on" : (i < (state.seen || 0) ? "done" : "");
      var reachable = i <= done;
      /* name on top, chosen value beneath it — stacking the caption keeps all five
         sections on one line instead of wrapping "Action Chains" onto a second row */
      return '<button class="st-step ' + cls + '" data-i="' + i + '"' + (reachable ? "" : " disabled") + '>' +
        '<span class="st-dot">' + (isResolved(i) && i !== state.step ? "✓" : (i + 1)) + '</span>' +
        '<span class="st-txt"><span class="st-name">' + s + '</span>' + chosen(i) + '</span></button>';
    }).join('<span class="st-sep"></span>');
    r.querySelectorAll(".st-step").forEach(function (b) {
      if (b.hasAttribute("disabled")) return;
      b.onclick = function () { state.step = +b.dataset.i; redraw(); };
    });
    return r;
  }

  function isResolved(i) {
    var c = C();
    return [!!c.objectiveId, (c.procIds || []).length > 0, c.missionIds.length > 0,
            c.patternIds.length > 0, c.patternIds.length > 0][i];
  }
  function chosen(i) {
    var c = C(), t = objective(), label = "";
    var np = (c.procIds || []).length, nm = c.missionIds.length, npat = c.patternIds.length;
    if (i === S_OBJ && t) label = t.name;
    else if (i === S_PROC && np) label = np + " process" + (np > 1 ? "es" : "") + " · " + scopeKpis().length + " KPIs";
    else if (i === S_MIS && nm) label = nm + " mission" + (nm > 1 ? "s" : "");
    else if (i === S_PAT && npat) label = npat + " pattern" + (npat > 1 ? "s" : "");
    else if (i === S_CHAIN && npat) {
      var ch = window.PIQ.chainCounts();
      label = ch.standard + " std · " + ch.dynamic + " dyn";
    }
    return label ? '<small class="st-chose">' + esc(label) + '</small>' : "";
  }

  /* ---- scope re-derivation (each level defaults its descendants to "all in scope") ----
     objective → processes → missions → capabilities → patterns → skills */
  function syncProcesses() {
    C().procIds = window.PIQ.impactedProcs().map(function (p) { return p.id; });
    syncMissions();
  }
  function syncMissions() {
    var c = C(), valid = [];
    window.PIQ.procs().forEach(function (p) {
      (p.missions || []).forEach(function (r) { valid.push(r.id); });
    });
    c.missionIds = valid.slice();
    syncCapabilities(false);
  }
  function syncCapabilities(keepCapSelection) {
    var c = C(), valid = [];
    window.PIQ.procs().forEach(function (p) {
      (p.missions || []).forEach(function (r) {
        if (c.missionIds.indexOf(r.id) < 0) return;
        (r.capabilities || []).forEach(function (o) { valid.push(o.id); });
      });
    });
    c.capIds = keepCapSelection
      ? c.capIds.filter(function (id) { return valid.indexOf(id) >= 0; })
      : valid.slice();
    syncPatterns();
  }
  function syncPatterns() {
    var c = C();
    c.patternIds = window.PIQ.capabilityPatternIds();
    c.skills = {};
    autoConfigureSkills();
  }

  /* Skills are no longer a section the SME walks. Discover & Fit and the Build
     engine both read composition.skills to validate the chain, so derive a
     default executor for every skill the selected patterns contribute — the SME
     overrides individual ones in Discover & Fit. */
  function autoConfigureSkills() {
    var c = C();
    var blocks = window.PIQ.collectSkills(c.patternIds);
    var next = {};
    blocks.forEach(function (b) {
      var prev = c.skills[b.key];
      var fit = window.PIQ.fitment(b);
      next[b.key] = prev || { mode: fit.mode, tech: defaultTech(b), configured: true, auto: true };
    });
    c.skills = next;
  }

  // keep the primary process pointer aligned with the scope set
  function syncPrimaryProc() {
    var c = C();
    c.procId = (c.procIds && c.procIds.length) ? c.procIds[0] : null;
  }

  function redraw() { draw(document.querySelector(".studio")); }

  /* ---------------- steps ---------------- */
  function drawStep(body) {
    if (state.step > 0) body.appendChild(backBtn());
    [stepObjective, stepProcesses, stepMissions, stepPatterns, stepActionChains][state.step](body);
    var rb = document.getElementById("stReset");
    if (rb) rb.onclick = function () {
      window.PIQ.resetComposition(); ensureFunction(); state.step = 0; state.seen = 0; redraw();
    };
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

  /* Section 1 · Objective — the entry point and the only real decision here.
     The function is fixed (Order-to-Cash), so it is context in the header rather
     than a step. Picking an objective DERIVES the impacted processes, their
     missions, capabilities and patterns in one move. */
  function stepObjective(body) {
    var c = C();
    var objectives = window.PIQ.tax.themes || [];
    body.appendChild(el("div", "st-q",
      "Which <b>business objective</b> are we transforming? <span class=\"st-ctx\">Order-to-Cash</span>"));
    body.appendChild(el("p", "st-hint",
      "An objective is the outcome finance steers by. It rolls up to a compound KPI and already knows which " +
      "Order-to-Cash processes move it — choosing one scopes the whole transformation in a single step."));
    var grid = pickGrid(objectives, function (t) {
      var on = c.objectiveId === t.id;
      var k = t.compoundKPI || {};
      var np = impactedFor(t).length;
      return '<div class="pc-ico" style="--ac:' + t.accent + '">' + themeIcon(t.icon) + '</div>' +
        '<div class="pc-main"><div class="pc-t">' + esc(t.name) + '</div>' +
        '<div class="pc-d">' + esc(t.tagline) + '</div></div>' +
        '<div class="pc-kpi"><span class="pck-n">' + esc(k.name) + '</span>' +
          '<span class="pck-v">' + esc(k.current) + ' <i>→</i> <b>' + esc(k.target) + '</b> ' + esc(k.unit) + '</span></div>' +
        '<div class="pc-meta">Impacts <b>' + np + '</b> O2C process' + (np !== 1 ? "es" : "") + '</div>' +
        (on ? '<div class="pc-on">✓</div>' : '');
    }, function (t) { pickObjective(t); }, function (t) { return c.objectiveId === t.id; });
    body.appendChild(grid);

    if (c.objectiveId) {
      body.appendChild(nextBar(objective().name + " · " + (c.procIds || []).length + " processes impacted",
        "See processes & KPIs →", function () { state.step = S_PROC; redraw(); }));
    } else {
      body.appendChild(nextBar("Pick an objective to scope the transformation", "", null));
    }
  }

  // processes an objective would impact (before it is the selected one)
  function impactedFor(t) {
    var f = fnById(O2C); if (!f) return [];
    var ids = t.processIds || [];
    var hit = f.processes.filter(function (p) { return ids.indexOf(p.id) >= 0; });
    return hit.length ? hit : f.processes.slice();
  }

  function pickObjective(t) {
    var c = C();
    if (c.objectiveId === t.id) { state.step = S_PROC; return redraw(); }
    c.objectiveId = t.id;
    c.fnId = O2C;
    syncProcesses();      // → missions → capabilities → patterns → skills
    syncPrimaryProc();
    state.step = S_PROC;
    redraw();
  }

  /* Section 2 · Processes & KPIs — the impact map.
     Read-mostly by design: the objective already declares which O2C processes it
     moves, so the SME is not asked to choose again — they see the scope they just
     bought and can narrow it. Every process card carries the KPIs its capabilities
     are measured on, because the KPI is the thing the objective is graded against. */
  function stepProcesses(body) {
    var c = C(), f = window.PIQ.fn(), t = objective();
    if (!t) { state.step = S_OBJ; return redraw(); }
    if (!f) { ensureFunction(); f = window.PIQ.fn(); }
    var pool = window.PIQ.impactedProcs();
    if (!(c.procIds || []).length) { syncProcesses(); syncPrimaryProc(); }

    var k = t.compoundKPI || {};
    body.appendChild(el("div", "st-q",
      "What <b>" + esc(t.name) + "</b> moves <span class=\"st-ctx\">Order-to-Cash</span>"));
    body.appendChild(el("p", "st-hint",
      "These are the processes this objective runs through and the KPIs they are measured on. " +
      "All are in scope by default — switch one off to narrow the transformation."));

    if (k.name) {
      body.appendChild(el("div", "impact-kpi",
        '<div class="ik-l">Compound KPI</div>' +
        '<div class="ik-n">' + esc(k.name) + '</div>' +
        (k.formula ? '<div class="ik-f mono">' + esc(k.formula) + '</div>' : '') +
        '<div class="ik-v">' + esc(k.current) + ' <i>→</i> <b>' + esc(k.target) + '</b> ' +
          esc(k.unit || "") + '</div>'));
    }

    body.appendChild(pickGrid(pool, function (p) {
      var on = (c.procIds || []).indexOf(p.id) >= 0;
      var kpis = procKpis(p);
      var chips = kpis.slice(0, 4).map(function (x) {
        return '<span class="ik-chip">' + esc(x.kpi) + '</span>';
      }).join("") + (kpis.length > 4 ? '<span class="ik-chip more">+' + (kpis.length - 4) + '</span>' : '');
      var np = 0;
      (p.missions || []).forEach(function (r) {
        (r.capabilities || []).forEach(function (o) { np += (o.patternIds || []).length; });
      });
      return '<div class="pc-main"><div class="pc-t">' + esc(p.name) + '</div>' +
        '<div class="pc-d">' + esc(p.desc || "") + '</div></div>' +
        '<div class="ik-chips">' + chips + '</div>' +
        '<div class="pc-meta"><span class="pc-sep">' + (p.missions || []).length + ' missions</span>' +
          '<span class="pc-sep">' + kpis.length + ' KPIs</span>' +
          '<span class="pc-sep">' + np + ' patterns</span></div>' +
        (on ? '<div class="pc-on">✓</div>' : '');
    }, function (p) { toggleProcess(p); redraw(); },
       function (p) { return (c.procIds || []).indexOf(p.id) >= 0; }));

    var nm = window.PIQ.missions().length;
    body.appendChild(nextBar((c.procIds || []).length + " process" + ((c.procIds || []).length !== 1 ? "es" : "") +
      " in scope · " + scopeKpis().length + " KPIs · " + nm + " mission" + (nm !== 1 ? "s" : ""),
      (c.procIds || []).length ? "Choose persona missions →" : "",
      function () { state.step = S_MIS; redraw(); }));

    // Full L1–L4 landscape for orientation; L4 items with a process map open it.
    body.appendChild(el("div", "st-subq",
      "Full Order-to-Cash value-chain landscape <small>L1 → L4 · in-scope areas are highlighted · click a map ⤢ to open it</small>"));
    body.appendChild(valueChainNode(f, c));
  }

  // distinct KPIs under a process, with the metric that measures them
  function procKpis(p) {
    var seen = {}, out = [];
    (p.missions || []).forEach(function (r) {
      (r.capabilities || []).forEach(function (o) {
        if (seen[o.kpi]) return;
        seen[o.kpi] = 1;
        out.push({ kpi: o.kpi, metric: o.metric || {}, capId: o.id });
      });
    });
    return out;
  }

  function toggleProcess(p) {
    var c = C(), i = (c.procIds || []).indexOf(p.id);
    if (i >= 0) {
      if (c.procIds.length === 1) return;   // never empty the scope
      c.procIds.splice(i, 1);
    } else {
      c.procIds.push(p.id);
    }
    syncMissions();      // → capabilities → patterns → skills
    syncPrimaryProc();
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
          (built && (c.procIds || []).indexOf(a.procId) >= 0 ? " sel" : ""));
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

  /* Clicking a built L3 area toggles its process in or out of scope — the same
     action as the process cards above, so the landscape stays interactive. */
  function pickBuiltArea(a) {
    var c = C();
    if (!a.procId) return;
    var f = window.PIQ.fn(); if (!f) return;
    var p = f.processes.filter(function (x) { return x.id === a.procId; })[0];
    if (!p) return;
    toggleProcess(p);
    redraw();
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
  /* Collapse state, keyed per process so the three trees are independent and the
     state survives a redraw. Capabilities (L4) start closed — with nine missions
     the fully-open tree runs to several screens, and the useful default is to see
     the missions and open the one you care about. */
  function phOpen(key, dflt) {
    state.ph = state.ph || {};
    return state.ph[key] === undefined ? dflt : !!state.ph[key];
  }
  function phSet(key, v) { state.ph = state.ph || {}; state.ph[key] = v; }

  /* One collapsible branch: a caret, the node itself, and the children it hides. */
  function branch(nodeEl, childrenEl, key, dflt, countLabel) {
    var b = el("div", "ph-branch");
    var open = phOpen(key, dflt);
    var row = el("div", "ph-row");
    var tog = el("button", "ph-tog" + (open ? " on" : ""), open ? "▾" : "▸");
    tog.setAttribute("aria-expanded", open ? "true" : "false");
    tog.title = (open ? "Collapse " : "Expand ") + (countLabel || "");
    row.appendChild(tog);
    row.appendChild(nodeEl);
    b.appendChild(row);
    if (!open) childrenEl.classList.add("ph-hide");
    b.appendChild(childrenEl);
    tog.onclick = function (e) {
      e.stopPropagation();
      var nowOpen = childrenEl.classList.contains("ph-hide");
      childrenEl.classList.toggle("ph-hide", !nowOpen);
      tog.textContent = nowOpen ? "▾" : "▸";
      tog.classList.toggle("on", nowOpen);
      tog.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      phSet(key, nowOpen);
    };
    return b;
  }

  function hierarchy(f, p) {
    var wrap = el("div", "phier-wrap");
    var nCap = 0;
    p.missions.forEach(function (r) { nCap += (r.capabilities || []).length; });

    var head = el("div", "phier-head",
      '<div class="st-subq">Process hierarchy <small>L1 → L4 · ' + p.missions.length + ' missions · ' +
      nCap + ' capabilities · hover a mission for detail</small></div>' +
      '<div class="phier-ctl"><button class="linkbtn" data-all="1">expand all</button>' +
      '<span class="phier-sep">·</span><button class="linkbtn" data-all="0">collapse all</button></div>');
    wrap.appendChild(head);

    var tree = el("div", "phier");

    /* L3 missions, each hiding its own L4 capabilities */
    var l3 = el("div", "ph-children");
    p.missions.forEach(function (r) {
      var caps = r.capabilities || [];
      var l4 = el("div", "ph-children");
      caps.forEach(function (o) { l4.appendChild(node(4, o.name, null, o.kpi)); });
      if (!caps.length) {
        // nothing to open — a spacer keeps it aligned with its caret-bearing siblings
        var leaf = el("div", "ph-branch");
        var row = el("div", "ph-row");
        row.appendChild(el("span", "ph-tog blank", ""));
        row.appendChild(missionNode(r));
        leaf.appendChild(row);
        l3.appendChild(leaf);
        return;
      }
      l3.appendChild(branch(missionNode(r), l4, p.id + "|" + r.id, false,
        caps.length + " capabilities"));
    });

    /* L2 process, hiding the mission list */
    var l2 = el("div", "ph-children");
    l2.appendChild(branch(node(2, p.name), l3, p.id + "|L2", true, p.missions.length + " missions"));

    /* L1 function, hiding everything below */
    tree.appendChild(branch(node(1, f.name, f.icon), l2, p.id + "|L1", true, "the process"));
    wrap.appendChild(tree);

    head.querySelectorAll("[data-all]").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var want = btn.dataset.all === "1";
        wrap.querySelectorAll(".ph-branch > .ph-children").forEach(function (kids) {
          kids.classList.toggle("ph-hide", !want);
        });
        wrap.querySelectorAll(".ph-tog").forEach(function (t) {
          t.textContent = want ? "▾" : "▸";
          t.classList.toggle("on", want);
          t.setAttribute("aria-expanded", want ? "true" : "false");
        });
        phSet(p.id + "|L1", want); phSet(p.id + "|L2", want);
        p.missions.forEach(function (r) { phSet(p.id + "|" + r.id, want); });
      };
    });
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

  /* Section 3 · Persona Missions — the accountability layer.
     Grouped by the process they belong to, because scope now spans several. Each
     card names the persona who HOLDS the mission and its contribution weight to
     the objective, so an SME narrowing scope can see what they would give up.
     All missions are in scope by default; deselecting re-derives capabilities,
     patterns and skills. */
  function stepMissions(body) {
    var c = C(), procs = window.PIQ.procs();
    if (!procs.length) { state.step = S_PROC; return redraw(); }
    var pool = [];
    procs.forEach(function (p) { (p.missions || []).forEach(function (r) { pool.push(r); }); });
    if (!pool.length) { state.step = S_PROC; return redraw(); }

    body.appendChild(el("div", "st-q",
      "Which <b>persona missions</b> pursue this objective?" +
      '<button class="linkbtn" id="stAllP">' +
      (c.missionIds.length === pool.length ? "clear all" : "select all") + '</button>'));
    body.appendChild(el("p", "st-hint",
      "A mission is a unit of accountability owned by one persona. Contribution is how much of the objective " +
      "this mission carries — weighted by the KPI movement it promises and the patterns it has to get there."));

    var weights = missionWeightsOverPool(pool);
    procs.forEach(function (p) {
      var ms = (p.missions || []);
      if (!ms.length) return;
      body.appendChild(el("div", "obj-group-h", esc(p.name) +
        ' <small>' + ms.length + ' mission' + (ms.length !== 1 ? "s" : "") + '</small>'));
      body.appendChild(pickGrid(ms, function (r) {
        var on = c.missionIds.indexOf(r.id) >= 0;
        var pers = window.PIQ.personas(r);
        var w = Math.round((weights[r.id] || 0) * 100);
        var extra = window.PIQ.missionRoleCount(r) - 1;
        // the KPIs this mission actually moves, as chips — the measurement surface
        // is what an SME is really choosing when they keep a mission in scope
        var seen = {}, kpis = [];
        (r.capabilities || []).forEach(function (o) {
          if (seen[o.kpi]) return; seen[o.kpi] = 1; kpis.push(o);
        });
        var chips = kpis.slice(0, 4).map(function (o) {
          var mt = o.metric || {};
          var trail = (mt.baseline != null && mt.target != null)
            ? ' <i>' + esc(mt.baseline) + '→' + esc(mt.target) + '</i>' : '';
          return '<span class="pc-kpi">' + esc(o.kpi) + trail + '</span>';
        }).join("") + (kpis.length > 4 ? '<span class="pc-kpi more">+' + (kpis.length - 4) + '</span>' : '');
        return '<div class="pc-main"><div class="pc-t">' + esc(r.name) + '</div>' +
          '<div class="pc-kpis"><span class="pck-lab">KPI impacted</span>' + chips + '</div></div>' +
          '<div class="pc-meta">' + ownerChip(pers) +
          (pers.cadence ? '<span class="pc-tag">' + esc(pers.cadence) + '</span>' : '') +
          '<span class="pc-sep">' + (r.capabilities || []).length + ' capabilities</span>' +
          (extra > 0 ? '<span class="pc-sep">+' + extra + ' roles</span>' : '') + '</div>' +
          '<div class="mw"><span class="mw-l">Contribution</span>' +
            '<span class="mw-bar"><i style="width:' + w + '%"></i></span>' +
            '<span class="mw-v">' + w + '%</span></div>' +
          (on ? '<div class="pc-on">✓</div>' : '');
      }, function (r) { toggleMission(r); redraw(); },
         function (r) { return c.missionIds.indexOf(r.id) >= 0; }));
    });

    var np = c.patternIds.length;
    body.appendChild(nextBar(c.missionIds.length + " mission" + (c.missionIds.length !== 1 ? "s" : "") +
      " in scope · " + np + " pattern" + (np !== 1 ? "s" : ""),
      c.missionIds.length ? "Review patterns →" : "", function () { state.step = S_PAT; redraw(); }));

    // Supplementary context below the sticky CTA. The hierarchy tree is where
    // capabilities stay visible now that they are auto-scoped rather than a step —
    // hovering a mission also opens its RACI persona map.
    var f = window.PIQ.fn();
    procs.forEach(function (p) {
      body.appendChild(personaMatrix(p));
      if (f) body.appendChild(hierarchy(f, p));
    });

    var all = document.getElementById("stAllP");
    if (all) all.onclick = function (e) {
      e.stopPropagation();
      c.missionIds = c.missionIds.length === pool.length ? [] : pool.map(function (r) { return r.id; });
      syncCapabilities(false); redraw();
    };
  }

  /* Contribution weight across the whole candidate pool (not just what is
     selected), so the number on a card does not jump as the SME toggles
     missions on and off. Same formula as PIQ.missionWeights: normalised KPI
     ambition scaled by the patterns available to deliver it. */
  function missionWeightsOverPool(pool) {
    var raw = {}, total = 0;
    pool.forEach(function (r) {
      var span = 0, pats = 0;
      (r.capabilities || []).forEach(function (o) {
        var m = o.metric || {};
        if (m.baseline != null && m.target != null) {
          span += Math.abs(m.target - m.baseline) / (Math.abs(m.baseline) || 1);
        }
        pats += (o.patternIds || []).length;
      });
      var w = span * (1 + Math.log(1 + pats));
      raw[r.id] = w; total += w;
    });
    var out = {};
    pool.forEach(function (r) { out[r.id] = total ? raw[r.id] / total : 1 / (pool.length || 1); });
    return out;
  }

  function toggleMission(r) {
    var c = C(), i = c.missionIds.indexOf(r.id);
    if (i >= 0) c.missionIds.splice(i, 1); else c.missionIds.push(r.id);
    syncCapabilities(false);   // re-derive capabilities + patterns + skills
  }

  /* Section 4 · Patterns — the evidence layer.
     Grouped by the mission that carries them, so an SME reads "this is what my
     Collections Lead actually knows how to spot". Capabilities are auto-scoped
     and no longer a section, but they are named on each group header because a
     capability is the KPI instrument the patterns serve. */
  function stepPatterns(body) {
    var c = C();
    var missions = window.PIQ.missions();
    if (!missions.length) { state.step = S_MIS; return redraw(); }
    var all = window.PIQ.capabilityPatternIds();
    if (!all.length) {
      body.appendChild(el("div", "st-q", "No patterns in scope"));
      body.appendChild(el("p", "st-hint",
        "The capabilities under these missions have no pattern library authored yet — they are the capability " +
        "gaps this transformation would build next. Continue to see the action chains for what does exist."));
      body.appendChild(nextBar("0 patterns", "Compose action chains →",
        function () { state.step = S_CHAIN; redraw(); }));
      return;
    }

    body.appendChild(el("div", "st-q",
      "The <b>patterns</b> underneath" +
      '<button class="linkbtn" id="stAll">' +
      (c.patternIds.length === all.length ? "clear all" : "select all") + '</button>'));
    body.appendChild(el("p", "st-hint",
      "A pattern encodes the analyst's judgement: a standard path plus the branches that handle variation. " +
      "They are grouped by the mission that owns them. Tick the circle to include a pattern; click a card to " +
      "open its detail and edit its standard chain."));

    var groupsWrap = el("div", "pgroups");
    body.appendChild(groupsWrap);

    var drawn = {}, shown = 0;
    missions.forEach(function (r) {
      var ids = [];
      (r.capabilities || []).forEach(function (o) {
        if (c.capIds.indexOf(o.id) < 0) return;
        (o.patternIds || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      });
      ids = ids.filter(function (id) { if (drawn[id]) return false; drawn[id] = 1; return true; });
      if (!ids.length) return;
      // first group open so the step never looks empty; the rest collapsed so the
      // page stays scannable with 31 pattern cards in scope
      groupsWrap.appendChild(patternGroup(r, ids, shown === 0));
      shown++;
    });

    body.appendChild(nextBar(c.patternIds.length + " pattern" + (c.patternIds.length !== 1 ? "s" : "") + " selected",
      c.patternIds.length ? "Compose action chains →" : "", function () { state.step = S_CHAIN; redraw(); }));

    var ab = document.getElementById("stAll");
    if (ab) ab.onclick = function (e) {
      e.stopPropagation();
      c.patternIds = c.patternIds.length === all.length ? [] : all.slice();
      autoConfigureSkills(); redraw();
    };
  }

  /* One collapsible mission group in the Patterns section. The header carries the
     three things an SME scans for: who holds it, how many patterns sit under it,
     and which KPI those patterns move. Capability ids (OC-21 …) are internal
     plumbing and are deliberately not shown. */
  function patternGroup(r, ids, dfltOpen) {
    var c = C();
    var pers = window.PIQ.personas(r);
    var key = "pg|" + r.id;
    var open = phOpen(key, dfltOpen);
    var pats = ids.map(window.PIQ.pattern).filter(Boolean);
    var sel = ids.filter(function (id) { return c.patternIds.indexOf(id) >= 0; }).length;

    // distinct KPIs this mission's pattern-backed capabilities actually move
    var seen = {}, kpis = [];
    (r.capabilities || []).forEach(function (o) {
      if (c.capIds.indexOf(o.id) < 0 || !(o.patternIds || []).length) return;
      if (seen[o.kpi]) return;
      seen[o.kpi] = 1; kpis.push(o.kpi);
    });

    var g = el("div", "pgroup" + (open ? " open" : ""));
    var head = el("div", "pg-head",
      '<button class="ph-tog' + (open ? " on" : "") + '" aria-expanded="' + (open ? "true" : "false") + '">' +
        (open ? "▾" : "▸") + '</button>' +
      '<span class="pg-av">' + esc(pers.accountable.initials) + '</span>' +
      '<span class="pg-main"><span class="pg-role">' + esc(pers.accountable.role) + '</span>' +
        '<span class="pg-mis">' + esc(r.name) + '</span></span>' +
      '<span class="pg-kpis">' + (kpis.length
          ? '<i>KPI impacted</i>' + kpis.map(function (k) {
              return '<span class="pg-kpi">' + esc(k) + '</span>'; }).join("")
          : '') + '</span>' +
      '<span class="pg-count"><b>' + pats.length + '</b>' +
        (sel === pats.length ? ' selected' : ' patterns · ' + sel + ' on') + '</span>');
    g.appendChild(head);

    var bodyEl = el("div", "pg-body");
    bodyEl.appendChild(patternGrid(pats));
    if (!open) bodyEl.classList.add("ph-hide");
    g.appendChild(bodyEl);

    var tog = head.querySelector(".ph-tog");
    function flip() {
      var nowOpen = bodyEl.classList.contains("ph-hide");
      bodyEl.classList.toggle("ph-hide", !nowOpen);
      g.classList.toggle("open", nowOpen);
      tog.textContent = nowOpen ? "▾" : "▸";
      tog.classList.toggle("on", nowOpen);
      tog.setAttribute("aria-expanded", nowOpen ? "true" : "false");
      phSet(key, nowOpen);
    }
    head.onclick = flip;
    return g;
  }

  function patternGrid(pats) {
    var c = C(), grid = el("div", "patgrid");
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
          (custom ? ' <span class="dagbadge">✎ chain edited</span>' : '') + '</div>' +
        '<button class="pat-check' + (sel ? " on" : "") + '" title="' + (sel ? "Remove from composition" : "Add to composition") + '">' + (sel ? "✓" : "+") + '</button></div>' +
        '<div class="pat-mm">“' + esc(trim(p.mentalModel, 150)) + '”</div>' +
        '<div class="pat-flow"><span class="flab">Standard chain</span>' + (flow || '<span class="muted">no steps</span>') +
          (happy.length > 4 ? '<i>→</i><span class="mini-b more">+' + (happy.length - 4) + '</span>' : '') + '</div>' +
        '<div class="pat-foot"><span>' + branches + ' dynamic branch' + (branches !== 1 ? "es" : "") + ' · ' +
          (gates ? '🔒 ' + gates + ' gate' + (gates > 1 ? "s" : "") : 'no gates') + '</span>' +
        '<span class="pat-cue">✎ details &amp; chain</span></div>');
      card.onclick = function () { openPatternDetail(p); };
      card.querySelector(".pat-check").onclick = function (e) {
        e.stopPropagation();
        var i = c.patternIds.indexOf(p.id);
        if (i >= 0) c.patternIds.splice(i, 1); else c.patternIds.push(p.id);
        autoConfigureSkills();
        redraw();
      };
      grid.appendChild(card);
    });
    return grid;
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

  /* Section 5 - Action Chains: how a mission actually executes.
       Standard Action Chain - the straight-through spine (originalDAG). Editable:
                               reorder blocks or switch them off; edits flow to
                               Fitment, the Build engine and Runtime.
       Dynamic Action Chain  - the variation branches (branchingDAG). Read-only:
                               each is a condition that fires a different set of
                               actions, some behind an approval gate.
     Skills are auto-configured behind this section (autoConfigureSkills); the
     per-skill executor override now lives in Discover & Fit. */
  function stepActionChains(body) {
    var c = C();
    if (!c.missionIds.length) { state.step = S_MIS; return redraw(); }
    if (!c.patternIds.length) syncPatterns();
    if (!c.patternIds.length) {
      body.appendChild(el("div", "st-q", "No action chains yet"));
      body.appendChild(el("p", "st-hint",
        "No patterns are in scope, so there is nothing to execute. Go back and include at least one pattern."));
      body.appendChild(nextBar("0 chains", "\u2190 Back to patterns", function () { state.step = S_PAT; redraw(); }));
      return;
    }

    var pats = window.PIQ.selectedPatterns();
    var ch = window.PIQ.chainCounts();
    var skills = window.PIQ.collectSkills(c.patternIds);

    body.appendChild(el("div", "st-q", "Compose the <b>action chains</b>"));
    body.appendChild(el("p", "st-hint",
      "An action chain is how a mission executes. The <b>standard</b> chain is the straight-through spine that " +
      "runs when nothing is unusual. The <b>dynamic</b> chain is what fires when a variation is detected \u2014 " +
      "branch by branch, with approval gates where a human must decide."));

    body.appendChild(el("div", "ac-sum",
      '<div class="acs-i"><b>' + pats.length + '</b><span>chains</span></div><i>\u00b7</i>' +
      '<div class="acs-i"><b>' + ch.standard + '</b><span>standard blocks</span></div><i>\u00b7</i>' +
      '<div class="acs-i"><b>' + ch.dynamic + '</b><span>dynamic branches</span></div><i>\u00b7</i>' +
      '<div class="acs-i"><b>' + ch.gates + '</b><span>approval gates</span></div><i>\u00b7</i>' +
      '<div class="acs-i"><b>' + skills.length + '</b><span>skills auto-configured</span></div>'));

    var tab = state.acTab || "standard";
    var tabs = el("div", "st-subtabs",
      '<button class="st-subtab' + (tab === "standard" ? " on" : "") + '" data-at="standard">' +
        'Standard Action Chain <span class="st-subn">' + ch.standard + '</span></button>' +
      '<button class="st-subtab' + (tab === "dynamic" ? " on" : "") + '" data-at="dynamic">' +
        'Dynamic Action Chain <span class="st-subn">' + ch.dynamic + '</span></button>');
    tabs.querySelectorAll(".st-subtab").forEach(function (b) {
      b.onclick = function () { state.acTab = b.dataset.at; redraw(); };
    });
    body.appendChild(tabs);

    var list = el("div", "aclist");
    if (tab === "dynamic") {
      body.appendChild(el("p", "st-hint",
        "Each branch is a named condition the pattern watches for. When it matches, the standard chain is " +
        "replaced by these actions. \ud83d\udd12 marks a branch that waits for human approval before it runs."));
      pats.forEach(function (p) { list.appendChild(dynamicCard(p)); });
    } else {
      body.appendChild(el("p", "st-hint",
        "The ordered blocks that run end-to-end on the happy path. Reorder or switch blocks off \u2014 " +
        "edits flow through to Discover & Fit, the Build engine and Runtime."));
      pats.forEach(function (p) { list.appendChild(chainCard(p)); });
    }
    body.appendChild(list);

    body.appendChild(nextBar(
      pats.length + " chain" + (pats.length !== 1 ? "s" : "") + " \u00b7 " + ch.standard + " standard \u00b7 " +
      ch.dynamic + " dynamic \u00b7 " + skills.length + " skills ready",
      "Send to Discover & Fit \u2192", function () { window.PIQ.go("fitment"); }));

    // How each mission's chains distribute across the cognitive spine \u2014 the
    // clearest read of "where is this mission straight-through vs gated".
    // One map for the whole composition: swimlane() already lanes every in-scope
    // mission, so it must NOT be drawn per process.
    var f = window.PIQ.fn();
    if (f) body.appendChild(swimlane(f, window.PIQ.proc()));
  }

  /* one read-only Dynamic Action Chain card - the pattern's variation branches */
  function dynamicCard(p) {
    var card = el("div", "accard dyn");
    renderDynamicCard(card, p);
    return card;
  }
  function renderDynamicCard(card, p) {
    var open = isOpen("dyn", p.id);
    var brs = p.branchingDAG || [];
    var gates = p.hitlGates || [];
    var rows = brs.length ? brs.map(function (b, i) {
      var acts = (b.actions || []).map(function (a) {
        return (a || "").split(" + ").map(function (raw) {
          return '<span class="mini-b">' + esc(window.PIQ.prettify(raw.trim())) + '</span>';
        }).join('<i>+</i>');
      }).join('<i>\u2192</i>') || '<span class="muted">no actions</span>';
      var tier = b.tier ? '<span class="dyn-tier t-' + esc(b.tier) + '">' + esc(b.tier) +
        (b.escLevel ? " L" + b.escLevel : "") + '</span>' : "";
      return '<div class="dynbr">' +
        '<div class="dynbr-h"><span class="dynbr-n">' + (i + 1) + '</span>' +
          '<code class="dynbr-c">' + esc(b.condition || "\u2014") + '</code>' + tier +
          (b.hitl ? '<span class="dynbr-gate">\ud83d\udd12 approval</span>' : '') + '</div>' +
        '<div class="dynbr-a">' + acts + '</div></div>';
    }).join("") : '<p class="st-hint muted">This pattern has no variation branches \u2014 it always runs its standard chain.</p>';

    var peek = brs.slice(0, 2).map(function (b) {
      return '<span class="dynpeek">' + esc(trim(b.condition || "\u2014", 58)) + '</span>';
    }).join("") + (brs.length > 2 ? '<span class="dynpeek more">+' + (brs.length - 2) + ' more</span>' : '');

    card.innerHTML =
      '<div class="accard-h"><span class="pat-prio" style="background:' + PRIO[p.priority] + '"></span>' +
        '<div class="accard-n">' + esc(p.name) + (p.sample ? ' <span class="statusbadge sample">sample</span>' : '') + '</div>' +
        '<span class="accard-meta">' + brs.length + ' branch' + (brs.length !== 1 ? "es" : "") +
          (gates.length ? ' \u00b7 \ud83d\udd12 ' + gates.length : '') + '</span>' +
        '<button class="linkbtn" data-detail="1">open detail</button>' +
        '<button class="ac-toggle" data-toggle="1" aria-expanded="' + (open ? "true" : "false") + '">' +
          (open ? "\u25be" : "\u25b8") + '</button></div>' +
      (open
        ? '<div class="dynlist">' + rows + '</div>' +
          (gates.length ? '<div class="dyngates"><span class="flab">Approval gates</span>' +
            gates.map(function (g) { return '<span class="gatechip">\ud83d\udd12 ' + esc(g) + '</span>'; }).join("") + '</div>' : '')
        : '<div class="dynpeeks">' + peek + '</div>');

    var det = card.querySelector("[data-detail]");
    if (det) det.onclick = function () { openPatternDetail(p); };
    bindToggle(card, "dyn", p.id, function () { renderDynamicCard(card, p); });
  }

  /* one editable Standard Action Chain card */
  function chainCard(p) {
    var card = el("div", "accard");
    renderChainCard(card, p);
    return card;
  }
  function renderChainCard(card, p) {
    var open = isOpen("std", p.id);
    var steps = window.PIQ.dagSteps(p.id);
    var onCount = steps.filter(function (s) { return s.on; }).length;
    var custom = window.PIQ.dagCustomised(p.id);
    var rows = steps.map(function (s, i) {
      var rm = s.added ? '<button class="dstep-rm" data-rm="' + i + '" title="Remove block">\u2715</button>' : '';
      var tag = s.added ? ' <span class="dstep-added">added</span>' : '';
      return '<div class="dstep' + (s.on ? "" : " off") + (s.added ? " added" : "") + '">' +
        '<div class="dstep-ord">' +
          '<button data-mv="-1" data-i="' + i + '"' + (i === 0 ? " disabled" : "") + '>\u2191</button>' +
          '<button data-mv="1" data-i="' + i + '"' + (i === steps.length - 1 ? " disabled" : "") + '>\u2193</button></div>' +
        '<span class="dstep-n">' + (i + 1) + '</span>' +
        '<div class="dstep-k mono">' + esc(window.PIQ.prettify(s.k)) + tag + '</div>' +
        '<button class="dstep-tog' + (s.on ? " on" : "") + '" data-tog="' + i + '">' + (s.on ? "On" : "Off") + '</button>' + rm +
      '</div>';
    }).join("");
    var prev = window.PIQ.happyDAG(p.id).map(function (s) {
      return '<span class="mini-b">' + esc(window.PIQ.prettify(s)) + '</span>'; }).join('<i>\u2192</i>')
      || '<span class="muted">no blocks enabled</span>';

    card.innerHTML =
      '<div class="accard-h"><span class="pat-prio" style="background:' + PRIO[p.priority] + '"></span>' +
        '<div class="accard-n">' + esc(p.name) + (p.sample ? ' <span class="statusbadge sample">sample</span>' : '') +
          (custom ? ' <span class="dagbadge">\u270e edited</span>' : '') + '</div>' +
        '<span class="accard-meta">' + onCount + '/' + steps.length + ' blocks</span>' +
        (custom ? '<button class="linkbtn" data-reset="1">reset</button>' : '') +
        '<button class="linkbtn" data-detail="1">open detail</button>' +
        '<button class="ac-toggle" data-toggle="1" aria-expanded="' + (open ? "true" : "false") + '">' +
          (open ? "\u25be" : "\u25b8") + '</button></div>' +
      (open
        ? '<div class="dsteps">' + rows + '</div>' +
          '<div class="dprev"><span class="flab">Resulting sequence <b>' + onCount + '/' + steps.length + '</b></span>' + prev + '</div>'
        : '<div class="dprev collapsed">' + prev + '</div>');

    card.querySelectorAll("[data-mv]").forEach(function (b) {
      b.onclick = function () {
        var d = ensureDag(p.id), i = +b.dataset.i, j = i + (+b.dataset.mv);
        if (j < 0 || j >= d.steps.length) return;
        var tmp = d.steps[i]; d.steps[i] = d.steps[j]; d.steps[j] = tmp;
        afterDagEdit(); renderChainCard(card, p);
      };
    });
    card.querySelectorAll("[data-tog]").forEach(function (b) {
      b.onclick = function () {
        var d = ensureDag(p.id); d.steps[+b.dataset.tog].on = !d.steps[+b.dataset.tog].on;
        afterDagEdit(); renderChainCard(card, p);
      };
    });
    card.querySelectorAll("[data-rm]").forEach(function (b) {
      b.onclick = function () {
        var d = ensureDag(p.id); d.steps.splice(+b.dataset.rm, 1);
        afterDagEdit(); renderChainCard(card, p);
      };
    });
    var rst = card.querySelector("[data-reset]");
    if (rst) rst.onclick = function () { window.PIQ.resetDag(p.id); afterDagEdit(); renderChainCard(card, p); };
    var det = card.querySelector("[data-detail]");
    if (det) det.onclick = function () { openPatternDetail(p); };
    bindToggle(card, "std", p.id, function () { renderChainCard(card, p); });
  }

  /* per-card expand/collapse, remembered across redraws */
  function isOpen(kind, id) {
    state.open = state.open || {};
    return !!state.open[kind + ":" + id];
  }
  function bindToggle(card, kind, id, rerender) {
    var t = card.querySelector("[data-toggle]");
    if (!t) return;
    t.onclick = function () {
      state.open = state.open || {};
      var k = kind + ":" + id;
      state.open[k] = !state.open[k];
      rerender();
    };
  }

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
