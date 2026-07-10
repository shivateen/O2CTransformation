/* Discover & Fit — Skill Fitment
 * Takes the composition handed over by the Mission Builder and (a) assesses every skill
 * for agent fitment (Full-auto / Assisted / Human-led), (b) records the happy path and
 * agentivises it as the straight-through spine, and (c) renders the to-be process flow:
 * the happy path with the selected patterns attached as variation handlers.
 *
 * Deterministic: fitment verdicts come from PIQ.fitment; nothing here invents data.
 */
(function () {
  "use strict";
  var PRIO = window.PIQ.meta.priorityLegend;

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function C() { return window.PIQ.composition; }

  function render(view) {
    var c = C();
    if (!c.patternIds.length) { view.appendChild(empty()); return; }
    var blocks = window.PIQ.collectSkills(c.patternIds);
    var happy = blocks.filter(function (b) { return b.source === "happy"; });
    var fits = blocks.map(function (b) { return window.PIQ.fitment(b); });
    var dist = { "Full-auto": 0, "Assisted": 0, "Human-led": 0 };
    fits.forEach(function (f) { dist[f.tier]++; });
    var stp = Math.round(100 * dist["Full-auto"] / blocks.length);

    var root = el("div", "fit");
    root.appendChild(head(c, blocks, stp));
    root.appendChild(distBar(dist, blocks.length));
    root.appendChild(fitmentTable(blocks));
    root.appendChild(happyPanel(happy));
    root.appendChild(tobePanel());
    root.appendChild(goLiveBar(stp));
    view.appendChild(root);
    wire(root, happy);
  }

  function empty() {
    var d = el("div", "fit-empty",
      '<div class="kv">Discover & Fit — Pattern Discovery & Skill Fitment</div>' +
      '<h2>Nothing composed yet</h2>' +
      '<p>Use the <b>Mission Builder</b> to pick a function, process and patterns. Your selection flows here for skill-fitment assessment and happy-path agentivisation.</p>' +
      '<button class="btn go" id="toStudio">← Go to Mission Builder</button>');
    d.querySelector("#toStudio").onclick = function () { window.PIQ.go("studio"); };
    return d;
  }

  function head(c, blocks, stp) {
    var f = window.PIQ.fn(), p = window.PIQ.proc();
    return el("div", "fit-head",
      '<div><div class="kv">Discover & Fit — Pattern discovery & skill fitment</div>' +
      '<h2>' + esc(f.name) + ' › ' + esc((p || {}).name || "") + '</h2>' +
      '<p class="fit-lede">Every activity in the to-be flow is assessed for agent fit. The happy path is recorded and agentivised; the patterns become the variation handlers.</p></div>' +
      '<div class="fit-kpis">' +
        kpi(c.patternIds.length, "patterns") + kpi(blocks.length, "skills") + kpi(stp + "%", "straight-through") +
      '</div>');
  }
  function kpi(v, l) { return '<div class="fkpi"><b>' + v + '</b><span>' + l + '</span></div>'; }

  function distBar(dist, total) {
    var seg = [["Full-auto", "#27ae60"], ["Assisted", "#e67e22"], ["Human-led", "#c0392b"]];
    var bars = seg.filter(function (s) { return dist[s[0]]; }).map(function (s) {
      return '<i style="flex:' + dist[s[0]] + ';background:' + s[1] + '" title="' + s[0] + '"></i>';
    }).join("");
    var legend = seg.map(function (s) {
      return '<span class="dl"><i style="background:' + s[1] + '"></i>' + s[0] + ' · <b>' + dist[s[0]] + '</b></span>';
    }).join("");
    return el("div", "fit-dist",
      '<div class="fd-h">Agent fitment distribution <span class="muted">across ' + total + ' skills</span></div>' +
      '<div class="fd-bar">' + bars + '</div><div class="fd-legend">' + legend + '</div>');
  }

  // calibration of a skill's representative pattern (its Layer-2 event-series logic)
  function blockCalibration(b) {
    for (var i = 0; i < b.patterns.length; i++) {
      var p = window.PIQ.pattern(b.patterns[i]);
      if (p && p.calibration) return p.calibration;
    }
    return null;
  }

  function calCell(b) {
    var cal = blockCalibration(b);
    if (!cal) return '<div class="ft-cal"><span class="muted">—</span></div>';
    var traces = (cal.traceCount || 0).toLocaleString();
    return '<div class="ft-cal" title="Calibrated from ' + traces + ' client event traces · ' + esc(cal.method) + '">' +
      '<span class="cal-th"><span class="cal-def">' + esc(cal.defaultThreshold) + '</span><i>→</i>' +
      '<b class="cal-fit">' + esc(cal.calibratedThreshold) + '</b></span>' +
      '<span class="cal-delta">+' + cal.additionalCoverage + ' traces</span>' +
      '<span class="cal-badge">PM4Py Event Analysis</span></div>';
  }

  function fitmentTable(blocks) {
    var rows = blocks.map(function (b) {
      var fit = window.PIQ.fitment(b);
      var cfg = (C().skills[b.key] || {});
      var pct = Math.round(fit.score * 100);
      return '<div class="ftrow cal">' +
        '<div class="ft-src k-' + (b.source === "happy" ? "happy" : "vary") + '" title="' + (b.source === "happy" ? "happy path" : "variation") + '"></div>' +
        '<div class="ft-name"><b>' + esc(b.label) + '</b><span class="mono">' + esc(b.key) + '</span></div>' +
        '<div class="ft-tech">' + esc(cfg.tech || "—") + '</div>' +
        '<div class="ft-score"><div class="ft-bar"><i style="width:' + pct + '%"></i></div><span>' + pct + '%</span></div>' +
        calCell(b) +
        '<div class="ft-verdict"><span class="fitchip f-' + fit.mode + '">' + fit.tier + '</span></div></div>';
    }).join("");
    return el("div", "fit-table",
      '<div class="ftrow cal ft-head"><div class="ft-src"></div><div class="ft-name">Skill</div>' +
      '<div class="ft-tech">Technology</div><div class="ft-score">Fitment</div>' +
      '<div class="ft-cal">Calibration <span class="ft-cal-sub">default → client-fitted</span></div>' +
      '<div class="ft-verdict">Verdict</div></div>' + rows);
  }

  function happyPanel(happy) {
    var c = C();
    var recorded = (c.happyPath || []).length > 0;
    var flow = happy.map(function (b, i) {
      var cfg = c.skills[b.key] || {};
      return '<div class="hp-node' + (recorded ? " rec" : "") + '">' +
        '<div class="hp-i">' + (i + 1) + '</div><div class="hp-l">' + esc(b.label) + '</div>' +
        '<div class="hp-t">' + esc(cfg.tech || "") + '</div></div>';
    }).join('<span class="hp-arr">→</span>');
    return el("div", "fit-happy",
      '<div class="fh-top"><div><h3>Happy path · skill orchestration</h3>' +
      '<p class="muted">The no-variation route. Once recorded, this runs touchless in production — agentivised end-to-end.</p></div>' +
      '<button class="btn ' + (recorded ? "ghost" : "go") + ' sm" id="recBtn">' + (recorded ? "✓ Recorded & agentivised" : "● Record happy path") + '</button></div>' +
      '<div class="hp-flow">' + (flow || '<span class="muted">No happy-path skills in this selection.</span>') + '</div>');
  }

  /* Interactive to-be flow — each skill is a toggle between Agent (automated)
     and Manual (human). Toggling writes composition.skills[key].mode and recomputes
     the automated / semi-automated / manual distribution. A configuration surface,
     not just a display. */
  function blockMode(b) {
    var cfg = C().skills[b.key] || {};
    return cfg.mode || window.PIQ.fitment(b).mode;   // seed from fitment verdict
  }
  function tobeDist() {
    var blocks = window.PIQ.collectSkills(C().patternIds);
    var d = { automated: 0, semi: 0, manual: 0 };
    blocks.forEach(function (b) {
      if (blockMode(b) === "hitl") d.manual++;
      else if (window.PIQ.fitment(b).tier === "Full-auto") d.automated++;
      else d.semi++;
    });
    return d;
  }
  function toggleBlockMode(key) {
    var c = C();
    var blk = window.PIQ.collectSkills(c.patternIds).filter(function (b) { return b.key === key; })[0];
    var cur = (c.skills[key] && c.skills[key].mode) || (blk ? window.PIQ.fitment(blk).mode : "auto");
    if (!c.skills[key]) c.skills[key] = { tech: "", configured: false };
    c.skills[key].mode = cur === "hitl" ? "auto" : "hitl";
    c.skills[key].configured = true;
    if (window.PIQ.persistComposition) window.PIQ.persistComposition();
  }

  function distHtml(d) {
    var total = d.automated + d.semi + d.manual || 1;
    var seg = [["automated", d.automated, "#27ae60", "Automated"],
               ["semi", d.semi, "#e67e22", "Semi-automated"],
               ["manual", d.manual, "#c0392b", "Manual"]];
    var bars = seg.filter(function (s) { return s[1]; }).map(function (s) {
      return '<i style="flex:' + s[1] + ';background:' + s[2] + '" title="' + s[3] + '"></i>';
    }).join("");
    var legend = seg.map(function (s) {
      return '<span class="dl"><i style="background:' + s[2] + '"></i>' + s[3] + ' · <b>' + s[1] + '</b></span>';
    }).join("");
    var pa = Math.round(100 * d.automated / total), ps = Math.round(100 * d.semi / total);
    return '<div class="tb-dist"><div class="fd-bar">' + bars + '</div>' +
      '<div class="tb-distlbl"><b>' + pa + '%</b> automated · <b>' + ps + '%</b> semi-automated · <b>' +
      (100 - pa - ps) + '%</b> manual</div><div class="fd-legend">' + legend + '</div></div>';
  }

  function drawTobe(wrap) {
    var pats = window.PIQ.selectedPatterns();
    var lanes = pats.map(function (p) {
      var blocks = window.PIQ.collectSkills([p.id]);
      var chips = blocks.map(function (b) {
        var agent = blockMode(b) !== "hitl";
        return '<button class="tb-blk ' + (agent ? "agent" : "manual") + '" data-k="' + esc(b.key) + '" ' +
          'title="' + esc(b.key) + ' — click to toggle">' +
          '<span class="tbk-ic">' + (agent ? "🤖" : "✋") + '</span>' +
          '<span class="tbk-l">' + esc(b.label) + '</span>' +
          '<span class="tbk-mode">' + (agent ? "Agent" : "Manual") + '</span></button>';
      }).join("");
      return '<div class="tb-lane"><div class="tb-pat"><span class="pat-prio" style="background:' + PRIO[p.priority] + '"></span>' +
        esc(p.name) + '</div><div class="tb-blocks">' + chips + '</div></div>';
    }).join("");
    wrap.innerHTML =
      '<h3>To-be process flow <span class="muted">happy path + pattern-driven variation · click a skill to toggle Agent ⇄ Manual</span></h3>' +
      distHtml(tobeDist()) +
      '<div class="tb-wrap">' + lanes + '</div>';
    wrap.querySelectorAll(".tb-blk").forEach(function (btn) {
      btn.onclick = function () { toggleBlockMode(btn.dataset.k); drawTobe(wrap); };
    });
  }

  function tobePanel() {
    var wrap = el("div", "fit-tobe");
    drawTobe(wrap);
    return wrap;
  }

  function goLiveBar(stp) {
    var live = C().live;
    return el("div", "fit-golive",
      '<div><b>Ready to operate.</b> ' + stp + '% of activity is straight-through; the rest is governed by ' +
      C().patternIds.length + ' patterns with human-in-the-loop gates where judgement is required.</div>' +
      '<button class="btn go" id="goLive">' + (live ? "Open Mission Operations →" : "Go live → Run & Monitor") + '</button>');
  }

  function wire(root, happy) {
    var rec = root.querySelector("#recBtn");
    if (rec) rec.onclick = function () {
      C().happyPath = happy.map(function (b) { return b.key; });
      render2();
    };
    var gl = root.querySelector("#goLive");
    if (gl) gl.onclick = function () { C().live = true; window.PIQ.go("runtime"); };
  }
  function render2() {
    var view = document.getElementById("view"); view.innerHTML = ""; render(view);
  }

  window.PIQ.modules.fitment = { render: render };
  window.PIQ.onErp(function () { if (window.PIQ.active === "fitment") render2(); });
})();
