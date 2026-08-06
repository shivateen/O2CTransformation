/* Run & Monitor — Mission Command
 * The campaign board. Mission Operations shows one analyst working one queue;
 * this shows the whole multi-front effort converging on a single business
 * objective: every persona mission, what it is moving, how far it has come, and
 * where one mission's progress lifts another's ceiling.
 *
 * Everything here is derived — no Math.random, no Date.now. Live counters come
 * from PIQ.missionRuntime() (the same simulator Mission Operations runs, so the
 * two boards can never disagree); structure and weighting come from the taxonomy.
 */
(function () {
  "use strict";

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function C() { return window.PIQ.composition; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function round(v, d) { var f = Math.pow(10, d || 0); return Math.round(v * f) / f; }

  var MEDAL = ["#c9a227", "#8c8f94", "#a9713b"];   // 1st / 2nd / 3rd on the leaderboard

  /* ---- value formatting (mirrors the runtime mission band) ---------------- */
  function fmt(v, unit) {
    if (unit === "$")  return "$" + v;
    if (unit === "$K") return "$" + v + "K";
    if (unit === "$M") return "$" + v + "M";
    if (unit === "%")  return v + "%";
    return String(v);
  }
  function kpiAt(m, pct) {
    var v = m.baseline + (m.target - m.baseline) * pct;
    var abs = Math.abs(v);
    return round(v, abs < 20 ? 1 : 0);
  }
  // how far a KPI has travelled from baseline toward target, 0..1
  function travelled(m, pct) { return clamp(pct, 0, 1); }

  /* ---- campaign model -----------------------------------------------------
     One pass that resolves every mission into the shape the board renders:
     persona, KPI travel, pattern/transaction counts, share of the objective and
     the badges earned so far. */
  function campaign() {
    var rt = window.PIQ.missionRuntime();
    var mm = window.PIQ.missionMetrics();
    var selected = {};
    C().patternIds.forEach(function (id) { selected[id] = 1; });

    var rows = mm.map(function (m) {
      var st = rt.byMission[m.mission.id] ||
               { total: 0, done: 0, pending: 0, stp: 0, matched: 0, gates: 0, resolved: 0, value: 0 };
      var pct = st.total ? st.done / st.total : 0;

      // this mission's patterns: every id its capabilities reference, and how
      // many of those the SME actually pulled into the composition
      var own = {}, ownN = 0, active = 0;
      (m.mission.capabilities || []).forEach(function (o) {
        (o.patternIds || []).forEach(function (id) {
          if (own[id]) return;
          own[id] = 1; ownN++;
          if (selected[id]) active++;
        });
      });

      var metrics = m.metrics.map(function (k) {
        var cur = kpiAt(k, pct);
        var hit = k.better === "up" ? cur >= k.target : cur <= k.target;
        return { k: k, cur: cur, travel: travelled(k, pct), hit: hit };
      });

      return {
        mission: m.mission, personas: m.personas, metrics: metrics,
        st: st, pct: pct, patterns: ownN, active: active,
        targetHit: metrics.some(function (x) { return x.hit; }),
      };
    });

    // Share of the objective. Patterns are the execution muscle that moves a
    // KPI, so weight by the patterns a mission actually has in play; if nothing
    // is selected yet, fall back to an even split across capabilities so the
    // parts still add to the whole.
    var totalActive = rows.reduce(function (n, r) { return n + r.active; }, 0);
    var totalCaps = rows.reduce(function (n, r) { return n + r.metrics.length; }, 0);
    rows.forEach(function (r) {
      r.share = totalActive ? r.active / totalActive
              : (totalCaps ? r.metrics.length / totalCaps : (rows.length ? 1 / rows.length : 0));
    });

    rows.forEach(function (r) { r.badges = badgesFor(r); });
    return { rt: rt, rows: rows };
  }

  /* ---- badges: earned from what actually happened, never decorative ------- */
  function badgesFor(r) {
    var s = r.st;
    var settled = s.done;
    return [
      { id: "first", label: "First blood", tip: "First transaction cleared for this mission",
        on: s.matched > 0 || settled > 0 },
      { id: "stp", label: "Straight-through champion", tip: "Over 80% of settled work needed no human touch",
        on: settled > 0 && (s.stp / settled) > 0.8 },
      { id: "dag", label: "DAG master", tip: "Every approval gate this mission raised has been resolved",
        on: s.gates > 0 && s.resolved === s.gates },
      { id: "target", label: "Target breaker", tip: "A capability KPI reached its target",
        on: r.targetHit },
    ];
  }

  /* ---- cross-mission dependencies ----------------------------------------
     Two links, both real and both in the data:
       • shared capability — capability ids (OC-*) are deliberately reused across
         missions, so progress on a shared capability lifts both missions at once
       • process flow — missions are authored in the order the process runs
         (credit → collections → cash application → disputes), so each mission
         hands off to the next. */
  function dependencies(rows) {
    var links = [], pair = {};
    function key(a, b) { return a.mission.id + ">" + b.mission.id; }
    for (var i = 0; i < rows.length; i++) {
      for (var j = i + 1; j < rows.length; j++) {
        var a = rows[i], b = rows[j], shared = [];
        a.metrics.forEach(function (x) {
          b.metrics.forEach(function (y) { if (x.k.capId === y.k.capId) shared.push(x.k); });
        });
        if (shared.length) {
          pair[key(a, b)] = 1;
          links.push({ from: a, to: b, kind: "shared", cap: shared[0],
            label: "shares " + shared[0].capId + " · " + shared[0].kpi });
        }
      }
    }
    // process-flow hand-offs, skipped where a shared capability already links the
    // pair — one line per relationship, and the stronger claim wins
    for (var n = 0; n < rows.length - 1; n++) {
      if (pair[key(rows[n], rows[n + 1])]) continue;
      links.push({ from: rows[n], to: rows[n + 1], kind: "flow", label: "hands off to" });
    }
    return links;
  }

  /* ---- objective gauge (SVG ring, same idiom as the cockpit gauge) -------- */
  function ring(pct, col, cur, unit, label) {
    var r = 52, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 1));
    return '<svg class="mc-ring" width="132" height="132" viewBox="0 0 132 132" role="img" ' +
      'aria-label="' + esc(label) + ' ' + Math.round(pct * 100) + ' percent to target">' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="#e7e1d6" stroke-width="11"/>' +
      '<circle cx="66" cy="66" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="11" ' +
      'stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" ' +
      'transform="rotate(-90 66 66)" class="mc-ringbar"/>' +
      '<text x="66" y="63" text-anchor="middle" font-size="27" font-weight="800" fill="#211c18">' +
        esc(String(cur)) + '</text>' +
      '<text x="66" y="81" text-anchor="middle" font-size="10" font-weight="700" fill="#6c655c" ' +
        'letter-spacing="1">' + esc(String(unit || "").toUpperCase()) + '</text></svg>';
  }

  function objectiveBand(cmp) {
    var obj = window.PIQ.objective();
    if (!obj) {
      var d = el("div", "mc-noobj",
        '<div class="kv">Mission Command</div><h2>No objective selected</h2>' +
        '<p>This board shows how every mission converges on one business objective. ' +
        'Pick an objective in the <b>Mission Builder</b> and the campaign appears here.</p>' +
        '<button class="btn go" id="mcToStudio">← Go to Mission Builder</button>');
      d.querySelector("#mcToStudio").onclick = function () { window.PIQ.go("studio"); };
      return d;
    }
    var k = obj.compoundKPI || {};
    // campaign progress = the mean KPI travel across every mission in the field,
    // weighted by each mission's share of the objective
    var prog = cmp.rows.reduce(function (n, r) { return n + r.pct * r.share; }, 0);
    var cur = (k.current != null && k.target != null)
      ? round(k.current + (k.target - k.current) * prog, k.unit === "days" ? 1 : 0)
      : "—";
    var col = obj.accent || "#d3600f";
    var moved = (k.current != null) ? round(Math.abs(cur - k.current), 1) : 0;

    var band = el("div", "mc-obj");
    band.style.setProperty("--oc", col);
    band.innerHTML =
      '<div class="mc-ringwrap">' + ring(prog, col, cur, k.unit, k.name) + '</div>' +
      '<div class="mc-objmain">' +
        '<div class="kv">Campaign objective</div>' +
        '<h2>' + esc(obj.name) + '</h2>' +
        '<p class="mc-tag">' + esc(obj.tagline || "") + '</p>' +
        '<div class="mc-kpi">' +
          '<span class="mc-kn">' + esc(k.name || "") + '</span>' +
          (k.formula ? '<span class="mc-kf mono">' + esc(k.formula) + '</span>' : '') +
        '</div>' +
        '<div class="mc-track">' +
          '<span class="mc-tv"><b>' + esc(String(k.current)) + '</b><small>start</small></span>' +
          '<span class="mc-tbar"><i style="width:' + Math.round(clamp(prog, 0, 1) * 100) + '%"></i></span>' +
          '<span class="mc-tv"><b>' + esc(String(k.target)) + '</b><small>target</small></span>' +
        '</div>' +
      '</div>' +
      '<div class="mc-objstat">' +
        '<div class="mc-big">' + Math.round(prog * 100) + '<small>%</small></div>' +
        '<div class="mc-blab">campaign progress</div>' +
        '<div class="mc-sub">' + cmp.rows.length + ' missions in the field</div>' +
        '<div class="mc-sub">' + (cmp.rt.started
            ? cmp.rt.cursor + ' of ' + cmp.rt.queued + ' transactions processed'
            : 'campaign not started') + '</div>' +
        (moved ? '<div class="mc-moved">' + esc(k.name) + ' moved ' + moved + ' ' +
                 esc(k.unit || "") + '</div>' : '') +
      '</div>';
    return band;
  }

  /* ---- one persona mission card ------------------------------------------ */
  function missionCard(r, rank) {
    var p = r.personas;
    var card = el("div", "mc-card" + (r.pct > 0 ? " live" : ""));
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.title = "Open " + r.mission.name + " in Mission Operations";

    var bars = r.metrics.map(function (x) {
      var k = x.k;
      return '<div class="mc-m">' +
        '<div class="mc-mh"><span class="mc-mk">' + esc(k.kpi) + '</span>' +
          '<span class="mc-mv' + (x.hit ? " hit" : "") + '">' + esc(fmt(x.cur, k.unit)) +
          (x.hit ? ' <i>✓</i>' : '') + '</span></div>' +
        '<div class="mc-mbar' + (x.travel >= 0.66 ? " ok" : (x.travel >= 0.25 ? " mid" : "")) + '">' +
          '<i style="width:' + Math.round(x.travel * 100) + '%"></i></div>' +
        '<div class="mc-mf"><span>' + esc(fmt(k.baseline, k.unit)) + '</span>' +
          '<span>target ' + esc(fmt(k.target, k.unit)) + '</span></div>' +
      '</div>';
    }).join("") || '<div class="mc-mnone">No measured capability in scope.</div>';

    var badges = r.badges.map(function (b) {
      return '<span class="mc-badge' + (b.on ? " on b-" + b.id : "") + '" title="' + esc(b.tip) + '">' +
        esc(b.label) + '</span>';
    }).join("");

    card.innerHTML =
      '<div class="mc-ch">' +
        '<span class="mc-av">' + esc(p.accountable.initials) +
          (rank < 3 ? '<i class="mc-rank" style="background:' + MEDAL[rank] + '">' + (rank + 1) + '</i>' : '') +
        '</span>' +
        '<span class="mc-who"><b>' + esc(p.accountable.role) + '</b>' +
          '<small>' + esc(p.cadence || "") + (p.responsible.length ? ' · ' + p.responsible.length + ' operating roles' : '') +
        '</small></span>' +
      '</div>' +
      '<div class="mc-stmt">' + esc(r.mission.name) + '</div>' +
      '<div class="mc-metrics">' + bars + '</div>' +
      '<div class="mc-exec">' +
        '<span class="mc-e"><b>' + r.active + '</b> of ' + r.patterns + ' patterns active</span>' +
        '<span class="mc-e"><b>' + r.st.done + '</b> of ' + r.st.total + ' transactions cleared</span>' +
        (r.st.pending ? '<span class="mc-e warn"><b>' + r.st.pending + '</b> awaiting approval</span>' : '') +
      '</div>' +
      '<div class="mc-contrib">' +
        '<span class="mc-cl">Contributing</span>' +
        '<span class="mc-cbar"><i style="width:' + Math.round(r.share * 100) + '%"></i></span>' +
        '<span class="mc-cv">' + Math.round(r.share * 100) + '%</span>' +
      '</div>' +
      '<div class="mc-badges">' + badges + '</div>';

    function open() { window.PIQ.go("runtime"); }
    card.onclick = open;
    card.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    return card;
  }

  /* ---- the dependency board ---------------------------------------------- */
  function dependencyBoard(rows) {
    var links = dependencies(rows);
    var wrap = el("div", "mc-deps");
    wrap.appendChild(el("div", "mc-h",
      'Cross-mission dependencies <small>where one mission\'s progress lifts another\'s ceiling</small>'));
    if (!links.length) {
      wrap.appendChild(el("div", "mc-mnone", "Only one mission in scope — no cross-mission dependencies."));
      return wrap;
    }
    var list = el("div", "mc-dlist");
    links.forEach(function (l) {
      var done = l.from.pct >= 0.99;
      list.appendChild(el("div", "mc-dep k-" + l.kind + (done ? " unlocked" : ""),
        '<span class="mc-dfrom">' + esc(l.from.personas.accountable.role) + '</span>' +
        '<span class="mc-darr"><i>' + esc(l.label) + '</i>→</span>' +
        '<span class="mc-dto">' + esc(l.to.personas.accountable.role) + '</span>' +
        '<span class="mc-dstate">' + (done ? "unlocked" : Math.round(l.from.pct * 100) + "% to unlock") + '</span>'));
    });
    wrap.appendChild(list);
    return wrap;
  }

  /* ---- render ------------------------------------------------------------ */
  function render(view) {
    if (!C().procId) { view.appendChild(empty()); return; }
    var cmp = campaign();
    var root = el("div", "mc");

    var f = window.PIQ.fn(), p = window.PIQ.proc();
    root.appendChild(el("div", "mc-head",
      '<div><div class="kv">Run & Monitor — Campaign HQ</div>' +
      '<h2>' + esc((f || {}).name || "") + ' › ' + esc((p || {}).name || "") +
      ' <span class="livedot">● LIVE</span></h2></div>' +
      '<div class="mc-ctrl"><button class="btn go sm" id="mcOps">Open Mission Operations →</button></div>'));

    root.appendChild(objectiveBand(cmp));

    if (cmp.rows.length) {
      root.appendChild(el("div", "mc-h",
        'Persona missions <small>each front of the campaign · click a card to work its queue</small>'));
      // leaderboard order: furthest along first, so the board reads as a standing
      var ranked = cmp.rows.slice().sort(function (a, b) {
        return (b.pct - a.pct) || (b.share - a.share);
      });
      var grid = el("div", "mc-grid");
      ranked.forEach(function (r, i) { grid.appendChild(missionCard(r, i)); });
      root.appendChild(grid);
      root.appendChild(dependencyBoard(cmp.rows));
    } else {
      root.appendChild(el("div", "mc-mnone", "No missions in scope. Select missions in the Mission Builder."));
    }

    view.appendChild(root);
    var b = root.querySelector("#mcOps");
    if (b) b.onclick = function () { window.PIQ.go("runtime"); };
  }

  function empty() {
    var d = el("div", "fit-empty",
      '<div class="kv">Mission Command</div><h2>No campaign composed</h2>' +
      '<p>Compose a process in the <b>Mission Builder</b> — objective, missions and patterns — ' +
      'and the campaign board appears here.</p>' +
      '<button class="btn go" id="mcStudio">← Go to Mission Builder</button>');
    d.querySelector("#mcStudio").onclick = function () { window.PIQ.go("studio"); };
    return d;
  }

  window.PIQ.modules.missioncmd = { render: render };
})();
