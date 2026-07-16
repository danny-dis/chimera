# Emergency-Services Radio Standards & PC Short-Message Injection — Research Report
### For the ARGUS portable radio connector (research only — no code)

---

## 0. Scope & method

This report surveys the digital / trunked / broadband radio standards used by police, fire, EMS, and
emergency-mutual-aid networks, and documents, for each, the modulation/interface and the concrete
hardware/software path by which a **general-purpose computer can TRANSMIT and RECEIVE short status/data
messages** to a specific radio unit or talkgroup. It is intended to inform the design of a portable
ARGUS radio connector.

Findings are based on the public standards (ETSI, TIA/APCO, ARRL/AX.25) and on documented vendor
gateways, received modem/decoder projects, and internet gateways. Where the brief listed a possibly
misspelled or ambiguous vendor name, the verified name is used and flagged in §3 (Vendor notes).

---

## 1. Compact comparison table

| # | Standard | Region / who uses it | Modulation / channel | Short-data mechanism | PC transmit path (inject) | PC receive path (extract) | Message size / notes |
|---|----------|----------------------|----------------------|----------------------|---------------------------|---------------------------|----------------------|
| 1 | **TETRA** (ETSI EN 300 392) | EU, Asia, Middle East public safety; many national agencies | π/4-DQPSK, 25 kHz (4-slot TDMA) | SDS (Short Data Service) Type 1/2/3/4; TETRA Packet Data (TPD) | ISI / console API (TETRA Infrastructure Supplier Interface) on a control-site; or serial-keyed radio + TETRA Terminal API | Same ISI/console API; or USB/serial-attached TETRA terminal w/ vendor SDK | SDS: 4–204 bytes; TPD up to ~24 kbit/s. Addressing by SSI/TSI (individual/talkgroup). |
| 2 | **P25** (APCO/TIA-102) Phase 1 & 2 | North America public safety | P1: C4FM FDMA 12.5 kHz; P2: HCPM (DQPSK) 2-slot TDMA | Unit-to-unit & group data; Packet Data (PDU) on control/traffic ch | Console/core via **CSSI** (Console Subsystem Interface) or **SSI/ISSI**; radio attached to PC over serial/USB with TIA-102 data format | CSSI/SSI feed; or USB radio + decoder (e.g. OP25/DSD) for receive; or trunking logger | Small PDUs; addressed by unit ID / talkgroup ID (TGID). |
| 3 | **DMR** (ETSI TS 102 361) Tier II/III | Worldwide, many agencies on commercial radios (Hytera, Motorola, Tait, etc.) | 2-slot TDMA, 12.5 kHz | Embedded / Short / UDP data in the air-interface slots | Serial/USB radio (Hytera, TYT, etc.) + vendor SDK; or DMR gateway to BrandMeister/DMR-MARC | RTL-SDR + `multimon-ng` (decode voice+data); or USB radio + SDK; or BrandMeister API | SDS ~ up to ~200 bytes/slot frame; addressed by DMR ID / talkgroup. |
| 4 | **NXDN** (Kenwood/Icom, based on FDMA) | Some US agencies; Japan (IDAS); utility | 6.25 kHz FDMA (also NXDN 12.5 narrow) | NXDN data channel; status/position messages | Serial/USB NXDN radio (Icom IDAS, Kenwood NEXEDGE) + vendor SDK; or Kenwood KPG programming/data cable + data app | RTL-SDR + `multimon-ng` (supports NXDN); or USB radio + SDK | Small data payloads; addressed by Unit ID / Group ID. |
| 5 | **dPMR** (ETSI TS 102 490 / 588) | Europe license-free & some PMR; less common in public safety | FDMA, 6.25 kHz (ETSI TS 102 490); Tier 2/3 modes | dPMR data packet (text, status) | Serial/USB dPMR radio (e.g. Icom IC-F** series) + vendor SDK; or modem-style interface | RTL-SDR + `multimon-ng` (supports dPMR); or USB radio + SDK | Short text/status packets; addressed by unit/group. |
| 6 | **APRS / AX.25** over VHF/UHF | Ham / civic emergency, SAR, EOC; ARES/RACES | AFSK 1200 baud (or 9600) on VHF/UHF FM | AX.25 UI frames carrying APRS TNC2 text | PC + TNC (hardware, e.g. Kantronics, Mobilinkd; or software TNC like `direwolf`) → radio | Same TNC/radio (or RTL-SDR + `direwolf`/`multimon-ng` as receive-only iGate) | ~67 char APRS payload; position/status/telemetry; gated to APRS-IS. |
| 7 | **PoC** (Push-to-Talk over Cellular: FirstNet/ESN/ViLTE) | US (FirstNet), UK (ESN), LTE/5G broadband PTT | LTE/5G bearer; MCPTT (3GPP) or proprietary OTT | Mission-critical / broadband data + PTT | Network API / app SDK (carrier MCPTT or vendor PoC app) — no direct RF; rides carrier network | Same: app/network API; APRS-IS-style sharing possible | Arbitrary IP data; depends on carrier/SDK; not Amateur RF. |
| 8 | **Analog MDC-1200 / ANI / FFSK** | Legacy; still in use on analog fleets (Motorola) | Analog FM + FFSK sub-audible burst | MDC-1200 status/ANI (unit ID, emergency, status) | Serial/USB radio w/ MDC encode (Motorola Mastr/HT, or MDC encoder on accessory port) | RTL-SDR + `multimon-ng` (decodes MDC-1200, GE-Star, Fleetsync) | ~ Very short: unit ID + up to ~28 status bits; emergency button. |

