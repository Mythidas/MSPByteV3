<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button/index.js';

  let code = $derived(page.url.searchParams.get('code') ?? '500');
  let message = $derived(
    page.url.searchParams.get('message') ?? 'An unexpected error occurred.'
  );

  const titles: Record<string, string> = {
    '403': 'Access Denied',
    '404': 'Not Found',
    '500': 'Server Error',
  };

  let title = $derived(titles[code] ?? 'Error');
</script>

<div class="flex flex-1 items-center justify-center p-4">
  <div class="flex flex-col items-center gap-6 max-w-md text-center">
    <div
      class="flex items-center justify-center size-20 rounded-full bg-destructive/10 text-destructive text-2xl font-bold"
    >
      {code}
    </div>
    <div class="flex flex-col gap-2">
      <h1 class="text-2xl font-bold">{title}</h1>
      <p class="text-muted-foreground">{message}</p>
    </div>
    <Button href="/" variant="outline">Go Home</Button>
  </div>
</div>
