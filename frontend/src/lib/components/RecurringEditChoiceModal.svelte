<script context="module" lang="ts">
  export type RecurringEditScope = 'series' | 'occurrence';
</script>

<script lang="ts">

  export let open = false;
  export let tone: 'light' | 'dark' = 'light';
  export let title: string = '';
  export let onChoose: (scope: RecurringEditScope) => void;
  export let onClose: () => void;

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    onClose();
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<svelte:window on:keydown={onKeyDown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class={`fixed inset-0 z-[1100] backdrop-blur-sm flex items-end sm:items-center justify-center ${tone === 'dark' ? 'bg-black/35' : 'bg-black/60'}`}
    style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);"
    on:click|self={onClose}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Serientermin bearbeiten"
  >
    <div class={`w-full sm:max-w-md sm:rounded-2xl overflow-hidden shadow-2xl ${tone === 'dark' ? 'bg-white/96 border border-black/12 text-zinc-900' : 'bg-neutral-900/95 border border-white/10 text-white'}`} on:click|stopPropagation>
      <div class={`px-5 pt-5 pb-4 ${tone === 'dark' ? 'border-b border-black/10' : 'border-b border-white/10'}`}>
        <div class="text-lg font-semibold">Serientermin bearbeiten</div>
        <div class={`mt-1 text-sm ${tone === 'dark' ? 'text-zinc-700/80' : 'text-white/60'}`}>
          Dieser Termin gehört zu einer Serie{#if title}: {title}{/if}.
        </div>
      </div>

      <div class="px-5 py-4 space-y-3">
        <div class={`text-sm ${tone === 'dark' ? 'text-zinc-700/80' : 'text-white/70'}`}>Was möchtest du bearbeiten?</div>

        <button
          type="button"
          class={`w-full text-left px-4 py-3 rounded-xl border transition ${tone === 'dark' ? 'bg-black/4 hover:bg-black/8 active:bg-black/12 border-black/10' : 'bg-white/5 hover:bg-white/10 active:bg-white/15 border-white/10'}`}
          on:click={() => onChoose('occurrence')}
        >
          <div class="font-semibold">Nur dieses Serienelement</div>
          <div class={`text-sm ${tone === 'dark' ? 'text-zinc-700/80' : 'text-white/60'}`}>Änderungen gelten nur für diesen Termin.</div>
        </button>

        <button
          type="button"
          class={`w-full text-left px-4 py-3 rounded-xl border transition ${tone === 'dark' ? 'bg-black/4 hover:bg-black/8 active:bg-black/12 border-black/10' : 'bg-white/5 hover:bg-white/10 active:bg-white/15 border-white/10'}`}
          on:click={() => onChoose('series')}
        >
          <div class="font-semibold">Ganze Serie</div>
          <div class={`text-sm ${tone === 'dark' ? 'text-zinc-700/80' : 'text-white/60'}`}>Änderungen gelten für alle Termine der Serie.</div>
        </button>

        <button type="button" class={`w-full px-4 py-2 rounded-xl transition ${tone === 'dark' ? 'text-zinc-700/80 hover:text-zinc-900 hover:bg-black/6' : 'text-white/70 hover:text-white hover:bg-white/5'}`} on:click={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}
