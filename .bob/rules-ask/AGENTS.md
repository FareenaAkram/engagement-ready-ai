# Project Documentation Rules (Non-Obvious Only)

## Architecture Orientation
- This is **not** a standard CRUD app. The core user flow is: consultant pastes discovery notes → 3-agent watsonx.ai pipeline → readiness score + consulting assets → HITL consultant decision → workflow advances.
- `app/page.tsx` immediately redirects to `/dashboard` — the root route is never rendered.
- Every page is an `AppShell` + single View component (e.g. `DashboardView`, `AIAnalysisView`). The `AppShell` owns the sidebar/nav; the View component owns data fetching.

## Where Logic Lives
- **Server logic**: `services/` (IBM API calls, pipeline, notifications). All services are server-only — none are imported by client components.
- **Server state**: `lib/workflow-state.ts` — the file-based DB (`.next/tmp/workflow-state.json`).
- **Client state**: `store/workflow-store.ts` (Zustand) + `store/app-store.ts` (settings).
- **Data fetching on client**: `hooks/use-dashboard-data.ts` via TanStack Query — `queryKey: ['dashboard']` is the single shared cache key all pages use.
- **Mock fallback base**: `data/mock-dashboard.ts` — used when no live assessment exists.

## IBM Integration Reality
- ICA MCP Gateway (`ICA_MCP_URL`) requires Bob-generated session tokens, not static API keys. The `ak_` keys in `.env.local` work only for VS Code ICA extensions. The app's real delivery path is: JSON export → IBM Bob (MCP) → ICA Context Studio.
- Context Studio (`CONTEXT_STUDIO_API_KEY`) uses a JWT from `.bob/mcp.json`, not a separate credentials system — the same token serves both the Bob MCP tool and the server-side API calls.
- The `agent-orchestration-creation.yaml` file is the canonical architecture spec (LangGraph supervisor, v5) and documents the 3-layer IBM responsibility split.

## Workflow Stages
Approval chain in strict order (see `WORKFLOW_STAGE_ORDER` in `lib/workflow-state.ts`):
`assessment-started` → `ai-analysis` → `assets-generated` → `actions-created` → `consultant-review` → `engagement-ready`

Pipeline execution stages (`PipelineStage` type):
`pending` → `collecting-data` → `running-watsonx-analysis` → `building-recommendations` → `generating-action-plan` → `dispatching-workflow` → `completed` | `failed`
