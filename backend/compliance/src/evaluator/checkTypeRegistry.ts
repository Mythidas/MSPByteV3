import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import { PolicyExistsEvaluator } from './evaluators/PolicyExistsEvaluator';
import { PolicyCountGteEvaluator } from './evaluators/PolicyCountGteEvaluator';
import { FieldEqualsEvaluator } from './evaluators/FieldEqualsEvaluator';
import { FieldNotEqualsEvaluator } from './evaluators/FieldNotEqualsEvaluator';

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
      description: 'Checks that at least one matching policy row exists',
      evaluator: new PolicyExistsEvaluator(),
    },
  ],
  [
    'policy_count_gte',
    {
      id: 'policy_count_gte',
      integrationId: '*',
      name: 'Policy Count GTE',
      description: 'Checks that the count of matching rows meets a threshold',
      evaluator: new PolicyCountGteEvaluator(),
    },
  ],
  [
    'field_equals',
    {
      id: 'field_equals',
      integrationId: '*',
      name: 'Field Equals',
      description: 'Checks that a specific field equals an expected value',
      evaluator: new FieldEqualsEvaluator(),
    },
  ],
  [
    'field_not_equals',
    {
      id: 'field_not_equals',
      integrationId: '*',
      name: 'Field Not Equals',
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
