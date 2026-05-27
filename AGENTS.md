# Chimera — Agent Instructions

## Golden Rule

**ALL CODE MUST BE MODULAR AND REUSABLE.**

Every function, class, module, and component you write must be designed for reuse. If you find yourself duplicating logic, extract it. If a module does more than one thing, split it. If a dependency is tightly coupled, introduce an interface. This rule applies to ALL agents working on Chimera — Writer, Reviewer, and Challenger alike.

### What this means in practice

- **Single responsibility**: each module does one thing well. If a file exceeds ~300 lines, consider splitting.
- **Interface-first**: define contracts (interfaces, types, schemas) before implementations. Consumers depend on abstractions, not concrete classes.
- **Dependency injection**: pass dependencies as parameters or through constructors. Never hardcode providers, paths, or configuration.
- **Pure functions where possible**: deterministic, testable, no hidden side effects.
- **Composable over monolithic**: small functions that compose > one large function that does everything.
- **No circular dependencies**: if A imports B and B imports A, introduce a shared interface or third module C.
- **Export only what is needed**: use explicit exports. Do not export internals.
- **Test in isolation**: every module must be independently testable with mocks for its dependencies.

### Reviewer and Challenger responsibilities

- **Reviewer**: reject any PR that introduces tight coupling, circular dependencies, or non-reusable patterns. Flag modules that exceed responsibility boundaries.
- **Challenger**: propose alternative decompositions when a module's design limits future extensibility. Challenge assumptions about what "needs" to be coupled.

### Examples

**Bad — monolithic, not reusable:**
```typescript
// Everything in one file, hardcoded provider, no interfaces
export async function runAgent() {
  const client = new AnthropicClient(process.env.ANTHROPIC_API_KEY);
  const response = await client.messages.create({ ... });
  // 500 lines of mixed logic...
}
```

**Good — modular, reusable:**
```typescript
// Provider abstraction
export interface ModelProvider {
  complete(prompt: Prompt): Promise<ModelResponse>;
  getCost(tokens: TokenCount): number;
}

// Separate concerns
export class AgentRuntime {
  constructor(
    private provider: ModelProvider,
    private schemaValidator: SchemaValidator,
    private eventEmitter: EventEmitter,
  ) {}

  async execute(task: Task): Promise<Result> {
    // Pure orchestration logic
  }
}
```
