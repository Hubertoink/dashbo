<script lang="ts">
  export let open: boolean;
  export let fileCount: number;

  export let confirmFolderSelection: () => void;
  export let cancelFolderSelection: () => void;
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="fixed inset-0 z-50 bg-black/60" on:click={cancelFolderSelection}>
    <div class="min-h-full flex items-center justify-center p-6">
      <div
        class="w-full max-w-md rounded-2xl bg-black/70 border border-white/10 backdrop-blur-md p-5"
        on:click|stopPropagation
      >
        <div class="text-base font-semibold mb-1">Ordner-Upload übernehmen?</div>
        <div class="text-sm text-white/70 mb-4">
          {fileCount} Datei(en) erkannt. Der Upload läuft anschließend Datei für Datei. Danach bitte auf
          <span class="font-medium">Upload</span> klicken.
        </div>

        <div class="flex items-center justify-end gap-2">
          <button
            class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium"
            type="button"
            on:click={cancelFolderSelection}
          >
            Abbrechen
          </button>
          <button
            class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium"
            type="button"
            on:click={confirmFolderSelection}
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
