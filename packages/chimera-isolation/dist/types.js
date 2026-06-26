"use strict";
/**
 * Isolation Provider Abstraction Types
 *
 * Platform-agnostic interfaces for workflow isolation mechanisms.
 * Git worktrees are the default implementation, but the abstraction
 * enables future strategies (containers, VMs, remote).
 *
 * This is a slimmed port of research/archon/packages/isolation/src/types.ts.
 * Archon's full type surface has been narrowed to chimera's actual needs:
 *   - kept: 'task' IsolationRequest variant
 *   - dropped: 'issue' | 'pr' | 'review' | 'thread' (no multi-source intake)
 *   - dropped: PR-specific IsolationHints fields
 *   - dropped: ResolveRequest / IsolationResolver (premature)
 *
 * The single source of truth for the `IIsolationProvider` contract lives here.
 * Ported from research/archon/packages/isolation/src/types.ts @ 2026-06-15.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map