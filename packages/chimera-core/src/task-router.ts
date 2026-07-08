import { z } from 'zod';
import { ComplexityScore } from './types/router.js';
import { AgentConfig, Mode } from './types/agent.js';
import { EventStream } from './event-stream.js';
import { sideQuery, type SideQueryProvider } from './side-query.js';

const ComplexitySchema = z.object({
  overall: z.number().min(0).max(1),
  dimensions: z.record(z.number().min(0).max(1)),
});

const COMPLEXITY_KEYWORDS = {
  high: ['architecture', 'system', 'framework', 'distributed', 'concurrent', 'async', 'websocket', 'microservice', 'database', 'migration'],
  medium: ['component', 'module', 'service', 'api', 'function', 'class', 'interface', 'refactor'],
  low: ['fix', 'typo', 'comment', 'test', 'lint', 'format', 'small', 'single'],
};

export class TaskRouter {
  private providers: AgentConfig[] = [];
  private sideQueryProvider: SideQueryProvider | null = null;

  constructor(private eventStream: EventStream) {}

  setProviders(providers: AgentConfig[]): void {
    this.providers = providers;
  }

  setSideQueryProvider(provider: SideQueryProvider): void {
    this.sideQueryProvider = provider;
  }

  async classifyTask(task: string): Promise<ComplexityScore> {
    if (this.sideQueryProvider) {
      try {
        const result = await sideQuery({
          provider: this.sideQueryProvider,
          prompt: `Classify the complexity of this coding task on a 0-1 scale across these dimensions. Return JSON only.
Task: "${task}"

Dimensions:
- codeVolume: How much code needs to be written/changed (0=single line, 1=large refactor)
- architecturalDepth: How deep the architectural impact (0=surface change, 1=deep restructuring)
- dependencyComplexity: How many dependencies are involved (0=none, 1=many)
- testCoverage: How much testing is needed (0=none, 1=comprehensive)
- securitySensitivity: How security-sensitive (0=not at all, 1=critical)
- concurrency: Concurrency complexity (0=none, 1=complex)

Return: {"overall": <0-1>, "dimensions": {"codeVolume": <0-1>, ...}}`,
          schema: ComplexitySchema,
        });

        if (result.ok) {
          const score = result.data;
          const dims = score.dimensions as Record<string, number>;
          const fullDimensions = {
            codeVolume: dims.codeVolume ?? 0.5,
            architecturalDepth: dims.architecturalDepth ?? 0.5,
            dependencyComplexity: dims.dependencyComplexity ?? 0.5,
            testCoverage: dims.testCoverage ?? 0.5,
            securitySensitivity: dims.securitySensitivity ?? 0.5,
            domainNovelty: dims.domainNovelty ?? 0.5,
            errorHandling: dims.errorHandling ?? 0.5,
            concurrency: dims.concurrency ?? 0.5,
            externalIntegrations: dims.externalIntegrations ?? 0.5,
            dataTransformation: dims.dataTransformation ?? 0.5,
            stateManagement: dims.stateManagement ?? 0.5,
            algorithmicComplexity: dims.algorithmicComplexity ?? 0.5,
            apiDesign: dims.apiDesign ?? 0.5,
            refactoringScope: dims.refactoringScope ?? 0.5,
            crossCuttingConcerns: dims.crossCuttingConcerns ?? 0.5,
          };
          this.eventStream.append({
            type: 'task_classified',
            complexity: { score: score.overall, dimensions: fullDimensions },
            estimatedCost: this.estimateCost(score.overall),
          });
          return { overall: score.overall, dimensions: fullDimensions };
        }
      } catch {
        // Fall through to keyword heuristic
      }
    }

    return this.classifyTaskHeuristic(task);
  }

