# Neo4j Storage Engine Patterns for ARGUS TypeScript In-Memory Graph

## Executive Summary

Researched 15+ source files from Neo4j's GitHub repo (dev branch) across the record-storage-engine, kernel, common, graphdb-api, cypher, and kernel-api modules. Extracted 10 patterns directly applicable to a TypeScript in-memory graph store. Patterns are ranked by expected impact.

---

## Pattern 1: Store Separation by Entity Type

**Neo4j classes:** `NodeStore`, `RelationshipStore`, `PropertyStore`, `RelationshipTypeTokenStore`, `PropertyKeyTokenStore` (all extend `CommonAbstractStore<RECORD, HEADER>`)

**How it works in Neo4j:** Each entity type has its own dedicated store class, all sharing a common base. `NodeStore` manages `NodeRecord` instances, `RelationshipStore` manages `RelationshipRecord` instances, etc. Each store owns its own PageCache cursors, ID generators, and record formats. The `TokenStore<RECORD>` abstraction is shared by `RelationshipTypeTokenStore` and `PropertyKeyTokenStore` — both store token records (id + name reference) but with different `CursorType` and `IdType` configurations. This means token-specific logic lives in one place while each store handles its own storage mechanics.

**Apply to ARGUS:** Separate `NodeStore`, `RelationshipStore`, `PropertyStore` classes, each with typed maps (`Map<NodeId, NodeRecord>`). Share a common `BaseStore` with ID generation. Use a `TokenStore<T>` generic for both relationship-type and property-key token registries. The key insight is that the *registry* of tokens (string→id mapping) is separate from the *storage* of entities that reference those tokens.

**Expected benefit:** Clean optimization per entity type; no monolithic graph class. 30-50% less code than a unified store. Token deduplication means relationship type strings stored once, not repeated per edge.

---

## Pattern 2: Inline Label/Token Bit Packing

**Neo4j classes:** `InlineNodeLabels`, `NodeLabelsField`, `LabelIdArray`

**How it works in Neo4j:** Up to 7 label IDs are packed directly into the `long labelField` of a NodeRecord using variable bits-per-label (36 bits / count). The high bit is reserved as a header flag. If labels fit in the inline format, no dynamic records are allocated — the node is self-contained. `tryInlineInNodeRecord()` returns false for >7 labels or when label IDs exceed the per-label bit budget, falling back to `DynamicNodeLabels`. `LabelIdArray.concatAndSort()` and `filter()` operate on sorted `long[]` arrays for O(log n) lookup via binary search.

**Apply to ARGUS:** For nodes with ≤7 labels, pack label IDs into a single bigint or a fixed-size `Uint32Array(8)` embedded directly in the node object. Use a `labels: Uint32Array | null` field — null means inline, non-null means overflow. This eliminates the separate labels array allocation for the vast majority of nodes. Use `Set<number>` for the overflow case but keep the common case allocation-free.

**Expected benefit:** 40-60% memory reduction for nodes with few labels. Zero-allocation label checks for the common case. Faster traversal — label filtering happens without an array allocation.

---

## Pattern 3: Light/Heavy Lazy Loading

**Neo4j classes:** `NodeRecord.isLight()`, `NodeStore.ensureHeavy()`, `DynamicNodeLabels.get()`

**How it works in Neo4j:** `NodeRecord` has a boolean `isLight` flag. When a node is first read from disk, only the core fields are populated (`nextRel`, `labels`, `nextProp`). The dynamic label records are not loaded — `isLight = true`. When `ensureHeavy()` is called, the store follows the dynamic record chain and populates `dynamicLabelRecords`. The `DynamicNodeLabels.get()` method checks `node.isLight()` and triggers `ensureHeavy()` only if needed. The `hasLabel()` method can even short-circuit by streaming records without materializing them all.

**Apply to ARGUS:** Nodes start as "light" — only `id`, `nextRelId`, `firstRelId`, `labels` (inline), and `firstPropId`. Property records and overflow label arrays are loaded on first access via `ensureHeavy()`. Use a `loaded: boolean` flag. For traversal queries that only need labels and relationship pointers, skip loading property data entirely.

**Expected benefit:** 3-5x faster traversal for queries that don't need properties. Memory proportional to what the query actually touches. Prevents the "SELECT *" problem where you load everything just to check one field.

---

## Pattern 4: Doubly-Linked Relationship Chains (Both Directions)

**Neo4j classes:** `RelationshipRecord.firstPrevRel`, `firstNextRel`, `secondPrevRel`, `secondNextRel`, `firstInFirstChain`, `firstInSecondChain`

**How it works in Neo4j:** Each `RelationshipRecord` stores TWO independent doubly-linked lists — one for the first node (`firstPrevRel`/`firstNextRel`) and one for the second node (`secondPrevRel`/`secondNextRel`). This means traversing outgoing edges from either endpoint is O(1) per hop — no scan required. The `firstInFirstChain`/`firstInSecondChain` booleans mark whether this relationship is the first in each chain, enabling O(1) chain-head detection. The relationship store doesn't need a separate "relationship chain head" index — each node just points to its first relationship, and the chain is walked via next/prev pointers.

