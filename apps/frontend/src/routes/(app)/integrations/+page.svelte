<script lang="ts">
  import SearchBar from "$lib/components/search-bar.svelte";
  import { INTEGRATIONS } from "@workspace/shared/config/integrations";

  let search = $state("");
  let filtered = $derived.by(() => {
    return Object.keys(INTEGRATIONS).map((k) => {
      return {
        ...INTEGRATIONS[k],
        id: k
      }
    }).filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
  });
</script>

<div class="flex flex-col size-full gap-2 p-4">
  <div class="flex w-1/3">
    <SearchBar bind:value={search} />
  </div>
  <div class="grid grid-cols-2 gap-2">
    {#each filtered as integration}
      <a href={`/integrations/${integration.id}`} class="flex bg-card/50 p-2 justify-between hover:bg-card/90 hover:cursor-pointer">
        <p>{integration.name}</p>
        <p class="text-sm text-muted-foreground my-auto">{integration.type.toUpperCase()}</p>
      </a>
    {/each}
  </div>
</div>