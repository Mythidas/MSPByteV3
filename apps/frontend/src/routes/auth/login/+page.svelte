<script lang="ts">
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Separator from '$lib/components/ui/separator/separator.svelte';
  import { AlertCircle } from 'lucide-svelte';
  import { toast } from 'svelte-sonner';
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import type { PageProps } from './$types';
  import { loginFormSchema } from './_forms';
  import Button from '$lib/components/ui/button/button.svelte';

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
  const { form: formData, errors, enhance, delayed, submitting } = form;
</script>

<div class="flex flex-col size-full justify-center items-center p-4">
  <form
    method="POST"
    action="?/login"
    class="flex flex-col w-1/2 h-1/2 bg-card/60 rounded shadow p-4 gap-4 border border-primary/40"
    use:enhance
  >
    <div>
      <h1 class="font-bold text-3xl">Welcome Back!</h1>
      <span class="text-sm text-muted-foreground">Sign into MSPByte</span>
    </div>
    <Separator />
    <div class="flex flex-col gap-4">
      <div class="space-y-2">
        <Label for="username">
          Username
          <span class="text-destructive">*</span>
        </Label>
        <Input
          id="username"
          name="username"
          type="text"
          placeholder="john.doe@email.com"
          bind:value={$formData.username}
          aria-invalid={$errors.username ? 'true' : undefined}
          class={$errors.username ? 'border-destructive' : ''}
        />
        {#if $errors.username}
          <p class="text-sm text-destructive flex items-center gap-1">
            <AlertCircle class="h-3 w-3" />
            {$errors.username}
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
    </div>
    <div class="flex w-full mt-auto">
      <Button type="submit" class="w-full" disabled={$submitting}>Login</Button>
    </div>
  </form>
</div>
