<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { Pencil, Check, X, Building2, Users, Link, Boxes, TriangleAlert } from '@lucide/svelte';
  import { INTEGRATIONS } from '@workspace/shared/config/integrations';
  import { hasPermission } from '$lib/utils/permissions';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils/index.js';
  import { formatStringProper } from '$lib/utils/format.js';

  const { data } = $props();

  let isEditing = $state(false);
  let editName = $state('');
  let isSaving = $state(false);

  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );

  const integrationTypeBadge: Record<string, string> = {
    psa: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    rmm: 'bg-green-500/15 text-green-500 border-green-500/30',
    security: 'bg-red-500/15 text-red-500 border-red-500/30',
    recovery: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    identity: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
    other: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30',
  };

  function startEdit() {
    editName = data.site.name;
    isEditing = true;
  }

  function cancelEdit() {
    isEditing = false;
    editName = '';
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    isSaving = true;

    try {
      const formData = new FormData();
      formData.set('name', editName.trim());

      const response = await fetch('?/save', { method: 'POST', body: formData });
      const result = await response.json();

      if (result.type === 'failure') {
        toast.error(result.data?.error ?? 'Failed to update name.');
      } else {
        toast.success('Site name updated.');
        isEditing = false;
        await invalidateAll();
      }
    } catch {
      toast.error('Failed to update name.');
    } finally {
      isSaving = false;
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
</script>

<div class="flex flex-col gap-4 p-4 size-full">
  <!-- Breadcrumb -->
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/sites">Sites</Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>{data.site.name}</Breadcrumb.Page>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>

  <!-- Site Info -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Building2 class="size-5" />
        Site Information
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-muted-foreground w-24">Name</span>
        {#if isEditing}
          <div class="flex items-center gap-2">
            <Input
              bind:value={editName}
              class="h-8 w-64"
              disabled={isSaving}
              onkeydown={(e) => {
                if (e.key === 'Enter') saveEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              class="size-8"
              onclick={saveEdit}
              disabled={isSaving}
            >
              <Check class="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              class="size-8"
              onclick={cancelEdit}
              disabled={isSaving}
            >
              <X class="size-4" />
            </Button>
          </div>
        {:else}
          <span class="text-sm">{data.site.name}</span>
          {#if canWrite}
            <Button size="icon" variant="ghost" class="size-7" onclick={startEdit}>
              <Pencil class="size-3.5" />
            </Button>
          {/if}
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-muted-foreground w-24">Parent</span>
        {#if data.parentSite}
          <a href="/sites/{data.parentSite.id}" class="text-sm text-primary hover:underline">
            {data.parentSite.name}
          </a>
        {:else}
          <span class="text-sm text-muted-foreground">None</span>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-muted-foreground w-24">Created</span>
        <span class="text-sm">{formatDate(data.site.created_at)}</span>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-muted-foreground w-24">Updated</span>
        <span class="text-sm">{formatDate(data.site.updated_at)}</span>
      </div>
    </CardContent>
  </Card>

  <!-- Integrations -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Link class="size-5" />
        Integrations
      </CardTitle>
    </CardHeader>
    <CardContent>
      {#if data.integrationLinks.length === 0}
        <p class="text-sm text-muted-foreground">No integrations linked to this site.</p>
      {:else}
        <div class="space-y-3">
          {#each data.integrationLinks as link}
            {@const info = INTEGRATIONS[link.integration_id]}
            <div class="flex items-center justify-between rounded-md border p-3">
              <div class="flex flex-col gap-1">
                <span class="text-sm font-medium">{info?.name ?? link.integration_id}</span>
                <span class="text-xs text-muted-foreground">ID: {link.external_id}</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex w-8 items-center gap-1 text-xs text-muted-foreground">
                  <Boxes class="size-3.5" />
                  <span>{link.entityCount}</span>
                </div>
                <div class="flex w-8 items-center gap-1 text-xs text-muted-foreground">
                  <TriangleAlert class="size-3.5" />
                  <span>{link.alertCount}</span>
                </div>
                {#if info}
                  <Badge
                    variant="outline"
                    class={cn(
                      'w-14',
                      integrationTypeBadge[info.type] ?? integrationTypeBadge.other
                    )}
                  >
                    {formatStringProper(info.type)}
                  </Badge>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </CardContent>
  </Card>

  <!-- Groups -->
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Users class="size-5" />
        Groups
      </CardTitle>
    </CardHeader>
    <CardContent>
      {#if data.groups.length === 0}
        <p class="text-sm text-muted-foreground">This site is not in any groups.</p>
      {:else}
        <div class="space-y-3">
          {#each data.groups as group}
            <div class="rounded-md border p-3">
              <span class="text-sm font-medium">{group.name}</span>
              {#if group.description}
                <p class="mt-1 text-xs text-muted-foreground">{group.description}</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </CardContent>
  </Card>
</div>
