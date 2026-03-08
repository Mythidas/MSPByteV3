import { Logger } from '@workspace/shared/lib/utils/logger';
import { registerNode } from '../../registry.js';
import type { RunContext } from '../../../types.js';

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'lt',
  'gte',
  'lte',
  'is_true',
  'is_false',
  'is_null',
  'is_not_null',
] as const;

registerNode({
  ref: 'Generic.Filter',
  label: 'Filter',
  description: 'Splits an entity array into matching and non-matching sets.',
  category: 'transform',
  integration: null,
  isGeneric: true,
  pins: [
    { key: 'entities', kind: 'input', dataType: 'string', cardinality: 'array' },
    { key: 'in', kind: 'output', dataType: 'string', cardinality: 'array' },
    { key: 'out', kind: 'output', dataType: 'string', cardinality: 'array' },
  ],
  paramSchema: [
    { key: 'field', label: 'Field', dataType: 'string', cardinality: 'single', required: true },
    {
      key: 'operator',
      label: 'Operator',
      dataType: 'string',
      cardinality: 'single',
      required: true,
    },
    { key: 'value', label: 'Value', dataType: 'string', cardinality: 'single', required: false },
  ],
  async execute(input, _ctx: RunContext) {
    const entities = input.entities as Record<string, unknown>[];
    const field = input.field as string;
    const operator = input.operator as string;
    const value = input.value as string | undefined;
    const inArray: unknown[] = [];
    const outArray: unknown[] = [];

    Logger.info({
      module: 'workflows',
      context: 'Generic.Filter',
      message: `Filtering ${entities.length} entities on ${field} ${operator} ${value ?? ''}`,
    });

    for (const entity of entities) {
      const fieldVal = getFieldValue(entity, field);
      let match = false;

      switch (operator) {
        case 'is_null':
          match = fieldVal == null;
          break;
        case 'is_not_null':
          match = fieldVal != null;
          break;
        case 'is_true':
          match = fieldVal === true;
          break;
        case 'is_false':
          match = fieldVal === false;
          break;
        case 'eq':
          match = fieldVal == value;
          break;
        case 'neq':
          match = fieldVal != value;
          break;
        case 'gt':
          if (typeof fieldVal !== 'number') { outArray.push(entity); continue; }
          match = fieldVal > Number(value);
          break;
        case 'lt':
          if (typeof fieldVal !== 'number') { outArray.push(entity); continue; }
          match = fieldVal < Number(value);
          break;
        case 'gte':
          if (typeof fieldVal !== 'number') { outArray.push(entity); continue; }
          match = fieldVal >= Number(value);
          break;
        case 'lte':
          if (typeof fieldVal !== 'number') { outArray.push(entity); continue; }
          match = fieldVal <= Number(value);
          break;
        default:
          outArray.push(entity);
          continue;
      }

      if (match) inArray.push(entity);
      else outArray.push(entity);
    }

    return {
      in: inArray,
      out: outArray,
      _metrics: {
        input_count: entities.length,
        in_count: inArray.length,
        out_count: outArray.length,
      },
    };
  },
});

const getFieldValue = (entity: Record<string, unknown>, field: string): unknown => {
  return field.split('.').reduce<unknown>((obj, key) => {
    if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[key];
    return undefined;
  }, entity);
};
