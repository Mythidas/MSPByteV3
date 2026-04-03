import type {
  Schemas,
  TableOrView,
  Tables,
  FilterOperations,
} from '@workspace/shared/types/database';
import type { AnyQueryBuilder } from '@workspace/shared/lib/utils/supabase-helper';
import type { Component, Snippet } from 'svelte';

export type FilterOperator = FilterOperations;

export interface TableFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

export type FilterConfig = {
  label?: string;
  type: 'text' | 'select' | 'date' | 'number' | 'boolean';
  operators: FilterOperator[];
  defaultOperator?: FilterOperator;
  options?: { label: string; value: unknown }[];
  placeholder?: string;
  multiple?: boolean;
};

export type DataTableColumn<TData> = {
  key: string;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cell?: Snippet<[{ row: TData; value: any }]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cellComponent?: Component<{ value: any; row?: TData; [key: string]: any }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cellProps?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exportValue?: (context: { row: TData; value: any }) => string | number | boolean | null;
  sortable?: boolean;
  searchable?: boolean;
  hideable?: boolean;
  hidden?: boolean;
  defaultHidden?: boolean;
  width?: string;
  filter?: FilterConfig;
};

export interface TableView {
  id: string;
  label: string;
  description?: string;
  icon?: Component;
  filters: Omit<TableFilter, 'id'>[];
  sort?: { field: string; dir: 'asc' | 'desc' };
  isDefault?: boolean;
  modifyQuery?: (query: AnyQueryBuilder) => void;
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
  modifyQuery?: (query: AnyQueryBuilder) => void;

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
  defaultSort?: { field: string; dir: 'asc' | 'desc' };

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
