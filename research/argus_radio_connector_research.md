# ARGUS Portable Radio Connector — SDR / Software / API Research

**Scope:** Research only. Concrete, real, usable components to SEND and RECEIVE
digital radio messages to public-safety / emergency-responder radio systems from
a portable ARGUS node. No code.

**Date:** 2026-07-14
**Author:** ARGUS research subagent

---

## 0. Context: what ARGUS already has

The `chimera` monorepo contains `packages/connectors-rfdef` — a *defensive RF*
connector that turns the output of `kismet`, `rtlsdr`, and `bettercap` scans into
the ARGUS ontology (`DefensiveRfConnector`, `parseRtlSdr`, etc.). It already
captures **spectrum presence** (signal type, power, center freq) from `rtl-sdr`,
but it does **not** yet decode or originate digital voice/data messages.

The task references a "sigint/SoapySDR package" inside ARGUS. In this checkout
the only RF ingestion path is `connectors-rfdef` (rtl-sdr/kismet/bettercap);
there is no committed SoapySDR transmitter/decoder package yet. **SoapySDR should
be treated as the planned SDR abstraction layer** (it is the standard way to talk
to rtl-sdr / HackRF / LimeSDR / SDRplay from one codebase). Recommendation below
picks up `connectors-rfdef` and adds a message-layer package on top.

> Legal/operational note: transmitting on licensed public-safety spectrum
> (P25, TETRA, DMR Tier II/III, conventional LMR) without authorization is
> illegal in most jurisdictions. The realistic portable path is therefore:
> **receive + decode everything via SDR**, and **send text/status** only through
> operator-authorized IP gateways (BrandMeister, APRS-IS, dispatch console APIs,
> or a leased CSSI/UPSI trunking link). Where transmit is listed, treat it as
> "lab/authorized-use only."

---

## 1. Master table: standard | tool/library | send path | receive path | notes

| Standard | Tool / Library / API | Send path (one text message) | Receive path (one message back) | Notes / caveats |
|---|---|---|---|---|
| **P25 Phase I/II (voice+data trunking)** | `op25` (osmocom/op25, GNU Radio) + `dsd` (szechyjs/dsd) | Trunking control / data: op25 can build P25 PDU (e.g. unit-to-unit SDS-style) on TX; needs CSSI/UPSI or SDR TX. No public REST send. | `op25` decodes CAI, `dsd` decodes P25 voice + low-speed data (LSD) / MBT from discriminator-tap audio. | Open air-interface only; **CSSI/UPSI** are the *vendor* IP interfaces for console injection (Motorola ASTRO 25). See §6. |
| **DMR (Tier II/III)** | `dsd` / `dsd-fme`; **BrandMeister API**; DMR-MARC | **BrandMeister:** `GET /v1.0/talkgroup/<TG>/?action=sendSDM&msg=<text>&password=<SelfCare>` to a talkgroup, or `…/subscriber/<DMRID>/?action=sendSDM…` to a unit. (DMR-MARC has no public text API; use BM master.) | BrandMeister JSON/last-heard; or decode Private/Group Call SDS via `dsd-fme` from an SDR slice. | BM API requires the talkgroup's **SelfCare password**. 16-char text limit per SDS. Unauth calls return 404 (verified). |
| **TETRA** | `osmo-tetra` (osmocom/osmo-tetra) | SDS via TETRA SDS service (type-1/2/3/4) or packet data (TDP/SNDCP). Air-interface TX needs a TETRA modulator (osmo-tetra `tetra-rx` is RX only; TX requires a generator). PCAP injection = craft MAC blocks and feed to a modulator. | `tetra-rx` + `tetra_demod` → decodes SDS, status, GPS (LLP), and writes **PCAP** of the lower MAC. | Best *receive* story of the trunked standards. No clean open TX; treat TX as authorized-infrastructure only. |
| **APRS (amateur / EOC adjunct)** | `direwolf` (wb2osz/direwolf); `aprx` (hessu/aprx); APRS-IS | **POST to APRS-IS** over TCP `user <CALL> pass <N> vers …` then `:<CALL>*>APDW..:…` status/position packet; or local `direwolf` KISS/TCP to gateway. | Connect to `rotate.aprs.net:14580`, `filter b/<CALL>` or `filter m/<radius>`; read packets streamed back. Query a unit's last position by filtering its callsign. | APRS-IS passcode is a hash of the callsign (no privacy). Public, open, no auth beyond callsign+passcode. Best *open* send/receive text+GPS path. |
| **Conventional NFM / MDC-1200 / FLEX / POCSAG** | `multimon-ng` (EliasOenal/multimon-ng); `rtl-sdr` | No native *send* in multimon-ng (RX only). TX via SoapySDR + modulator (POCSAG/FLEX paging encoders exist). | `multimon-ng` decodes POCSAG, FLEX, MDC-1200 (unit ID/status!), DTMF, AFSK, APRS — straight from `rtl_sdr` IQ or audio. | MDC-1200 is the classic "unit status / emergency" burst on analog LMR. **Great receive-only status source.** |
| **Radio-over-IP / dispatch console** | Vendor APIs: Motorola **ASTRO 25 CSSI/UPSI**, Hytera **DIP/ROIP**, **ROSM**, EWDN | CSSI/UPSI = TCP/IP console link (RTP audio + SDLC-style data) to inject text/status into a trunked system. Hytera DIP exposes text/SDS over IP. ROSM = open message broker (XML/CSV) linking CAD to many radio types. | Same console link returns unit status, GPS, message acks. ROSM polls/sniffs the dispatch feed. | **No public REST for Motorola/Hytera consoles** — must use vendor SDK / leased link / ROSM. This is the "authorized inject" path for a real city deployment. |
| **Generic SDR abstraction** | `SoapySDR` (pothosware/SoapySDR) + `SoapyRemote` | One API to TX/RX on rtl-sdr (RX), HackRF (TX+RX), LimeSDR (TX+RX), SDRplay. `connectors-rfdef` should wrap Soapy for the message layer. | Same. Soapy gives device-agnostic IQ; decoders (dsd/op25/osmo-tetra/multimon) consume it. | **Recommended integration spine** for the portable node — handles whatever dongle is plugged in. |

