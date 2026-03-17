<script lang="ts">
  import { Plug, Zap, LayoutDashboard, Settings } from '@lucide/svelte';
</script>

<!-- Nav -->
<nav
  class="flex h-14 min-h-14 w-full px-6 items-center justify-between border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10"
>
  <span class="text-lg font-semibold tracking-tight">MSPByte</span>
  <a
    href="/auth/login"
    class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
  >
    Sign In
  </a>
</nav>

<!-- Hero -->
<section class="flex flex-col items-center justify-center text-center px-6 py-24 gap-6">
  <div
    class="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 text-sm text-primary font-medium"
  >
    MSP Management Platform
  </div>
  <h1 class="text-4xl sm:text-5xl font-bold tracking-tight max-w-2xl">
    Keep your integrations configured and consistent
  </h1>
  <p class="text-muted-foreground text-lg max-w-xl">
    MSPByte connects to your Microsoft 365, RMM, PSA, and other tools so you can track and manage
    their configuration across every client from one place.
  </p>
  <a
    href="/auth/login"
    class="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
  >
    Get Started
  </a>
</section>

<!-- Feature highlights -->
<section
  class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-6 pb-24 max-w-5xl mx-auto w-full"
>
  {#each [{ icon: Plug, title: 'Integration Hub', description: 'Connect Microsoft 365, RMM, PSA, and more — all managed from a single dashboard.' }, { icon: LayoutDashboard, title: 'Configuration Tracking', description: 'See the current configuration state of every integration across all your clients at a glance.' }, { icon: Zap, title: 'Workflow Automation', description: 'Automate repetitive configuration tasks so changes roll out consistently every time.' }, { icon: Settings, title: 'Multi-Tenant Management', description: 'Manage settings and integration configs per client site with clear role-based access.' }] as feature}
    <div class="flex flex-col gap-3 rounded-lg border bg-card/50 p-5">
      <div class="flex size-9 items-center justify-center rounded-md bg-primary/10">
        <feature.icon class="size-5 text-primary" />
      </div>
      <div>
        <p class="font-semibold text-sm">{feature.title}</p>
        <p class="text-muted-foreground text-sm mt-1">{feature.description}</p>
      </div>
    </div>
  {/each}
</section>

<!-- Footer -->
<footer class="border-t py-6 mt-auto text-center text-sm text-muted-foreground">
  &copy; {new Date().getFullYear()} MSPByte. All rights reserved.
</footer>
