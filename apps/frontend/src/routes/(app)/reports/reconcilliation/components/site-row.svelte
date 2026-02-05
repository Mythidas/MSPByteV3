<script lang="ts">
  import { Badge } from '$lib/components/ui/badge/index.js';
  import {
    ChevronDown,
    ChevronRight,
    CheckCircle,
    AlertTriangle,
    AlertCircle,
  } from '@lucide/svelte';
  import MismatchBadge from './mismatch-badge.svelte';
  import type { SiteReport } from '../types';

  let {
    site,
    expanded,
    onToggle,
  }: {
    site: SiteReport;
    expanded: boolean;
    onToggle: () => void;
  } = $props();
</script>

<div class="border rounded-lg overflow-hidden">
  <button
    class="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
    onclick={onToggle}
  >
    <div class="shrink-0">
      {#if expanded}
        <ChevronDown class="h-4 w-4 text-muted-foreground" />
      {:else}
        <ChevronRight class="h-4 w-4 text-muted-foreground" />
      {/if}
    </div>

    <div class="flex-1 min-w-0">
      <span class="font-medium truncate">{site.name}</span>
    </div>

    <div class="flex items-center gap-2 flex-wrap justify-end">
      {#each site.mismatches as mismatch}
        <MismatchBadge {mismatch} />
      {/each}

      {#if site.status === 'complete'}
        <Badge class="bg-green-500/15 text-green-600 border-green-500/30">
          <CheckCircle class="h-3 w-3 mr-1" />
          Complete
        </Badge>
      {:else if site.status === 'error'}
        <Badge variant="destructive">
          <AlertCircle class="h-3 w-3 mr-1" />
          Error
        </Badge>
      {/if}
    </div>
  </button>

  {#if expanded}
    <div class="border-t bg-muted/30 p-4">
      <div class="grid grid-cols-4 gap-4 text-sm">
        <div class="space-y-2">
          <div class="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Contract
          </div>
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Servers:</span>
              <span class="font-medium">{site.contract.servers}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Desktops:</span>
              <span class="font-medium">{site.contract.desktops}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Backups:</span>
              <span class="font-medium">{site.contract.backups}</span>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Sophos
          </div>
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Servers:</span>
              <span
                class="font-medium"
                class:text-red-600={site.sophos.servers !== site.contract.servers}
              >
                {site.sophos.servers}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Desktops:</span>
              <span
                class="font-medium"
                class:text-red-600={site.sophos.desktops !== site.contract.desktops}
              >
                {site.sophos.desktops}
              </span>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Datto RMM
          </div>
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Servers:</span>
              <span
                class="font-medium"
                class:text-red-600={site.datto.servers !== site.contract.servers}
              >
                {site.datto.servers}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">Desktops:</span>
              <span
                class="font-medium"
                class:text-red-600={site.datto.desktops !== site.contract.desktops}
              >
                {site.datto.desktops}
              </span>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <div class="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Cove Backup
          </div>
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Devices:</span>
              <span
                class="font-medium"
                class:text-red-600={site.cove.devices !== site.contract.backups}
              >
                {site.cove.devices}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
