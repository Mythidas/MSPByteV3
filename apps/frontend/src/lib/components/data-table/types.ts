import type {
  Schemas,
  TableOrView,
  Tables,
  FilterOperations,
} from '@workspace/shared/types/database';
import type { Component, Snippet } from 'svelte';

export type FilterOperator = FilterOperations;

export interface TableFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: any;
}

export interface FilterConfig {
  label?: string;
  type: 'text' | 'select' | 'date' | 'number' | 'boolean';
  operators: FilterOperator[];
  defaultOperator?: FilterOperator;
  options?: { label: string; value: any }[];
  placeholder?: string;
  multiple?: boolean;
}

export interface DataTableColumn<TData> {
  key: string;
  title: string;
  cell?: Snippet<[{ row: TData; value: any }]>;
  exportValue?: (context: { row: TData; value: any }) => string | number | boolean | null;
  sortable?: boolean;
  searchable?: boolean;
  hideable?: boolean;
  width?: string;
  filter?: FilterConfig;
}

export interface TableView {
  id: string;
  label: string;
  description?: string;
  icon?: Component;
  filters: Omit<TableFilter, 'id'>[];
  isDefault?: boolean;
}

export interface RowAction<TData> {
  label: string;
  icon?: Snippet;
  onclick: (rows: TData[], fetchData: () => Promise<void>) => void | Promise<void>;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  disabled?: (rows: TData[]) => boolean;
}

export interface DataTableProps<S extends Schemas, T extends TableOrView<S>> {
  schema: S;
  table: T;
  columns: DataTableColumn<Tables<S, T>>[];
  modifyQuery?: (query: any) => void;

  // Features
  enableRowSelection?: boolean;
  enableGlobalSearch?: boolean;
  enableFilters?: boolean;
  enablePagination?: boolean;
  enableColumnToggle?: boolean;
  enableExport?: boolean;
  enableURLState?: boolean;

  // Config
  views?: TableView[];
  rowActions?: RowAction<Tables<S, T>>[];
  globalSearchFields?: string[];
  filterMap?: Record<string, string>;
  defaultPageSize?: number;

  // Events
  onrowclick?: (row: Tables<S, T>) => void;
  onselectionchange?: (rows: Tables<S, T>[]) => void;
}

export interface DataTableState {
  page: number;
  pageSize: number;
  globalSearch: string;
  filters: TableFilter[];
  activeViewId?: string;
  sorting: Record<string, 'asc' | 'desc'>;
  selectedRows: Set<string>;
  visibleColumns: Set<string>;
}
