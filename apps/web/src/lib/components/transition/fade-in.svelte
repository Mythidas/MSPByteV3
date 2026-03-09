<script lang="ts">
  import { fade } from 'svelte/transition';

  let {
    children,
    duration = 250,
    ...props
  }: { children: any; duration?: number; class?: string } = $props();
</script>

<div in:fade={{ duration }} class={props.class}>
  {@render children()}
</div>
