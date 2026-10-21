# STORM Agent Improvement Plan — BBOT-Inspired Recon Engine

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Transform STORM from a hardcoded query-template orchestrator into a real recursive recon engine with event-driven modules, actual data sources, and adaptive OPSEC — inspired by BBOT's architecture.

**Architecture:** STORM becomes a recursive, event-driven recon orchestrator. A central event bus connects typed modules (subdomain-enum, port-scan, web-recon, cloud-enum, email-enum). Each module emits typed events that feed into other modules recursively. STORM's planner reads the event stream to build dynamic mission plans instead of hardcoded phase templates. OPSEC becomes adaptive — monitoring target response (rate limits, honeypots, WAF detection) and adjusting scan velocity in real time.

**Tech Stack:** TypeScript (existing), event bus (new), BBOT-style module interface (new), injectable fetchers (existing pattern), vitest (existing).

---

## Current State Audit

### What STORM has today
- `stormAgent.ts` (657 lines) — pure-logic orchestrator, no IO
- `decompose.ts` (123 lines) — static keyword-matching query generator
- `opsec.ts` (94 lines) — static config (silent/baloud/loud), no adaptation
- `delegate.ts` (350 lines) — agent-to-agent delegation with circular-delegation prevention
- `stormAgent.selfcheck.ts` (337 lines) — 289-line test file with mock facets

### Critical gaps (verified against code)
1. **No real data sources** — `decompose()` returns hardcoded strings like "What attack surface does this target expose?" — no actual subdomain enumeration, port scanning, or web recon
2. **Static decomposition** — query generation is `if/else` on objective keywords, not dynamic based on target intelligence
3. **No event bus** — modules can't communicate; STORM delegates to Sentinel/Shield but gets no structured findings back
4. **Primitive learning** — epsilon-greedy over 3 hardcoded strategies; no feature extraction from outcomes
5. **No recursive discovery** — findings don't feed back into new queries (BBOT's core strength)
6. **OPSEC is static** — config doesn't adapt to target behavior (rate limits, honeypot hits, WAF blocks)
7. **No module system** — can't plug in new recon capabilities without modifying STORM core

---

## Phase 1: Event-Driven Module Architecture

### Task 1: Define the Event Bus and Module Interface

**Objective:** Create the typed event system that all recon modules emit/consume.

**Files:**
- Create: `packages/agents/src/agents/storm-events.ts`
- Create: `packages/agents/src/agents/storm-module.ts`
- Test: `packages/agents/src/agents/__tests__/storm-events.test.ts`

**Step 1: Write failing test**

```typescript
// storm-events.test.ts
import { describe, it, expect } from 'vitest';
import { StormEventBus, createStormEventBus } from '../storm-events';
import type { StormEvent, StormEventType } from '../storm-events';

describe('StormEventBus', () => {
  it('should subscribe and emit typed events', () => {
    const bus = createStormEventBus();
    const received: StormEvent[] = [];
    bus.on('DNS_NAME', (e) => received.push(e));
    bus.emit({ type: 'DNS_NAME', data: 'evilcorp.com', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 });
    expect(received).toHaveLength(1);
    expect(received[0].data).toBe('evilcorp.com');
  });

  it('should not receive unsubscribed events', () => {
    const bus = createStormEventBus();
    const received: StormEvent[] = [];
    const unsub = bus.on('DNS_NAME', (e) => received.push(e));
    unsub();
    bus.emit({ type: 'DNS_NAME', data: 'evilcorp.com', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 });
    expect(received).toHaveLength(0);
  });

  it('should support wildcard subscription', () => {
    const bus = createStormEventBus();
    const received: StormEvent[] = [];
    bus.on('*', (e) => received.push(e));
    bus.emit({ type: 'DNS_NAME', data: 'evilcorp.com', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 });
    bus.emit({ type: 'OPEN_TCP_PORT', data: '1.2.3.4:443', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 });
    expect(received).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-events.test.ts -v`
Expected: FAIL — "cannot find module storm-events"

**Step 3: Implement storm-events.ts**

