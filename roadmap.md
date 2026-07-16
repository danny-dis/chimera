# ARGUS Visual Fusion — Roadmap

**Scope:** the operator-facing "fly the city in 3D, stop, point at a street,
load the sharpest live feed" product, plus multi-modal overlay (thermal) and
cross-sensor retrace (SAR). Design doc — reuses the existing `@argus/ontology`
types (`OntologyObject`, `OntologyLink`, `ConfidenceEnvelope`, `LineageEntry`)
so municipal feeds, RF sensors, drones, and satellites all land in ONE graph.

**Status legend:** ✅ exists · 🟡 declared-but-absent · ⬜ greenfield

---

## 0. What exists today (ground truth, not vision)

| Layer | State | Evidence |
|-------|-------|----------|
| `@argus/connectors-rfdef` | ✅ half-built | Kismet / rtl-sdr / bettercap → ontology |
| `@argus/ontology` | 🟡 `workspace:*`, no dir on disk | referenced, not committed |
| `@argus/connectors` (base) | 🟡 `workspace:*`, no dir on disk | referenced, not committed |
| Visual fusion / 3D / LOD / feed registry | ⬜ | zero files |
| Thermal overlay / SAR retrace | ⬜ | zero files |

The rfdef code is built around **restriction** (authorized-MAC gate, `rejected[]`
log). Municipal fusion inverts that trust model — see §6 (gating decision).

### 0.1 Base-plate sourcing — Google Maps swap (sourcing decision, not a capability)
The static 3D base (§4d/§8.5/§9.5/§9.7) can come from Google Maps' globe→street
mesh instead of drone tours — instant global geometry, zero capture. But the base
plate is ~5% of ARGUS; it's the only part Maps replaces. The live/temporal/cross-
sensor 95% (§4–§15) is exactly what no map product has: Maps is frozen, single-
modality, no time axis, no moving objects, no detection, no provenance.
Two ceilings a base swap does NOT dissolve: (1) LOD ceiling (§3) — can't zoom past
Maps' capture GSD to read a plate; live feeds beat it only where a real camera
covers the spot. (2) **Google Maps ToS forbids this class of use** (surveillance /
derived dataset / persistent overlay) — fine for a DEMO, legal dead-end for the
product.
`ponytail:` demo on Maps; real deployment needs an unencumbered base — own drone
tours, commercial terms (Cesium/Bing/Esri), or open 3D Tiles. Base plate is a
pluggable source behind §1, not hardcoded to any provider.

---

## 1. Core primitive — the whole product in one function

```
nearestFeed(pose, target) -> OntologyObject | null
bestFeedForZoom(target, viewFootprint) -> OntologyObject | null   // LOD selector
```

Everything else is plumbing around these two. `bestFeedForZoom` IS the LOD
system — LOD is feed-selection, not a rendering trick.

```
score(feed, targetFootprint) =
    coverage(feed, targetFootprint)   // does it see this point at all
  * (feed.nativeGSD / targetGSD)      // resolution headroom at this zoom
  * freshness(feed.lastFrame)         // live > 5s-old > archived
  * angleQuality(feed.pose, target)   // oblique != straight-down detail
```

---

## 2. Components (thin, all emit ontology types)

| Component | Job | Reuses | Slice |
|-----------|-----|--------|-------|
| `feed-registry` | ingest CCTV / drone / vehicle-cam descriptors → `OntologyObject` (geo coverage + lineage + classification) | rfdef parser shape | 0 |
| `geo-index` | spatial lookup of feeds by coverage polygon | stdlib grid/S2/R-tree | 0 |
| `bestFeedForZoom` | LOD selector (the score fn above) | geo-index | 0 |
| `provenance-hud` | which camera / GSD / age / agency produced this pixel | ontology `LineageEntry` | 0 |
| `fusion-compositor` | blend drone 3D + snap to municipal feed on lock | emits `OntologyLink` w/ confidence | 2 |
| `thermal-overlay` | project drone thermal onto shared 3D model | 3D base model as registration anchor | 2 |
| `sar-retrace` | SAR detection → back-query archive → reconstruct tracks | geo-index + ontology `OntologyLink` | 3 |
| `operator-console` | fly / stop / point / zoom / load | UI only | 1–3 |

---

## 3. LOD & the physical ceiling (honest spec)

You cannot invent pixels no camera captured. Zoom is bounded by the best-covering
sensor's **ground-sample-distance (GSD)** at that point. Past that, "sharpness"
is hallucinated (super-res GAN) — **inadmissible as evidence**, liability for a
mayor/police tenant.

**Contract:** *pixel-accurate to the best sensor on the street, with full
provenance — and it TELLS the operator when they've hit that sensor's limit
instead of faking detail.*

| Zoom band | On screen | Source |
|-----------|-----------|--------|
| City / flyover | 3D mesh (photogrammetry / sat / OSM buildings) | pre-baked tiles |
| District | wide CCTV / drone nadir, projected on mesh | live, coarse |
| Street | best-GSD pole / vehicle cam | `bestFeedForZoom` winner |
| Face / plate | single highest-res sensor covering the point | registry max-res node |

**Handoff is the one thing not to be lazy about:** crossing a band swaps sensors
(different angle, color, timestamp). Naive swap = jarring "pop" + operator
distrust. Min viable: crossfade + persistent provenance HUD. HUD ships slice 0
(legal requirement), crossfade shader slice 2.

`super-res` → **never** (evidence risk). Cosmetic-only, watermarked, if ever.

---

## 4. Thermal overlay (NEW) — "can ARGUS smoothly overlay the RGB model over thermal drone video?"

**Yes — because you already have the 3D base model, and that's the trick.**

You do NOT align thermal-to-RGB directly (hard: different modalities share almost
no visual features). You align **each modality to the shared 3D base model**,
which is solved once:

