/* ProcessIQ — Central Nervous System (Module 3)
 * Renders the Sense->Diagnose->Decide->Act loop + three-layer brain + action DAG
 * for the selected invoice. Registers with the shell as PIQ.modules.cockpit. */
(function () {
  "use strict";
  var E = window.ProcessIQEngine;
  var patterns = window.PIQ.patterns;
  var meta = window.PIQ.meta;
  var book = window.PIQ.book;
  var selected = null;
  var queued = {};     // belnr -> true : transactions moved to Pending Review
  var PRIO_COLOR = meta.priorityLegend;

  function erp() { return window.PIQ.erp; }
  function money(x) { return E._money(x); }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function risk(iv) {
    if (!iv.groundTruthFeature) return null;
    var p = patterns.filter(function (x) { return x.featureSlug === iv.groundTruthFeature; })[0];
    return p ? p.priority : "Medium";
  }

  /* ---------- worklist ---------- */
  function renderList() {
    var list = document.getElementById("invList");
    if (!list) return;
    list.innerHTML = "";
    var sorted = book.invoices.slice().sort(function (a, b) {
      var ra = E.run(a, patterns).diagnosis, rb = E.run(b, patterns).diagnosis;
      return (rb.confidence - ra.confidence) || (b.amount - a.amount);
    });
    sorted.forEach(function (iv) {
      var r = E.run(iv, patterns).diagnosis;
      var pr = risk(iv);
      var node = el("div", "inv" + (selected && selected.belnr === iv.belnr ? " sel" : ""));
      var pill = pr ? '<span class="riskpill" style="background:' + PRIO_COLOR[pr] + '">' + pr + '</span>'
        : '<span class="riskpill clean">Clean</span>';
      if (queued[iv.belnr]) pill += '<span class="riskpill review">In review</span>';
      node.innerHTML =
        '<div class="r1"><span class="cust">' + iv.customer + '</span><span class="amt">' + money(iv.amount) + '</span></div>' +
        '<div class="r2"><span class="mono">' + iv.invoiceId + ' · ' + iv.terms + '</span><span class="dpd">' + iv.dpd + ' DPD</span></div>' +
        '<div class="r2" style="margin-top:6px">' + pill +
        (r.fired ? '<span class="mono" style="font-size:11px;color:var(--diag)">' + (r.confidence * 100 | 0) + '% ' + r.top.pattern.name + '</span>' : '<span class="mono" style="font-size:11px">no pattern</span>') +
        '</div>';
      node.onclick = function () { selected = iv; renderList(); renderCockpit(); };
      list.appendChild(node);
    });
  }

  /* ---------- confidence gauge (SVG) ---------- */
  function gauge(pct) {
    var r = 34, c = 2 * Math.PI * r, off = c * (1 - pct);
    var col = pct > 0.85 ? "#8e44ad" : pct > 0.6 ? "#d68910" : "#9aa7b5";
    return '<svg class="gauge" width="92" height="92" viewBox="0 0 92 92">' +
      '<circle cx="46" cy="46" r="' + r + '" fill="none" stroke="#eef2f6" stroke-width="9"/>' +
      '<circle cx="46" cy="46" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="9" stroke-linecap="round" ' +
      'stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" transform="rotate(-90 46 46)"/>' +
      '<text x="46" y="44" text-anchor="middle" font-size="21" font-weight="800" fill="' + col + '">' + (pct * 100 | 0) + '</text>' +
      '<text x="46" y="60" text-anchor="middle" font-size="10" fill="#5d6b7d">% CONF</text></svg>';
  }

  /* ---------- main cockpit ---------- */
  function renderCockpit() {
    var c = document.getElementById("cockpit");
    if (!c) return;
    if (!selected) { c.innerHTML = EMPTY; return; }
    var iv = selected;
    var res = E.run(iv, patterns);
    var d = res.diagnosis, dec = res.decision;
    var pat = d.fired ? d.top.pattern : null;

    c.innerHTML = "";
    var head = el("div", "inv-head");
    head.innerHTML =
      '<div><div class="kv">INVOICE</div><div class="big">' + iv.invoiceId + '</div></div>' +
      kv("Customer", iv.customer + ' <span class="mono" style="color:var(--muted)">' + iv.kunnr + '</span>') +
      kv("Amount", money(iv.amount)) + kv("Terms", iv.terms) +
      kv("Days Past Due", iv.dpd + 'd') + kv("Vertical", iv.vertical);
    c.appendChild(head);

    var loop = el("div", "loop");
    loop.innerHTML =
      stage("sense", "S", "SENSE", d.fired ? '<b>' + d.top.result.features.length + ' signals</b> detected in the transaction record' : 'Scanning event series — <b>no anomaly</b>') +
      stage("diag", "D", "DIAGNOSE", pat ? 'Pattern <b>#' + pat.id + ' — ' + pat.name + '</b> (' + (d.confidence * 100 | 0) + '%)' : 'No behavioural pattern matches') +
      stage("decide", "R", "DECIDE", dec ? 'Counter-strategy: <b>' + tierLabel(dec.branch.tier) + '</b>' + (dec.requiresHITL ? ' · HITL gate' : '') : 'Standard dunning — no intervention') +
      stage("act", "A", "ACT", dec ? '<b>' + countActions(res.actionDAG) + ' actions</b> assembled as a rollback-ready DAG' : 'Monitor only', true);
    c.appendChild(loop);

    if (!d.fired) { c.appendChild(cleanCard(iv)); c.appendChild(note()); animateStages(); return; }

    var grid = el("div", "grid");
    grid.appendChild(brainCard(iv, pat, d));
    var right = el("div"); right.style.display = "flex"; right.style.flexDirection = "column"; right.style.gap = "18px";
    right.appendChild(diagnosisCard(pat, d));
    right.appendChild(decisionCard(pat, dec));
    grid.appendChild(right);
    c.appendChild(grid);

    var actionWrap = el("div"); actionWrap.style.marginTop = "18px";
    actionWrap.appendChild(actionCard(iv, pat, dec, res));
    c.appendChild(actionWrap);
    c.appendChild(note());
    animateStages();
  }

  function kv(k, v) { return '<div><div class="kv">' + k + '</div><b>' + v + '</b></div>'; }
  function stage(s, ic, tag, body, last) {
    return '<div class="stage s-' + s + '"><div class="tag"><span class="ic">' + ic + '</span>' + tag + '</div>' +
      '<div class="body">' + body + '</div>' + (last ? '' : '<span class="arrow">→</span>') + '</div>';
  }
  function tierLabel(t) { return { primary: "Assisted nudge", escalation: "Escalate & enforce", immediate: "Immediate block", default: "Standard action" }[t] || t; }
  function countActions(dag) { var n = 0; dag.forEach(function (s) { n += s.actions.length; }); return n; }
  function animateStages() {
    var st = document.querySelectorAll(".stage");
    st.forEach(function (s, i) { setTimeout(function () { s.classList.add("on"); }, 120 + i * 260); });
  }

  function brainCard(iv, pat, d) {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">B</span>The Three-Layer Semantic Brain</h4>';
    var tables = (erp() === "sap" ? pat.sources.sap : pat.sources.oracle);
    var tchips = tables.map(function (t) { return '<span class="tbl">' + escapeHtml(t) + '</span>'; }).join("");
    var l1 = el("div", "layer");
    l1.innerHTML = '<div class="lh"><span class="ln">1</span>Logical Mapping</div>' +
      '<div class="ld">' + escapeHtml(pat.layer1_logicalMapping) + '</div>' +
      '<div class="tables">' + tchips + '</div>';
    card.appendChild(l1);
    var l2 = el("div", "layer");
    var tl = iv.eventSeries.map(function (e, i) {
      var flag = i === iv.eventSeries.length - 1 ? " flag" : "";
      return '<div class="tl' + flag + '"><div class="d">Day ' + e.day + '</div><div class="l">' + escapeHtml(e.label) + '</div></div>';
    }).join("");
    l2.innerHTML = '<div class="lh"><span class="ln">2</span>Event Series</div>' +
      '<div class="ld">' + escapeHtml(pat.layer2_eventSeries) + '</div>' +
      '<div class="timeline">' + tl + '</div>';
    card.appendChild(l2);
    var l3 = el("div", "layer");
    var rows = d.top.result.features.map(function (ft) {
      return '<div class="fv">' + ft.value + '</div><div><div class="fn">' + ft.name + '</div><div class="fh">' + escapeHtml(ft.hint || "") + '</div></div>';
    }).join("");
    l3.innerHTML = '<div class="lh"><span class="ln">3</span>AI Features — Expert Triggers</div>' +
      '<div class="ld">Pre-calculated triggers that drive cognitive reasoning.</div>' +
      '<div class="feat">' + rows + '</div>';
    card.appendChild(l3);
    return card;
  }

  function diagnosisCard(pat, d) {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">D</span>Diagnosis</h4>';
    var pad = el("div", "pad");
    pad.innerHTML = '<div class="diag-top">' + gauge(d.confidence) +
      '<div class="diag-meta"><div class="pat">#' + pat.id + ' · ' + pat.name + '</div>' +
      '<div class="cat">' + pat.category + '</div>' +
      '<span class="badge" style="background:' + PRIO_COLOR[pat.priority] + '">' + pat.priority + ' priority</span></div></div>' +
      '<div class="mental">“' + escapeHtml(pat.mentalModel) + '”<span class="who">— the 25-year expert\'s reasoning, codified</span></div>';
    card.appendChild(pad);
    return card;
  }

  function decisionCard(pat, dec) {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">R</span>Decision & Governance</h4>';
    var pad = el("div", "pad");
    var tiers = ["primary", "escalation", "immediate"];
    var present = {}; (pat.branchingDAG || []).forEach(function (b) { present[b.tier] = true; });
    var tbar = tiers.filter(function (t) { return present[t]; }).map(function (t) {
      var on = dec.branch.tier === t;
      return '<div class="t' + (on ? " on" + (t === "immediate" ? " immediate" : "") : "") + '">' + tierLabel(t) + '</div>';
    }).join("");
    var html = '<div class="branchsel"><div class="cond">' + escapeHtml(dec.branch.condition) + '</div></div>' +
      '<div class="tierbar">' + tbar + '</div>' +
      '<div style="font-size:12px;color:var(--muted)">Severity score <b style="color:var(--decide)">' + dec.severity.toFixed(2) + '</b> selects the response tier. The system acts proportionally to value at risk.</div>';
    if (dec.requiresHITL) {
      html += '<div class="hitl"><span class="lock">🔒</span><div class="txt"><b>Human-in-the-Loop gate</b>' + escapeHtml(dec.hitl) + '</div></div>';
    }
    pad.innerHTML = html;
    card.appendChild(pad);
    return card;
  }

  function actionCard(iv, pat, dec, res) {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">A</span>Skill DAG — Deterministic, Rollback-Ready Execution</h4>';
    var pad = el("div", "pad");
    var dag = el("div", "dag");
    res.actionDAG.forEach(function (s) {
      var node = el("div", "dnode");
      var verbs = s.actions.map(function (a) {
        var cls = "verb" + (a.mutating ? " write" : "");
        var sg = a.compensable ? '<span class="sg">↺ SAGA</span>' : '';
        return '<span class="' + cls + '">' + escapeHtml(a.verb) + sg + '</span>';
      }).join("");
      node.innerHTML = '<span class="sn">' + s.step + '</span><div class="dverbs">' + verbs + '</div>';
      dag.appendChild(node);
    });
    pad.appendChild(dag);
    var saga = el("div", "saga-row");
    saga.innerHTML = chip("↺", "Saga: write-steps auto-rollback") + chip("⟳", "Idempotent retry on locked records") +
      chip("⊕", "SAP remains system of record") + chip("⊘", "Deterministic API blocks — no hallucination");
    pad.appendChild(saga);
    var exec = el("div", "exec");
    var queuedNow = !!queued[iv.belnr];
    var primary = dec.requiresHITL
      ? '<button class="btn approve" id="approveBtn">🔒 Approve &amp; Execute DAG</button>'
      : '<button class="btn go" id="approveBtn">Execute DAG</button>';
    var queueBtn = queuedNow
      ? '<button class="btn ghost" id="queueBtn" disabled>✓ Queued — in review</button>'
      : '<button class="btn ghost" id="queueBtn">Queue for review</button>';
    exec.innerHTML = primary + '<button class="btn ghost" id="editPayloadBtn">Edit payload</button>' + queueBtn;
    pad.appendChild(exec);
    var gov = el("div", "gov-note");
    gov.innerHTML = '<span>Mode: <b>' + (queuedNow ? "Pending review" : (dec.requiresHITL ? "Assisted (HITL)" : "Policy-approved")) + '</b></span>' +
      '<span>Outcome attribution: <b>ON</b></span><span>Audit log: <b>cryptographic</b></span>';
    pad.appendChild(gov);
    card.appendChild(pad);
    setTimeout(function () {
      var b = document.getElementById("approveBtn");
      if (b) b.onclick = function () {
        b.textContent = "✓ Executed — " + countActions(res.actionDAG) + " steps committed, attribution tracking";
        b.className = "btn ghost"; b.disabled = true;
      };
      var ep = document.getElementById("editPayloadBtn");
      if (ep) ep.onclick = function () { openPayloadModal(iv, pat, dec); };
      var q = document.getElementById("queueBtn");
      if (q && !queued[iv.belnr]) q.onclick = function () {
        queued[iv.belnr] = true;
        renderList(); renderCockpit();
      };
    }, 10);
    return card;
  }

  /* Edit payload — read-only modal exposing the transaction's raw data fields.
     (Read-only for now; a future release makes the payload editable pre-execution.) */
  function pmEsc(e) { if (e.key === "Escape") closePayloadModal(); }
  function closePayloadModal() {
    var b = document.querySelector(".pm-back");
    if (b) { b.remove(); document.removeEventListener("keydown", pmEsc); }
  }
  function openPayloadModal(iv, pat, dec) {
    closePayloadModal();
    var fields = [
      ["Invoice ID", iv.invoiceId], ["Document (BELNR)", iv.belnr],
      ["Customer", iv.customer], ["Customer no. (KUNNR)", iv.kunnr],
      ["Amount", money(iv.amount)], ["Terms", iv.terms],
      ["Days past due", iv.dpd + "d"], ["Vertical", iv.vertical],
      ["Ground-truth feature", iv.groundTruthFeature || "—"],
      ["Matched pattern", pat ? ("#" + pat.id + " · " + pat.name) : "none"],
      ["Response tier", dec ? tierLabel(dec.branch.tier) : "—"],
      ["Requires HITL", dec && dec.requiresHITL ? "yes" : "no"],
    ];
    var rows = fields.map(function (f) {
      return '<div class="pm-row"><span class="pm-k">' + escapeHtml(f[0]) + '</span>' +
        '<span class="pm-v mono">' + escapeHtml(String(f[1])) + '</span></div>';
    }).join("");
    var events = (iv.eventSeries || []).map(function (e) {
      return '<div class="pm-ev"><span class="pm-d">Day ' + e.day + '</span><span>' + escapeHtml(e.label) + '</span></div>';
    }).join("");
    var back = el("div", "pm-back");
    var dlg = el("div", "pm-dlg");
    dlg.innerHTML =
      '<div class="pm-head"><h3>Raw payload · ' + escapeHtml(iv.invoiceId) + '</h3>' +
      '<span class="pm-ro">read-only</span><button class="pm-x" id="pmClose">✕</button></div>' +
      '<div class="pm-body"><div class="pm-fields">' + rows + '</div>' +
      (events ? '<div class="pm-evh">Event series</div><div class="pm-evs">' + events + '</div>' : '') +
      '</div><div class="pm-foot"><span class="muted">This is the exact record the action DAG operates on. SAP / Oracle remains the system of record.</span>' +
      '<button class="btn ghost sm" id="pmDone">Close</button></div>';
    back.appendChild(dlg);
    back.addEventListener("mousedown", function (e) { if (e.target === back) closePayloadModal(); });
    document.addEventListener("keydown", pmEsc);
    document.body.appendChild(back);
    dlg.querySelector("#pmClose").onclick = closePayloadModal;
    dlg.querySelector("#pmDone").onclick = closePayloadModal;
  }

  function chip(ic, txt) { return '<span class="chip">' + ic + ' ' + txt + '</span>'; }
  function cleanCard(iv) {
    var card = el("div", "card");
    card.innerHTML = '<h4><span class="num">✓</span>No Behavioural Pattern Detected</h4>' +
      '<div class="pad"><p style="margin:0 0 8px">This invoice is paying within normal parameters — the cognitive loop found no float-extension, dispute-manipulation, or credit-risk tactic. Standard dunning applies; the analyst\'s attention is freed for the items that matter.</p>' +
      '<div class="saga-row">' + chip("", "Payment ratio nominal") + chip("", "No dispute proximity") + chip("", "DPD within terms") + '</div></div>';
    return card;
  }
  function note() {
    return el("div", "note", "Central Nervous System — Module 3. Engine runs on-device from the AR Pattern Library v2 (" + meta.patternCount + " patterns). Deterministic diagnosis — every verdict traces to a pattern and its event series.");
  }
  function escapeHtml(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  var EMPTY =
    '<div class="empty"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">' +
    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
    '<div><b>Select an invoice</b> to watch the cognitive loop diagnose it.</div>' +
    '<div style="font-size:12px;max-width:340px">Each open item carries an event timeline. ProcessIQ senses the signals, names the behavioural pattern, and assembles a governance-approved action.</div></div>';

  /* ---------- Compound Signals (cross-process, collective intelligence) ----------
     Correlates the theme's cross-process compound patterns against the invoices in
     the worklist. A compound signal is emergent risk that no single process flags. */
  function applicableCompounds() {
    var list = window.PIQ.compoundPatterns();
    if (list.length) return list;
    // the cockpit is the O2C AR cockpit — fall back to every theme touching O2C
    var out = [];
    (window.PIQ.tax.themes || []).forEach(function (t) {
      if ((t.functionIds || []).indexOf("o2c") < 0) return;
      (t.crossProcessPatterns || []).forEach(function (cp) {
        out.push({ theme: t, cp: cp, constituents: window.PIQ.compoundConstituents(cp) });
      });
    });
    return out;
  }
  function invoiceForPattern(pid) {
    var p = patterns.filter(function (x) { return x.id === pid; })[0];
    if (!p) return null;
    return book.invoices.filter(function (iv) { return iv.groundTruthFeature === p.featureSlug; })[0] || null;
  }

  function compoundSection() {
    var comps = applicableCompounds();
    if (!comps.length) return "";
    var cards = comps.map(function (a) {
      var present = 0, entity = null;
      var cons = a.constituents.map(function (id) {
        var p = patterns.filter(function (x) { return x.id === id; })[0];
        var iv = invoiceForPattern(id);
        if (iv) { present++; if (!entity) entity = iv.customer; }
        return '<span class="cs-pat' + (iv ? " fired" : "") + '">#' + id +
          (p ? ' ' + escapeHtml(p.name) : '') + '</span>';
      }).join("");
      var active = present >= 2;
      return '<div class="cs-card ' + (active ? "active" : "watch") + '">' +
        '<div class="cs-top"><span class="cs-state">' + (active ? "● ACTIVE" : "○ MONITORING") + '</span>' +
        '<span class="cs-name">' + escapeHtml(a.cp.name) + '</span>' +
        (active && entity ? '<span class="cs-ent">' + escapeHtml(entity) + '</span>' : '') + '</div>' +
        '<div class="cs-desc">' + escapeHtml(a.cp.description) + '</div>' +
        '<div class="cs-cons"><span class="cs-lab">Constituent patterns</span>' + cons + '</div>' +
        '<div class="cs-resp"><b>Recommended compound response</b> ' + escapeHtml(a.cp.response) + '</div></div>';
    }).join("");
    return '<div class="cs-band"><div class="cs-h">⚠ Compound Signals ' +
      '<small>collective intelligence — emergent cross-process risk no single pattern catches</small></div>' +
      '<div class="cs-cards">' + cards + '</div></div>';
  }

  /* ---------- module registration ---------- */
  window.PIQ.modules.cockpit = {
    render: function (view) {
      // honor a deep-link from the Pattern Library ("see it live")
      if (window.PIQ._jumpInvoice) {
        selected = book.invoices.filter(function (iv) { return iv.belnr === window.PIQ._jumpInvoice; })[0] || selected;
        window.PIQ._jumpInvoice = null;
      }
      view.innerHTML =
        compoundSection() +
        '<div class="wrap"><aside class="worklist"><h3>Collections Worklist</h3><div id="invList"></div></aside>' +
        '<main class="cockpit" id="cockpit"></main></div>';
      renderList();
      renderCockpit();
    },
  };
  window.PIQ.onErp(function () { if (window.PIQ.active === "cockpit") { renderList(); renderCockpit(); } });
})();
