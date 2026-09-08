# STORM Agent — Full BBOT Parity Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> **Scale:** 80+ BBOT modules reimplemented in TypeScript, organized into 6 phases.

**Goal:** Full feature parity with BBOT 1.x — all 80+ recon modules reimplemented as STORM event-driven modules.

**Architecture:** Recursive event-driven recon engine. Central typed event bus connects modules. Each module consumes/produces typed events. Modules are pure logic with injectable fetchers — deterministic tests, no real network calls.

**Tech Stack:** TypeScript (existing), event bus (new), BBOT-style module interface (new), injectable fetchers (existing pattern), vitest (existing).

---

## BBOT Module Inventory (80+ modules)

### Flag System
active, affiliates, aggressive, cloud-enum, deadly, email-enum, iis-shortnames, passive, portscan, report, safe, service-enum, slow, social-enum, subdomain-enum, subdomain-hijack, web-basic, web-paramminer, web-screenshots, web-thorough

### Event Types (BBOT)
DNS_NAME, DNS_NAME_UNRESOLVED, IP_ADDRESS, IP_RANGE, OPEN_TCP_PORT, OPEN_UDP_PORT, URL, URL_UNVERIFIED, HTTP_RESPONSE, TECHNOLOGY, EMAIL_ADDRESS, ASN, FINDING, VULNERABILITY, WAF, CODE_REPOSITORY, VHOST, PROTOCOL, PASSWORD, STORAGE_BUCKET, ORG_STUB, MOBILE_APP, SOCIAL_PROFILE, GEO_LOCATION, HASH, USERNAME, ERROR

### Module Categories

#### Category A: Passive Subdomain Enumeration (~35 modules)
anubisdb, asn, azure_realm, azure_tenant, bevigil, binaryedge, builtwith, c99, censys, certspotter, chaos, columbus, crt, digitorus, dnscommonsrv, dnsdumpster, fullhunt, github_codesearch, hackertarget, internetdb, ipneighbor, leakix, massdns, myssl, otx, passivetotal, rapiddns, riddler, securitytrails, shodan_dns, sitedossier, subdomaincenter, threatminer, urlscan, virustotal, wayback, zoomeye, sublist3r

#### Category B: Active Port Scanning (3 modules)
masscan, nmap, naabu

#### Category C: Web Basic (12 modules)
httpx, sslcert, badsecrets, secretsdb, wappalyzer, robots, gowitness, telerik, bypass403, dastardly, dotnetnuke, ffuf_shortnames

#### Category D: Web Thorough/Param Miner (10 modules)
ffuf, generic_ssrf, host_header, paramminer_cookies, paramminer_getparams, paramminer_headers, smuggler, url_manipulation, vhost, wafw00f

#### Category E: Vulnerability Scanning (1 module)
nuclei

#### Category F: Cloud Enumeration (5 modules)
bucket_amazon, bucket_azure, bucket_digitalocean, bucket_firebase, bucket_gcp

#### Category G: Email Enumeration (4 modules)
emailformat, pgp, skymem, social

#### Category H: Subdomain Hijack (2 modules)
baddns, subdomain_hijack

#### Category I: Code Enumeration (1 module)
github_codesearch

#### Category J: Output Modules (9 modules)
asset_inventory, csv, human, json, neo4j, postgres, sqlite, txt, web_report

#### Category K: Internal Modules (5 modules)
aggregate, excavate, speculate, dnsresolve, portfilter

---

## Phase 1: Core Infrastructure (10 tasks)

### Task 1.1: Event Bus
**Files:** `packages/agents/src/agents/storm-events.ts`, `__tests__/storm-events.test.ts`
- Typed event system with subscribe/unsubscribe, wildcard, history
- Event types: all BBOT event types mapped to StormEventType

### Task 1.2: Module Interface
**Files:** `packages/agents/src/agents/storm-module.ts`, `__tests__/storm-module.test.ts`
- StormModule interface: id, name, description, flags, watchedEvents, producedEvents, handleEvent, handleBatch
- StormModuleRegistry: register, unregister, get, getByEventType, list

### Task 1.3: Recursive Engine
**Files:** `packages/agents/src/agents/storm-engine.ts`, `__tests__/storm-engine.test.ts`
- Event routing with maxDepth, deduplication, error boundaries
- Stats tracking