```typescript
// storm-events.ts
export type StormEventType =
  | 'DNS_NAME'
  | 'IP_ADDRESS'
  | 'IP_RANGE'
  | 'OPEN_TCP_PORT'
  | 'URL'
  | 'HTTP_RESPONSE'
  | 'TECHNOLOGY'
  | 'EMAIL'
  | 'SUBDOMAIN'
  | 'CLOUD_BUCKET'
  | 'VULNERABILITY'
  | 'FINDING'
  | 'ERROR';

export interface StormEvent {
  type: StormEventType;
  data: string;
  source: string;       // module ID that emitted it
  timestamp: string;    // ISO-8601
  confidence: number;   // 0..1
  metadata?: Record<string, unknown>;
}

export type StormEventHandler = (event: StormEvent) => void;

export interface StormEventBus {
  on(type: StormEventType | '*', handler: StormEventHandler): () => void;
  emit(event: StormEvent): void;
  getHistory(): StormEvent[];
  clearHistory(): void;
}

export function createStormEventBus(): StormEventBus {
  const handlers = new Map<StormEventType | '*', Set<StormEventHandler>>();
  const history: StormEvent[] = [];

  return {
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    emit(event) {
      history.push(event);
      handlers.get('*')?.forEach(h => h(event));
      handlers.get(event.type)?.forEach(h => h(event));
    },
    getHistory() { return [...history]; },
    clearHistory() { history.length = 0; },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-events.test.ts -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/storm-events.ts packages/agents/src/agents/__tests__/storm-events.test.ts
git commit -m "feat(storm): add typed event bus for recon module communication"
```

---

### Task 2: Define the Module Interface

**Objective:** Create the base interface that all recon modules implement (BBOT-style).

**Files:**
- Create: `packages/agents/src/agents/storm-module.ts`
- Test: `packages/agents/src/agents/__tests__/storm-module.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createReconModule } from '../storm-module';
import type { StormModule, StormModuleContext } from '../storm-module';

describe('StormModule interface', () => {
  it('should define required module properties', () => {
    const mod: StormModule = {
      id: 'test-module',
      name: 'Test Module',
      flags: ['passive', 'safe'],
      watchedEvents: ['DNS_NAME'],
      producedEvents: ['SUBDOMAIN'],
      async handleEvent(event, ctx) {
        ctx.emit({ type: 'SUBDOMAIN', data: `sub.${event.data}`, source: 'test-module', timestamp: '2026-01-01T00:00:00Z', confidence: 0.9 });
      },
    };
    expect(mod.id).toBe('test-module');
    expect(mod.watchedEvents).toContain('DNS_NAME');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-module.test.ts -v`
Expected: FAIL

**Step 3: Implement storm-module.ts**

```typescript
// storm-module.ts
import type { StormEvent, StormEventBus } from './storm-events';

export type ModuleFlag = 'passive' | 'active' | 'aggressive' | 'safe' | 'deadly';

export interface StormModuleContext {
  emit(event: StormEvent): void;
  bus: StormEventBus;
  config: Record<string, unknown>;
}

export interface StormModule {
  id: string;
  name: string;
  description: string;
  flags: ModuleFlag[];
  watchedEvents: string[];
  producedEvents: string[];
  handleEvent(event: StormEvent, ctx: StormModuleContext): Promise<void>;
  // Optional: batch processing for efficiency
  handleBatch?(events: StormEvent[], ctx: StormModuleContext): Promise<void>;
}

export interface StormModuleRegistry {
  modules: Map<string, StormModule>;
  register(mod: StormModule): void;
  unregister(id: string): void;
  get(id: string): StormModule | undefined;
  getByEventType(type: string): StormModule[];
  list(): StormModule[];
}

export function createModuleRegistry(): StormModuleRegistry {
  const modules = new Map<string, StormModule>();
  return {
    modules,
    register(mod) { modules.set(mod.id, mod); },
    unregister(id) { modules.delete(id); },
    get(id) { return modules.get(id); },
    getByEventType(type) {
      return Array.from(modules.values()).filter(m => m.watchedEvents.includes(type));
    },
    list() { return Array.from(modules.values()); },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-module.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/storm-module.ts packages/agents/src/agents/__tests__/storm-module.test.ts
git commit -m "feat(storm): add module interface and registry for recon plugins"
```

---

## Phase 2: Core Recon Modules

### Task 3: Subdomain Enumeration Module (Passive)

**Objective:** Implement a real subdomain enumeration module using passive DNS sources.

**Files:**
- Create: `packages/agents/src/agents/modules/subdomain-enum.ts`
- Test: `packages/agents/src/agents/__tests__/modules/subdomain-enum.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createSubdomainEnumModule } from '../modules/subdomain-enum';
import { createStormEventBus } from '../storm-events';
import { createModuleRegistry } from '../storm-module';

describe('subdomain-enum module', () => {
  it('should emit SUBDOMAIN events from DNS_NAME input', async () => {
    const bus = createStormEventBus();
    const mod = createSubdomainEnumModule({
      fetcher: async (domain) => ({
        subdomains: ['www', 'mail', 'api', 'dev'],
      }),
    });
    const events: any[] = [];
    bus.on('*', e => events.push(e));

    await mod.handleEvent(
      { type: 'DNS_NAME', data: 'evilcorp.com', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 },
      { emit: (e) => bus.emit(e), bus, config: {} }
    );

    const subdomains = events.filter(e => e.type === 'SUBDOMAIN');
    expect(subdomains).toHaveLength(4);
    expect(subdomains[0].data).toBe('www.evilcorp.com');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/modules/subdomain-enum.test.ts -v`
