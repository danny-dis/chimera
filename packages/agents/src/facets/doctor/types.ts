export type ComponentType = 'package' | 'service' | 'database' | 'api' | 'worker';

export type ComponentStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ComponentDetails {
  typecheck?: boolean;
  healthEndpoint?: boolean;
  errors?: string[];
  warnings?: string[];
  version?: string;
  uptime?: number;
  latency?: number;
  [key: string]: unknown;
}

export interface ComponentHealth {
  id: string;
  type: ComponentType;
  status: ComponentStatus;
  lastCheck: string;
  details: ComponentDetails;
}