**Apply to ARGUS:** Each edge stores `{fromNode, toNode, fromPrevRel, fromNextRel, toPrevRel, toNextRel, type, firstPropId, inUse}`. Each node stores `{id, firstRelId, firstPropId, labels}`. Traversing outgoing edges from a node: start at `firstRelId`, follow `fromNextRel` if the node is the source, or `toNextRel` if the node is the target. This gives O(1) per-hop traversal with no index lookups.

**Expected benefit:** The single biggest performance win for graph traversal. Eliminates the need for an adjacency list or separate edge index. O(k) traversal of k edges from a node vs O(E) scan.

---

## Pattern 5: Property Block with Lazy Parsing

**Neo4j classes:** `PropertyRecord.blocks[]`, `PropertyRecord.blockRecords[]`, `PropertyRecord.blocksLoaded`, `PropertyRecord.ensureBlocksLoaded()`

**How it works in Neo4j:** `PropertyRecord` stores raw property data as `long[] blocks` — a fixed-size array of 64-bit values. The `PropertyBlock[]` array (heavier objects with key index, type info, value references) is only populated when `ensureBlocksLoaded()` is called. The `blocksLoaded` flag controls this. When just scanning property chains (e.g., to find a specific property key), the cursor can read raw `long[]` blocks without constructing `PropertyBlock` objects. Only when property values are actually accessed are the blocks parsed into typed `PropertyBlock` instances.

**Apply to ARGUS:** Store property data as `Float64Array` or `bigint[]` (raw bytes). Parse property keys and values lazily when accessed. For queries that just check existence or count properties, skip parsing entirely. Use a `parsed: boolean` flag.

**Expected benefit:** 2-3x faster property chain scanning. Avoids GC pressure from short-lived property objects during traversals. Memory savings proportional to how many properties you touch vs. how many exist.

---

## Pattern 6: PropertyType Enum with Embedded Decoder

**Neo4j classes:** `PropertyType` (enum), each constant overrides `value(PropertyBlock, PropertyStore, StoreCursors)`, `readDynamicRecordHeader(byte[])`, `calculateNumberOfBlocksUsed(long)`

**How it works in Neo4j:** `PropertyType` is an enum where each type (BOOL, INT, LONG, STRING, ARRAY, etc.) has its own `value()` implementation that knows how to decode a `PropertyBlock` into a `Value`. `LONG` even has inlining — small longs fit in a single block with a flag bit. `STRING` delegates to the store's `DynamicStringStore` for text values. `ARRAY` reads the array element type from the first byte of the dynamic record header and dispatches accordingly. This avoids instanceof chains and switch statements in hot paths.

**Apply to ARGUS:** Use a `PropertyType` enum with a `decode(block: bigint, store: PropertyStore): PropertyValue` method per type. Small integers can be inlined into a single bigint with a type tag bit. Strings use a shared `StringStore`. Arrays use `Uint32Array` views. Dispatch on type via a function lookup table rather than switch/if-else chains.

**Expected benefit:** 20-30% faster property decoding. Cleaner code — each type's logic is self-contained. Easy to add new property types.

---

## Pattern 7: Cursor-Based Traversal (BFS Pruning)

**Neo4j classes:** `BFSPruningVarExpandCursor`, `RawCursor<T, EXCEPTION>`, `IOCursor<T>`, `StoreCursors`

**How it works in Neo4j:** `RawCursor<T, EXCEPTION>` is a minimal interface: `next()`, `close()`, `get()`, plus a default `forAll()` method. `IOCursor<T>` extends it with typed `IOException`. `BFSPruningVarExpandCursor` implements BFS traversal as a cursor — `next()` advances to the next matching node. It accepts `LongPredicate` node filter and `Predicate<RelationshipTraversalCursor>` rel filter. The cursor uses `HeapTrackingLongHashSet` for visited-node dedup and `HeapTrackingArrayDeque` for the BFS queue. Crucially, it's lazy — only computes the next match when `next()` is called, enabling early termination.

**Apply to ARGUS:** Implement a `RawCursor<T>` interface with `next(): boolean`, `close(): void`, `get(): T`. Create a `BFSPruningCursor` that accepts node/rel predicates and max depth. Use a `Set<number>` for visited dedup. Use an array-based BFS queue. This enables pipeline-able traversal — `for await (const node of bfsCursor) { ... }` with early termination.

**Expected benefit:** Lazy evaluation enables pipelining — no need to materialize the full result set. Early termination saves work. Composable filters enable complex traversals without building intermediate data structures.

---

## Pattern 8: Immutable Traversal Description Builder

**Neo4j classes:** `TraversalDescription` (interface), `MonoDirectionalTraversalDescription`, `BidirectionalTraversalDescription`

**How it works in Neo4j:** `TraversalDescription` is an immutable builder. Every configuration method (`uniqueness()`, `evaluator()`, `order()`, `depthFirst()`, `breadthFirst()`, `relationships()`) returns a **new** `TraversalDescription` instance. The internal `MonoDirectionalTraversalDescription` stores all config as `final` fields. `traverse(Node)` creates a `Traverser` (cursor) from the accumulated config. `MultiEvaluator` chains multiple `PathEvaluator` instances. `BranchOrderingPolicies` is a factory for BFS/DFS branch selectors. The result is a type-safe, composable query plan that can be cached and replayed.

