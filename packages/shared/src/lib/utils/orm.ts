import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
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
} from '@workspace/shared/types/database';
import { Database } from '@workspace/shared/types/schema';
import { SupabaseClient } from '@supabase/supabase-js';
import { PostgrestFilterBuilder } from '@supabase/postgrest-js';

type RowType<
  S extends Schemas,
  T extends TableOrView<S>,
> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Row']
  : T extends keyof Database['public']['Views']
    ? Database['public']['Views'][T]['Row']
    : never;

type QueryBuilder<S extends Schemas, T extends TableOrView<S>> = PostgrestFilterBuilder<
  any,
  Database['public'],
  RowType<S, T>,
  RowType<S, T>
>;

function toPostgrestColumn(key: string): string {
  const parts = key.split('.');
  if (parts.length <= 1) return key;
  const [col, ...jsonParts] = parts;
  if (jsonParts.length === 1) return `${col}->>${jsonParts[0]}`;
  const intermediate = jsonParts.slice(0, -1).join('->');
  return `${col}->${intermediate}->>${jsonParts.at(-1)}`;
}

export class ORM {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getCount<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<number>> {
    try {
      let query = this.supabase
        .schema(schema)
        .from(table as any)
        .select('*', { count: 'exact', head: true }); // head = no rows, just headers/meta

      if (modifyQuery) {
        modifyQuery(query as any);
      }

      const { count, error } = await query;

      if (error) throw new Error(error.message);

      return {
        data: count ?? 0,
        error: undefined,
      };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `count_${String(table)}`,
        message: String(err),
      });
    }
  }

  async select<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    modifyQuery?: (query: QueryBuilder<S, T>) => void,
    pagination?: PaginationOptions
  ): Promise<APIResponse<DataResponse<Tables<S, T>>>> {
    if (pagination) return this.selectPaginated(schema, table, pagination, modifyQuery);

    try {
      let query = this.supabase
        .schema(schema)
        .from(table as any)
        .select('*');

      if (modifyQuery) {
        modifyQuery(query as any);
      }

      let results = [];

      while (true) {
        const { data, error } = await query.range(results.length, results.length + 999);

        if (error) throw new Error(error.message);

        results.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }

      return {
        data: {
          rows: results as Tables<S, T>[],
          total: results.length,
        } as DataResponse<Tables<S, T>>,
      };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `select_${String(table)}`,
        message: String(err),
      });
    }
  }

  async selectPaginated<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    pagination: PaginationOptions,
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<DataResponse<Tables<S, T>>>> {
    try {
      const from = pagination.page * pagination.size;
      const to = from + pagination.size - 1;

      let query = this.supabase
        .schema(schema)
        .from(table as any)
        .select('*', { count: 'exact' }) // includes count in response
        .range(from, to);

      if (pagination.filters) {
        this.paginatedFilters(query as any, pagination.filters, pagination.filterMap);
      }

      if (pagination.globalFields && pagination.globalSearch) {
        const value = `%${pagination.globalSearch}%`;
        query = query.or(
          pagination.globalFields.map((col) => `${toPostgrestColumn(col)}.ilike.${value}`).join(',')
        );
      }

      if (pagination.sorting && Object.entries(pagination.sorting).length) {
        const [key, value] = Object.entries(pagination.sorting)[0];
        const keyMap = pagination.filterMap
          ? (pagination.filterMap[key] ?? toPostgrestColumn(key))
          : toPostgrestColumn(key);
        query = query.order(keyMap, { ascending: value === 'asc' });
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
        module: 'supabase',
        context: `paginated_${String(table)}`,
        message: String(err),
      });
    }
  }

  private paginatedFilters<S extends Schemas, T extends TableOrView<S>>(
    query: QueryBuilder<S, T>,
    filters: Filters,
    map?: Record<string, string>
  ): QueryBuilder<S, T> {
    for (let [key, { op, value }] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;

      const column = map ? (map[key] ?? toPostgrestColumn(key)) : toPostgrestColumn(key);

      switch (op) {
        case 'eq':
        case 'neq':
        case 'is':
        case 'not.neq':
        case 'not.eq':
        case 'not.is':
          query = query.filter(column as string, op, value);
          break;
        case 'like':
        case 'ilike':
        case 'not.like':
        case 'not.ilike':
          query = query.filter(column as string, op, `%${value}%`);
          break;

        case 'gte':
        case 'lte':
        case 'gt':
        case 'lt':
        case 'not.gte':
        case 'not.lte':
        case 'not.gt':
        case 'not.lt':
          // if (key.includes("_at")) {
          //   value = subDays(new Date(), value as number).toISOString();
          // }
          query = query.filter(column as string, op, value);
          break;

        case 'ov':
        case 'cd':
        case 'cs':
        case 'not.ov':
        case 'not.cd':
        case 'not.cs':
          if (!Array.isArray(value)) {
            value = `{"${value}"}`;
          } else {
            value = `{${value.join(',')}}`;
          }

          query = query.filter(column as string, op, value);
          break;

        case 'in':
        case 'not.in':
          if (!Array.isArray(value)) {
            value = `("${value}")`;
          } else {
            value = `(${value.join(',')})`;
          }

          query = query.filter(column as string, op, value);
          break;

        case 'bt':
          if (Array.isArray(value)) {
            query = query.gte(column as any, value[0]).lte(column as any, value[1]);
          }
          break;
        default:
          throw new Error(`Unsupported operator: ${op}`);
      }
    }

    return query;
  }

  async selectSingle<S extends Schemas, T extends TableOrView<S>>(
    schema: S,
    table: T,
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<Tables<S, T>>> {
    try {
      let query = this.supabase
        .schema(schema)
        .from(table as any)
        .select('*')
        .limit(1);

      if (modifyQuery) {
        modifyQuery(query as any);
      }

      const { data, error } = await query.single();
      if (error) throw new Error(error.message);

      return {
        data: data as Tables<S, T>,
      };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `select_${String(table)}`,
        message: String(err),
      });
    }
  }

  async insert<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    rows: TablesInsert<S, T>[],
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      let query = this.supabase.schema(schema).from(table as any);

      if (modifyQuery) {
        modifyQuery(query as any);
      }

      const { data, error } = await query.insert(rows as any).select();
      if (error) throw new Error(error.message);

      return {
        data: data as Tables<S, T>[],
      };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `insert_${String(table)}`,
        message: String(err),
      });
    }
  }

  async update<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    id: string,
    row: TablesUpdate<S, T>
  ): Promise<APIResponse<Tables<S, T>>> {
    try {
      const { data, error } = await this.supabase
        .schema(schema)
        .from(table as any)
        .update(row as any)
        .eq('id', id as any)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return {
        data: data as Tables<S, T>,
      };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `update_${String(table)}`,
        message: String(err),
      });
    }
  }

  async upsert<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    rows: (TablesUpdate<S, T> | TablesInsert<S, T>)[],
    conflict?: (keyof Tables<S, T>)[],
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      let query = this.supabase
        .schema(schema)
        .from(table as any)
        .upsert(rows as any, { onConflict: conflict?.join(',') ?? '' });

      if (modifyQuery) {
        modifyQuery(query as any);
      }

      const { data, error } = await query.select();
      if (error) throw new Error(error.message);

      return {
        data: data as Tables<S, T>[],
      };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `upsert_${String(table)}`,
        message: String(err),
      });
    }
  }

  async delete<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<null>> {
    try {
      let query = this.supabase
        .schema(schema)
        .from(table as any)
        .delete();

      if (modifyQuery) {
        modifyQuery(query as any);
      }

      const { error } = await query.select();
      if (error) throw new Error(error.message);

      return {
        data: null,
      };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `delete_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchInsert<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    rows: TablesInsert<S, T>[],
    batchSize = 100,
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const allResults: Tables<S, T>[] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        let query = this.supabase.schema(schema).from(table as any);

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
        module: 'supabase',
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
    modifyQuery?: (query: QueryBuilder<S, T>) => void
  ): Promise<APIResponse<Tables<S, T>[]>> {
    try {
      const allResults: Tables<S, T>[] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        const chunk = rows.slice(i, i + batchSize);
        let query = this.supabase
          .schema(schema)
          .from(table as any)
          .upsert(chunk as any, { onConflict: conflict?.join(',') ?? '' });

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
        module: 'supabase',
        context: `batchUpsert_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchUpdate<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    ids: string[],
    row: TablesUpdate<S, T>,
    batchSize = 100
  ): Promise<APIResponse<null>> {
    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const { error } = await this.supabase
          .schema(schema)
          .from(table as any)
          .update(row as any)
          .in('id', chunk as any);
        if (error) throw new Error(error.message);
      }

      return { data: null };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `batchUpdate_${String(table)}`,
        message: String(err),
      });
    }
  }

  async batchDelete<S extends Schemas, T extends Table<S>>(
    schema: S,
    table: T,
    ids: string[],
    batchSize = 100
  ): Promise<APIResponse<null>> {
    try {
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        const { error } = await this.supabase
          .schema(schema)
          .from(table as any)
          .delete()
          .in('id', chunk as any);
        if (error) throw new Error(error.message);
      }

      return { data: null };
    } catch (err) {
      return Logger.error({
        module: 'supabase',
        context: `batchDelete_${String(table)}`,
        message: String(err),
      });
    }
  }
}
