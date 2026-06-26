"use strict";
// @chimera/core/skills — Skill loader, mode bundles, and SKILL_PACK primitive
//
// Public API for consumers (prompts.ts, future skill-aware tools):
//
//   loadSkillsForMode({ mode, workspaceRoot, eventStream? })  → SkillRecord[]
//   loadSkill(name, workspaceRoot)                            → LoadedSkill | null
//   parseSkillFile(raw)                                        → { frontmatter, body }
//   buildInputsSchema(inputs)                                  → z.ZodTypeAny
//
//   SKILL_BUNDLES                                              → Record<Mode, readonly string[]>
//
//   parseSkillPack(content)                                    → SkillPack
//   resolveSkillPack(pack, workspaceRoot)                      → SkillRecord & { source: 'pack' }[]
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSkillPack = exports.SKILL_BUNDLES = exports.listAllSkills = exports.resolveSkillPack = exports._resetLegacyWarnings = exports.warnLegacySkillPath = exports.buildInputsSchema = exports.parseSkillFile = exports.resolveSkillPath = exports.loadSkillsForMode = exports.loadSkill = void 0;
var skill_loader_js_1 = require("./skill-loader.js");
Object.defineProperty(exports, "loadSkill", { enumerable: true, get: function () { return skill_loader_js_1.loadSkill; } });
Object.defineProperty(exports, "loadSkillsForMode", { enumerable: true, get: function () { return skill_loader_js_1.loadSkillsForMode; } });
Object.defineProperty(exports, "resolveSkillPath", { enumerable: true, get: function () { return skill_loader_js_1.resolveSkillPath; } });
Object.defineProperty(exports, "parseSkillFile", { enumerable: true, get: function () { return skill_loader_js_1.parseSkillFile; } });
Object.defineProperty(exports, "buildInputsSchema", { enumerable: true, get: function () { return skill_loader_js_1.buildInputsSchema; } });
Object.defineProperty(exports, "warnLegacySkillPath", { enumerable: true, get: function () { return skill_loader_js_1.warnLegacySkillPath; } });
Object.defineProperty(exports, "_resetLegacyWarnings", { enumerable: true, get: function () { return skill_loader_js_1._resetLegacyWarnings; } });
Object.defineProperty(exports, "resolveSkillPack", { enumerable: true, get: function () { return skill_loader_js_1.resolveSkillPack; } });
Object.defineProperty(exports, "listAllSkills", { enumerable: true, get: function () { return skill_loader_js_1.listAllSkills; } });
var skill_bundles_js_1 = require("./skill-bundles.js");
Object.defineProperty(exports, "SKILL_BUNDLES", { enumerable: true, get: function () { return skill_bundles_js_1.SKILL_BUNDLES; } });
var skill_pack_js_1 = require("./skill-pack.js");
Object.defineProperty(exports, "parseSkillPack", { enumerable: true, get: function () { return skill_pack_js_1.parseSkillPack; } });
//# sourceMappingURL=index.js.map