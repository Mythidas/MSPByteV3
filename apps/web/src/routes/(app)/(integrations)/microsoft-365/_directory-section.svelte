<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { createM365Directory } from '$lib/hooks/m365/useM365Directory.svelte.js';

  const { tenantId, linkId }: { tenantId: string; linkId: string } = $props();

  const getParams = () => ({ tenantId, linkId });
  const hook = createM365Directory(getParams);

  const d = $derived(hook.data);
</script>

<section class="flex flex-col gap-3">
  <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
    Directory &amp; Policies
  </h2>

  {#if hook.loading}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {#each Array(4) as _}
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1.5">
            <span class="h-3 w-20 rounded bg-muted-foreground/15"></span>
            <span class="h-7 w-12 rounded bg-muted-foreground/15"></span>
          </div>
        </Card.Root>
      {/each}
    </div>
  {:else if hook.error}
    <p class="text-sm text-destructive">{hook.error}</p>
  {:else if d}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <a href="/microsoft-365/groups">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Groups</span>
            <span class="text-2xl font-bold">{d.directory.groups}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/roles">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Roles</span>
            <span class="text-2xl font-bold">{d.directory.roles}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/policies?view=enabled">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Enabled Policies</span>
            <span class="text-2xl font-bold text-primary">{d.policies.enabled}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/policies?view=disabled">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Disabled Policies</span>
            <span class="text-2xl font-bold">{d.policies.disabled}</span>
          </div>
        </Card.Root>
      </a>
    </div>
  {/if}
</section>
