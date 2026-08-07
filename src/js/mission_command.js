/* Mission Command · Campaign HQ
 * The objective-level view — "how are we doing against the outcome we bought?"
 *
 * Mission Operations shows one analyst working one queue. This shows the whole
 * multi-front campaign converging on a single objective: the compound KPI as a
 * gauge, a Sankey of objective → persona missions → KPI impact, and a card per
 * mission carrying the value it has captured and the value still on the table.
 *
 * Everything is derived — no Math.random, no Date.now. Live counters come from
 * PIQ.missionRuntime() (the same simulator Mission Operations runs, so the two
 * boards can never disagree); structure and weighting come from the taxonomy.
 */
(function () {
  "use strict";

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

  /* ---- campaign model ---------------------------------------------------- */
  function campaign() {
    var rt = window.PIQ.missionRuntime();
    var mm = window.PIQ.missionMetrics();
    var weights = window.PIQ.missionWeights();
    var selected = {};
    C().patternIds.forEach(function (id) { selected[id] = 1; });

    var rows = mm.map(function (m, i) {
      var st = rt.byMission[m.mission.id] ||
               { total: 0, done: 0, pending: 0, stp: 0, matched: 0, gates: 0, resolved: 0, value: 0 };
      var pct = st.total ? st.done / st.total : 0;

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
        // what is still unrealised on this KPI, in the KPI's own unit
        var gap = round(Math.abs(k.target - cur), Math.abs(k.target - cur) < 20 ? 1 : 0);
        return { k: k, cur: cur, hit: hit, gap: gap, travel: clamp(pct, 0, 1) };
      });

      // value on the table: the share of the run-rate this mission has NOT yet
      // converted, scaled by how much of its KPI journey remains
      var captured = st.value;
      var onTable = Math.round(captured / (pct || 1) * (1 - pct));

      return {
        mission: m.mission, personas: m.personas, metrics: metrics, st: st, pct: pct,
        patterns: ownN, active: active, captured: captured, onTable: onTable,
        share: weights[m.mission.id] || 0, lane: LANE[i % LANE.length],
        proc: window.PIQ.missionProc(m.mission.id),
      };
    });
    return { rt: rt, rows: rows };
  }

  /* ---- objective gauge (SVG ring) ---------------------------------------- */
  function ring(pct, col, cur, unit, label) {
    var r = 58, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 1));
    return '<svg class="mc-ring" width="146" height="146" viewBox="0 0 146 146" role="img" ' +
      'aria-label="' + esc(label) + ' — ' + Math.round(pct * 100) + ' percent to target">' +
      '<circle cx="73" cy="73" r="' + r + '" fill="none" stroke="#e7e1d6" stroke-width="12"/>' +
      '<circle cx="73" cy="73" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="12" ' +
      'stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" ' +
      'transform="rotate(-90 73 73)" class="mc-ringbar"/>' +
      '<text x="73" y="70" text-anchor="middle" font-size="30" font-weight="800" fill="#211c18">' +
        esc(String(cur)) + '</text>' +
      '<text x="73" y="89" text-anchor="middle" font-size="10" font-weight="700" fill="#6c655c" ' +
        'letter-spacing="1">' + esc(String(unit || "").toUpperCase()) + '</text></svg>';
  }

  function objectiveBand(cmp) {
    var obj = window.PIQ.objective();
    if (!obj) {
      var d = el("div", "mc-noobj",
        '<div class="kv">Mission Command</div><h2>No objective selected</h2>' +
        '<p>This board shows how every mission converges on one business objective. ' +
        'Pick an objective in the <b>Transformation Builder</b> and the campaign appears here.</p>' +
        '<button class="btn go" id="mcToStudio">← Go to Transformation Builder</button>');
      d.querySelector("#mcToStudio").onclick = function () { window.PIQ.go("studio"); };
      return d;
    }
    var k = obj.compoundKPI || {};
    var prog = cmp.rows.reduce(function (n, r) { return n + r.pct * r.share; }, 0);
    var cur = (k.current != null && k.target != null)
      ? round(k.current + (k.target - k.current) * prog, k.unit === "days" ? 1 : 0) : "—";
    var col = obj.accent || "#d3600f";
    var moved = (k.current != null && cur !== "—") ? round(Math.abs(cur - k.current), 1) : 0;
    var onTable = cmp.rows.reduce(function (n, r) { return n + r.onTable; }, 0);

    var band = el("div", "mc-obj");
    band.style.setProperty("--oc", col);
    band.innerHTML =
      '<div class="mc-ringwrap">' + ring(prog, col, cur, k.unit, k.name) + '</div>' +
      '<div class="mc-objmain">' +
        '<div class="kv">Campaign objective</div>' +
        '<h2>' + esc(obj.name) + '</h2>' +
        '<p class="mc-tag">' + esc(obj.tagline || "") + '</p>' +
        '<div class="mc-kpi"><span class="mc-kn">' + esc(k.name || "") + '</span>' +
          (k.formula ? '<span class="mc-kf mono">' + esc(k.formula) + '</span>' : '') + '</div>' +
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
        (moved ? '<div class="mc-moved">' + esc(k.name) + ' moved ' + moved + ' ' + esc(k.unit || "") + '</div>' : '') +
        (onTable ? '<div class="mc-table">' + money(onTable) + ' still on the table</div>' : '') +
      '</div>';
    return band;
  }

  /* ---- Sankey: objective → persona missions → KPI impact ------------------
     Pure inline SVG. Flow width = the mission's contribution weight; the right
     stub is filled to the share of that flow actually realised so far, so the
     picture reads as "how much of what this mission owes has landed". */
  /* ---- Sankey: objective -> persona missions -> KPI impact ----------------
     Pure inline SVG. Ribbon width is the mission's share of the objective; the
     filled core is the share of that already delivered. Mission nodes expand
     inline, and the "Show all details" toggle pins every panel open so the board
     can be read (or walked through on a screen) without clicking. */
  var SK_W = 1080, SK_HEAD = 34, SK_PAD_T = 22, SK_PAD_B = 16;
  var SK_OX = 16,  SK_OW = 150;
  var SK_MX = 372, SK_MW = 300;
  var SK_KX = 830, SK_KW = 234;
  var SK_GAP = 8, SK_CONTENT = 560, SK_MIN = 58, SK_BARMIN = 76, SK_OPEN = 226;
  var SK_TOP = SK_HEAD + SK_PAD_T;   /* first node sits below the tower headers */

  /* Pipe breadth is the mission's share of the objective, full stop — it is NOT
     clamped to the node's minimum height. A 2% mission therefore draws a hairline
     and a 22% mission draws a band eleven times thicker, which is the whole point
     of the picture. Node height keeps its own floor so the text stays readable. */
  function flowW(r) { return Math.max(3, r.share * SK_CONTENT); }

  var mcExpanded = null;      /* mission id currently expanded, or null */
  var mcPinAll = false;       /* details-always-on toggle */
  var mcAnim = null;

  function sankeyLayout(rows, expanded, pinAll) {
    var i, hs = [], open = [];
    for (i = 0; i < rows.length; i++) {
      hs.push(Math.max(SK_MIN, rows[i].share * SK_CONTENT));
      open.push(pinAll || expanded === rows[i].mission.id);
      if (open[i]) hs[i] = Math.max(hs[i], SK_OPEN);
    }
    var missions = [], y = SK_TOP;
    for (i = 0; i < rows.length; i++) {
      missions.push({ r: rows[i], idx: i, x: SK_MX, w: SK_MW, y: y, h: hs[i], open: open[i] });
      y += hs[i] + SK_GAP;
    }
    var total = y - SK_GAP - SK_TOP;
    return { missions: missions, total: total,
             obj: { x: SK_OX, w: SK_OW, y: SK_TOP, h: total },
             height: SK_TOP + total + SK_PAD_B };
  }

  function sankeyLerp(a, b, t) {
    function n(x, y) { return x + (y - x) * t; }
    var out = { height: n(a.height, b.height), total: n(a.total, b.total),
                obj: { x: a.obj.x, w: a.obj.w, y: n(a.obj.y, b.obj.y), h: n(a.obj.h, b.obj.h) },
                missions: [] };
    for (var i = 0; i < a.missions.length; i++) {
      var s0 = a.missions[i], s1 = b.missions[i], o = {};
      for (var k in s0) o[k] = s0[k];
      o.y = n(s0.y, s1.y); o.h = n(s0.h, s1.h);
      o.open = t > 0.5 ? s1.open : s0.open;
      out.missions.push(o);
    }
    return out;
  }

  function sankeyDraw(L, obj) {
    var s = '', i;
    var oc = (obj && obj.accent) || "#d3600f";

    /* flows: objective -> mission, then mission -> its KPI impact node.
       Width = contribution share; the brighter core inside is the part delivered. */
    for (i = 0; i < L.missions.length; i++) {
      var n = L.missions[i], r = n.r;
      var base = Math.max(SK_MIN, r.share * SK_CONTENT);
      var mid = n.y + Math.min(n.h, base) / 2;
      var fw = flowW(r);
      var core = Math.max(2, fw * clamp(r.pct, 0.04, 1));
      s += '<g class="mcs-flow" data-flow="o:' + esc(r.mission.id) + '">' +
           ribbon(L.obj.x + L.obj.w, mid, n.x, mid, fw, core, r.lane, 0.24) + '</g>';
      s += '<g class="mcs-flow" data-flow="k:' + esc(r.mission.id) + '">' +
           ribbon(n.x + n.w, mid, SK_KX, mid, fw, core, r.lane, 0.32) + '</g>';
    }

    /* tower headers, sitting above their columns */
    s += tower(SK_OX, SK_OW, 'OBJECTIVE', 'what we are steering to');
    s += tower(SK_MX, SK_MW, 'PERSONA & MISSION', 'who holds it, and what they owe');
    s += tower(SK_KX, SK_KW, 'OUTCOME', 'the KPI it lands on');

    /* objective node */
    var k = (obj && obj.compoundKPI) || {};
    s += '<rect x="' + L.obj.x + '" y="' + L.obj.y.toFixed(1) + '" width="' + L.obj.w +
         '" height="' + L.obj.h.toFixed(1) + '" rx="9" fill="' + oc + '" opacity="0.12" stroke="' + oc + '" stroke-width="1.5"/>';
    var t = wrapText((obj && obj.name) || "Objective", 16);
    for (i = 0; i < t.length; i++) {
      s += '<text class="mcs-t" x="' + (L.obj.x + 14) + '" y="' + (L.obj.y + 26 + i * 15) + '">' + esc(t[i]) + '</text>';
    }
    if (k.name) {
      s += '<text class="mcs-s" x="' + (L.obj.x + 14) + '" y="' + (L.obj.y + 76) + '">' + esc(k.name) + '</text>';
      s += '<text class="mcs-n" x="' + (L.obj.x + 14) + '" y="' + (L.obj.y + 97) + '">' +
           esc(k.current) + ' → ' + esc(k.target) + '</text>';
      s += '<text class="mcs-s" x="' + (L.obj.x + 14) + '" y="' + (L.obj.y + 113) + '">' + esc(k.unit || "") + '</text>';
    }

    /* mission nodes, then the KPI-impact node each one lands on */
    for (i = 0; i < L.missions.length; i++) s += sankeyMission(L.missions[i]);
    for (i = 0; i < L.missions.length; i++) s += sankeyImpact(L.missions[i]);

    return '<svg viewBox="0 0 ' + SK_W + ' ' + Math.round(L.height) + '" width="100%" role="img" ' +
           'aria-label="Flow from the objective through ' + L.missions.length +
           ' persona missions to their KPI impact">' + s + '</svg>';
  }

  function sankeyMission(n) {
    var r = n.r, x = n.x, y = n.y, w = n.w, h = n.h, p = r.personas;
    var s = '<g class="mcs-node" data-mission="' + esc(r.mission.id) + '" tabindex="0" role="button" ' +
            'aria-expanded="' + (n.open ? 'true' : 'false') + '">';
    s += '<rect class="mcs-box" x="' + x + '" y="' + y.toFixed(1) + '" width="' + w + '" height="' + h.toFixed(1) +
         '" rx="9" fill="#fff" stroke="' + r.lane + '" stroke-width="1.5"/>';
    s += '<circle cx="' + (x + 24) + '" cy="' + (y + 24) + '" r="13" fill="' + r.lane + '"/>';
    s += '<text class="mcs-av" x="' + (x + 24) + '" y="' + (y + 28) + '" text-anchor="middle">' +
         esc(p.accountable.initials) + '</text>';
    s += '<text class="mcs-t" x="' + (x + 44) + '" y="' + (y + 21) + '">' + esc(clip(p.accountable.role, 30)) + '</text>';
    s += '<text class="mcs-s" x="' + (x + 44) + '" y="' + (y + 36) + '">' + Math.round(r.share * 100) +
         '% of objective · ' + Math.round(r.pct * 100) + '% delivered</text>';
    s += '<text class="mcs-chev" x="' + (x + w - 16) + '" y="' + (y + 24) + '">' + (n.open ? '▾' : '▸') + '</text>';

    if (!n.open && h >= SK_BARMIN) {
      var by = y + h - 16;
      s += '<rect class="mcs-track" x="' + (x + 14) + '" y="' + by.toFixed(1) + '" width="' + (w - 28) + '" height="5" rx="2.5"/>';
      s += '<rect x="' + (x + 14) + '" y="' + by.toFixed(1) + '" width="' + ((w - 28) * clamp(r.pct, 0, 1)).toFixed(1) +
           '" height="5" rx="2.5" fill="' + r.lane + '"/>';
    } else if (n.open) {
      s += sankeyPanel(n);
    }
    s += '</g>';
    return s;
  }

  /* One tower header: the column's name and what it answers. */
  function tower(x, w, name, sub) {
    return '<text class="mcs-tow" x="' + x + '" y="14">' + esc(name) + '</text>' +
           '<text class="mcs-towsub" x="' + x + '" y="27">' + esc(sub) + '</text>' +
           '<line class="mcs-rule" x1="' + x + '" y1="' + (SK_HEAD - 2) + '" x2="' + (x + w) +
           '" y2="' + (SK_HEAD - 2) + '"/>';
  }

  /* The KPI this mission actually moves, sitting at the end of its ribbon. Height
     tracks the mission's own base height so the pair reads as one lane; it does
     not grow when the mission expands. */
  function sankeyImpact(n) {
    var r = n.r;
    var base = Math.max(SK_MIN, r.share * SK_CONTENT);
    var h = Math.min(n.h, base), y = n.y, x = SK_KX, w = SK_KW;
    var m0 = r.metrics[0];
    var s = '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + w + '" height="' + h.toFixed(1) +
            '" rx="9" fill="' + r.lane + '" opacity="0.08"/>';
    s += '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="3" height="' + h.toFixed(1) +
         '" rx="2" fill="' + r.lane + '"/>';
    if (!m0) {
      s += '<text class="mcs-s" x="' + (x + 14) + '" y="' + (y + h / 2 + 4) + '">no measured KPI</text>';
      return s;
    }
    s += '<text class="mcs-s" x="' + (x + 14) + '" y="' + (y + 19) + '">' +
         esc(clip(String(m0.k.kpi).toUpperCase(), 28)) + '</text>';
    if (h >= 52) {
      s += '<text class="mcs-n" x="' + (x + 14) + '" y="' + (y + 41) + '">' + esc(fmt(m0.cur, m0.k.unit)) + '</text>';
      s += '<text class="mcs-m" x="' + (x + 14) + '" y="' + (y + 56) + '">from ' + esc(fmt(m0.k.baseline, m0.k.unit)) +
           ' · target ' + esc(fmt(m0.k.target, m0.k.unit)) + '</text>';
    } else {
      s += '<text class="mcs-n" x="' + (x + w - 14) + '" y="' + (y + 19) + '" text-anchor="end">' +
           esc(fmt(m0.cur, m0.k.unit)) + '</text>';
    }
    if (r.metrics.length > 1 && h >= 52) {
      s += '<text class="mcs-m" x="' + (x + w - 12) + '" y="' + (y + 19) + '" text-anchor="end">+' +
           (r.metrics.length - 1) + ' more</text>';
    }
    return s;
  }

  function sankeyPanel(n) {
    var r = n.r, x = n.x, y = n.y, w = n.w;
    var py = y + 52;
    var s = '<line class="mcs-rule" x1="' + (x + 12) + '" y1="' + (py - 8) + '" x2="' + (x + w - 12) + '" y2="' + (py - 8) + '"/>';
    var st = wrapText(r.mission.name, 52).slice(0, 2);
    for (var i = 0; i < st.length; i++) {
      s += '<text class="mcs-m" x="' + (x + 14) + '" y="' + (py + 6 + i * 13) + '">' + esc(st[i]) + '</text>';
    }
    var ky = py + 40;
    var m0 = r.metrics[0];
    if (m0) {
      s += '<text class="mcs-s" x="' + (x + 14) + '" y="' + ky + '">' + esc(clip(m0.k.kpi, 26)) + '</text>';
      s += '<text class="mcs-t" x="' + (x + w - 14) + '" y="' + ky + '" text-anchor="end">' +
           esc(fmt(m0.k.baseline, m0.k.unit)) + ' → ' + esc(fmt(m0.cur, m0.k.unit)) +
           ' → ' + esc(fmt(m0.k.target, m0.k.unit)) + '</text>';
      s += '<rect class="mcs-track" x="' + (x + 14) + '" y="' + (ky + 8) + '" width="' + (w - 28) + '" height="6" rx="3"/>';
      s += '<rect x="' + (x + 14) + '" y="' + (ky + 8) + '" width="' + ((w - 28) * clamp(m0.travel, 0, 1)).toFixed(1) +
           '" height="6" rx="3" fill="' + r.lane + '"/>';
    }
    s += '<text class="mcs-m" x="' + (x + 14) + '" y="' + (ky + 34) + '">' +
         (r.active === 0
            ? 'No patterns active · ' + r.patterns + ' available'
            : r.active + ' of ' + r.patterns + ' patterns active · ' + r.st.matched + ' matched · ' +
              money(r.captured) + ' released') + '</text>';
    s += '<text class="mcs-s" x="' + (x + 14) + '" y="' + (ky + 52) + '">Captured ' + money(r.captured) +
         ' · On table ' + money(r.onTable) + '</text>';
    if (r.st.pending) {
      s += '<text class="mcs-warn" x="' + (x + 14) + '" y="' + (ky + 68) + '">' + r.st.pending + ' awaiting approval</text>';
    }
    var ly = ky + 90;
    s += '<rect class="mcs-linkhit" data-persona="' + esc(r.mission.id) + '" x="' + (x + 12) + '" y="' + (ly - 11) +
         '" width="120" height="18" rx="4"/>';
    s += '<text class="mcs-link" x="' + (x + 14) + '" y="' + ly + '">Open Persona View →</text>';
    return s;
  }

  /* No cursor-following hover tip on the Sankey — the mission nodes expand
     inline (and the "Show all details" toggle pins every panel open), which
     already carries the role, share and pattern counts on the canvas itself. */

  function rowById(cmp, id) {
    for (var i = 0; i < cmp.rows.length; i++) if (cmp.rows[i].mission.id === id) return cmp.rows[i];
    return null;
  }

  function sankeyBind(host, cmp) {
    var nodes = host.querySelectorAll('[data-mission]');
    for (var i = 0; i < nodes.length; i++) {
      (function (g) {
        var id = g.getAttribute('data-mission');
        g.addEventListener('click', function (e) {
          if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-persona')) return;
          if (mcPinAll) return;      /* already showing — nothing to toggle */
          sankeyToggle(id, cmp);
        });
        g.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!mcPinAll) sankeyToggle(id, cmp); }
        });
      })(nodes[i]);
    }

    var links = host.querySelectorAll('[data-persona]');
    for (i = 0; i < links.length; i++) {
      (function (rect) {
        rect.addEventListener('click', function (e) {
          e.stopPropagation();
          window.PIQ.personaFocus = rect.getAttribute('data-persona');
          window.PIQ.go('missionpersona');
        });
      })(links[i]);
    }
  }

  function sankeyToggle(id, cmp) {
    var next = mcExpanded === id ? null : id;
    var from = sankeyLayout(cmp.rows, mcExpanded, mcPinAll);
    var to = sankeyLayout(cmp.rows, next, mcPinAll);
    mcExpanded = next;
    sankeyAnimate(from, to, cmp);
  }

  function sankeyTogglePin(cmp) {
    var from = sankeyLayout(cmp.rows, mcExpanded, mcPinAll);
    mcPinAll = !mcPinAll;
    if (mcPinAll) mcExpanded = null;
    var to = sankeyLayout(cmp.rows, mcExpanded, mcPinAll);
    syncPinBtn();
    sankeyAnimate(from, to, cmp);
  }

  function syncPinBtn() {
    var b = document.getElementById('mcPin');
    if (!b) return;
    b.classList.toggle('on', mcPinAll);
    b.setAttribute('aria-pressed', mcPinAll ? 'true' : 'false');
    b.innerHTML = '<span class="mcs-switch"><i></i></span>' +
      (mcPinAll ? 'Details always on' : 'Show all details');
  }

  function sankeyAnimate(from, to, cmp) {
    var host = document.getElementById('mcSankey');
    if (!host) return;
    if (mcAnim) { cancelAnimationFrame(mcAnim); mcAnim = null; }
    var obj = window.PIQ.objective(), DUR = 300, start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / DUR);
      var e = 1 - Math.pow(1 - t, 3);
      host.innerHTML = sankeyDraw(sankeyLerp(from, to, e), obj);
      if (t < 1) { mcAnim = requestAnimationFrame(frame); }
      else { mcAnim = null; host.innerHTML = sankeyDraw(to, obj); sankeyBind(host, cmp); }
    }
    mcAnim = requestAnimationFrame(frame);
  }

  function sankey(cmp) {
    var obj = window.PIQ.objective();
    if (!obj || !cmp.rows.length) return null;

    var wrap = el("div", "mc-sankeywrap");
    var head = el("div", "mcs-head",
      '<div class="mc-h">Objective flow <small>ribbon width is the mission’s share of the objective · ' +
      'the filled core is what has landed · click a mission to expand it</small></div>' +
      '<button class="mcs-pin" id="mcPin" type="button" aria-pressed="false" ' +
      'title="Keep every mission’s detail panel open">' +
      '<span class="mcs-switch"><i></i></span>Show all details</button>');
    wrap.appendChild(head);

    var scroll = el("div", "mc-scroll");
    var host = el("div", "mcs-svg"); host.id = "mcSankey";
    host.innerHTML = sankeyDraw(sankeyLayout(cmp.rows, mcExpanded, mcPinAll), obj);
    scroll.appendChild(host);
    wrap.appendChild(scroll);

    setTimeout(function () {
      sankeyBind(host, cmp);
      syncPinBtn();
      var b = document.getElementById('mcPin');
      if (b) b.onclick = function () { sankeyTogglePin(cmp); };
    }, 0);
    return wrap;
  }

  function ribbon(x0, y0, x1, y1, w0, wFill, col, op) {
    var cx = (x0 + x1) / 2;
    function band(w, opacity) {
      var h = w / 2;
      return '<path d="M' + x0 + ',' + (y0 - h) +
        ' C' + cx + ',' + (y0 - h) + ' ' + cx + ',' + (y1 - h) + ' ' + x1 + ',' + (y1 - h) +
        ' L' + x1 + ',' + (y1 + h) +
        ' C' + cx + ',' + (y1 + h) + ' ' + cx + ',' + (y0 + h) + ' ' + x0 + ',' + (y0 + h) +
        ' Z" fill="' + col + '" opacity="' + opacity + '"/>';
    }
    return band(w0, op) + band(Math.min(wFill, w0), Math.min(0.85, op + 0.45));
  }

  function wrapText(s, n) {
    var words = String(s || "").split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      if ((cur + " " + w).trim().length > n) { if (cur) lines.push(cur); cur = w; }
      else { cur = (cur + " " + w).trim(); }
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }
  function clip(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  /* ---- mission cards ------------------------------------------------------ */
  function missionCard(r) {
    var p = r.personas;
    var card = el("div", "mc-card" + (r.pct > 0 ? " live" : ""));
    card.style.setProperty("--lane", r.lane);
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.title = "Open " + p.accountable.role + " in Persona View";

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

    card.innerHTML =
      '<div class="mc-ch">' +
        '<span class="mc-av" style="background:' + r.lane + '">' + esc(p.accountable.initials) + '</span>' +
        '<span class="mc-who"><b>' + esc(p.accountable.role) + '</b>' +
          '<small>' + esc(r.proc ? r.proc.name : "") + (p.cadence ? ' · ' + esc(p.cadence) : '') + '</small></span>' +
        '<span class="mc-shr">' + Math.round(r.share * 100) + '%</span>' +
      '</div>' +
      '<div class="mc-stmt">' + esc(r.mission.name) + '</div>' +
      '<div class="mc-metrics">' + bars + '</div>' +
      '<div class="mc-exec">' +
        '<span class="mc-e"><b>' + r.active + '</b> of ' + r.patterns + ' patterns active</span>' +
        '<span class="mc-e"><b>' + r.st.matched + '</b> matched</span>' +
        '<span class="mc-e"><b>' + money(r.captured) + '</b> released</span>' +
        (r.st.pending ? '<span class="mc-e warn"><b>' + r.st.pending + '</b> awaiting approval</span>' : '') +
      '</div>' +
      '<div class="mc-gap">' +
        '<span class="mc-gl">Value on the table</span>' +
        '<span class="mc-gv">' + money(r.onTable) + '</span>' +
        '<span class="mc-gd">' + gapNote(r) + '</span>' +
      '</div>';

    function open() { window.PIQ.personaFocus = r.mission.id; window.PIQ.go("missionpersona"); }
    card.onclick = open;
    card.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    return card;
  }

  function gapNote(r) {
    var k = r.metrics[0];
    if (!k) return "no measured KPI";
    if (k.hit) return k.k.kpi + " at target";
    return k.k.kpi + " " + fmt(k.gap, k.k.unit) + " from target";
  }

  /* ---- render ------------------------------------------------------------- */
  function render(view) {
    if (!C().procIds || !C().procIds.length) { view.appendChild(empty()); return; }
    var cmp = campaign();
    var root = el("div", "mc");

    root.appendChild(el("div", "mc-head",
      '<div><div class="kv">Mission Command — Campaign HQ</div>' +
      '<h2>Order-to-Cash › ' + esc(window.PIQ.scopeLabel()) +
      ' <span class="livedot">● LIVE</span></h2></div>' +
      '<div class="mc-ctrl"><button class="btn go sm" id="mcOps">Open Mission Operations →</button></div>'));

    root.appendChild(objectiveBand(cmp));

    if (cmp.rows.length) {
      var sk = sankey(cmp);
      if (sk) root.appendChild(sk);

      root.appendChild(el("div", "mc-h",
        'Persona missions <small>each front of the campaign · click a card to open its Persona View</small>'));
      var ranked = cmp.rows.slice().sort(function (a, b) {
        return (b.share - a.share) || (b.pct - a.pct);
      });
      var grid = el("div", "mc-grid");
      ranked.forEach(function (r) { grid.appendChild(missionCard(r)); });
      root.appendChild(grid);
    } else {
      root.appendChild(el("div", "mc-mnone", "No missions in scope. Select missions in the Transformation Builder."));
    }

    view.appendChild(root);
    var b = root.querySelector("#mcOps");
    if (b) b.onclick = function () { window.PIQ.go("runtime"); };
  }

  function empty() {
    var d = el("div", "fit-empty",
      '<div class="kv">Mission Command</div><h2>No campaign composed</h2>' +
      '<p>Compose the transformation in the <b>Transformation Builder</b> — objective, processes, ' +
      'missions and patterns — and the campaign board appears here.</p>' +
      '<button class="btn go" id="mcStudio">← Go to Transformation Builder</button>');
    d.querySelector("#mcStudio").onclick = function () { window.PIQ.go("studio"); };
    return d;
  }

  window.PIQ.modules.missionhq = { render: render };
})();
