import type {
  BettercapDevice,
  KismetDevice,
  ParserOpts,
  RtlSdrSample,
} from './types.js';

/** Default observation timestamp used by fixtures. */
const FIXTURE_OBSERVED_AT = '2026-07-14T00:00:00.000Z';

/** Authorized OUI/prefixes for the operator's own site (defensive allow-list). */
export const AUTHORIZED_PREFIXES = ['DE:AD:BE', 'AA:BB'];

export const FIXTURE_OPTS: ParserOpts = {
  sensorId: 'site-sensor-001',
  authorizedPrefixes: AUTHORIZED_PREFIXES,
  observedAt: FIXTURE_OBSERVED_AT,
  tenantId: 'argus',
  classification: 'UNCLASSIFIED',
  compartments: [],
};

/** Authorized Kismet AP (BSSID === MAC, in the DE:AD:BE range). */
export const kismetAuthorized: KismetDevice = {
  mac: 'DE:AD:BE:EF:00:01',
  bssid: 'DE:AD:BE:EF:00:01',
  type: 'ap',
  signal: -42,
  channel: 6,
  location: { lat: 47.6062, lon: -122.3321, accuracyM: 8 },
  packets: 1337,
};

/** Unauthorized Kismet device — must be rejected by the gate. */
export const kismetUnauthorized: KismetDevice = {
  mac: '11:22:33:44:55:66',
  type: 'client',
  signal: -70,
  channel: 11,
  packets: 12,
};

/** Raw rtl-sdr spectrum capture with two detected signals. */
export const rtlsdrSample: RtlSdrSample = {
  freqHz: 915_000_000,
  bandwidthHz: 2_000_000,
  observedAt: FIXTURE_OBSERVED_AT,
  detectedSignals: [
    { type: 'lora', powerDbm: -85, centerFreqHz: 915_200_000 },
    { type: 'fsk', powerDbm: -78, centerFreqHz: 915_800_000 },
  ],
};

/** Authorized bettercap BLE device (DE:AD:BE range). */
export const bettercapAuthorized: BettercapDevice = {
  mac: 'DE:AD:BE:00:11:22',
  vendor: 'Acme',
  name: 'door-sensor-7',
  rssi: -64,
  type: 'ble',
  bssid: 'DE:AD:BE:EF:00:01',
};

/** Unauthorized bettercap BLE device — must be rejected by the gate. */
export const bettercapUnauthorized: BettercapDevice = {
  mac: '99:88:77:66:55:44',
  name: 'unknown-ble',
  rssi: -90,
  type: 'ble',
};
