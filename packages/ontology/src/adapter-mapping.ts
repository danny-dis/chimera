/**
 * Adapter-to-Ontology type mappings.
 *
 * Each mapping declares how an adapter's ArgusEvent maps to an OntologyObject.
 * This is the declarative registry that the generic bridge (from-event.ts) uses
 * to convert any adapter's output into the canonical ontology graph.
 *
 * P1 (deterministic): pure data declarations, no IO.
 * P5 (blockchain): lineage derived from event.sourceId + event.confidenceScore.
 */

import type {
  ObjectType,
  LinkType,
  OntologyLink,
  SecurityEnvelope,
} from './types.js';

// ── MCP binding types (declared here so adapter mappings carry them) ─────────

/**
 * A single MCP tool binding that enriches ontology objects with external data.
 * Declares how a payload field maps to an MCP tool argument, and how the tool
 * result maps back to ontology object properties.
 */
export interface McpToolBinding {
  /** The MCP tool name (e.g. "dmv_lookup", "cve_lookup"). */
  toolName: string;
  /** Maps adapter payload field paths → MCP tool argument names. */
  inputMapping: Record<string, string>;
  /** Maps MCP result field paths → ontology object property names. */
  outputMapping: Record<string, string>;
  /**
   * If true, a failed MCP call causes the object to be rejected.
   * If false (default), enrichment failure is silently skipped.
   */
  required?: boolean;
}

/**
 * A single source citation that the bridge will produce from an ArgusEvent.
 */
export interface EventLineageSource {
  /** The adapter source id (e.g. "ais", "shodan"). */
  source: string;
  /** Weight derived from event.confidenceScore. */
  weight: number;
}

/**
 * Declarative mapping from an adapter's ArgusEvent → OntologyObject.
 */
export interface AdapterOntologyMapping {
  /** Adapter source id (must match ArgusEvent.sourceId). */
  sourceId: string;
  /** The ObjectType this adapter produces. */
  objectType: ObjectType;
  /** Extract position from event coordinates [lon, lat, alt]. */
  positionExtractor: (event: { coordinates: [number, number, number]; payload: Record<string, unknown> }) =>
    { lat: number; lon: number; accuracyM?: number } | undefined;
  /** Extract domain-specific properties from event payload. */
  propertyExtractor: (event: { payload: Record<string, unknown>; timestamp: number }) =>
    Record<string, unknown>;
  /** Extract links to existing ontology objects (optional). */
  linkExtractor?: (event: { payload: Record<string, unknown>; eventId: string }) =>
    Array<{ linkType: LinkType; targetId: string; properties?: Record<string, unknown> }>;
  /** Default security envelope for objects from this adapter. */
  defaultSecurity: Partial<SecurityEnvelope>;
  /** Default compartments derived from source type. */
  defaultCompartments: string[];
  /**
   * MCP tool bindings for external enrichment (optional).
   * When set, the MCP enricher calls the declared tool after object creation
   * and merges the result into the object's properties.
   */
  mcpBindings?: McpToolBinding[];
}

// ── Helper extractors ────────────────────────────────────────────────────────

function defaultPosition(event: { coordinates: [number, number, number] }) {
  const [lon, lat] = event.coordinates;
  if (lat === 0 && lon === 0) return undefined;
  return { lat, lon };
}

function passthroughProperties(event: { payload: Record<string, unknown> }) {
  return { ...event.payload };
}

// ── Pre-built mappings (66 adapters) ─────────────────────────────────────────

/**
 * Canonical mapping registry. All 66 wired adapters mapped to ontology types.
 */

// ── Factory ─────────────────────────────────────────────────────────────────

interface AdapterMappingOpts {
  position?: PositionExtractor;
  classification?: SecurityClassification;
  compartments?: string[];
  links?: LinkExtractor;
  mcp?: McpToolBinding[];
}

function map(
  sourceId: string,
  objectType: ObjectType,
  properties: PropertyExtractor,
  opts: AdapterMappingOpts = {},
): AdapterOntologyMapping {
  const m: AdapterOntologyMapping = {
    sourceId,
    objectType,
    positionExtractor: opts.position ?? defaultPosition,
    propertyExtractor: properties,
    defaultSecurity: { classification: opts.classification ?? 'UNCLASSIFIED' },
    defaultCompartments: opts.compartments ?? [],
  };
  if (opts.mcp) m.mcpBindings = opts.mcp;
  if (opts.links) m.linkExtractor = opts.links;
  return m;
}

type PositionExtractor = AdapterOntologyMapping['positionExtractor'];
type PropertyExtractor = AdapterOntologyMapping['propertyExtractor'];
type LinkExtractor = NonNullable<AdapterOntologyMapping['linkExtractor']>;
type SecurityClassification = NonNullable<AdapterOntologyMapping['defaultSecurity']>['classification'];

