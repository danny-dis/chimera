import type {
  ConfidenceEnvelope,
  LineageEntry,
  OntologyLink,
  OntologyObject,
} from '@argus/ontology';

/**
 * Kismet device as emitted by Kismet's REST/JSON device dump.
 * Defensive use: only the OPERATOR'S OWN site/BSSIDs are ever ingested.
 */
export interface KismetDevice {
  mac: string;
  bssid?: string;
  type?: string;
  signal?: number;
  channel?: number;
  location?: { lat: number; lon: number; accuracyM?: number };
  packets?: number;
}

/**
 * Raw rtl-sdr spectrum sample. These are anonymous power readings across a
 * band — no MAC identity, so the authorized-prefix gate does NOT apply to the
 * raw signals themselves (only to identified devices in other tools).
 */
export interface RtlSdrSample {
  freqHz: number;
  bandwidthHz: number;
  detectedSignals?: Array<{
    type: string;
    powerDbm: number;
    centerFreqHz: number;
  }>;
  observedAt: string;
}

export type BettercapDeviceType = 'wifi' | 'ble' | 'ethernet';

/**
 * bettercap device record (wifi/ble/ethernet). Carries a MAC that MUST pass the
 * authorized-prefix gate before anything is emitted.
 */
export interface BettercapDevice {
  mac: string;
  vendor?: string;
  name?: string;
  rssi?: number;
  type: BettercapDeviceType;
  bssid?: string;
}

/**
 * Options shared by every defensive parser. `sensorId` identifies the capturing
 * sensor; `authorizedPrefixes` is the defensive allow-list; `observedAt` is the
 * capture timestamp (ISO-8601).
 */
export interface ParserOpts {
  sensorId: string;
  authorizedPrefixes: string[];
  observedAt: string;
  tenantId?: string;
  classification?: string;
  compartments?: string[];
}

/**
 * Canonical defensive result. `objects`/`links` are ONLY populated for
 * in-range (authorized) devices. `rejected` records every MAC that failed the
 * boundary check and was therefore never emitted.
 */
export interface DefensiveScanResult {
  objects: OntologyObject[];
  links: OntologyLink[];
  rejected: string[];
}

/** Re-exported canonical types for downstream consumers. */
export type { ConfidenceEnvelope, LineageEntry, OntologyLink, OntologyObject };