---

## 2. Per-standard: how a PC sends a status message

### 1. TETRA (ETSI EN 300 392-*)
- **Mechanism.** Short Data Service (SDS) carries small messages in control/signalling space; types 1–4
  give 4 / 16 / 4 / 204 bytes. TETRA Packet Data (TPD) carries larger IP-style traffic.
- **PC → specific unit/talkgroup.** A computer connected to the TETRA **switch/control-site** via the
  **ISI/Console (Supplier Interface)** sends an SDS addressed to the destination **SSI** (individual) or
  **TSI** (talkgroup). For a portable connector, a TETRA terminal (radio) with a USB/serial data port and
  the vendor **TETRA Terminal API** lets a PC originate SDS messages directly over the air. Vendors:
  Motorola TETRA (Dimetra), Sepura, Hytera, **Teltronic** (Ceura/DIMETRA-style infrastructure).
- **Receive.** Same interface delivers inbound SDS/TPD to the PC.

### 2. P25 (APCO Project 25, Phase 1 FDMA / Phase 2 TDMA)
- **Mechanism.** Point-to-point (unit-to-unit) and group data messages; Packet Data (PDU) on control or
  traffic channels, framed per TIA-102.
- **PC → unit/talkgroup.** Two paths:
  1. **Console path:** the dispatch console connects to the RFSS/core via **CSSI** (Console Subsystem
     Interface) and to other systems via **SSI/ISSI** (Station/Inter-System Interface). A PC speaking
     CSSI can inject data messages to a **unit ID** or **talkgroup (TGID)**.
  2. **Radio-attached path:** a P25 radio wired to the PC over serial/USB can originate data PDUs using
     the TIA-102 data format (often via vendor SDK or a P25 data modem).
- **Receive.** CSSI/SSI feed into the PC; for monitoring, a USB P25 radio + **OP25** or **DSD** (Digital
  Speech Decoder) software decodes data PDUs; trunked loggers capture TGID/unit traffic.

### 3. DMR (ETSI TS 102 361, Tier II simplex/conventional & Tier III trunked)
- **Mechanism.** Data is carried in the TDMA slot structure as embedded/short data or UDP packets.
  Addressing uses the **DMR ID** and **talkgroup**.
