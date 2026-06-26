"use strict";
/**
 * Bundled default commands and workflows for binary distribution.
 *
 * Content lives in `bundled-defaults.generated.ts`, which is regenerated from
 * `.archon/{commands,workflows}/defaults/` by `scripts/generate-bundled-defaults.ts`.
 * This file is the hand-written facade: it re-exports the records and defines
 * the binary-detection helper.
 *
 * Why two files:
 *   - Generated file is pure data — never hand-edited, diff on PRs shows
 *     exactly which defaults changed.
 *   - Facade keeps the documented `isBinaryBuild()` wrapper in a file that
 *     humans own.
 *
 * Why inline strings (and not `import X from '...file.md' with { type: 'text' }`)?
 *   - Node cannot load `type: 'text'` import attributes — it's Bun-specific.
 *     Using plain string literals keeps `@chimera/workflows` importable from
 *     both runtimes, which removes SDK blocker #2.
 *   - Bun still embeds the data at compile time when building the CLI binary,
 *     so runtime behavior is unchanged.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUNDLED_WORKFLOWS = exports.BUNDLED_COMMANDS = void 0;
exports.isBinaryBuild = isBinaryBuild;
// Stub: in binary builds this is set to true at compile time
const BUNDLED_IS_BINARY = false;
var bundled_defaults_generated_js_1 = require("./bundled-defaults.generated.js");
Object.defineProperty(exports, "BUNDLED_COMMANDS", { enumerable: true, get: function () { return bundled_defaults_generated_js_1.BUNDLED_COMMANDS; } });
Object.defineProperty(exports, "BUNDLED_WORKFLOWS", { enumerable: true, get: function () { return bundled_defaults_generated_js_1.BUNDLED_WORKFLOWS; } });
/**
 * Check if the current process is running as a compiled binary (not via Bun CLI).
 *
 * Reads the build-time constant `BUNDLED_IS_BINARY` from `@chimera/paths`.
 * `scripts/build-binaries.sh` rewrites that file to set it to `true` before
 * `bun build --compile` and restores it afterwards.
 *
 * Kept as a function (rather than a direct re-export of `BUNDLED_IS_BINARY`)
 * so tests can use `spyOn(bundledDefaults, 'isBinaryBuild').mockReturnValue(...)`
 * without resorting to `mock.module('@chimera/paths', ...)` — which is
 * process-global and irreversible in Bun and would pollute other test files.
 */
function isBinaryBuild() {
    return BUNDLED_IS_BINARY;
}
//# sourceMappingURL=bundled-defaults.js.map