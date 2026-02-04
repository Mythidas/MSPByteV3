<script lang="ts">
	import '../layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from "mode-watcher";
	import * as NavigationMenu from "$lib/components/ui/navigation-menu/index.js";
	import { Toaster } from "$lib/components/ui/sonner/index.js";
	import { page } from '$app/state';
  import { cn } from "$lib/utils/index";

	let { children } = $props();

	const startsWith = (path: string) => page.url.pathname.startsWith(path);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher defaultMode="system" />
<Toaster />
<div class="flex flex-col relative w-screen h-screen overflow-clip">
	<div class="absolute inset-0 -z-10">
		<svg class="size-full" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<pattern
					id="dot-grid"
					x="0"
					y="0"
					width="24"
					height="24"
					patternUnits="userSpaceOnUse"
				>
					<circle cx="2" cy="2" r="1" class="fill-foreground/12" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#dot-grid)" />
		</svg>
	</div>
	<div class="flex w-full h-fit p-2 bg-background shadow">
		<NavigationMenu.Root>
			<NavigationMenu.List>
				<NavigationMenu.Item>
					<NavigationMenu.Link href="/" class={cn(page.url.pathname === "/" && 'bg-accent/50')}>
						Home
					</NavigationMenu.Link>
				</NavigationMenu.Item>
				<NavigationMenu.Item>
					<NavigationMenu.Link href="/sites" class={cn(startsWith('/sites') && 'bg-accent/50')}>
						Sites
					</NavigationMenu.Link>
				</NavigationMenu.Item>
				<NavigationMenu.Item>
					<NavigationMenu.Link href="/integrations" class={cn(startsWith('/integrations') && 'bg-accent/50')}>
						Integrations
					</NavigationMenu.Link>
				</NavigationMenu.Item>
			</NavigationMenu.List>
		</NavigationMenu.Root>
	</div>
	<div class="flex flex-1 min-h-0">
		{@render children()}
	</div>
</div>
