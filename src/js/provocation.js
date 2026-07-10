/* ProcessIQ — The Provocation (Module 1)
 * Deck slides 2-4: the scrollytelling front door. The efficiency ceiling, the
 * 20-year timeline, the Efficiency vs Efficacy thesis, and the fresher->expert
 * cognitive-depth split. Scroll-reveal driven; ends by handing off to the cockpit. */
(function () {
  "use strict";
  var E = window.ProcessIQEngine;
  var year1 = (window.PROCESSIQ_ROI && window.PROCESSIQ_ROI.meta.year1Total) || 8400000;
  var patternCount = window.PIQ.meta.patternCount;

  function money(x) { return E._money(x); }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var ERAS = [
    ["1990s", "ERP Standardization", "Efficiency via system enforcement"],
    ["2000s", "BPM / Lean / Six Sigma", "Efficiency via process discipline"],
    ["2010s", "RPA & Workflow", "Efficiency via task automation"],
    ["2015+", "Process Mining", "Visibility via X-Ray — shows what's broken, not how to fix it"],
    ["2020s", "AI · Cognitive Decisions", "EFFICACY via expert judgment — the Surgeon, not the X-Ray"],
  ];

  var STATS = [
    ["$12M", "Annual write-offs that speed can't fix"],
    ["60%", "Of value left on the table"],
    [patternCount + "+", "Expert behavioural patterns codified"],
    ["3", "Layer semantic-brain architecture"],
    ["12wk", "Deployment to first value"],
    [money(year1) + "+", "Projected Year-1 recovery"],
  ];

  var TIERS = [
    {who: "Fresher", yrs: "0–2 yrs", cls: "t-fresh",
     does: "Sees an overdue invoice → sends the standard dunning letter.",
     out: "Invoice stays unpaid. The customer ignores it.", val: "$0 recovered"},
    {who: "Experienced", yrs: "5–10 yrs", cls: "t-exp",
     does: "Recognises something is off → escalates differently, adjusts terms.",
     out: "Partial recovery. Some value saved.", val: "Some value"},
    {who: "Expert", yrs: "20–25 yrs", cls: "t-master",
     does: "Instantly spots ‘Approval Musical Chairs’ → pins the economic buyer.",
     out: "Full recovery. The pattern is disrupted.", val: "$1.2M recovered"},
  ];

  function render(view) {
    view.innerHTML =
      '<div class="prov">' +

      // hero
      '<section class="phero reveal">' +
        '<div class="peyebrow">Leadership Briefing · Beyond Efficiency</div>' +
        '<h1 class="ptitle">AI-Driven Mission Control</h1>' +
        '<p class="psub">From doing things <span class="strike">faster</span> to doing the <em>right</em> things.</p>' +
        '<div class="phero-cta">' +
          '<button class="btn go" data-go="cockpit">See the cognitive loop in action →</button>' +
          '<button class="btn ghost" data-go="library">Browse the pattern library</button>' +
        '</div>' +
      '</section>' +

      // stat band
      '<section class="pstats reveal">' +
        STATS.map(function (s) { return '<div class="pstat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>'; }).join("") +
      '</section>' +

      // timeline
      '<section class="psec reveal">' +
        '<h2 class="psec-h">The Last 20 Years: We Optimised Speed.</h2>' +
        '<p class="psec-sub">Every wave of process technology chased efficiency. The hardest 60% of value — the part that needs judgment — was never addressed.</p>' +
        '<div class="ptimeline">' +
          ERAS.map(function (e, i) {
            var last = i === ERAS.length - 1;
            return '<div class="pera' + (last ? " leap" : "") + '" style="--d:' + (i * 0.08) + 's">' +
              '<div class="pera-yr">' + esc(e[0]) + '</div><div class="pera-dot"></div>' +
              '<div class="pera-name">' + esc(e[1]) + '</div><div class="pera-desc">' + esc(e[2]) + '</div></div>';
          }).join("") +
        '</div>' +
      '</section>' +

      // the provocation callout
      '<section class="pcallout reveal">' +
        '<div class="pcallout-tag">The Provocation</div>' +
        '<p>A collections team processes 500 invoices a day <b>40% faster</b> — and still writes off <b>$12M a year</b>.</p>' +
        '<p class="pwhy">Why? Junior analysts can\'t detect a customer running a deliberate delay tactic. <b>Speed didn\'t help. Expert judgment would have.</b></p>' +
      '</section>' +

      // efficiency vs efficacy
      '<section class="psec reveal">' +
        '<div class="pvs">' +
          '<div class="pvs-col eff"><div class="pvs-k">Efficiency</div><div class="pvs-d">Doing things <b>faster</b></div><div class="pvs-n">What technology delivered</div></div>' +
          '<div class="pvs-eq">≠</div>' +
          '<div class="pvs-col efy"><div class="pvs-k">Efficacy</div><div class="pvs-d">Doing the <b>right</b> things</div><div class="pvs-n">What the business always wanted</div></div>' +
        '</div>' +
        '<p class="pvs-note">The objective was always efficacy. Technology forced us to settle for efficiency. ProcessIQ closes the gap.</p>' +
      '</section>' +

      // cognitive depth tiers
      '<section class="psec reveal">' +
        '<h2 class="psec-h">Same Data. Same Process. Vastly Different Outcomes.</h2>' +
        '<p class="psec-sub">Hand the identical overdue invoice to three analysts. The difference is not speed — it is cognitive depth.</p>' +
        '<div class="ptiers">' +
          TIERS.map(function (t, i) {
            return '<div class="ptier ' + t.cls + '" style="--d:' + (i * 0.1) + 's">' +
              '<div class="ptier-h"><span class="ptier-who">' + esc(t.who) + '</span><span class="ptier-yrs">' + esc(t.yrs) + '</span></div>' +
              '<div class="ptier-l">What they do</div><div class="ptier-does">' + esc(t.does) + '</div>' +
              '<div class="ptier-l">Outcome</div><div class="ptier-out">' + esc(t.out) + '</div>' +
              '<div class="ptier-val">' + esc(t.val) + '</div></div>';
          }).join("") +
        '</div>' +
        '<div class="pclose reveal">' +
          '<p>This solution gives <b>every analyst</b> the judgment of the 25-year expert.</p>' +
          '<button class="btn go" data-go="cockpit">Watch it diagnose a live invoice →</button>' +
        '</div>' +
      '</section>' +

      '</div>';

    // navigation handoffs
    view.querySelectorAll("[data-go]").forEach(function (b) {
      b.onclick = function () { window.PIQ.go(b.dataset.go); };
    });

    // scroll reveal
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
      }, { threshold: 0.15 });
      view.querySelectorAll(".reveal").forEach(function (n) { io.observe(n); });
    } else {
      view.querySelectorAll(".reveal").forEach(function (n) { n.classList.add("in"); });
    }
  }

  window.PIQ.modules.provocation = { render: render };
})();
