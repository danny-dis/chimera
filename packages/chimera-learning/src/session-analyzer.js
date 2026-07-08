"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionAnalyzer = void 0;
// ---------------------------------------------------------------------------
// Domain detection dictionaries
// ---------------------------------------------------------------------------
const DOMAIN_KEYWORDS = {
    security: ['auth', 'authn', 'authz', 'jwt', 'token', 'secret', 'password', 'oauth', 'cors', 'csrf', 'xss', 'injection', 'vulnerability', 'encrypt', 'decrypt', 'hash', 'salt', 'https', 'tls', 'ssl', 'certificate', 'rbac', 'permission', 'role'],
    database: ['database', 'db', 'postgres', 'mysql', 'sqlite', 'mongo', 'redis', 'migration', 'schema', 'table', 'column', 'index', 'query', 'sql', 'orm', 'prisma', 'drizzle', 'knex', 'seed'],
    api: ['api', 'endpoint', 'route', 'rest', 'graphql', 'grpc', 'http', 'request', 'response', 'middleware', 'controller', 'handler', 'openapi', 'swagger'],
    testing: ['test', 'spec', 'assert', 'expect', 'describe', 'it(', 'vitest', 'jest', 'mocha', 'coverage', 'mock', 'stub', 'fixture', 'e2e', 'integration'],
    deployment: ['deploy', 'docker', 'container', 'ci', 'cd', 'pipeline', 'github', 'actions', 'vercel', 'netlify', 'aws', 'gcp', 'azure', 'kubernetes', 'k8s', 'helm', 'terraform'],
    frontend: ['react', 'vue', 'angular', 'svelte', 'component', 'jsx', 'tsx', 'css', 'tailwind', 'styled', 'hook', 'state', 'props', 'render', 'dom', 'browser'],
    backend: ['server', 'express', 'fastify', 'koa', 'hono', 'worker', 'queue', 'job', 'cron', 'websocket', 'socket', 'stream', 'buffer', 'process'],
    devops: ['git', 'branch', 'merge', 'rebase', 'commit', 'push', 'pull', 'ci', 'cd', 'lint', 'format', 'prettier', 'eslint', 'biome', 'turbo', 'nx'],
    architecture: ['module', 'package', 'monorepo', 'workspace', 'dependency', 'import', 'export', 'abstract', 'interface', 'factory', 'pattern', 'layer', 'boundary'],
    performance: ['cache', 'optimize', 'benchmark', 'profile', 'memory', 'leak', 'slow', 'fast', 'latency', 'throughput', 'concurrent', 'parallel', 'worker'],
};
/** File extension → domain mapping. */
const FILE_TYPE_DOMAINS = {
    '.sql': ['database'],
    '.prisma': ['database'],
    '.graphql': ['api'],
    '.yaml': ['deployment', 'devops'],
    '.yml': ['deployment', 'devops'],
    '.dockerfile': ['deployment'],
    '.test.ts': ['testing'],
    '.test.js': ['testing'],
    '.spec.ts': ['testing'],
    '.spec.js': ['testing'],
    '.css': ['frontend'],
    '.scss': ['frontend'],
    '.html': ['frontend'],
    '.jsx': ['frontend'],
    '.tsx': ['frontend'],
};
// ---------------------------------------------------------------------------
// Tool category mapping
// ---------------------------------------------------------------------------
const TOOL_CATEGORIES = {
    read_file: 'filesystem',
    write_file: 'filesystem',
    edit_file: 'edit',
    list_files: 'filesystem',
    search_files: 'search',
    glob_files: 'search',
    run_shell_command: 'shell',
    git_status: 'git',
    git_diff: 'git',
    git_log: 'git',
    git_add: 'git',
    git_commit: 'git',
    git_checkout: 'git',
    skill: 'mcp',
    lsp_diagnostics: 'lsp',
    lsp_definition: 'lsp',
    lsp_references: 'lsp',
    web_search: 'search',
    web_fetch: 'search',
};
// ---------------------------------------------------------------------------
// Domain detection
// ---------------------------------------------------------------------------
function detectDomain(task, filePaths, toolCallArgs) {
    const allText = [task, ...toolCallArgs, ...filePaths].join(' ').toLowerCase();
    const scores = {};
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            const regex = new RegExp(`\\b${kw}\\b`, 'gi');
            const matches = allText.match(regex);
            if (matches)
                score += matches.length;
        }
        if (score > 0)
            scores[domain] = score;
    }
    // Boost from file types
    for (const fp of filePaths) {
        const ext = fp.slice(fp.lastIndexOf('.')).toLowerCase();
        const domains = FILE_TYPE_DOMAINS[ext];
        if (domains) {
            for (const d of domains) {
                scores[d] = (scores[d] ?? 0) + 2;
            }
        }
    }
    // Sort by score, pick top
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topDomain = sorted[0];
    const maxScore = sorted.reduce((sum, [, s]) => sum + s, 0);
    const topic = topDomain ? topDomain[0] : 'general';
    const confidence = maxScore > 0 ? Math.min(topDomain[1] / maxScore, 1) : 0;
    // Extract keywords (top-scoring domain's keywords that appear in text)
    const keywords = topDomain
        ? DOMAIN_KEYWORDS[topDomain[0]].filter(kw => allText.includes(kw))
        : [];
    // Extract file types
    const fileTypes = [...new Set(filePaths.map(fp => fp.slice(fp.lastIndexOf('.'))))];
    // Extract hot paths (directories from file paths)
    const dirCounts = {};
    for (const fp of filePaths) {
        const parts = fp.split('/');
        if (parts.length > 1) {
            const dir = parts.slice(0, -1).join('/');
            dirCounts[dir] = (dirCounts[dir] ?? 0) + 1;
        }
    }
    const hotPaths = Object.entries(dirCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([dir]) => dir);
    return { topic, confidence, keywords, fileTypes, hotPaths };
}
// ---------------------------------------------------------------------------
// Tool pattern extraction
// ---------------------------------------------------------------------------
function extractToolPattern(events) {
    const toolCalls = events.filter(e => e.type === 'tool_call_requested');
    // Ordered sequence (dedupe consecutive)
    const rawSequence = toolCalls.map(e => e.call.tool);
    const sequence = [];
    for (const tool of rawSequence) {
        if (sequence.length === 0 || sequence[sequence.length - 1] !== tool) {
            sequence.push(tool);
        }
    }
    // Frequency
    const frequency = {};
    for (const tool of rawSequence) {
        frequency[tool] = (frequency[tool] ?? 0) + 1;
    }
    // Friction (denied/asked tools)
    const friction = toolCalls
        .filter(e => e.policy === 'deny' || e.policy === 'ask')
        .map(e => e.call.tool);
    // Categories
    const categories = [...new Set(rawSequence
            .map(tool => TOOL_CATEGORIES[tool])
            .filter((c) => c !== undefined))];
    return { sequence, frequency, friction, categories };
}
// ---------------------------------------------------------------------------
// Quality extraction
// ---------------------------------------------------------------------------
function extractQuality(events) {
    const finalEvent = events.find(e => e.type === 'final_response');
    const verifiedEvents = events.filter(e => e.type === 'verified');
    const status = finalEvent?.status ?? 'unknown';
    const lastVerdict = verifiedEvents.length > 0
        ? verifiedEvents[verifiedEvents.length - 1].verdict.toUpperCase()
        : undefined;
    const revisionCycles = verifiedEvents.filter(e => e.verdict === 'needs_revision').length;
    const failures = [];
    for (const ve of verifiedEvents) {
        if (ve.verdict === 'fail') {
            for (const f of ve.findings) {
                failures.push({ stage: 'review', reason: f.description });
            }
        }
    }
    const errorEvents = events.filter(e => e.type === 'error');
    for (const ee of errorEvents) {
        failures.push({ stage: 'execution', reason: ee.message });
    }
    return { status, verdict: lastVerdict, revisionCycles, failures };
}
// ---------------------------------------------------------------------------
// Cost extraction
// ---------------------------------------------------------------------------
function extractCost(_events, costSpend) {
    const totalUsd = Object.values(costSpend).reduce((sum, c) => sum + c, 0);
    // Classify efficiency (rough heuristic)
    let efficiency = 'moderate';
    if (totalUsd < 0.10)
        efficiency = 'cheap';
    else if (totalUsd > 1.00)
        efficiency = 'expensive';
    return { totalUsd, perProvider: { ...costSpend }, efficiency };
}
// ---------------------------------------------------------------------------
// Agent behavior extraction
// ---------------------------------------------------------------------------
function extractAgentBehavior(events) {
    const agentSpawned = events.filter(e => e.type === 'agent_spawned');
    const handoffEvents = events.filter(e => e.type === 'handoff_triggered');
    return {
        count: agentSpawned.length,
        roles: [...new Set(agentSpawned.map(e => e.role))],
        handoffs: handoffEvents.length,
    };
}
// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------
class SessionAnalyzer {
    /**
     * Analyze a single session checkpoint and extract patterns.
     */
    analyze(checkpoint) {
        // Extract file paths from context_pack_created and tool call args
        const contextEvents = checkpoint.events.filter(e => e.type === 'context_pack_created');
        const filePaths = contextEvents.flatMap(e => e.files);
        // Extract tool call args for domain detection
        const toolCallEvents = checkpoint.events.filter(e => e.type === 'tool_call_requested');
        const toolCallArgs = toolCallEvents.map(e => JSON.stringify(e.call.args));
        return {
            sessionId: checkpoint.sessionId,
            domain: detectDomain(checkpoint.task, filePaths, toolCallArgs),
            tools: extractToolPattern(checkpoint.events),
            quality: extractQuality(checkpoint.events),
            cost: extractCost(checkpoint.events, checkpoint.costSpend),
            agents: extractAgentBehavior(checkpoint.events),
            mode: checkpoint.mode,
            task: checkpoint.task,
        };
    }
    /**
     * Analyze multiple sessions and find recurring patterns.
     */
    analyzeBatch(checkpoints) {
        const patterns = checkpoints.map(cp => this.analyze(cp));
        // Group by domain
        const byDomain = new Map();
        for (const p of patterns) {
            const key = p.domain.topic;
            const existing = byDomain.get(key) ?? [];
            existing.push(p);
            byDomain.set(key, existing);
        }
        // Group by tool sequence (stringified)
        const bySequence = new Map();
        for (const p of patterns) {
            const key = p.tools.sequence.join('→');
            const existing = bySequence.get(key) ?? [];
            existing.push(p);
            bySequence.set(key, existing);
        }
        // Group by outcome
        const byOutcome = new Map();
        for (const p of patterns) {
            const key = p.quality.status;
            const existing = byOutcome.get(key) ?? [];
            existing.push(p);
            byOutcome.set(key, existing);
        }
        // Build domain clusters
        const domainClusters = [];
        for (const [topic, sessions] of byDomain) {
            if (sessions.length < 2)
                continue;
            const allKeywords = sessions.flatMap(s => s.domain.keywords);
            const keywordCounts = countOccurrences(allKeywords);
            const keywords = topN(keywordCounts, 10);
            const allFileTypes = sessions.flatMap(s => s.domain.fileTypes);
            const fileTypes = [...new Set(allFileTypes)];
            const allHotPaths = sessions.flatMap(s => s.domain.hotPaths);
            const hotPathCounts = countOccurrences(allHotPaths);
            const hotPaths = topN(hotPathCounts, 5);
            const successCount = sessions.filter(s => s.quality.status === 'done').length;
            const successRate = successCount / sessions.length;
            domainClusters.push({
                topic,
                sessions,
                keywords,
                fileTypes,
                hotPaths,
                successRate,
            });
        }
        // Detect repeated sequences
        const repeatedSequences = [];
        for (const [seqKey, sessions] of bySequence) {
            if (sessions.length < 2)
                continue;
            const sequence = seqKey.split('→');
            const successCount = sessions.filter(s => s.quality.status === 'done').length;
            const avgCost = sessions.reduce((sum, s) => sum + s.cost.totalUsd, 0) / sessions.length;
            const domainKeywords = [...new Set(sessions.flatMap(s => s.domain.keywords))];
            repeatedSequences.push({
                sequence,
                frequency: sessions.length,
                successRate: successCount / sessions.length,
                avgCost,
                domainKeywords,
            });
        }
        return {
            byDomain,
            bySequence,
            byOutcome,
            domainClusters,
            repeatedSequences: repeatedSequences.sort((a, b) => b.frequency - a.frequency),
        };
    }
}
exports.SessionAnalyzer = SessionAnalyzer;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function countOccurrences(items) {
    const counts = {};
    for (const item of items) {
        counts[item] = (counts[item] ?? 0) + 1;
    }
    return counts;
}
function topN(counts, n) {
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([item]) => item);
}
//# sourceMappingURL=session-analyzer.js.map