  classifyTaskHeuristic(task: string): ComplexityScore {
    const lowerTask = task.toLowerCase();
    const dimensions = {
      codeVolume: this.scoreKeyword(lowerTask, COMPLEXITY_KEYWORDS.high, COMPLEXITY_KEYWORDS.low),
      architecturalDepth: this.scoreKeyword(lowerTask, ['depth', 'layer', 'architecture'], ['simple', 'basic']),
      dependencyComplexity: this.scoreKeyword(lowerTask, ['dependency', 'import', 'package']),
      testCoverage: this.scoreKeyword(lowerTask, ['test', 'spec', 'coverage']),
      securitySensitivity: this.scoreKeyword(lowerTask, ['auth', 'security', 'password', 'token', 'secret']),
      domainNovelty: this.scoreKeyword(lowerTask, ['new', 'implement', 'create'], ['existing', 'refactor']),
      errorHandling: this.scoreKeyword(lowerTask, ['error', 'exception', 'handle', 'try']),
      concurrency: this.scoreKeyword(lowerTask, ['concurrent', 'async', 'parallel', 'race', 'mutex']),
      externalIntegrations: this.scoreKeyword(lowerTask, ['api', 'http', 'request', 'fetch', 'integrate']),
      dataTransformation: this.scoreKeyword(lowerTask, ['transform', 'convert', 'parse', 'serialize']),
      stateManagement: this.scoreKeyword(lowerTask, ['state', 'store', 'cache', 'memory']),
      algorithmicComplexity: this.scoreKeyword(lowerTask, ['algorithm', 'sort', 'search', 'tree', 'graph']),
      apiDesign: this.scoreKeyword(lowerTask, ['endpoint', 'route', 'api', 'interface']),
      refactoringScope: this.scoreKeyword(lowerTask, ['refactor', 'restructure', 'rewrite', 'migrate']),
      crossCuttingConcerns: this.scoreKeyword(lowerTask, ['logging', 'monitoring', 'config', 'shared']),
    };

    const overall = Object.values(dimensions).reduce((a, b) => a + b, 0) / Object.keys(dimensions).length;
    this.eventStream.append({
      type: 'task_classified',
      complexity: { score: overall, dimensions },
      estimatedCost: this.estimateCost(overall),
    });

    return { overall, dimensions };
  }

  private scoreKeyword(text: string, positives: string[], negatives: string[] = []): number {
    let score = 0.1;
    for (const word of positives) {
      if (text.includes(word)) score += 0.15;
    }
    for (const word of negatives) {
      if (text.includes(word)) score -= 0.1;
    }
    return Math.max(0, Math.min(1, score));
  }

  private estimateCost(complexity: number): number {
    return complexity * 5;
  }

