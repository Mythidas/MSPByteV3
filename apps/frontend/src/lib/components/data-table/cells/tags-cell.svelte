<script lang="ts">
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { formatStringProper } from '$lib/utils/format.js';

  let { value }: { value: string[] | null } = $props();
</script>

{#if Array.isArray(value) && value.length > 0}
  {#each value as tag}
    <Badge variant="outline" class="mr-1">{formatStringProper(tag)}</Badge>
  {/each}
{:else}
  <span class="text-muted-foreground">—</span>
{/if}
