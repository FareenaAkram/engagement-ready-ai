# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project

**Engagement Ready AI** — Next.js 15 + React 19 + TypeScript + Tailwind CSS v4 app for IBM Consulting engagement readiness assessment. Uses IBM watsonx.ai (Granite), IBM Consulting Advantage (ICA), and IBM Context Studio (MCP).

## Commands

```bash
npm run dev        # Next.js with --turbopack (not plain webpack)
npm run build
npm run lint       # ESLint with next/core-web-vitals + next/typescript (flat config)
npm run typecheck  # tsc --noEmit (strict mode — no allowJs)
```

No test framework is configured. There are no test files in this project.

## Path Aliases

All imports use `@/` aliases — **never use relative paths** for cross-directory imports. Aliases defined in [`tsconfig.json`](tsconfig.json): `@/app/*`, `@/components/*`, `@/lib/*`, `@/services/*`, `@/types/*`, `@/store/*`, `@/data/*`, `@/hooks/*`, `@/styles/*`.

## Critical Architecture Patterns

### Persistent State — File-Based, Not DB
[`lib/workflow-state.ts`](lib/workflow-state.ts) persists all workflow state to `.next/tmp/workflow-state.json`. This is the **single source of truth** for the server side. All API routes read/write through `readWorkflowState()` / `writeWorkflowState()`. Never use a DB — this is intentional.

### Dual State: Server file + Zustand client store
Server state in `.next/tmp/workflow-state.json` → hydrated into [`store/workflow-store.ts`](store/workflow-store.ts) via `hydrateFromServer()`. Client mutations call API routes which update the file, then the client store is updated directly (no page reload). Both must stay in sync.

### `normaliseReview()` is mandatory for all persisted reads
When reading `AIAnalysisResult` from the state file, always pass it through `normaliseReview()` (already called by `readWorkflowState()`). Skipping this will cause `.map()` crashes on components that expect arrays for `criticalIssues`, `reasoningTrace`, `missingStakeholders`, etc.

### watsonx Pipeline — 3-Agent Sequential (No Parallelism)
[`services/watsonx-service.ts`](services/watsonx-service.ts) runs 3 agents in strict order: Discovery Consolidator → Delivery Readiness Analyst → Consulting Asset Generator. Each takes the previous agent's output as input. When `hasWatsonxConfig()` returns false, the entire pipeline returns `{ success: false, fallback: true }` and callers use mock data.

### ICA Asset Generation is Separate from Pipeline
[`services/ica-generate-service.ts`](services/ica-generate-service.ts) generates consulting artefacts AFTER the readiness assessment — it is a single Granite call per asset type, never part of the 3-agent pipeline. Do not merge them.

### Feature Gating via `hasXxxConfig()` guards
All IBM service calls are guarded by helpers in [`lib/env.ts`](lib/env.ts): `hasWatsonxConfig()`, `hasOrchestrateConfig()`, `hasICAConfig()`, `hasContextStudioConfig()`, `hasSlackConfig()`, `hasEmailConfig()`. Services degrade gracefully to mock/log-only mode when credentials are absent.

### `export const dynamic = 'force-dynamic'` on all GET routes
Every read-only API route that touches workflow state must have this export or Next.js will cache the response at build time.

### IAM Tokens Are Module-Scoped and Cached
Each service (`watsonx-service.ts`, `orchestrate-service.ts`, `ica-generate-service.ts`) caches its own IBM IAM token in module-level variables with a 30-second buffer before expiry. Do not add more caching layers on top.

## Environment Variables

All env vars are validated and typed in [`lib/env.ts`](lib/env.ts) via Zod. Access them through `appEnv.*` — never `process.env.*` directly in services or components. Defaults: `watsonxUrl = 'https://us-south.ml.cloud.ibm.com'`, `watsonxModelId = 'ibm/granite-3-8b-instruct'`, `contextStudioCtxId = 'ctx_feac5bf8841e'`.

## Code Style

- **No `any`** — `strict: true`, use `unknown` + type narrowing or explicit interface casts
- Error discrimination: `err instanceof Error ? err.message : 'Unknown error'`
- Status values are kebab-case string literals (e.g. `'ready-with-conditions'`, `'not-ready'`), not enums
- UI class merging: always use `cn()` from [`lib/utils.ts`](lib/utils.ts) (wraps `clsx` + `tailwind-merge`)
- Status colours: use `statusTone()` from `lib/utils.ts` — do not hardcode Tailwind colour classes for status values
- Section dividers in services use the `// ─── Title ──` style comment pattern
- All domain types live in [`types/domain.ts`](types/domain.ts); watsonx-specific types in [`types/watsonx.ts`](types/watsonx.ts)

## Data / Mock Fallback

[`data/mock-dashboard.ts`](data/mock-dashboard.ts) is the fallback for all dashboard fields when no live assessment exists. Real AI results overlay specific fields on top of the mock base — they do not replace the entire mock object.
