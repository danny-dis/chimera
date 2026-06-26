"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowAutoLoader = exports.WorkflowLoader = exports.workflowLoaderSchema = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const yaml_1 = require("yaml");
const registry_js_1 = require("./registry.js");
/**
 * Zod schema for the on-disk workflow file format (YAML or JSON).
 *
 * YAML library choice: `yaml` (https://github.com/eemeli/yaml) — ~50KB,
 * zero runtime dependencies, supports YAML 1.2, and ships with permissive
 * parse() that accepts plain JSON for `.json` files too. This avoids pulling
 * in `js-yaml` (larger, has deps) or `yamljs` (legacy).
 */
exports.workflowLoaderSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'name is required'),
    description: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    steps: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1, 'step.id is required'),
        kind: zod_1.z.enum(['llm', 'tool', 'parallel', 'sequence', 'gate', 'loop']),
        config: zod_1.z.record(zod_1.z.unknown()).default({}),
        required: zod_1.z.boolean().optional(),
    }))
        .min(1, 'steps must contain at least one step'),
});
/**
 * Loads workflow files from disk and validates them against `workflowLoaderSchema`.
 *
 * The constructor accepts a `defaultDir` used by `loadFromDir()` when the
 * caller does not pass an explicit directory. Individual `loadFromFile()`
 * calls take an absolute path.
 */
class WorkflowLoader {
    defaultDir;
    constructor(defaultDir) {
        this.defaultDir = defaultDir;
    }
    /**
     * Load a single workflow file by absolute path. Extension determines the
     * parser: `.yaml`/`.yml` use the YAML parser; `.json` uses JSON.parse.
     */
    async loadFromFile(filePath) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        const raw = await fs_1.promises.readFile(filePath, 'utf-8');
        const data = this.parseContent(raw, ext);
        const parsed = exports.workflowLoaderSchema.safeParse(data);
        if (!parsed.success) {
            const issues = parsed.error.issues
                .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
                .join('; ');
            throw new Error(`Invalid workflow file '${filePath}': ${issues}`);
        }
        return { ...parsed.data, path: filePath };
    }
    /**
     * Load every `.yaml`, `.yml`, and `.json` file in `dir` (non-recursive).
     * Invalid files throw — fail loud rather than silently dropping work.
     */
    async loadFromDir(dir = this.defaultDir ?? '') {
        if (!dir) {
            throw new Error('WorkflowLoader.loadFromDir: directory not specified');
        }
        const entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
        const files = entries
            .filter((e) => e.isFile())
            .map((e) => e.name)
            .filter((name) => /\.(ya?ml|json)$/i.test(name))
            .sort();
        const workflows = [];
        for (const name of files) {
            const filePath = path_1.default.join(dir, name);
            const wf = await this.loadFromFile(filePath);
            workflows.push(wf);
        }
        return workflows;
    }
    parseContent(raw, ext) {
        if (ext === '.json') {
            try {
                return JSON.parse(raw);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                throw new Error(`Invalid JSON: ${message}`);
            }
        }
        // .yaml / .yml — and as a courtesy, anything else: YAML is a superset of JSON
        return (0, yaml_1.parse)(raw);
    }
}
exports.WorkflowLoader = WorkflowLoader;
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
class WorkflowAutoLoader {
    warnedLegacy = new Set();
    loader;
    constructor() {
        this.loader = new WorkflowLoader();
    }
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
    async loadIntoRegistry(workspaceRoot) {
        const registry = new registry_js_1.WorkflowRegistry();
        const newDir = path_1.default.join(workspaceRoot, '.chimera', 'workflows');
        const legacyDir = path_1.default.join(workspaceRoot, '.kilo', 'workflows');
        let dir = newDir;
        try {
            const probe = await fs_1.promises.readdir(newDir);
            if (probe.length === 0 && (await this.dirExists(legacyDir))) {
                dir = legacyDir;
                this.warnLegacy(legacyDir);
            }
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                if (await this.dirExists(legacyDir)) {
                    dir = legacyDir;
                    this.warnLegacy(legacyDir);
                }
                else {
                    return { registry, workflows: [] };
                }
            }
            else {
                throw err;
            }
        }
        const workflows = await this.loader.loadFromDir(dir);
        for (const wf of workflows) {
            registry.register(wf);
        }
        return { registry, workflows };
    }
    async dirExists(p) {
        try {
            const s = await fs_1.promises.stat(p);
            return s.isDirectory();
        }
        catch {
            return false;
        }
    }
    warnLegacy(legacyPath) {
        if (this.warnedLegacy.has(legacyPath))
            return;
        this.warnedLegacy.add(legacyPath);
        process.stderr.write(`[chimera] DEPRECATION: reading workflows from legacy path '${legacyPath}'. ` +
            "Move the files to '<workspace>/.chimera/workflows/'. " +
            'Legacy .kilo/ support will be removed in a future release.\n');
    }
}
exports.WorkflowAutoLoader = WorkflowAutoLoader;
//# sourceMappingURL=loader.js.map