### Task 1.4: Dynamic Planner
**Files:** `packages/agents/src/agents/storm-planner.ts`, `__tests__/storm-planner.test.ts`
- Generate phases from event stream analysis
- Coverage estimation

### Task 1.5: Adaptive OPSEC
**Files:** `packages/agents/src/agents/storm-opsec.ts`, `__tests__/storm-opsec.test.ts`
- Rate-limit response, honeypot detection, adaptive delays

### Task 1.6: Preset System
**Files:** `packages/agents/src/agents/storm-presets.ts`, `__tests__/storm-presets.test.ts`
- BBOT-style presets: subdomain-enum, web-basic, cloud-enum, email-enum, portscan, full-assault
- Flag-based module filtering

### Task 1.7: Scope Manager
**Files:** `packages/agents/src/agents/storm-scope.ts`, `__tests__/storm-scope.test.ts`
- Whitelist/blacklist, strict-scope, in-scope checking
- BBOT's scope distance tracking

### Task 1.8: Output Module Interface
**Files:** `packages/agents/src/agents/storm-output.ts`, `__tests__/storm-output.test.ts`
- Output module interface for asset_inventory, csv, json, neo4j, postgres, sqlite, txt, human, web_report

### Task 1.9: Internal Modules
**Files:** `packages/agents/src/agents/modules/internal/aggregate.ts`, `excavate.ts`, `speculate.ts`, `dnsresolve.ts`, `portfilter.ts`
- aggregate: summarize results
- excavate: extract useful data from webpages
- speculate: infer new events (OPEN_TCP_PORT from URL, etc.)
- dnsresolve: resolve DNS names to IPs
- portfilter: filter ports

### Task 1.10: Integration
**Files:** `packages/agents/src/agents/stormAgent.ts` (modify), `__tests__/storm-integration.test.ts`
- Wire engine into StormAgent facade

---

## Phase 2: Passive Subdomain Enumeration (~35 modules)

### Task 2.1: Certificate Transparency (3 modules)
**Files:** `modules/passive/crt.ts`, `modules/passive/certspotter.ts`, `modules/passive/digitorus.ts`
- All consume DNS_NAME, produce DNS_NAME
- Flags: passive, safe, subdomain-enum

### Task 2.2: DNS Database Queries (6 modules)
**Files:** `modules/passive/dnsdumpster.ts`, `modules/passive/dnscommonsrv.ts`, `modules/passive/hackertarget.ts`, `modules/passive/rapiddns.ts`, `modules/passive/riddler.ts`, `modules/passive/sitedossier.ts`
- All consume DNS_NAME, produce DNS_NAME
- Flags: passive, safe, subdomain-enum

### Task 2.3: API-Based Subdomain Enum (10 modules)
**Files:** `modules/passive/anubisdb.ts`, `modules/passive/bevigil.ts`, `modules/passive/binaryedge.ts`, `modules/passive/builtwith.ts`, `modules/passive/c99.ts`, `modules/passive/censys.ts`, `modules/passive/chaos.ts`, `modules/passive/columbus.ts`, `modules/passive/fullhunt.ts`, `modules/passive/leakix.ts`
- All consume DNS_NAME, produce DNS_NAME
- Flags: passive, safe, subdomain-enum
- Some need API keys (binaryedge, builtwith, c99, censys, chaos, fullhunt)

### Task 2.4: Web Archive & Search (4 modules)
**Files:** `modules/passive/wayback.ts`, `modules/passive/urlscan.ts`, `modules/passive/threatminer.ts`, `modules/passive/otx.ts`
- Consume DNS_NAME, produce DNS_NAME + URL_UNVERIFIED
- Flags: passive, safe, subdomain-enum

### Task 2.5: ASN & IP Intelligence (3 modules)
**Files:** `modules/passive/asn.ts`, `modules/passive/internetdb.ts`, `modules/passive/ipneighbor.ts`
- asn: IP_ADDRESS → ASN
- internetdb: DNS_NAME/IP_ADDRESS → DNS_NAME, FINDING, OPEN_TCP_PORT, TECHNOLOGY, VULNERABILITY
- ipneighbor: IP_ADDRESS → IP_ADDRESS

### Task 2.6: Cloud & Tenant Discovery (3 modules)
**Files:** `modules/passive/azure_tenant.ts`, `modules/passive/azure_realm.ts`, `modules/passive/zoomeye.ts`
- azure_tenant: DNS_NAME → DNS_NAME (sister domains)
- azure_realm: DNS_NAME → URL_UNVERIFIED
- zoomeye: DNS_NAME → DNS_NAME

