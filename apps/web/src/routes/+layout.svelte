<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
    import { ModeWatcher } from "mode-watcher";
    import { Toaster } from "$lib/components/ui/sonner";

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher defaultMode="system" />
<Toaster />

<main class="flex flex-col h-screen w-screen overflow-hidden bg-background/0">
	<div class="absolute inset-0 -z-10">
      <svg class="size-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" class="fill-foreground/15"></circle>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)"></rect>
      </svg>
    </div>
		{@render children()}
</main>