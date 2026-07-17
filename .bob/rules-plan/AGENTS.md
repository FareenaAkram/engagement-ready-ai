# Project Architecture Rules (Non-Obvious Only)

## Foundational Constraints
- **No database** — workflow state is a single JSON file at `.next/tmp/workflow-state.json`. The `.next/tmp/` directory is created on demand. This is intentional; adding a DB breaks the deployment model.
- **No test framework** — there are no tests, no vitest/jest config, no `__tests__` directories. Adding tests requires first adding a test framework.
- **Assessment count and totalTimeSavedHours are preserved across resets** — `resetWorkflowState()` explicitly carries these forward for analytics continuity. Do not reset them.

## Pipeline Immutability Rules
- The 3-agent watsonx pipeline is strictly sequential and stateless between calls: Agent 1 output → Agent 2 input, Agent 2 output → Agent 3 input. No shared context object between calls; data flows as function arguments only.
- `runWatsonxPipeline()` returns `{ fallback: true }` when credentials are absent — all callers **must** handle this and use mock data. The pipeline never throws to the caller; errors are caught internally and returned as `{ success: false }`.

## HITL Design
- AI readiness decision is advisory only. `workflowStage` advances to `'engagement-ready'` only after `recordHITLDecision()` is called with a consultant decision. Nothing auto-advances to the final stage.
- Overrides require a justification string — stored in the immutable `approvalStageHistory` array which is append-only (never modified, only extended).

## Dual State Synchronisation Contract
- Server file is the source of truth for persistence. Zustand client store is the source of truth for rendering.
- After any API route mutates state, it returns a `WorkflowEnvelope` that the client immediately uses to call `useWorkflowStore.getState().hydrateFromServer()`. Breaking this contract causes stale UI.
- `isCurrentSession` is false only when state was loaded from a previous server restart with no active assessment — used to suppress "live" UI indicators.

## IBM Service Integration Architecture
- **Context Studio** — called once per assessment for ontology/governance validation. Context ID `ctx_feac5bf8841e` is hardcoded as a default in `lib/env.ts` and in the orchestration YAML.
- **watsonx Orchestrate** — optional post-pipeline dispatch. When not configured, the plan is logged only (no side effects, no failure).
- **ICA** — post-assessment on-demand only; not part of the core scoring pipeline. Generates 18 artefact types via single focused Granite calls.
- TanStack Query `staleTime: 30_000` (30s) is intentional — matches `autoRefreshSeconds` setting default and prevents excessive polling.
