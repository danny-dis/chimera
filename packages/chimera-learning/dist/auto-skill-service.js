"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoSkillService = exports.AutoSkillConfigSchema = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
exports.AutoSkillConfigSchema = zod_1.z.object({
    minPatternCount: zod_1.z.number().positive().default(3),
    minConfidence: zod_1.z.number().min(0).max(1).default(0.6),
    skillsDir: zod_1.z.string().default('.chimera/skills'),
});
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Detects repeated tool patterns across sessions and synthesizes
 * reusable skill files in `.chimera/skills/`.
 */
class AutoSkillService {
    analyzer;
    skillSynth;
    config;
    workspaceRoot;
    constructor(analyzer, skillSynth, config, workspaceRoot) {
        this.analyzer = analyzer;
        this.skillSynth = skillSynth;
        this.config = exports.AutoSkillConfigSchema.parse(config);
        this.workspaceRoot = workspaceRoot;
    }
    async detectAndSynthesize(checkpoints) {
        const result = { created: [], updated: [] };
        if (checkpoints.length < this.config.minPatternCount)
            return result;
        const clustered = this.analyzer.analyzeBatch(checkpoints);
        for (const cluster of clustered.domainClusters) {
            if (cluster.sessions.length < this.config.minPatternCount)
                continue;
            if (cluster.successRate < this.config.minConfidence)
                continue;
            const synthesis = this.skillSynth.synthesizeFromCluster(cluster);
            if (!synthesis?.skill)
                continue;
            const { name, description, content, specialization } = synthesis.skill;
            const slug = slugify(name);
            const skillPath = path_1.default.join(this.workspaceRoot, this.config.skillsDir, `${slug}.md`);
            const dir = path_1.default.dirname(skillPath);
            if (!(0, fs_1.existsSync)(dir))
                (0, fs_1.mkdirSync)(dir, { recursive: true });
            const frontmatter = [
                '---',
                `name: ${name}`,
                `description: ${description}`,
                `specialization: ${JSON.stringify(specialization)}`,
                '---',
                '',
            ].join('\n');
            (0, fs_1.writeFileSync)(skillPath, frontmatter + content, 'utf-8');
            result.created.push(slug);
        }
        for (const seq of this.findRepeatedPatterns(clustered)) {
            if (seq.frequency < this.config.minPatternCount)
                continue;
            const slug = slugify(`auto-${seq.sequence.slice(0, 3).join('-')}`);
            const skillPath = path_1.default.join(this.workspaceRoot, this.config.skillsDir, `${slug}.md`);
            if ((0, fs_1.existsSync)(skillPath)) {
                result.updated.push(slug);
                continue;
            }
            const dir = path_1.default.dirname(skillPath);
            if (!(0, fs_1.existsSync)(dir))
                (0, fs_1.mkdirSync)(dir, { recursive: true });
            const content = [
                '---',
                `name: ${slug}`,
                `description: Auto-detected pattern: ${seq.sequence.join(' → ')}`,
                '---',
                '',
                `## Observed Pattern`,
                '',
                `Tool sequence: ${seq.sequence.join(' → ')}`,
                `Frequency: ${seq.frequency} sessions`,
                `Success rate: ${(seq.successRate * 100).toFixed(0)}%`,
                `Domain: ${seq.domainKeywords.join(', ')}`,
            ].join('\n');
            (0, fs_1.writeFileSync)(skillPath, content, 'utf-8');
            result.created.push(slug);
        }
        return result;
    }
    findRepeatedPatterns(clustered) {
        return clustered.repeatedSequences.filter((seq) => seq.frequency >= this.config.minPatternCount && seq.successRate >= 0.5);
    }
}
exports.AutoSkillService = AutoSkillService;
//# sourceMappingURL=auto-skill-service.js.map