---

## 2. Component detail & minimal paths

### 2.1 SDR receive/transmit base
- **rtl-sdr** — cheap RX-only (24–1766 MHz). Receive-only workhorse for scanning.
- **HackRF One** / **LimeSDR** — full TX+RX, covers VHF/UHF public-safety bands
  (136–174 MHz, 380–520 MHz, 700/800 MHz). Needed if you *must* transmit via SDR.
- **SoapySDR + SoapyRemote** — unifies all of the above behind one API. `connectors-rfdef`
  already knows `rtl-sdr`; add a Soapy device factory so the connector auto-selects
  HackRF/Lime/rtl based on capability (RX-only vs TX).
- **Receive one message:** `rtl_sdr`/`soapy` → `dsd` or `op25` or `osmo-tetra` or
  `multimon-ng` depending on standard.
- **Transmit one message (authorized only):** SoapySDR device + a modulator
  (op25 for P25, custom for TETRA, POCSAG/FLEX encoder for paging). **See legal note.**

### 2.2 Decoders / demodulators
- **multimon-ng** — RX-only Swiss-army knife: POCSAG, FLEX, MDC-1200 (analog
  unit-ID/status/emergency), DTMF, AFSK1200/APRS, D-STAR header. Best *receive*
  tool for analog-LMR status bursts and paging.
- **dsd (Digital Speech Decoder, szechyjs/dsd)** — decodes P25 Phase I, DMR,
  NXDN, D-STAR from discriminator audio. `dsd-fme` is the actively maintained
  fork (full-rate + half-rate, better DMR). Consumes SDR audio/IQ demod output.
- **direwolf** — the APRS "soundcard TNC": modulates/demodulates AFSK/2-GFSK,
  can act as an APRS-IS client and a KISS TCP server. This is your **APRS send**
  engine (local) and your **APRS receive** engine.
- **op25** (osmocom) — full P25 Phase 1/2 trunking RX *and* TX (C4FM/CQPSK),
  including data/control-channel decoding. The only open tool that can both hear
  and originate P25.

### 2.3 Radio-over-IP / dispatch console APIs
- **Motorola ASTRO 25 CSSI (Console Subsystem Interface) / UPSI (Unit/Patch
  Subsystem Interface):** documented P25 "open interfaces" (per Wikipedia P25
  article) — IP-based console links carrying audio + data. These are the
  *authorized* way to inject a text/SDS/status into a city P25 system. No public
  REST; access via vendor SDK or a leased console port.
