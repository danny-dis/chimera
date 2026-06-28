// @chimera/eval — Evaluation harness

export { EvalHarness } from './eval-harness.js';
export type {
  TaskSpec,
  Trajectory,
  TrajectoryStep,
  EvalScore,
  EvalReport,
} from './eval-harness.js';

export { judgeTrajectory, formatJudgeScore } from './judge-llm.js';
export type { JudgeVerdict } from './judge-llm.js';

export { sideQuery } from './side-query.js';
export type { SideQueryOptions } from './side-query.js';
