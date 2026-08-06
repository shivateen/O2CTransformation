/* Stage 5 · Finance Command Centre — the finance leadership team's top-down surface.
 *
 * A persona rail sits above every sub-view: the CFO sees the whole book; each finance lead
 * (Controller, Treasurer, Credit & Collections, AR / O2C, FP&A) sees only the objectives they
 * own, so the tiles, decision queue and insights narrow to their remit.
 *
 * The inverse of the Mission Builder: outcomes first, patterns underneath. Four sub-views —
 * Command Center (daily pulse), Intelligence (weekly briefing), Scenarios (what-if),
 * Trajectory (quarterly strategic). Every number carries a pattern-backed explanation
 * chain (KPI -> Theme -> Patterns -> Evidence -> Agent Action); pattern pills deep-link
 * to the Central Nervous System.
 *
 * Reads window.PROCESSIQ_CFO (generated) + PIQ.tax.themes (the 5 real themes) +
 * PIQ.pattern()/PIQ.book for deep-links. All charts are inline SVG — no external libs.
 */
(function () {
  "use strict";

  var CFO = window.PROCESSIQ_CFO || {};
  var CMP = CFO.compounds || {};
  var THEME_ICONS = { "trending-up": "📈", "shield-alert": "🚨", "clock": "⏱️",
    "shield-check": "🛡️", "eye": "👁️" };
  var _intelFilter = null;   // themeId set when a Command Center tile is clicked

  /* ---- the finance leadership team ------------------------------------- *
   * Each lead owns a slice of the objective set; the CFO owns the whole book.
   * `objectives: null` = every objective in the taxonomy.                    */
  var PERSONAS = [
    { id: "cfo",        initials: "CFO", name: "Chief Financial Officer",   objectives: null,
      brief: "The whole book — cash, revenue integrity, control health and the agent programme." },
    { id: "controller", initials: "FC",  name: "Financial Controller",      objectives: ["close-acceleration", "controls-integrity"],
      brief: "Cycle time and control health — a clean, fast, auditable close." },
    { id: "treasurer",  initials: "TR",  name: "Treasurer",                 objectives: ["cash-visibility", "working-capital"],
      brief: "Cash position and forecast accuracy — liquidity you can bank on." },
    { id: "credit",     initials: "CC",  name: "Credit & Collections Lead", objectives: ["working-capital", "controls-integrity"],
      brief: "DSO and credit exposure — collect faster without buying risk." },
    { id: "ar",         initials: "AR",  name: "Order-to-Cash / AR Lead",   objectives: ["close-acceleration", "revenue-leakage"],
      brief: "Invoice-to-cash throughput and every dollar that leaks on the way." },
    { id: "fpa",        initials: "FP",  name: "FP&A Lead",                 objectives: ["cash-visibility", "revenue-leakage"],
      brief: "Forecast quality and revenue realisation against plan." },
  ];
  var _persona = "cfo";
  function persona() { return PERSONAS.filter(function (p) { return p.id === _persona; })[0] || PERSONAS[0]; }
  function inScope(themeId) {
    var o = persona().objectives;
    return !o || o.indexOf(themeId) >= 0;
  }
  function scopedThemes() { return themes().filter(function (t) { return inScope(t.id); }); }

  function personaRail() {
    var p = persona();
    var chips = PERSONAS.map(function (x) {
      var n = x.objectives ? x.objectives.length : themes().length;
      return '<button class="fp-chip' + (x.id === _persona ? " on" : "") + '" data-p="' + x.id + '">' +
        '<span class="fp-av">' + esc(x.initials) + '</span>' +
        '<span class="fp-txt"><b>' + esc(x.name) + '</b>' +
        '<small>' + n + ' objective' + (n !== 1 ? "s" : "") + '</small></span></button>';
    }).join("");
    return '<div class="fp-rail"><div class="fp-rail-head">Finance Command Centre · viewing as</div>' +
      '<div class="fp-chips">' + chips + '</div>' +
      '<div class="fp-brief">' + esc(p.brief) + '</div></div>';
  }
  function bindRail(view, rerender) {
    view.querySelectorAll(".fp-chip").forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.p === _persona) return;
        _persona = b.dataset.p; _intelFilter = null;
        rerender(view);
      };
    });
  }

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function themes() { return (window.PIQ.tax && window.PIQ.tax.themes) || []; }
  function themeById(id) { return themes().filter(function (t) { return t.id === id; })[0] || null; }
  function icon(name) { return THEME_ICONS[name] || "◆"; }
  function money(x) {
    var n = Math.abs(x), s = x < 0 ? "-" : "";
    if (n >= 1e6) return s + "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return s + "$" + Math.round(n / 1e3) + "K";
    return s + "$" + n;
  }

  function toast(msg) {
    var t = document.querySelector(".cfo-toast");
    if (!t) { t = el("div", "cfo-toast"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("show"); }, 1900);
  }

  function onPatternClick(patId) {
    var p = window.PIQ.pattern(patId);
    if (p && window.PIQ.book) {
      var iv = (window.PIQ.book.invoices || []).filter(function (x) { return x.groundTruthFeature === p.featureSlug; })[0];
      if (iv) window.PIQ._jumpInvoice = iv.belnr;
    }
    window.PIQ.go("cockpit");
  }
  function patPill(id) {
    var p = window.PIQ.pattern(id);
    return '<span class="dq-pat" data-pat="' + id + '" title="See it live in the Central Nervous System">#' + id +
      (p ? ' ' + esc(p.name) : '') + '</span>';
  }
  function bindPatterns(root) {
    root.querySelectorAll(".dq-pat").forEach(function (e) {
      e.onclick = function (ev) { ev.stopPropagation(); onPatternClick(+e.dataset.pat); };
    });
  }

  /* ---- inline SVG helpers ---------------------------------------------- */
  function sx(i, n, w, pad) { return pad + (n <= 1 ? 0 : (i / (n - 1)) * (w - 2 * pad)); }
  function sy(v, mn, mx, h, pad) { return h - pad - (mx === mn ? 0 : ((v - mn) / (mx - mn)) * (h - 2 * pad)); }
  function linePath(d, mn, mx, w, h, pad, x0) {
    return d.map(function (v, i) { return (i ? "L" : "M") + sx((x0 || 0) + i, (x0 || 0) + d.length, w, pad).toFixed(1) + "," + sy(v, mn, mx, h, pad).toFixed(1); }).join(" ");
  }
  function areaPath(d, mn, mx, w, h, pad) {
    var line = linePath(d, mn, mx, w, h, pad);
    var yb = sy(mn < 0 ? 0 : mn, mn, mx, h, pad);
    return line + " L" + sx(d.length - 1, d.length, w, pad).toFixed(1) + "," + yb.toFixed(1) +
      " L" + sx(0, d.length, w, pad).toFixed(1) + "," + yb.toFixed(1) + " Z";
  }
  // band between upper[] and lower[] across n points
  function bandPath(upper, lower, mn, mx, w, h, pad, x0) {
    x0 = x0 || 0; var n = x0 + upper.length;
    var up = upper.map(function (v, i) { return (i ? "L" : "M") + sx(x0 + i, n, w, pad).toFixed(1) + "," + sy(v, mn, mx, h, pad).toFixed(1); }).join(" ");
    var lo = lower.map(function (v, i) { var j = lower.length - 1 - i; return "L" + sx(x0 + j, n, w, pad).toFixed(1) + "," + sy(lower[j], mn, mx, h, pad).toFixed(1); }).join(" ");
    return up + " " + lo + " Z";
  }
  function polar(cx, cy, r, deg) { var a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  function arc(cx, cy, r, a0, a1) {
    var s = polar(cx, cy, r, a1), e = polar(cx, cy, r, a0), large = a1 - a0 <= 180 ? 0 : 1;
    return "M" + s[0].toFixed(1) + "," + s[1].toFixed(1) + " A" + r + "," + r + " 0 " + large + " 0 " + e[0].toFixed(1) + "," + e[1].toFixed(1);
  }
  function mnmx() { var a = [].concat.apply([], arguments); return [Math.min.apply(null, a), Math.max.apply(null, a)]; }

  function section(title, sub) {
    return '<div class="cfo-section"><h3>' + esc(title) + '</h3>' + (sub ? '<div class="cfo-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* ====================================================================== */
  /* 1 · COMMAND CENTER                                                      */
  /* ====================================================================== */
  function themeTile(t) {
    var k = t.compoundKPI || {};
    var cur = +k.current, tgt = +k.target, reduce = tgt < cur;
    var impr = cur ? Math.abs(tgt - cur) / cur : 0;
    var light = impr >= 0.2 ? "green" : impr >= 0.08 ? "amber" : "red";
    var deltaCls = reduce ? "good" : "good";   // both directions are improvements toward target
    var deltaTxt = (reduce ? "▼ " : "▲ ") + Math.round(impr * 100) + "%";
    return '<div class="cfo-tile" data-theme="' + t.id + '" style="--ac:' + t.accent + '">' +
      '<div class="tile-icon">' + icon(t.icon) + '<span class="tile-light ' + light + '"></span></div>' +
      '<div class="tile-name">' + esc(t.name) + '</div>' +
      '<div class="tile-kpi">' + esc(k.current) + '<i> → </i>' + esc(k.target) + ' <small>' + esc(k.unit) + '</small></div>' +
      '<span class="tile-delta ' + deltaCls + '">' + deltaTxt + ' vs target · ' + esc(k.name) + '</span></div>';
  }

  function autonomyGauge(a) {
    var w = 260, h = 168, cx = 130, cy = 140, r = 96;
    var f = a.current, tf = a.target;
    var bg = arc(cx, cy, r, 0, 180);
    var val = arc(cx, cy, r, 0, 180 * f);
    var tick = polar(cx, cy, r, 180 * tf);           // target marker on the arc
    var tin = polar(cx, cy, r - 14, 180 * tf);
    // sparkline
    var tr = a.trend, mm = mnmx(tr), spW = 220, spH = 34;
    var sp = linePath(tr, mm[0] - 0.02, mm[1] + 0.02, spW, spH, 4);
    return '<div class="cfo-gauge">' +
      '<div class="gauge-label">Agent Autonomy</div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" class="gauge-svg">' +
        '<path d="' + bg + '" fill="none" stroke="var(--line)" stroke-width="14" stroke-linecap="round"/>' +
        '<path d="' + val + '" fill="none" stroke="var(--act)" stroke-width="14" stroke-linecap="round"/>' +
        '<line x1="' + tick[0].toFixed(1) + '" y1="' + tick[1].toFixed(1) + '" x2="' + tin[0].toFixed(1) + '" y2="' + tin[1].toFixed(1) + '" stroke="var(--brand2)" stroke-width="2.5"/>' +
        '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" class="gauge-pct">' + Math.round(f * 100) + '%</text>' +
      '</svg>' +
      '<div class="gauge-meta">Target <b>' + Math.round(tf * 100) + '%</b> · 6-week trend</div>' +
      '<svg viewBox="0 0 ' + spW + ' ' + spH + '" class="gauge-spark"><path d="' + sp + '" fill="none" stroke="var(--act)" stroke-width="2"/></svg>' +
      '</div>';
  }

  function cashForecast(cf) {
    var w = 620, h = 240, pad = 30;
    var all = cf.inflows.concat(cf.outflows, cf.netPosition, cf.confidenceBand.upper, cf.confidenceBand.lower);
    var mm = mnmx(all); var mn = Math.min(mm[0], 0), mx = mm[1];
    var n = cf.weeks.length;
    var band = bandPath(cf.confidenceBand.upper, cf.confidenceBand.lower, mn, mx, w, h, pad);
    var inA = areaPath(cf.inflows, mn, mx, w, h, pad);
    var outA = areaPath(cf.outflows, mn, mx, w, h, pad);
    var netL = linePath(cf.netPosition, mn, mx, w, h, pad);
    var y0 = sy(0, mn, mx, h, pad);
    var labels = cf.weeks.map(function (wk, i) { return i % 2 === 0 ? '<text x="' + sx(i, n, w, pad).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" class="ax">' + wk + '</text>' : ''; }).join("");
    return '<div class="cfo-forecast"><div class="fc-legend">' +
        '<span class="lg in">Inflows</span><span class="lg out">Outflows</span><span class="lg net">Net position</span><span class="lg band">Confidence</span></div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
        '<line x1="' + pad + '" y1="' + y0.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + y0.toFixed(1) + '" stroke="var(--line)" stroke-dasharray="3 3"/>' +
        '<path d="' + inA + '" fill="var(--act)" opacity="0.12"/>' +
        '<path d="' + outA + '" fill="var(--crit)" opacity="0.10"/>' +
        '<path d="' + band + '" fill="var(--muted)" opacity="0.16"/>' +
        '<path d="' + netL + '" fill="none" stroke="var(--brand2)" stroke-width="2.5"/>' +
        labels +
      '</svg></div>';
  }

  var URG = { critical: 0, high: 1, medium: 2, low: 3 };
  function dqCard(d) {
    var t = themeById(d.themeId);
    var pills = (d.triggeringPatterns || []).map(patPill).join("");
    var acts = (d.actions || []).map(function (a) {
      var cls = /approve|confirm|add/.test(a) ? "approve" : /override|modify|investigate|escalate/.test(a) ? "override" : "defer";
      return '<button class="dq-btn ' + cls + '" data-act="' + esc(a) + '">' + esc(a.replace(/-/g, " ")) + '</button>';
    }).join("");
    return '<div class="dq-card" data-id="' + d.id + '">' +
      '<div class="dq-header"><span class="dq-urgency ' + d.urgency + '">' + d.urgency + '</span>' +
        '<span class="dq-title">' + esc(d.title) + '</span></div>' +
      '<div class="dq-summary">' + esc(d.summary) + '</div>' +
      '<div class="dq-meta">' +
        '<span class="dq-confidence">Agent: ' + esc(d.agentRecommendation.replace(/-/g, " ")) + ' · ' + Math.round(d.confidence * 100) + '% conf</span>' +
        '<span class="dq-exposure">Exposure ' + money(d.exposure) + '</span>' +
        (t ? '<span class="dq-ago">' + esc(t.name) + '</span>' : '') +
        '<span class="dq-ago">' + esc(d.submittedAgo) + ' ago</span></div>' +
      (pills ? '<div class="dq-patterns">' + pills + '</div>' : '') +
      '<div class="dq-actions">' + acts + '</div></div>';
  }

  function renderCommand(view) {
    var cc = CFO.commandCenter || {}, ts = scopedThemes();
    var q = (cc.decisionQueue || []).filter(function (d) { return inScope(d.themeId); })
      .sort(function (a, b) { return (URG[a.urgency] - URG[b.urgency]); });
    var html = personaRail() +
      section("Command Center", "The daily 5-minute pulse for " + persona().name + " — outcomes, autonomy, cash, and only what needs their judgment.") +
      '<div class="cfo-tiles">' + ts.map(themeTile).join("") + '</div>' +
      '<div class="cfo-cols"><div>' + autonomyGauge(cc.agentAutonomy || {}) + '</div>' +
        '<div>' + section("13-Week Cash Forecast", "Net position with confidence band.") + cashForecast(CFO.cashForecast || {}) + '</div></div>' +
      section("Decision Queue", q.length + " item" + (q.length !== 1 ? "s" : "") + " need this desk's call — sorted by urgency.") +
      '<div class="cfo-queue">' + (q.length ? q.map(dqCard).join("") : '<div class="cfo-empty">Nothing waiting on this desk.</div>') + '</div>';
    view.innerHTML = '<div class="cfo-wrap">' + html + '</div>';
    bindRail(view, renderCommand);

    // tile click -> filter Intelligence by theme
    view.querySelectorAll(".cfo-tile").forEach(function (e) {
      e.onclick = function () { _intelFilter = e.dataset.theme; window.PIQ.go("intelligence"); };
    });
    bindPatterns(view);
    // decision actions (display-only): animate out + toast
    view.querySelectorAll(".dq-card").forEach(function (card) {
      card.querySelectorAll(".dq-btn").forEach(function (b) {
        b.onclick = function () {
          card.classList.add("dismissed");
          toast("Decision recorded — " + b.dataset.act.replace(/-/g, " "));
          setTimeout(function () { card.style.display = "none"; }, 320);
        };
      });
    });
  }

  /* ====================================================================== */
  /* 2 · INTELLIGENCE                                                        */
  /* ====================================================================== */
  var SEV = { alert: 0, warn: 1, info: 2, good: 3 };
  function insCard(ins) {
    var t = themeById(ins.themeId), im = ins.impact || {};
    var arrow = im.direction === "worse" ? "↑" : "↓";
    var pills = (ins.patternIds || []).map(patPill).join("");
    return '<div class="ins-card ' + ins.severity + '">' +
      '<span class="ins-sev ' + ins.severity + '">' + ins.severity + '</span>' +
      (t ? '<span class="ins-theme">' + esc(t.name) + '</span>' : '') +
      '<div class="ins-headline">' + esc(ins.headline) + '</div>' +
      '<div class="ins-narrative">' + esc(ins.narrative) + '</div>' +
      '<div class="ins-foot"><span class="ins-impact">' + esc(im.metric) + ' <b>' + esc(im.delta) + '</b> ' + arrow + '</span>' +
        (pills ? '<span class="ins-pills">' + pills + '</span>' : '') +
        '<span class="ins-week">' + esc(ins.weekOf) + '</span></div></div>';
  }

  function cmpCard(r) {
    var c = CMP[r.compoundId] || { name: r.compoundId, description: "", patternIds: [] };
    var pills = (c.patternIds || []).map(patPill).join("");
    return '<div class="cmp-card">' +
      '<div class="cmp-top"><span class="cmp-name">' + esc(c.name) + '</span>' +
        '<span class="cmp-status ' + r.status + '">' + r.status + '</span></div>' +
      '<div class="cmp-desc">' + esc(c.description) + '</div>' +
      '<div class="cmp-stat"><span>' + r.activeCustomers + ' customer' + (r.activeCustomers !== 1 ? "s" : "") + '</span>' +
        '<span>' + money(r.totalExposure) + ' exposure</span></div>' +
      '<div class="dq-patterns">' + pills + '</div></div>';
  }

  function explanationChain() {
    var steps = ["KPI", "Theme", "Patterns", "Evidence", "Agent Action"];
    var boxes = steps.map(function (s, i) {
      return '<span class="ec-box ec-' + i + '">' + s + '</span>' + (i < steps.length - 1 ? '<span class="ec-arr">→</span>' : '');
    }).join("");
    return '<div class="cfo-chain"><span class="ec-lead">How to read this page:</span>' + boxes + '</div>';
  }

  function renderIntelligence(view) {
    var intel = CFO.intelligence || {};
    var ins = (intel.insights || []).filter(function (x) { return inScope(x.themeId); });
    var filt = _intelFilter;
    if (filt) ins = ins.filter(function (x) { return x.themeId === filt; });
    ins.sort(function (a, b) { return SEV[a.severity] - SEV[b.severity]; });
    var ft = filt ? themeById(filt) : null;
    var html = personaRail() +
      section("Intelligence", "The weekly briefing for " + persona().name + " — the system writes the story behind every move.") +
      (ft ? '<div class="cfo-filter">Filtered to <b>' + esc(ft.name) + '</b> <button class="cfo-clear">show all</button></div>' : '') +
      '<div class="ins-feed">' + (ins.length ? ins.map(insCard).join("") : '<div class="cfo-empty">No insights for this theme this week.</div>') + '</div>' +
      section("Compound Pattern Radar", "Cross-process behavioural risk no single analyst can see.") +
      '<div class="cmp-grid">' + (intel.compoundRadar || []).map(cmpCard).join("") + '</div>' +
      explanationChain();
    view.innerHTML = '<div class="cfo-wrap">' + html + '</div>';
    bindRail(view, renderIntelligence);
    var clr = view.querySelector(".cfo-clear");
    if (clr) clr.onclick = function () { _intelFilter = null; renderIntelligence(view); };
    bindPatterns(view);
  }

  /* ====================================================================== */
  /* 3 · SCENARIOS                                                           */
  /* ====================================================================== */
  var _scn = null;
  function scnCard(s) {
    var chips = s.impacts.map(function (im) {
      return '<span class="scn-chip ' + (im.direction === "better" ? "good" : "bad") + '">' + esc(im.metric) + '</span>';
    }).join("");
    return '<div class="scn-card' + (_scn === s.id ? " sel" : "") + '" data-id="' + s.id + '">' +
      '<div class="scn-name">' + esc(s.name) + '</div>' +
      '<div class="scn-desc">' + esc(s.description) + '</div>' +
      '<div class="scn-chips">' + chips + '</div></div>';
  }
  function fmtVal(v, unit) {
    if (unit === "$") return money(v);
    if (unit === "%") return (Math.round(v * 10) / 10) + "%";
    return (Math.round(v * 10) / 10) + (unit && unit !== "customers" && unit !== "cases" ? " " + unit : (unit ? " " + unit : ""));
  }
  function scnDetail(s, factor) {
    var rows = s.impacts.map(function (im) {
      var proj = im.baseCase + (im.projected - im.baseCase) * factor;
      var better = im.direction === "better";
      var arrow = (proj < im.baseCase ? "▼" : proj > im.baseCase ? "▲" : "–");
      return '<tr><td>' + esc(im.metric) + '</td><td>' + fmtVal(im.baseCase, im.unit) + '</td>' +
        '<td class="' + (better ? "imp-good" : "imp-bad") + '">' + arrow + " " + fmtVal(proj, im.unit) + '</td></tr>';
    }).join("");
    var sliders = s.parameters.map(function (p) {
      return '<div class="scn-slider"><label>' + esc(p.name) + '</label>' +
        '<input type="range" data-p min="' + p.min + '" max="' + p.max + '" step="' + (p.step || 1) + '" value="' + p.default + '"/>' +
        '<span class="scn-val">' + esc(p.default) + (p.unit === "%" ? "%" : p.unit === "$" ? "" : "") + '</span></div>';
    }).join("");
    return '<div class="scn-detail" data-id="' + s.id + '"><h4>' + esc(s.name) + '</h4>' + sliders +
      '<div class="scn-impacts"><table><thead><tr><th>Metric</th><th>Base case</th><th>Projected</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="scn-tradeoff"><b>Trade-off:</b> ' + esc(s.tradeoff) + '</div>' +
      '<button class="btn go scn-apply">Apply to model</button></div>';
  }
  function renderScenarios(view) {
    var list = (CFO.scenarios && CFO.scenarios.available) || [];
    var sel = _scn && list.filter(function (x) { return x.id === _scn; })[0];
    var html = personaRail() +
      section("Scenarios", "The monthly what-if engine — move a lever, see the trade-off before you commit.") +
      '<div class="scn-grid">' + list.map(scnCard).join("") + '</div>' +
      (sel ? scnDetail(sel, 1) : '<div class="cfo-empty">Select a scenario to model its impact.</div>');
    view.innerHTML = '<div class="cfo-wrap">' + html + '</div>';
    bindRail(view, renderScenarios);
    view.querySelectorAll(".scn-card").forEach(function (c) {
      c.onclick = function () { _scn = c.dataset.id; renderScenarios(view); };
    });
    var det = view.querySelector(".scn-detail");
    if (det && sel) {
      var p = sel.parameters[0], slider = det.querySelector('input[type=range]'), val = det.querySelector(".scn-val");
      var tbody = det.querySelector("tbody");
      slider.oninput = function () {
        var v = +slider.value;
        val.textContent = (p.unit === "$" ? money(v) : v + (p.unit === "%" ? "%" : ""));
        var factor = p.default ? v / p.default : 1;
        tbody.innerHTML = sel.impacts.map(function (im) {
          var proj = im.baseCase + (im.projected - im.baseCase) * factor;
          var better = im.direction === "better";
          var arrow = (proj < im.baseCase ? "▼" : proj > im.baseCase ? "▲" : "–");
          return '<tr><td>' + esc(im.metric) + '</td><td>' + fmtVal(im.baseCase, im.unit) + '</td>' +
            '<td class="' + (better ? "imp-good" : "imp-bad") + '">' + arrow + " " + fmtVal(proj, im.unit) + '</td></tr>';
        }).join("");
      };
      det.querySelector(".scn-apply").onclick = function () { toast("Scenario submitted for review"); };
    }
  }

  /* ====================================================================== */
  /* 4 · TRAJECTORY                                                          */
  /* ====================================================================== */
  function phaseBar(phases) {
    return '<div class="phase-bar">' + phases.map(function (p) {
      return '<div class="phase-seg ' + p.status + '"><div class="phase-name">' + esc(p.name) + '</div>' +
        '<div class="phase-period">' + esc(p.period) + '</div>' +
        '<div class="phase-fill"><span style="width:' + p.pctComplete + '%"></span></div>' +
        '<div class="phase-pct">' + p.status + ' · ' + p.pctComplete + '%</div></div>';
    }).join("") + '</div>';
  }

  function maturityChart(m) {
    var w = 620, h = 220, pad = 30, n = m.labels.length;
    // stack bottom->top: autonomous, hitl, manual (sum 100)
    var auto = m.autonomous, hitl = m.hitl.map(function (v, i) { return auto[i] + v; }), man = hitl.map(function (v, i) { return v + m.manual[i]; });
    function poly(top, bot, fill, op) {
      var up = top.map(function (v, i) { return (i ? "L" : "M") + sx(i, n, w, pad).toFixed(1) + "," + sy(v, 0, 100, h, pad).toFixed(1); }).join(" ");
      var lo = bot.map(function (v, i) { var j = bot.length - 1 - i; return "L" + sx(j, n, w, pad).toFixed(1) + "," + sy(bot[j], 0, 100, h, pad).toFixed(1); }).join(" ");
      return '<path d="' + up + " " + lo + ' Z" fill="' + fill + '" opacity="' + op + '"/>';
    }
    var zero = auto.map(function () { return 0; });
    var lbl = m.labels.map(function (L, i) { return '<text x="' + sx(i, n, w, pad).toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle" class="ax">' + L + '</text>'; }).join("");
    return '<div class="cfo-forecast"><div class="fc-legend"><span class="lg mn">Manual</span><span class="lg hl">HITL</span><span class="lg at">Autonomous</span></div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
        poly(auto, zero, "var(--act)", "0.85") + poly(hitl, auto, "var(--high)", "0.7") + poly(man, hitl, "var(--muted)", "0.45") + lbl +
      '</svg></div>';
  }

  function kpiSmall(k) {
    var w = 300, h = 170, pad = 26;
    var act = k.actual, fc = k.forecast, up = k.confidenceBand.upper, lo = k.confidenceBand.lower;
    var na = act.length;                      // 9 actual (index 0..8)
    var fcLead = [act[na - 1]].concat(fc);    // connect forecast to last actual (index 8..8+fc)
    var mm = mnmx(act, fc, up, lo, [k.target]); var mn = mm[0] - 2, mx = mm[1] + 2;
    var total = na + fc.length;               // total x slots
    // band over forecast x-range (index na..total-1)
    var band = bandPath(up, lo, mn, mx, w, h, pad, na);
    var actL = linePath(act, mn, mx, w, h, pad, 0);
    var fcL = linePath(fcLead, mn, mx, w, h, pad, na - 1);
    var ty = sy(k.target, mn, mx, h, pad);
    return '<div class="cfo-sm-card"><div class="cfo-sm-title">' + esc(k.metric) + ' <small>target ' + k.target + esc(k.unit === "%" ? "%" : "") + '</small></div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
        '<path d="' + band + '" fill="var(--brand2)" opacity="0.12"/>' +
        '<line x1="' + pad + '" y1="' + ty.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + ty.toFixed(1) + '" stroke="var(--muted)" stroke-dasharray="2 3"/>' +
        '<path d="' + actL + '" fill="none" stroke="var(--brand2)" stroke-width="2.2"/>' +
        '<path d="' + fcL + '" fill="none" stroke="var(--brand2)" stroke-width="2" stroke-dasharray="5 4" opacity="0.75"/>' +
      '</svg></div>';
  }

  function roiChart(r) {
    var w = 620, h = 230, pad = 34, n = r.labels.length;
    var mm = mnmx(r.investment, r.returns); var mn = 0, mx = mm[1];
    var invA = areaPath(r.investment, mn, mx, w, h, pad);
    var retA = areaPath(r.returns, mn, mx, w, h, pad);
    var bi = r.labels.indexOf(r.breakeven);
    var bx = bi >= 0 ? sx(bi, n, w, pad) : null;
    var be = bx != null ? '<line x1="' + bx.toFixed(1) + '" y1="' + pad + '" x2="' + bx.toFixed(1) + '" y2="' + (h - pad) + '" stroke="var(--act)" stroke-dasharray="4 3"/>' +
      '<text x="' + bx.toFixed(1) + '" y="' + (pad - 6) + '" text-anchor="middle" class="ax b">break-even ' + esc(r.breakeven) + '</text>' : "";
    var lbl = r.labels.map(function (L, i) { return i % 2 === 0 ? '<text x="' + sx(i, n, w, pad).toFixed(1) + '" y="' + (h - 10) + '" text-anchor="middle" class="ax">' + L + '</text>' : ''; }).join("");
    return '<div class="cfo-forecast"><div class="fc-legend"><span class="lg out">Cumulative investment</span><span class="lg at">Cumulative returns</span></div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
        '<path d="' + retA + '" fill="var(--act)" opacity="0.16"/>' +
        '<path d="' + linePath(r.returns, mn, mx, w, h, pad) + '" fill="none" stroke="var(--act)" stroke-width="2.4"/>' +
        '<path d="' + linePath(r.investment, mn, mx, w, h, pad) + '" fill="none" stroke="var(--crit)" stroke-width="2.2"/>' +
        be + lbl +
      '</svg></div>';
  }

  function scorecard(rows) {
    var body = rows.map(function (r) {
      var t = r.metric.toLowerCase().indexOf("autonomy") >= 0 || r.target <= 1 ? Math.round(r.actual * 100) + "% / " + Math.round(r.target * 100) + "%" :
        (r.metric.indexOf("Queue") >= 0 ? r.actual + " / " + r.target : money(r.actual) + " / " + money(r.target));
      return '<tr><td>' + esc(r.metric) + '</td><td>' + t + '</td>' +
        '<td><span class="board-status ' + r.status + '">' + r.status.replace("-", " ") + '</span></td></tr>';
    }).join("");
    return '<table class="board-table"><thead><tr><th>Metric</th><th>Actual / Target</th><th>Status</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderTrajectory(view) {
    var tr = CFO.trajectory || {};
    var kpis = (tr.kpiTrajectory || []).map(kpiSmall).join("");
    var html = personaRail() +
      section("Trajectory", "The quarterly strategic view — where the transformation is heading, with confidence.") +
      section("Phase Progress", "") + phaseBar(tr.phases || []) +
      section("Agent Maturity", "The shift from manual to autonomous over the first 9 months.") + maturityChart(tr.agentMaturity || {}) +
      section("KPI Trajectory", "Actual, forecast (dashed) and target (dotted) with confidence bands.") + '<div class="cfo-sm">' + kpis + '</div>' +
      section("ROI Waterfall", "Cumulative investment vs returns.") + roiChart(tr.cumulativeROI || {}) +
      section("Board Scorecard", "") + scorecard(tr.boardScorecard || []);
    view.innerHTML = '<div class="cfo-wrap">' + html + '</div>';
    bindRail(view, renderTrajectory);
  }

  /* ---- register the 4 sub-views ---------------------------------------- */
  window.PIQ.modules.command = { render: renderCommand };
  window.PIQ.modules.intelligence = { render: renderIntelligence };
  window.PIQ.modules.scenarios = { render: renderScenarios };
  window.PIQ.modules.trajectory = { render: renderTrajectory };
})();
