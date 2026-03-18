import { SupabaseClient } from "@supabase/supabase-js";
import { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import { APIResponse, Logger } from "@workspace/core/lib/utils/logger";
import {
  Schemas,
  TableOrView,
  PaginationOptions,
  DataResponse,
  Filters,
  Table,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@workspace/core/types/database";
import { Database } from "@workspace/core/types/schema";

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
  any,
  Database["public"],
  RowType<S, T>,
  RowType<S, T>
>;

function toPostgrestColumn(key: string): string {
  const parts = key.split(".");
  if (parts.length <= 1) return key;
  const [col, ...jsonParts] = parts;
  if (jsonParts.length === 1) return `${col}->>${jsonParts[0]}`;
  const intermediate = jsonParts.slice(0, -1).join("->");
  return `${col}->${intermediate}->>${jsonParts.at(-1)}`;
}

export class SupabaseHelper {
  constructor(private supabase: SupabaseClient<Database>) {}

  async selectAll<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
    select?: (keyof Tables<S, T>)[],
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      let query = this.supabase
        .schema(schema)
        .from(table as Extract<T, string>)
        .select(select?.join(",") ?? "*", { count: "exact" });

      if (modifyQuery) {
        modifyQuery(query as any);
      }

      const allRows: Tables<S, T>[] = [];
      while (true) {
        const { data, count, error } = await query.range(
          allRows.length,
          allRows.length + 1000,
        );

        if (error) throw new Error(error.message);

        allRows.push(...(data as any[]));
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
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
    select?: (keyof Tables<S, T>)[],
  ): Promise<APIResponse<DataResponse<Tables<S, T>>>> {
    try {
      const from = pagination.page * pagination.size;
      const to = from + pagination.size - 1;

      let query = this.supabase
        .schema(schema)
        .from(table as Extract<T, string>)
        .select(select?.join(",") ?? "*", { count: "exact" }) // includes count in response
        .range(from, to);

      if (pagination.filters) {
        this.paginatedFilters(
          query as any,
          pagination.filters,
          pagination.filterMap,
        );
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
        modifyQuery(query as any);
      }

      const { data, count, error } = await query;

      if (error) throw new Error(error.message);

      return {
        data: {
          rows: (data as Tables<S, T>[]) ?? [],
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

  private paginatedFilters<S extends Schemas, T extends TableOrView<S>>(
    query: QueryBuilder<S, T>,
    filters: Filters,
    map?: Record<string, string>,
  ): QueryBuilder<S, T> {
    for (const [key, filterOrFilters] of Object.entries(filters)) {
      const filterValues = Array.isArray(filterOrFilters)
        ? filterOrFilters
        : [filterOrFilters];
      for (let { op, value } of filterValues) {
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
            query = query.filter(column as string, op, value);
            break;
          case "like":
          case "ilike":
          case "not.like":
          case "not.ilike":
            query = query.filter(column as string, op, `%${value}%`);
            break;

          case "gte":
          case "lte":
          case "gt":
          case "lt":
          case "not.gte":
          case "not.lte":
          case "not.gt":
          case "not.lt":
            query = query.filter(column as string, op, value);
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
                value = `{"${value}"}`;
              }
            } else {
              value = `{${value.join(",")}}`;
            }

            query = query.filter(column as string, op, value);
            break;

          case "in":
          case "not.in":
            if (!Array.isArray(value)) {
              value = `("${value}")`;
            } else {
              value = `(${value.join(",")})`;
            }

            query = query.filter(column as string, op, value);
            break;

          case "bt":
            if (Array.isArray(value)) {
              query = query
                .gte(column as any, value[0])
                .lte(column as any, value[1]);
            }
            break;
          default:
            throw new Error(`Unsupported operator: ${op}`);
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
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const allResults: Tables<S, T>[] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        let query = this.supabase
          .schema(schema)
          .from(table as Extract<T, string>);

        if (modifyQuery) {
          modifyQuery(query as any);
        }

        const { data, error } = await query.insert(chunk as any).select();
        if (error) throw new Error(error.message);
        if (data) allResults.push(...(data as Tables<S, T>[]));
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
    conflict?: (keyof Tables<S, T>)[],
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const allResults: Tables<S, T>[] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        let query = this.supabase
          .schema(schema)
          .from(table as Extract<T, string>)
          .upsert(chunk as any, { onConflict: conflict?.join(",") ?? "" });

        if (modifyQuery) {
          modifyQuery(query as any);
        }

        const { data, error } = await query.select();
        if (error) throw new Error(error.message);
        if (data) allResults.push(...(data as Tables<S, T>[]));
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
        let query = this.supabase
          .schema(schema)
          .from(table as Extract<T, string>)
          .select("*")
          .in(String(idColumn), chunk as any[]);
        if (modifyQuery) modifyQuery(query as any);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        if (data) allResults.push(...(data as Tables<S, T>[]));
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
          .from(table as Extract<T, string>)
          .update(row as any)
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
        let query = this.supabase
          .schema(schema)
          .from(table as Extract<T, string>)
          .update(row as any)
          .in(String(whereColumn), chunk as any);
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
        let query = this.supabase
          .schema(schema)
          .from(table as Extract<T, string>)
          .delete()
          .in("id", chunk as any);
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
