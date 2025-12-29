<script lang="ts">
  import type { PersonDto, TagColorKey } from '$lib/api';

  import PastelColorPicker from '$lib/components/settings/PastelColorPicker.svelte';

  export let authed: boolean;

  export let persons: PersonDto[];
  export let newPersonName: string;
  export let newPersonColor: string;
  export let personError: string | null;

  export let personColorMenuOpen: boolean;

  export let colorBg: Record<TagColorKey, string>;
  export let colorNames: TagColorKey[];

  export let isTagColorKey: (value: string) => value is TagColorKey;
  export let isHexColor: (value: string) => boolean;

  export let choosePersonColor: (c: TagColorKey) => void;
  export let chooseCustomPersonColor: (hex: string) => void;
  export let doCreatePerson: () => void | Promise<void>;
  export let doDeletePerson: (id: number) => void | Promise<void>;
</script>

<!-- Personen -->
<div class="bg-white/5 rounded-xl p-4" id="section-persons">
  <div class="flex items-center justify-between mb-3">
    <div class="font-medium">Personen</div>
    <div class="text-white/50 text-xs">Für Termine zuweisbar</div>
  </div>

  {#if !authed}
    <div class="text-white/40 text-sm">Login erforderlich</div>
  {:else}
    <div class="flex gap-2 mb-3">
      <input
        class="flex-1 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
        placeholder="Name"
        bind:value={newPersonName}
      />
      <div class="relative">
        <button
          class="h-9 px-3 rounded-lg bg-white/10 flex items-center gap-2 text-sm"
          on:click|stopPropagation={() => (personColorMenuOpen = !personColorMenuOpen)}
        >
          {#if isTagColorKey(newPersonColor)}
            <span class={`w-3 h-3 rounded-full ${colorBg[newPersonColor]}`}></span>
          {:else}
            <span class="w-3 h-3 rounded-full" style={`background-color: ${newPersonColor}`}></span>
          {/if}
          <span class="text-white/60">▾</span>
        </button>
        {#if personColorMenuOpen}
          <div class="absolute right-0 mt-1 z-20 w-64 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl">
            {#each colorNames as c}
              <button
                class="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-white/10"
                on:click={() => choosePersonColor(c)}
              >
                <span class={`w-3 h-3 rounded-full ${colorBg[c]}`}></span>
                <span class="capitalize">{c}</span>
              </button>
            {/each}

            <PastelColorPicker
              value={isHexColor(newPersonColor) ? newPersonColor : null}
              onPick={chooseCustomPersonColor}
            />
          </div>
        {/if}
      </div>
      <button
        class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
        on:click={doCreatePerson}
        disabled={!newPersonName.trim()}
      >
        +
      </button>
    </div>

    {#if personError}
      <div class="text-red-400 text-xs mb-2">{personError}</div>
    {/if}

    <div class="flex flex-wrap gap-2">
      {#each persons as p (p.id)}
        <div class="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 text-sm">
          {#if isTagColorKey(p.color)}
            <span class={`w-2.5 h-2.5 rounded-full ${colorBg[p.color]}`}></span>
          {:else}
            <span class="w-2.5 h-2.5 rounded-full" style={`background-color: ${p.color}`}></span>
          {/if}
          <span>{p.name}</span>
          <button class="text-white/40 hover:text-white/70 ml-1" on:click={() => doDeletePerson(p.id)}>×</button>
        </div>
      {/each}
      {#if persons.length === 0}
        <div class="text-white/40 text-sm">Keine Personen</div>
      {/if}
    </div>
  {/if}
</div>
