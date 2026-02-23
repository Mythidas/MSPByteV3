<script lang="ts">
  import { page } from '$app/state';
  import { AlertTable } from '$lib/components/alerts';
  import { getConnectionIdForScope } from '$lib/utils/scope-filter.js';

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterConnectionId = $derived(getConnectionIdForScope(scope, scopeId));
</script>

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Alerts</h1>
  <AlertTable integrationId="microsoft-365" connectionId={filterConnectionId || undefined} {data} />
</div>
