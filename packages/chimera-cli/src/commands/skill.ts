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
import { readFileSync } from 'fs';
import {
  listAllSkills,
  loadSkill,
  parseSkillFile,
  buildInputsSchema,
} from '@chimera/core';

const KNOWN_INPUT_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'string[]',
  'number[]',
]);

function workspaceRoot(): string {
  return process.cwd();
}

/**
 * Register the `skill` subcommand tree on a parent `Command`.
 * Returns the same `Command` for fluent chaining.
 */
export function registerSkillCommand(parent: Command): Command {
  const skill = parent
    .command('skill')
    .description('Inspect and validate skills (chimera skill list | show | validate)');

  skill
    .command('list')
    .description('List every discoverable skill (workspace + global + packs)')
    .action(() => {
      const skills = listAllSkills(workspaceRoot());
      if (skills.length === 0) {
        console.log('\n  No skills installed. Drop .md files into .chimera/skills/ to add some.\n');
        return;
      }
      const rows = skills.map((s) => [s.name, s.description, s.source, s.path]);
      printTable(['name', 'description', 'source', 'path'], rows);
    });

  skill
    .command('show <name>')
    .description('Print the full markdown content of a skill')
    .action((name: string) => {
      const loaded = loadSkill(name, workspaceRoot(), { warnOnLegacy: false });
      if (!loaded) {
        console.error(`\n✗ Skill '${name}' not found.\n`);
        process.exitCode = 1;
        return;
      }
      // Re-assemble the file (frontmatter + body) for an authentic display.
      const raw = readFileSync(loaded.path, 'utf-8');
      process.stdout.write(raw.endsWith('\n') ? raw : raw + '\n');
    });

  skill
    .command('validate <path>')
    .description('Parse frontmatter and validate the inputs schema')
    .action((p: string) => {
      let raw: string;
      try {
        raw = readFileSync(p, 'utf-8');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n✗ Cannot read file '${p}': ${msg}\n`);
        process.exitCode = 1;
        return;
      }

      const errors: string[] = [];
      const { frontmatter, body } = parseSkillFile(raw);

      if (!frontmatter.name) {
        errors.push('frontmatter.name is required');
      }
      if (!frontmatter.description) {
        errors.push('frontmatter.description is recommended (empty values are allowed but discouraged)');
      }
      if (frontmatter.inputs) {
        for (const [key, decl] of Object.entries(frontmatter.inputs)) {
          const stripped = String(decl).trim().replace(/\?$/, '').trim();
          if (!KNOWN_INPUT_TYPES.has(stripped)) {
            errors.push(
              `inputs.${key}: unknown type '${decl}' (supported: string, number, boolean, string[], number[]; suffix '?' for optional)`,
            );
          }
        }
        // Round-trip through the schema to ensure the declaration is buildable.
        try {
          const schema = buildInputsSchema(frontmatter.inputs);
          // Smoke test: the empty object should not pass (strict mode rejects unknown keys).
          if (schema.safeParse({}).success) {
            errors.push('inputs schema is not strict — empty object should be rejected');
          }
        } catch (err) {
          errors.push(`inputs schema build failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (errors.length === 0) {
        console.log(`\n✓ OK — ${p}\n`);
        if (!frontmatter.inputs) {
          console.log('  (no inputs declared — strict-empty schema)\n');
        }
        // Show a one-line summary
        const summary = `  name: ${frontmatter.name ?? '(unset)'}\n  description: ${(frontmatter.description ?? '').slice(0, 80)}\n  body length: ${body.length} chars\n`;
        console.log(summary);
        return;
      }

      console.error(`\n✗ ${p} — ${errors.length} error(s):\n`);
      for (const e of errors) {
        console.error(`  - ${e}`);
      }
      console.error();
      process.exitCode = 1;
    });

  return skill;
}

function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => {
    const cellMax = rows.reduce((m, r) => Math.max(m, (r[i] ?? '').length), 0);
    return Math.max(h.length, cellMax);
  });
  const fmt = (cols: string[]) =>
    cols.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  console.log();
  console.log(fmt(headers));
  console.log(sep);
  for (const r of rows) console.log(fmt(r));
  console.log();
}
