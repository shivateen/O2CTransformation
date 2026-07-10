/* ProcessIQ — Pattern Library (Module 2)
 * The expert's playbook, codified: browse all 31 behavioural patterns, filter by
 * category / priority / search, and drill into the full three-layer mapping +
 * conditional Branching DAG with HITL gates. (Deck slides 6 & 11.) */
(function () {
  "use strict";
  var E = window.ProcessIQEngine;
  var patterns = window.PIQ.patterns;
  var meta = window.PIQ.meta;
  var book = window.PIQ.book;
  var PRIO = meta.priorityLegend;

  var state = { q: "", cat: "All", prio: "All", selId: patterns[0].id };

  function erp() { return window.PIQ.erp; }
  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function filtered() {
    var q = state.q.toLowerCase();
    return patterns.filter(function (p) {
      if (state.cat !== "All" && p.category !== state.cat) return false;
      if (state.prio !== "All" && p.priority !== state.prio) return false;
      if (q && (p.name + " " + p.category + " " + p.layer3_feature + " " + p.mentalModel).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function triggerInvoice(p) {
    return book.invoices.filter(function (iv) { return iv.groundTruthFeature === p.featureSlug; })[0] || null;
  }

  /* ---------- render ---------- */
  function render(view) {
    if (window.PIQ._jumpPattern) { state.selId = window.PIQ._jumpPattern; window.PIQ._jumpPattern = null; }
    view.innerHTML = '<div class="lib"></div>';
    var root = view.querySelector(".lib");

    // header + matrix
    var header = el("div", "lib-head");
    var matrix = meta.categories.map(function (c) {
      return '<div class="mx" data-cat="' + esc(c.category) + '">' +
        '<b>' + c.count + '</b><span>' + esc(shortCat(c.category)) + '</span>' +
        '<div class="mxbar">' + bar(c) + '</div></div>';
    }).join("");
    header.innerHTML =
      '<div><div class="kv">The Expert\'s Playbook, Codified</div>' +
      '<h2 style="font-size:22px;margin:2px 0 0">' + meta.patternCount + ' Patterns</h2></div>' +
      '<div class="matrix">' + matrix + '</div>';
    root.appendChild(header);

    // filter bar
    var fbar = el("div", "fbar");
    var cats = ["All"].concat(meta.categories.map(function (c) { return c.category; }));
    var prios = ["All", "Critical", "High", "Medium", "Low"];
    fbar.innerHTML =
      '<input id="libSearch" class="search" placeholder="Search patterns, skills, capabilities…" value="' + esc(state.q) + '"/>' +
      '<div class="chips" id="catChips">' + cats.map(function (c) {
        return '<button class="chip-f' + (state.cat === c ? " on" : "") + '" data-cat="' + esc(c) + '">' + esc(shortCat(c)) + '</button>';
      }).join("") + '</div>' +
      '<div class="chips" id="prioChips">' + prios.map(function (p) {
        var col = p === "All" ? "" : 'style="--pc:' + PRIO[p] + '"';
        return '<button class="chip-p' + (state.prio === p ? " on" : "") + '" ' + col + ' data-prio="' + p + '">' + p + '</button>';
      }).join("") + '</div>';
    root.appendChild(fbar);

    // master-detail
    var md = el("div", "lib-md");
    md.innerHTML = '<div class="lib-list" id="libList"></div><div class="lib-detail" id="libDetail"></div>';
    root.appendChild(md);

    wire(root);
    renderList();
    renderDetail();
  }

  function shortCat(c) {
    return c.replace(" & Deduction Manipulation", " & Deduction")
      .replace("Intentional Stalling & Delay Tactics", "Stalling & Delay")
      .replace("Credit Risk & Insolvency Indicators", "Credit Risk")
      .replace("Cash Application & Remittance Friction", "Cash App & Remittance")
      .replace("Relationship & Contractual Abuse", "Relationship Abuse");
  }
  function bar(c) {
    var seg = [["Critical", c.Critical], ["High", c.High], ["Medium", c.Medium], ["Low", c.Low]];
    return seg.filter(function (s) { return s[1]; }).map(function (s) {
      return '<i style="flex:' + s[1] + ';background:' + PRIO[s[0]] + '"></i>';
    }).join("");
  }

  function renderList() {
    var list = document.getElementById("libList"); if (!list) return;
    var items = filtered();
    if (!items.length) { list.innerHTML = '<div class="lib-none">No patterns match these filters.</div>'; return; }
    list.innerHTML = items.map(function (p) {
      return '<div class="prow' + (state.selId === p.id ? " sel" : "") + '" data-id="' + p.id + '">' +
        '<div class="pnum" style="background:' + PRIO[p.priority] + '">' + p.id + '</div>' +
        '<div class="pmain"><div class="pn">' + esc(p.name) + '</div>' +
        '<div class="pc">' + esc(shortCat(p.category)) + '</div></div>' +
        '<div class="pf mono">' + esc(p.layer3_feature) + '</div></div>';
    }).join("");
    list.querySelectorAll(".prow").forEach(function (r) {
      r.onclick = function () { state.selId = +r.dataset.id; renderList(); renderDetail(); };
    });
  }

  function renderDetail() {
    var d = document.getElementById("libDetail"); if (!d) return;
    var p = patterns.filter(function (x) { return x.id === state.selId; })[0];
    if (!p) { d.innerHTML = ""; return; }
    var tables = (erp() === "sap" ? p.sources.sap : p.sources.oracle);
    var tchips = tables.map(function (t) { return '<span class="tbl">' + esc(t) + '</span>'; }).join("");

    // branching DAG tree
    var branches = (p.branchingDAG || []).map(function (b) {
      var verbs = b.actions.map(function (a) { return '<span class="verb">' + esc(a) + '</span>'; }).join("");
      var hitl = b.hitl ? '<div class="b-hitl">🔒 HITL: ' + esc(b.hitl) + '</div>' : "";
      return '<div class="branch t-' + b.tier + '"><div class="b-cond mono">' + esc(b.condition) + '</div>' +
        '<div class="b-acts">' + verbs + '</div>' + hitl + '</div>';
    }).join("");

    var flat = p.originalDAG.map(function (s) { return '<span class="verb flat">' + esc(s) + '</span>'; }).join('<span class="arr">→</span>');
    var tiv = triggerInvoice(p);
    var liveLink = tiv ? '<button class="btn go sm" id="toCockpit">See it live in the Central Nervous System →</button>' : '';

    d.innerHTML =
      '<div class="d-head"><div class="pnum lg" style="background:' + PRIO[p.priority] + '">' + p.id + '</div>' +
      '<div><h2 style="font-size:21px;margin:0">' + esc(p.name) + '</h2>' +
      '<div class="cat">' + esc(p.category) + '</div>' +
      '<span class="badge" style="background:' + PRIO[p.priority] + '">' + p.priority + ' priority</span>' +
      '<span class="badge ghost mono">' + esc(p.layer3_feature) + '</span></div></div>' +

      '<div class="mental">“' + esc(p.mentalModel) + '”<span class="who">— the analyst\'s mental model</span></div>' +

      '<div class="d-grid">' +
        layer("1", "Logical Mapping", esc(p.layer1_logicalMapping), '<div class="tables">' + tchips + '</div>') +
        layer("2", "Event Series", esc(p.layer2_eventSeries), "") +
        layer("3", "AI Feature", '<b>' + esc(p.layer3_feature) + '</b> — pre-calculated expert trigger', '<pre class="sql">' + esc(p.conceptualSQL) + '</pre>') +
      '</div>' +

      '<div class="d-sec"><h4>Skill orchestration — happy path <span class="muted">flat sequence</span></h4><div class="flatdag">' + flat + '</div></div>' +

      '<div class="d-sec"><h4>Skill orchestration — exception paths <span class="muted">conditional decision tree for agentic orchestration</span></h4>' +
      '<div class="branches">' + branches + '</div></div>' +
      (p.hitlGates.length ? '<div class="gatebar">🔒 HITL gates: ' + p.hitlGates.map(esc).join(" · ") + '</div>' : '') +
      liveLink;

    var btn = document.getElementById("toCockpit");
    if (btn) btn.onclick = function () {
      window.PIQ._jumpInvoice = tiv.belnr;
      window.PIQ.go("cockpit");
    };
  }

  function layer(n, title, desc, extra) {
    return '<div class="dlayer"><div class="lh"><span class="ln">' + n + '</span>' + title + '</div>' +
      '<div class="ld">' + desc + '</div>' + (extra || "") + '</div>';
  }

  function wire(root) {
    var s = root.querySelector("#libSearch");
    s.oninput = function () { state.q = s.value; renderList(); };
    root.querySelector("#catChips").onclick = function (e) {
      var b = e.target.closest("[data-cat]"); if (!b) return;
      state.cat = b.dataset.cat;
      this.querySelectorAll(".chip-f").forEach(function (x) { x.classList.toggle("on", x === b); });
      renderList();
    };
    root.querySelector("#prioChips").onclick = function (e) {
      var b = e.target.closest("[data-prio]"); if (!b) return;
      state.prio = b.dataset.prio;
      this.querySelectorAll(".chip-p").forEach(function (x) { x.classList.toggle("on", x === b); });
      renderList();
    };
    // matrix tiles act as category filters
    root.querySelectorAll(".mx").forEach(function (m) {
      m.onclick = function () {
        state.cat = state.cat === m.dataset.cat ? "All" : m.dataset.cat;
        render(document.getElementById("view"));
      };
    });
  }

  window.PIQ.modules.library = { render: render };
  window.PIQ.onErp(function () { if (window.PIQ.active === "library") renderDetail(); });
})();
