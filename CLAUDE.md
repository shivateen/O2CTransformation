# CLAUDE.md — Tiger Mission Control

A **function-agnostic** mission-control accelerator. A business SME drives a
staged journey — **Setup → Discover & Fit → Build → Run & Monitor** (plus an executive
**Finance Command Centre**) — to compose, agentivise, and operate a process. Order-to-Cash (AR, 101
patterns) is fully built; P2P, R2R, HR Onboarding and Supply Chain ship as samples that
prove the framework generalises.

Mirrors the FinTran/CloseIQ build pattern: edit sources in `src/`, run the Python build,
serve `public/`. (The single-file output is still `public/processiq.html`.)

## The hierarchy (the mental model)

The SME builds top-down:

    Objective → Function → Process → Missions → Capabilities → Patterns → Skills

- **Objective** — the CFO-level business outcome (Working Capital, Revenue Leakage, …); a
  lens that spans functions and rolls up to a compound KPI. Optional (skip to go bottoms-up).
- **Missions** — the units of work in a process (e.g. Run Collections, Apply Incoming Cash).
  Every mission carries a **persona map** (`mission.personas`, RACI): `accountable` (from
  `mission.owner`), `responsible` (authored from the process-map swimlane role vocabulary),
  `approvers` (**derived at build time** from the patterns' real `hitlGates`) and `consulted`.
  Answers "who holds this mission?" — rendered on the mission cards, in the hover popup, in
  the Mission persona map matrix, on the swimlane lanes and in the Run & Monitor mission band.
- **Capabilities** — what each mission must deliver, each mapped to a KPI + the patterns that move it.
  `capability.metric` gives that KPI numbers (`unit`, `baseline`, `target`, `better`) so the
  mission outcome is measurable, not just a label. Labels that also appear in `roi.json`
  (DSO, Auto-match, Dispute cycle) are pinned to the same values — the screens must never
  contradict each other.
- **Patterns** — the behavioural playbook (happy path + branching DAG for the variations). **UNCHANGED — patterns stay patterns.**
- **Skills** — the atomic DAG action steps a pattern sequences (extract SAP context, generate email, …).

## The journey (top-level IA)

Two-level nav: **stages** (top) × **sub-views** (second row), driven by `window.PIQ`.

1. **Setup** — Mission Builder wizard (Objective→Function→Process→Missions→Capabilities→Patterns→Skills)
   + Pattern Library. Output: a `PIQ.composition` (selected patterns + configured skills).
2. **Discover & Fit** — Skill Fitment (per-skill verdict + happy-path agentivisation + to-be
   flow) + Discovery Engine.
3. **Build** — Skill Workshop: configured skills + fitment verdicts assembled into an
   executable, validated agent chain, then promoted to live.
4. **Run & Monitor** — opens on **Mission Command**, the campaign board: the objective's compound
   KPI as an animated gauge, one card per persona mission (avatar + mission statement + KPI
   progress + patterns active + share of the objective + earned badges), and the cross-mission
   dependency board. Clicking a card drills into Mission Operations, which leads with a
   **mission-outcome band** (each
   in-scope mission, its accountable owner, and its capability KPIs walking baseline→target as
   the queue is cleared) above the process-operations throughput strip; then the transaction
   queue (STP on the happy path; variations matched to patterns → DAG approval, each approval
   card showing the contribution chain pattern → capability → mission → objective)
   + Central Nervous System + Governance + Value Measurement.
5. **Finance Command Centre** — the finance-leadership consumption surface (Command Center,
   Intelligence, Scenarios, Trajectory), fronted by a persona rail: CFO (whole book), Controller,
   Treasurer, Credit & Collections Lead, AR / O2C Lead, FP&A Lead — each scoped to the objectives
   they own, so tiles, decision queue and insights narrow to their remit.

The data model encodes the mental model: each pattern's `originalDAG` = happy path,
`branchingDAG` = variation branches, `hitlGates` = the approval sought before a branch runs.

## Build

```
python scripts/build.py
python -m http.server 3000 --directory public
```

Then open http://localhost:3000/ (landing) or http://localhost:3000/processiq.html (accelerator).

`build.py` regenerates the data and inlines CSS + data + engine + UI into a single
self-contained `public/processiq.html`.

## NEVER edit `public/`

Generated. All edits go to `src/` (or the `scripts/` generators).

## Source map

| File | Purpose |
|------|---------|
| `AR_Pattern_Library_v2_Complete.xlsx` | Master pattern library — source of truth |
| `scripts/build_patterns.py` | Parses the xlsx (+ `patterns_o2c_ext.json`) → `src/data/patterns.json` (101 patterns, branching DAGs, HITL gates) |
| `scripts/build_taxonomy.py` | Generates `src/data/taxonomy.json` — the generic Objective→Function→Process→Mission→Capability spine. AR mapped to the real library; sample functions carry self-contained `stubPatterns`. Also owns `MISSION_PERSONAS` (RACI) + `_approver_from_gate` (derives approvers from `hitlGates`) and `KPI_METRICS` (baseline/target per KPI label) |
| `scripts/build_portfolio.py` | Generates synthetic `src/data/portfolio.json` (invoices + event timelines) |
| `scripts/build_roi.py` | Generates `src/data/roi.json` (KPIs, outcomes, trajectory, attribution) |
| `scripts/build_discovery.py` | Generates `src/data/discovery.json` (anomaly scatter, clusters, candidate) |
| `scripts/build_cfo.py` | Generates `src/data/cfo.json` (decisions, insights, scenarios) |
| `src/js/engine.js` | Cognitive engine — Sense→Diagnose→Decide→Act, on-device, deterministic |
| `src/js/shell.js` | Platform shell — `window.PIQ` state, **two-level journey router**, `composition` state (`objectiveId`, `missionIds`, `capIds`, `patternIds`, `skills`), ERP toggle, cross-pattern helpers (`PIQ.pattern`, `PIQ.collectSkills`, `PIQ.missions`, `PIQ.capabilities`, `PIQ.fitment`, `PIQ.go`), persona helpers (`PIQ.personas`, `PIQ.initials`, `PIQ.missionRoleCount`) and the tie-back index (`PIQ.patternAttribution` pattern→capability→mission, `PIQ.missionMetrics`) |
| `src/js/studio.js` | **Setup** — Mission Builder wizard (Objective→Function→Process→Missions→Capabilities→Patterns→Skills) + the Mission persona map (`personaMatrix`, `raciBlock`, `ownerChip`) |
| `src/js/fitment.js` | **Discover & Fit** — skill-fitment table + happy-path agentivisation + to-be flow |
| `src/js/build.js` | **Build** — Skill Workshop: agent-chain assembly + pre-flight validation + promote to live |
| `src/js/runtime.js` | **Run & Monitor** — Mission Operations console; mission-outcome band (`missionBand`/`missionProgress`/`drawMissionKpis`), variation→pattern-match→DAG approval with the contribution `chainLine`, live process KPIs. Exposes `PIQ.missionRuntime()` — the read-only per-mission simulator stats Mission Command reads, so the two boards can't disagree |
| `src/js/mission_command.js` | **Run & Monitor** (first sub-view) — Mission Command campaign board: objective gauge, persona mission cards with KPI progress + badges, cross-mission dependencies. Fully derived — badges from simulator state, objective share weighted by patterns in play, dependencies from shared capability ids + process order |
| `src/js/provocation.js` | The Provocation (scrollytelling intro; reachable via the topbar "Why" link) |
| `src/js/library.js` | Pattern Library (filterable master-detail) — Setup sub-view |
| `src/js/cockpit.js` | Central Nervous System UI render logic — Run & Monitor sub-view |
| `src/js/governance.js` | Action & Governance (trust modes + Saga simulator) — Run & Monitor sub-view |
| `src/js/discovery.js` | Discovery Engine (math→text→LLM pipeline) — Discover & Fit sub-view |
| `src/js/roi.js` | Value Measurement — Run & Monitor sub-view |
| `src/js/cfo.js` | Finance Command Centre (finance-leadership consumption surface + persona rail) |
| `src/js/processmap.js` | L4 process-map overlays for the O2C taxonomy matrix |
| `src/css/app.css` | Tiger brand theme (all modules) |
| `src/html/cockpit_body.html` | Platform shell markup (topbar + `#subbar` + `#view`) |
| `src/apps/index.html` | Platform landing page |
| `scripts/build.py` | Regenerates data + assembles everything → `public/processiq.html` |

## Terminology note (reorientation)

This build reorients the original "Process Transformation" framing to **Tiger Mission Control**:
- **Theme** (studio step 0) → **Objective** (backed internally by `tax.themes` / `composition.objectiveId`).
- **Personas / roles** → **Missions** (`composition.missionIds`, taxonomy `process.missions`).
- **Objectives** (per-role) → **Capabilities** (`composition.capIds`, mission `.capabilities`).
- **Action blocks / Configure** → **Skills** (`composition.skills`, `PIQ.collectSkills`).
- **CFO Layer** → **Finance Command Centre** (stage id stays `cfo`; `src/js/cfo.js`), with a persona
  rail inside it — CFO (whole book) plus Controller, Treasurer, Credit & Collections, AR / O2C and
  FP&A leads, each scoped to the objectives they own.
- **Patterns stay patterns.** The landing-page `PERSONAS` lens (`?persona=…`, which stage of the
  journey to open) is a different concept from the Finance Command Centre's finance personas.
- The app is **light-theme only** — the dark mode and its toggle were removed.

## Status

**The staged journey is live.** Boots into the Mission Builder (Setup). Fitment verdicts and
the runtime simulator are deterministic (`PIQ.fitment`); nothing invents data. Optional future
work: author full pattern libraries for the sample functions; a live-Claude diagnosis layer on
the Central Nervous System.
