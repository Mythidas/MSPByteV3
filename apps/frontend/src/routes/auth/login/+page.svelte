<script lang="ts">
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Separator from '$lib/components/ui/separator/separator.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { AlertCircle } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import { supabase } from '$lib/supabase';
  import type { PageProps } from './$types';
  import { loginFormSchema } from './_forms';
  import { PUBLIC_ORIGIN } from '$env/static/public';
  import { dev } from '$app/environment';

  const { data }: PageProps = $props();

  // svelte-ignore state_referenced_locally
  const form = superForm(data.form, {
    validators: zod4Client(loginFormSchema),
    resetForm: false,
    onUpdate({ form }) {
      if (form.message) {
        if (form.valid) {
          toast.success(form.message);
        } else {
          toast.error(form.message);
        }
      }
    },
  });
  const { form: formData, errors, enhance, submitting } = form;

  async function signInWithMicrosoft() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${PUBLIC_ORIGIN}/auth/callback`,
        scopes: 'openid profile email',
      },
    });
    if (error) {
      toast.error(`SSO failed: ${error.message}`);
    }
  }
</script>

<div class="flex flex-col size-full items-center justify-center p-4">
  <div class="flex flex-col w-full max-w-sm gap-6">
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

    <div class="flex items-center gap-3">
      <Separator class="flex-1" />
      <span class="text-xs text-muted-foreground">or continue with email</span>
      <Separator class="flex-1" />
    </div>

    <form method="POST" action="?/login" class="flex flex-col gap-4" use:enhance>
      <div class="space-y-2">
        <Label for="email">
          Email
          <span class="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          disabled={!dev}
          placeholder="john.doe@email.com"
          bind:value={$formData.email}
          aria-invalid={$errors.email ? 'true' : undefined}
          class={$errors.email ? 'border-destructive' : ''}
        />
        {#if $errors.email}
          <p class="text-sm text-destructive flex items-center gap-1">
            <AlertCircle class="h-3 w-3" />
            {$errors.email}
          </p>
        {/if}
      </div>
      <div class="space-y-2">
        <Label for="password">
          Password
          <span class="text-destructive">*</span>
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          disabled={!dev}
          placeholder="***********"
          bind:value={$formData.password}
          aria-invalid={$errors.password ? 'true' : undefined}
          class={$errors.password ? 'border-destructive' : ''}
        />
        {#if $errors.password}
          <p class="text-sm text-destructive flex items-center gap-1">
            <AlertCircle class="h-3 w-3" />
            {$errors.password}
          </p>
        {/if}
      </div>
      <Button type="submit" class="w-full" disabled={$submitting}>Login</Button>
    </form>
  </div>
</div>
