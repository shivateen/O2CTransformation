/* Mission Command · Persona View
 * The per-persona drill-down — what a Collections Lead or a Cash Application
 * Lead actually sees. Campaign HQ answers "how is the objective doing"; this
 * answers "how is MY mission doing, and what is still on my table".
 *
 * Four bands:
 *   1. Header      — who they are, their mission, their share of the objective
 *   2. KPI board   — each capability's KPI with a gauge, driving patterns, trend
 *   3. Their queue — the transaction stream filtered to this mission's patterns
 *   4. Improvement — value captured, value on the table, and what to do next
 *
 * Deterministic throughout: the trend sparkline is an interpolation of the KPI's
 * own baseline→current journey, not invented data, and every counter comes from
 * PIQ.missionQueue / PIQ.missionRuntime — the same simulator Mission Operations
 * runs.
 */
(function () {
  "use strict";
  var PRIO = window.PIQ.meta.priorityLegend;

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function C() { return window.PIQ.composition; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function round(v, d) { var f = Math.pow(10, d || 0); return Math.round(v * f) / f; }
  function money(n) { return window.PIQ.E._money(n); }

  var LANE = ["#8e44ad", "#2980b9", "#16a085", "#d68910", "#c0392b", "#7c4dff", "#e0529c", "#2c7a5f"];

  function fmt(v, unit) {
    if (unit === "$")  return "$" + v;
    if (unit === "$K") return "$" + v + "K";
    if (unit === "$M") return "$" + v + "M";
    if (unit === "%")  return v + "%";
    return String(v);
  }
  function kpiAt(m, pct) {
    var v = m.baseline + (m.target - m.baseline) * pct;
    return round(v, Math.abs(v) < 20 ? 1 : 0);
  }

  /* which mission is in focus — set by a Campaign HQ card, else the first */
  function focused(rows) {
    var want = window.PIQ.personaFocus;
    var hit = rows.filter(function (r) { return r.mission.id === want; })[0];
    return hit || rows[0] || null;
  }

  function model() {
    var rt = window.PIQ.missionRuntime();
    var weights = window.PIQ.missionWeights();
    var selected = {};
    C().patternIds.forEach(function (id) { selected[id] = 1; });

    return window.PIQ.missionMetrics().map(function (m, i) {
      var st = rt.byMission[m.mission.id] ||
               { total: 0, done: 0, pending: 0, stp: 0, matched: 0, gates: 0, resolved: 0, value: 0 };
      var pct = st.total ? st.done / st.total : 0;
      var patIds = [], active = [];
      (m.mission.capabilities || []).forEach(function (o) {
        (o.patternIds || []).forEach(function (id) {
          if (patIds.indexOf(id) < 0) patIds.push(id);
          if (selected[id] && active.indexOf(id) < 0) active.push(id);
        });
      });
      var captured = st.value;
      return {
        mission: m.mission, personas: m.personas, metrics: m.metrics, st: st, pct: pct,
        patIds: patIds, active: active, captured: captured,
        onTable: Math.round(captured / (pct || 1) * (1 - pct)),
        share: weights[m.mission.id] || 0, lane: LANE[i % LANE.length],
        proc: window.PIQ.missionProc(m.mission.id),
      };
    });
  }

  /* ---- persona switcher --------------------------------------------------- */
  function rail(rows, cur) {
    var r = el("div", "fp-chips");
    rows.forEach(function (row, i) {
      var b = el("button", "fp-chip" + (row.mission.id === cur.mission.id ? " on" : ""),
        '<span class="fp-av" style="background:' + row.lane + '">' +
          esc(row.personas.accountable.initials) + '</span>' +
        '<span class="fp-txt"><b>' + esc(row.personas.accountable.role) + '</b>' +
        '<small>' + Math.round(row.share * 100) + '% of objective</small></span>');
      b.onclick = function () { window.PIQ.personaFocus = row.mission.id; window.PIQ.go("missionpersona"); };
      r.appendChild(b);
    });
    return r;
  }

  /* ---- 1 · header --------------------------------------------------------- */
  function header(row) {
    var obj = window.PIQ.objective();
    var k = obj && obj.compoundKPI ? obj.compoundKPI : {};
    var h = el("div", "pv-head");
    h.style.setProperty("--lane", row.lane);
    h.innerHTML =
      '<span class="pv-av" style="background:' + row.lane + '">' +
        esc(row.personas.accountable.initials) + '</span>' +
      '<div class="pv-hmain">' +
        '<div class="kv">' + esc(row.proc ? row.proc.name : "") +
          (row.personas.cadence ? ' · ' + esc(row.personas.cadence) : '') + '</div>' +
        '<h2>' + esc(row.personas.accountable.role) + '</h2>' +
        '<p class="pv-stmt">' + esc(row.mission.name) + '</p>' +
        '<div class="pv-team">' +
          teamRow("Operates", row.personas.responsible) +
          teamRow("Approves", row.personas.approvers) +
        '</div>' +
      '</div>' +
      '<div class="pv-contrib">' +
        '<div class="pv-cv">' + Math.round(row.share * 100) + '<small>%</small></div>' +
        '<div class="pv-cl">contributing to<br><b>' + esc(k.name || (obj ? obj.name : "the objective")) + '</b></div>' +
      '</div>';
    return h;
  }
  function teamRow(label, list) {
    if (!list || !list.length) return "";
    return '<span class="pv-tr"><i>' + label + '</i>' +
      list.slice(0, 4).map(function (x) { return '<span class="rchip">' + esc(x) + '</span>'; }).join("") +
      '</span>';
  }

  /* ---- 2 · KPI board ------------------------------------------------------ */
  /* The sparkline is an honest interpolation: 12 weekly points walking the KPI
     from its baseline to where the simulator has actually taken it. It shows the
     shape of the journey travelled so far — it does not forecast. */
  function sparkline(m, pct, col) {
    var N = 12, W = 132, H = 30, pts = [];
    var lo = Math.min(m.baseline, m.target), hi = Math.max(m.baseline, m.target);
    var span = (hi - lo) || 1;
    for (var i = 0; i < N; i++) {
      var t = (i / (N - 1)) * clamp(pct, 0, 1);
      // ease-out: early weeks move fastest, which is how these programmes land
      var e = 1 - Math.pow(1 - t, 1.7);
      var v = m.baseline + (m.target - m.baseline) * e;
      var x = (i / (N - 1)) * W;
      var y = H - ((v - lo) / span) * H;
      pts.push([round(x, 1), round(clamp(y, 1, H - 1), 1)]);
    }
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0] + "," + p[1]; }).join(" ");
    var area = d + " L" + W + "," + H + " L0," + H + " Z";
    var last = pts[pts.length - 1];
    return '<svg class="pv-spark" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" ' +
      'role="img" aria-label="12-week trend"><path d="' + area + '" fill="' + col + '" opacity="0.10"/>' +
      '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="' + col + '"/></svg>';
  }

  function gauge(pct, col) {
    var r = 26, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 1));
    return '<svg class="pv-g" width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">' +
      '<circle cx="33" cy="33" r="' + r + '" fill="none" stroke="#e7e1d6" stroke-width="7"/>' +
      '<circle cx="33" cy="33" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="7" ' +
      'stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" ' +
      'transform="rotate(-90 33 33)"/>' +
      '<text x="33" y="37" text-anchor="middle" font-size="14" font-weight="800" fill="#211c18">' +
        Math.round(clamp(pct, 0, 1) * 100) + '</text></svg>';
  }

  function kpiBoard(row) {
    var wrap = el("div", "pv-sec");
    wrap.appendChild(el("div", "mc-h",
      'KPI dashboard <small>every capability this mission owns · trend is the journey travelled so far</small>'));
    if (!row.metrics.length) {
      wrap.appendChild(el("div", "mc-mnone", "No measured capability in scope for this mission."));
      return wrap;
    }
    var grid = el("div", "pv-kgrid");
    // PIQ.missionMetrics() yields flat metric records
    // ({capId, capName, kpi, unit, baseline, target, better}) — use them directly.
    row.metrics.forEach(function (k) {
      var cur = kpiAt(k, row.pct);
      var hit = k.better === "up" ? cur >= k.target : cur <= k.target;
      // which patterns drive this KPI
      var drivers = (row.mission.capabilities || []).filter(function (o) { return o.id === k.capId; })
        .reduce(function (acc, o) { return acc.concat(o.patternIds || []); }, [])
        .map(window.PIQ.pattern).filter(Boolean);
      var chips = drivers.slice(0, 5).map(function (p) {
        return '<span class="pv-pat"><i style="background:' + PRIO[p.priority] + '"></i>' + esc(p.name) + '</span>';
      }).join("") + (drivers.length > 5 ? '<span class="pv-pat more">+' + (drivers.length - 5) + '</span>' : '') ||
        '<span class="pv-pat none">no patterns authored yet</span>';

      grid.appendChild(el("div", "pv-kcard" + (hit ? " hit" : ""),
        '<div class="pv-kh">' + gauge(row.pct, row.lane) +
          '<div class="pv-kt"><span class="pv-kn">' + esc(k.kpi) + '</span>' +
          '<span class="pv-kv">' + esc(fmt(cur, k.unit)) + (hit ? ' <i>✓ at target</i>' : '') + '</span>' +
          '<span class="pv-kr">' + esc(fmt(k.baseline, k.unit)) + ' → target ' +
            esc(fmt(k.target, k.unit)) + '</span></div>' +
          sparkline(k, row.pct, row.lane) + '</div>' +
        '<div class="pv-kcap">' + esc(k.capId) + ' · ' + esc(k.capName) + '</div>' +
        '<div class="pv-kdrv"><span class="flab">Driven by</span>' + chips + '</div>'));
    });
    wrap.appendChild(grid);
    return wrap;
  }

  /* ---- 3 · their transaction stream --------------------------------------- */
  function stream(row) {
    var q = window.PIQ.missionQueue(row.mission.id);
    var wrap = el("div", "pv-sec");
    var settled = row.st.done, stpPct = settled ? Math.round(100 * row.st.stp / settled) : 0;

    wrap.appendChild(el("div", "mc-h",
      'Their transaction queue <small>only the work this mission owns · ' +
      q.rows.length + ' of ' + (window.PIQ.missionRuntime().queued || 0) + ' transactions</small>'));

    wrap.appendChild(el("div", "pv-stats",
      stat(stpPct + "%", "Straight-through") +
      stat(row.st.matched, "Matched to their patterns") +
      stat(row.st.pending, "Pending their approval") +
      stat(money(row.captured), "Value released")));

    var rows = q.rows.slice(0, 12).map(function (item) {
      var t = item.t;
      var badge, sub;
      if (t.status === "queued") { badge = '<span class="rtx-b q">queued</span>'; sub = ""; }
      else if (t.kind === "clean") { badge = '<span class="rtx-b stp">STRAIGHT-THROUGH</span>'; sub = "happy path · touchless"; }
      else {
        var p = window.PIQ.pattern(t.patternId);
        if (t.status === "pending") badge = '<span class="rtx-b pend">AWAITING YOUR APPROVAL</span>';
        else if (t.status === "approved") badge = '<span class="rtx-b appr">APPROVED ✓</span>';
        else if (t.status === "rejected") badge = '<span class="rtx-b rej">REJECTED ✕</span>';
        else badge = '<span class="rtx-b auto">AUTO-RESOLVED</span>';
        sub = 'matched <b>' + esc(p ? p.name : "pattern") + '</b>';
      }
      return '<div class="rtx s-' + t.status + '"><div class="rtx-n">' + t.n + '</div>' +
        '<div class="rtx-main"><div class="rtx-id">' + esc(t.id) + ' · ' + esc(t.entity) +
        '<span class="rtx-amt">' + money(t.amt) + '</span></div>' +
        '<div class="rtx-sub">' + sub + '</div></div>' + badge + '</div>';
    }).join("");

    var box = el("div", "rt-stream pv-stream", rows ||
      '<div class="ap-empty">Nothing in this mission’s queue yet.</div>');
    wrap.appendChild(box);
    if (q.rows.length > 12) {
      wrap.appendChild(el("div", "pv-more", "Showing 12 of " + q.rows.length +
        " — open Mission Operations to work the full queue."));
    }
    return wrap;
  }
  function stat(v, l) {
    return '<div class="rkpi"><b>' + esc(String(v)) + '</b><span>' + esc(l) + '</span></div>';
  }

  /* ---- 4 · improvement scope ---------------------------------------------- */
  /* Unrealised value per pattern: the mission's remaining value split across the
     patterns it owns, weighted by how much of the library is still unexecuted.
     Patterns already in the composition are discounted — the biggest opportunity
     is a high-priority pattern that is NOT yet switched on. */
  function improvement(row) {
    var wrap = el("div", "pv-sec");
    wrap.appendChild(el("div", "mc-h",
      'Improvement scope <small>what is captured, what is still on the table, and what to switch on next</small>'));

    var sel = {}; C().patternIds.forEach(function (id) { sel[id] = 1; });
    var PRI = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    var scored = row.patIds.map(window.PIQ.pattern).filter(Boolean).map(function (p) {
      var on = !!sel[p.id];
      var w = (PRI[p.priority] || 1) * (1 + (p.branchingDAG || []).length * 0.25);
      // an inactive pattern carries its whole value as opportunity; an active one
      // only the part its mission has not yet delivered
      return { p: p, on: on, w: w * (on ? (1 - clamp(row.pct, 0, 1)) : 1) };
    }).sort(function (a, b) { return b.w - a.w; });

    var totW = scored.reduce(function (n, x) { return n + x.w; }, 0) || 1;
    var top = scored.slice(0, 3);

    wrap.appendChild(el("div", "pv-scope",
      '<div class="pv-sc"><span class="pv-scl">Value captured</span>' +
        '<span class="pv-scv good">' + money(row.captured) + '</span>' +
        '<span class="pv-scd">attributed to this mission so far</span></div>' +
      '<div class="pv-sc"><span class="pv-scl">Value on the table</span>' +
        '<span class="pv-scv bad">' + money(row.onTable) + '</span>' +
        '<span class="pv-scd">' + Math.round((1 - clamp(row.pct, 0, 1)) * 100) + '% of this mission’s journey remains</span></div>' +
      '<div class="pv-sc"><span class="pv-scl">Patterns in play</span>' +
        '<span class="pv-scv">' + row.active.length + ' / ' + row.patIds.length + '</span>' +
        '<span class="pv-scd">' + (row.patIds.length - row.active.length) + ' available but not switched on</span></div>'));

    if (top.length) {
      var list = el("div", "pv-recs");
      top.forEach(function (x, i) {
        var share = Math.round(x.w / totW * 100);
        list.appendChild(el("div", "pv-rec" + (x.on ? " on" : ""),
          '<span class="pv-rn">' + (i + 1) + '</span>' +
          '<span class="pat-prio" style="background:' + PRIO[x.p.priority] + '"></span>' +
          '<div class="pv-rmain"><div class="pv-rt">' + esc(x.p.name) + '</div>' +
            '<div class="pv-rd">' + esc(x.p.category || "") + ' · ' +
              (x.p.branchingDAG || []).length + ' dynamic branches</div></div>' +
          '<span class="pv-rw">' + share + '%<small>of remaining</small></span>' +
          '<span class="pv-rs ' + (x.on ? "on" : "off") + '">' + (x.on ? "active" : "not active") + '</span>'));
      });
      wrap.appendChild(list);
      var offTop = top.filter(function (x) { return !x.on; })[0];
      wrap.appendChild(el("div", "pv-nextup",
        offTop
          ? '<b>Recommendation</b> — switch on <b>' + esc(offTop.p.name) + '</b>. It is ' +
            esc(String(offTop.p.priority).toLowerCase()) + ' priority and carries the largest unrealised ' +
            'share of this mission’s remaining value.'
          : '<b>Recommendation</b> — every pattern this mission owns is already active. The remaining ' +
            money(row.onTable) + ' comes from working the queue, not from adding patterns.'));
    }
    return wrap;
  }

  /* ---- render -------------------------------------------------------------- */
  function render(view) {
    if (!C().procIds || !C().procIds.length) { view.appendChild(empty()); return; }
    var rows = model();
    if (!rows.length) { view.appendChild(empty()); return; }
    var row = focused(rows);

    var root = el("div", "mc pv");
    root.appendChild(el("div", "mc-head",
      '<div><div class="kv">Mission Command — Persona View</div>' +
      '<h2>' + esc(row.personas.accountable.role) + ' <span class="livedot">● LIVE</span></h2></div>' +
      '<div class="mc-ctrl"><button class="btn sm" id="pvHq">← Campaign HQ</button>' +
      '<button class="btn go sm" id="pvOps">Work the queue →</button></div>'));

    root.appendChild(rail(rows, row));
    root.appendChild(header(row));
    root.appendChild(kpiBoard(row));
    root.appendChild(stream(row));
    root.appendChild(improvement(row));
    view.appendChild(root);

    var hq = root.querySelector("#pvHq");
    if (hq) hq.onclick = function () { window.PIQ.go("missionhq"); };
    var ops = root.querySelector("#pvOps");
    if (ops) ops.onclick = function () {
      window.PIQ.runtimeFocus = row.mission.id;   // land on their outcomes, not everyone's
      window.PIQ.go("runtime");
    };
  }

  function empty() {
    var d = el("div", "fit-empty",
      '<div class="kv">Mission Command — Persona View</div><h2>No mission in scope</h2>' +
      '<p>Compose the transformation in the <b>Transformation Builder</b>, then pick a persona ' +
      'from <b>Campaign HQ</b> to see their board.</p>' +
      '<button class="btn go" id="pvStudio">← Go to Transformation Builder</button>');
    d.querySelector("#pvStudio").onclick = function () { window.PIQ.go("studio"); };
    return d;
  }

  window.PIQ.modules.missionpersona = { render: render };
})();
