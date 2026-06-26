import { applyToolResultBudget } from './tool-result-budget.js';
import { snipCompact } from './snip.js';
import { microCompact } from './microcompact.js';
import { contextCollapse } from './context-collapse.js';

export interface CompactionContext {
  messages: Array<{ role: string; content: string }>;
  tokensFreed: number;
  stageResults: Array<{
    stage: string;
    tokensSaved: number;
    messagesBefore: number;
    messagesAfter: number;
  }>;
}

export interface CompactionPipelineResult {
  messages: Array<{ role: string; content: string }>;
  totalTokensSaved: number;
  stages: CompactionContext['stageResults'];
}

function estimateTokens(msgs: Array<{ role: string; content: string }>): number {
  return Math.ceil(msgs.reduce((sum, m) => sum + m.content.length, 0) / 4);
}

export function runCompactionPipeline(
  messages: Array<{ role: string; content: string }>,
): CompactionPipelineResult {
  const stages: CompactionContext['stageResults'] = [];
  let current = [...messages];
  let totalTokensSaved = 0;

  const beforeBudget = estimateTokens(current);
  const budgetResult = applyToolResultBudget(current);
  current = budgetResult.messages;
  const afterBudget = estimateTokens(current);
  const budgetSaved = Math.max(0, beforeBudget - afterBudget);
  totalTokensSaved += budgetSaved;
  stages.push({
    stage: 'tool_result_budget',
    tokensSaved: budgetSaved,
    messagesBefore: messages.length,
    messagesAfter: current.length,
  });

  const beforeSnip = estimateTokens(current);
  const snipResult = snipCompact(current);
  current = snipResult.messages;
  const afterSnip = estimateTokens(current);
  const snipSaved = Math.max(0, beforeSnip - afterSnip);
  totalTokensSaved += snipSaved;
  stages.push({
    stage: 'snip',
    tokensSaved: snipSaved,
    messagesBefore: current.length,
    messagesAfter: current.length,
  });

  const beforeMicro = estimateTokens(current);
  const microResult = microCompact(current);
  current = microResult.messages;
  const afterMicro = estimateTokens(current);
  const microSaved = Math.max(0, beforeMicro - afterMicro);
  totalTokensSaved += microSaved;
  stages.push({
    stage: 'microcompact',
    tokensSaved: microSaved,
    messagesBefore: current.length,
    messagesAfter: current.length,
  });

  const beforeCollapse = estimateTokens(current);
  const collapseResult = contextCollapse(current);
  current = collapseResult.messages;
  const afterCollapse = estimateTokens(current);
  const collapseSaved = Math.max(0, beforeCollapse - afterCollapse);
  totalTokensSaved += collapseSaved;
  stages.push({
    stage: 'context_collapse',
    tokensSaved: collapseSaved,
    messagesBefore: current.length,
    messagesAfter: current.length,
  });

  return {
    messages: current,
    totalTokensSaved,
    stages,
  };
}
