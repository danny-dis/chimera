/**
 * `chimera learn ...` — analyze sessions and synthesize skills, workflows, skill packs.
 *
 *   chimera learn                    — analyze recent sessions, suggest improvements
 *   chimera learn --apply            — analyze and auto-apply improvements
 *   chimera learn --session <id>     — learn from a specific session
 *   chimera learn --dry-run          — show what would be generated without writing
 *   chimera learn --inventory        — show all synthesized artifacts
 */
import { Command } from 'commander';
import { resolve } from 'path';
import { LearningEngine, skillTierFromCli, tierMessage, type TieredMessage } from '@chimera/learning';
import type { LearningReport, ArtifactInventory } from '@chimera/learning';

function workspaceRoot(): string {
  return process.cwd();
}

export function registerLearnCommand(parent: Command): Command {
  const learn = parent
    .command('learn')
    .description('Analyze sessions and synthesize skills, workflows, and skill packs');

  learn
    .option('--apply', 'Auto-apply improvements to disk (default: dry-run)', false)
    .option('--session <id>', 'Learn from a specific session ID')
    .option('--inventory', 'Show all synthesized artifacts')
    .option('--sessions-dir <path>', 'Path to sessions directory')
    .option('--reset-style', 'Delete the self-built output style (it regenerates next run)', false)
    .action(async (opts) => {
      const root = workspaceRoot();
      const sessionsDir = opts.sessionsDir ?? resolve(root, '.chimera', 'sessions');

      if (opts.resetStyle) {
        const { resetAutoStyle } = await import('@chimera/learning');
        const removed = await resetAutoStyle(root);
        console.log(removed
          ? '\n  Removed self-built output style (.chimera/output-styles/auto.chimera-style.md).\n  A fresh one synthesizes from your usage on the next task.\n'
          : '\n  No self-built output style found — nothing to remove.\n');
        return;
      }

      const engine = new LearningEngine({
        sessionDir: sessionsDir,
        outputDir: root,
        autoApply: opts.apply,
        minSessionsThreshold: 2,
      });

      if (opts.inventory) {
        const inventory = await engine.getArtifactInventory();
        printInventory(inventory);
        return;
      }

      console.log('\n  Analyzing sessions...\n');

      let report: LearningReport;

      if (opts.session) {
        // Load specific session
        const { CheckpointStore } = await import('@chimera/session');
        const store = new CheckpointStore(sessionsDir);
        const checkpoint = await store.load(opts.session);

        if (!checkpoint) {
          console.error(`\n  Session '${opts.session}' not found.\n`);
          process.exitCode = 1;
          return;
        }

        report = await engine.learnFromSession(checkpoint);
      } else {
        report = await engine.learn();
      }

      printReport(report, opts.apply);
    });

  return learn;
}

function printReport(report: LearningReport, applied: boolean): void {
  const totalCreated =
    report.skillsCreated.length +
    report.workflowsCreated.length +
    report.packsCreated.length;
  const totalUpdated =
    report.skillsUpdated.length +
    report.workflowsUpdated.length +
    report.packsUpdated.length;

  console.log(`  Sessions analyzed: ${report.sessionsAnalyzed}`);
  console.log(`  Completed at: ${report.completedAt}`);
  console.log('');

  if (totalCreated === 0 && totalUpdated === 0) {
    const noArtifacts: TieredMessage = {
      beginner:
        '  Nothing new to learn from yet — Chimera synthesizes skills after it has seen at least\n  2 sessions of your work. Run a couple of tasks first, then try `chimera learn` again.\n',
      intermediate: '  No new artifacts to synthesize. Need more session data.\n',
      advanced: '  No new artifacts (minSessionsThreshold=2 not met). Run more sessions or widen --session scope.\n',
    };
    console.log(tierMessage(noArtifacts, skillTierFromCli()));
    return;
  }

  if (totalCreated > 0) {
    console.log(`  NEW artifacts (${totalCreated}):`);
    for (const r of report.skillsCreated) {
      console.log(`    + skill: ${r.skill.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
    }
    for (const r of report.workflowsCreated) {
      console.log(`    + workflow: ${r.workflow.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
    }
    for (const r of report.packsCreated) {
      console.log(`    + skill-pack: ${r.pack.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
    }
    console.log('');
  }

  if (totalUpdated > 0) {
    console.log(`  UPDATED artifacts (${totalUpdated}):`);
    for (const r of report.skillsUpdated) {
      console.log(`    ~ skill: ${r.skill.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
    }
    for (const r of report.workflowsUpdated) {
      console.log(`    ~ workflow: ${r.workflow.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
    }
    for (const r of report.packsUpdated) {
      console.log(`    ~ skill-pack: ${r.pack.name} (confidence: ${Math.round(r.confidence * 100)}%)`);
    }
    console.log('');
  }

  if (report.improvementsApplied.length > 0) {
    console.log(`  Improvements applied: ${report.improvementsApplied.length}`);
    for (const imp of report.improvementsApplied) {
      console.log(`    - ${imp.artifact.type} "${imp.artifact.name}": ${imp.issues.length} issue(s)`);
    }
    console.log('');
  }

  if (applied) {
    console.log('  Artifacts written to disk.\n');
  } else {
    console.log('  Dry run — no files written. Use --apply to write artifacts.\n');
  }
}

function printInventory(inventory: ArtifactInventory): void {
  console.log('\n  Artifact Inventory\n');

  console.log(`  Skills (${inventory.skills.length}):`);
  for (const s of inventory.skills) {
    console.log(`    - ${s.name} (${s.source}, ${s.lastUpdated})`);
  }
  if (inventory.skills.length === 0) console.log('    (none)');
  console.log('');

  console.log(`  Workflows (${inventory.workflows.length}):`);
  for (const w of inventory.workflows) {
    console.log(`    - ${w.name} (${w.source}, ${w.lastUpdated})`);
  }
  if (inventory.workflows.length === 0) console.log('    (none)');
  console.log('');

  console.log(`  Skill Packs (${inventory.skillPacks.length}):`);
  for (const p of inventory.skillPacks) {
    console.log(`    - ${p.name} (${p.source}, ${p.lastUpdated})`);
  }
  if (inventory.skillPacks.length === 0) console.log('    (none)');
  console.log('');
}
