/**
 * `chimera skill …` — inspect and validate skills.
 *
 *   chimera skill list                     — show every installed skill
 *   chimera skill show <name>              — print the skill's markdown
 *   chimera skill validate <path>          — parse + validate a skill file
 *
 * All commands are read-only. None of them mutate workspace state.
 */
import { Command } from 'commander';
/**
 * Register the `skill` subcommand tree on a parent `Command`.
 * Returns the same `Command` for fluent chaining.
 */
export declare function registerSkillCommand(parent: Command): Command;
//# sourceMappingURL=skill.d.ts.map