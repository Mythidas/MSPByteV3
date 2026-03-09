<script lang="ts">
  let { value }: { value: string | null } = $props();
</script>

{#if value}
  {value}
{:else}
  <span class="text-muted-foreground">—</span>
{/if}
