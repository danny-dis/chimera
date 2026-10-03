# NOESIS Integration & Secrets Boundary

CHIMERA may consume NOESIS context, but NOESIS remains an independent memory OS.

## Integration

CHIMERA should request only the minimum NOESIS context required for a task and identify:

- principal/agent;
- task or purpose;
- requested scope;
- sensitivity;
- retention requirements;
- correlation/execution id.

NOESIS context is learned experience, not authorization. CHIMERA must still enforce its own tool, provider, workspace and execution permissions.

## AutoResearch / learning

CHIMERA's learning/evaluation systems may use the portable evolution protocol for non-privileged skills and workflows. Rejected candidates, failures and experiment lineage should remain available as research memory.

A learning loop must not mutate:
- secret access policy;
- identity;
- provider credentials;
- sandbox boundaries;
- evaluation authority;
- security policy.

## Secrets

API keys, provider credentials, tokens, private keys and similar material must never be treated as ordinary NOESIS context.

Secret-bearing trajectories must be:
- redacted;
- tokenized;
- or excluded

before entering learning, replay, evaluation, telemetry or durable memory.

Prefer brokered/short-lived secret use. A CHIMERA worker should receive permission to perform an operation rather than unrestricted access to the underlying credential.

## Boundary

```
CHIMERA
  │
  ├── task context ──→ NOESIS
  │                    │
  │                    └── learned experience only
  │
  └── secret operation ──→ secret broker/vault
                           │
                           └── never ordinary memory
```

**NOESIS can improve what CHIMERA knows; it cannot grant CHIMERA authority.**
