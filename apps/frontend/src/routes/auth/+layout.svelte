<script lang="ts">
  import '../layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner/index.js';

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher defaultMode="system" />
<Toaster />
<div class="flex relative w-screen h-screen overflow-clip">
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
  <div class="hidden lg:flex w-1/2 h-full p-4">
    <div
      class="flex flex-col size-full bg-linear-to-br from-primary/60 to-card/60 rounded-lg shadow-lg p-8 justify-between"
    >
      <span class="font-bold text-6xl">MSP Byte</span>
      <span class="text-4xl font-bold italic">Byte size view of your MSP</span>
    </div>
  </div>
  <div class="flex flex-1 min-h-0 items-center justify-center">
    {@render children()}
  </div>
</div>
