#!/usr/bin/env python3
"""
layout_processmaps.py — deterministic swimlane layout for L4 process maps.

Subagents generate the *logical* map (roles, activities, decisions, SIPOC, edges) —
the domain content. This script assigns the *geometry* (lane bands, x-depth columns,
primary/alternate sub-rows) so coordinates are always clean and non-overlapping,
then emits the renderer schema and merges it into src/data/processmaps.json.

Logical input per slug:
  { id, name, description, predecessor?, successor?, lanes:[role,...],
    nodes:[ {id, kind:process|decision|terminal, lane:<role>, label, sipoc?} ],
    edges:[ {source, target, label?} ] }

Renderer output per slug:
  { id, name, description, map:{ nodes:[headers + positioned defaults], edges } }

  python scripts/layout_processmaps.py <logical.json> [logical2.json ...]
"""
import os, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "data", "processmaps.json")

LANE_H = 250
X0, XSTEP = 150, 300
ROW_PRIMARY, ROW_ALT = 60, 160   # sub-row y-offset within a lane band


def _back_edges(nodes, edges):
    """DFS-colour to find back-edges (loops); exclude them from depth so the
    forward flow stays a DAG."""
    adj = {}
    for n in nodes:
        adj[n["id"]] = []
    for e in edges:
        if e["source"] in adj:
            adj[e["source"]].append(e["target"])
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n["id"]: WHITE for n in nodes}
    back = set()

    def dfs(u):
        color[u] = GRAY
        for v in adj.get(u, []):
            if v not in color:
                continue
            if color[v] == GRAY:
                back.add((u, v))
            elif color[v] == WHITE:
                dfs(v)
        color[u] = BLACK

    for n in nodes:
        if color[n["id"]] == WHITE:
            dfs(n["id"])
    return back


def _longest_path_depth(nodes, edges, back):
    ids = {n["id"] for n in nodes}
    fwd = [e for e in edges if (e["source"], e["target"]) not in back
           and e["source"] in ids and e["target"] in ids]
    indeg = {i: 0 for i in ids}
    adj = {i: [] for i in ids}
    for e in fwd:
        adj[e["source"]].append(e["target"])
        indeg[e["target"]] += 1
    # Kahn topo order
    from collections import deque
    q = deque([i for i in ids if indeg[i] == 0])
    depth = {i: 0 for i in q}
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            depth[v] = max(depth.get(v, 0), depth[u] + 1)
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    # any leftover (shouldn't happen once back-edges removed) -> depth 0
    for i in ids:
        depth.setdefault(i, 0)
    return depth


def _alt_score(nodes, edges, back):
    """0 = main/happy path (top row), 1 = exception / 'No' branch (bottom row)."""
    ids = {n["id"] for n in nodes}
    fwd = [e for e in edges if (e["source"], e["target"]) not in back]
    inc = {i: [] for i in ids}
    for e in fwd:
        if e["target"] in inc:
            inc[e["target"]].append(e)
    score = {}

    def resolve(i, seen):
        if i in score:
            return score[i]
        if i in seen or not inc[i]:
            score[i] = 0
            return 0
        seen = seen | {i}
        best = min(resolve(e["source"], seen) + (1 if str(e.get("label", "")).lower() == "no" else 0)
                   for e in inc[i])
        score[i] = best
        return best

    for n in nodes:
        resolve(n["id"], set())
    return score


def layout_map(lg):
    lanes = lg["lanes"]
    lane_idx = {r: i for i, r in enumerate(lanes)}
    nodes = lg["nodes"]
    ids = {n["id"] for n in nodes}
    edges = [e for e in lg["edges"] if e["source"] in ids and e["target"] in ids]

    back = _back_edges(nodes, edges)
    depth = _longest_path_depth(nodes, edges, back)
    alt = _alt_score(nodes, edges, back)

    # order nodes for greedy row packing: by depth, then main-path before exception
    ordered = sorted(nodes, key=lambda n: (depth[n["id"]], alt.get(n["id"], 0), n["id"]))
    occ = set()                       # occupied (depth, laneIdx, rowKey)
    out_nodes = []

    # role header lanes
    for i, role in enumerate(lanes):
        out_nodes.append({
            "id": "header_lane%d" % (i + 1), "type": "roleHeaderNode",
            "position": {"x": 0, "y": i * LANE_H}, "style": {"height": LANE_H},
            "data": {"label": role, "sipoc": None},
        })

    for n in ordered:
        li = lane_idx.get(n.get("lane"), 0)
        d = depth[n["id"]]
        prefer_alt = alt.get(n["id"], 0) >= 1
        rows = [ROW_ALT, ROW_PRIMARY] if prefer_alt else [ROW_PRIMARY, ROW_ALT]
        placed = None
        while placed is None:
            for row in rows:
                key = (d, li, row)
                if key not in occ:
                    occ.add(key)
                    placed = (d, row)
                    break
            if placed is None:
                d += 1            # both rows taken at this depth -> shift right
        x = X0 + placed[0] * XSTEP
        y = li * LANE_H + placed[1]
        k = n["kind"]
        data = {"label": n["label"]}
        if k == "decision":
            data["shapeHint"] = "diamond"
            data["sipoc"] = None
        elif k == "terminal":
            data["shapeHint"] = "cylinder"
            data["sipoc"] = None
        else:
            sp = n.get("sipoc") or {}
            data["sipoc"] = {kk: sp.get(kk, "") for kk in ("supplier", "input", "process", "output", "customer")}
        out_nodes.append({"id": n["id"], "type": "default",
                          "position": {"x": x, "y": y}, "style": {}, "data": data})

    out_edges = []
    for e in edges:
        ed = {"id": "e_%s_%s" % (e["source"], e["target"]), "source": e["source"], "target": e["target"]}
        if e.get("label"):
            ed["label"] = e["label"]
        out_edges.append(ed)

    return {"id": lg.get("id", ""), "name": lg["name"], "description": lg.get("description", ""),
            "map": {"nodes": out_nodes, "edges": out_edges}}


def validate(slug, positioned):
    nodes = positioned["map"]["nodes"]
    ids = {n["id"] for n in nodes}
    problems = []
    for e in positioned["map"]["edges"]:
        if e["source"] not in ids or e["target"] not in ids:
            problems.append("dangling edge %s" % e["id"])
    # overlap check on default nodes (box ~ 158x92 slot)
    boxes = [(n["position"]["x"], n["position"]["y"], n["id"]) for n in nodes if n["type"] == "default"]
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            ax, ay, ai = boxes[i]; bx, by, bj = boxes[j]
            if abs(ax - bx) < 150 and abs(ay - by) < 80:
                problems.append("overlap %s/%s" % (ai, bj))
    if problems:
        print("  ! %s: %s" % (slug, "; ".join(problems)))
    return not problems


def main():
    logical = {}
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            logical.update(json.load(f))
    if not logical:
        print("no logical maps given"); return

    with open(OUT, encoding="utf-8") as f:
        db = json.load(f)

    ok = 0
    for slug, lg in logical.items():
        positioned = layout_map(lg)
        validate(slug, positioned)
        db["maps"][slug] = positioned
        ok += 1
        print("  laid out %-40s %2d nodes / %2d edges" % (
            slug, len(positioned["map"]["nodes"]), len(positioned["map"]["edges"])))

    db["meta"]["patternCount"] = len(db["maps"])
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print("Merged %d maps -> %s (%d total)" % (ok, os.path.relpath(OUT, ROOT), len(db["maps"])))


if __name__ == "__main__":
    main()
