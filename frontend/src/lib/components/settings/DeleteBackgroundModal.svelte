<script lang="ts">
  export let deleteBgFor: string | null;
  export let deletingBg: boolean;
  export let deleteBgError: string | null;

  export let confirmDeleteBg: () => void | Promise<void>;

  function close() {
    if (deletingBg) return;
    deleteBgFor = null;
  }
</script>

{#if deleteBgFor}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="fixed inset-0 z-50 bg-black/60" on:click={close}>
    <div class="min-h-full flex items-center justify-center p-6">
      <div
        class="w-full max-w-md rounded-2xl bg-black/70 border border-white/10 backdrop-blur-md p-5"
        on:click|stopPropagation
      >
        <div class="text-base font-semibold mb-1">Bild löschen?</div>
        <div class="text-sm text-white/70 mb-4 break-all">{deleteBgFor}</div>

        {#if deleteBgError}
          <div class="text-red-400 text-xs mb-3">{deleteBgError}</div>
        {/if}

        <div class="flex justify-end gap-2">
          <button
            class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
            type="button"
            on:click={close}
            disabled={deletingBg}
          >
            Abbrechen
          </button>
          <button
            class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
            type="button"
            on:click={confirmDeleteBg}
            disabled={deletingBg}
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