Expected: FAIL

**Step 3: Implement subdomain-enum.ts**

```typescript
// modules/subdomain-enum.ts
import type { StormModule, StormModuleContext } from '../storm-module';
import type { StormEvent } from '../storm-events';

export interface SubdomainFetcher {
  (domain: string): Promise<{ subdomains: string[] }>;
}

export interface SubdomainEnumConfig {
  fetcher: SubdomainFetcher;
}

export function createSubdomainEnumModule(config: SubdomainEnumConfig): StormModule {
  return {
    id: 'subdomain-enum',
    name: 'Subdomain Enumerator',
    description: 'Passive subdomain enumeration via DNS APIs and brute-force',
    flags: ['passive', 'safe'],
    watchedEvents: ['DNS_NAME', 'SUBDOMAIN'],
    producedEvents: ['SUBDOMAIN', 'DNS_NAME', 'IP_ADDRESS'],

    async handleEvent(event, ctx) {
      if (event.type !== 'DNS_NAME' && event.type !== 'SUBDOMAIN') return;

      const domain = event.type === 'SUBDOMAIN'
        ? event.data.split('.').slice(-2).join('.') // extract root domain
        : event.data;

      try {
        const result = await config.fetcher(domain);
        for (const sub of result.subdomains) {
          const fqdn = `${sub}.${domain}`;
          ctx.emit({
            type: 'SUBDOMAIN',
            data: fqdn,
            source: 'subdomain-enum',
            timestamp: new Date().toISOString(),
            confidence: 0.85,
            metadata: { parentDomain: domain },
          });
        }
      } catch (err) {
        ctx.emit({
          type: 'ERROR',
          data: `subdomain-enum failed for ${domain}: ${err}`,
          source: 'subdomain-enum',
          timestamp: new Date().toISOString(),
          confidence: 1.0,
        });
      }
    },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/modules/subdomain-enum.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/modules/subdomain-enum.ts packages/agents/src/agents/__tests__/modules/subdomain-enum.test.ts
git commit -m "feat(storm): add passive subdomain enumeration module"
```

---

### Task 4: Port Scan Module

**Objective:** Implement a port scan module that consumes DNS_NAME/IP_ADDRESS and emits OPEN_TCP_PORT.

**Files:**
- Create: `packages/agents/src/agents/modules/port-scan.ts`
- Test: `packages/agents/src/agents/__tests__/modules/port-scan.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createPortScanModule } from '../modules/port-scan';
import { createStormEventBus } from '../storm-events';

describe('port-scan module', () => {
  it('should emit OPEN_TCP_PORT events from DNS_NAME input', async () => {
    const bus = createStormEventBus();
    const mod = createPortScanModule({
      scanner: async (target) => ({
        ports: [80, 443, 8080],
      }),
    });
    const events: any[] = [];
    bus.on('*', e => events.push(e));

    await mod.handleEvent(
      { type: 'DNS_NAME', data: 'evilcorp.com', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 },
      { emit: (e) => bus.emit(e), bus, config: {} }
    );

    const ports = events.filter(e => e.type === 'OPEN_TCP_PORT');
    expect(ports).toHaveLength(3);
    expect(ports[0].data).toBe('evilcorp.com:80');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/modules/port-scan.test.ts -v`
Expected: FAIL

**Step 3: Implement port-scan.ts**

```typescript
// modules/port-scan.ts
import type { StormModule, StormModuleContext } from '../storm-module';
import type { StormEvent } from '../storm-events';

export interface PortScanner {
  (target: string): Promise<{ ports: number[] }>;
}

export interface PortScanConfig {
  scanner: PortScanner;
  defaultPorts?: number[];
}

export function createPortScanModule(config: PortScanConfig): StormModule {
  const defaultPorts = config.defaultPorts ?? [21, 22, 25, 53, 80, 110, 143, 443, 993, 995, 3306, 3389, 5432, 8080, 8443];

  return {
    id: 'port-scan',
    name: 'Port Scanner',
    description: 'TCP port scanning for discovered hosts',
    flags: ['active', 'safe'],
    watchedEvents: ['DNS_NAME', 'IP_ADDRESS', 'SUBDOMAIN'],
    producedEvents: ['OPEN_TCP_PORT'],

    async handleEvent(event, ctx) {
      if (!['DNS_NAME', 'IP_ADDRESS', 'SUBDOMAIN'].includes(event.type)) return;

      const target = event.data.split(':')[0]; // strip port if present

      try {
        const result = await config.scanner(target);
        for (const port of result.ports) {
          ctx.emit({
            type: 'OPEN_TCP_PORT',
            data: `${target}:${port}`,
            source: 'port-scan',
            timestamp: new Date().toISOString(),
            confidence: 0.9,
            metadata: { host: target, port },
          });
        }
      } catch (err) {
        ctx.emit({
          type: 'ERROR',
          data: `port-scan failed for ${target}: ${err}`,
          source: 'port-scan',
          timestamp: new Date().toISOString(),
          confidence: 1.0,
        });
      }
    },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/modules/port-scan.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/modules/port-scan.ts packages/agents/src/agents/__tests__/modules/port-scan.test.ts
git commit -m "feat(storm): add port scan module"
```

