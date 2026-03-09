<script lang="ts">
  import { formatRelativeDate } from '$lib/utils/format.js';

  let { value }: { value: string | number | null } = $props();

  const formatted = $derived.by(() => {
    if (!value) return '—';
    const iso = typeof value === 'number' ? new Date(value).toISOString() : value;
    return formatRelativeDate(iso);
  });
</script>

{formatted}
