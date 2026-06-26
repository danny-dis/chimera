# Tool Context Relay

Out-of-band payload management for large tool outputs. Instead of putting massive results into the context window, box them in the relay store and pass a compact reference.

## When to Use

Use tool context relay when:
- A tool produces output larger than 2,000 characters
- The output is needed later but not immediately
- You want to keep context window usage low
- Multiple agents need to access the same large payload

Do NOT use when:
- The output is under 2,000 characters (inline is fine)
- The output is needed immediately in the next LLM call
- The output is ephemeral and won't be referenced again

## How It Works

1. **Box** — Store the large payload in the relay store, get back a compact reference
2. **Pass** — Put the reference (not the payload) into the context
3. **Unbox** — When needed, resolve the reference to the full payload
4. **Slice** — Read just a portion of the payload without loading all of it

## Boxing and Unboxing

```typescript
import { ToolContextRelay } from '@chimera/context';

const relay = new ToolContextRelay();

// Box a large tool output
const largeOutput = await runExpensiveCommand(); // 50,000 chars
const ref = relay.box(largeOutput, {
  ttlMs: 60 * 60 * 1000, // expires in 1 hour
  metadata: { tool: 'git-diff', branch: 'main' },
});

// ref.ref === "internal://relay-1716873000000-0"
// Just 38 characters instead of 50,000

// Pass the reference in context
const contextMessage = `The git diff is stored at ${ref.ref}. Refer to it as needed.`;

// Later, unbox when needed
const fullOutput = relay.unbox(ref);
// fullOutput === the original 50,000 char string
```

## Reference Format

Relay references use a custom URI scheme:

```
internal://relay-{timestamp}-{counter}
```

- `internal://` — prefix indicating an in-memory reference
- `relay-` — type identifier
- `{timestamp}` — millisecond timestamp of creation
- `{counter}` — monotonic counter for uniqueness within a timestamp

```typescript
// Check if a string is a relay reference
relay.isRelayReference('internal://relay-1716873000000-0'); // true
relay.isRelayReference('https://example.com');               // false

// Extract all relay references from a text block
const text = `Results stored at internal://relay-1716873000000-0 and
internal://relay-1716873000001-1`;
const refs = relay.extractReferences(text);
// [{ ref: "internal://relay-..." }, { ref: "internal://relay-..." }]
```

## Slice Reads

Read only the portion of a boxed payload you need:

```typescript
const ref = relay.box('First line\nSecond line\nThird line\nFourth line');

// Read characters 0–20
const slice = relay.readSlice(ref, 0, 20);
// "First line\nSecond l"

// Read from offset to end
const tail = relay.readSlice(ref, 30);
// "rd line\nFourth line"

// Useful for reading specific sections of large files
const fileRef = relay.box(hugeFileContent);
const header = relay.readSlice(fileRef, 0, 500); // first 500 chars
const footer = relay.readSlice(fileRef, -200);    // last 200 chars
```

## TTL-Based Cleanup

Every payload has a time-to-live. Expired payloads are automatically cleaned up.

```typescript
const relay = new ToolContextRelay({
  defaultTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxStoreSize: 1000,                  // max payloads in store
  boxThreshold: 2000,                  // minimum size to box
});

// Payload with custom TTL
const ref = relay.box(data, { ttlMs: 5 * 60 * 1000 }); // 5 minutes

// Manual cleanup (runs automatically every 5 minutes)
const removed = relay.cleanup();
console.log(`Removed ${removed} expired payloads`);

// Check store stats
const stats = relay.getStats();
// { totalPayloads: 42, totalTokens: 15000, oldestAge: 120000 }
```

**Eviction:** When the store reaches `maxStoreSize`, the oldest payload is evicted to make room.

## Inline vs. Relay Decision

```
Is output > 2000 chars?
├─ No → Inline (put directly in context)
└─ Yes → Is it needed immediately?
   ├─ Yes → Inline (use context budget to make room)
   └─ No → Relay (box it, pass reference)
```

| Metric | Inline | Relay |
|--------|--------|-------|
| Token cost in context | Full size | ~10 tokens (reference) |
| Access speed | Immediate | Requires unbox call |
| Persistence | Lives in context | TTL-based expiry |
| Cross-agent sharing | Copy required | Same reference works |

## Resolving References in Text

Automatically resolve all relay references in a text block:

```typescript
const text = `Analysis complete. Full report at internal://relay-1716873000000-0`;
const resolved = relay.resolveReferences(text);
// "Analysis complete. Full report at {the actual 50,000 char report}"
```

## Cleanup and Destruction

```typescript
// Remove expired payloads
relay.cleanup();

// Destroy everything (call on session end)
relay.destroy();
// Clears store, stops cleanup interval
```

## Quick Reference

| Method | Purpose |
|--------|---------|
| `box(data, options?)` | Store payload, return reference |
| `unbox(ref)` | Resolve reference to full payload |
| `readSlice(ref, start, end?)` | Read a portion of the payload |
| `isRelayReference(value)` | Check if string is a relay reference |
| `extractReferences(text)` | Find all relay references in text |
| `resolveReferences(text)` | Replace all references with content |
| `cleanup()` | Remove expired payloads, returns count |
| `getStats()` | Store size, token count, oldest age |
| `destroy()` | Clear store and stop background tasks |

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `defaultTtlMs` | 86,400,000 (24h) | Default payload expiry |
| `maxStoreSize` | 1,000 | Maximum stored payloads |
| `boxThreshold` | 2,000 | Minimum chars to trigger boxing |
