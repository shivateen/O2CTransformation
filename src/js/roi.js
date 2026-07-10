/* ProcessIQ — Value Measurement (Module 6)
 * Deck slides 19-20: KPIs are table stakes; business outcomes are the scorecard;
 * every dollar recovered traces to a pattern, a decision, and an action. */
(function () {
  "use strict";
  var E = window.ProcessIQEngine;
  var roi = window.PROCESSIQ_ROI;
  var PRIO = window.PIQ.meta.priorityLegend;

  var roiView = "process";   // "process" (per-process KPI cards) | "theme" (compound rollup)

  function money(x) { return E._money(x); }
  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function render(view) {
    view.innerHTML = '<div class="roi"></div>';
    var root = view.querySelector(".roi");

    root.appendChild(el("div", "gov-head",
      '<div class="kv">Proving the Value · deck slides 19–20</div>' +
      '<h2 style="font-size:22px;margin:2px 0 4px">KPIs Are Table Stakes. Business Outcomes Are the Scorecard.</h2>' +
      '<p style="margin:0;color:var(--muted);max-width:780px">Operational metrics prove the engine runs. The real measure is dollars — released, protected, and recovered — and every one of them is traceable to a behavioural pattern.</p>'));

    var hasThemes = roi.themes && roi.themes.length;
    if (hasThemes) {
      root.appendChild(viewToggle());
      if (roiView === "theme") { renderThemeView(root); wireToggle(root); return; }
    }
    renderProcessView(root);
    if (hasThemes) wireToggle(root);
  }

  function viewToggle() {
    return el("div", "roi-toggle",
      '<button class="roi-tg' + (roiView === "process" ? " on" : "") + '" data-v="process">Process KPIs</button>' +
      '<button class="roi-tg' + (roiView === "theme" ? " on" : "") + '" data-v="theme">Theme Rollup</button>' +
      '<span class="roi-tg-hint">' + (roiView === "theme"
        ? "How per-process KPIs compose into a compound, cross-function outcome."
        : "The per-process operational and outcome scorecard.") + '</span>');
  }
  function wireToggle(root) {
    root.querySelectorAll(".roi-tg").forEach(function (b) {
      b.onclick = function () { roiView = b.dataset.v; render(document.getElementById("view")); };
    });
  }

  function renderProcessView(root) {
    // Tier 1 KPIs
    root.appendChild(sectionLabel("Tier 1 — KPIs", "necessary but insufficient"));
    var krow = el("div", "kpirow");
    roi.kpis.forEach(function (k) { krow.appendChild(kpiCard(k)); });
    root.appendChild(krow);

    // Tier 2 outcomes
    root.appendChild(sectionLabel("Tier 2 — Business Outcomes", "the real measure"));
    var orow = el("div", "outrow");
    roi.outcomes.forEach(function (o) { orow.appendChild(outcomeCard(o)); });
    root.appendChild(orow);

    // trajectory + attribution
    var grid = el("div", "roi-grid");
    grid.appendChild(trajectoryCard());
    grid.appendChild(attributionCard());
    root.appendChild(grid);
  }

  /* Theme rollup — the compound (cross-function) KPI as a hero, a stacked contribution
     bar showing how each per-process KPI feeds it, the dollar impact, and per-KPI
     pattern attribution. */
  function renderThemeView(root) {
    var t = roi.themes[0], k = t.compoundKPI || {};
    root.appendChild(sectionLabel("Theme Rollup — " + esc(t.id === "working-capital" ? "Working Capital Optimization" : t.id),
      "per-process KPIs compose into one compound outcome"));

    var hero = el("div", "card th-hero");
    hero.innerHTML =
      '<div class="th-h-main"><div class="th-h-lab">' + esc(k.name) + '</div>' +
      '<div class="th-h-val"><span class="thb">' + esc(k.current) + '</span>' +
      '<span class="tha">→</span><span class="thg">' + esc(k.target) + '</span>' +
      '<span class="thu">' + esc(k.unit) + '</span></div>' +
      (k.formula ? '<div class="th-h-form mono">' + esc(k.formula) + '</div>' : '') + '</div>' +
      '<div class="th-h-impact"><div class="thi-lab">Dollar impact</div>' +
      '<div class="thi-val">' + esc(t.impact) + '</div></div>';
    root.appendChild(hero);

    var stack = (t.contributors || []).map(function (cc, i) {
      return '<i class="th-seg s' + (i % 6) + '" style="flex:' + cc.weight +
        '" title="' + esc(cc.kpi) + ' · ' + Math.round(cc.weight * 100) + '%"></i>';
    }).join("");
    var rows = (t.contributors || []).map(function (cc, i) {
      var pats = (cc.patterns || []).map(function (p) { return '<span class="th-pat">' + esc(p) + '</span>'; }).join("");
      return '<div class="th-row"><div class="th-r-h"><span class="th-dot s' + (i % 6) + '"></span>' +
        '<span class="th-kpi">' + esc(cc.kpi) + '</span>' +
        '<span class="th-proc">' + esc(cc.process) + '</span>' +
        '<span class="th-w">' + Math.round(cc.weight * 100) + '% weight</span>' +
        '<span class="th-r-v"><b>' + esc(cc.current) + '</b> → <b>' + esc(cc.target) + '</b></span></div>' +
        (pats ? '<div class="th-r-attr"><span class="th-al">Driven by</span>' + pats + '</div>' : '') + '</div>';
    }).join("");
    root.appendChild(el("div", "card th-contrib",
      '<h4><span class="num">Σ</span>Contribution to ' + esc(k.name) + '</h4>' +
      '<div class="pad"><div class="th-stack">' + stack + '</div>' +
      '<div class="th-rows">' + rows + '</div>' +
      '<div class="traj-note">Each per-process KPI is owned by a different team and moved by different patterns — ' +
      'the compound KPI is the outcome the CFO actually steers by.</div></div>'));
  }

  function sectionLabel(t, sub) {
    return el("div", "roi-seclbl", '<b>' + esc(t) + '</b><span>' + esc(sub) + '</span>');
  }

  function kpiCard(k) {
    var improve = k.better === "down" ? (k.before - k.after) : (k.after - k.before);
    var base = k.before === 0 ? k.after : k.before;
    var deltaPct = k.before === 0 ? null : Math.round((improve / Math.abs(base)) * 100);
    var good = improve > 0;
    var badge = k.isNew ? '<span class="kdelta new">NEW</span>'
      : '<span class="kdelta ' + (good ? "up" : "down") + '">' + (k.better === "down" ? "−" : "+") + Math.abs(deltaPct) + '%</span>';
    // mini bar: after vs before, scaled to the larger
    var mx = Math.max(k.before, k.after, 1);
    var c = el("div", "card kpi");
    c.innerHTML =
      '<div class="kpi-h"><span class="kname">' + esc(k.name) + '</span>' + badge + '</div>' +
      '<div class="kval"><span class="kb">' + k.before + (k.unit === "%" ? "%" : "") + '</span>' +
      '<span class="karr">→</span><span class="ka">' + k.after + (k.unit === "%" ? "%" : "") + '</span>' +
      (k.unit === "days" ? '<span class="kunit">days</span>' : '') + '</div>' +
      '<div class="kbars"><i class="kbar before" style="width:' + (k.before / mx * 100) + '%"></i>' +
      '<i class="kbar after" style="width:' + (k.after / mx * 100) + '%"></i></div>' +
      '<div class="knote">' + esc(k.note) + '</div>';
    return c;
  }

  function outcomeCard(o) {
    var val = o.unit === "$" ? money(o.value) : o.value.toLocaleString() + " hrs";
    var c = el("div", "card outcome");
    c.innerHTML =
      '<div class="oicon">' + o.icon + '</div>' +
      '<div class="oval">' + val + '</div>' +
      '<div class="olabel">' + esc(o.label) + '</div>' +
      '<div class="odesc">' + esc(o.desc) + '</div>';
    return c;
  }

  /* cumulative value trajectory — SVG area chart */
  function trajectoryCard() {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">$</span>Cumulative Value Trajectory — Year 1</h4>';
    var pad = el("div", "pad");
    var W = 640, H = 280, padL = 54, padR = 24, padT = 22, padB = 44;
    var pts = roi.trajectory;
    var maxV = pts[pts.length - 1].cumulative * 1.08;
    var iw = W - padL - padR, ih = H - padT - padB;
    function X(i) { return padL + iw * i / (pts.length - 1); }
    function Y(v) { return padT + ih * (1 - v / maxV); }

    var line = pts.map(function (p, i) { return (i ? "L" : "M") + X(i) + " " + Y(p.cumulative); }).join(" ");
    var area = line + " L" + X(pts.length - 1) + " " + Y(0) + " L" + X(0) + " " + Y(0) + " Z";
    // y gridlines
    var grid = "";
    for (var g = 0; g <= 4; g++) {
      var v = maxV * g / 4, y = Y(v);
      grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#eef2f6"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#9aa7b5">' + money(v) + '</text>';
    }
    var dots = pts.map(function (p, i) {
      var anc = i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle";
      return '<circle cx="' + X(i) + '" cy="' + Y(p.cumulative) + '" r="5" fill="#fff" stroke="var(--act)" stroke-width="3"/>' +
        '<text x="' + X(i) + '" y="' + (Y(p.cumulative) - 13) + '" text-anchor="' + anc + '" font-size="12" font-weight="800" fill="var(--brand)">' + money(p.cumulative) + '</text>' +
        '<text x="' + X(i) + '" y="' + (H - padB + 18) + '" text-anchor="' + anc + '" font-size="11" font-weight="700" fill="var(--ink)">' + p.period + '</text>' +
        '<text x="' + X(i) + '" y="' + (H - padB + 32) + '" text-anchor="' + anc + '" font-size="9.5" fill="#9aa7b5">' + esc(p.label) + '</text>';
    }).join("");

    pad.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' +
      '<defs><linearGradient id="roiArea" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#16a085" stop-opacity="0.28"/><stop offset="1" stop-color="#16a085" stop-opacity="0.02"/></linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#roiArea)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--act)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + '</svg>' +
      '<div class="traj-note">From a standing start to <b>' + money(roi.meta.year1Total) + '+</b> recovered — the playbook compounds as patterns calibrate.</div>';
    card.appendChild(pad);
    return card;
  }

  /* attribution — every dollar traced to a pattern */
  function attributionCard() {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">▣</span>Value Attribution — Every Dollar Traces to a Capability</h4>';
    var pad = el("div", "pad");
    var max = Math.max.apply(null, roi.attribution.map(function (a) { return a.recovery; }));
    var rows = roi.attribution.map(function (a, i) {
      var col = a.priority ? PRIO[a.priority] : "#9aa7b5";
      var w = (a.recovery / max * 100).toFixed(1);
      var idtag = a.patternId ? '<span class="aid">#' + a.patternId + '</span>' : '';
      var link = a.patternId ? ' data-pat="' + a.patternId + '"' : '';
      return '<div class="arow' + (a.patternId ? " clk" : "") + '"' + link + '>' +
        '<span class="arank">' + (a.isOther ? "·" : (i + 1)) + '</span>' +
        '<div class="amain"><div class="an">' + idtag + esc(a.name) + '</div>' +
        '<div class="abarwrap"><i class="abar" style="width:' + w + '%;background:' + col + '"></i></div></div>' +
        '<div class="aval"><b>' + money(a.recovery) + '</b><span>' + a.customers + ' cust.</span></div></div>';
    }).join("");
    pad.innerHTML = '<div class="attr">' + rows + '</div>' +
      '<div class="traj-note">' + esc(roi.meta.note) + '</div>';
    card.appendChild(pad);
    // deep-link to Pattern Library
    setTimeout(function () {
      pad.querySelectorAll(".arow.clk").forEach(function (r) {
        r.onclick = function () {
          window.PIQ._jumpPattern = +r.dataset.pat;
          window.PIQ.go("library");
        };
      });
    }, 10);
    return card;
  }

  window.PIQ.modules.roi = { render: render };
})();
