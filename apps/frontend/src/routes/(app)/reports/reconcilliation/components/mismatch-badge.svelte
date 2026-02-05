<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { Mismatch } from "../types";

  let { mismatch }: { mismatch: Mismatch } = $props();

  let isOver = $derived(mismatch.difference > 0);
  let displayText = $derived(
    `${isOver ? "+" : ""}${mismatch.difference} ${mismatch.label}`
  );
</script>

{#if isOver}
  <Badge class="bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/20">
    {displayText}
  </Badge>
{:else}
  <Badge class="bg-yellow-500/15 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/20">
    {displayText}
  </Badge>
{/if}