**Apply to ARGUS:** Create an immutable `TraversalDescription` class where each method returns a new instance. Store `evaluators: PathEvaluator[]`, `uniqueness: UniquenessFilter`, `branchOrder: 'bfs' | 'dfs'`, `maxDepth: number`, `relTypes: Set<number>`. The `traverse(startNode)` method returns a `Traverser` (async generator or cursor). Use a `MultiEvaluator` that chains predicates. This enables query plan caching and reuse.

**Expected benefit:** Type-safe composable traversals. Query plans can be cached and reused across executions. Clean separation of traversal logic from execution.

---

## Pattern 9: Index Lifecycle State Machine with Proxy

**Neo4j classes:** `IndexProxy`, `OnlineIndexProxy`, `PopulatingIndexProxy`, `ContractCheckingIndexProxy`, `IndexPopulator`

**How it works in Neo4j:** `IndexProxy` is a state machine wrapping index access. It goes through states: `POPULATING` → `ONLINE` → `FAILED`. `PopulatingIndexProxy` wraps an `IndexPopulator` for initial data load; `OnlineIndexProxy` wraps an `IndexAccessor` for normal reads. `ContractCheckingIndexProxy` sits on top and enforces valid state transitions (e.g., can't call `newUpdater()` before `start()`). `FlippableIndexProxy` handles the atomic flip from POPULATING to ONLINE. This means index state transitions are checked at runtime and the proxy enforces correctness.

**Apply to ARGUS:** Create an `IndexProxy` class for each index that tracks state: `POPULATING`, `ONLINE`, `FAILED`. The proxy guards operations based on state. Use a `TokenIndex` for relationship-type lookups and a `ValueIndex` for property value lookups. The proxy pattern means you can swap implementations (e.g., hash map vs. sorted array) without changing callers.

**Expected benefit:** Index state safety. Clean abstraction for different index implementations. Easy to add full-text or composite indexes later.

---

## Pattern 10: Token Registry (String↔Integer Mapping)

**Neo4j classes:** `TokenStore<RECORD>`, `RelationshipTypeTokenStore`, `PropertyKeyTokenStore`, `DynamicStringStore`, `NamedToken`

**How it works in Neo4j:** `TokenStore<RECORD>` manages a registry mapping integer IDs to token names (strings). It stores the integer→record mapping in a fixed-size store and the actual string names in a `DynamicStringStore` (a separate dynamic-record-based string storage). When you look up "KNOWS", it returns the integer ID. When you need the name, it fetches from the string store. Both `RelationshipTypeTokenStore` and `PropertyKeyTokenStore` inherit from `TokenStore` and share all this logic — they only differ in `IdType` and `CursorType`.

**Apply to ARGUS:** Create a `TokenRegistry` class that maps `string → number` and `number → string` for relationship types and property keys. Use a `Map<string, number>` and `Map<number, string>` pair. The registry assigns auto-incrementing integer IDs on first use. Entity records store only integer IDs, not strings. This is the single most impactful pattern for memory reduction — relationship type "COMMUNICATES_WITH" stored once as integer 3, not as a 20-byte string on every edge.

**Expected benefit:** 60-80% memory reduction for relationship types and property keys. Faster equality checks (integer compare vs. string compare). Integer IDs are cache-friendly.

---

## Implementation Priority for ARGUS

| Priority | Pattern | Effort | Impact |
|----------|---------|--------|--------|
| P0 | #4 Doubly-Linked Relationship Chains | Medium | **Critical** — enables O(1) traversal |
| P0 | #10 Token Registry | Low | **High** — 60-80% memory reduction |
| P0 | #1 Store Separation | Medium | **High** — clean architecture |
| P1 | #2 Inline Label Bit Packing | Low | Medium — 40-60% node memory |
| P1 | #6 PropertyType Decoder | Low | Medium — 20-30% faster decode |
| P1 | #7 BFS Pruning Cursor | Medium | Medium — pipelining/lazy eval |
| P2 | #3 Light/Heavy Lazy Load | Medium | Medium — proportional memory |
| P2 | #5 Lazy Property Blocks | Medium | Medium — 2-3x scan speed |
| P2 | #8 Immutable Traversal Builder | Low | Medium — type safety/composition |
| P3 | #9 Index Proxy State Machine | Low | Low (initially) — safety/extensibility |

---

## Key Insight

The most important structural insight from Neo4j is that **graph topology (nodes + edges) is completely separate from properties**. This means:
- Traversing the graph never touches property data
- Property data is a separate linked list hanging off each node/edge
- The traversal hot path is just: follow pointer → check type → follow next pointer
- Property lookups are O(degree of property chain), not O(total properties)

For ARGUS, this means the hot path for `MATCH (n)-[:KNOWS]->(m)` should never allocate objects, never parse property strings, and never do anything except follow integer pointers and compare type IDs. This is what makes Neo4j fast — not any single optimization, but the disciplined separation of topology from data.