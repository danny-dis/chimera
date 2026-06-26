"use strict";
/**
 * Pure-data types for declarative workflows.
 *
 * A WorkflowDefinition is a list of steps that the orchestrator walks through
 * (llm / tool / parallel / sequence / gate). The actual execution engine lives
 * outside this module — these types describe the shape only.
 *
 * Keep this file dependency-free; consumers (loaders, registry, runner) build
 * on top of it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map