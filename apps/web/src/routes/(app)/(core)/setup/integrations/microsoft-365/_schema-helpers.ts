import type {
  SchemaFields,
  FieldDefinition,
} from '@workspace/core/types/contracts/schema-registry';
import type { ConditionOperator } from '@workspace/core/types/contracts/compliance';

export type FlatField = {
  key: string;
  label: string;
  ingestPath: string;
  field: FieldDefinition;
};

export type OperatorOption = {
  value: ConditionOperator;
  label: string;
};

export function getFlatTrackableFields(shape: SchemaFields, parentLabel = ''): FlatField[] {
  const results: FlatField[] = [];
  for (const [key, def] of Object.entries(shape)) {
    const label = parentLabel ? `${parentLabel} / ${def.label}` : def.label;
    if (def.type === 'object' && def.fields) {
      results.push(...getFlatTrackableFields(def.fields, label));
    } else if (def.trackable) {
      results.push({ key, label, ingestPath: def.ingestPath, field: def });
    }
  }
  return results;
}

const SCALAR_OPS: OperatorOption[] = [
  { value: 'eq', label: '= equals' },
  { value: 'neq', label: '≠ not equals' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
];

const NUMERIC_OPS: OperatorOption[] = [
  { value: 'eq', label: '= equals' },
  { value: 'neq', label: '≠ not equals' },
  { value: 'gt', label: '> greater than' },
  { value: 'gte', label: '≥ at least' },
  { value: 'lt', label: '< less than' },
  { value: 'lte', label: '≤ at most' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
];

const ARRAY_OPS: OperatorOption[] = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'size_eq', label: 'count =' },
  { value: 'size_gte', label: 'count ≥' },
  { value: 'size_lte', label: 'count ≤' },
  { value: 'is_null', label: 'is empty' },
  { value: 'is_not_null', label: 'is not empty' },
];

export function getOperatorsForField(field: FlatField): OperatorOption[] {
  if (field.field.modality === 'array') return ARRAY_OPS;
  if (field.field.type === 'number') return NUMERIC_OPS;
  // boolean and enum are equality-only (no ordering operators)
  if (field.field.type === 'boolean' || field.field.type === 'enum') {
    return [
      { value: 'eq', label: '= equals' },
      { value: 'neq', label: '≠ not equals' },
    ];
  }
  return SCALAR_OPS;
}

/** Returns true for operators that do not require a value input (e.g. is_null). */
export function opNeedsValue(op: ConditionOperator): boolean {
  return op !== 'is_null' && op !== 'is_not_null';
}

/** Returns true for size operators (value must be a number). */
export function opIsSize(op: ConditionOperator): boolean {
  return op === 'size_eq' || op === 'size_gte' || op === 'size_lte';
}
