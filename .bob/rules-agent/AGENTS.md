# Project Coding Rules (Non-Obvious Only)

## State & Persistence
- All workflow state reads/writes go through `readWorkflowState()` / `writeWorkflowState()` in `lib/workflow-state.ts` — never touch `.next/tmp/workflow-state.json` directly.
- When adding a new array field to `AIAnalysisResult`, you **must** also add a normalisation guard in `normaliseReview()` (same file) — otherwise `.map()` crashes occur when reading state written before the field existed.
- The Zustand client store (`store/workflow-store.ts`) must be hydrated from the server via `hydrateFromServer()` after every mutation that changes workflow stage. API routes call the file; the client calls the store directly — never call the file from client code.

## API Routes
- Every GET route that reads workflow state needs `export const dynamic = 'force-dynamic'` or Next.js caches the response at build time.
- Error shape returned by POST routes: `{ error: true, message: string, pipelineStage: 'failed' }` — match this shape for any new failure path.

## Services
- Guard every IBM service call with the corresponding `hasXxxConfig()` helper from `lib/env.ts`. Services must return a mock/log-only result when the guard returns false — never throw.
- IAM tokens are cached at module scope (30-second early refresh). Do not add per-request token fetches.
- ICA on-demand asset generation (`services/ica-generate-service.ts`) is a **single** Granite call — never fan out to multiple agents for it.

## Imports & Types
- Use `@/` aliases everywhere — no `../../` relative paths across directories.
- Consume env through `appEnv.*` from `@/lib/env`, never `process.env.*` in services/components.
- All domain types are in `@/types/domain`; watsonx pipeline types in `@/types/watsonx`.
- Status values are kebab-case string literals — never convert them to enums.

## UI Conventions
- Always use `cn()` from `@/lib/utils` for conditional Tailwind classes.
- Always use `statusTone(status)` from `@/lib/utils` for status-driven text colour — do not hardcode Tailwind colour classes.
- `data/mock-dashboard.ts` is the **base** object — live AI results overlay specific fields on top, they do not replace the entire object.
