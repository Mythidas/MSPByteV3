import type { ScopeDefinition } from '../types.js';

// ============================================================================
// PARAM DEFINITION — describes a user-configurable input for frontend UI
// ============================================================================

export interface ParamDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  required: boolean;
  description?: string;
  placeholder?: string;
  options?: { label: string; value: string }[]; // for 'select' type
}

// ============================================================================
// REGISTRY ENTRY TYPES
// ============================================================================

export interface LiveQueryRegistryEntry {
  handler: (
    connector: any,
    params: Record<string, any>,
    tenantId: string,
    scope: ScopeDefinition
  ) => Promise<any>;
  params: ParamDefinition[];
}

export interface ActionRegistryEntry {
  handler: (connector: any, params: Record<string, any>) => Promise<any>;
  params: ParamDefinition[];
}

// ============================================================================
// REGISTRY SHAPES
// ============================================================================

export type LiveQueryRegistry = Record<
  string,
  Record<string, Record<string, LiveQueryRegistryEntry>>
>;
export type ActionRegistry = Record<string, Record<string, Record<string, ActionRegistryEntry>>>;
