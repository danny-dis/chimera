import { z } from 'zod';
import type { WorkflowDefinition } from './types.js';
import { WorkflowRegistry } from './registry.js';
/**
 * Zod schema for the on-disk workflow file format (YAML or JSON).
 *
 * YAML library choice: `yaml` (https://github.com/eemeli/yaml) — ~50KB,
 * zero runtime dependencies, supports YAML 1.2, and ships with permissive
 * parse() that accepts plain JSON for `.json` files too. This avoids pulling
 * in `js-yaml` (larger, has deps) or `yamljs` (legacy).
 */
export declare const workflowLoaderSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<["llm", "tool", "parallel", "sequence", "gate", "loop"]>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        required: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id?: string;
        kind?: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config?: Record<string, unknown>;
        required?: boolean;
    }, {
        id?: string;
        kind?: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config?: Record<string, unknown>;
        required?: boolean;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    description?: string;
    name?: string;
    tags?: string[];
    steps?: {
        id?: string;
        kind?: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config?: Record<string, unknown>;
        required?: boolean;
    }[];
}, {
    description?: string;
    name?: string;
    tags?: string[];
    steps?: {
        id?: string;
        kind?: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config?: Record<string, unknown>;
        required?: boolean;
    }[];
}>;
/**
 * Loads workflow files from disk and validates them against `workflowLoaderSchema`.
 *
 * The constructor accepts a `defaultDir` used by `loadFromDir()` when the
 * caller does not pass an explicit directory. Individual `loadFromFile()`
 * calls take an absolute path.
 */
export declare class WorkflowLoader {
    private readonly defaultDir?;
    constructor(defaultDir?: string);
    /**
     * Load a single workflow file by absolute path. Extension determines the
     * parser: `.yaml`/`.yml` use the YAML parser; `.json` uses JSON.parse.
     */
    loadFromFile(filePath: string): Promise<WorkflowDefinition>;
    /**
     * Load every `.yaml`, `.yml`, and `.json` file in `dir` (non-recursive).
     * Invalid files throw — fail loud rather than silently dropping work.
     */
    loadFromDir(dir?: string): Promise<WorkflowDefinition[]>;
    private parseContent;
}
/**
 * Convenience facade: given a workspace root, scan
 * `<workspace>/.chimera/workflows/` for `.yaml`/`.yml`/`.json` workflow
 * files and register each valid one into a fresh `WorkflowRegistry`.
 *
 * Compatibility shim: if the new path is absent but the legacy
 * `<workspace>/.kilo/workflows/` is present, the loader falls back to the
 * legacy location and emits a one-time stderr deprecation warning.
 *
 * The CLI and tests both go through this — it centralizes the convention
 * so consumers don't have to know the directory layout.
 */
export declare class WorkflowAutoLoader {
    private readonly warnedLegacy;
    private readonly loader;
    constructor();
    /**
     * Build a registry populated with every valid workflow found under
     * `<workspace>/.chimera/workflows` (or the legacy `.kilo/workflows` if
     * the new dir is missing). Returns the registry and the list of loaded
     * definitions; the CLI uses the count for telemetry, the registry for
     * command dispatch.
     *
     * Missing directory is not an error — returns an empty registry so a
     * workspace with no workflows still boots.
     */
    loadIntoRegistry(workspaceRoot: string): Promise<{
        registry: WorkflowRegistry;
        workflows: WorkflowDefinition[];
    }>;
    private dirExists;
    private warnLegacy;
}
//# sourceMappingURL=loader.d.ts.map