- **PC → unit/talkgroup.** Connect a DMR radio (Hytera, TYT, Baofeng/Radioddity, Motorola) to the PC via
  USB/serial and use the vendor SDK or a serial command set to send a **short data message** to a DMR ID /
  talkgroup. Alternatively, a PC reaches radios through a **DMR network gateway** (BrandMeister or
  DMR-MARC) — the connector sends the text to a repeater-linked hotspot/gateway, which forwards it over
  the DMR network to the destination talkgroup/unit.
- **Receive.** `multimon-ng` on an **RTL-SDR** decodes DMR voice+data bursts; a USB DMR radio + SDK, or the
  BrandMeister/DMR-MARC API (JSON over TCP/HTTP to the master), delivers messages to the PC.

### 4. NXDN (Kenwood NEXEDGE / Icom IDAS; FDMA, 6.25 kHz)
- **Mechanism.** NXDN carries digital voice plus a data channel for status/position/short text, addressed
  by Unit ID / Group ID. (Kenwood branded "NEXEDGE", Icom branded "IDAS"; both are NXDN.)
- **PC → unit/talkgroup.** Attach an Icom IDAS or Kenwood NEXEDGE radio via USB/serial; use the vendor
  data SDK / programming-data application to send a status or short text to a Unit/Group ID.
- **Receive.** `multimon-ng` (supports NXDN) on an RTL-SDR decodes the FSK data channel; or the USB radio
  + SDK provides inbound messages.

### 5. dPMR (ETSI TS 102 490 [license-free PMR] / TS 102 588 [Tier 2/3])
- **Mechanism.** FDMA 6.25 kHz digital with a data packet format for text/status; used in European PMR
  and some private systems (less common in public safety than DMR/NXDN).
- **PC → unit/talkgroup.** Icom dPMR radios (e.g. IC-F** dPMR series) with serial/USB data interface and
  vendor SDK; or a modem-style interface originating dPMR data packets.
- **Receive.** `multimon-ng` (supports dPMR) on RTL-SDR; or the USB radio + SDK.

### 6. APRS / AX.25 over VHF/UHF
- **Mechanism.** AX.25 UI (unnumbered) frames modulated as 1200-baud AFSK (or 9600 baud) on an FM
  transceiver. The human-readable TNC2 string carries position, status, telemetry, messages (≈67-char
  payloads). Packets are repeated by digipeaters and ingested to the **APRS-IS** internet backbone by
  IGates.
- **PC → station.** A PC running a TNC — hardware (Kantronics KPC, Mobilinkd Bluetooth TNC) or software
  (**`direwolf`**, a software TNC/igate) — keys the connected FM radio and transmits an APRS message
  addressed to a callsign (e.g. `:CALLSIGN :status text`). To reach stations elsewhere, send via an
  **APRS-IS** server (TCP port 14580/8080) and a local IGate will RF-broadcast it.
- **Receive.** The same TNC/radio, or a receive-only **iGate** (RTL-SDR + `direwolf`/`multimon-ng`),
  decodes packets; APRS-IS gives global receive via API.

### 7. PoC — Push-to-Talk over Cellular (FirstNet / ESN / ViLTE)
- **Mechanism.** Broadband PTT over LTE/5G. Standards-based is **3GPP MCPTT** (Mission Critical
  Push-To-Talk); carriers/vendors also run proprietary OTT PoC. Data rides normal IP bearers.
- **PC → unit/talkgroup.** There is **no direct RF** — the connector uses the carrier/vendor **app SDK or
  network API** (FirstNet/AT&T MCPTT client, UK ESN, or a vendor PoC platform) over cellular data. A PC
  sends status text to a PTT group / user through that API. APRS-IS-style status sharing is possible over
  the same broadband link.
- **Receive.** The same app/network API delivers inbound messages/data to the PC.

