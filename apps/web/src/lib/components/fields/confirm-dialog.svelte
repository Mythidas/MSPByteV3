<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
  import Button from '$lib/components/ui/button/button.svelte';

  let {
    title,
    description,
    confirmLabel = 'Confirm',
    destructive = false,
    trigger,
    confirmAction,
    onconfirm,
  }: {
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    trigger: Snippet<[Record<string, unknown>]>;
    confirmAction?: Snippet;
    onconfirm?: () => void | Promise<void>;
  } = $props();
</script>

<AlertDialog.Root>
  <AlertDialog.Trigger>
    {#snippet child({ props })}
      {@render trigger(props)}
    {/snippet}
  </AlertDialog.Trigger>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{title}</AlertDialog.Title>
      <AlertDialog.Description>{description}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      {#if confirmAction}
        {@render confirmAction()}
      {:else}
        <AlertDialog.Action
          class={destructive
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80'
            : ''}
          onclick={onconfirm}
        >
          {confirmLabel}
        </AlertDialog.Action>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
