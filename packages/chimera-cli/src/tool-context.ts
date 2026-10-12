import {
  ToolRegistry,
  ToolExecutor,
  HookExecutor,
  PermissionEngine,
  readOnlyProfile,
  editFilesProfile,
  fullAccessProfile,
  allTools,
} from '@chimera/tools';
import type { Mode } from '@chimera/core';

const WRITE_GATE_TOOLS = [
  { toolPattern: 'write_file', decision: 'ask' as const },
  { toolPattern: 'edit_file', decision: 'ask' as const },
  { toolPattern: 'search_replace', decision: 'ask' as const },
  { toolPattern: 'apply_patch', decision: 'ask' as const },
];

export function buildPermissionEngine(
  mode: Mode,
  yolo: boolean,
  interactive: boolean,
): PermissionEngine {
  // Fail-closed: unknown modes get read-only, never edit/fullAccess.
  const isKnownReadOnly = mode === 'plan' || mode === 'ask' || mode === 'review';
  const isKnownWrite = mode === 'code' || mode === 'debug' || mode === 'oal' || mode === 'auto';
  const profile =
    isKnownReadOnly || !isKnownWrite
      ? readOnlyProfile
      : yolo
        ? fullAccessProfile
        : editFilesProfile;
  const engine = new PermissionEngine(profile);
  if (!yolo && interactive && profile.mode !== 'readOnly') {
    const writeGatePatterns = new Set(WRITE_GATE_TOOLS.map((r) => r.toolPattern));
    engine.loadProfile({
      name: `${profile.name}Interactive`,
      mode: profile.mode,
      rules: [
        ...(profile.rules ?? []).filter(
          (r) => r.toolPattern !== '*' && r.toolPattern !== undefined && !writeGatePatterns.has(r.toolPattern),
        ),
        ...WRITE_GATE_TOOLS,
      ],
    });
  }
  return engine;
}

export interface ToolContext {
  toolRegistry: ToolRegistry;
  toolExecutor: ToolExecutor;
  hookExecutor: HookExecutor;
}

export function createToolContext(
  mode: Mode,
  options?: { yolo?: boolean; interactive?: boolean },
): ToolContext {
  const { yolo = false, interactive = false } = options ?? {};
  const toolRegistry = new ToolRegistry();
  const hookExecutor = new HookExecutor();
  const permissionEngine = buildPermissionEngine(mode, yolo, interactive);
  const toolExecutor = new ToolExecutor(
    toolRegistry,
    () => 'deny' as const,
    permissionEngine,
    hookExecutor,
  );
  for (const tool of allTools) {
    toolRegistry.register(tool as unknown as Parameters<typeof toolRegistry.register>[0]);
  }
  return { toolRegistry, toolExecutor, hookExecutor };
}