### 8. Analog MDC-1200 / ANI / FFSK
- **Mechanism.** On analog FM, a Motorola **MDC-1200** (or GE-Star, Kenwood Fleetsync) burst encodes unit
  ID, emergency, and a few status bits via FFSK. Legacy but still widely present.
- **PC → unit/talkgroup.** A PC driving a serial/USB analog radio (or a dedicated MDC encoder on the
  radio accessory port) can originate an MDC-1200 status/ANI burst to a unit ID. Software-defined
  encoders (e.g. `mdc1200` tools) generate the FFSK for transmission via the radio's data/accessory port.
- **Receive.** `multimon-ng` on an **RTL-SDR** (or a USB radio with MDC decode) detects MDC-1200, GE-Star,
  and Fleetsync bursts, yielding unit ID + status to the PC.

---

## 3. Vendor / name notes (verification)

- **Teltronic** (Spanish) is the real TETRA/P25 infrastructure vendor; the brief's "Telestra" is almost
  certainly a misspelling — use **Teltronic**. (Confirmed: ETSI TETRA, P25 infrastructure.)
- **Twin Earth** is a real but niche UK maker of serial radio modems / RoIP-style gateways (not a
  Wikipedia-listed entity); treat as one option among USB radio-modem / Tait / generic serial-radio
  gateways for analog/digital injection.
- **SAIT** (SAIT Communications) is a real supplier of TETRA/P25 dispatch and data-gateway equipment
  (TETRA SDS gateways, P25 DFSI/CSSI interfaces) — valid as a data-gateway vendor.
- **Telestra** should be corrected to **Teltronic** in any ARGUS docs.
- The receive side for digital standards (DMR, NXDN, dPMR, MDC-1200, POCSAG/FLEX paging) is well covered
  by the open-source **`multimon-ng`** decoder running on an **RTL-SDR**; this is the cheapest "PC
  receives status" path for monitoring.

---

## 4. Legality & fail-closed requirement (mandatory)

> A system that transmits on emergency-services radio **must operate ONLY on frequencies the operator is
> licensed/authorized for**, and **ONLY on authorized public-safety talkgroups**. Transmitting on
> licensed public-safety spectrum without authorization is unlawful in essentially every jurisdiction
> (e.g. FCC Part 90 in the US, Ofcom in the UK, national equivalents in the EU/Asia). APRS/AX.25 on
> ham bands requires an amateur license; PoC requires carrier authorization.

**ARGUS connector must fail-closed:**
- Hard-coded, tamper-resistant allow-list of authorized frequencies and talkgroups/Unit-IDs.
- Default-deny: if config/auth is missing or invalid, the connector must **NOT transmit** (fail-closed),
  and must limit itself to receive-only or off.
- No ability to key up arbitrary public-safety channels; transmit gated behind verified authorization.
- Operator is responsible for licensing; the connector should surface the active authorization and refuse
  operation outside it.

---

## 5. Summary of the "PC sends a status message" paths (decision aid)

- **Trunked/digital public-safety core (TETRA, P25):** use the vendor switch **console/SSI/ISI/CSSI**
  interface, or a USB terminal radio with vendor SDK → address by SSI/TSI or Unit-ID/TGID.
- **Commercial digital (DMR, NXDN, dPMR):** USB/serial radio + SDK, or network gateway
  (BrandMeister/DMR-MARC) → address by DMR-ID / Unit-ID / Group-ID.
- **Ham/civic (APRS/AX.25):** TNC (`direwolf`) + FM radio, or APRS-IS API → address by callsign.
- **Broadband (PoC/MCPTT):** carrier/vendor app SDK over LTE/5G → address by PTT group/user.
- **Legacy analog (MDC-1200):** analog radio + FFSK encoder on accessory port → address by unit ID.
- **Receive-only monitoring (all FSK/digital voice):** RTL-SDR + `multimon-ng` / OP25 / DSD.

---
*Prepared as research only. No code was written. All standards cited are public (ETSI, TIA/APCO, 3GPP,
ARRL/AX.25) or documented vendor interfaces.*
