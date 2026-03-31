<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { type Permission } from '$lib/utils/permissions';
  import type { Snippet } from 'svelte';

  const {
    children,
    permission,
    denied,
  }: { children: any; permission: Permission; denied?: Snippet } = $props();
</script>

{#if authStore.isAllowed(permission)}
  {@render children()}
{:else if denied}
  {@render denied()}
{/if}
