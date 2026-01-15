<script context="module" lang="ts">
  export type RecurringEditScope = 'series' | 'occurrence';
</script>

<script lang="ts">

  export let open = false;
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
    class="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
    style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);"
    on:click|self={onClose}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label="Serientermin bearbeiten"
  >
    <div class="w-full sm:max-w-md bg-neutral-900/95 border border-white/10 sm:rounded-2xl overflow-hidden shadow-2xl" on:click|stopPropagation>
      <div class="px-5 pt-5 pb-4 border-b border-white/10">
        <div class="text-lg font-semibold text-white">Serientermin bearbeiten</div>
        <div class="mt-1 text-sm text-white/60">
          Dieser Termin gehört zu einer Serie{#if title}: {title}{/if}.
        </div>
      </div>

      <div class="px-5 py-4 space-y-3">
        <div class="text-sm text-white/70">Was möchtest du bearbeiten?</div>

        <button
          type="button"
          class="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 transition"
          on:click={() => onChoose('occurrence')}
        >
          <div class="font-semibold text-white">Nur dieses Serienelement</div>
          <div class="text-sm text-white/60">Änderungen gelten nur für diesen Termin.</div>
        </button>

        <button
          type="button"
          class="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 transition"
          on:click={() => onChoose('series')}
        >
          <div class="font-semibold text-white">Ganze Serie</div>
          <div class="text-sm text-white/60">Änderungen gelten für alle Termine der Serie.</div>
        </button>

        <button type="button" class="w-full px-4 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition" on:click={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}
