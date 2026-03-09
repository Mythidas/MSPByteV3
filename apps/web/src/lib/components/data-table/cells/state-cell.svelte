<script lang="ts">
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { stateClass } from '$lib/utils/state.js';
  import { formatStringProper } from '$lib/utils/format.js';

  let { value }: { value: string | null } = $props();
</script>

<Badge variant="outline" class={stateClass(value)}>
  {value ? formatStringProper(value) : '—'}
</Badge>
