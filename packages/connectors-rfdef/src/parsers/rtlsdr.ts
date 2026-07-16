import { confidenceFrom, type LineageEntry, type OntologyLink, type OntologyObject } from '@argus/ontology';
import type { DefensiveScanResult, ParserOpts, RtlSdrSample } from '../types.js';

const SCHEMA_VERSION = 'rfdef/1.0';

function security(opts: ParserOpts) {
  return {
    classification: opts.classification ?? 'UNCLASSIFIED',
    compartments: opts.compartments ?? [],
    tenantId: opts.tenantId ?? 'argus',
  };
}

function lineageFor(source: string, ref: string, observedAt: string): LineageEntry {
  return {
    source,
    weight: 0.8,
    ref,
    agentType: 'sensor',
    generatedAt: observedAt,
  };
}

/**
 * Parse a raw rtl-sdr spectrum sample.
 *
 * Raw spectrum power readings carry NO MAC identity, so the authorized-prefix
 * gate does NOT apply to the signals themselves (per the defensive model: the
 * gate guards *identified* devices only). We always emit:
 *   - one 'Sensor' object for the SDR capture (id `rf:sensor:sdr:<freqHz>`)
 *   - one 'Asset' object per detected signal (`rf:sig:<centerFreqHz>`)
 *   - an 'observed_at' link from each signal Asset to the SDR Sensor.
 */
export function parseRtlSdr(sample: RtlSdrSample, opts: ParserOpts): DefensiveScanResult {
  const result: DefensiveScanResult = { objects: [], links: [], rejected: [] };
  const observedAt = sample.observedAt ?? opts.observedAt;

  const sensorId = `rf:sensor:sdr:${sample.freqHz}`;
  const sensorRef = `rtlsdr:${sample.freqHz}`;

  const sensor: OntologyObject = {
    id: sensorId,
    objectType: 'Sensor',
    properties: {
      tool: 'rtlsdr',
      sensorId: opts.sensorId,
      centerFreqHz: sample.freqHz,
      bandwidthHz: sample.bandwidthHz,
      captureId: sample.freqHz,
    },
    security: security(opts),
    confidence: confidenceFrom([lineageFor('rtlsdr', sensorRef, observedAt)], SCHEMA_VERSION),
    valid: { start: observedAt },
    lastObserved: observedAt,
  };
  result.objects.push(sensor);

  const signals = sample.detectedSignals ?? [];
  for (const sig of signals) {
    const sigId = `rf:sig:${sig.centerFreqHz}`;
    const sigObj: OntologyObject = {
      id: sigId,
      objectType: 'Asset',
      properties: {
        tool: 'rtlsdr',
        sensorId: opts.sensorId,
        signalType: sig.type,
        powerDbm: sig.powerDbm,
        centerFreqHz: sig.centerFreqHz,
        bandwidthHz: sample.bandwidthHz,
      },
      security: security(opts),
      confidence: confidenceFrom([lineageFor('rtlsdr', `rtlsdr:${sig.centerFreqHz}`, observedAt)], SCHEMA_VERSION),
      valid: { start: observedAt },
      lastObserved: observedAt,
    };
    result.objects.push(sigObj);

    const link: OntologyLink = {
      id: `rf:link:observed:${sample.freqHz}:${sig.centerFreqHz}`,
      linkType: 'observed_at',
      sourceId: sigId,
      targetId: sensorId,
      properties: { sensorId: opts.sensorId },
      confidence: confidenceFrom([lineageFor('rtlsdr', `rtlsdr:${sig.centerFreqHz}`, observedAt)], SCHEMA_VERSION),
      valid: { start: observedAt },
    };
    result.links.push(link);
  }

  return result;
}
