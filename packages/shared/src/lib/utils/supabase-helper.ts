import { Logger } from "@workspace/shared/lib/utils/logger";
import type { APIResponse } from "@workspace/shared/lib/utils/logger";
import type {
  Schemas,
  TableOrView,
  PaginationOptions,
  DataResponse,
  Filters,
  Table,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@workspace/shared/types/database";
import type { Database } from "@workspace/shared/types/schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import { isString } from "@workspace/shared/lib/utils/validators";

// Generic query builder type for dynamic/multi-schema queries where table type is not statically known.
// Use only at integration boundaries — prefer typed queries when the schema is known.
export type AnyQueryBuilder = PostgrestFilterBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;

type RowType<
  S extends Schemas,
  T extends TableOrView<S>,
> = T extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][T]["Row"]
  : T extends keyof Database["public"]["Views"]
    ? Database["public"]["Views"][T]["Row"]
    : never;

type QueryBuilder<
  S extends Schemas,
  T extends TableOrView<S>,
> = PostgrestFilterBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  Database["public"],
  RowType<S, T>,
  RowType<S, T>
>;

export function toPostgrestColumn(key: string): string {
  const parts = key.split(".");
  if (parts.length <= 1) return key;
  const [col, ...jsonParts] = parts;
  if (jsonParts.length === 1) return `${col}->>${jsonParts[0]}`;
  const intermediate = jsonParts.slice(0, -1).join("->");
  return `${col}->${intermediate}->>${jsonParts.at(-1)}`;
}

export function toPostgrestJsonColumn(key: string): string {
  const parts = key.split(".");
  if (parts.length <= 1) return key;
  return parts.join("->");
}

export class SupabaseHelper {
  constructor(private supabase: SupabaseClient<Database>) {}

  async selectAll<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    modifyQuery?: (query: AnyQueryBuilder) => void,
    select?: (keyof Tables<S, T>)[],
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const query = this.supabase
        .schema(schema)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        .from(table as Extract<T, string>)
        .select(select?.join(",") ?? "*", { count: "exact" });

      if (modifyQuery) {
        modifyQuery(query);
      }

      const allRows: Tables<S, T>[] = [];
      while (true) {
        const { data, count, error } = await query.range(
          allRows.length,
          allRows.length + 1000,
        );

        if (error) throw new Error(error.message);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        if (data) allRows.push(...(data as unknown as Tables<S, T>[]));
        if (allRows.length >= (count ?? 0)) break;
      }

