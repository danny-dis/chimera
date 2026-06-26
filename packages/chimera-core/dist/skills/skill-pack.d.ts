import { type SkillRecord } from './skill-loader.js';
export interface SkillPack {
    name: string;
    description: string;
    mode: string;
    skills: string[];
}
/**
 * Parse the content of a `SKILL_PACK.md` file. Throws a descriptive error
 * if the frontmatter is missing required fields or has the wrong shape.
 */
export declare function parseSkillPack(content: string): SkillPack;
/**
 * Resolve a `SkillPack` to a list of skill records. Each named skill is
 * read via `loadSkill`; missing skills are silently dropped. Every
 * returned record is tagged `source: 'pack'` regardless of where the
 * underlying file lives (workspace vs. global).
 */
export declare function resolveSkillPack(pack: SkillPack, workspaceRoot: string): Promise<Array<SkillRecord & {
    source: 'pack';
}>>;
//# sourceMappingURL=skill-pack.d.ts.map