---

### Task 5: Web Reconnaissance Module

**Objective:** Implement a web recon module that consumes URL/OPEN_TCP_PORT and emits TECHNOLOGY, EMAIL, URL events.

**Files:**
- Create: `packages/agents/src/agents/modules/web-recon.ts`
- Test: `packages/agents/src/agents/__tests__/modules/web-recon.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createWebReconModule } from '../modules/web-recon';
import { createStormEventBus } from '../storm-events';

describe('web-recon module', () => {
  it('should emit TECHNOLOGY events from URL input', async () => {
    const bus = createStormEventBus();
    const mod = createWebReconModule({
      analyzer: async (url) => ({
        technologies: ['nginx', 'react'],
        emails: ['admin@evilcorp.com'],
        urls: ['https://evilcorp.com/about'],
      }),
    });
    const events: any[] = [];
    bus.on('*', e => events.push(e));

    await mod.handleEvent(
      { type: 'URL', data: 'https://evilcorp.com', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 },
      { emit: (e) => bus.emit(e), bus, config: {} }
    );

    const techs = events.filter(e => e.type === 'TECHNOLOGY');
    expect(techs).toHaveLength(2);
    expect(techs[0].data).toBe('nginx');
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/modules/web-recon.test.ts -v`
Expected: FAIL

**Step 3: Implement web-recon.ts**

```typescript
// modules/web-recon.ts
import type { StormModule, StormModuleContext } from '../storm-module';
import type { StormEvent } from '../storm-events';

export interface WebAnalyzer {
  (url: string): Promise<{
    technologies: string[];
    emails: string[];
    urls: string[];
  }>;
}

export interface WebReconConfig {
  analyzer: WebAnalyzer;
}

export function createWebReconModule(config: WebReconConfig): StormModule {
  return {
    id: 'web-recon',
    name: 'Web Reconnaissance',
    description: 'Web technology detection, email extraction, URL discovery',
    flags: ['passive', 'safe'],
    watchedEvents: ['URL', 'OPEN_TCP_PORT', 'SUBDOMAIN'],
    producedEvents: ['TECHNOLOGY', 'EMAIL', 'URL', 'HTTP_RESPONSE'],

    async handleEvent(event, ctx) {
      let url: string;
      if (event.type === 'URL') {
        url = event.data;
      } else if (event.type === 'OPEN_TCP_PORT') {
        const [host, port] = event.data.split(':');
        url = `${port === '443' ? 'https' : 'http'}://${host}:${port}`;
      } else if (event.type === 'SUBDOMAIN') {
        url = `https://${event.data}`;
      } else {
        return;
      }

      try {
        const result = await config.analyzer(url);
        for (const tech of result.technologies) {
          ctx.emit({
            type: 'TECHNOLOGY',
            data: tech,
            source: 'web-recon',
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            metadata: { url },
          });
        }
        for (const email of result.emails) {
          ctx.emit({
            type: 'EMAIL',
            data: email,
            source: 'web-recon',
            timestamp: new Date().toISOString(),
            confidence: 0.75,
            metadata: { url },
          });
        }
        for (const foundUrl of result.urls) {
          ctx.emit({
            type: 'URL',
            data: foundUrl,
            source: 'web-recon',
            timestamp: new Date().toISOString(),
            confidence: 0.9,
            metadata: { sourceUrl: url },
          });
        }
      } catch (err) {
        ctx.emit({
          type: 'ERROR',
          data: `web-recon failed for ${url}: ${err}`,
          source: 'web-recon',
          timestamp: new Date().toISOString(),
          confidence: 1.0,
        });
      }
    },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/modules/web-recon.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/modules/web-recon.ts packages/agents/src/agents/__tests__/modules/web-recon.test.ts
git commit -m "feat(storm): add web reconnaissance module"
```

---

## Phase 3: Recursive Engine and Dynamic Planning

### Task 6: Recursive Recon Engine

**Objective:** Build the engine that wires modules together with recursive event routing.

**Files:**
- Create: `packages/agents/src/agents/storm-engine.ts`
- Test: `packages/agents/src/agents/__tests__/storm-engine.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createStormEngine } from '../storm-engine';
import { createStormEventBus } from '../storm-events';
import { createModuleRegistry } from '../storm-module';
import { createSubdomainEnumModule } from '../modules/subdomain-enum';
import { createPortScanModule } from '../modules/port-scan';