- **Hytera DIP / ROIP:** Hytera's dispatch-IP protocol exposes text/SDS to
  consoles over the network. Same pattern — vendor SDK, no public REST.
- **ROSM (Radio Over IP Service Manager / "Radio Over Some Medium"):** an open
  middleware layer that bridges CAD/dispatch to heterogeneous radio (P25, DMR,
  analog, etc.) via message files (XML/CSV). This is the recommended "portable,
  vendor-neutral" ingest if you can't get CSSI.
- **CAT / serial control (rigctl/hamlib):** for analog/base-station radios, a
  serial/CAT command can key PTT and send MDC-1200/DTMF status bursts. `rigctld`
  (hamlib) is the universal control layer.

### 2.4 TETRA (osmocom-tetra)
- **Repo:** `osmocom/osmo-tetra` (git.osmocom.org mirror confirmed live).
- **Receive:** `tetra-rx` + `tetra_demod` decode the TETRA MAC and emit a **PCAP**
  of the lower layer. You get **SDS (Short Data Service)** messages, **status
  messages**, and **GPS position** (LLP — Location Information Protocol over SNDCP).
- **Packet data:** TETRA carries IP via **SNDCP/TDP** — a radio can have a real IP
  session; status/GPS rides over it.
- **Inject/PCAP:** `osmo-tetra` is primarily a **receiver**. To *transmit* you
  build MAC blocks (there are generators in the tree) and feed a TETRA modulator
  — realistically only against authorized test infrastructure.
- **Minimal path — receive one status:** tune SDR to the TETRA carrier →
  `tetra_demod` → `tetra-rx -i <iq> -p <pcaps>` → parse SDS/status from PCAP.

### 2.5 APRS (the cleanest open send/receive)
- **direwolf** as local TNC/iGate; **aprx** as a lightweight iGate daemon.
- **Send one status to APRS-IS:** open TCP to `rotate.aprs.net:14580` (or a
  specific `*.aprs2.net` server), send login line
  `user <CALLSIGN> pass <PASSCODE> vers ARGUS 1.0`, then a status/position packet
  e.g. `:<CALL>*>APDW17:>ARGUS status text` or
  `:<CALL>*>APDW17:=DDMM.SSN/WWWW.WWEz...` for GPS. (Port 14580 = raw, no filter;
  14501 = filtered server; 8080 = web/JSON.)
- **Query a unit's status/GPS:** stay connected with a filter
  `filter b/<CALLSIGN>` (budlist) or `filter m/<lat>/<lon>/<radius>`; the server
  streams every packet for that station — you read its last status/position.
- **No-radio alternative:** `api.aprs.fi/api/get` (HTTP GET, needs free API key)
  returns the latest position/status for a callsign as JSON — useful when you have
  internet but no radio.
- **Minimal path:** `direwolf` (or raw TCP) → login → send one `>` status packet;
  to receive, hold the socket open with a `filter b/<CALL>` and parse lines.

### 2.6 DMR (BrandMeister)
- **Send a private/text message to a radio ID or talkgroup:** BrandMeister SelfCare
  HTTP API — `GET https://api.brandmeister.network/v1.0/talkgroup/<TGID>/?action=sendSDM&msg=<text>&password=<SelfCarePassword>`
  (talkgroup) or `…/subscriber/<DMRID>/?action=sendSDM&…` (unit). Verified that
  unauthenticated calls return **404** (auth required); the endpoint routes once
  the SelfCare password is supplied. 16-char limit per SDS.
- **Receive:** BM last-heard JSON or a live `dsd-fme` decode of the DMR timeslot's
  Private/Group Call SDS.
- **DMR-MARC:** no public text-send API; use BrandMeister master or local repeater
  IP if you control it.

### 2.7 P25 data interfaces & transmit
- **CSSI / UPSI** (above) are the IP console interfaces for authorized TX of
  status/SDS into a trunked P25 system.
- **SDR-based TX:** `op25` can generate P25 CAI and transmit via a HackRF/LimeSDR
  for lab/authorized testing. No public REST.
- **Receive:** `op25` (trunking + voice + data) and `dsd` (voice/data) cover it.

---

## 3. Message formats you'll actually see