export const ADAPTER_MAPPINGS: Record<string, AdapterOntologyMapping> = {
  ais: map('ais', 'Vessel', (e), {opts_str}),
  ads-b: map('ads-b', 'Aircraft', (e), {opts_str}),
  aviation: map('aviation', 'Aircraft', (e), {opts_str}),
  maritime: map('maritime', 'Vessel', (e), {opts_str}),
  satellite: map('satellite', 'Sensor', (e), {opts_str}),
  shodan: map('shodan', 'Sensor', (e), {opts_str}),
  greynoise: map('greynoise', 'Sensor', (e), {opts_str}),
  otx: map('otx', 'Sensor', (e), {opts_str}),
  urlhaus: map('urlhaus', 'Sensor', (e), {opts_str}),
  threatfox: map('threatfox', 'Incident', (e), {opts_str}),
  malwarebazaar: map('malwarebazaar', 'Incident', (e), {opts_str}),
  asn-enrichment: map('asn-enrichment', 'Sensor', (e), {opts_str}),
  hibp: map('hibp', 'Incident', (e), {opts_str}),
  darkweb-source: map('darkweb-source', 'Incident', (e), {opts_str}),
  cve: map('cve', 'Incident', (e), {opts_str}),
  urlhaus-feed: map('urlhaus-feed', 'Incident', (e), {opts_str}),
  certificate-transparency: map('certificate-transparency', 'Sensor', (e), {opts_str}),
  ripe: map('ripe', 'Sensor', (e), {opts_str}),
  cyber: map('cyber', 'Incident', (e), {opts_str}),
  infrastructure: map('infrastructure', 'Facility', (e), {opts_str}),
  military: map('military', 'Incident', (e), {opts_str}),
  radiation: map('radiation', 'Event', (e), {opts_str}),
  sanctions: map('sanctions', 'Person', (e), {opts_str}),
  fires: map('fires', 'Event', (e), {opts_str}),
  firms: map('firms', 'Event', (e), {opts_str}),
  wildfire: map('wildfire', 'Event', (e), {opts_str}),
  weather: map('weather', 'Event', (e), {opts_str}),
  seismic: map('seismic', 'Event', (e), {opts_str}),
  seismology: map('seismology', 'Event', (e), {opts_str}),
  air-quality: map('air-quality', 'Event', (e), {opts_str}),
  climate: map('climate', 'Event', (e), {opts_str}),
  telegram: map('telegram', 'Feed', (e), {opts_str}),
  reddit: map('reddit', 'Feed', (e), {opts_str}),
  instagram-social: map('instagram-social', 'Feed', (e), {opts_str}),
  x-social: map('x-social', 'Feed', (e), {opts_str}),
  facebook-social: map('facebook-social', 'Feed', (e), {opts_str}),
  discord-social: map('discord-social', 'Feed', (e), {opts_str}),
  youtube-social: map('youtube-social', 'Feed', (e), {opts_str}),
  tiktok-social: map('tiktok-social', 'Feed', (e), {opts_str}),
  linkedin-social: map('linkedin-social', 'Feed', (e), {opts_str}),
  whatsapp-business: map('whatsapp-business', 'Feed', (e), {opts_str}),
  bluesky-social: map('bluesky-social', 'Feed', (e), {opts_str}),
  mastodon-social: map('mastodon-social', 'Feed', (e), {opts_str}),
  weibo-social: map('weibo-social', 'Feed', (e), {opts_str}),
  vk-social: map('vk-social', 'Feed', (e), {opts_str}),
  threads-social: map('threads-social', 'Feed', (e), {opts_str}),
  twitch-social: map('twitch-social', 'Feed', (e), {opts_str}),
  news: map('news', 'Feed', (e), {opts_str}),
  rss: map('rss', 'Feed', (e), {opts_str}),
  fediverse: map('fediverse', 'Feed', (e), {opts_str}),
  broadcasts: map('broadcasts', 'Feed', (e), {opts_str}),
  cctv: map('cctv', 'Sensor', (e), {opts_str}),
  exif: map('exif', 'Event', (e), {opts_str}),
  wigle: map('wigle', 'Sensor', (e), {opts_str}),
  opencellid: map('opencellid', 'Sensor', (e), {opts_str}),
  gdelt: map('gdelt', 'Incident', (e), {opts_str}),
  conflict: map('conflict', 'Incident', (e), {opts_str}),
  country-risk: map('country-risk', 'Event', (e), {opts_str}),
  displacement: map('displacement', 'Event', (e), {opts_str}),
  economic: map('economic', 'Feed', (e), {opts_str}),
  trade: map('trade', 'Feed', (e), {opts_str}),
  supply-chain: map('supply-chain', 'Event', (e), {opts_str}),
  crypto: map('crypto', 'Event', (e), {opts_str}),
  satellite-imagery: map('satellite-imagery', 'Sensor', (e), {opts_str}),
  noaa-alerts: map('noaa-alerts', 'Event', (e), {opts_str}),
  alpr: map('alpr', 'Vehicle', (e), {opts_str}),
};

 */
export function getAdapterMapping(sourceId: string): AdapterOntologyMapping | undefined {
  return ADAPTER_MAPPINGS[sourceId];
}

/**
 * List all registered adapter source ids.
 */
export function getRegisteredAdapters(): string[] {
  return Object.keys(ADAPTER_MAPPINGS);
}