      return {
        data: allRows,
      };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `paginated_${String(table)}`,
        message: String(err),
      });
    }
  }

  async selectPaginated<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    pagination: PaginationOptions,
    modifyQuery?: (query: AnyQueryBuilder) => void,
    select?: (keyof Tables<S, T>)[],
  ): Promise<APIResponse<DataResponse<Tables<S, T>>>> {
    try {
      const from = pagination.page * pagination.size;
      const to = from + pagination.size - 1;

      let query = this.supabase
        .schema(schema)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        .from(table as Extract<T, string>)
        .select(select?.join(",") ?? "*", { count: "exact" }) // includes count in response
        .range(from, to);

      if (pagination.filters) {
        this.paginatedFilters(query, pagination.filters, pagination.filterMap);
      }

      if (pagination.globalFields && pagination.globalSearch) {
        const value = `%${pagination.globalSearch}%`;
        query = query.or(
          pagination.globalFields
            .map((col) => `${toPostgrestColumn(col)}.ilike.${value}`)
            .join(","),
        );
      }

      if (pagination.sorting && Object.entries(pagination.sorting).length) {
        const [key, value] = Object.entries(pagination.sorting)[0];
        const keyMap = pagination.filterMap
          ? (pagination.filterMap[key] ?? toPostgrestColumn(key))
          : toPostgrestColumn(key);
        query = query.order(keyMap, { ascending: value === "asc" });
      }

      if (modifyQuery) {
        modifyQuery(query);
      }

      const { data, count, error } = await query;

      if (error) throw new Error(error.message);

      return {
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          rows: (data as unknown as Tables<S, T>[]) ?? [],
          total: count ?? 0,
        },
      };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `paginated_${String(table)}`,
        message: String(err),
      });
    }
  }

  private paginatedFilters(
    query: AnyQueryBuilder,
    filters: Filters,
    map?: Record<string, string>,
  ): AnyQueryBuilder {
    for (const [key, filterOrFilters] of Object.entries(filters)) {
      const filterValues = Array.isArray(filterOrFilters)
        ? filterOrFilters
        : [filterOrFilters];
      for (const filterEntry of filterValues) {
        const { op } = filterEntry;
        let value = filterEntry.value;
        if (value === undefined || value === null || value === "") continue;

        const column = map
          ? (map[key] ?? toPostgrestColumn(key))
          : toPostgrestColumn(key);

        switch (op) {
          case "eq":
          case "neq":
          case "is":
          case "not.neq":
          case "not.eq":
          case "not.is":
            query = query.filter(column, op, value);
            break;
          case "like":
          case "ilike":
          case "not.like":
          case "not.ilike":
            query = query.filter(column, op, `%${String(value)}%`);
            break;

          case "gte":
          case "lte":
          case "gt":
          case "lt":
          case "not.gte":
          case "not.lte":
          case "not.gt":
          case "not.lt":
            query = query.filter(column, op, value);
            break;

          case "ov":
          case "cd":
          case "cs":
          case "not.ov":
          case "not.cd":
          case "not.cs":
            if (!Array.isArray(value)) {
              // Pass through if already formatted as JSON (for JSONB @> containment)
              if (
                typeof value !== "string" ||
                (!value.startsWith("[") && !value.startsWith("{"))
              ) {
                value = `{"${String(value)}"}`;
              }
            } else {
              value = `{${(value as unknown[]).join(",")}}`;
            }

            query = query.filter(column, op, value);
            break;

          case "in":
          case "not.in":
            if (!Array.isArray(value)) {
              value = `("${String(value)}")`;
            } else {
              value = `(${(value as unknown[]).join(",")})`;
            }

            query = query.filter(column, op, value);
            break;

          case "bt":
            if (Array.isArray(value)) {
              query = query.gte(column, value[0]).lte(column, value[1]);
            }
            break;
          default:
            throw new Error("Unsupported operator");
        }
      }
    }

    return query;
  }

  async batchInsert<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    rows: TablesInsert<S, T>[],
    batchSize = 100,
    modifyQuery?: (query: AnyQueryBuilder) => void,
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const allResults: Tables<S, T>[] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const query = this.supabase
          .schema(schema)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          .from(table as Extract<T, string>);

        if (modifyQuery) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          modifyQuery(query as unknown as AnyQueryBuilder);
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
        const { data, error } = await query.insert(chunk as any).select();
        if (error) throw new Error(error.message);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        if (data) allResults.push(...(data as unknown as Tables<S, T>[]));
      }

      return { data: allResults };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `batchInsert_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchUpsert<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    rows: (TablesUpdate<S, T> | TablesInsert<S, T>)[],
    batchSize = 100,
    conflict?: (keyof Tables<S, T>)[] | string,
    modifyQuery?: (query: AnyQueryBuilder) => void,
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const allResults: Tables<S, T>[] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        const query = this.supabase
          .schema(schema)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          .from(table as Extract<T, string>)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          .upsert(chunk as any, {
            onConflict: isString(conflict)
              ? conflict
              : Array.isArray(conflict)
                ? (conflict?.join(",") ?? undefined)
                : undefined,
          });

        if (modifyQuery) {
          modifyQuery(query);
        }

        const { data, error } = await query.select();
        if (error) throw new Error(error.message);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        if (data) allResults.push(...(data as unknown as Tables<S, T>[]));
      }

      return { data: allResults };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `batchUpsert_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchSelect<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    ids: string[],
    idColumn: keyof Tables<S, T>,
    batchSize = 500,
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const allResults: Tables<S, T>[] = [];
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const query = this.supabase
          .schema(schema)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          .from(table as Extract<T, string>)
          .select("*")
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          .in(String(idColumn), chunk as any[]);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
        if (modifyQuery) modifyQuery(query as any);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        if (data) allResults.push(...(data as unknown as Tables<S, T>[]));
      }
      return { data: allResults };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `batchSelect_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchUpdate<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    ids: string[],
    row: TablesUpdate<S, T>,
    batchSize = 100,
  ): Promise<APIResponse<null>> {
    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const { error } = await this.supabase
          .schema(schema)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          .from(table as Extract<T, string>)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          .update(row as any)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          .in("id", chunk as any);
        if (error) throw new Error(error.message);
      }

      return { data: null };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `batchUpdate_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchUpdateWhere<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    values: string[],
    whereColumn: keyof Tables<S, T>,
    row: TablesUpdate<S, T>,
    batchSize = 500,
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
  ): Promise<APIResponse<null>> {
    try {
      for (let i = 0; i < values.length; i += batchSize) {
        const chunk = values.slice(i, i + batchSize);
        const query = this.supabase
          .schema(schema)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          .from(table as Extract<T, string>)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          .update(row as any)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          .in(String(whereColumn), chunk as any);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
        if (modifyQuery) modifyQuery(query as any);
        const { error } = await query;
        if (error) throw new Error(error.message);
      }
      return { data: null };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `batchUpdateWhere_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchDelete<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    ids: string[],
    batchSize = 100,
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
  ): Promise<APIResponse<null>> {
    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const query = this.supabase
          .schema(schema)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          .from(table as Extract<T, string>)
          .delete()
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
          .in("id", chunk as any);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
        if (modifyQuery) modifyQuery(query as any);
        const { error } = await query;
        if (error) throw new Error(error.message);
      }

      return { data: null };
    } catch (err) {
      return Logger.error({
        module: "supabase",
        context: `batchDelete_${String(table)}`,
        message: String(err),
      });
    }
  }
}
