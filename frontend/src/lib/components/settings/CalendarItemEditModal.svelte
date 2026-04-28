<script lang="ts">
  import type { TagColorKey } from '$lib/api';

  import PastelColorPicker from '$lib/components/settings/PastelColorPicker.svelte';

  export let open = false;
  export let title: string;
  export let name: string;
  export let color: string;
  export let saving = false;
  export let error: string | null = null;

  export let colorBg: Record<TagColorKey, string>;
  export let colorNames: TagColorKey[];
  export let isTagColorKey: (value: string) => value is TagColorKey;
  export let isHexColor: (value: string) => boolean;

  export let onSave: () => void | Promise<void>;
  export let onClose: () => void;

  function chooseColor(nextColor: string) {
    color = nextColor;
  }

  function closeIfReady() {
    if (!saving) onClose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) closeIfReady();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4"
    on:click={(event) => event.currentTarget === event.target && closeIfReady()}
  >
    <div class="absolute inset-0 bg-black/70"></div>
    <form
      class="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      on:submit|preventDefault={onSave}
    >
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <div class="text-lg font-semibold text-white/95">{title}</div>
          <div class="mt-1 text-sm text-white/50">Name und Farbe</div>
        </div>
        <button
          type="button"
          class="-mr-1 h-9 w-9 rounded-lg bg-white/10 text-lg leading-none text-white/60 hover:bg-white/15 hover:text-white disabled:opacity-50"
          on:click={closeIfReady}
          disabled={saving}
          aria-label="Schliessen"
        >
          ×
        </button>
      </div>

      <label class="block text-sm text-white/80">
        <span class="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/45">Name</span>
        <input
          class="h-11 w-full rounded-lg border-0 bg-white/10 px-3 text-sm text-white placeholder:text-white/40 focus:ring-2 focus:ring-cyan-300/50"
          bind:value={name}
          maxlength="40"
          disabled={saving}
        />
      </label>

      <div class="mt-5">
        <div class="mb-2 flex items-center justify-between gap-3">
          <div class="text-xs font-medium uppercase tracking-wide text-white/45">Farbe</div>
          <div class="inline-flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/60">
            {#if isTagColorKey(color)}
              <span class={`h-3 w-3 rounded-full ${colorBg[color]}`}></span>
              <span class="capitalize">{color}</span>
            {:else}
              <span class="h-3 w-3 rounded-full" style={`background-color: ${color}`}></span>
              <span>{color}</span>
            {/if}
          </div>
        </div>

        <div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {#each colorNames as colorName}
            <button
              type="button"
              class={`flex h-10 items-center justify-center rounded-lg border transition ${
                color === colorName ? 'border-white/70 bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              on:click={() => chooseColor(colorName)}
              disabled={saving}
              aria-label={`Farbe ${colorName}`}
            >
              <span class={`h-4 w-4 rounded-full ${colorBg[colorName]}`}></span>
            </button>
          {/each}
        </div>

        <div class="mt-3 rounded-lg border border-white/10 bg-white/5">
          <PastelColorPicker value={isHexColor(color) ? color : null} onPick={chooseColor} />
        </div>
      </div>

      {#if error}
        <div class="mt-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      {/if}

      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
        <button
          type="button"
          class="h-11 flex-1 rounded-lg bg-white/10 text-sm font-medium text-white/80 transition hover:bg-white/15 disabled:opacity-50"
          on:click={closeIfReady}
          disabled={saving}
        >
          Schließen
        </button>
        <button
          type="submit"
          class="h-11 flex-1 rounded-lg bg-white/20 text-sm font-semibold text-white transition hover:bg-white/25 disabled:opacity-50"
          disabled={saving || !name.trim()}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
      </div>
    </form>
  </div>
{/if}