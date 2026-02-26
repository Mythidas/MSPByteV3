// Main component
export { default as DataTable } from './data-table.svelte';

// Types
export type {
  FilterOperator,
  TableFilter,
  FilterConfig,
  DataTableColumn,
  TableView,
  RowAction,
  DataTableProps,
  DataTableState,
} from './types';

// Sub-components (for custom toolbars)
export { default as DataTableToolbar } from './data-table-toolbar.svelte';
export { default as DataTablePagination } from './data-table-pagination.svelte';
export { default as DataTableFilterBuilder } from './data-table-filter-builder.svelte';
export { default as DataTableFilterChips } from './data-table-filter-chips.svelte';
export { default as DataTableViewSelector } from './data-table-view-selector.svelte';
export { default as DataTableColumnToggle } from './data-table-column-toggle.svelte';

// Filter inputs
export {
  TextFilterInput,
  SelectFilterInput,
  NumberFilterInput,
  BooleanFilterInput,
  DateFilterInput,
} from './filter-inputs';

// Column factories
export {
  stateColumn,
  tagsColumn,
  nullableTextColumn,
  relativeDateColumn,
  boolBadgeColumn,
  displayNameColumn,
} from './column-defs';
export type { BoolBadgeCellProps } from './column-defs';

// Utils
export { getNestedValue, setNestedValue } from './utils/nested';
export {
  serializeFilters,
  deserializeFilters,
  getOperatorLabel,
  formatFilterValue,
  generateFilterId,
} from './utils/filters';
export { OPERATOR_MAP, getDefaultOperator, OPERATOR_LABELS } from './utils/operators';
export { exportData } from './utils/export';
