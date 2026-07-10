/* Run & Monitor — Mission Operations
 * The composed process, in production. A deterministic transaction stream flows in:
 *   • clean transactions match the happy path → straight-through, touchless (auto)
 *   • transactions with variation are matched to a pattern's branching DAG → the branch
 *     fires; if the branch carries a HITL gate, DAG approval is sought before execution
 * Live KPIs (STP rate, auto-resolved, pending approvals, value released) update as it runs.
 */
(function () {
  "use strict";
  var PRIO = window.PIQ.meta.priorityLegend;

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function money(n) { return window.PIQ.E._money(n); }
  function C() { return window.PIQ.composition; }

  var NAMES = ["Halberd Industrial", "Meridian Foods", "Cobalt Retail", "Northwind Mfg",
    "Arcadia Health", "Veritas Logistics", "Sundial CPG", "Orion Components",
    "Lumen Energy", "Pioneer Textiles", "Atlas Freight", "Crest Pharma"];

  var sim = null;     // simulator state (rebuilt when the composition changes)
  var timer = null;

  function pickBranch(p, i) {
    var bs = p.branchingDAG || [];
    if (!bs.length) return -1;
    return i % bs.length;
  }

  function buildSim() {
    var c = C();
    var pats = window.PIQ.selectedPatterns();
    // Deterministic SYNTHETIC demo stream — 18 fabricated transactions with a fixed
    // spread of clean (happy-path) and variation (pattern-matched) items. This is
    // illustrative demo data, not a live ERP feed; nothing here is a real invoice.
    var q = [];
    for (var i = 0; i < 18; i++) {
      var entity = NAMES[i % NAMES.length];
      var amt = 12000 + ((i * 53) % 40) * 2200;   // deterministic spread
      if (i % 3 === 2 && pats.length) {
        var p = pats[i % pats.length];
        var bidx = pickBranch(p, i);
        var br = p.branchingDAG[bidx] || {};
        q.push({ n: i + 1, id: "TXN-" + (10480 + i * 7), entity: entity, amt: amt,
          kind: "variation", patternId: p.id, branchIdx: bidx, needsApproval: !!br.hitl, status: "queued" });
      } else {
        q.push({ n: i + 1, id: "TXN-" + (10480 + i * 7), entity: entity, amt: amt, kind: "clean", status: "queued" });
      }
    }
    applyCompoundSeed(q, pats);
    return { q: q, cursor: 0, log: [], counts: { stp: 0, auto: 0, pending: 0, approved: 0, rejected: 0, value: 0 } };
  }

  /* Compound-signal seed — force two variation transactions to share one entity and
     fire two constituents of an applicable cross-process pattern, so the second-pass
     compound scan reliably surfaces an emergent signal in the demo. */
  function applyCompoundSeed(q, pats) {
    var selIds = {}; pats.forEach(function (p) { selIds[p.id] = 1; });
    var applicable = window.PIQ.compoundPatterns();
    var pick = null;
    for (var a = 0; a < applicable.length; a++) {
      var cons = applicable[a].constituents.filter(function (id) { return selIds[id]; });
      if (cons.length >= 2) { pick = cons; break; }
    }
    if (!pick) return;
    var slots = [];
    for (var j = 0; j < q.length; j++) if (q[j].kind === "variation") slots.push(j);
    if (slots.length < 2) return;
    var entity = q[slots[0]].entity;
    [0, 1].forEach(function (k) {
      var t = q[slots[k]], p = window.PIQ.pattern(pick[k]);
      if (!p) return;
      var br = (p.branchingDAG || [])[0] || {};
      t.entity = entity; t.patternId = pick[k]; t.branchIdx = 0; t.needsApproval = !!br.hitl;
    });
  }

  /* Second pass — after individual transactions are matched, correlate the fired
     patterns per entity against the theme's cross-process compound patterns. A
     combination that no single process would flag surfaces as a Compound Signal. */
  function compoundSignals() {
    var applicable = window.PIQ.compoundPatterns();
    if (!applicable.length || !sim) return [];
    var byEntity = {}, globalFired = {};
    sim.q.forEach(function (t) {
      if (t.kind === "variation" && t.patternId &&
          (t.status === "auto" || t.status === "approved" || t.status === "pending")) {
        (byEntity[t.entity] = byEntity[t.entity] || {})[t.patternId] = 1;
        globalFired[t.patternId] = 1;
      }
    });
    var out = [];
    applicable.forEach(function (a) {
      if (a.constituents.length < 2) return;
      var fired = a.constituents.filter(function (id) { return globalFired[id]; });
      if (fired.length < 2) return;
      var bestE = null, bestN = 0;
      Object.keys(byEntity).forEach(function (e) {
        var n = a.constituents.filter(function (id) { return byEntity[e][id]; }).length;
        if (n > bestN) { bestN = n; bestE = e; }
      });
      out.push({ cp: a.cp, theme: a.theme, fired: fired, entity: bestE, concentrated: bestN >= 2 });
    });
    return out;
  }

  function ensureSim(force) {
    var sig = C().patternIds.join(",") + "|" + Object.keys(C().skills).length;
    if (force || !sim || sim.sig !== sig) { sim = buildSim(); sim.sig = sig; }
  }

  /* ---------------- render ---------------- */
  function render(view) {
    stopAuto();
    if (!C().patternIds.length) { view.appendChild(empty()); return; }
    ensureSim(false);
    var root = el("div", "rt");
    root.appendChild(head());
    root.appendChild(kpis());
    var comp = el("div", "rt-compound"); comp.id = "rtCompound";
    root.appendChild(comp);   // filled by drawCompound as compound signals emerge
    var grid = el("div", "rt-grid");
    grid.innerHTML = '<div class="rt-stream" id="rtStream"></div>' +
      '<div class="rt-side"><div class="rt-approvals" id="rtApprovals"></div>' +
      '<div class="rt-feed" id="rtFeed"></div></div>';
    root.appendChild(grid);
    view.appendChild(root);
    drawStream(); drawApprovals(); drawFeed(); drawKpis(); drawCompound();
    wireControls(root);
  }

  function empty() {
    var d = el("div", "fit-empty",
      '<div class="kv">Run & Monitor — Mission Execution</div><h2>No live process</h2>' +
      '<p>Compose a process in the <b>Mission Builder</b> and promote it through <b>Discover & Fit</b> to operate it here.</p>' +
      '<button class="btn go" id="toStudio">← Go to Mission Builder</button>');
    d.querySelector("#toStudio").onclick = function () { window.PIQ.go("studio"); };
    return d;
  }

  function head() {
    var f = window.PIQ.fn(), p = window.PIQ.proc();
    return el("div", "rt-head",
      '<div><div class="kv">Run & Monitor — Agentic workflow in production</div>' +
      '<h2>' + esc(f.name) + ' › ' + esc((p || {}).name || "") + ' <span class="livedot">● LIVE</span></h2></div>' +
      '<div class="rt-ctrl">' +
        '<button class="btn go sm" id="rtStep">Process next ▸</button>' +
        '<button class="btn sm" id="rtAuto">Auto-run ⏵</button>' +
        '<button class="btn ghost sm" id="rtReset">Reset</button></div>');
  }

  function kpis() {
    return el("div", "rt-kpis", '' +
      kpi("kStp", "0%", "Straight-through") + kpi("kAuto", "0", "Auto-resolved") +
      kpi("kPend", "0", "Pending approval") + kpi("kAppr", "0", "DAG-approved") +
      kpi("kVal", "$0", "Value released"));
  }
  function kpi(id, v, l) { return '<div class="rkpi"><b id="' + id + '">' + v + '</b><span>' + l + '</span></div>'; }

  function drawKpis() {
    var c = sim.counts, done = sim.cursor;
    var stp = done ? Math.round(100 * c.stp / done) : 0;
    set("kStp", stp + "%"); set("kAuto", c.auto); set("kPend", c.pending);
    set("kAppr", c.approved); set("kVal", money(c.value));
  }
  function set(id, v) { var n = document.getElementById(id); if (n) n.textContent = v; }

  function drawStream() {
    var s = document.getElementById("rtStream"); if (!s) return;
    var rows = sim.q.map(function (t) {
      var cls = "rtx s-" + t.status;
      var badge, sub;
      if (t.status === "queued") { badge = '<span class="rtx-b q">queued</span>'; sub = ""; }
      else if (t.kind === "clean") { badge = '<span class="rtx-b stp">STRAIGHT-THROUGH</span>'; sub = "happy path · touchless"; }
      else {
        var p = window.PIQ.pattern(t.patternId);
        var label = p ? p.name : "pattern";
        if (t.status === "pending") badge = '<span class="rtx-b pend">AWAITING DAG APPROVAL</span>';
        else if (t.status === "approved") badge = '<span class="rtx-b appr">APPROVED ✓</span>';
        else if (t.status === "rejected") badge = '<span class="rtx-b rej">REJECTED ✕</span>';
        else badge = '<span class="rtx-b auto">AUTO-RESOLVED</span>';
        sub = 'matched <b>' + esc(label) + '</b>';
      }
      return '<div class="' + cls + '"><div class="rtx-n">' + t.n + '</div>' +
        '<div class="rtx-main"><div class="rtx-id">' + esc(t.id) + ' · ' + esc(t.entity) +
        '<span class="rtx-amt">' + money(t.amt) + '</span></div>' +
        '<div class="rtx-sub">' + sub + '</div></div>' + badge + '</div>';
    }).join("");
    s.innerHTML = '<div class="rt-streamh">Transaction stream <span class="muted">' + sim.cursor + ' / ' + sim.q.length + ' processed</span></div>' + rows;
    var active = s.querySelector(".s-queued");
    if (active && sim.cursor < sim.q.length) active.classList.add("next");
  }

  function drawApprovals() {
    var a = document.getElementById("rtApprovals"); if (!a) return;
    var pend = sim.q.filter(function (t) { return t.status === "pending"; });
    if (!pend.length) { a.innerHTML = '<div class="ap-empty">No approvals pending. Variations with HITL gates land here for sign-off before the DAG executes.</div>'; return; }
    a.innerHTML = '<div class="ap-h">🔒 DAG approvals <span class="ap-c">' + pend.length + '</span></div>' +
      pend.map(function (t) {
        var p = window.PIQ.pattern(t.patternId), br = p.branchingDAG[t.branchIdx];
        return '<div class="apcard" data-n="' + t.n + '">' +
          '<div class="ap-top"><span class="pat-prio" style="background:' + PRIO[p.priority] + '"></span>' +
          esc(p.name) + '<span class="ap-tx">' + esc(t.id) + '</span></div>' +
          '<div class="ap-cond mono">' + esc(br.condition) + '</div>' +
          '<div class="ap-act">→ ' + esc(window.PIQ.prettify((br.actions || []).join(" + "))) + '</div>' +
          '<div class="ap-gate">🔒 ' + esc(br.hitl) + '</div>' +
          '<div class="ap-btns"><button class="btn go xs" data-act="approve" data-n="' + t.n + '">Approve</button>' +
          '<button class="btn ghost xs" data-act="reject" data-n="' + t.n + '">Reject</button></div></div>';
      }).join("");
    a.querySelectorAll("[data-act]").forEach(function (b) {
      b.onclick = function () { decide(+b.dataset.n, b.dataset.act); };
    });
  }

  function drawFeed() {
    var f = document.getElementById("rtFeed"); if (!f) return;
    if (!sim.log.length) { f.innerHTML = '<div class="feed-h">Activity</div><div class="ap-empty">Press <b>Process next</b> or <b>Auto-run</b> to start the stream.</div>'; return; }
    f.innerHTML = '<div class="feed-h">Activity</div>' + sim.log.slice().reverse().map(function (e) {
      return '<div class="feed-i k-' + e.k + '"><span class="fi-dot"></span>' + e.t + '</div>';
    }).join("");
  }

  /* ---------------- engine ---------------- */
  function step() {
    if (sim.cursor >= sim.q.length) { stopAuto(); return false; }
    var t = sim.q[sim.cursor];
    if (t.kind === "clean") {
      t.status = "stp"; sim.counts.stp++; sim.counts.value += Math.round(t.amt * 0.18);
      logE("stp", esc(t.id) + " cleared <b>straight-through</b> on the happy path — no human touch.");
    } else {
      var p = window.PIQ.pattern(t.patternId);
      if (t.needsApproval) {
        t.status = "pending"; sim.counts.pending++;
        logE("pend", esc(t.id) + " matched <b>" + esc(p.name) + "</b> — routed for DAG approval.");
      } else {
        t.status = "auto"; sim.counts.auto++; sim.counts.value += Math.round(t.amt * 0.12);
        logE("auto", esc(t.id) + " matched <b>" + esc(p.name) + "</b> — branch executed automatically.");
      }
    }
    sim.cursor++;
    repaint();
    return true;
  }

  function decide(n, act) {
    var t = sim.q.filter(function (x) { return x.n === n; })[0]; if (!t || t.status !== "pending") return;
    sim.counts.pending--;
    var p = window.PIQ.pattern(t.patternId);
    if (act === "approve") { t.status = "approved"; sim.counts.approved++; sim.counts.value += Math.round(t.amt * 0.12);
      logE("appr", esc(t.id) + " — <b>" + esc(p.name) + "</b> DAG <b>approved</b>; branch executed.");
    } else { t.status = "rejected"; sim.counts.rejected++;
      logE("rej", esc(t.id) + " — <b>" + esc(p.name) + "</b> DAG <b>rejected</b>; held for review.");
    }
    repaint();
  }

  function logE(k, t) { sim.log.push({ k: k, t: t }); }
  function repaint() { drawStream(); drawApprovals(); drawFeed(); drawKpis(); drawCompound(); }

  function drawCompound() {
    var host = document.getElementById("rtCompound"); if (!host) return;
    var sigs = compoundSignals();
    if (!sigs.length) { host.innerHTML = ""; host.classList.remove("on"); return; }
    host.classList.add("on");
    host.innerHTML = '<div class="rc-h">⚠ Compound Signals <span class="rc-c">' + sigs.length + '</span>' +
      '<small>emergent cross-process risk — no single pattern would catch this</small></div>' +
      '<div class="rc-cards">' + sigs.map(function (s) {
        var cons = s.fired.map(function (id) {
          var p = window.PIQ.pattern(id);
          return '<span class="rc-pat">#' + id + (p ? ' ' + esc(p.name) : '') + '</span>';
        }).join("");
        return '<div class="rc-card">' +
          '<div class="rc-top"><span class="rc-name">' + esc(s.cp.name) + '</span>' +
          (s.entity ? '<span class="rc-ent">' + esc(s.entity) + (s.concentrated ? '' : ' cohort') + '</span>' : '') + '</div>' +
          '<div class="rc-desc">' + esc(s.cp.description) + '</div>' +
          '<div class="rc-cons"><span class="rc-lab">Constituent signals</span>' + cons + '</div>' +
          '<div class="rc-foot"><div class="rc-impact"><b>Compound impact</b>' + esc(s.cp.compoundImpact) + '</div>' +
          '<div class="rc-resp"><b>Response</b>' + esc(s.cp.response) + '</div></div></div>';
      }).join("") + '</div>';
  }

  /* ---------------- controls ---------------- */
  function wireControls(root) {
    root.querySelector("#rtStep").onclick = function () { stopAuto(); step(); };
    root.querySelector("#rtAuto").onclick = function () { toggleAuto(this); };
    root.querySelector("#rtReset").onclick = function () { stopAuto(); ensureSim(true); repaint(); };
  }
  function toggleAuto(btn) {
    if (timer) { stopAuto(); btn.textContent = "Auto-run ⏵"; btn.classList.remove("on"); return; }
    btn.textContent = "Pause ⏸"; btn.classList.add("on");
    timer = setInterval(function () { if (!step()) { var b = document.getElementById("rtAuto"); if (b) { b.textContent = "Auto-run ⏵"; b.classList.remove("on"); } } }, 850);
  }
  function stopAuto() { if (timer) { clearInterval(timer); timer = null; } }

  window.PIQ.modules.runtime = { render: render };
  window.PIQ.onErp(function () { if (window.PIQ.active === "runtime") { var v = document.getElementById("view"); v.innerHTML = ""; render(v); } });
})();
