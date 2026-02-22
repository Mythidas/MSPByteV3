# MSPByteV3 Architecture

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/frontend (SvelteKit)                                       │
│  apps/agent (Tauri)                                              │
├─────────────────────────────────────────────────────────────────┤
│  backend/pipeline                                                │
│    adapters/ → linkers/ → analyzers/                             │
├─────────────────────────────────────────────────────────────────┤
│  packages/shared                                                 │
│    lib/services/    ← business logic (uses connectors)           │
│    lib/connectors/  ← API clients (one method = one endpoint)    │
│    lib/utils/       ← logger, audit, errors, encryption          │
│    config/          ← policy constants (no logic)                │
│    types/           ← TypeScript types only                      │
└─────────────────────────────────────────────────────────────────┘
```

## Layer Rules

### Connector Rule
> **One public method = one API endpoint** (or pagination over one endpoint).
> No business logic. No config constants. No multi-step orchestration.

Connectors live in `packages/shared/src/lib/connectors/`. They are pure API clients —
they authenticate, paginate, and return typed data. Nothing more.

**Good:**
```typescript
async getServicePrincipalId(): Promise<APIResponse<string | null>>
async assignDirectoryRole(principalId: string, roleDefinitionId: string): Promise<APIResponse<boolean>>
```

**Bad:**
```typescript
// Multi-step: find SP then assign roles — belongs in a service
async ensureDirectoryRoles(roles: Record<string, string>): Promise<{ assigned, failed }>
```

### Service Rule
> A service wraps one or more connector calls with **business logic**.
> It may have state (caches, derived config).
> It lives in `packages/shared/src/lib/services/` and is available to both the pipeline AND the frontend.

```typescript
// packages/shared/src/lib/services/microsoft/RoleManager.ts
export class Microsoft365RoleManager {
  constructor(private connector: Microsoft365Connector) {}
  async ensureDirectoryRoles(roles: Record<string, string>): Promise<{ assigned, failed }>
}
```

### Config Rule
> Policy constants (role IDs, feature flags, limits) live in `packages/shared/src/config/`.
> Never define policy config inside a connector or adapter.

```typescript
// packages/shared/src/config/microsoft.ts
export const REQUIRED_DIRECTORY_ROLES: Record<string, string> = { ... };
```

### Adapter Rule
> Adapters live in `backend/pipeline/src/adapters/`.
> They use connector + service classes to fetch data and map it to `RawEntity[]`.
> They do not call external APIs directly.

## Logging Guide

All code uses a single unified logger from `packages/shared/src/lib/utils/logger`.

### Console Logging (everywhere)
```typescript
import { Logger } from '@workspace/shared/lib/utils/logger';

Logger.trace({ module: 'MyClass', context: 'myMethod', message: 'verbose detail' });
Logger.info({ module: 'MyClass', context: 'myMethod', message: 'started processing' });
Logger.warn({ module: 'MyClass', context: 'myMethod', message: 'retrying after timeout' });

// error() and fatal() return { error: APIError } for use in APIResponse functions
return Logger.error({ module: 'MyClass', context: 'myMethod', message: String(err) });
```

Log format: `[HH:MM:SS][LEVEL][MODULE][CONTEXT] message`

Set minimum level: `Logger.level = 'info';` (suppresses trace in production).

### Database Logging (frontend server routes only)

The `diagnostic_logs` table is a user/admin-visible operational log. Write to it at
catch boundaries in frontend `+server.ts` and `+page.server.ts` files when an error
is something an operator might need to investigate.

```typescript
import { writeDiagnosticLog } from '@workspace/shared/lib/utils/audit';
import { safeErrorMessage } from '@workspace/shared/lib/utils/errors';

catch (err) {
  Logger.error({ module: 'consent', context: 'save', message: safeErrorMessage(err) });
  await writeDiagnosticLog(locals.supabase, {
    tenant_id: locals.user.tenant_id,
    level: 'error',
    module: 'consent',
    context: 'save',
    message: safeErrorMessage(err),
  });
}
```

**Pipeline** does not write to `diagnostic_logs`. It uses `Logger.*` for console and
`sync_jobs.metrics` (via `PipelineTracker`) for structured job metrics.

### Audit Logging

Use `writeAuditLog` for user-visible actions: consent granted, connection deleted,
role assigned, config changed.

```typescript
import { writeAuditLog } from '@workspace/shared/lib/utils/audit';

await writeAuditLog(locals.supabase, {
  tenant_id: ..., actor: 'system', action: 'role_assigned',
  target_type: 'integration_connection', target_id: ...,
  result: 'success', detail: { assigned, failed },
});
```

## What Belongs Where

| Concern | Location |
|---------|----------|
| TypeScript types | `packages/shared/src/types/` |
| API client (one endpoint) | `packages/shared/src/lib/connectors/` |
| Business logic (multi-step) | `packages/shared/src/lib/services/` |
| Policy constants | `packages/shared/src/config/` |
| Logging, errors, audit | `packages/shared/src/lib/utils/` |
| Raw entity fetch (pipeline) | `backend/pipeline/src/adapters/` |
| Relationship linking | `backend/pipeline/src/linkers/` |
| Data analysis | `backend/pipeline/src/analyzers/` |
| User-facing routes | `apps/frontend/src/routes/(app)/` |

## How to Add a New Integration

1. **Types** — create `packages/shared/src/types/integrations/{name}/index.ts` and type files
2. **Connector** — `packages/shared/src/lib/connectors/{Name}Connector.ts`
   - One public method per API endpoint
   - Accept a config object in the constructor
   - Return `APIResponse<T>` from every public method
3. **Services** (if needed) — `packages/shared/src/lib/services/{name}/`
   - Multi-step orchestration goes here, not in the connector
4. **Adapter** — `backend/pipeline/src/adapters/{Name}Adapter.ts`
   - Extends `BaseAdapter`
   - Implements `fetchData()` → returns `AdapterFetchResult`
   - Maps API responses to `RawEntity[]`
5. **Linker** (if entities have relationships) — `backend/pipeline/src/linkers/{Name}Linker.ts`
6. **Analyzer** — `backend/pipeline/src/analyzers/{Name}Analyzer.ts` (or extend `AnalysisOrchestrator`)
7. **Register** — add to `INTEGRATION_CONFIGS` in `backend/pipeline/src/config.ts` and wire in `index.ts`
8. **Frontend integration page** — `apps/frontend/src/routes/(app)/integrations/{name}/`

## Anti-Patterns to Avoid

- `console.log` / `console.error` anywhere — use `Logger.*` instead
- Config constants inside connectors — put them in `packages/shared/src/config/`
- Multi-step orchestration inside connectors — move to a service
- Business logic in adapters — adapters only fetch and map
- Writing to `diagnostic_logs` from the pipeline — console + metrics only
- Importing `debug.ts` — it no longer exists; use `logger.ts`
- Dead code in connectors — if a method is not called anywhere, delete it