### Task 2.7: Brute-Force & Mutations (3 modules)
**Files:** `modules/passive/massdns.ts`, `modules/passive/sublist3r.ts`, `modules/passive/myssl.ts`
- massdns: DNS_NAME → DNS_NAME (brute-force with mutations)
- sublist3r: DNS_NAME → DNS_NAME
- myssl: DNS_NAME → DNS_NAME

### Task 2.8: Aggregator Sources (4 modules)
**Files:** `modules/passive/securitytrails.ts`, `modules/passive/passivetotal.ts`, `modules/passive/shodan_dns.ts`, `modules/passive/virustotal.ts`
- All consume DNS_NAME, produce DNS_NAME
- Need API keys (passivetotal, securitytrails, shodan_dns, virustotal)

### Task 2.9: Subdomain Center & GitHub (2 modules)
**Files:** `modules/passive/subdomaincenter.ts`, `modules/passive/github_codesearch.ts`
- subdomaincenter: DNS_NAME → DNS_NAME
- github_codesearch: DNS_NAME → CODE_REPOSITORY, URL_UNVERIFIED

---

## Phase 3: Active Scanning (16 modules)

### Task 3.1: Port Scanners (3 modules)
**Files:** `modules/active/masscan.ts`, `modules/active/nmap.ts`, `modules/active/naabu.ts`
- Consume IP_ADDRESS, IP_RANGE, DNS_NAME
- Produce OPEN_TCP_PORT
- Flags: active, aggressive, portscan

### Task 3.2: HTTP Probing & Certificates (2 modules)
**Files:** `modules/active/httpx.ts`, `modules/active/sslcert.ts`
- httpx: OPEN_TCP_PORT, URL, URL_UNVERIFIED → HTTP_RESPONSE, URL
- sslcert: OPEN_TCP_PORT → DNS_NAME, EMAIL_ADDRESS

### Task 3.3: Web Technology Detection (3 modules)
**Files:** `modules/active/wappalyzer.ts`, `modules/active/wafw00f.ts`, `modules/active/robots.ts`
- wappalyzer: HTTP_RESPONSE → TECHNOLOGY
- wafw00f: URL → WAF
- robots: URL → URL_UNVERIFIED

### Task 3.4: Secret Detection (2 modules)
**Files:** `modules/active/badsecrets.ts`, `modules/active/secretsdb.ts`
- badsecrets: HTTP_RESPONSE → FINDING, TECHNOLOGY, VULNERABILITY
- secretsdb: HTTP_RESPONSE → FINDING, VULNERABILITY

### Task 3.5: Web Fuzzing (4 modules)
**Files:** `modules/active/ffuf.ts`, `modules/active/ffuf_shortnames.ts`, `modules/active/vhost.ts`, `modules/active/smuggler.ts`
- ffuf: URL → URL_UNVERIFIED
- ffuf_shortnames: URL_HINT → URL_UNVERIFIED
- vhost: URL → DNS_NAME, VHOST
- smuggler: URL → FINDING

### Task 3.6: Parameter Mining (3 modules)
**Files:** `modules/active/paramminer_cookies.ts`, `modules/active/paramminer_getparams.ts`, `modules/active/paramminer_headers.ts`
- All consume HTTP_RESPONSE, produce FINDING
- Flags: active, aggressive, slow, web-paramminer

### Task 3.7: Vulnerability Scanning (1 module)
**Files:** `modules/active/nuclei.ts`
- Consumes URL, produces FINDING, TECHNOLOGY, VULNERABILITY
- Flags: active, aggressive, deadly

### Task 3.8: Web Screenshots (1 module)
**Files:** `modules/active/gowitness.ts`
- Consumes URL, produces FINDING (screenshot reference)
- Flags: active, safe, web-screenshots

### Task 3.9: Advanced Web Attacks (5 modules)
**Files:** `modules/active/bypass403.ts`, `modules/active/dastardly.ts`, `modules/active/dotnetnuke.ts`, `modules/active/generic_ssrf.ts`, `modules/active/host_header.ts`, `modules/active/telerik.ts`, `modules/active/url_manipulation.ts`
- All consume URL/HTTP_RESPONSE, produce FINDING/VULNERABILITY
- Flags: active, aggressive, web-thorough

---

## Phase 4: Cloud, Email, Code, Hijack (12 modules)

