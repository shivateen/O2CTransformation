/* ProcessIQ — Continuous Discovery (Module 5)
 * Deck slides 16-17: the system finds the NEXT pattern. A three-stage pipeline
 * (Sift the Math -> Sift the Text -> Synthesize) surfaces a Candidate Pattern,
 * which an SME panel gates into the repository via the closed learning loop. */
(function () {
  "use strict";
  var D = window.PROCESSIQ_DISCOVERY;
  var E = window.ProcessIQEngine;
  var approved = false;     // session state: has the candidate been promoted?

  function money(x) { return E._money(x); }
  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function render(view) {
    var repoCount = D.meta.existingPatternCount + (approved ? 1 : 0);
    view.innerHTML = '<div class="disc"></div>';
    var root = view.querySelector(".disc");

    root.appendChild(el("div", "gov-head",
      '<div class="kv">Continuous Discovery · deck slides 16–17</div>' +
      '<h2 style="font-size:22px;margin:2px 0 4px">' + repoCount + ' Patterns Today. The System Finds #' + D.meta.candidateId + ' Next Quarter.</h2>' +
      '<p style="margin:0;color:var(--muted);max-width:800px">The engine doesn\'t just execute the playbook — it evolves it. A continuous pipeline sifts the math and the text for behaviour no rule anticipated, then asks an LLM to explain (not invent) what it found.</p>'));

    // pipeline controls
    var ctrl = el("div", "disc-ctrl");
    ctrl.innerHTML = '<button class="btn go" id="discRun">▶ Run discovery pipeline</button>' +
      '<span class="disc-hint">Scans ERP payment velocity + unstructured CRM / call / email text, continuously.</span>';
    root.appendChild(ctrl);

    // three stages
    var stages = el("div", "disc-stages");
    stages.appendChild(stageCard(1, "Sift the Math", "Isolation Forests", mathSvg()));
    stages.appendChild(stageCard(2, "Sift the Text", "Vector Embeddings", textSvg()));
    stages.appendChild(stageCard(3, "Synthesize", "LLM Narrative", '<div class="synth-wait">Awaiting anomaly subset…</div>'));
    root.appendChild(stages);

    // candidate slot (filled on synth) + closed loop
    var grid = el("div", "disc-grid");
    grid.appendChild(candidateSlot());
    grid.appendChild(loopCard());
    root.appendChild(grid);

    document.getElementById("discRun").onclick = runPipeline;
  }

  function stageCard(n, title, method, bodyHtml) {
    var c = el("div", "card dstage", "");
    c.id = "dstage" + n;
    c.innerHTML = '<h4><span class="num">' + n + '</span>' + esc(title) + ' <span class="dmethod">' + esc(method) + '</span></h4>' +
      '<div class="pad">' + bodyHtml + '<div class="dcap" id="dcap' + n + '"></div></div>';
    return c;
  }

  /* ---- Stage 1 SVG: isolation forest scatter ---- */
  function mathSvg() {
    var W = 300, H = 200, pl = 34, pb = 26, pt = 10, pr = 10;
    var iw = W - pl - pr, ih = H - pt - pb, MX = 40;
    function X(v) { return pl + iw * v / MX; }
    function Y(v) { return pt + ih * (1 - v / MX); }
    var diag = '<line x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(MX) + '" y2="' + Y(MX) + '" stroke="#dfe6ee" stroke-dasharray="3 3"/>';
    var nrm = D.stage1.normal.map(function (p) { return '<circle cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="3.2" fill="#13808f" opacity="0.55"/>'; }).join("");
    var ano = D.stage1.anomaly.map(function (p) { return '<circle class="anopt" cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="0" fill="#c0392b"/>'; }).join("");
    var ring = '<ellipse class="anoring" cx="' + X(12) + '" cy="' + Y(30) + '" rx="0" ry="0" fill="none" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="4 3"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" class="dsvg">' +
      diag + nrm + ring + ano +
      '<text x="' + (pl + iw / 2) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="9" fill="#9aa7b5">' + esc(D.stage1.xLabel) + '</text>' +
      '<text x="10" y="' + (pt + ih / 2) + '" text-anchor="middle" font-size="9" fill="#9aa7b5" transform="rotate(-90 10 ' + (pt + ih / 2) + ')">' + esc(D.stage1.yLabel) + '</text>' +
      '</svg>';
  }

  /* ---- Stage 2 SVG: embedding bubbles ---- */
  function textSvg() {
    var W = 300, H = 200;
    var bubbles = D.stage2.clusters.map(function (c, i) {
      var cx = 24 + c.x * (W - 48), cy = 18 + c.y * (H - 48), r = 6 + c.size * 1.6;
      var fill = c.anomaly ? "#c0392b" : "#8e44ad";
      var op = c.anomaly ? 0.18 : 0.12;
      return '<g class="bub" data-i="' + i + '">' +
        '<circle class="bubc' + (c.anomaly ? " ano" : "") + '" cx="' + cx + '" cy="' + cy + '" r="0" data-r="' + r + '" fill="' + fill + '" fill-opacity="' + op + '" stroke="' + fill + '" stroke-width="1.5"/>' +
        '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dy="3" font-size="9" font-weight="600" fill="' + (c.anomaly ? "#922" : "#5d4777") + '" opacity="0">' + c.size + '</text>' +
        '</g>';
    }).join("");
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" class="dsvg">' + bubbles + '</svg>';
  }

  function candidateSlot() {
    var c = el("div", "card", "");
    c.id = "candSlot";
    c.innerHTML = '<h4><span class="num">★</span>Candidate Pattern</h4><div class="pad" id="candBody"><div class="synth-wait">Run the pipeline to synthesise a candidate.</div></div>';
    return c;
  }

  /* ---- closed loop ---- */
  function loopCard() {
    var c = el("div", "card", "");
    c.innerHTML = '<h4><span class="num">↻</span>The Closed Loop — Candidates, Not Conclusions</h4>' +
      '<div class="pad"><div class="loop6" id="loop6">' +
      D.loop.map(function (s) {
        return '<div class="lstep" id="lstep' + s.step + '"><div class="lnum">' + s.step + '</div>' +
          '<div class="lbody"><div class="lname">' + esc(s.name) + '</div><div class="ldesc">' + esc(s.desc) + '</div></div></div>';
      }).join("") +
      '</div></div>';
    return c;
  }

  /* ---- the animated run ---- */
  function runPipeline() {
    approved = false;
    var btn = document.getElementById("discRun");
    btn.disabled = true; btn.textContent = "● Scanning…";
    setActiveLoop(1);

    // Stage 1: reveal anomaly cluster
    activate(1);
    cap(1, "");
    var ring = document.querySelector(".anoring");
    if (ring) { ring.style.transition = "all .8s ease"; ring.setAttribute("rx", 30); ring.setAttribute("ry", 26); }
    document.querySelectorAll(".anopt").forEach(function (p, i) {
      setTimeout(function () { p.style.transition = "r .3s"; p.setAttribute("r", 3.4); }, 300 + i * 70);
    });
    setTimeout(function () { cap(1, "⚠ <b>9 accounts</b> off-diagonal — historically Day 12, now Day 30. Anomaly score <b>0.91</b>. No rule catches this."); }, 1100);

    // Stage 2: grow bubbles, spotlight anomaly cluster
    setTimeout(function () {
      activate(2);
      document.querySelectorAll(".bub").forEach(function (g, i) {
        var circ = g.querySelector(".bubc"), txt = g.querySelector("text");
        setTimeout(function () {
          circ.style.transition = "r .5s ease"; circ.setAttribute("r", circ.getAttribute("data-r"));
          txt.style.transition = "opacity .5s"; txt.style.opacity = 1;
          if (circ.classList.contains("ano")) g.classList.add("pulse");
        }, i * 160);
      });
      setTimeout(function () { cap(2, "⚠ Spike of <b>14 ‘treasury timing’</b> excuses in one vertical, one fortnight — a coordinated cluster, not noise."); }, 1000);
    }, 1700);

    // Stage 3: synthesize candidate
    setTimeout(function () {
      activate(3);
      cap(3, "Feeding <b>only the anomalous subset</b> to the LLM → it explains the behaviour.");
      typeSynth();
    }, 3600);

    // reveal candidate card + advance loop to Approve
    setTimeout(function () {
      fillCandidate();
      setActiveLoop(2);
      btn.disabled = false; btn.textContent = "▶ Re-run discovery pipeline";
    }, 4600);
  }

  function activate(n) { var s = document.getElementById("dstage" + n); if (s) s.classList.add("on"); }
  function cap(n, html) { var c = document.getElementById("dcap" + n); if (c) c.innerHTML = html; }
  function typeSynth() {
    var host = document.querySelector("#dstage3 .synth-wait");
    if (host) host.innerHTML = '<span class="llm-dot"></span><span class="llm-dot"></span><span class="llm-dot"></span>';
  }

  function fillCandidate() {
    var cand = D.candidate;
    var body = document.getElementById("candBody");
    var synthHost = document.querySelector("#dstage3 .pad .synth-wait");
    if (synthHost) synthHost.outerHTML = '<div class="synth-done">✓ Candidate Pattern #' + cand.id + ' synthesised<div class="estfloat">Est. float gain <b>' + money(cand.estImpact) + '</b></div></div>';

    var dag = cand.proposedDAG.map(function (b) {
      var verbs = b.actions.map(function (a) { return '<span class="verb">' + esc(a) + '</span>'; }).join("");
      var hitl = b.hitl ? '<div class="b-hitl">🔒 HITL: ' + esc(b.hitl) + '</div>' : "";
      return '<div class="branch t-' + b.tier + '"><div class="b-cond mono">' + esc(b.condition) + '</div><div class="b-acts">' + verbs + '</div>' + hitl + '</div>';
    }).join("");

    body.innerHTML =
      '<div class="cand-h"><div class="cand-id">#' + cand.id + '</div>' +
      '<div><div class="cand-name">' + esc(cand.proposedName) + '</div>' +
      '<div class="cand-meta">Proposed · ' + esc(cand.proposedCategory) + ' · <span class="mono">' + esc(cand.proposedFeature) + '</span></div></div>' +
      '<div class="cand-conf">' + Math.round(cand.candidateConfidence * 100) + '%<span>candidate</span></div></div>' +
      '<div class="mental">“' + esc(cand.narrative) + '”<span class="who">— LLM narrative (explains the anomaly; does not invent it)</span></div>' +
      '<div class="cand-sigs"><div class="sig"><b>① Statistical</b>' + esc(cand.statSignal) + '</div>' +
      '<div class="sig"><b>② Textual</b>' + esc(cand.textSignal) + '</div></div>' +
      '<div class="d-sec"><h4>Proposed counter-strategy <span class="muted">drafted for SME review</span></h4><div class="branches">' + dag + '</div></div>' +
      '<div class="sme-gate" id="smeGate"><div class="sme-q">🔒 SME panel: is this real, actionable, and correctly countered?</div>' +
      '<div class="sme-btns"><button class="btn approve sm" id="smeApprove">✓ Approve into repository</button>' +
      '<button class="btn ghost sm" id="smeReject">Reject candidate</button></div></div>';

    document.getElementById("smeApprove").onclick = promote;
    document.getElementById("smeReject").onclick = function () {
      document.getElementById("smeGate").innerHTML = '<div class="sme-result rej">Candidate rejected — returned to the discovery queue for more evidence. Repository unchanged.</div>';
      setActiveLoop(1);
    };
  }

  function promote() {
    approved = true;
    var cand = D.candidate;
    // close the loop for real: promote the candidate into the live pattern library
    // and taxonomy so it is browsable in the Library and selectable in the Studio.
    addCandidateToLibrary(cand);
    // walk the loop: Detect -> Act -> Attribute -> Learn
    var steps = [3, 4, 5, 6];
    steps.forEach(function (s, i) { setTimeout(function () { setActiveLoop(s); }, 350 + i * 500); });
    document.getElementById("smeGate").innerHTML =
      '<div class="sme-result ok">✓ Pattern #' + cand.id + ' promoted — <b>versioned, effective-dated</b>, now scanning all customers in real time. ' +
      'Repository: ' + D.meta.existingPatternCount + ' → <b>' + (D.meta.existingPatternCount + 1) + '</b> patterns. ' +
      'It is now in the <b>Pattern Library</b> and selectable in the <b>Mission Builder</b>. The playbook compounds.</div>';
    // bump the header count
    var hd = document.querySelector(".disc .gov-head h2");
    if (hd) hd.innerHTML = (D.meta.existingPatternCount + 1) + ' Patterns Now. The System Finds #' + (D.meta.candidateId + 1) + ' Next Quarter.';
    toast("Pattern #" + cand.id + " added to library.");
  }

  // Materialise the SME-approved candidate as a full library pattern (same shape as
  // patterns.json), register it on PIQ.patterns + meta, and attach it to the relevant
  // O2C objective so it flows into the Studio's pattern picker.
  function addCandidateToLibrary(cand) {
    if ((window.PIQ.patterns || []).some(function (p) { return p.id === cand.id; })) return;
    var slug = String(cand.proposedFeature || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    var branches = cand.proposedDAG || [];
    var primary = branches.filter(function (b) { return b.tier === "primary"; })[0] || branches[0] || { actions: [] };
    var gates = branches.filter(function (b) { return b.hitl; }).map(function (b) { return b.hitl; });
    var pat = {
      id: cand.id, name: cand.proposedName, category: cand.proposedCategory,
      priority: "High", priorityRank: 1, mentalModel: cand.narrative, discovered: true,
      sources: { sap: ["BSID (AR open items)", "KNKK (credit master)"],
                 oracle: ["AR_PAYMENT_SCHEDULES_ALL", "HZ_CUST_ACCOUNTS"] },
      layer1_logicalMapping: "Customer payment-timing behaviour joined to the seasonal calendar — the actual days-to-pay per cohort against its own historical norm.",
      layer2_eventSeries: cand.statSignal,
      layer3_feature: cand.proposedFeature, featureSlug: slug,
      conceptualSQL: "-- discovered trigger for " + cand.proposedFeature +
        "\nSELECT * FROM ar_behaviour WHERE signal = '" + cand.proposedFeature + "'",
      originalDAG: ["Read_Payment_Behaviour", "Detect_" + cand.proposedFeature, "Score_Seasonal_Anomaly"]
        .concat(primary.actions || []),
      branchingDAG: branches, hitlGates: gates,
      calibration: { defaultThreshold: "0-2 days", calibratedThreshold: "0-30 days",
        traceCount: 14000, additionalCoverage: cand.affectedCustomers || 14, method: "PM4Py conformance analysis" },
    };
    window.PIQ.patterns.push(pat);
    window.PIQ._actionRepo = null;   // invalidate the cached action-block repository

    var meta = window.PIQ.meta;
    if (meta) {
      meta.patternCount = window.PIQ.patterns.length;
      var catRow = (meta.categories || []).filter(function (c) { return c.category === pat.category; })[0];
      if (catRow) { catRow.count++; catRow[pat.priority] = (catRow[pat.priority] || 0) + 1; }
    }
    // attach to the O2C Credit & Risk capability so the Mission Builder surfaces it
    var o2c = (window.PIQ.tax.functions || []).filter(function (f) { return f.id === "o2c"; })[0];
    if (o2c) o2c.processes.forEach(function (pr) { (pr.missions || []).forEach(function (r) { (r.capabilities || []).forEach(function (o) {
      if (o.id === "OC-21" && o.patternIds.indexOf(pat.id) < 0) {
        o.patternIds.push(pat.id); o.patternCount = o.patternIds.length; o2c.patternCount = (o2c.patternCount || 0) + 1;
      }
    }); }); });
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "piq-toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
  }

  function setActiveLoop(active) {
    D.loop.forEach(function (s) {
      var n = document.getElementById("lstep" + s.step);
      if (!n) return;
      n.classList.toggle("on", s.step === active);
      n.classList.toggle("done", s.step < active);
    });
  }

  window.PIQ.modules.discovery = { render: render };
})();