describe('StormEngine', () => {
  it('should recursively process events through modules', async () => {
    const bus = createStormEventBus();
    const registry = createModuleRegistry();
    const mod1 = createSubdomainEnumModule({
      fetcher: async (d) => ({ subdomains: ['www', 'api'] }),
    });
    const mod2 = createPortScanModule({
      scanner: async (t) => ({ ports: [80, 443] }),
    });
    registry.register(mod1);
    registry.register(mod2);

    const engine = createStormEngine({ bus, registry, maxDepth: 3 });
    await engine.seedEvent({ type: 'DNS_NAME', data: 'evilcorp.com', source: 'seed', timestamp: '2026-01-01T00:00:00Z', confidence: 1.0 });

    const history = bus.getHistory();
    const subdomains = history.filter(e => e.type === 'SUBDOMAIN');
    const ports = history.filter(e => e.type === 'OPEN_TCP_PORT');
    expect(subdomains.length).toBeGreaterThan(0);
    expect(ports.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-engine.test.ts -v`
Expected: FAIL

**Step 3: Implement storm-engine.ts**

```typescript
// storm-engine.ts
import type { StormEventBus, StormEvent } from './storm-events';
import type { StormModuleRegistry, StormModuleContext } from './storm-module';

export interface StormEngineConfig {
  bus: StormEventBus;
  registry: StormModuleRegistry;
  maxDepth: number;
  onError?: (err: Error) => void;
}

export interface StormEngine {
  seedEvent(event: StormEvent): Promise<void>;
  seedEvents(events: StormEvent[]): Promise<void>;
  getStats(): { totalEvents: number; eventsByType: Record<string, number>; depth: number };
}

export function createStormEngine(config: StormEngineConfig): StormEngine {
  const { bus, registry, maxDepth } = config;
  let depth = 0;
  const stats: Record<string, number> = {};

  const ctx: StormModuleContext = {
    emit(event) {
      stats[event.type] = (stats[event.type] ?? 0) + 1;
      bus.emit(event);
    },
    bus,
    config: {},
  };

  async function processEvent(event: StormEvent, currentDepth: number) {
    if (currentDepth >= maxDepth) return;

    const consumers = registry.getByEventType(event.type);
    for (const mod of consumers) {
      try {
        await mod.handleEvent(event, ctx);
      } catch (err) {
        config.onError?.(err as Error);
      }
    }
  }

  return {
    async seedEvent(event) {
      bus.emit(event);
      stats[event.type] = (stats[event.type] ?? 0) + 1;
      depth = 0;

      // Process recursively
      const processed = new Set<string>();
      let currentDepth = 0;

      while (currentDepth < maxDepth) {
        const events = bus.getHistory().filter(e => {
          const key = `${e.type}:${e.data}`;
          if (processed.has(key)) return false;
          processed.add(key);
          return true;
        });

        if (events.length === 0) break;

        for (const e of events) {
          await processEvent(e, currentDepth);
        }
        currentDepth++;
      }
      depth = currentDepth;
    },

    async seedEvents(events) {
      for (const e of events) {
        await this.seedEvent(e);
      }
    },

    getStats() {
      return {
        totalEvents: Object.values(stats).reduce((a, b) => a + b, 0),
        eventsByType: { ...stats },
        depth,
      };
    },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-engine.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/storm-engine.ts packages/agents/src/agents/__tests__/storm-engine.test.ts
git commit -m "feat(storm): add recursive recon engine with event-driven module routing"
```

---

### Task 7: Dynamic Mission Planner

**Objective:** Replace hardcoded MISSION_TEMPLATES with dynamic planning based on event stream analysis.

**Files:**
- Modify: `packages/agents/src/agents/stormAgent.ts` (planMission function)
- Create: `packages/agents/src/agents/storm-planner.ts`
- Test: `packages/agents/src/agents/__tests__/storm-planner.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createDynamicPlanner } from '../storm-planner';
import { createStormEventBus } from '../storm-events';

describe('DynamicPlanner', () => {
  it('should generate phases based on event stream', () => {
    const bus = createStormEventBus();
    const planner = createDynamicPlanner();

    // Simulate recon findings
    bus.emit({ type: 'SUBDOMAIN', data: 'api.evilcorp.com', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 0.9 });
    bus.emit({ type: 'OPEN_TCP_PORT', data: 'evilcorp.com:443', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 0.9 });
    bus.emit({ type: 'TECHNOLOGY', data: 'nginx', source: 'test', timestamp: '2026-01-01T00:00:00Z', confidence: 0.8 });

    const plan = planner.synthesizePlan('recon', 'evilcorp.com', bus.getHistory());
    expect(plan.phases.length).toBeGreaterThan(0);
    expect(plan.phases.some(p => p.type === 'recon')).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-planner.test.ts -v`
Expected: FAIL

**Step 3: Implement storm-planner.ts**

```typescript
// storm-planner.ts
import type { StormEvent } from './storm-events';
import type { MissionType, PhaseType } from './stormAgent';

export interface DynamicPhase {
  type: PhaseType;
  rationale: string;
  priority: number;
  eventTriggers: string[];
}

export interface DynamicPlan {
  missionType: MissionType;
  target: string;
  phases: DynamicPhase[];
  estimatedCoverage: number; // 0..1
}

export interface DynamicPlanner {
  synthesizePlan(missionType: MissionType, target: string, events: StormEvent[]): DynamicPlan;
}

export function createDynamicPlanner(): DynamicPlanner {
  return {
    synthesizePlan(missionType, target, events) {
      const phases: DynamicPhase[] = [];
      const eventTypes = new Set(events.map(e => e.type));

      // Always start with recon
      phases.push({
        type: 'recon',
        rationale: 'Initial reconnaissance',
        priority: 10,
        eventTriggers: ['DNS_NAME', 'IP_ADDRESS'],
      });

      // Add analyze phase if we have findings
      if (eventTypes.has('SUBDOMAIN') || eventTypes.has('TECHNOLOGY') || eventTypes.has('OPEN_TCP_PORT')) {
        phases.push({
          type: 'analyze',
          rationale: 'Analyze discovered attack surface',
          priority: 8,
          eventTriggers: ['SUBDOMAIN', 'TECHNOLOGY', 'OPEN_TCP_PORT'],
        });
      }

      // Add plan phase for attack missions
      if (missionType === 'attack' || missionType === 'full') {
        if (eventTypes.has('OPEN_TCP_PORT') || eventTypes.has('TECHNOLOGY')) {
          phases.push({
            type: 'plan',
            rationale: 'Plan attack vectors based on discovered services',
            priority: 6,
            eventTriggers: ['OPEN_TCP_PORT', 'TECHNOLOGY', 'VULNERABILITY'],
          });
        }
      }

      // Add assess phase
      phases.push({
        type: 'assess',
        rationale: 'Assess findings and coverage',
        priority: 1,
        eventTriggers: [],
      });

      // Calculate estimated coverage
      const coverageMap: Record<string, number> = {
        SUBDOMAIN: 0.3,
        OPEN_TCP_PORT: 0.4,
        TECHNOLOGY: 0.5,
        EMAIL: 0.2,
        CLOUD_BUCKET: 0.6,
        VULNERABILITY: 0.8,
      };
      const estimatedCoverage = Math.min(1.0, events.reduce((sum, e) => sum + (coverageMap[e.type] ?? 0), 0) / 10);

      return {
        missionType,
        target,
        phases,
        estimatedCoverage,
      };
    },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-planner.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/storm-planner.ts packages/agents/src/agents/__tests__/storm-planner.test.ts
git commit -m "feat(storm): add dynamic mission planner based on event stream analysis"
```

---

## Phase 4: Adaptive OPSEC

### Task 8: Adaptive OPSEC Controller

**Objective:** Replace static OPSEC config with adaptive controller that responds to target behavior.

**Files:**
- Create: `packages/agents/src/agents/storm-opsec.ts`
- Test: `packages/agents/src/agents/__tests__/storm-opsec.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createAdaptiveOpsec } from '../storm-opsec';

describe('AdaptiveOpsec', () => {
  it('should escalate to cooldown on rate limit detection', () => {
    const opsec = createAdaptiveOpsec({ initialLevel: 'balanced' });
    opsec.recordResponse({ statusCode: 429, latencyMs: 50, headers: {} });
    opsec.recordResponse({ statusCode: 429, latencyMs: 50, headers: {} });
    expect(opsec.getLevel()).toBe('silent');
    expect(opsec.shouldPause()).toBe(true);
  });

  it('should stay balanced on normal responses', () => {
    const opsec = createAdaptiveOpsec({ initialLevel: 'balanced' });
    opsec.recordResponse({ statusCode: 200, latencyMs: 100, headers: {} });
    expect(opsec.getLevel()).toBe('balanced');
    expect(opsec.shouldPause()).toBe(false);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-opsec.test.ts -v`
Expected: FAIL

**Step 3: Implement storm-opsec.ts**

```typescript
// storm-opsec.ts
import type { OpsecLevel, DetectionEvent } from './opsec';

export interface ResponseSnapshot {
  statusCode: number;
  latencyMs: number;
  headers: Record<string, string>;
}

export interface AdaptiveOpsecConfig {
  initialLevel: OpsecLevel;
  rateLimitThreshold?: number;   // consecutive 429s before escalation
  honeypotConfidenceThreshold?: number;
}

export interface AdaptiveOpsec {
  recordResponse(response: ResponseSnapshot): void;
  recordDetection(event: DetectionEvent): void;
  getLevel(): OpsecLevel;
  shouldPause(): boolean;
  getRecommendedDelay(): number;
  getStats(): { totalRequests: number; rateLimitHits: number; detections: number };
}

export function createAdaptiveOpsec(config: AdaptiveOpsecConfig): AdaptiveOpsec {
  let level = config.initialLevel;
  let consecutiveRateLimits = 0;
  let totalRequests = 0;
  let rateLimitHits = 0;
  let detections = 0;
  let paused = false;

  const rateLimitThreshold = config.rateLimitThreshold ?? 3;
  const honeypotThreshold = config.honeypotConfidenceThreshold ?? 0.7;

  return {
    recordResponse(response) {
      totalRequests++;
      if (response.statusCode === 429) {
        rateLimitHits++;
        consecutiveRateLimits++;
        if (consecutiveRateLimits >= rateLimitThreshold) {
          level = 'silent';
          paused = true;
        }
      } else if (response.statusCode === 200) {
        consecutiveRateLimits = 0;
        paused = false;
      }
    },

    recordDetection(event) {
      detections++;
      if (event.severity === 'high' || event.severity === 'critical') {
        level = 'silent';
        paused = true;
      }
    },

    getLevel() { return level; },
    shouldPause() { return paused; },

    getRecommendedDelay() {
      switch (level) {
        case 'silent': return 15000;  // 15s
        case 'balanced': return 3000; // 3s
        case 'loud': return 200;      // 200ms
      }
    },

    getStats() { return { totalRequests, rateLimitHits, detections }; },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-opsec.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/storm-opsec.ts packages/agents/src/agents/__tests__/storm-opsec.test.ts
git commit -m "feat(storm): add adaptive OPSEC controller with rate-limit and detection response"
```

---

## Phase 5: Integration and Verification

### Task 9: Wire STORM Engine into StormAgent

**Objective:** Integrate the new event-driven engine into the existing StormAgent facade.

**Files:**
- Modify: `packages/agents/src/agents/stormAgent.ts`
- Test: `packages/agents/src/agents/__tests__/storm-integration.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createStormAgentWithEngine } from '../stormAgent';
import { createSubdomainEnumModule } from '../modules/subdomain-enum';
import { createPortScanModule } from '../modules/port-scan';

describe('STORM with engine', () => {
  it('should run a full recon scan with real modules', async () => {
    const agent = createStormAgentWithEngine({
      security: { classification: 'UNCLASSIFIED', compartments: [], tenantId: 'test' },
      modules: [
        createSubdomainEnumModule({ fetcher: async (d) => ({ subdomains: ['www', 'api'] }) }),
        createPortScanModule({ scanner: async (t) => ({ ports: [80, 443] }) }),
      ],
    });

    const result = await agent.runRecon('evilcorp.com', 'recon');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.stats.totalEvents).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify failure**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-integration.test.ts -v`
Expected: FAIL

**Step 3: Add runRecon to StormAgent**

Add to `stormAgent.ts`:

```typescript
export interface StormAgentWithEngine extends StormAgent {
  runRecon(target: string, missionType: MissionType): Promise<{
    findings: EvidenceFinding[];
    stats: { totalEvents: number; eventsByType: Record<string, number; depth: number };
  }>;
}

export function createStormAgentWithEngine(opts: StormAgentOptions & {
  modules: StormModule[];
}): StormAgentWithEngine {
  const base = createStormAgent(opts);
  const bus = createStormEventBus();
  const registry = createModuleRegistry();
  opts.modules.forEach(m => registry.register(m));

  const engine = createStormEngine({ bus, registry, maxDepth: 3 });

  return {
    ...base,
    async runRecon(target, missionType) {
      await engine.seedEvent({
        type: 'DNS_NAME',
        data: target,
        source: 'storm-agent',
        timestamp: new Date().toISOString(),
        confidence: 1.0,
      });
      return {
        findings: base.getState().evidenceVault,
        stats: engine.getStats(),
      };
    },
  };
}
```

**Step 4: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-integration.test.ts -v`
Expected: 1 passed

**Step 5: Commit**

```bash
git add packages/agents/src/agents/stormAgent.ts packages/agents/src/agents/__tests__/storm-integration.test.ts
git commit -m "feat(storm): integrate event-driven recon engine into StormAgent facade"
```

---

### Task 10: Full Integration Test and Documentation

**Objective:** End-to-end test with all modules wired, plus update AGENTS_CHECKLIST.md.

**Files:**
- Test: `packages/agents/src/agents/__tests__/storm-e2e.test.ts`
- Modify: `AGENTS_CHECKLIST.md`
- Modify: `docs/ARGUS_ROADMAP.md`

**Step 1: Write E2E test**

```typescript
import { describe, it, expect } from 'vitest';
import { createStormAgentWithEngine } from '../stormAgent';
import { createSubdomainEnumModule } from '../modules/subdomain-enum';
import { createPortScanModule } from '../modules/port-scan';
import { createWebReconModule } from '../modules/web-recon';

describe('STORM E2E Recon', () => {
  it('should discover subdomains, ports, and technologies', async () => {
    const agent = createStormAgentWithEngine({
      security: { classification: 'UNCLASSIFIED', compartments: [], tenantId: 'test' },
      modules: [
        createSubdomainEnumModule({
          fetcher: async (d) => ({
            subdomains: d === 'evilcorp.com' ? ['www', 'api', 'dev'] : [],
          }),
        }),
        createPortScanModule({
          scanner: async (t) => ({
            ports: t.includes('www') ? [80, 443] : [22, 80],
          }),
        }),
        createWebReconModule({
          analyzer: async (url) => ({
            technologies: url.includes('www') ? ['nginx', 'react'] : [],
            emails: ['admin@evilcorp.com'],
            urls: [`${url}/login`],
          }),
        }),
      ],
    });

    const result = await agent.runRecon('evilcorp.com', 'recon');
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.stats.eventsByType['SUBDOMAIN']).toBeGreaterThan(0);
    expect(result.stats.eventsByType['OPEN_TCP_PORT']).toBeGreaterThan(0);
    expect(result.stats.eventsByType['TECHNOLOGY']).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify pass**

Run: `cd packages/agents && npx vitest run src/agents/__tests__/storm-e2e.test.ts -v`
Expected: 1 passed

**Step 3: Run full test suite**

Run: `cd packages/agents && npx vitest run -v`
Expected: All tests pass (existing + new)

**Step 4: Update AGENTS_CHECKLIST.md**

Add under Phase 7:
```
- [x] STORM event-driven recon engine — recursive module architecture with typed event bus
- [x] Subdomain enumeration module — passive DNS enumeration with injectable fetcher
- [x] Port scan module — TCP port scanning consuming DNS_NAME/SUBDOMAIN events
- [x] Web recon module — technology detection, email extraction, URL discovery
- [x] Dynamic mission planner — generates phases based on event stream analysis
- [x] Adaptive OPSEC controller — responds to rate limits, honeypots, WAF detection
```

**Step 5: Commit**

```bash
git add packages/agents/src/agents/__tests__/storm-e2e.test.ts AGENTS_CHECKLIST.md docs/ARGUS_ROADMAP.md
git commit -m "feat(storm): complete event-driven recon engine with E2E tests and documentation"
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Recursive event loops (A→B→A) | `maxDepth` limit in engine; deduplication via `processed` set |
| Module isolation failure | Each module gets its own error boundary; failures emit ERROR events, don't crash engine |
| OPSEC over-escalation | Adaptive controller uses consecutive thresholds, not single events |
| Breaking existing STORM tests | New engine is additive; existing `createStormAgent` API unchanged |
| Real network calls in tests | All modules use injectable fetchers/scanners/analyzers — tests are fully deterministic |

---

## Future Enhancements (Out of Scope)

1. **BBOT integration** — wrap BBOT as a STORM module for instant access to 80+ recon modules
2. **Cloud enumeration** — S3/GCS/Azure bucket discovery module
3. **Email harvesting** — theHarvester-style module consuming DNS_NAME
3. **Vulnerability scanning** — nuclei integration module consuming OPEN_TCP_PORT/TECHNOLOGY
4. **Graph storage** — Neo4j output for attack surface visualization
5. **Preset system** — BBOT-style presets (subdomain-enum, web-basic, full-assault)
6. **Distributed scanning** — multiple STORM instances coordinating via Whisper Network

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `packages/agents/src/agents/storm-events.ts` | Create | Typed event bus |
| `packages/agents/src/agents/storm-module.ts` | Create | Module interface + registry |
| `packages/agents/src/agents/storm-engine.ts` | Create | Recursive event processing engine |
| `packages/agents/src/agents/storm-planner.ts` | Create | Dynamic mission planner |
| `packages/agents/src/agents/storm-opsec.ts` | Create | Adaptive OPSEC controller |
| `packages/agents/src/agents/modules/subdomain-enum.ts` | Create | Subdomain enumeration module |
| `packages/agents/src/agents/modules/port-scan.ts` | Create | Port scanning module |
| `packages/agents/src/agents/modules/web-recon.ts` | Create | Web reconnaissance module |
| `packages/agents/src/agents/stormAgent.ts` | Modify | Add `createStormAgentWithEngine` |
| `AGENTS_CHECKLIST.md` | Update | Track completion |
| `docs/ARGUS_ROADMAP.md` | Update | Track completion |

---

**Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?**
