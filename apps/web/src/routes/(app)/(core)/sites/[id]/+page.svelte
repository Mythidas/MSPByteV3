<script lang="ts">
  import type { PageData } from './$types.js';
  import { supabase } from '$lib/utils/supabase.js';
  import { toast } from 'svelte-sonner';
  import { INTEGRATIONS } from '@workspace/shared/config/integrations/integrations.js';
  import { formatDate } from '$lib/utils/format.js';
  import type { IntegrationId } from '@workspace/shared/types/integrations';
  import InlineEdit from '$lib/components/fields/inline-edit.svelte';
  import * as Card from '$lib/components/ui/card/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { ArrowLeft, Calendar, RefreshCw } from '@lucide/svelte';

  const { data }: { data: PageData } = $props();

  let site = $state(data.site);
  let links = $state(data.links);

  const getIntegrationColor = (id: IntegrationId) => {
    switch (id) {
      case 'sophos-partner':
        return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
      case 'cove':
        return 'bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30';
      case 'dattormm':
        return 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30';
      case 'halopsa':
        return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
      case 'microsoft-365':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
    }
    return 'bg-primary/15 text-primary border-primary/30';
  };

  async function handleSaveName(newName: string) {
    const { error } = await supabase
      .from('sites')
      .update({ name: newName })
      .eq('id', site.id);

    if (error) {
      toast.error(error.message);
      throw error;
    }

    site = { ...site, name: newName };
    toast.success('Site name updated');
  }
</script>

<div class="flex flex-col gap-6 p-6 size-full overflow-y-auto">
  <div class="flex items-center gap-2">
    <a
      href="/sites"
      class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft class="size-4" />
      Sites
    </a>
  </div>

  <div class="flex flex-col gap-1">
    <InlineEdit
      value={site.name}
      permission="Sites.Write"
      class="text-2xl font-bold"
      onsave={handleSaveName}
    />
  </div>

  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
    <Card.Root class="bg-primary/5 border-primary/20">
      <Card.Content class="flex items-center gap-3 p-4">
        <Calendar class="size-4 text-muted-foreground shrink-0" />
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-muted-foreground">Created</span>
          <span class="text-sm font-medium">{formatDate(site.created_at)}</span>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="bg-primary/5 border-primary/20">
      <Card.Content class="flex items-center gap-3 p-4">
        <RefreshCw class="size-4 text-muted-foreground shrink-0" />
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-muted-foreground">Last Updated</span>
          <span class="text-sm font-medium">{formatDate(site.updated_at)}</span>
        </div>
      </Card.Content>
    </Card.Root>
  </div>

  <div class="flex flex-col gap-3 max-w-2xl">
    <h2 class="text-base font-semibold">Integration Mappings</h2>

    {#if links.length === 0}
      <p class="text-sm text-muted-foreground">
        No integrations mapped. Configure mappings from the
        <a href="/setup/integrations" class="underline hover:text-foreground">integrations</a> page.
      </p>
    {:else}
      <div class="flex flex-col gap-2">
        {#each links as link (link.id)}
          {@const integration = INTEGRATIONS[link.integration_id as IntegrationId]}
          <Card.Root>
            <Card.Content class="flex items-center justify-between p-4">
              <div class="flex items-center gap-3">
                <Badge
                  variant="outline"
                  class={getIntegrationColor(link.integration_id as IntegrationId)}
                >
                  {integration?.name ?? link.integration_id}
                </Badge>
                <span class="text-sm">{link.name ?? link.external_id}</span>
              </div>
              {#if link.status}
                <Badge
                  variant="outline"
                  class={link.status === 'active'
                    ? 'bg-green-500/15 text-green-500 border-green-500/30'
                    : 'bg-muted text-muted-foreground'}
                >
                  {link.status}
                </Badge>
              {/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </div>
</div>