| Format | Standard | Structure | "Call-in" / status-request behavior |
|---|---|---|---|
| **SDS (Short Data Service)** | TETRA & DMR | Type-1 (ack, ≤4 chars), Type-2 (unacked, ≤4 chars), Type-3 (ack, ≤14/24 bytes), Type-4 (unacked). Carries predefined status codes + free text. | Console sends a **Status Request** (a predefined status query); the radio replies with a status code (e.g. "EN ROUTE", "ON SCENE"). |
| **Unit Status / Status Message** | P25, TETRA, analog MDC | Predefined **status codes** (numeric) mapped to phrases ("10-23", "available", "emergency"). P25 carries via Data Unit / LSD. | Dispatcher polls a unit with a status request; unit auto-replies with its current code. |
| **MDC-1200 burst** | Analog LMR | Unit ID (~4 hex) + status/emergency flag + optional data. | Unit "keys up" → emits ID+status automatically; console sees who/what. Emergency = special burst. |
| **GPS Position Report** | APRS, TETRA LLP, P25 | APRS: `=DDMM.SSN/WWWW.WWEz<A>/` compact position; TETRA: LLP over SNDCP; P25: location via data channel. | A "request GPS" command (APRS `?` / TETRA SDS / P25 data) triggers the unit to send its position. |
| **APRS Status / Position** | APRS | `>` line = status text; `=`/`!` line = position+comment. Open, human-readable. | Other stations / your filter just read the last packet the unit beaconed; no formal "request" needed (beacon-driven). |
| **POCSAG / FLEX page** | Paging | Numeric (≤20 digits) or alphanumeric (≤ ~80 chars) page to an RIC (pager ID). | One-way; a page *is* the message. Reply path is out-of-band. |

**"Call in for a status report" pattern:** the dispatcher sends a short
request — a TETRA/DMR **SDS status query**, a P25 **status request** over CSSI, or
an analog **MDC-1200 query** — and the target radio answers with a predefined
status code + (optionally) GPS. The ARGUS node can *originate* those requests
only through authorized gateways (CSSI/ROSM/BrandMeister); it can *receive and
decode* both the request and the reply freely via SDR + the decoders above.

---

## 4. Recommended ARGUS architecture (from this research)

1. **SDR spine = SoapySDR** (`connectors-rfdef` gains a Soapy device factory;
   already parses `rtl-sdr` spectrum today). Pick HackRF/Lime for TX, rtl-sdr for
   cheap RX scanning.
2. **Decode layer (RX, all standards):** `multimon-ng` (analog/MDC/POCSAG/APRS),
   `dsd`/`dsd-fme` (P25/DMR/NXDN), `op25` (P25 trunking), `osmo-tetra` (TETRA
   SDS/status/GPS → PCAP). Feed decoded events into the existing ontology parser.
3. **Authorized TX / text-send layer:**
   - Open & free → **APRS-IS** (direwolf + TCP login) for status+GPS.
   - DMR cities → **BrandMeister SelfCare `sendSDM`** API.
   - Real dispatch integration → **CSSI/UPSI** or **ROSM** (vendor/leased).
4. **Never transmit on licensed spectrum without authorization** — keep SDR TX
   behind an explicit `authorized: true` flag in the connector config.

---

## 5. Verified facts (live checks during this research)
- `osmocom/osmo-tetra`, `osmocom/op25`, `pothosware/SoapySDR`, `szechyjs/dsd`,
  `wb2osz/direwolf`, `hessu/aprx`, `EliasOenal/multimon-ng` — all repos live.
- BrandMeister `api.brandmeister.network/v1.0/.../sendSDM` — **auth-required**
  (unauthenticated returns 404, confirming endpoint routing + gating).
- `api.aprs.fi/api/get` — reachable (HTTP 200).
- `connectors-rfdef` in this repo already ingests `rtl-sdr`/`kismet`/`bettercap`;
  no SoapySDR/transmit package committed yet.
- Wikipedia P25 article confirms **CSSI/UPSI as P25 "open interfaces"** (the
  console IP-injection path).

## 6. Open risks / unknowns to close before build
- Exact BrandMeister SelfCare password acquisition + rate limits (must be the
  talkgroup owner's SelfCare creds).
- TETRA TX path needs a modulator + authorized test cell (RX is solid).
- Motorola/Hytera console APIs are under NDA — confirm whether ROSM or a leased
  CSSI port is obtainable for the target city.
- SDR TX legality per jurisdiction — gate behind authorization.