### Task 4.1: Cloud Bucket Enumeration (5 modules)
**Files:** `modules/cloud/bucket_amazon.ts`, `modules/cloud/bucket_azure.ts`, `modules/cloud/bucket_digitalocean.ts`, `modules/cloud/bucket_firebase.ts`, `modules/cloud/bucket_gcp.ts`
- Consume DNS_NAME/ORG_STUB, produce STORAGE_BUCKET
- Flags: active, cloud-enum

### Task 4.2: Email Enumeration (4 modules)
**Files:** `modules/email/emailformat.ts`, `modules/email/pgp.ts`, `modules/email/skymem.ts`, `modules/email/social.ts`
- Consume DNS_NAME, produce EMAIL_ADDRESS
- Flags: passive, email-enum

### Task 4.3: Subdomain Hijack Detection (2 modules)
**Files:** `modules/hijack/baddns.ts`, `modules/hijack/subdomain_hijack.ts`
- Consume DNS_NAME/DNS_NAME_UNRESOLVED, produce FINDING, VULNERABILITY
- Flags: active, baddns, cloud-enum, safe, subdomain-hijack

### Task 4.4: Code Repository Enumeration (1 module)
**Files:** `modules/code/github_codesearch.ts`
- Consume DNS_NAME, produce CODE_REPOSITORY, URL_UNVERIFIED
- Flags: passive, safe, subdomain-enum

---

## Phase 5: Output Modules (9 modules)

### Task 5.1: File Output (4 modules)
**Files:** `modules/output/csv.ts`, `modules/output/json.ts`, `modules/output/txt.ts`, `modules/output/human.ts`
- Consume all event types, write to files
- Flags: report

### Task 5.2: Database Output (3 modules)
**Files:** `modules/output/neo4j.ts`, `modules/output/postgres.ts`, `modules/output/sqlite.ts`
- Consume all event types, write to databases
- Flags: report

### Task 5.3: Special Output (2 modules)
**Files:** `modules/output/asset_inventory.ts`, `modules/output/web_report.ts`
- asset_inventory: aggregate asset data
- web_report: generate web-focused report

---

## Phase 6: Integration, E2E, Documentation

### Task 6.1: Full Integration Test
**Files:** `__tests__/storm-full-parity.test.ts`
- Test all 80+ modules wired together
- Verify recursive event routing
- Verify flag-based filtering
- Verify scope management

### Task 6.2: Update Documentation
**Files:** `AGENTS_CHECKLIST.md`, `docs/ARGUS_ROADMAP.md`
- Mark all modules as complete
- Add module reference table

### Task 6.3: CLI Integration
**Files:** `packages/agents/src/cli/storm-cli.ts`
- BBOT-style CLI: `storm -t evilcorp.com -f subdomain-enum -m masscan`
- Preset support
- Output module selection

---

## Execution Strategy

- **Parallel subagents:** Up to 3 concurrent, each handling 5-8 modules
- **Module template:** Each module follows the same pattern:
  1. Define fetcher/scanner/analyzer interface (injectable)
  2. Implement StormModule with proper flags and event types
  3. Write tests with mock implementations
  4. Commit per module group

- **File structure:**
```
packages/agents/src/agents/
├── storm-events.ts          # Event bus
├── storm-module.ts          # Module interface
├── storm-engine.ts          # Recursive engine
├── storm-planner.ts         # Dynamic planner
├── storm-opsec.ts           # Adaptive OPSEC
├── storm-presets.ts         # Preset system
├── storm-scope.ts           # Scope management
├── storm-output.ts          # Output interface
├── modules/
│   ├── passive/             # ~35 passive modules
│   ├── active/              # ~16 active modules
│   ├── cloud/               # 5 cloud modules
│   ├── email/               # 4 email modules
│   ├── hijack/              # 2 hijack modules
│   ├── code/                # 1 code module
│   ├── internal/            # 5 internal modules
│   └── output/              # 9 output modules
└── __tests__/               # All tests
```

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Recursive event loops | maxDepth limit + deduplication set |
| Module isolation failure | Error boundaries per module |
| API key management | Injectable fetchers; no hardcoded keys |
| Test determinism | All modules use injectable dependencies |
| Breaking existing STORM | New engine is additive; existing API unchanged |
| Scope creep | Strict module interface enforcement |

---

**Plan complete. Ready to execute with parallel subagents.**
