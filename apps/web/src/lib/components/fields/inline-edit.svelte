<script lang="ts">
  import type { Permission } from '$lib/utils/permissions';
  import { authStore } from '$lib/stores/auth.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Pencil, Check, X } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let {
    value,
    permission,
    placeholder,
    class: className,
    onsave,
  }: {
    value: string;
    permission?: Permission;
    placeholder?: string;
    class?: string;
    onsave?: (value: string) => Promise<void> | void;
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  let saving = $state(false);

  const canEdit = $derived(!permission || authStore.isAllowed(permission));

  function startEdit() {
    draft = value;
    editing = true;
  }

  function cancel() {
    editing = false;
    draft = '';
  }

  async function save() {
    if (draft === value) {
      cancel();
      return;
    }
    saving = true;
    try {
      await onsave?.(draft);
    } finally {
      saving = false;
      editing = false;
    }
  }
</script>

{#if editing}
  <div class="flex items-center gap-1">
    <Input
      bind:value={draft}
      {placeholder}
      class={cn('h-7 text-sm py-0', className)}
      onkeydown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') cancel();
      }}
      autofocus
    />
    <Button
      variant="ghost"
      size="icon"
      class="size-7 shrink-0 text-primary hover:bg-primary/10"
      onclick={save}
      disabled={saving}
    >
      <Check class="size-3.5" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="size-7 shrink-0 text-muted-foreground"
      onclick={cancel}
      disabled={saving}
    >
      <X class="size-3.5" />
    </Button>
  </div>
{:else}
  <div class="flex items-center gap-1 group">
    <span class={className}>{value}</span>
    {#if canEdit}
      <Button
        variant="ghost"
        size="icon"
        class="size-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-primary"
        onclick={startEdit}
      >
        <Pencil class="size-3" />
      </Button>
    {/if}
  </div>
{/if}
