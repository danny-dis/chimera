import { confidenceFrom, type LineageEntry, type OntologyLink, type OntologyObject } from '@argus/ontology';
import { isAuthorizedMac } from '../authorize.js';
import type { BettercapDevice, DefensiveScanResult, ParserOpts } from '../types.js';

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
 * Parse a single bettercap device into canonical ARGUS objects/links.
 *
 * - WiFi/BLE/Ethernet devices become an 'Asset' — but ONLY if the MAC passes the
 *   authorized-prefix gate (otherwise REJECTED).
 * - If a bssid is present and itself authorized, the device is linked 'near' to
 *   a Facility representing that authorized BSSID.
 * - When `opts` carries a paired counterpart (see DefensiveRfConnector
 *   `communicated_with` handling) and BOTH devices are authorized, a
 *   'communicated_with' link is emitted between them.
 */
export function parseBettercapDevice(
  dev: BettercapDevice,
  opts: ParserOpts,
  pairedWith?: BettercapDevice,
): DefensiveScanResult {
  const result: DefensiveScanResult = { objects: [], links: [], rejected: [] };

  const mac = dev.mac?.trim();
  if (!mac) {
    result.rejected.push('<missing-mac>');
    return result;
  }

  if (!isAuthorizedMac(mac, opts.authorizedPrefixes)) {
    result.rejected.push(mac);
    return result;
  }

  const id = `rf:asset:${mac.toUpperCase()}`;
  const properties: Record<string, unknown> = {
    mac: mac.toUpperCase(),
    tool: 'bettercap',
    sensorId: opts.sensorId,
    deviceType: dev.type,
  };
  if (dev.vendor) properties.vendor = dev.vendor;
  if (dev.name) properties.name = dev.name;
  if (dev.rssi !== undefined) properties.rssi = dev.rssi;
  if (dev.bssid) properties.bssid = dev.bssid.toUpperCase();

  const obj: OntologyObject = {
    id,
    objectType: 'Asset',
    properties,
    security: security(opts),
    confidence: confidenceFrom([lineageFor('bettercap', `bettercap:${mac.toUpperCase()}`, opts.observedAt)], SCHEMA_VERSION),
    valid: { start: opts.observedAt },
    lastObserved: opts.observedAt,
  };
  result.objects.push(obj);

  // 'near' link to an authorized BSSID facility.
  if (dev.bssid && isAuthorizedMac(dev.bssid, opts.authorizedPrefixes)) {
    const bssidFacilityId = `rf:asset:${dev.bssid.toUpperCase()}`;
    const nearLink: OntologyLink = {
      id: `rf:link:near:${mac.toUpperCase()}:${dev.bssid.toUpperCase()}`,
      linkType: 'near',
      sourceId: id,
      targetId: bssidFacilityId,
      properties: { sensorId: opts.sensorId, via: 'bssid' },
      confidence: confidenceFrom([lineageFor('bettercap', `bettercap:${mac.toUpperCase()}`, opts.observedAt)], SCHEMA_VERSION),
      valid: { start: opts.observedAt },
    };
    result.links.push(nearLink);
  }

  // 'communicated_with' link when both ends are authorized.
  if (pairedWith) {
    const pairedMac = pairedWith.mac?.trim();
    if (pairedMac && isAuthorizedMac(pairedMac, opts.authorizedPrefixes)) {
      const commLink: OntologyLink = {
        id: `rf:link:comm:${mac.toUpperCase()}:${pairedMac.toUpperCase()}`,
        linkType: 'communicated_with',
        sourceId: id,
        targetId: `rf:asset:${pairedMac.toUpperCase()}`,
        properties: { sensorId: opts.sensorId },
        confidence: confidenceFrom([lineageFor('bettercap', `bettercap:${mac.toUpperCase()}`, opts.observedAt)], SCHEMA_VERSION),
        valid: { start: opts.observedAt },
      };
      result.links.push(commLink);
    }
  }

  return result;
}
