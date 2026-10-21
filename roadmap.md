# ARGUS — System Reference

> This document describes the **A.R.G.U.S.** (Automated Reconnaissance & Geographic Understanding System) project, which lives in the [`A.R.G.U.S/`](https://github.com/danny-disargus) repository. The chimera `roadmap.md` previously described a "Visual Fusion" product that was never built — for the actual system state, see the A.R.G.U.S repo.

---

## What ARGUS Is

ARGUS is a distributed, real-time, multi-source intelligence aggregation, verification, and visualization platform. It is **not** a consumer maps/routing product.

**Core pipeline:**
```
observe → normalize → resolve → fuse → locate → reason → predict
        → verify → alert → propose → authorize → act → audit → learn
```

**Defining properties:**
- **Fusion over collection** — value emerges from connecting disparate signals into one incident
- **Confidence-and-lineage layer** — surfaces what the system does *not* know
- **Edge-AI + blockchain anchoring** — privacy-preserving, tamper-evident operation

---

## Repository

- **Source:** https://github.com/danny-dis/argus
- **Monorepo:** TypeScript (pnpm workspaces), 68 packages + 12 services
- **README:** `A.R.G.U.S/README.md` (system identity, layout, getting started)
- **Research:** `A.R.G.U.S/research.md` (consolidated sources, validation, competitive landscape, API catalog)
- **Gaps:** `A.R.G.U.S/gaps.md` (consolidated architecture, deployment, and vision gaps)
- **Architecture:** `A.R.G.U.S/docs/ARCHITECTURE.md`
- **Current Status:** `A.R.G.U.S/docs/CURRENT_STATUS.md`

---

## What Exists Today (ground truth)

| Layer | State | Evidence |
|-------|-------|----------|
| `@argus/ontology` | ✅ Built | 20K-line canonical types, graph algorithms, security, confidence. CRUD + query + WebSocket streaming. |
| `@argus/data-fusion` | ✅ Built | Adapter framework + shared source normalization. 1190-line adapter index. |
| `@argus/agents` | ✅ Built | Claim orchestrator, verifier, sentinel, device trace, forensic, needle, STORM agents. |
| `@argus/cv-pipeline` | ✅ Real ONNX path | Face recognition, OCR, ALPR, motion detection, zone-based detection. |
| `@argus/sigint` | ✅ Built | SDR abstraction, TDOA/AoA geolocation, hybrid locator. |
| `@argus/renderer-4dgs` | ✅ Built | 4D Gaussian Splatting renderer. |
| `@argus/scene-reconstruction` | ✅ Built | COLMAP/splat training pipeline, tile store, coverage index. |
| `@argus/world-model` | ✅ Built | Persistent geospatial + temporal store, nearest-scene lookup. |
| `apps/frontend` | ✅ Built | Cesium globe/map navigation, event overlays. |
| `apps/globe-view` | ✅ Built | GEV cockpit with ontology layer. |
| `apps/desktop` | ✅ Built | Tauri 2 desktop client with Node.js sidecar. |
| `services/ontology-api` | ✅ Built | REST + WebSocket service over ontology graph (:4002). |
| `services/ingestion-core` | ✅ Built | Adapter runner, stream consumer, PostGIS persistence. |
| `services/action-core` | ✅ Built | Deterministic action gate, executor, delivery connectors. |
| `packages/persona` | ✅ Wired | HTTP `/ask` route exists, conversation delegates to `@argus/persona`, 17 tests pass. |
| `packages/dream-mode` | ✅ Built | Background consolidation, entity resolution, cross-correlation, hypothesis generation. |
| Real-time video feed fusion | ❌ Not built | No `bestFeedForZoom`, no feed-registry scoring, no cross-sensor compositor. |
| Clock-sync / spatiotemporal alignment | ❌ Not built | Every cross-sensor join silently assumes shared clock/CRS. |
| WAMI georegistration | ❌ Not built | No pixel→lat/lon mapping for drone video streams. |
| PostGIS (running) | ❌ Not deployed | No live database. |
| Redis (running) | ❌ Not deployed | No live cache/stream. |

---

## Critical Gaps

See `A.R.G.U.S/gaps.md` for the full analysis. Top items:

1. **Nothing is running** — no PostGIS, no Redis, no Docker Compose
2. **No real-time video feed fusion** — no `bestFeedForZoom`, no feed-registry scoring
3. **No clock-sync / spatiotemporal alignment** — every cross-sensor join silently assumes shared clock/CRS
4. **No WAMI georegistration** — biggest single engineering lift
5. **Two divergent query engines** — `graph.ts evaluate()` vs `query-executor.ts executeQuery()` give different security semantics
6. **No upsert by external id** — duplicate objects on re-pull
7. **No document intelligence pipeline** — most forensic evidence is PDFs/scans, no bulk ingest
8. **No case-file bulk import** — adapter-per-stream works, batch import missing
9. **No motion interpolation layer** — ontology objects jump between ingest cycles
10. **No freshness honesty labels** — no per-object live/delayed/modeled indicator

---

## Research & Competitive Landscape

See `A.R.G.U.S/research.md` for:
- Validated technical claims (9/10 validated, 1 conditional)
- Ingestion ecosystem (65+ sources)
- Free / no-cost API catalog (200+ sources)
- Competitive landscape (Palantir, Anduril, Maven, Gorgon Stare)
- ARGUS wedge (air-gap, open ontology, model-agnostic, audit-first)
- Deployment verticals (disaster, food-security, epidemiology, etc.)

---

## Chimera's Role

Chimera is the multi-agent coding harness used to build and verify ARGUS. It is **not** ARGUS itself. For ARGUS system questions, consult the A.R.G.U.S repo docs. For Chimera harness questions, see `CLAUDE.md` and `AGENTS_CHECKLIST.md`.
