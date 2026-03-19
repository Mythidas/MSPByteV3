import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import { PolicyExistsEvaluator } from './evaluators/PolicyExistsEvaluator';
import { PolicyNotExistsEvaluator } from './evaluators/PolicyNotExistsEvaluator';
import { PolicyCountGteEvaluator } from './evaluators/PolicyCountGteEvaluator';
import { FieldEqualsEvaluator } from './evaluators/FieldEqualsEvaluator';
import { FieldNotEqualsEvaluator } from './evaluators/FieldNotEqualsEvaluator';
import { FieldCompareEvaluator } from './evaluators/FieldCompareEvaluator';

export interface EvalContext {
  tenantId: string;
  linkId: string;
  supabase: SupabaseClient<Database>;
}

export interface EvalResult {
  passed: boolean;
  detail?: Record<string, unknown>;
}

export interface CheckEvaluator {
  evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult>;
}

export interface CheckTypeDefinition {
  id: string;
  integrationId: string;
  name: string;
  description: string;
  evaluator: CheckEvaluator;
}

export const checkTypeRegistry = new Map<string, CheckTypeDefinition>([
  [
    'policy_exists',
    {
      id: 'policy_exists',
      integrationId: '*',
      name: 'Policy Exists',
      description: 'Passes when at least one row matches the given conditions',
      evaluator: new PolicyExistsEvaluator(),
    },
  ],
  [
    'policy_not_exists',
    {
      id: 'policy_not_exists',
      integrationId: '*',
      name: 'Policy Not Exists',
      description: 'Passes when no rows match the given conditions',
      evaluator: new PolicyNotExistsEvaluator(),
    },
  ],
  [
    'policy_count_gte',
    {
      id: 'policy_count_gte',
      integrationId: '*',
      name: 'Policy Count ≥',
      description: 'Passes when the count of matching rows meets or exceeds the threshold',
      evaluator: new PolicyCountGteEvaluator(),
    },
  ],
  [
    'field_compare',
    {
      id: 'field_compare',
      integrationId: '*',
      name: 'Field Compare',
      description: 'Passes when a specific field satisfies the given operator and value',
      evaluator: new FieldCompareEvaluator(),
    },
  ],
  // Legacy — kept so any previously-saved checks continue to evaluate correctly
  [
    'field_equals',
    {
      id: 'field_equals',
      integrationId: '*',
      name: 'Field Equals (legacy)',
      description: 'Checks that a specific field equals an expected value',
      evaluator: new FieldEqualsEvaluator(),
    },
  ],
  [
    'field_not_equals',
    {
      id: 'field_not_equals',
      integrationId: '*',
      name: 'Field Not Equals (legacy)',
      description: 'Checks that a specific field does not equal a given value',
      evaluator: new FieldNotEqualsEvaluator(),
    },
  ],
]);

export function getCheckType(id: string): CheckTypeDefinition {
  const def = checkTypeRegistry.get(id);
  if (!def) throw new Error(`Unknown check type: ${id}`);
  return def;
}
