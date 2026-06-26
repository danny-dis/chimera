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

export {
  loadSkill,
  loadSkillsForMode,
  resolveSkillPath,
  parseSkillFile,
  buildInputsSchema,
  warnLegacySkillPath,
  _resetLegacyWarnings,
  resolveSkillPack,
  listAllSkills,
} from './skill-loader.js';

export type { LoadedSkill, SkillRecord, SkillSource, LoadOptions } from './skill-loader.js';

export { SKILL_BUNDLES } from './skill-bundles.js';

export { parseSkillPack } from './skill-pack.js';
export type { SkillPack } from './skill-pack.js';
