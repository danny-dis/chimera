import { describe, expect, it } from 'vitest';
import { isAuthorizedMac } from '../authorize.js';
import { parseKismetDevice } from '../parsers/kismet.js';
import { parseRtlSdr } from '../parsers/rtlsdr.js';
import { parseBettercapDevice } from '../parsers/bettercap.js';
import { DefensiveRfConnector } from '../connector.js';
import {
  AUTHORIZED_PREFIXES,
  FIXTURE_OPTS,
  bettercapAuthorized,
  bettercapUnauthorized,
  kismetAuthorized,
  kismetUnauthorized,
  rtlsdrSample,
} from '../recipes.js';

const opts = FIXTURE_OPTS;

describe('authorize', () => {
  it('matches authorized OUI prefixes case-insensitively', () => {
    expect(isAuthorizedMac('de:ad:be:ef:00:01', AUTHORIZED_PREFIXES)).toBe(true);
    expect(isAuthorizedMac('DE:AD:BE:EF:00:01', AUTHORIZED_PREFIXES)).toBe(true);
    expect(isAuthorizedMac('aa:bb:cc:dd:ee:ff', AUTHORIZED_PREFIXES)).toBe(true);
  });

  it('rejects out-of-range MACs', () => {
    expect(isAuthorizedMac('11:22:33:44:55:66', AUTHORIZED_PREFIXES)).toBe(false);
    expect(isAuthorizedMac('99:88:77:66:55:44', AUTHORIZED_PREFIXES)).toBe(false);
    expect(isAuthorizedMac('', AUTHORIZED_PREFIXES)).toBe(false);
  });
});

describe('kismet parser', () => {
  it('(a) authorized device -> 1 Asset/Facility, lineage source kismet', () => {
    const r = parseKismetDevice(kismetAuthorized, opts);
    expect(r.rejected).toHaveLength(0);
    expect(r.objects).toHaveLength(1);
    expect(r.objects[0].objectType).toBe('Facility'); // ap + bssid===mac
    expect(r.objects[0].id).toBe('rf:asset:DE:AD:BE:EF:00:01');
    expect(r.objects[0].confidence.lineage[0].source).toBe('kismet');
    expect(r.links[0].linkType).toBe('observed_at');
  });

  it('(b) unauthorized device -> rejected non-empty, objects empty', () => {
    const r = parseKismetDevice(kismetUnauthorized, opts);
    expect(r.objects).toHaveLength(0);
    expect(r.links).toHaveLength(0);
    expect(r.rejected).toContain('11:22:33:44:55:66');
  });

  it('(e) determinism: parseKismetDevice twice -> deep-equal', () => {
    const a = parseKismetDevice(kismetAuthorized, opts);
    const b = parseKismetDevice(kismetAuthorized, opts);
    expect(b).toEqual(a);
  });
});

describe('rtlsdr parser', () => {
  it('(c) sample -> 1 Sensor + N signal Assets + observed_at links', () => {
    const r = parseRtlSdr(rtlsdrSample, opts);
    const sensors = r.objects.filter((o) => o.objectType === 'Sensor');
    const assets = r.objects.filter((o) => o.objectType === 'Asset');
    expect(sensors).toHaveLength(1);
    expect(assets).toHaveLength(rtlsdrSample.detectedSignals?.length ?? 0);
    expect(r.rejected).toHaveLength(0);
    expect(r.links).toHaveLength(rtlsdrSample.detectedSignals?.length ?? 0);
    for (const l of r.links) {
      expect(l.linkType).toBe('observed_at');
      expect(l.targetId).toBe('rf:sensor:sdr:915000000');
    }
  });
});

describe('bettercap parser', () => {
  it('(d) authorized device -> Asset', () => {
    const r = parseBettercapDevice(bettercapAuthorized, opts);
    expect(r.rejected).toHaveLength(0);
    expect(r.objects).toHaveLength(1);
    expect(r.objects[0].objectType).toBe('Asset');
    expect(r.objects[0].id).toBe('rf:asset:DE:AD:BE:00:11:22');
    // bssid is authorized -> 'near' link emitted
    expect(r.links.some((l) => l.linkType === 'near')).toBe(true);
  });

  it('(d) unauthorized device -> rejected', () => {
    const r = parseBettercapDevice(bettercapUnauthorized, opts);
    expect(r.objects).toHaveLength(0);
    expect(r.rejected).toContain('99:88:77:66:55:44');
  });
});

describe('DefensiveRfConnector', () => {
  it('dispatches across tools and merges results', () => {
    const c = new DefensiveRfConnector();
    const r = c.toOntologyBatch(
      [
        { tool: 'kismet', data: kismetAuthorized },
        { tool: 'kismet', data: kismetUnauthorized },
        { tool: 'rtlsdr', data: rtlsdrSample },
        { tool: 'bettercap', data: bettercapAuthorized },
        { tool: 'bettercap', data: bettercapUnauthorized },
      ],
      opts,
    );
    expect(r.objects.length).toBeGreaterThan(0);
    expect(r.rejected).toEqual(['11:22:33:44:55:66', '99:88:77:66:55:44']);
    // Unauthorized devices never appear as objects.
    expect(r.objects.some((o) => o.id.includes('11:22:33:44:55:66'))).toBe(false);
    expect(r.objects.some((o) => o.id.includes('99:88:77:66:55:44'))).toBe(false);
  });
});
