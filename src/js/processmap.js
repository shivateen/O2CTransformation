/* L4 Process Map viewer + editor — renders and edits an AS-IS swimlane map.
 *
 * Seed maps are generated once (Step 1 process description -> Step 2 swimlane JSON via the
 * Principal Architect pipeline) and cached in src/data/processmaps.json — there is no
 * runtime LLM. This module resolves a map by L4 name and paints it into a modal, and in
 * Edit mode lets an SME rework it Visio-style: drag nodes, add activity/decision/terminal
 * boxes from a palette, draw and delete arrows, and edit each activity name + SIPOC.
 *
 * Persistence: this app is a static offline single file with NO backend, so edits are
 * saved to localStorage (the runtime "DB", keyed by L4 slug) which overlays the seed on
 * load. Export copies the edited JSON so it can be pasted back into the source file to
 * make a change permanent/shared; Reset drops the overlay and restores the seed.
 *
 *   window.PIQ.processMap.has(name) / .open(name) / .slug(name)
 */
(function () {
  "use strict";

  var DB = (window.PROCESSIQ_PROCESSMAPS && window.PROCESSIQ_PROCESSMAPS.maps) || {};
  var STORE = "piq.processmaps.v1";

  var NODE_W = 158, NODE_H = 60, DEC_H = 92, PILL_H = 56;
  var LANE_H = 250, GUTTER = 140, PAD_R = 70, ROW_C = 32, GRID = 10;
  var LANE_TINTS = ["mdlane", "o2dlane", "b2clane", "claimslane"];

  function el(t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function svg(t, a) { var n = document.createElementNS("http://www.w3.org/2000/svg", t); for (var k in a) n.setAttribute(k, a[k]); return n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function snap(v) { return Math.round(v / GRID) * GRID; }
  function slug(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

  /* ---- persistence overlay --------------------------------------------- */
  function loadOverlay() {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveOverlay(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  var OVERLAY = loadOverlay();

  // resolved seed (immutable reference) for a name
  function seed(name) { return DB[slug(name)] || null; }
  // resolved map an editor opens on: saved overlay if present, else seed
  function resolve(name) {
    var k = slug(name);
    return OVERLAY[k] || DB[k] || null;
  }
  function isEdited(name) { return !!OVERLAY[slug(name)]; }

  /* ---- node geometry ---------------------------------------------------- */
  function kind(node) {
    if (node.type === "roleHeaderNode") return "header";
    var h = node.data && node.data.shapeHint;
    if (h === "diamond") return "decision";
    if (h === "cylinder") return "terminal";
    return "process";
  }
  function geom(node) {
    var x = node.position.x, y = node.position.y, cy = y + ROW_C, k = kind(node);
    var h = k === "decision" ? DEC_H : (k === "terminal" ? PILL_H : NODE_H);
    return { x: x, cx: x + NODE_W / 2, cy: cy, left: x, right: x + NODE_W,
             top: cy - h / 2, bottom: cy + h / 2, w: NODE_W, h: h, kind: k };
  }

  /* ---- edge routing: orthogonal elbows ---------------------------------- */
  function route(s, t) {
    if (t.x > s.x + 10) {
      var sx = s.right, sy = s.cy, tx = t.left, ty = t.cy, mx = (sx + tx) / 2;
      return { d: "M" + sx + "," + sy + " L" + mx + "," + sy + " L" + mx + "," + ty + " L" + tx + "," + ty,
               lx: mx, ly: (sy + ty) / 2 - 9 };
    }
    var bx = s.cx, by = s.bottom, ex = t.cx, ey = t.bottom, dy = Math.max(s.bottom, t.bottom) + 36;
    return { d: "M" + bx + "," + by + " L" + bx + "," + dy + " L" + ex + "," + dy + " L" + ex + "," + ey,
             lx: (bx + ex) / 2, ly: dy + 12 };
  }

  /* ====================================================================== */
  /* Editor instance                                                         */
  /* ====================================================================== */
  function Editor(name) {
    this.name = name;
    this.model = clone(resolve(name));   // working copy — not persisted until Save
    this.scale = 1;
    this.edit = false;
    this.dirty = false;
    this.selNode = null;
    this.selEdge = null;
    this._raf = 0;
  }

  Editor.prototype.maxNodeNum = function () {
    var m = 0;
    this.model.map.nodes.forEach(function (n) {
      var mt = /^n(\d+)$/.exec(n.id); if (mt) m = Math.max(m, +mt[1]);
    });
    return m;
  };

  Editor.prototype.addNode = function (nkind) {
    var num = this.maxNodeNum() + 1, id = "n" + num;
    // drop into the current viewport centre, snapped to grid
    var sc = this.scroll, cx = (sc.scrollLeft + sc.clientWidth / 2) / this.scale;
    var cy = (sc.scrollTop + sc.clientHeight / 2) / this.scale;
    var x = Math.max(GUTTER + 10, snap(cx - NODE_W / 2)), y = Math.max(10, snap(cy - ROW_C));
    var data;
    if (nkind === "decision") data = { label: "New decision?", shapeHint: "diamond", sipoc: null };
    else if (nkind === "terminal") data = { label: "New start / end", shapeHint: "cylinder", sipoc: null };
    else data = { label: "New activity", sipoc: { supplier: "", input: "", process: "", output: "", customer: "" } };
    this.model.map.nodes.push({ id: id, type: "default", position: { x: x, y: y }, style: {}, data: data });
    this.dirty = true; this.selNode = id; this.selEdge = null;
    this.render(); this.renderInspector();
  };

  Editor.prototype.addEdge = function (s, t) {
    if (s === t) return;
    var edges = this.model.map.edges;
    if (edges.some(function (e) { return e.source === s && e.target === t; })) return;
    var id = "e_" + s + "_" + t + "_" + (this.maxNodeNum() + edges.length);
    edges.push({ id: id, source: s, target: t, label: "" });
    this.dirty = true; this.selEdge = id; this.selNode = null;
    this.render(); this.renderInspector();
  };

  Editor.prototype.deleteNode = function (id) {
    if (/^header_/.test(id) || id === "start") return;
    this.model.map.nodes = this.model.map.nodes.filter(function (n) { return n.id !== id; });
    this.model.map.edges = this.model.map.edges.filter(function (e) { return e.source !== id && e.target !== id; });
    this.dirty = true; this.selNode = null;
    this.render(); this.renderInspector();
  };

  Editor.prototype.deleteEdge = function (id) {
    this.model.map.edges = this.model.map.edges.filter(function (e) { return e.id !== id; });
    this.dirty = true; this.selEdge = null;
    this.render(); this.renderInspector();
  };

  /* ---- zoom ------------------------------------------------------------- */
  Editor.prototype.applyZoom = function () {
    this.canvas.style.transform = "scale(" + this.scale + ")";
    this.stage.style.width = Math.round(this.dims.W * this.scale) + "px";
    this.stage.style.height = Math.round(this.dims.H * this.scale) + "px";
    if (this.pctBtn) this.pctBtn.textContent = Math.round(this.scale * 100) + "%";
  };
  Editor.prototype.setZoom = function (s, cx, cy) {
    var prev = this.scale, sc = this.scroll;
    this.scale = Math.max(0.25, Math.min(3, s));
    var r = sc.getBoundingClientRect();
    var ax = (cx == null ? r.width / 2 : cx - r.left) + sc.scrollLeft;
    var ay = (cy == null ? r.height / 2 : cy - r.top) + sc.scrollTop;
    this.applyZoom();
    sc.scrollLeft += ax * (this.scale / prev) - ax;
    sc.scrollTop += ay * (this.scale / prev) - ay;
  };
  Editor.prototype.fit = function () {
    var sc = this.scroll, cw = sc.clientWidth - 24, ch = sc.clientHeight - 24;
    this.scale = Math.max(0.25, Math.min(3, Math.min(cw / this.dims.W, ch / this.dims.H)));
    this.applyZoom(); sc.scrollLeft = 0; sc.scrollTop = 0;
  };

  /* ---- render the canvas ------------------------------------------------ */
  Editor.prototype.render = function () {
    var self = this, canvas = this.canvas, m = this.model.map;
    canvas.innerHTML = "";
    var byId = {}, headers = [], flow = [], maxX = 0, maxY = 0;
    m.nodes.forEach(function (n) {
      if (n.type === "roleHeaderNode") headers.push(n);
      else { var g = geom(n); byId[n.id] = { node: n, g: g }; flow.push(n); maxX = Math.max(maxX, g.right); maxY = Math.max(maxY, g.bottom); }
    });
    headers.sort(function (a, b) { return a.position.y - b.position.y; });
    var lanes = headers.length || 1;
    var W = Math.max(maxX + PAD_R, GUTTER + 500), H = Math.max(lanes * LANE_H, maxY + 60);
    this.dims = { W: W, H: H };
    canvas.style.width = W + "px"; canvas.style.height = H + "px";

    headers.forEach(function (hd, i) {
      var band = el("div", "pm-lane " + LANE_TINTS[i % LANE_TINTS.length]);
      band.style.top = hd.position.y + "px"; band.style.height = LANE_H + "px"; band.style.width = W + "px";
      canvas.appendChild(band);
      var lab = el("div", "pm-lanelab", '<span class="pml-role">' + esc(hd.data.label) + '</span>');
      lab.style.top = hd.position.y + "px"; lab.style.height = LANE_H + "px"; lab.style.width = GUTTER + "px";
      canvas.appendChild(lab);
    });

    var s = svg("svg", { class: "pm-edges" + (this.edit ? " editing" : ""), width: W, height: H, viewBox: "0 0 " + W + " " + H });
    var defs = svg("defs", {});
    var mk = svg("marker", { id: "pm-arrow", markerWidth: 10, markerHeight: 10, refX: 8, refY: 3, orient: "auto", markerUnits: "strokeWidth" });
    mk.appendChild(svg("path", { d: "M0,0 L8,3 L0,6 Z", class: "pm-arrowhead" }));
    defs.appendChild(mk); s.appendChild(defs); canvas.appendChild(s);
    this.edgeSvg = s;
    var labelLayer = el("div", "pm-elabels"); canvas.appendChild(labelLayer);

    m.edges.forEach(function (e) {
      var a = byId[e.source], b = byId[e.target]; if (!a || !b) return;
      var r = route(a.g, b.g);
      if (self.edit) {
        var hit = svg("path", { d: r.d, class: "pm-hit", "data-eid": e.id });
        hit.addEventListener("click", function (ev) { ev.stopPropagation(); self.selEdge = e.id; self.selNode = null; self.render(); self.renderInspector(); });
        s.appendChild(hit);
      }
      s.appendChild(svg("path", { d: r.d, class: "pm-edge" + (self.selEdge === e.id ? " sel" : ""), "marker-end": "url(#pm-arrow)" }));
      if (e.label) {
        var lb = el("div", "pm-elabel " + (e.label.toLowerCase() === "yes" ? "yes" : e.label.toLowerCase() === "no" ? "no" : ""), esc(e.label));
        lb.style.left = r.lx + "px"; lb.style.top = r.ly + "px"; labelLayer.appendChild(lb);
      }
    });

    flow.forEach(function (n) {
      var g = byId[n.id].g;
      var node = el("div", "pm-node pm-" + g.kind + (self.selNode === n.id ? " sel" : ""), '<div class="pmn-txt">' + esc(n.data.label) + '</div>');
      node.dataset.id = n.id;
      node.style.left = g.left + "px"; node.style.top = g.top + "px"; node.style.width = g.w + "px"; node.style.height = g.h + "px";
      if (self.edit) {
        node.classList.add("editable");
        node.addEventListener("mousedown", function (ev) { self.startDrag(n, ev); });
        var handle = el("div", "pmn-handle", "＋"); handle.title = "Drag to another box to connect";
        handle.addEventListener("mousedown", function (ev) { ev.stopPropagation(); self.startConnect(n, ev); });
        node.appendChild(handle);
      } else if (n.data.sipoc) {
        node.classList.add("clickable");
        node.addEventListener("click", function () { self.selNode = n.id; self.render(); self.showSipoc(n); });
      }
      canvas.appendChild(node);
    });

    this.applyZoom();
  };

  Editor.prototype.canvasPoint = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
  };

  /* ---- drag a node ------------------------------------------------------ */
  Editor.prototype.startDrag = function (n, ev) {
    if (ev.target.closest(".pmn-handle")) return;
    ev.preventDefault();
    var self = this, startX = ev.clientX, startY = ev.clientY, ox = n.position.x, oy = n.position.y, moved = false;
    function mm(e) {
      var dx = (e.clientX - startX) / self.scale, dy = (e.clientY - startY) / self.scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      n.position.x = Math.max(GUTTER + 6, snap(ox + dx));
      n.position.y = Math.max(6, snap(oy + dy));
      if (!self._raf) self._raf = requestAnimationFrame(function () { self._raf = 0; self.render(); });
    }
    function mu() {
      document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu);
      if (moved) self.dirty = true;
      self.selNode = n.id; self.selEdge = null; self.render(); self.renderInspector();
    }
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  };

  /* ---- draw a connection (arrow) from a node handle --------------------- */
  Editor.prototype.startConnect = function (n, ev) {
    ev.preventDefault();
    var self = this, g = geom(n);
    var line = svg("line", { class: "pm-tempedge", x1: g.right, y1: g.cy, x2: g.right, y2: g.cy });
    this.edgeSvg.appendChild(line);
    function mm(e) { var p = self.canvasPoint(e.clientX, e.clientY); line.setAttribute("x2", p.x); line.setAttribute("y2", p.y); }
    function mu(e) {
      document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu);
      var tgt = document.elementFromPoint(e.clientX, e.clientY);
      var nodeEl = tgt && tgt.closest && tgt.closest(".pm-node");
      if (line.parentNode) line.parentNode.removeChild(line);
      if (nodeEl && nodeEl.dataset.id) self.addEdge(n.id, nodeEl.dataset.id);
      else self.render();
    }
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  };

  /* ---- SIPOC drawer (view mode) ----------------------------------------- */
  Editor.prototype.showSipoc = function (n) {
    var sp = n.data.sipoc, d = this.drawer;
    d.className = "pm-sipoc on";
    var rows = [["Supplier", sp.supplier], ["Input", sp.input], ["Process", sp.process], ["Output", sp.output], ["Customer", sp.customer]]
      .map(function (r) { return '<div class="pms-row"><span class="pms-k">' + r[0] + '</span><span class="pms-v">' + esc(r[1]) + '</span></div>'; }).join("");
    d.innerHTML = '<div class="pms-head"><b>' + esc(n.data.label) + '</b><span class="pms-tag">SIPOC · L5 activity</span></div>' + rows;
  };

  /* ---- inspector (edit mode) -------------------------------------------- */
  Editor.prototype.renderInspector = function () {
    if (!this.edit) return;
    var self = this, d = this.drawer;
    var node = this.selNode && this.model.map.nodes.filter(function (n) { return n.id === self.selNode; })[0];
    var edge = this.selEdge && this.model.map.edges.filter(function (e) { return e.id === self.selEdge; })[0];
    d.className = "pm-sipoc pm-inspector on";

    if (edge) {
      d.innerHTML = '<div class="pms-head"><b>Connector</b><span class="pms-tag">' + esc(edge.source) + ' → ' + esc(edge.target) + '</span></div>' +
        '<div class="pmi-field"><label>Branch label</label>' +
        '<select class="pmi-in" data-f="label"><option value="">(none)</option>' +
        ['Yes', 'No'].map(function (o) { return '<option' + (edge.label === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
        '<div class="pmi-actions"><button class="pmi-del" data-act="del-edge">Delete connector</button></div>';
      d.querySelector('[data-f="label"]').addEventListener("change", function () { edge.label = this.value; self.dirty = true; self.render(); });
      d.querySelector('[data-act="del-edge"]').addEventListener("click", function () { self.deleteEdge(edge.id); });
      return;
    }

    if (!node) {
      d.innerHTML = '<div class="pmi-empty">Select a box to edit its name and SIPOC · or drag a box from the palette · drag the <b>＋</b> handle to connect two boxes.</div>';
      return;
    }

    var k = kind(node), isProc = k === "process";
    var head = '<div class="pms-head"><b>' + (isProc ? "Activity" : k === "decision" ? "Decision" : "Start / End") + '</b>' +
      '<span class="pms-tag">' + esc(node.id) + '</span></div>';
    var nameF = '<div class="pmi-field"><label>' + (isProc ? "Activity name" : "Label") + '</label>' +
      '<input class="pmi-in" data-f="name" value="' + esc(node.data.label) + '"/></div>';
    var sipoc = "";
    if (isProc) {
      if (!node.data.sipoc) node.data.sipoc = { supplier: "", input: "", process: "", output: "", customer: "" };
      var sp = node.data.sipoc;
      sipoc = '<div class="pmi-sec">SIPOC</div>' +
        field("Supplier", "supplier", sp.supplier) +
        field("Input", "input", sp.input) +
        field("Process", "process", sp.process, true) +
        field("Output", "output", sp.output) +
        field("Customer", "customer", sp.customer);
    }
    var actions = '<div class="pmi-actions"><button class="pmi-del" data-act="del-node">Delete box</button></div>';
    d.innerHTML = head + nameF + sipoc + actions;

    function field(lab, key, val, area) {
      return '<div class="pmi-field"><label>' + lab + '</label>' +
        (area ? '<textarea class="pmi-in" data-sf="' + key + '" rows="3">' + esc(val || "") + '</textarea>'
              : '<input class="pmi-in" data-sf="' + key + '" value="' + esc(val || "") + '"/>') + '</div>';
    }

    var nameEl = d.querySelector('[data-f="name"]');
    nameEl.addEventListener("input", function () {
      node.data.label = this.value; self.dirty = true;
      var live = self.canvas.querySelector('.pm-node[data-id="' + node.id + '"] .pmn-txt');
      if (live) live.textContent = this.value;
    });
    d.querySelectorAll("[data-sf]").forEach(function (inp) {
      inp.addEventListener("input", function () { node.data.sipoc[this.dataset.sf] = this.value; self.dirty = true; });
    });
    d.querySelector('[data-act="del-node"]').addEventListener("click", function () { self.deleteNode(node.id); });
  };

  /* ---- edit mode toggle + save/export/reset ----------------------------- */
  Editor.prototype.setEdit = function (on) {
    this.edit = on; this.selNode = null; this.selEdge = null;
    this.dlg.classList.toggle("editing", on);
    this.editBtn.classList.toggle("on", on);
    this.editBtn.textContent = on ? "✓ Done" : "✎ Edit";
    if (on) { this.render(); this.renderInspector(); }
    else { this.drawer.className = "pm-sipoc"; this.drawer.innerHTML = ""; this.render(); }
  };
  Editor.prototype.save = function () {
    OVERLAY[slug(this.name)] = clone(this.model);
    saveOverlay(OVERLAY);
    this.dirty = false;
    flash(this.saveBtn, "✓ Saved");
    this.markBadge();
  };
  Editor.prototype.reset = function () {
    var sd = seed(this.name); if (!sd) return;
    delete OVERLAY[slug(this.name)]; saveOverlay(OVERLAY);
    this.model = clone(sd); this.dirty = false;
    this.render(); this.renderInspector(); this.markBadge();
    flash(this.resetBtn, "Reverted");
  };
  Editor.prototype.markBadge = function () {
    if (this.badge) this.badge.style.display = isEdited(this.name) ? "" : "none";
  };
  Editor.prototype.exportJson = function () {
    var self = this;
    var wrap = el("div", "pm-export-back");
    var box = el("div", "pm-exportbox");
    var json = JSON.stringify({ id: this.model.id, name: this.model.name, description: this.model.description, map: this.model.map }, null, 2);
    box.innerHTML = '<div class="pm-export-h"><b>Export map JSON</b>' +
      '<span>Paste this into <code>src/data/processmaps.json</code> under <code>"' + esc(slug(this.name)) + '"</code> to make it permanent.</span></div>';
    var ta = el("textarea", "pm-export-ta"); ta.value = json; ta.readOnly = true;
    box.appendChild(ta);
    var foot = el("div", "pm-export-foot");
    var copy = el("button", "pm-tool", "Copy to clipboard");
    var close = el("button", "pm-tool", "Close");
    copy.onclick = function () { ta.select(); try { document.execCommand("copy"); } catch (e) {} if (navigator.clipboard) { navigator.clipboard.writeText(json).catch(function () {}); } flash(copy, "Copied ✓"); };
    close.onclick = function () { wrap.remove(); };
    foot.appendChild(copy); foot.appendChild(close); box.appendChild(foot);
    wrap.appendChild(box);
    wrap.addEventListener("mousedown", function (e) { if (e.target === wrap) wrap.remove(); });
    this.dlg.appendChild(wrap);
    ta.focus(); ta.select();
  };

  function flash(btn, msg) {
    if (!btn) return; var old = btn.textContent; btn.textContent = msg; btn.disabled = true;
    setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 1100);
  }

  /* ---- build the modal -------------------------------------------------- */
  var current = null;
  function escKey(e) { if (e.key === "Escape") { if (document.querySelector(".pm-export-back")) document.querySelector(".pm-export-back").remove(); else close(); } }
  function close() {
    var b = document.querySelector(".pm-map-back");
    if (b) { b.remove(); document.removeEventListener("keydown", escKey); current = null; }
  }

  function open(name) {
    if (!resolve(name)) return false;
    close();
    var ed = new Editor(name); current = ed;
    var back = el("div", "pm-map-back");
    var dlg = el("div", "pm-map-dlg"); ed.dlg = dlg; back.appendChild(dlg);

    var badge = isEdited(name) ? '<span class="pm-edited" title="Includes saved edits">● edited</span>' : '<span class="pm-edited" style="display:none">● edited</span>';
    var head = el("div", "pm-map-head",
      '<div class="pm-map-ht"><span class="pm-map-id">' + esc(ed.model.id) + ' · L4</span>' + badge +
      '<h2>' + esc(ed.model.name) + '</h2></div>' +
      '<button class="pm-map-x" title="Close">✕</button>');
    dlg.appendChild(head);
    ed.badge = head.querySelector(".pm-edited");

    if (ed.model.description) dlg.appendChild(el("p", "pm-map-desc", esc(ed.model.description)));

    var hint = el("div", "pm-map-hint",
      '<span class="pm-legend"><i class="lg-proc"></i>Activity</span>' +
      '<span class="pm-legend"><i class="lg-dec"></i>Decision</span>' +
      '<span class="pm-legend"><i class="lg-term"></i>Start / End</span>' +
      '<div class="pm-edit-tools">' +
        '<button class="pm-tool pm-save" data-a="save">Save</button>' +
        '<button class="pm-tool pm-reset" data-a="reset">Reset</button>' +
        '<button class="pm-tool pm-export" data-a="export">Export</button>' +
      '</div>' +
      '<div class="pm-tools">' +
        '<button class="pm-tool" data-z="out" title="Zoom out">−</button>' +
        '<button class="pm-tool pm-pct" data-z="reset" title="Reset to 100%">100%</button>' +
        '<button class="pm-tool" data-z="in" title="Zoom in">+</button>' +
        '<button class="pm-tool pm-fit" data-z="fit" title="Fit to screen">Fit</button>' +
        '<button class="pm-tool pm-edit" data-z="edit" title="Edit this map">✎ Edit</button>' +
        '<button class="pm-tool pm-full" data-z="full" title="Toggle full screen">⛶ Full screen</button>' +
      '</div>');
    dlg.appendChild(hint);
    ed.pctBtn = hint.querySelector(".pm-pct");
    ed.editBtn = hint.querySelector(".pm-edit");
    ed.saveBtn = hint.querySelector(".pm-save");
    ed.resetBtn = hint.querySelector(".pm-reset");

    var body = el("div", "pm-body");
    var palette = el("div", "pm-palette",
      '<div class="pm-pal-h">Add shape</div>' +
      '<button class="pm-shape" data-add="process"><span class="ps-ic ps-proc"></span>Activity</button>' +
      '<button class="pm-shape" data-add="decision"><span class="ps-ic ps-dec"></span>Decision</button>' +
      '<button class="pm-shape" data-add="terminal"><span class="ps-ic ps-term"></span>Start / End</button>' +
      '<div class="pm-pal-tip">Click to add a box, then drag it into a lane. Drag the <b>＋</b> handle on a box to draw an arrow to another box.</div>');
    var scroll = el("div", "pm-map-scroll");
    var stage = el("div", "pm-stage");
    var canvas = el("div", "pm-canvas");
    stage.appendChild(canvas); scroll.appendChild(stage);
    body.appendChild(palette); body.appendChild(scroll);
    dlg.appendChild(body);
    ed.scroll = scroll; ed.stage = stage; ed.canvas = canvas;

    var drawer = el("div", "pm-sipoc"); dlg.appendChild(drawer); ed.drawer = drawer;

    // wiring
    head.querySelector(".pm-map-x").onclick = close;
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    canvas.addEventListener("click", function (e) { if (ed.edit && e.target === canvas) { ed.selNode = null; ed.selEdge = null; ed.render(); ed.renderInspector(); } });
    document.addEventListener("keydown", escKey);

    palette.addEventListener("click", function (e) { var b = e.target.closest(".pm-shape"); if (b) ed.addNode(b.dataset.add); });
    hint.querySelector(".pm-edit-tools").addEventListener("click", function (e) {
      var b = e.target.closest(".pm-tool"); if (!b) return;
      if (b.dataset.a === "save") ed.save();
      else if (b.dataset.a === "reset") ed.reset();
      else if (b.dataset.a === "export") ed.exportJson();
    });
    hint.querySelector(".pm-tools").addEventListener("click", function (e) {
      var b = e.target.closest(".pm-tool"); if (!b) return; var z = b.dataset.z;
      if (z === "in") ed.setZoom(ed.scale * 1.2);
      else if (z === "out") ed.setZoom(ed.scale / 1.2);
      else if (z === "reset") { ed.scale = 1; ed.applyZoom(); }
      else if (z === "fit") ed.fit();
      else if (z === "edit") ed.setEdit(!ed.edit);
      else if (z === "full") { back.classList.toggle("maximized"); hint.querySelector(".pm-full").classList.toggle("on", back.classList.contains("maximized")); setTimeout(function () { ed.fit(); }, 0); }
    });
    scroll.addEventListener("wheel", function (e) { if (!e.ctrlKey) return; e.preventDefault(); ed.setZoom(ed.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY); }, { passive: false });

    document.body.appendChild(back);
    ed.render();
    ed.fit();
    return true;
  }

  window.PIQ.processMap = { has: function (n) { return !!seed(n); }, open: open, slug: slug, close: close, edited: isEdited };
})();
