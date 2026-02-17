<script lang="ts">
  import { AlertTable } from '$lib/components/alerts';
  const { data } = $props();
</script>

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Alerts</h1>
  <AlertTable integrationId="dattormm" {data} />
</div>
