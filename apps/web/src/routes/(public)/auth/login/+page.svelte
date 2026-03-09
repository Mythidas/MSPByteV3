<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase';
  import { PUBLIC_ORIGIN } from '$env/static/public';
  import { page } from '$app/state';

  async function signInWithMicrosoft() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${PUBLIC_ORIGIN}/auth/callback`,
        scopes: 'openid profile email',
        queryParams: {
          prompt: 'select_account'
        }
      },
    });

    if (error) {
      toast.error(`SSO failed: ${error.message}`);
    }
  }

  $effect(() => {
    if (page.url.searchParams.has('error')) 
      toast.error(page.url.searchParams.get('error') ?? 'Unknown Error. Try again or contact support');
  })
</script>

<div class="flex flex-col size-full items-center justify-center p-4">
  <div class="flex flex-col w-full max-w-sm gap-4 p-4 border shadow rounded bg-card">
    <div>
      <h1 class="font-bold text-3xl">Welcome Back!</h1>
      <span class="text-sm text-muted-foreground">Sign into MSPByte</span>
    </div>

    <Button variant="outline" class="w-full gap-2" onclick={signInWithMicrosoft}>
      <svg class="size-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="9" height="9" fill="#F25022"></rect>
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00"></rect>
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF"></rect>
        <rect x="11" y="11" width="9" height="9" fill="#FFB900"></rect>
      </svg>
      Sign in with Microsoft
    </Button>
  </div>
</div>