1. Drone reports pose (GPS + IMU), refined by PnP against the known 3D model.
2. Both the RGB texture and the thermal frame reproject onto the **same mesh**.
3. Overlay = thermal as an opacity/false-color layer on the RGB-textured model.
   Smoothness comes free because both are locked to one geometry, not to each other.

**Ceilings (`ponytail:` known corners):**
- Thermal is low-res + textureless → registration leans on **pose accuracy +
  geometric edges (roofs, curbs)**, not feature matching. Upgrade path: edge-based
  ICP refine if pose drift shows.
- Time-of-day: RGB model baked at noon vs thermal at night still aligns
  geometrically — only the *texture* looks stale, not the registration.
- Moving objects (cars, people) aren't in the static mesh → they smear if
  projected onto ground plane. Handle as separate billboarded detections, not mesh texture.

Reuse: same `bestFeedForZoom` + mesh; thermal is just another feed with a
`modality: 'thermal'` tag on its `OntologyObject`.

---

## 4b. WAMI (NEW) — "is ARGUS capable of Wide-Area Motion Imagery?"

**Not as a producer — as a consumer/fuser, yes.** WAMI = one gigapixel sensor
(aircraft/aerostat, e.g. Gorgon Stare / ARGUS-IS class) staring at a whole city
at ~1–2 Hz, so you can freeze-frame and track ANY object retroactively. ARGUS
(this repo) does not fly a sensor and cannot manufacture that pixel plane. But a
WAMI feed is **just another `OntologyObject`** — the one modality that happens to
cover the entire `geo-index` at once.

What it changes in the existing design (no new model):
- **`bestFeedForZoom`:** a live WAMI frame becomes the always-available coarse
  base layer — every street already has *a* feed; pole/vehicle cams win only where
  their GSD beats WAMI's (~15–30 cm/px city-wide).
- **§5 SAR retrace / track association:** WAMI is the dream input — persistent
  1 Hz coverage means tracks have almost no gaps, so association degrades from
  "sparse waypoints" to "near-continuous." Same `OntologyLink[]` output.
- **Storage is the real cost, not the code:** gigapixel × 1 Hz × city = petabytes.
  `ponytail:` don't store raw WAMI — store tracklets + on-demand chip requests
  against the provider's archive. Ingest = detections, not the pixel firehose.
  See §4c for the delta-storage model that makes this cheap.

**Ceiling to state to the tenant:** ARGUS *fuses and exploits* WAMI if a provider
supplies the feed; it does not *generate* WAMI. Everything else (LOD, retrace,
thermal) then rides on top unchanged.

---

## 4c. Delta storage (NEW) — "since the base model is the same, store only what changed"

**Yes — and it's not a custom delta store, it's two solved things.** The base
model IS the background plate; store it once, store only the difference forever.

| Layer | Store as | Solved by |
|-------|----------|-----------|
| Static geometry (buildings, roads) | mesh + baked texture, once | glTF / 3D Tiles |
| Per-frame dynamics (cars, people) | detections / tracklets (bbox, class, pose, time) | §5 `OntologyLink[]` |
| Raw pixel delta (only if needed) | P-frames against a keyframe | H.264/H.265 codec |

This is **background subtraction** (base = background) feeding a **P-frame/keyframe**
stream. Both off-the-shelf. Consequence: the WAMI petabyte problem dissolves —
you never stored the redundant static pixels in the first place. Base once +
tracklets forever + on-demand pixel chips.

`ponytail:` the one real corner — background subtraction against a *3D* model
(not a 2D plate) needs camera pose to reproject the base into the current view
before differencing. That reprojection already exists in §4 (thermal PnP-against-
mesh). Reuse it, don't rebuild it.

→ skipped: any custom delta-store package (it's codec P-frames + the §5 tracklet
graph). Add real ingest only at slice 3.

**4d. 3D Gaussian Splatting for the base plate (NEW) — "scroll days in a headset,
no detail lost?"** Splats are the natural renderer for the static base (drones
toured 100× = ideal input), photoreal + headset-fast. Three ceilings:
- Splats bake at **fixed density** → zoom past it = blobs, not plates. Same GSD
  ceiling as §3; splats interpolate, they don't add pixels.
- Splats are **static geometry, no time axis** → moving objects can't live in the
  splat. The time axis is the §5 tracklet layer rendered *on top*.
- Multi-day dense city splats **re-explode storage** (3DGS is bigger/area than mesh).
Correct architecture = the §4c split unchanged: **splat = photoreal static base
(detail-locked to splat density); moving objects = tracklets + on-demand chips.**
Scrubbing time = scrub the dynamic layer, not the splat. `ponytail:` never bake a
4D/time-varying whole-city splat (research paper, not a product).

---

## 5. SAR retrace (NEW) — "SAR satellite passes; can ARGUS retrace every object through the CCTVs and drones?"

**Partially — and the honest version is more useful than the magic one.**

SAR gives **coarse spacetime detections** (moving/displaced objects, vehicle-sized
classes) at **satellite revisit cadence** (snapshots minutes–hours apart, NOT
continuous). "Retrace every object" = **cross-sensor track association**:

1. SAR detection → `(position, time, coarse_class)` → `OntologyObject`.
2. Query `geo-index` for every feed (CCTV/drone/vehicle-cam) that covered that
   spacetime cell → candidate frames.
3. Re-ID / associate candidates into a track → chain of `OntologyLink`s, each with
   a `ConfidenceEnvelope` and `LineageEntry` (which sensor, when).