  static isConversationalTask(task: string): boolean {
    const lower = task.toLowerCase().replace(/[,;!]+$/g, '').trim();

    const conversationalPatterns = [
      // Greetings and simple commands
      /^(hello|hi|hey|howdy|greetings|sup|yo|retry|again|repeat)\b/,
      // Standard question openers: who/what/where/when/why/how + auxiliary
      /^(who|what|where|when|why|how)\s+(are|r|is|do|does|did|can|could|would|should|will|shall)\b/,
      // Casual question openers (how about, how bout, whats, whats up, etc.)
      /^(how\s+(about|bout)|what'?s|what\s+does|what\s+do)\b/,
      // "tell me" as a standalone opener (not just tell me about/what/how)
      /^tell me\b/,
      // Imperative information-seeking verbs
      /^(describe|explain|summarize|study|analyze|analyse|examine|inspect|look at|look into)\b/,
      // "what do you / what can you / what are you"
      /^(what do you|what can you|what are you)\b/,
      // Polite request openers
      /^(can you|could you|would you)\b/,
      // Thanks and help
      /^(thanks|thank you|please|help)\b/,
      // Existential questions — only "does/are there" + word, NOT bare "do X" which is imperative
      /^(is there|are there|does)\s+\w+\b/,
      // Casual "how does X work" / "how do I" without strict auxiliary match
      /^(how\s+(does|do|can|is|are|would|should)\b)/,
      // "tell me about" / "tell me what" etc. (already covered by /^tell me\b above)
      // "what is" / "what are" without strict auxiliary (e.g. "what is dmr x")
      /^(what\s+(is|are|was|were|will|can|could|should|would)\b)/,
      // "who built you" / "who are you" / "who made you"
      /^(who\s+(built|made|created|developed|designed|owns|runs|manages)\b)/,
    ];

    const hasConversationalOpener = conversationalPatterns.some((p) => p.test(lower));

    const codeSignals = [
      'fix', 'error', 'bug', 'failing', 'broken', 'crash', 'exception',
      'implement', 'create', 'build', 'add', 'write', 'develop', 'refactor',
      'migrate', 'integrate', 'setup', 'configure', 'deploy', 'commit',
      'push', 'merge', 'rebase', 'test', 'lint', 'format', 'debug',
      'review', 'audit', 'critique', 'evaluate', 'assess',
      'plan', 'design', 'strategy', 'approach',
      'the answer', 'code', 'function', 'class', 'module', 'file',
    ];
    const hasCodeSignal = codeSignals.some((s) => lower.includes(s));

    if (hasConversationalOpener && !hasCodeSignal) return true;

    if (hasCodeSignal) return false;

    const informationalVerbs = ['study', 'analyze', 'analyse', 'examine', 'inspect', 'look at', 'look into', 'tell me', 'what is', 'what are', 'describe', 'explain'];
    const hasInformationalVerb = informationalVerbs.some((v) => lower.includes(v));
    if (hasInformationalVerb) return true;

    return false;
  }

  suggestMode(task: string, complexity: ComplexityScore): Mode {
    const lower = task.toLowerCase();

    const debugSignals = ['fix', 'error', 'bug', 'failing', 'broken', 'crash', 'exception', 'regression', 'test fail'];
    if (debugSignals.some((s) => lower.includes(s))) return 'debug';

    const reviewSignals = ['review', 'audit', 'check', 'critique', 'evaluate', 'assess'];
    if (reviewSignals.some((s) => lower.includes(s))) return 'review';

    const planSignals = ['plan', 'design', 'strategy', 'approach', 'architecture', 'decompose', 'break down'];
    if (planSignals.some((s) => lower.includes(s))) return 'plan';

    const codeSignals = ['implement', 'create', 'build', 'add', 'write', 'develop', 'refactor', 'migrate', 'integrate', 'setup', 'configure'];
    const hasCodeSignal = codeSignals.some((s) => lower.includes(s));

    if (complexity.overall < 0.3 && !hasCodeSignal) return 'ask';

    return 'code';
  }

  selectProvider(_complexity: ComplexityScore, role: string): AgentConfig | null {
    let candidates = this.providers.filter((p) => p.role === role);

    if (role === 'writer') {
      candidates = candidates.sort((a, b) => {
        const aTier = this.getModelTier(a.model) as number;
        const bTier = this.getModelTier(b.model) as number;
        return aTier - bTier;
      });
    }

    return candidates[0] ?? null;
  }

  private getModelTier(model: string): number {
    const knownTiers = ['deepseek', 'gemini', 'gpt-4o-mini', 'claude-haiku', 'qwen-2.5'];
    for (const tier of knownTiers) {
      if (model.toLowerCase().includes(tier)) return 1;
    }
    if (model.includes('r1') || model.includes('o3')) return 4;
    return 2;
  }

  decomposeTask(task: string): { subtasks: string[]; dag: Map<string, string[]> } {
    const subtasks: string[] = [];
    const dag = new Map<string, string[]>();

    const parts = task.split(/[,;]/).map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      const subtask = part.replace(/^(and|then|also)\s+/i, '');
      if (subtask) subtasks.push(subtask);
    }

    if (subtasks.length === 0) {
      subtasks.push(task);
    }

    for (let i = 1; i < subtasks.length; i++) {
      dag.set(subtasks[i], [subtasks[i - 1]]);
    }

    this.eventStream.append({
      type: 'task_decomposed',
      subtasks: subtasks.map((desc, i) => ({ id: `subtask-${i}`, description: desc, dependencies: [] })),
      dependencyGraph: { nodes: subtasks, edges: Array.from(dag.entries()).flatMap(([k, v]) => v.map(d => [k, d] as [string, string])) },
    });

    return { subtasks, dag };
  }
}
