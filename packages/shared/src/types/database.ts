import { Operations } from "@workspace/shared/types/index";
import { Database } from "@workspace/shared/types/schema";

// types.ts
export type Schemas = keyof Omit<Database, "__InternalSupabase">;
export type Table<S extends Schemas> = keyof Database[S]["Tables"];
export type TableOrView<S extends Schemas> =
  | keyof Database[S]["Tables"]
  | keyof Database[S]["Views"];
export type Tables<
  S extends Schemas,
  T extends TableOrView<S>,
> = T extends keyof Database[S]["Tables"]
  ? Database[S]["Tables"][T] extends { Row: infer R }
    ? R
    : never
  : T extends keyof Database[S]["Views"]
    ? Database[S]["Views"][T] extends { Row: infer R }
      ? R
      : never
    : never;

export type RowFilter<
  S extends Schemas,
  T extends TableOrView<S>,
> = T extends keyof Database[S]["Tables"]
  ? Database[S]["Tables"][T] extends { Row: infer R }
    ? [column: keyof R, operator: Operations, value: any] | undefined
    : undefined
  : T extends keyof Database[S]["Views"]
    ? Database[S]["Views"][T] extends { Row: infer R }
      ? [column: keyof R, operator: Operations, value: any] | undefined
      : undefined
    : undefined;
export type RowSort<
  S extends Schemas,
  T extends TableOrView<S>,
> = T extends keyof Database[S]["Tables"]
  ? Database[S]["Tables"][T] extends { Row: infer R }
    ? [column: keyof R, order: "asc" | "desc"] | undefined
    : undefined
  : T extends keyof Database[S]["Views"]
    ? Database[S]["Views"][T] extends { Row: infer R }
      ? [column: keyof R, order: "asc" | "desc"] | undefined
      : undefined
    : undefined;

export type TablesInsert<
  S extends Schemas,
  T extends Table<S>,
> = T extends keyof Database[S]["Tables"]
  ? Database[S]["Tables"][T] extends { Insert: infer R }
    ? R
    : never
  : never;
export type TablesUpdate<
  S extends Schemas,
  T extends Table<S>,
> = T extends keyof Database[S]["Tables"]
  ? Database[S]["Tables"][T] extends { Update: infer R }
    ? R
    : never
  : never;

export type FilterOperations = Operations | "bt";
export type FilterType =
  | "text"
  | "select"
  | "boolean"
  | "date"
  | "number"
  | "multiselect";

export type FilterPrimitive = string | number | boolean | string[] | undefined;
export type FilterPrimitiveTuple = [FilterPrimitive, FilterPrimitive];
export type FilterValue =
  | { op: Exclude<FilterOperations, "bt">; value: FilterPrimitive | undefined }
  | { op: "bt"; value: FilterPrimitiveTuple };
export type Filters = Record<string, FilterValue | FilterValue[]>;

export type DataResponse<T> = {
  rows: T[];
  total: number;
};

export type PaginationOptions = {
  page: number;
  size: number;
  filters?: Filters;
  globalFields?: string[];
  globalSearch?: string;
  filterMap?: Record<string, string>;
  sorting?: Record<string, "asc" | "desc">;
};

export type GetRowConfig<S extends Schemas, T extends TableOrView<S>> = {
  filters?: Array<RowFilter<S, T> | undefined>;
  ors?: Array<[RowFilter<S, T>, RowFilter<S, T>] | undefined>;
  sorting?: Array<RowSort<S, T> | undefined>;
  pagination?: PaginationOptions;
};

export type GetRowCountConfig<S extends Schemas, T extends TableOrView<S>> = {
  filters?: Array<RowFilter<S, T> | undefined>;
  ors?: Array<[RowFilter<S, T>, RowFilter<S, T>] | undefined>;
};

export type InsertRowConfig<S extends Schemas, T extends Table<S>> = {
  rows: TablesInsert<S, T>[];
};

export type UpdateRowConfig<S extends Schemas, T extends Table<S>> = {
  id: string;
  row: TablesUpdate<S, T>;
};

export type UpsertRowConfig<S extends Schemas, T extends Table<S>> = {
  rows: (TablesUpdate<S, T> | TablesInsert<S, T>)[];
  filters?: Array<RowFilter<S, T> | undefined>;
  ors?: Array<[RowFilter<S, T>, RowFilter<S, T>] | undefined>;
};

export type DeleteRowConfig<S extends Schemas, T extends Table<S>> = {
  filters: Array<RowFilter<S, T> | undefined>;
  ors?: Array<[RowFilter<S, T>, RowFilter<S, T>] | undefined>;
};
