<script lang="ts">
  import { LoaderCircle } from 'lucide-svelte';

  export let size: number = 48;
</script>

<div class="flex items-center justify-center w-full h-full">
  <LoaderCircle class="animate-spin text-muted-foreground" {size} />
</div>
