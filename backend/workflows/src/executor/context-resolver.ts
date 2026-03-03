import type { RunContext } from '../types.js';

/**
 * Returns IDs within this run's resolved scope for a given target type.
 * Alert/tag resolve and remove operations MUST only act on IDs in this set.
 */
export function getScopedTargetIds(
  ctx: RunContext,
  targetType: 'entity' | 'site' | 'connection'
): string[] {
  if (targetType === 'entity') {
    if (ctx.seed.scope_type === 'entity_ids') return ctx.seed.entity_ids ?? [];
    return Object.keys(ctx.entity_log);
  }
  if (targetType === 'site') {
    return ctx.seed.site_ids ?? [];
  }
  // connection — no dedicated field in seed; return empty (caller must provide resolve_target_ids)
  return [];
}

export class PathResolutionError extends Error {
  constructor(
    public path: string,
    message: string
  ) {
    super(message);
    this.name = 'PathResolutionError';
  }
}

/**
 * Walk a dot-path against the RunContext.
 *
 * Root namespaces:
 *   'seed'          -> ctx.seed
 *   'stage_outputs' -> ctx.stage_outputs
 *   'context'       -> ctx
 */
export function resolvePath(ctx: RunContext, path: string): unknown {
  const parts = path.split('.');
  const root = parts[0];

  let current: unknown;

  switch (root) {
    case 'seed':
      current = ctx.seed;
      break;
    case 'stage_outputs':
      current = ctx.stage_outputs;
      break;
    case 'context':
      current = ctx;
      break;
    default:
      throw new PathResolutionError(path, `Unknown root namespace: "${root}"`);
  }

  for (const part of parts.slice(1)) {
    if (current === null || current === undefined) {
      throw new PathResolutionError(
        path,
        `Path "${path}" resolved to null/undefined at segment "${part}"`
      );
    }
    if (typeof current !== 'object') {
      throw new PathResolutionError(
        path,
        `Cannot navigate into non-object at segment "${part}" in path "${path}"`
      );
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
