<script lang="ts">
  import { onMount } from 'svelte';
  import SingleSelect from '$lib/components/single-select.svelte';
  import { supabase } from '$lib/utils/supabase';
  import type { FieldReference } from '@workspace/core/types/contracts/schema-registry';

  let {
    ref,
    selected,
    onchange,
    class: className = '',
  }: {
    ref: FieldReference;
    selected: string;
    onchange: (v: string) => void;
    class?: string;
  } = $props();

  let options = $state<{ value: string; label: string }[]>([]);
  let loading = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  async function fetchRows(
    query?: string,
    exactValue?: string,
  ): Promise<{ value: string; label: string }[]> {
    const parts = ref.table.includes('.') ? ref.table.split('.') : ['public', ref.table];
    const [schema, tableName] = parts;
    const db = supabase as any;
    const q = schema === 'public' ? db.from(tableName) : db.schema(schema).from(tableName);
    let dbQuery = q.select(`${ref.valueColumn},${ref.labelColumn}`);
    if (exactValue !== undefined) {
      dbQuery = dbQuery.eq(ref.valueColumn, exactValue).limit(1);
    } else {
      if (query?.trim()) dbQuery = dbQuery.ilike(ref.labelColumn, `%${query.trim()}%`);
      dbQuery = dbQuery.limit(30);
    }
    const { data } = await dbQuery;
    if (!data) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      value: String(row[ref.valueColumn] ?? ''),
      label: String(row[ref.labelColumn] ?? row[ref.valueColumn] ?? ''),
    }));
  }

  function mergeOptions(
    special: { value: string; label: string }[],
    rows: { value: string; label: string }[],
    priority: { value: string; label: string }[],
  ): { value: string; label: string }[] {
    const seen = new Set<string>();
    const result: { value: string; label: string }[] = [];
    for (const item of [...special, ...priority, ...rows]) {
      if (!seen.has(item.value)) {
        seen.add(item.value);
        result.push(item);
      }
    }
    return result;
  }

  onMount(async () => {
    loading = true;
    const [initialRows, selectedRows] = await Promise.all([
      fetchRows(),
      selected ? fetchRows(undefined, selected) : Promise.resolve([]),
    ]);
    options = mergeOptions(ref.specialValues ?? [], initialRows, selectedRows);
    loading = false;
  });

  function handleSearch(query: string) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      loading = true;
      const rows = await fetchRows(query);
      const currentItem = options.find((o) => o.value === selected);
      options = mergeOptions(ref.specialValues ?? [], rows, currentItem ? [currentItem] : []);
      loading = false;
    }, 300);
  }
</script>

<SingleSelect
  {options}
  {selected}
  {loading}
  onsearch={handleSearch}
  {onchange}
  placeholder="Select..."
  class={className}
/>
