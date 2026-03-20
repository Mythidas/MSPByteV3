<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { createM365Identities } from '$lib/hooks/m365/useM365Identities.svelte.js';

  const { tenantId, linkId }: { tenantId: string; linkId: string } = $props();

  const getParams = () => ({ tenantId, linkId });
  const hook = createM365Identities(getParams);

  const d = $derived(hook.data);
</script>

<section class="flex flex-col gap-3">
  <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identities</h2>

  {#if hook.loading}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {#each Array(6) as _}
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1.5">
            <span class="h-3 w-24 rounded bg-muted-foreground/15"></span>
            <span class="h-7 w-12 rounded bg-muted-foreground/15"></span>
          </div>
        </Card.Root>
      {/each}
    </div>
  {:else if hook.error}
    <p class="text-sm text-destructive">{hook.error}</p>
  {:else if d}
    <!-- Risk row -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <a href="/microsoft-365/identities?view=no-mfa">
        <Card.Root
          class="p-4 hover:border-primary/50 cursor-pointer transition-colors {d.noMfa > 0
            ? 'bg-warning/5 border-warning/20'
            : ''}"
        >
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">No MFA</span>
            <span class="text-2xl font-bold {d.noMfa > 0 ? 'text-warning' : ''}">{d.noMfa}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/identities?view=disabled">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Disabled</span>
            <span class="text-2xl font-bold">{d.disabled}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/identities?view=no-sign-in">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">No Recent Sign-In</span>
            <span class="text-2xl font-bold text-muted-foreground">{d.noSignIn}</span>
          </div>
        </Card.Root>
      </a>
    </div>
    <!-- Neutral row -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <a href="/microsoft-365/identities">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Total</span>
            <span class="text-2xl font-bold">{d.total}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/identities">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Members</span>
            <span class="text-2xl font-bold">{d.members}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/identities">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Guests</span>
            <span class="text-2xl font-bold">{d.guests}</span>
          </div>
        </Card.Root>
      </a>
    </div>
  {/if}
</section>
