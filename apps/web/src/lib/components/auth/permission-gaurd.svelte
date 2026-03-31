<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { type Permission } from '$lib/utils/permissions';

  const { children, permission }: { children: any; permission: Permission } = $props();
</script>

{#if authStore.isAllowed(permission)}
  {@render children()}
{/if}
