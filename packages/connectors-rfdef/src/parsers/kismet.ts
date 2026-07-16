import { confidenceFrom, type LineageEntry, type OntologyLink, type OntologyObject } from '@argus/ontology';
import { isAuthorizedMac } from '../authorize.js';
import type { DefensiveScanResult, KismetDevice, ParserOpts } from '../types.js';

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
    weight: 0.85,
    ref,
    agentType: 'sensor',
    generatedAt: observedAt,
  };
}

/**
 * Parse a single Kismet device into canonical ARGUS objects/links.
 *
 * - Access points (bssid === mac, or type 'ap') become a 'Facility' (the
 *   authorized BSSID) plus a 'Sensor' role; regular client devices become an
 *   'Asset'.
 * - The device is REJECTED if its MAC (or BSSID, when present) is not in the
 *   authorized-prefix allow-list.
 */
export function parseKismetDevice(dev: KismetDevice, opts: ParserOpts): DefensiveScanResult {
  const result: DefensiveScanResult = { objects: [], links: [], rejected: [] };

  const mac = dev.mac?.trim();
  if (!mac) {
    result.rejected.push('<missing-mac>');
    return result;
  }

  const candidate = dev.bssid?.trim() ?? mac;
  if (!isAuthorizedMac(candidate, opts.authorizedPrefixes)) {
    result.rejected.push(mac);
    return result;
  }

  const isAp = dev.type === 'ap' || (dev.bssid != null && dev.bssid.trim().toUpperCase() === mac.toUpperCase());
  const objectType = isAp ? 'Facility' : 'Asset';
  const id = `rf:asset:${mac.toUpperCase()}`;

  const properties: Record<string, unknown> = {
    mac: mac.toUpperCase(),
    tool: 'kismet',
    sensorId: opts.sensorId,
  };
  if (dev.bssid) properties.bssid = dev.bssid.toUpperCase();
  if (dev.type) properties.deviceType = dev.type;
  if (dev.signal !== undefined) properties.signal = dev.signal;
  if (dev.channel !== undefined) properties.channel = dev.channel;
  if (dev.packets !== undefined) properties.packets = dev.packets;
  if (isAp) properties.role = 'access_point';

  const obj: OntologyObject = {
    id,
    objectType,
    properties,
    security: security(opts),
    confidence: confidenceFrom([lineageFor('kismet', `kismet:${mac.toUpperCase()}`, opts.observedAt)], SCHEMA_VERSION),
    valid: { start: opts.observedAt },
    lastObserved: opts.observedAt,
  };
  if (dev.location) {
    obj.position = {
      lat: dev.location.lat,
      lon: dev.location.lon,
      accuracyM: dev.location.accuracyM,
    };
  }
  result.objects.push(obj);

  // Link the captured device to the sensor that observed it.
  const link: OntologyLink = {
    id: `rf:link:observed:${opts.sensorId}:${mac.toUpperCase()}`,
    linkType: 'observed_at',
    sourceId: id,
    targetId: `rf:sensor:kismet:${opts.sensorId}`,
    properties: { sensorId: opts.sensorId },
    confidence: confidenceFrom([lineageFor('kismet', `kismet:${mac.toUpperCase()}`, opts.observedAt)], SCHEMA_VERSION),
    valid: { start: opts.observedAt },
  };
  result.links.push(link);

  return result;
}
