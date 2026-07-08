"use strict";
// @chimera/core — Core orchestrator, event stream, and agent mesh coordination
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECRET_PATTERNS = exports.SecretDetector = exports.AuditLog = exports.sanitizeForPrompt = exports.checkToolOutput = exports.checkUserInput = exports.createDefaultHarnessRegistry = exports.HarnessRegistry = exports.filterAgentsByRole = exports.findAgentByName = exports.discoverAgents = exports.loadAgentsFromDir = exports.loadAgentFile = exports.safeValidateAgentYaml = exports.validateAgentYaml = exports.AgentYamlSchema = exports.WorktreeIsolation = exports.ALLOWED_PURPOSES = exports.getRecommendedTierForPurpose = exports.getAllowedToolsForPurpose = exports.validatePurpose = exports.validateCrossVendorReview = exports.assignCrossVendorProviders = exports.findCrossVendorReviewer = exports.areSameVendor = exports.extractVendor = exports.BiomeLinter = exports.DeliberationEngine = exports.ResultAggregator = exports.SubAgentSpawner = exports.TaskDecomposer = exports.CoordinatorEngine = exports.MemoryPersistence = exports.AgentMemory = exports.LocalEmbeddingProvider = exports.VectorStore = exports.LongTermMemory = exports.bootstrap = exports.buildWorkflowGeneratorPrompt = exports.buildMessages = exports.RECOVERY_PROMPTS = exports.MODE_INSTRUCTIONS = exports.AGENT_PROMPTS = exports.ResponseSynthesizer = exports.SessionOrchestrator = exports.CostTracker = exports.TaskRouter = exports.AgentMesh = exports.EventStream = exports.zodToJsonSchema = void 0;
exports.buildStylePrompt = exports.getOutputStyle = exports.loadOutputStyles = exports.fingerprintPayload = exports.SIDEQUERY_NO_LEAK_MARKER = exports.setSideQueryChannel = exports.sideQuery = exports.parseSkillPack = exports.SKILL_BUNDLES = exports._resetLegacyWarnings = exports.buildInputsSchema = exports.parseSkillFile = exports.loadSkillsForMode = exports.loadSkill = exports.listAllSkills = exports.detectCompletionSignal = exports.runLoopStep = exports.defaultWorkflowFor = exports.registerBuiltInWorkflows = exports.runWorkflow = exports.WorkflowDispatcher = exports.WorkflowLoader = exports.WorkflowAutoLoader = exports.WorkflowRegistry = void 0;
var zod_json_js_1 = require("./zod-json.js");
Object.defineProperty(exports, "zodToJsonSchema", { enumerable: true, get: function () { return zod_json_js_1.zodToJsonSchema; } });
var event_stream_js_1 = require("./event-stream.js");
Object.defineProperty(exports, "EventStream", { enumerable: true, get: function () { return event_stream_js_1.EventStream; } });
var agent_mesh_js_1 = require("./agent-mesh.js");
Object.defineProperty(exports, "AgentMesh", { enumerable: true, get: function () { return agent_mesh_js_1.AgentMesh; } });
var task_router_js_1 = require("./task-router.js");
Object.defineProperty(exports, "TaskRouter", { enumerable: true, get: function () { return task_router_js_1.TaskRouter; } });
var cost_tracker_js_1 = require("./cost-tracker.js");
Object.defineProperty(exports, "CostTracker", { enumerable: true, get: function () { return cost_tracker_js_1.CostTracker; } });
var session_orchestrator_js_1 = require("./session-orchestrator.js");
Object.defineProperty(exports, "SessionOrchestrator", { enumerable: true, get: function () { return session_orchestrator_js_1.SessionOrchestrator; } });
var response_synthesizer_js_1 = require("./response-synthesizer.js");
Object.defineProperty(exports, "ResponseSynthesizer", { enumerable: true, get: function () { return response_synthesizer_js_1.ResponseSynthesizer; } });
var prompts_js_1 = require("./prompts.js");
Object.defineProperty(exports, "AGENT_PROMPTS", { enumerable: true, get: function () { return prompts_js_1.AGENT_PROMPTS; } });
Object.defineProperty(exports, "MODE_INSTRUCTIONS", { enumerable: true, get: function () { return prompts_js_1.MODE_INSTRUCTIONS; } });
Object.defineProperty(exports, "RECOVERY_PROMPTS", { enumerable: true, get: function () { return prompts_js_1.RECOVERY_PROMPTS; } });
Object.defineProperty(exports, "buildMessages", { enumerable: true, get: function () { return prompts_js_1.buildMessages; } });
Object.defineProperty(exports, "buildWorkflowGeneratorPrompt", { enumerable: true, get: function () { return prompts_js_1.buildWorkflowGeneratorPrompt; } });
var bootstrap_js_1 = require("./bootstrap.js");
Object.defineProperty(exports, "bootstrap", { enumerable: true, get: function () { return bootstrap_js_1.bootstrap; } });
// Memory
var index_js_1 = require("./memory/index.js");
Object.defineProperty(exports, "LongTermMemory", { enumerable: true, get: function () { return index_js_1.LongTermMemory; } });
Object.defineProperty(exports, "VectorStore", { enumerable: true, get: function () { return index_js_1.VectorStore; } });
Object.defineProperty(exports, "LocalEmbeddingProvider", { enumerable: true, get: function () { return index_js_1.LocalEmbeddingProvider; } });
Object.defineProperty(exports, "AgentMemory", { enumerable: true, get: function () { return index_js_1.AgentMemory; } });
Object.defineProperty(exports, "MemoryPersistence", { enumerable: true, get: function () { return index_js_1.MemoryPersistence; } });
// Coordinator
var index_js_2 = require("./coordinator/index.js");
Object.defineProperty(exports, "CoordinatorEngine", { enumerable: true, get: function () { return index_js_2.CoordinatorEngine; } });
Object.defineProperty(exports, "TaskDecomposer", { enumerable: true, get: function () { return index_js_2.TaskDecomposer; } });
Object.defineProperty(exports, "SubAgentSpawner", { enumerable: true, get: function () { return index_js_2.SubAgentSpawner; } });
Object.defineProperty(exports, "ResultAggregator", { enumerable: true, get: function () { return index_js_2.ResultAggregator; } });
var index_js_3 = require("./coordinator/deliberation/index.js");
Object.defineProperty(exports, "DeliberationEngine", { enumerable: true, get: function () { return index_js_3.DeliberationEngine; } });
var biome_linter_js_1 = require("./coordinator/biome-linter.js");
Object.defineProperty(exports, "BiomeLinter", { enumerable: true, get: function () { return biome_linter_js_1.BiomeLinter; } });
// Cross-vendor review enforcement
var cross_vendor_review_js_1 = require("./coordinator/cross-vendor-review.js");
Object.defineProperty(exports, "extractVendor", { enumerable: true, get: function () { return cross_vendor_review_js_1.extractVendor; } });
Object.defineProperty(exports, "areSameVendor", { enumerable: true, get: function () { return cross_vendor_review_js_1.areSameVendor; } });
Object.defineProperty(exports, "findCrossVendorReviewer", { enumerable: true, get: function () { return cross_vendor_review_js_1.findCrossVendorReviewer; } });
Object.defineProperty(exports, "assignCrossVendorProviders", { enumerable: true, get: function () { return cross_vendor_review_js_1.assignCrossVendorProviders; } });
Object.defineProperty(exports, "validateCrossVendorReview", { enumerable: true, get: function () { return cross_vendor_review_js_1.validateCrossVendorReview; } });
// Purpose guard — every sub-agent must declare purpose
var purpose_guard_js_1 = require("./coordinator/purpose-guard.js");
Object.defineProperty(exports, "validatePurpose", { enumerable: true, get: function () { return purpose_guard_js_1.validatePurpose; } });
Object.defineProperty(exports, "getAllowedToolsForPurpose", { enumerable: true, get: function () { return purpose_guard_js_1.getAllowedToolsForPurpose; } });
Object.defineProperty(exports, "getRecommendedTierForPurpose", { enumerable: true, get: function () { return purpose_guard_js_1.getRecommendedTierForPurpose; } });
Object.defineProperty(exports, "ALLOWED_PURPOSES", { enumerable: true, get: function () { return purpose_guard_js_1.ALLOWED_PURPOSES; } });
// Worktree Isolation
var worktree_isolation_js_1 = require("./agent/worktree-isolation.js");
Object.defineProperty(exports, "WorktreeIsolation", { enumerable: true, get: function () { return worktree_isolation_js_1.WorktreeIsolation; } });
// Agent YAML — Declarative agent definitions
var agent_schema_js_1 = require("./agent/agent-schema.js");
Object.defineProperty(exports, "AgentYamlSchema", { enumerable: true, get: function () { return agent_schema_js_1.AgentYamlSchema; } });
Object.defineProperty(exports, "validateAgentYaml", { enumerable: true, get: function () { return agent_schema_js_1.validateAgentYaml; } });
Object.defineProperty(exports, "safeValidateAgentYaml", { enumerable: true, get: function () { return agent_schema_js_1.safeValidateAgentYaml; } });
var agent_loader_js_1 = require("./agent/agent-loader.js");
Object.defineProperty(exports, "loadAgentFile", { enumerable: true, get: function () { return agent_loader_js_1.loadAgentFile; } });
Object.defineProperty(exports, "loadAgentsFromDir", { enumerable: true, get: function () { return agent_loader_js_1.loadAgentsFromDir; } });
Object.defineProperty(exports, "discoverAgents", { enumerable: true, get: function () { return agent_loader_js_1.discoverAgents; } });
Object.defineProperty(exports, "findAgentByName", { enumerable: true, get: function () { return agent_loader_js_1.findAgentByName; } });
Object.defineProperty(exports, "filterAgentsByRole", { enumerable: true, get: function () { return agent_loader_js_1.filterAgentsByRole; } });
// Harness registry — run agents across multiple backends
var harness_registry_js_1 = require("./agent/harness-registry.js");
Object.defineProperty(exports, "HarnessRegistry", { enumerable: true, get: function () { return harness_registry_js_1.HarnessRegistry; } });
Object.defineProperty(exports, "createDefaultHarnessRegistry", { enumerable: true, get: function () { return harness_registry_js_1.createDefaultHarnessRegistry; } });
// Security
var index_js_4 = require("./security/index.js");
Object.defineProperty(exports, "checkUserInput", { enumerable: true, get: function () { return index_js_4.checkUserInput; } });
Object.defineProperty(exports, "checkToolOutput", { enumerable: true, get: function () { return index_js_4.checkToolOutput; } });
Object.defineProperty(exports, "sanitizeForPrompt", { enumerable: true, get: function () { return index_js_4.sanitizeForPrompt; } });
Object.defineProperty(exports, "AuditLog", { enumerable: true, get: function () { return index_js_4.AuditLog; } });
Object.defineProperty(exports, "SecretDetector", { enumerable: true, get: function () { return index_js_4.SecretDetector; } });
Object.defineProperty(exports, "SECRET_PATTERNS", { enumerable: true, get: function () { return index_js_4.SECRET_PATTERNS; } });
// Workflow
var index_js_5 = require("./workflow/index.js");
Object.defineProperty(exports, "WorkflowRegistry", { enumerable: true, get: function () { return index_js_5.WorkflowRegistry; } });
Object.defineProperty(exports, "WorkflowAutoLoader", { enumerable: true, get: function () { return index_js_5.WorkflowAutoLoader; } });
Object.defineProperty(exports, "WorkflowLoader", { enumerable: true, get: function () { return index_js_5.WorkflowLoader; } });
Object.defineProperty(exports, "WorkflowDispatcher", { enumerable: true, get: function () { return index_js_5.WorkflowDispatcher; } });
Object.defineProperty(exports, "runWorkflow", { enumerable: true, get: function () { return index_js_5.runWorkflow; } });
Object.defineProperty(exports, "registerBuiltInWorkflows", { enumerable: true, get: function () { return index_js_5.registerBuiltInWorkflows; } });
Object.defineProperty(exports, "defaultWorkflowFor", { enumerable: true, get: function () { return index_js_5.defaultWorkflowFor; } });
Object.defineProperty(exports, "runLoopStep", { enumerable: true, get: function () { return index_js_5.runLoopStep; } });
Object.defineProperty(exports, "detectCompletionSignal", { enumerable: true, get: function () { return index_js_5.detectCompletionSignal; } });
// Skills
var skill_loader_js_1 = require("./skills/skill-loader.js");
Object.defineProperty(exports, "listAllSkills", { enumerable: true, get: function () { return skill_loader_js_1.listAllSkills; } });
Object.defineProperty(exports, "loadSkill", { enumerable: true, get: function () { return skill_loader_js_1.loadSkill; } });
Object.defineProperty(exports, "loadSkillsForMode", { enumerable: true, get: function () { return skill_loader_js_1.loadSkillsForMode; } });
Object.defineProperty(exports, "parseSkillFile", { enumerable: true, get: function () { return skill_loader_js_1.parseSkillFile; } });
Object.defineProperty(exports, "buildInputsSchema", { enumerable: true, get: function () { return skill_loader_js_1.buildInputsSchema; } });
Object.defineProperty(exports, "_resetLegacyWarnings", { enumerable: true, get: function () { return skill_loader_js_1._resetLegacyWarnings; } });
var skill_bundles_js_1 = require("./skills/skill-bundles.js");
Object.defineProperty(exports, "SKILL_BUNDLES", { enumerable: true, get: function () { return skill_bundles_js_1.SKILL_BUNDLES; } });
var skill_pack_js_1 = require("./skills/skill-pack.js");
Object.defineProperty(exports, "parseSkillPack", { enumerable: true, get: function () { return skill_pack_js_1.parseSkillPack; } });
// Side-query
var side_query_js_1 = require("./side-query.js");
Object.defineProperty(exports, "sideQuery", { enumerable: true, get: function () { return side_query_js_1.sideQuery; } });
Object.defineProperty(exports, "setSideQueryChannel", { enumerable: true, get: function () { return side_query_js_1.setSideQueryChannel; } });
Object.defineProperty(exports, "SIDEQUERY_NO_LEAK_MARKER", { enumerable: true, get: function () { return side_query_js_1.SIDEQUERY_NO_LEAK_MARKER; } });
Object.defineProperty(exports, "fingerprintPayload", { enumerable: true, get: function () { return side_query_js_1.fingerprintPayload; } });
// Output styles
var index_js_6 = require("./output-styles/index.js");
Object.defineProperty(exports, "loadOutputStyles", { enumerable: true, get: function () { return index_js_6.loadOutputStyles; } });
Object.defineProperty(exports, "getOutputStyle", { enumerable: true, get: function () { return index_js_6.getOutputStyle; } });
Object.defineProperty(exports, "buildStylePrompt", { enumerable: true, get: function () { return index_js_6.buildStylePrompt; } });
//# sourceMappingURL=index.js.map