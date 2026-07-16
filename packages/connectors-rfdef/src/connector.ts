import { parseKismetDevice } from './parsers/kismet.js';
import { parseRtlSdr } from './parsers/rtlsdr.js';
import { parseBettercapDevice } from './parsers/bettercap.js';
import type {
  BettercapDevice,
  DefensiveScanResult,
  KismetDevice,
  ParserOpts,
  RtlSdrSample,
} from './types.js';

export type ScanTool = 'kismet' | 'rtlsdr' | 'bettercap';

export interface DefensiveScanInput {
  tool: ScanTool;
  data: unknown;
}

function mergeResults(target: DefensiveScanResult, src: DefensiveScanResult): void {
  target.objects.push(...src.objects);
  target.links.push(...src.links);
  target.rejected.push(...src.rejected);
}

/**
 * Orchestrates conversion of defensive RF tool output into ARGUS canonical
 * objects/links. The defensive boundary is enforced inside each parser: any
 * device whose MAC/BSSID is out of the authorized range is rejected and never
 * emitted.
 *
 * IDs are fully deterministic (derived from MAC/freq + sensorId) — no
 * Math.random is used anywhere.
 */
export class DefensiveRfConnector {
  /** Convert a single scan (one tool's output) to ontology. */
  toOntology(scan: DefensiveScanInput, opts: ParserOpts): DefensiveScanResult {
    const result: DefensiveScanResult = { objects: [], links: [], rejected: [] };

    switch (scan.tool) {
      case 'kismet': {
        const dev = scan.data as KismetDevice;
        mergeResults(result, parseKismetDevice(dev, opts));
        break;
      }
      case 'rtlsdr': {
        const sample = scan.data as RtlSdrSample;
        mergeResults(result, parseRtlSdr(sample, opts));
        break;
      }
      case 'bettercap': {
        const dev = scan.data as BettercapDevice;
        mergeResults(result, parseBettercapDevice(dev, opts));
        break;
      }
      default: {
        const _exhaustive: never = scan.tool;
        throw new Error(`Unknown RF tool: ${String(_exhaustive)}`);
      }
    }

    return result;
  }

  /** Convert a batch of scans; results are concatenated. */
  toOntologyBatch(scans: DefensiveScanInput[], opts: ParserOpts): DefensiveScanResult {
    const result: DefensiveScanResult = { objects: [], links: [], rejected: [] };
    for (const scan of scans) {
      mergeResults(result, this.toOntology(scan, opts));
    }
    return result;
  }
}