**Ceilings (state them to the tenant, don't hide them):**
- SAR revisit is **sparse** → you get waypoints, not continuous truth. Tracks
  between passes are *interpolated/inferred*, flagged as such.
- SAR resolution classes objects **coarsely** (vehicle-sized, not identity) →
  association is probabilistic, not certain.
- **Coverage gaps** between CCTV break tracks → output is "probable track with
  confidence + explicit gaps," never "we followed it everywhere."

Output product: a reconstructed track = ordered `OntologyLink[]` with per-hop
confidence and gap markers. Same machinery as everything else — no new model.

**5b. Rewind-to-origin (NEW) — "pick a target, rewind to see where it came from."**
Same graph, traversed reverse-time: `retrace(objectId, t)` = the `OntologyLink[]`
chain ending at that object, read backward → per-hop `{sensor, time, confidence,
gaps}`. Forward = "where did it go"; backward = "where from." Scrub-back pulls §4c
chips per opened hop, rendered on the §4d splat. Ceiling unchanged: coverage gaps
→ "probable origin + explicit gaps," never "to its front door"; WAMI (§4b) shrinks
the gaps. → no new capability, just reverse traversal at slice 3.

**5c. Court-order backtrace (NEW) — "police tenant, warrant, 30-day 3D RGB of a
subject."** Authorization is §6 + warrant law, NOT a harness feature — a court
order grants compartment access, it does not change what sensors captured.
Deliverable is §5b + §4c, and it is **not a continuous 30-day movie**: a
confidence-scored path with RGB chips only at covered hops + explicit gaps.
Ceilings: (1) tracklets/chips were stored, not continuous RGB (§4c) — the movie
doesn't exist to retrieve; (2) coverage = city infra only → indoors/private =
gap; (3) **person re-ID ≪ vehicle tracking** (most cams lack face-grade GSD) →
every hop needs its `ConfidenceEnvelope` surfaced or the deliverable is
inadmissible. The gapped, confidence-scored path is MORE defensible than a
seamless render, which would be fabricating the gaps.

**5d. Vehicle replay (NEW) — "replay any point in 30 days where a police car was."**
Strictly easier than 5c: a cruiser is a **moving sensor with its own GPS/AVL**, so
its path is confidence-1 — no re-ID needed. `replayVehicle(vehicleId, t0..t1)` =
its AVL track ∪ every fixed/other-vehicle cam whose §4c coverage cell intersects
it; the vehicle is just a query key over the geo-index. Ceiling: you replay where
it was *covered*, not a continuous movie — own dashcam is continuous only if
stored (§4c = chips-on-demand, NOT 30 days full RGB per cruiser or petabytes
return); fill-in cams cover only intersecting cells. Certain path + RGB where
footage was kept. → no new capability, query key at slice 3.

`ponytail:` naive per-cell brute-force association first; add a proper
multi-hypothesis tracker (MHT/JPDA) only if the brute-force false-association
rate is measured too high.

---

## 6. The gating decision (blocks slice 0 — legal, not engineering)

rfdef's identity is restriction (`types.ts:10` "only the OPERATOR'S OWN … ever
ingested"). Municipal fusion inverts it. Pick the trust posture:

- **(a) Reuse the gate, change the policy.** `tenantId = city`; `compartments =
  agency` (police / fire / public-works). Gate becomes *"is this operator cleared
  for this compartment?"* Smallest diff, keeps the machinery.
- **(b) Open fusion + separate ACL.** Video visibility is its own access layer;
  rfdef's `authorize.ts` is moot for video.

This is a tenant-scope/legal call. Nothing ships until it's picked.

---

## 7. Build order (lazy: prove cheap, defer expensive)

- **Slice 0** — `feed-registry` + `geo-index` + `bestFeedForZoom` + `provenance-hud`,
  with a `__main__`/assert self-check. Proves LOD selection with zero hardware.
- **Slice 1** — real ingest from one source type (CCTV RTSP) → registry. Operator
  console fly/stop/point/zoom.
- **Slice 2** — `fusion-compositor` + `thermal-overlay` (the hard/expensive 3D
  work) + crossfade handoff.
- **Slice 3** — `sar-retrace` (needs the archive + geo-index mature).

Skipped until picked: any package scaffolding, compositor, real ingest,
super-res. Add slice 0 the moment §6 posture is chosen.

---

## 8. Features to add — learned from Bilawal Sidhu (ex-Google Maps PM)

Source: his YouTube channel (spatial AI / 3D mapping / surveillance). Pulled 7
transcripts. Only NET-NEW capabilities below — things not already covered by
§1–§7. Each names what it reuses and where it stops.

### 8.1 Reframe: what we designed IS WAMI ("Hollywood Imagined It / Military Built It")
His WAMI video literally describes DARPA's **ARGUS-IS** (368 cameras, watch a
whole city, hit rewind, track every vehicle, backtrace a car → drop-off → house →
whole network). That is §4b + §5b + §5d, validated. No new work — this is the
naming/framing anchor. Our honest-gaps posture (§5c) is the *civilian* correction
to the military "soda-straw-free omniscience" pitch. Keep the gaps; they're the
admissibility moat.

