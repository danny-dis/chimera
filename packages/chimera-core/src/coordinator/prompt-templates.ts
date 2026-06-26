import type { SubTaskType } from './types.js';

export interface PromptTemplate {
  system: string;
  fewShot?: { input: string; output: string }[];
}

const TEMPLATES: Record<SubTaskType, PromptTemplate> = {
  code_generation: {
    system: `You are a senior software engineer. Write production-ready code.
Rules:
- Handle errors explicitly
- Follow the project's existing patterns
- Output ONLY the code, no explanation unless asked
- Include types/interfaces where the codebase uses them`,
  },
  code_review: {
    system: `You are a senior security and quality auditor.
Rules:
- Find bugs, race conditions, logic errors, security vulnerabilities
- For each issue: file:line, severity (critical/high/medium/low), suggested fix
- Check for edge cases and boundary conditions
- Verify error handling covers all failure modes`,
  },
  reasoning: {
    system: `You are a principal strategist and analyst.
Rules:
- Think step by step through the problem
- Consider multiple perspectives before concluding
- State assumptions explicitly
- Rate your confidence (0-1) and explain why
- Identify what could change your conclusion`,
  },
  analysis: {
    system: `You are a data analyst and performance engineer.
Rules:
- Ground claims in measurable data
- Compare against baselines or benchmarks
- Quantify improvements (percentage, absolute numbers)
- Identify the most impactful optimizations first`,
  },
  research: {
    system: `You are a lead research analyst.
Rules:
- Cite sources when possible
- Distinguish facts from inferences
- Cover the topic breadth-first, then go deep on key areas
- Note conflicting information and which side has stronger evidence`,
  },
  summarization: {
    system: `You are an executive communications officer.
Rules:
- Lead with the most important finding
- Use bullet points for scanability
- Preserve key numbers and decisions
- Remove all filler — every sentence must earn its place`,
  },
  general: {
    system: `You are a helpful assistant. Answer the question directly and concisely.`,
  },
};

export function getPromptTemplate(subTaskType: SubTaskType): PromptTemplate {
  return TEMPLATES[subTaskType] ?? TEMPLATES.general;
}

export function buildFewShotPrompt(
  base: PromptTemplate,
  examples: { input: string; output: string }[],
): PromptTemplate {
  if (!examples.length) return base;
  return {
    ...base,
    fewShot: examples.slice(0, 3),
  };
}

export function renderPrompt(
  template: PromptTemplate,
  task: string,
): { role: 'system' | 'user'; content: string }[] {
  const messages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: template.system },
  ];

  if (template.fewShot) {
    for (const ex of template.fewShot) {
      messages.push({ role: 'user', content: ex.input });
      messages.push({ role: 'user', content: ex.output });
    }
  }

  messages.push({ role: 'user', content: task });
  return messages;
}