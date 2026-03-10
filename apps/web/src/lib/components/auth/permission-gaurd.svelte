<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import { hasPermission, type Permission } from '$lib/utils/permissions';

  const { children, permission }: { children: any; permission: Permission } = $props();
</script>

{#if hasPermission((authStore.currentRole?.attributes as any) || null, permission)}
  {@render children()}
{/if}