### 8.2 Sensor-mode shaders — CRT / night-vision / FLIR / pixelation toggle (from "Vibe Coded Palantir")
His WorldView lets the operator flip view modes (thermal/FLIR/night-vision) as a
**render pass**, not a data change. Cheap, high-demand for a command-center UI.
`ponytail:` pure client-side shader over the §4d splat + §4 mesh; zero backend.
→ skipped: real multispectral fusion (that's §4 thermal); add shader pass at slice 1 (UI-only, ~1 day).

### 8.3 Live-orbit / feed-coverage overlay — "which sensor is over this point NOW" (from WorldView + God's Eye 4D)
He renders satellite/aircraft tracks and lights up a link when one passes over an
AOI. For us that's **predictive coverage**: given SAR/WAMI/drone schedules, show
the operator *when the next good frame of this spot arrives*. Directly feeds §5
retrace (know your next waypoint before it lands).
→ skipped: real orbit propagation (use provider ephemeris/TLE); add coverage-forecast to geo-index at slice 3.

### 8.4 Timeline scrubber as a first-class UI primitive (from "God's Eye 4D" / Operation replay)
His killer demo is a **bottom timeline bar** that replays a multi-source event
minute-by-minute on the 3D globe. This is the operator front-end for §5b/§5c/§5d —
we have the data model (tracklets + chips) but no scrubber spec'd. Make the
timeline the primary console control, not an afterthought.
→ skipped: nothing new in the data layer; add scrubber to operator-console at slice 1.

### 8.5 Photo-fusion / crowd-sourced reconstruction for the long tail (from "Hidden 3D Model of the World")
Base model comes from official drone tours (§0). His point: **public/uploaded
imagery** (tourist photos, social) fills the *long-tail* spots drones fly rarely.
For a city tenant: fuse authorized public-space submissions + bodycam stills to
keep the splat base fresh between drone tours. Feed-registry already models
arbitrary sensors — a phone photo is just a one-shot `OntologyObject`.
`ponytail:` reuse structure-from-motion (COLMAP) → splat pipeline; don't build a reconstructor.
→ skipped: SfM pipeline; add as a §4d base-refresh source at slice 2, ONLY under §6 posture (consent/privacy gate).

### 8.6 Geofence query — "who/what was in this circle at this time" (from "Police Drew a Circle on a Map")
The single most-requested police primitive: draw a polygon + time window → every
object the graph saw inside it. This is a **geo-index range query**, already the
core index. His video is also the privacy warning: this is the honeypot that
invites abuse. Ship it WITH Google's own restraint pattern — anonymized IDs
first, unmask only on per-record authorization (§6 compartment check).
→ skipped: nothing new in index; add `geofenceQuery()` + the two-step unmask gate at slice 3. Gate is mandatory, not lazy-skippable.

### 8.7 RF / WiFi-presence layer — non-optical sensing (from "Your WiFi Can See You")
CSI-based presence/pose/re-ID through walls, no camera. ARGUS ALREADY has the RF
spine (`connectors-rfdef`: kismet/rtl-sdr/bettercap). This extends it from
spectrum-presence to **occupancy** as another `OntologyObject` modality — fills
optical dead zones (indoors) that break §5c/§5d tracks. Strong ethical/legal
ceiling: through-wall sensing of private space is a warrant/consent question, not
a feature toggle.
→ skipped: CSI ingest; add a `modality:'rf-presence'` connector at slice 3, gated hard by §6 + explicit legal posture.

### 8.8 4D-splat storage economics — validation, not new work (from "4D Gaussian Splats Explained")
Confirms §4c/§4d were right: 4D splats are terabytes (ASAP Rocky video = 10 TB),
compression race is live (Niantic **SPZ** ~10×, now in glTF standard; research
100×). Action: when we do splats, **adopt SPZ (glTF) as the base-plate format**
instead of raw PLY — free 10× off the storage line. Keep dynamic objects as
tracklets, NOT 4D splats (his terabyte problem = our §4d "never bake a whole-city
4D splat").
→ skipped: nothing to build now; pin SPZ/glTF as the format decision for slice 2.

---

## 9. More features — second pass (7 more transcripts)

Only NET-NEW vs §1–§8. Same rule: name the reuse, name the ceiling.

### 9.1 Stable cross-sensor object ID — the "same car in sat vs drone vs CCTV" number (from "Palantir Maven Smart System")
Maven's core trick: every detection carries a **stable identifier** so the same
vehicle is provably one object across satellite → drone → CCTV views. This is the
missing spine under §5 (retrace) and §8.1 (WAMI) — our `OntologyLink[]` chains
assume identity is already resolved; Maven says make the ID a first-class, human-
confirmable field. Add `stableId` + confidence to `OntologyObject`; let an
operator merge/split IDs (the "left-click → detection" confirm step).
→ skipped: auto re-ID model; add `stableId` field + manual merge/split at slice 3 (it's what makes §5c defensible).

### 9.2 Detection → Kanban → task-assignment workflow (from Maven)
Maven turns detections into **cards on a Kanban board** (to-do → done), then
recommends which asset to task against a target (optimize time/fuel/distance),
human-approves. Civilian version: dispatch. A flagged object → card → "assign
nearest unit" with an optimized ETA, responder approves. Chimera ALREADY has a
Kanban orchestrator (`kanban-orchestrator`/`kanban-worker` skills) — reuse that
pattern, don't rebuild.
→ skipped: dispatch optimizer; add detection→card bridge at slice 3, reuse existing kanban. NO auto-action — human approve only.

### 9.3 Common Operational Picture for field responders — AR/"wall-hack" tag sharing (from "Palmer Luckey EagleEye / Lattice")
Lattice fuses every sensor into one shared 3D picture: a drone spots someone →
tagged → visible to every other unit through walls. Civilian: an object tagged in
the command console pushes to responder phones/bodycam-AR in the field. This is a
**publish/subscribe fan-out of the same tracklet graph**, not new data. He
explicitly predicts the law-enforcement version (CCTV + bodycam fusion).
→ skipped: AR client; add a tag pub/sub channel over the existing graph at slice 3. Field-facing, so §6 role gating applies.

### 9.4 InSAR change-detection — sub-mm deformation, all-weather (from "Satellite Revealed / SAR deep-dive")
Beyond §5 (SAR moving-object detection): **InSAR** stacks repeat passes to get
sub-millimeter *structural* change (ground/building deformation), through cloud
and dark. Free source exists — **Sentinel-1, 12-day cycle, public**. Distinct use
case: infra monitoring (subsidence, tunneling, collapse risk) for the city
tenant, not just tracking. A change map is just a time-diff `OntologyObject`.
→ skipped: InSAR processing; add Sentinel-1 change-detection connector at slice 3. Free data = cheap to prototype first.

### 9.5 Satellite-only 3D for aerial-denied zones (from "Fixed Google Earth's Biggest Problem / Skyfall-GS")
Base model assumes drone tours (§0). Reality: restricted airspace / no-fly zones
leave holes. Skyfall-GS trains splats on oblique **satellite** imagery + diffusion
to complete occluded facades — 3D where you can't fly. Fills the same long-tail
gap as §8.5 but for legally-unflyable areas.
`ponytail:` this is a diffusion-completion — quality is *plausible, not measured*;
tag such tiles `synthetic:true` and EXCLUDE from any evidentiary path (§5c).
→ skipped: the whole pipeline (research-grade); add as a base-fill source at slice 2, hard-flagged non-evidentiary.

### 9.6 Visual Positioning System — cm-accurate localization in GPS-denied urban canyon (from "Pokémon Go / Niantic")
GPS = 5 m error (sidewalk vs road). VPS matches a live camera frame to the 3D base
model → **centimeter pose** where GPS fails (downtown, indoors). This is the
enabling primitive under §4 (thermal PnP), §4c (delta reprojection), §5d (drone/
vehicle pose): they all assume good pose. VPS = "localize a frame against our own
splat base," which we already have. Make it an explicit shared service.
→ skipped: nothing new — it's PnP-against-base already implied; promote to a named `localize(frame)` service at slice 2 so §4/§4c/§5 stop each rolling their own.

### 9.7 View-dependent splats fix the mesh's broken cases (from "Apple Maps Realistic / WWDC")
Confirms §4d and adds a *why*: photogrammetry meshes fail on thin geometry (poles,
wires), glass/reflections, and vegetation ("broccoli trees"). Splats encode
view-dependent color → those cases render correctly. Apple ships a **hybrid**:
cheap flat meshes for roads/facades, splats only where view-dependence matters.
Adopt the same hybrid — don't splat everything (cost), splat the hard surfaces.
→ skipped: nothing to build; pin "hybrid mesh+splat, splat only view-dependent surfaces" as the slice-2 base-plate rule.

### 9.8 Explicitly OUT of scope (YAGNI — from Maven / Genie-3)
- **Kill chain / weapon tasking** (Maven's end state): civilian tenant, never build.
- **Genie-3 generative world model** (imagine a street that isn't there): great
  for prototyping a UI, but it *hallucinates* geometry — categorically banned from
  any operational or evidentiary view. Prototype-only, never in the console.

---

## 10. Emergent capabilities — free once the graph is running (research, net-new)

Assume §1–§9 live. These need **no new sensor** — they're queries/derivations over
tracklets + the ontology graph that already exists. Ranked by leverage-per-line.

### 10.1 Pattern-of-life + anomaly detection
The graph already holds every object's normal movement. Baseline per object/zone
→ flag deviation ("this plate never enters this block at 3am"; "loitering > N min").
This is the single biggest amplifier: turns a passive recorder into an active
watcher. Reuse: tracklet history + rolling stats. `ponytail:` z-score/rolling-median
baseline first, ML only if false-positive rate is measured too high.
Ceiling: baseline needs weeks of data; cold-start = noisy. Anomaly ≠ guilt — advisory only.

### 10.2 Co-travel / network mining
Self-join the graph: objects that repeatedly co-locate in space+time → an
association network. This is Maven's "roll up the whole network" as an automatic
query instead of manual nomination. Reuse: `OntologyLink[]` + a group-by.
Ceiling: co-location ≠ association (two cars at one light). Threshold on repeat count + confidence.

### 10.3 Predictive forward-track + camera pre-tasking
§5b/§8.3 in reverse-time's mirror: extrapolate a live track's next position →
pre-point the next camera / request the next WAMI chip *before* the object arrives.
Closes the OODA loop faster. Reuse: tracklet velocity + coverage-forecast (§8.3).
Ceiling: prediction decays fast (seconds at street speed); show a widening cone, not a point.

### 10.4 One-click evidence package (chain of custody)
Everything already carries `LineageEntry` (sensor, time, confidence). Bundle a
track + its chips + per-hop provenance + content hashes → a court-admissible export.
Nearly free, directly monetizes §5c. Reuse: lineage that already exists + stdlib hashlib.
`ponytail:` sha256 per artifact + a signed manifest; skip a custody DB until a second custodian exists.

### 10.5 Coverage self-audit
The system knows its own feeds and their freshness → auto-surface blind spots
(streets no feed covers) and dead cameras (stale `lastFrame`). Ops amplifier: tells
the city where to put the next camera. Reuse: geo-index + freshness field.
Ceiling: none worth noting — it's a scan over data you have. Cheapest high-value item here.

### 10.6 Cross-modality confirmation (false-positive killer)
Require 2 independent modalities (RF-presence §8.7 + optical) to agree before a
high-confidence flag. Halves the abuse/error surface that §8.6 geofence invites.
Reuse: `ConfidenceEnvelope` combine. One function, big trust payoff.
Ceiling: only works where modalities overlap; single-sensor zones stay single-confidence.

### 10.7 Natural-language query over the graph
"Every red pickup near the school last Tuesday 3–5pm." LLM → structured geo/graph
query. Chimera already has the provider layer — reuse it, don't add an NLP stack.
Turns the console from operator-only to anyone. Reuse: chimera-providers + geo-index.
`ponytail:` LLM emits a JSON filter against existing query fns; NO free-text code-gen against the DB (injection). Whitelist fields.

### 10.8 Needs new hardware — rung-1 flagged, don't build speculatively
- **Acoustic event triangulation** (gunshot/glass-break → cross-cue cameras): needs
  mic array the city may not have. Add ONLY if acoustic sensors already deployed.
- **Air-quality / chem-bio plume fusion**: same — sensor-dependent. Skip until asked.
Both are just another `OntologyObject` modality *if* the hardware exists; the fusion is free, the sensors aren't.

---

## 11. Military / intel tenant — the wedge, not the feature-match (research)

Rung 1: they own Maven, Palantir, Lattice, Gorgon Stare — **proven**. Rebuilding
their feature list makes ARGUS the unproven second source. Skip it. Appeal =
what the incumbents structurally can't/won't give. Each item below is a *reason to
switch*, not a capability they already have.

### 11.1 Air-gap / disconnected-edge operation (DDIL)
Palantir/Maven lean cloud + connectivity. Real ops are Denied/Degraded/
Intermittent/Limited-bandwidth. ARGUS's §4c model (store base once + tracklets,
not the pixel firehose) is *already* the DDIL-native design — a tactical node syncs
tracklets over a 9600-baud link when a fat pipe won't fit. Lead with this; it's a
genuine incumbent weakness, and you already have the architecture.
Ceiling: needs conflict-resolution on reconnect (two nodes, divergent graphs) — CRDT-style merge, not free.

### 11.2 Vendor-neutral open ontology (anti-lock-in)
The #1 procurement complaint about Palantir is lock-in. ARGUS's `@argus/ontology`
is a plain typed schema — publish it as an open standard + export to STANAG 4676
(NATO motion-imagery tracking) / NIEM. "Your data leaves in a standard format" is
a contract-winner incumbents fight. Nearly free: it's a serializer over types that exist.

### 11.3 Model-agnostic / bring-your-own-model at the edge
Maven ties you to their CV stack. Chimera is already multi-provider (chimera-
providers). Let a tenant drop in their own classified detection model behind the
same interface — including local/offline weights on an air-gapped box. Reuse the
provider abstraction; don't build an ML platform.

### 11.4 Provenance / audit as a first-class deliverable (oversight-native)
Intel oversight (IG, FISA-court-style review) is a compliance burden incumbents
bolt on. ARGUS carries `LineageEntry` on every object from day one — §10.4
evidence package becomes an *audit trail for every query*: who looked, what
authority, what they saw. Sell the oversight feature, not despite it.
`ponytail:` append-only signed log (§10.4 hashing) — skip a full SIEM until asked.

### 11.5 Coalition multi-tenancy with releasability control
§6 compartments already model classification. Extend to **releasability** (REL TO
FVEY, NOFORN): the same graph, one operator sees the coalition-shareable subset,
another the full picture — enforced at query time. Incumbents handle this with
separate systems/networks; one graph with per-edge releasability is the wedge.
NOT lazy-skippable: this is a hard security boundary — default-deny, fail-closed.

### 11.6 Counter-ISR / deception awareness
Every incumbent assumes its sensors tell the truth. Add a confidence-degrade layer:
detect spoofed GPS (§5d AVL vs optical disagreement → §10.6 cross-modality), camera
tampering (frozen frame, `lastFrame` fresh but pixels static), decoys. Turns
ARGUS's honest-gaps posture (§5c) into an active defensive feature nobody else leads with.
Ceiling: detection heuristics, arms race — ship the obvious checks, expect evasion.

### 11.7 What NOT to add (rung-1 refusals)
- **Weapons/fires integration (close the kill chain):** liability + it's Maven's
  moat. Stay the ISR/decision layer; hand off via the open ontology (§11.2). Don't build.
- **Custom tactical hardware / helmet:** that's Anduril's game. ARGUS is software
  over whatever sensors exist. Never.
- **Matching Palantir's analyst UI feature-for-feature:** unwinnable. Win on
  air-gap + open data + oversight, not UI parity.

---

## 12. Audio & "well-rounded" asks — mostly rung-1 refusals (research)

### 12.1 Audio capture → just another feed. YES, nearly free.
Mics (bodycam, gunshot sensors, intercoms) are `OntologyObject`s with
`modality:'audio'` + a coverage point. Transcription (Whisper) → searchable text
in the same graph → §10.7 NL query covers "audio near X." Reuse everything.
Ceiling: audio recording law ≫ stricter than video (two-party consent) — hard §6 gate.
→ add: audio-as-feed + transcript at slice 3, gated. Cheap because it's the same registry.

### 12.2 3D spatial-audio reconstruction — SKIP (speculative).
Needs synchronized mic *arrays* per location the city won't have; output is a
niche "hear the scene in 3D" nobody asked for operationally. Sound *source
localization* (which direction a gunshot came from) is the useful 1% — that's
§10.8 acoustic triangulation, already flagged hardware-dependent.
→ skipped entirely. Add only if a tenant deploys mic arrays AND requests it.

### 12.3 Lip-reading to synthesize audio — NEVER BUILD (evidence poisoning).
This *manufactures* words a mic never captured. Same category as super-res (§3)
and Genie-3 (§9.8): fabricated content in an evidentiary system = inadmissible +
liability + the exact opposite of the honest-gaps posture (§5c) that is ARGUS's
whole moat. A visual lip-motion *detection* ("subject is speaking") is a fine
non-audio signal; turning it into fake speech is a hard refusal.
→ never. Detection-only if ever; no synthesized audio, no captions from lips.

### 12.4 What "well-rounded" actually means here — don't confuse features with polish.
Rung 1: ARGUS isn't unlikable for missing capabilities; it's unlikable because
none of it runs. Likability = the boring layer, not more sensors:
- **Fast, legible UI** (§8.4 scrubber, §8.2 view modes) — already spec'd.
- **Trust surface** (§5c gaps, §10.6 cross-confirm, §11.4 audit) — already spec'd.
- **NL query** (§10.7) so non-experts can use it — already spec'd.
Nothing to add. The well-rounded version is §1–§11 *shipped*, not §12 piled on.

---

## 13. Forensic-accuracy labeling — the refusal registry + provenance imprint

Every "never build" above is really "never present fabricated content *as real*."
The design that enforces it once, everywhere: one required field on every
`OntologyObject`, checked at the render/export boundary.

### 13.1 The refusal registry (consolidated)
| # | Fabrication | Ruling | Section |
|---|-------------|--------|---------|
| R1 | Super-resolution / invented pixels beyond sensor GSD | never in evidentiary view | §3 |
| R2 | Genie-3 / generative world models (streets that aren't there) | prototype-UI only | §9.8 |
| R3 | Skyfall-GS diffusion-completed 3D (aerial-denied fill) | `synthetic`, non-evidentiary | §9.5 |
| R4 | Lip-reading → synthesized speech | never; detection-only | §12.3 |
| R5 | Spatial-audio reconstruction from non-arrays | skip; speculative | §12.2 |
| R6 | Inferred track between coverage gaps | `inferred`, flagged | §5b/§5c |
| R7 | Kill-chain / weapons tasking | out of scope entirely | §11.7 |

### 13.2 The imprint — one field, checked at the boundary
Add to `OntologyObject.lineage` (already present) a required `fidelity` enum:

```
fidelity: 'measured' | 'inferred' | 'synthetic'
  measured  = real sensor sample at/above stated GSD. Only this is evidentiary.
  inferred  = derived/interpolated (gap track, prediction, cross-modal guess).
  synthetic = generated pixels/audio (diffusion fill, any model output).
```

Rules, enforced in **one** place each (not per-caller):
- **Default `synthetic` on ingest from any generative source** — fail-closed; a
  connector must *prove* `measured`, never assume it.
- **Render:** anything not `measured` draws with a visible marker (hatched
  overlay / colored border) + the label in the §5 provenance HUD. One guard in the
  compositor, not per-layer.
- **Export / evidence package (§10.4):** `measured`-only by default; including
  `inferred`/`synthetic` requires an explicit flag and stamps a WARNING banner +
  the fidelity of every artifact into the manifest. One guard in the exporter.
- **Metadata imprint:** `fidelity` + source model/version + confidence written
  into the file itself — C2PA/XMP for images, sidecar JSON for splats/tracklets —
  so the label survives leaving ARGUS. Reuse C2PA (industry provenance standard),
  don't invent a format.

`ponytail:` one enum + two boundary guards (render, export) + C2PA write. NOT a
per-model tagging system — the connector sets fidelity once, everything downstream
reads it. Self-check: assert an export of a set containing one `synthetic` object
either rejects or emits the WARNING manifest; assert render of `inferred` carries the marker.
→ build with slice 3 (needs real objects); the enum + default-synthetic goes in the ontology at slice 0 so nothing is ever built assuming `measured`.

---

## 14. Broadcast / entertainment mode — the payoff of §13, not a new build

Stadium live event, city festival, tourism flyover: forensic accuracy irrelevant,
smoothness everything. This is NOT a new generator — it's §13's render guard set to
`broadcast` context.

- **Allow `synthetic` frames in:** interpolate between sparse cameras, smooth the
  §4d splat, morph crossfades, fill occlusions with generative frames. Everything
  the evidentiary path forbids (R1–R3) is welcome here.
- **Same compositor, one flag:** `renderContext: 'evidentiary' | 'broadcast'`.
  Evidentiary → non-`measured` draws hatched + HUD label (§13.2). Broadcast →
  marker off, seamless output. NOT a second renderer.
- **Metadata still fires:** C2PA imprint runs regardless — the highlight reel
  silently carries which pixels were real vs interpolated. If it's ever
  subpoenaed, the provenance survives even though the on-screen marker was off.
- **Refusal registry still holds:** R1–R7 = "never *present* synthetic as real,"
  not "never generate." A `synthetic`-tagged flyover is fine; the tag just rides in
  metadata instead of on-screen.

This is why §13 was worth building: **one system serves the courtroom and the
jumbotron; the `fidelity` tag + render context are the only difference.**
`ponytail:` one enum value on the context flag — no broadcast subsystem. Self-check:
assert the same object renders marked in `evidentiary` and clean in `broadcast`, and
that C2PA fidelity is written in both.
→ build: trivial once §13 compositor exists (slice 3). Zero new pipeline.

---

## 15. Data-dump mining — net-new only (vs §8–§14)

Source: a second analysis of the same Bilawal channel + a 100+ sensor vision.
~90% overlaps §8–§14 (God's Eye, Maven, WiFi, 4D splats, hidden-3D, VPS — already
in). Only the genuinely new items below. Verified RuView is real: `ruvnet/RuView`
(WiFi CSI → presence **+ vital signs**, no camera).

### 15.1 New sensor modalities — maritime / air / population (NEW)
The municipal framing (§0–§14) is optical + RF + SAR. The dump adds three whole
sensor classes, each just another connector emitting `OntologyObject` — the
registry (slice 0) already models arbitrary feeds, so these are ingest-only work:
- **AIS** (ship transponders) → maritime tracks. `modality:'ais'`.
- **ADS-B** (aircraft transponders) → air tracks. `modality:'adsb'`.
- **Cell-tower / IMSI presence** → population density + movement. HARD §6 + legal gate — this is the most abusable feed in the whole system.
→ add: AIS/ADS-B connectors cheap at slice 3 (public feeds exist: aisstream, OpenSky). Cell = gated, tenant-legal-review-first.

### 15.2 Dark-vessel / dark-target detection — the killer cross-modal app (NEW)
The dump's one sharp idea: **object present in one modality, absent in the
transponder it should broadcast.** SAR/satellite shows a ship, no AIS ping =
"going dark" = the highest-value maritime-surveillance signal there is. Same for
ADS-B (aircraft with transponder off). This is §10.6 cross-modality-confirmation
run *inverted* — flag on DISagreement, not agreement. Nearly free once §15.1 +
§10.6 exist: one negated join.
→ add: `darkTarget()` = detections in {sar,sat,optical} with no matching {ais,adsb} in the same cell/time. Slice 3. Reuses everything.

### 15.3 Clock-sync / spatiotemporal alignment — the unnamed primitive (NEW, real gap)
The dump's "Week 2: UTC sync across sensors" exposed a hole: §5 retrace, §10.2
co-travel, and §15.2 dark-target ALL silently assume every feed shares a common
clock and coordinate frame. They don't — cameras drift, AIS lags, SAR is
timestamped at downlink not capture. Without one normalization layer, every
cross-sensor join is subtly wrong.
`ponytail:` normalize to UTC + a single CRS at ingest, in the connector, once —
not per-query. Store both raw-device-time and normalized-time (drift is evidence).
Ceiling: sub-second sync needs per-sensor offset calibration (the hardware knob) — leave the offset field, don't hardcode 0.
→ add to the feed-registry contract at slice 0 (it's a field + a normalize step, not a subsystem). This is the one item here that belongs EARLY.

### 15.4 RuView as the §8.7 reference implementation (update, not new)
§8.7 (RF-presence) now has a concrete open-source base: `ruvnet/RuView` (CSI →
presence/vital-signs on commodity WiFi/ESP32). Vital-sign detection (breathing/
heartbeat through walls) is a net-new *capability* but a MASSIVE legal ceiling —
medical + through-wall private-space sensing. Detection-only, hardest §6 gate, and
it never implies identity.
→ reference RuView when §8.7 is built (slice 3). Vital-signs behind an explicit separate authorization, not on by default.

### 15.5 Dump slop — rung-1 rejected
- **"Process remaining 177+ videos":** diminishing returns, the channel's ARGUS-
  relevant content is already extracted. Skip unless a specific topic is named.
- **Generic Week 1–4 plan / "set up gsplat CUDA":** premature — still no slice 0.
  Build order stays §7, not a parallel plan.
- **Unverified `/tmp/*.md` artifacts:** another machine's files, not evidence here.
  Ignored.

---

## 16. Inverse tenant — oversight / crowd-sourced (IPOA, activists, press)

Tenant = oversight bodies + the public; **watched party = police**. Flips §6's
trust model again but changes almost no code — it's the existing pipeline pointed
the other way. Scenario: a demonstration, media houses upload raw video, thousands
of demonstrators live-stream via the ARGUS app; later, trace every shooting.

### 16.1 Crowd-as-sensor-grid ingest (NEW — the only real new work)
Thousands of ARGUS-app phones = thousands of moving cameras. Phone GPS is useless
in a dense crowd (urban canyon + bodies) → each stream localizes by **VPS (§9.6)**
against the base plate for cm-pose. This is why §9.6 was promoted to a shared
service — the crowd is unusable without it. Media uploads = same registration,
higher `measured` weight. Everything normalizes to one clock/CRS at ingest (§15.3)
or ten phones filming one shot can't be cross-referenced.
`ponytail:` reuse the feed-registry + VPS + §15.3; the connector is just "app/upload
→ OntologyObject." Ceiling: adversarial/spoofed streams — require app attestation +
cross-confirm (§10.6), tag unverified uploads `fidelity` lower, never `measured`.
→ add: app-ingest connector at slice 3. NO new fusion/retrace — those already exist.

### 16.2 Shooting trace = event localization, crowd fills the gaps
A shooting is multi-camera event localization; crowd DENSITY is the superpower:
1. **Detect** — gunshot audio (§12.1) from many phones + optical muzzle-flash.
2. **Triangulate** — mics at now-known VPS positions → shot origin (§10.8 acoustic,
   finally cheap because the crowd IS the mic array).
3. **Localize 3D** — back-project every camera that saw the cell onto the base →
   position + direction + probable shooter, each with `ConfidenceEnvelope`.
4. **Retrace both ways (§5)** — rewind origin (§5b), forward-track victim + shooter.
   Overlapping phones FILL the coverage gaps that break a CCTV-only track (§5c).
5. **Cross-confirm (§10.6)** — flash without audio (or vice-versa) flagged, not asserted.
6. **Package (§10.4 + §13)** — chain-of-custody bundle: clips + per-hop lineage +
   hashes + C2PA `measured`/`inferred` marks. That bundle IS the oversight product.
→ zero new capability; it's §5+§9.6+§10+§12+§13+§15.3 aimed at police conduct.

### 16.3 Inversion-specific hardening (NOT lazy-skippable)
Watching the powerful means the powerful attack the system:
- **Tamper-evidence is mandatory, not optional:** §13 C2PA + §10.4 hashing become
  the core feature — a bundle that can be discredited is worthless in a brutality case.
- **Source protection:** demonstrator identities in streams are at risk. Default
  anonymize contributors; §8.6 two-step unmask, but here it protects the *crowd*, not targets.
- **Availability under pressure:** the tenant that most needs it is the one whose
  feed may be jammed/seized. `ponytail:` app buffers + delayed upload so a seized
  phone already streamed; DDIL edge model (§11.1) applies. Ceiling: can't beat total comms blackout — degrade, timestamp, resync.

### 16.4 Cross-crowd vehicle association — threading one car through disjoint crowds
Case: a car seen by 4 non-overlapping crowds across a city over 8h (Kilimani →
Central → Kangemi → Kikuyu). Nothing spatially connects the clusters — pure
cross-cluster re-ID (§9.1 `stableId`). Works because it's a CAR: plate (§3 GSD
permitting) → near-certain; make/model/color + dents/stickers → fingerprint that
survives disjoint feeds. Each sighting = independent `OntologyObject`; §9.1 merges
to one `stableId` = chain of `OntologyLink`s. Disjoint crowds need no spatial
continuity — re-ID associates on appearance, which is exactly why §9.1 is the
spine under §5.
Ceilings (these ARE the deliverable):
- No coverage between sightings → route `inferred`, never fabricated.
- Plate unreadable → make/model/color → probabilistic, confidence surfaced.
- Two similar cars → §10.6 forces corroboration before merge; ambiguous = flagged, NOT silently joined.
- "Abducting" = inference from behavior → report observables + clips, tag interpretation `inferred`, leave the legal call to humans.
The 8h report = confidence-scored timeline (§5c): localized events + tracklets,
each `measured`/`inferred` (§13), explicit gaps. Accurate BECAUSE it marks the
unknowns. → zero new capability: §9.1 + §5 + §10.2 + §10.6 + §13, crowd-fed.
