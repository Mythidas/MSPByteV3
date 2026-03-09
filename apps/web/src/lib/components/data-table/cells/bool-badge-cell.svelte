<script lang="ts">
  import Badge from '$lib/components/ui/badge/badge.svelte';

  let {
    value,
    trueLabel = 'Yes',
    falseLabel = 'No',
    falseVariant = 'muted',
  }: {
    value: boolean | null;
    trueLabel?: string;
    falseLabel?: string;
    falseVariant?: 'muted' | 'destructive';
  } = $props();

  const falseClass =
    falseVariant === 'destructive'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : 'bg-muted/15 text-muted-foreground border-muted/30';
</script>

{#if value === null || value === undefined}
  <span class="text-muted-foreground">—</span>
{:else}
  <Badge
    variant="outline"
    class={value ? 'bg-green-500/15 text-green-500 border-green-500/30' : falseClass}
  >
    {value ? trueLabel : falseLabel}
  </Badge>
{/if}
