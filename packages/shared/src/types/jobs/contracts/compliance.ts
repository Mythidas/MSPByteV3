export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'size_eq'
  | 'size_gte'
  | 'size_lte'
  | 'is_null'
  | 'is_not_null';

export type ConditionLogic = 'AND' | 'OR';

export type CheckCondition = {
  field: string;
  op: ConditionOperator;
  value?: unknown;
};

export type ConditionGroup = {
  logic: ConditionLogic;
  conditions: CheckCondition[];
};

export type CheckConfig = {
  table: string;
  filter?: ConditionGroup;
  threshold?: number;
  // For field_compare
  field?: string;
  op?: ConditionOperator;
  value?: unknown;
};
