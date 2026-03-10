import type { DataTableColumn } from './types';
import StateCell from './cells/state-cell.svelte';
import TagsCell from './cells/tags-cell.svelte';
import BoolBadgeCell from './cells/bool-badge-cell.svelte';
import NullableTextCell from './cells/nullable-text-cell.svelte';
import RelativeDateCell from './cells/relative-date-cell.svelte';
import DateCell from '$lib/components/data-table/cells/date-cell.svelte';

export interface BoolBadgeCellProps {
  trueLabel?: string;
  falseLabel?: string;
  falseVariant?: 'muted' | 'destructive';
}

export function stateColumn<T>(overrides?: Partial<DataTableColumn<T>>): DataTableColumn<T> {
  return {
    key: 'state',
    title: 'State',
    sortable: true,
    cellComponent: StateCell,
    filter: {
      type: 'select',
      operators: ['eq', 'neq'],
      options: [
        { label: 'Normal', value: 'normal' },
        { label: 'Warn', value: 'warn' },
        { label: 'Critical', value: 'critical' },
      ],
    },
    ...overrides,
  };
}

export function tagsColumn<T>(overrides?: Partial<DataTableColumn<T>>): DataTableColumn<T> {
  return {
    key: 'tags',
    title: 'Tags',
    cellComponent: TagsCell,
    sortable: true,
    ...overrides,
  };
}

export function nullableTextColumn<T>(
  key: string,
  title: string,
  overrides?: Partial<DataTableColumn<T>>
): DataTableColumn<T> {
  return {
    key,
    title,
    cellComponent: NullableTextCell,
    ...overrides,
  };
}

export function relativeDateColumn<T>(
  key: string,
  title: string,
  overrides?: Partial<DataTableColumn<T>>
): DataTableColumn<T> {
  return {
    key,
    title,
    cellComponent: RelativeDateCell,
    sortable: true,
    ...overrides,
  };
}

export function dateColumn<T>(
  key: string,
  title: string,
  overrides?: Partial<DataTableColumn<T>>
): DataTableColumn<T> {
  return {
    key,
    title,
    cellComponent: DateCell,
    sortable: true,
    ...overrides,
  };
}

export function boolBadgeColumn<T>(
  key: string,
  title: string,
  cellProps?: BoolBadgeCellProps,
  overrides?: Partial<DataTableColumn<T>>
): DataTableColumn<T> {
  return {
    key,
    title,
    cellComponent: BoolBadgeCell,
    cellProps,
    sortable: true,
    ...overrides,
  };
}

export function textColumn<T>(
  key: string,
  title: string,
  placeholder?: string,
  overrides?: Partial<DataTableColumn<T>>
): DataTableColumn<T> {
  return {
    key,
    title,
    sortable: true,
    searchable: true,
    filter: {
      type: 'text',
      operators: ['ilike', 'eq'],
      placeholder: placeholder ?? `Search ${title}...`,
    },
    ...overrides,
  };
}
