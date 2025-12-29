<script lang="ts">
  import type { TagColorKey, TagDto } from '$lib/api';

  import PastelColorPicker from '$lib/components/settings/PastelColorPicker.svelte';

  export let authed: boolean;

  export let tags: TagDto[];
  export let newTagName: string;
  export let newTagColor: string;
  export let tagError: string | null;

  export let tagColorMenuOpen: boolean;

  export let colorBg: Record<TagColorKey, string>;
  export let colorNames: TagColorKey[];

  export let isTagColorKey: (value: string) => value is TagColorKey;
  export let isHexColor: (value: string) => boolean;

  export let chooseTagColor: (c: TagColorKey) => void;
  export let chooseCustomTagColor: (hex: string) => void;

  export let doCreateTag: () => void | Promise<void>;
  export let doDeleteTag: (id: number) => void | Promise<void>;
</script>

<!-- Tags -->
<div class="bg-white/5 rounded-xl p-4" id="section-tags">
  <div class="flex items-center justify-between mb-3">
    <div class="font-medium">Tags</div>
    <div class="text-white/50 text-xs">Farben für Termine</div>
  </div>

  <div class="flex gap-2 mb-3">
    <input
      class="flex-1 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
      placeholder="Neuer Tag"
      bind:value={newTagName}
      disabled={!authed}
    />
    <div class="relative">
      <button
        class="h-9 px-3 rounded-lg bg-white/10 flex items-center gap-2 text-sm disabled:opacity-50"
        on:click|stopPropagation={() => (tagColorMenuOpen = !tagColorMenuOpen)}
        disabled={!authed}
      >
        {#if isTagColorKey(newTagColor)}
          <span class={`w-3 h-3 rounded-full ${colorBg[newTagColor]}`}></span>
        {:else}
          <span class="w-3 h-3 rounded-full" style={`background-color: ${newTagColor}`}></span>
        {/if}
        <span class="text-white/60">▾</span>
      </button>
      {#if tagColorMenuOpen}
        <div class="absolute right-0 mt-1 z-20 w-64 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl">
          {#each colorNames as c}
            <button
              class="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-white/10"
              on:click={() => chooseTagColor(c)}
            >
              <span class={`w-3 h-3 rounded-full ${colorBg[c]}`}></span>
              <span class="capitalize">{c}</span>
            </button>
          {/each}

          <PastelColorPicker value={isHexColor(newTagColor) ? newTagColor : null} onPick={chooseCustomTagColor} />
        </div>
      {/if}
    </div>
    <button
      class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
      on:click={doCreateTag}
      disabled={!authed || !newTagName.trim()}
    >
      +
    </button>
  </div>

  {#if tagError}
    <div class="text-red-400 text-xs mb-2">{tagError}</div>
  {/if}

  <div class="flex flex-wrap gap-2">
    {#each tags as t (t.id)}
      <div class="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 text-sm">
        {#if isTagColorKey(t.color)}
          <span class={`w-2.5 h-2.5 rounded-full ${colorBg[t.color]}`}></span>
        {:else}
          <span class="w-2.5 h-2.5 rounded-full" style={`background-color: ${t.color}`}></span>
        {/if}
        <span>{t.name}</span>
        {#if authed}
          <button class="text-white/40 hover:text-white/70 ml-1" on:click={() => doDeleteTag(t.id)}>×</button>
        {/if}
      </div>
    {/each}
    {#if tags.length === 0}
      <div class="text-white/40 text-sm">Keine Tags</div>
    {/if}
  </div>
</div>
