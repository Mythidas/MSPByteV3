<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import SingleSelect from '$lib/components/single-select.svelte';
  import { toast } from 'svelte-sonner';
  import type { ExternalResource } from './+page.server.js';

  let {
    open = $bindable(false),
    dattoResources,
    coveResources,
    sophosResources,
    haloResources,
    onsuccess,
  }: {
    open: boolean;
    dattoResources: Promise<ExternalResource[]>;
    coveResources: Promise<ExternalResource[]>;
    sophosResources: Promise<ExternalResource[]>;
    haloResources: Promise<ExternalResource[]>;
    onsuccess?: () => void;
  } = $props();

  let name = $state('');
  let loading = $state(false);

  let dattoOptions = $state<ExternalResource[]>([]);
  let coveOptions = $state<ExternalResource[]>([]);
  let sophosOptions = $state<ExternalResource[]>([]);
  let haloOptions = $state<ExternalResource[]>([]);

  let dattoLoading = $state(true);
  let coveLoading = $state(true);
  let sophosLoading = $state(true);
  let haloLoading = $state(true);

  let dattoSelected = $state<string | undefined>(undefined);
  let coveSelected = $state<string | undefined>(undefined);
  let sophosSelected = $state<string | undefined>(undefined);
  let haloSelected = $state<string | undefined>(undefined);

  $effect(() => {
    if (open) {
      name = '';
      dattoSelected = undefined;
      coveSelected = undefined;
      sophosSelected = undefined;
      haloSelected = undefined;
    }
  });

  $effect(() => {
    dattoResources.then((r) => {
      dattoOptions = r;
      dattoLoading = false;
    });
  });

  $effect(() => {
    coveResources.then((r) => {
      coveOptions = r;
      coveLoading = false;
    });
  });

  $effect(() => {
    sophosResources.then((r) => {
      sophosOptions = r;
      sophosLoading = false;
    });
  });

  $effect(() => {
    haloResources.then((r) => {
      haloOptions = r;
      haloLoading = false;
    });
  });

  const hasIntegrations = $derived(
    dattoLoading ||
      dattoOptions.length > 0 ||
      coveLoading ||
      coveOptions.length > 0 ||
      sophosLoading ||
      sophosOptions.length > 0 ||
      haloLoading ||
      haloOptions.length > 0,
  );

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Site name is required');
      return;
    }

    loading = true;

    const formData = new FormData();
    formData.set('name', name.trim());

    const selections: [string, string | undefined, ExternalResource[]][] = [
      ['dattormm', dattoSelected, dattoOptions],
      ['cove', coveSelected, coveOptions],
      ['sophos-partner', sophosSelected, sophosOptions],
      ['halopsa', haloSelected, haloOptions],
    ];

    for (const [integrationId, selectedId, options] of selections) {
      if (!selectedId) continue;
      const resource = options.find((o) => o.id === selectedId);
      formData.set(`${integrationId}_external_id`, selectedId);
      formData.set(`${integrationId}_external_name`, resource?.name ?? selectedId);
    }

    const res = await fetch('?/createSite', { method: 'POST', body: formData });

    if (res.ok) {
      toast.success('Site created');
      open = false;
      onsuccess?.();
    } else {
      const body = await res.json().catch(() => null);
      toast.error(body?.data?.message ?? 'Failed to create site');
    }

    loading = false;
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-md flex flex-col overflow-y-hidden max-h-screen">
    <Sheet.Header>
      <Sheet.Title>Create Site</Sheet.Title>
      <Sheet.Description>Add a new site and optionally link it to your integrations.</Sheet.Description>
    </Sheet.Header>

    <div class="flex flex-col gap-4 px-4 py-4 flex-1 overflow-y-auto">
      <div class="flex flex-col gap-2">
        <Label for="site-name">Site Name</Label>
        <Input id="site-name" bind:value={name} placeholder="Acme Corp" />
      </div>

      {#if hasIntegrations}
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">Integration Mappings</span>
          <span class="text-muted-foreground text-xs"
            >Optionally link this site to external resources.</span
          >
        </div>

        {#if dattoLoading || dattoOptions.length > 0}
          <div class="flex flex-col gap-2">
            <Label>DattoRMM</Label>
            <SingleSelect
              options={dattoOptions.map((o) => ({ value: o.id, label: o.name }))}
              bind:selected={dattoSelected}
              placeholder="No mapping"
              loading={dattoLoading}
            />
          </div>
        {/if}

        {#if coveLoading || coveOptions.length > 0}
          <div class="flex flex-col gap-2">
            <Label>Cove Backups</Label>
            <SingleSelect
              options={coveOptions.map((o) => ({ value: o.id, label: o.name }))}
              bind:selected={coveSelected}
              placeholder="No mapping"
              loading={coveLoading}
            />
          </div>
        {/if}

        {#if sophosLoading || sophosOptions.length > 0}
          <div class="flex flex-col gap-2">
            <Label>Sophos Partner</Label>
            <SingleSelect
              options={sophosOptions.map((o) => ({ value: o.id, label: o.name }))}
              bind:selected={sophosSelected}
              placeholder="No mapping"
              loading={sophosLoading}
            />
          </div>
        {/if}

        {#if haloLoading || haloOptions.length > 0}
          <div class="flex flex-col gap-2">
            <Label>HaloPSA</Label>
            <SingleSelect
              options={haloOptions.map((o) => ({ value: o.id, label: o.name }))}
              bind:selected={haloSelected}
              placeholder="No mapping"
              loading={haloLoading}
            />
          </div>
        {/if}
      {/if}
    </div>

    <Sheet.Footer class="px-4 pb-4">
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={handleSubmit} disabled={loading}>
        {loading ? 'Creating...' : 'Create'}
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
