/* Tiger Mission Control — Platform Shell
 * Owns shared state (window.PIQ), the two-level journey router (stages × sub-views),
 * the SME "composition" being designed, the global ERP toggle, and cross-pattern
 * helpers (resolve a pattern by id; collect the skills of a selection).
 *
 * The stages mirror the Tiger Mission Control pipeline:
 *   1 Setup           — Missions → Skills (Mission Builder + Pattern Library)
 *   2 Discover & Fit  — pattern discovery & skill fitment + happy-path agentivisation
 *   3 Build           — skill configuration
 *   4 Run & Monitor   — STP on the happy path; variations matched to patterns, routed
 *                       for DAG approval; monitoring + value measurement.
 */
(function () {
  "use strict";

  window.PIQ = {
    erp: "sap",
    patterns: window.PROCESSIQ_PATTERNS.patterns,
    meta: window.PROCESSIQ_PATTERNS.meta,
    tax: window.PROCESSIQ_TAXONOMY,
    book: window.PROCESSIQ_PORTFOLIO,
    E: window.ProcessIQEngine,
    modules: {},     // registered by each module file
    active: null,    // current sub-view id
    _erpListeners: [],
    // the mission an SME is composing — threaded through all stages
    composition: {
      objectiveId: null,  // business objective (spans functions) — top-level lens
      fnId: null, procId: null,
      missionIds: [],     // all missions participating in the chosen process
      capIds: [],         // capabilities in scope (across the selected missions)
      patternIds: [],     // selected patterns
      skills: {},         // skillKey -> { mode:'auto'|'hitl', tech:string, configured:bool }
      dag: {},            // patternId -> { steps:[{k:string,on:bool}] } happy-path customisation
      live: false,        // promoted to Run & Monitor
    },
  };

  /* ---- journey map: stages, each with sub-views ------------------------ */
  var STAGES = [
    { id: "design", n: 1, label: "Setup", tag: "Mission Control", sub: [
        { id: "studio", label: "Mission Builder" },
        { id: "library", label: "Pattern Library" } ] },
    { id: "fit", n: 2, label: "Discover & Fit", tag: "Pattern Discovery & Skill Fitment", sub: [
        { id: "fitment", label: "Skill Fitment" },
        { id: "discovery", label: "Discovery Engine" } ] },
    { id: "build", n: 3, label: "Build", tag: "Skill Configuration", sub: [
        { id: "build", label: "Skill Workshop" } ] },
    { id: "run", n: 4, label: "Run & Monitor", tag: "Mission Execution", sub: [
        { id: "runtime", label: "Mission Operations" },
        { id: "cockpit", label: "Central Nervous System" },
        { id: "governance", label: "Governance" },
        { id: "roi", label: "Value Measurement" } ] },
    { id: "cfo", n: 5, label: "CFO Layer", tag: "Executive Consumption", sub: [
        { id: "command", label: "Command Center" },
        { id: "intelligence", label: "Intelligence" },
        { id: "scenarios", label: "Scenarios" },
        { id: "trajectory", label: "Trajectory" } ] },
  ];
  PIQ.STAGES = STAGES;

  /* ---- personas: a landing-page lens that opens the app on one part of the
     journey and greys the rest. Passed as ?persona=<id>; a null persona = full
     workspace. Non-allowed stages render locked (non-navigable). ------------ */
  var PERSONAS = {
    cfo:      { label: "CFO / Finance Lead",       stages: ["cfo"],           entry: "command" },
    designer: { label: "Transformation Designer",  stages: ["design"],        entry: "studio" },
    studio:   { label: "Implementation Studio",    stages: ["fit", "build"],  entry: "fitment" },
    manage:   { label: "Manage & Operate",         stages: ["run"],           entry: "runtime" },
  };
  PIQ.persona = null;
  function personaAllows(stageId) {
    if (!PIQ.persona) return true;
    var p = PERSONAS[PIQ.persona];
    return !p || p.stages.indexOf(stageId) >= 0;
  }
  function readPersona() {
    try { var m = /[?&]persona=([a-z]+)/i.exec(window.location.search); return m ? m[1].toLowerCase() : null; }
    catch (e) { return null; }
  }

  function stageOf(viewId) {
    for (var i = 0; i < STAGES.length; i++) {
      if (STAGES[i].sub.some(function (s) { return s.id === viewId; })) return STAGES[i];
    }
    return null;
  }

  /* ---- shared domain helpers ------------------------------------------- */
  PIQ.onErp = function (fn) { PIQ._erpListeners.push(fn); };

  // resolve a pattern id against the real library first, then sample stubs
  PIQ.pattern = function (id) {
    var p = PIQ.patterns.filter(function (x) { return x.id === id; })[0];
    if (p) return p;
    var s = PIQ.tax.stubPatterns[String(id)];
    return s || null;
  };

  PIQ.selectedPatterns = function () {
    return PIQ.composition.patternIds.map(PIQ.pattern).filter(Boolean);
  };

  // the business objective (top-level lens) currently in scope
  PIQ.objective = function () {
    return (PIQ.tax.themes || []).filter(function (t) { return t.id === PIQ.composition.objectiveId; })[0] || null;
  };
  // functions an objective spans (resolved objects); all functions if none selected
  PIQ.objectiveFunctions = function () {
    var t = PIQ.objective(), all = PIQ.tax.functions || [];
    if (!t) return all;
    var ids = t.functionIds || [];
    var some = all.filter(function (f) { return ids.indexOf(f.id) >= 0; });
    return some.length ? some : all;
  };

  // pull the referenced pattern ids ("#27") out of a compound pattern's triggers
  PIQ.compoundConstituents = function (cp) {
    var seen = {}, out = [];
    (cp.triggers || []).forEach(function (t) {
      (String(t).match(/#(\d+)/g) || []).forEach(function (m) {
        var id = +m.slice(1); if (!seen[id]) { seen[id] = 1; out.push(id); }
      });
    });
    return out;
  };
  // cross-process compound patterns applicable to the current composition:
  // the selected objective's, or (if none) every objective touching the chosen function.
  PIQ.compoundPatterns = function () {
    var c = PIQ.composition, out = [];
    (PIQ.tax.themes || []).forEach(function (t) {
      if (c.objectiveId) { if (t.id !== c.objectiveId) return; }
      else if (c.fnId && (t.functionIds || []).indexOf(c.fnId) < 0) return;
      else if (!c.fnId && !c.objectiveId) return;
      (t.crossProcessPatterns || []).forEach(function (cp) {
        out.push({ theme: t, cp: cp, constituents: PIQ.compoundConstituents(cp) });
      });
    });
    return out;
  };

  PIQ.fn = function () {
    return (PIQ.tax.functions || []).filter(function (f) { return f.id === PIQ.composition.fnId; })[0] || null;
  };
  PIQ.proc = function () {
    var f = PIQ.fn(); var c = PIQ.composition; if (!f) return null;
    return f.processes.filter(function (x) { return x.id === c.procId; })[0] || null;
  };
  // missions currently in scope
  PIQ.missions = function () {
    var p = PIQ.proc(); var c = PIQ.composition; if (!p) return [];
    return p.missions.filter(function (r) { return c.missionIds.indexOf(r.id) >= 0; });
  };
  // capabilities in scope, across every selected mission
  PIQ.capabilities = function () {
    var p = PIQ.proc(); var c = PIQ.composition; if (!p) return [];
    var out = [];
    p.missions.forEach(function (r) {
      if (c.missionIds.indexOf(r.id) < 0) return;
      (r.capabilities || []).forEach(function (o) { if (c.capIds.indexOf(o.id) >= 0) out.push(o); });
    });
    return out;
  };
  // first in-scope capability — kept for compact single-line labels
  PIQ.capability = function () { return PIQ.capabilities()[0] || null; };
  // union of every pattern id across the in-scope capabilities
  PIQ.capabilityPatternIds = function () {
    var seen = {}, out = [];
    PIQ.capabilities().forEach(function (o) {
      (o.patternIds || []).forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    });
    return out;
  };

  // ---- happy-path DAG customisation (per-composition, per-pattern) ----------
  // The editable step list: seeds from originalDAG, then persists reorder + on/off.
  PIQ.dagSteps = function (id) {
    var ov = (PIQ.composition.dag || {})[id];
    if (ov && ov.steps) return ov.steps;
    var p = PIQ.pattern(id);
    return ((p && p.originalDAG) || []).map(function (k) { return { k: k, on: true }; });
  };
  // resolved happy path the rest of the app runs on: enabled steps in user order.
  PIQ.happyDAG = function (id) {
    var ov = (PIQ.composition.dag || {})[id];
    if (ov && ov.steps) return ov.steps.filter(function (s) { return s.on; }).map(function (s) { return s.k; });
    var p = PIQ.pattern(id);
    return (p && p.originalDAG) ? p.originalDAG.slice() : [];
  };
  PIQ.dagCustomised = function (id) {
    var ov = (PIQ.composition.dag || {})[id];
    return !!(ov && ov.steps);
  };
  PIQ.resetDag = function (id) { if (PIQ.composition.dag) delete PIQ.composition.dag[id]; };

  // repository of every distinct skill across the whole library (real +
  // sample patterns, happy-path + variation actions) — for adding to a DAG.
  PIQ.actionRepository = function () {
    if (PIQ._actionRepo) return PIQ._actionRepo;
    var set = {};
    function add(tok) { (tok || "").split(" + ").forEach(function (raw) { var k = raw.trim(); if (k) set[k] = 1; }); }
    var stubs = PIQ.tax && PIQ.tax.stubPatterns ? PIQ.tax.stubPatterns : {};
    var all = (PIQ.patterns || []).concat(Object.keys(stubs).map(function (id) { return stubs[id]; }));
    all.forEach(function (p) {
      (p.originalDAG || []).forEach(add);
      (p.branchingDAG || []).forEach(function (b) { (b.actions || []).forEach(add); });
    });
    PIQ._actionRepo = Object.keys(set).sort();
    return PIQ._actionRepo;
  };

  // Decompose selected patterns into unique configurable skills.
  // Happy-path skills (originalDAG) are straight-through candidates; variation
  // skills (branchingDAG actions) carry the HITL flag of their branch.
  PIQ.collectSkills = function (patternIds) {
    var map = {};   // key -> skill
    function touch(token, patId, source, hitl) {
      (token || "").split(" + ").forEach(function (raw) {
        var key = raw.trim(); if (!key) return;
        var b = map[key];
        if (!b) { b = map[key] = { key: key, label: prettify(key), patterns: [], source: source, hitl: !!hitl }; }
        if (b.patterns.indexOf(patId) < 0) b.patterns.push(patId);
        if (source === "happy") b.source = "happy";   // happy wins for labelling STP
        if (hitl) b.hitl = true;
      });
    }
    (patternIds || []).forEach(function (id) {
      var p = PIQ.pattern(id); if (!p) return;
      PIQ.happyDAG(id).forEach(function (s) { touch(s, id, "happy", false); });
      (p.branchingDAG || []).forEach(function (br) {
        (br.actions || []).forEach(function (a) { touch(a, id, "variation", !!br.hitl); });
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  };

  function prettify(token) {
    return token.replace(/\(/g, " (").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  }
  PIQ.prettify = prettify;

  // deterministic agent-fitment verdict for a skill (used by fitment + runtime)
  PIQ.fitment = function (block) {
    var t = block.key.toLowerCase();
    var human = /legal|cfo|vp|approv|hold|credit_review|write.?off|conditional/.test(t);
    var assisted = block.hitl || /escalate|notify|alert|review|route|propose|request/.test(t);
    if (human) return { tier: "Human-led", score: 0.55, mode: "hitl" };
    if (assisted) return { tier: "Assisted", score: 0.78, mode: "hitl" };
    return { tier: "Full-auto", score: 0.94, mode: "auto" };
  };

  PIQ.resetComposition = function () {
    PIQ.composition = { objectiveId: null, fnId: null, procId: null, missionIds: [], capIds: [],
      patternIds: [], skills: {}, dag: {}, live: false };
    PIQ.persistComposition();
  };

  /* ---- composition persistence (survives reloads) ---------------------- */
  var STORE_KEY = "piq.composition.v2";
  var THEME_KEY = "piq.theme.v1";
  PIQ.themeMode = "light";
  PIQ.persistComposition = function () {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(PIQ.composition)); } catch (e) {}
  };
  function persistTheme() {
    try { localStorage.setItem(THEME_KEY, PIQ.themeMode); } catch (e) {}
  }
  function setTheme(mode) {
    PIQ.themeMode = mode === "dark" ? "dark" : "light";
    document.body.classList.toggle("dark", PIQ.themeMode === "dark");
    var toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    toggle.querySelectorAll("button").forEach(function (btn) {
      btn.classList.toggle("on", btn.dataset.theme === PIQ.themeMode);
    });
    persistTheme();
  }
  function restoreTheme() {
    try {
      var raw = localStorage.getItem(THEME_KEY);
      setTheme(raw === "dark" ? "dark" : "light");
    } catch (e) { setTheme("light"); }
  }
  PIQ.restoreComposition = function () {
    try {
      var raw = localStorage.getItem(STORE_KEY); if (!raw) return;
      var saved = JSON.parse(raw); if (!saved || typeof saved !== "object") return;
      // only restore if the saved function still exists in the taxonomy
      if (saved.fnId && !(PIQ.tax.functions || []).some(function (f) { return f.id === saved.fnId; })) return;
      PIQ.composition = {
        objectiveId: saved.objectiveId || null,
        fnId: saved.fnId || null, procId: saved.procId || null,
        missionIds: Array.isArray(saved.missionIds) ? saved.missionIds : [],
        capIds: Array.isArray(saved.capIds) ? saved.capIds : [],
        patternIds: Array.isArray(saved.patternIds) ? saved.patternIds : [],
        skills: saved.skills && typeof saved.skills === "object" ? saved.skills : {},
        dag: saved.dag && typeof saved.dag === "object" ? saved.dag : {},
        live: !!saved.live,
      };
    } catch (e) {}
  };

  /* ---- router ---------------------------------------------------------- */
  function renderNav() {
    var nav = document.getElementById("modnav");
    var stage = stageOf(PIQ.active);
    nav.innerHTML = "";
    STAGES.forEach(function (st, i) {
      // the CFO layer is the consumption surface, not part of the build pipeline —
      // separate it visually from the earlier stages.
      if (st.id === "cfo") {
        var sep = document.createElement("span"); sep.className = "stage-sep";
        sep.innerHTML = '<span class="sep-line"></span>'; nav.appendChild(sep);
      }
      var allowed = personaAllows(st.id);
      var b = document.createElement("button");
      b.className = "stagetab" + (stage && stage.id === st.id ? " on" : "") + (allowed ? "" : " locked");
      b.innerHTML = '<span class="stnum">' + st.n + '</span>' +
        '<span class="stlbl">' + st.label + '<small>' + st.tag + '</small></span>' +
        (allowed ? '' : '<span class="stlock">🔒</span>');
      if (allowed) b.onclick = function () { go(st.sub[0].id); };
      else b.title = "Locked for this persona — open the full workspace from the landing page";
      nav.appendChild(b);
      if (i < STAGES.length - 1 && STAGES[i + 1].id !== "cfo") {
        var a = document.createElement("span"); a.className = "stage-arrow"; a.textContent = "→";
        nav.appendChild(a);
      }
    });
  }

  function renderSub() {
    var bar = document.getElementById("subbar");
    var stage = stageOf(PIQ.active);
    if (!stage) { bar.innerHTML = ""; bar.classList.remove("on"); return; }
    bar.classList.add("on");
    var tabs = stage.sub.map(function (s) {
      return '<button class="subtab' + (PIQ.active === s.id ? " on" : "") + '" data-v="' + s.id + '">' + s.label + '</button>';
    }).join("");
    bar.innerHTML = '<div class="subtabs">' + tabs + '</div>' +
      '<div class="crumb">' + crumb() + '</div>';
    bar.querySelectorAll(".subtab").forEach(function (t) {
      t.onclick = function () { go(t.dataset.v); };
    });
  }

  function crumb() {
    var c = PIQ.composition, f = PIQ.fn(), t = PIQ.objective();
    if (!f && !t) return '<span class="cr-empty">No mission selected — start in the Mission Builder</span>';
    var parts = [];
    if (t) parts.push(t.name);
    if (f) parts.push(f.name);
    var p = PIQ.proc();
    if (p) parts.push(p.name);
    var s = parts.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('<i>›</i>');
    var nr = c.missionIds.length;
    if (nr) s += '<i>›</i><span class="cr-count">' + nr + ' mission' + (nr > 1 ? "s" : "") + '</span>';
    var n = c.patternIds.length;
    if (n) s += '<i>›</i><span class="cr-count">' + n + ' pattern' + (n > 1 ? "s" : "") + '</span>';
    if (c.live) s += '<span class="cr-live">● LIVE</span>';
    return s;
  }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function go(id) {
    PIQ.active = id;
    PIQ.persistComposition();
    renderNav();
    renderSub();
    var view = document.getElementById("view");
    view.innerHTML = "";
    var mod = PIQ.modules[id];
    if (mod && mod.render) { mod.render(view); }
    else { view.appendChild(stubCard(id)); }
    window.scrollTo(0, 0);
  }
  PIQ.go = go;

  function stubCard(id) {
    var d = document.createElement("div");
    d.className = "modstub";
    d.innerHTML = '<div class="modstub-card"><h2>' + esc(id) + '</h2>' +
      '<p>This view is not yet wired.</p></div>';
    return d;
  }

  /* ---- global ERP toggle ----------------------------------------------- */
  document.getElementById("erpToggle").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    PIQ.erp = b.dataset.erp;
    this.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
    PIQ._erpListeners.forEach(function (fn) { try { fn(PIQ.erp); } catch (e) {} });
  });

  /* "Why" link → the narrative front door */
  var why = document.getElementById("whyLink");
  if (why) why.onclick = function (e) { e.preventDefault(); go("provocation"); };

  /* brand → reset the session and return to the landing page */
  var brandEl = document.querySelector(".brand");
  if (brandEl) {
    brandEl.style.cursor = "pointer";
    brandEl.title = "Reset session & return to the landing page";
    brandEl.addEventListener("click", function () {
      PIQ.resetComposition();
      window.location.href = "index.html";
    });
  }

  document.getElementById("themeToggle").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    setTheme(b.dataset.theme);
  });

  /* boot */
  document.getElementById("varStat").textContent = PIQ.E._money(PIQ.book.meta.valueAtRisk);
  document.getElementById("dateStat").textContent = PIQ.book.meta.asOfDate;

  restoreTheme();

  // Boot: a persona (from the landing page) opens the app on its slice of the
  // journey; otherwise start on the Mission Builder — the SME's front door.
  PIQ.boot = function () {
    PIQ.restoreComposition();
    var persona = readPersona();
    if (persona && PERSONAS[persona]) { PIQ.persona = persona; go(PERSONAS[persona].entry); }
    else go("studio");
  };
})();
