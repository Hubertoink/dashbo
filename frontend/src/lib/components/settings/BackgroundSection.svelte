<script lang="ts">
  import type { SettingsDto } from '$lib/api';

  export let authed: boolean;
  export let settings: SettingsDto | null;

  export let backgroundRotateEnabled: boolean;
  export let rotateSaving: boolean;
  export let rotateError: string | null;
  export let saveBackgroundRotate: () => void | Promise<void>;

  export let uploadFiles: File[];
  export let savingBg: boolean;
  export let uploadProgress: number;
  export let uploadTotalLabel: string | null;
  export let uploadError: string | null;

  export let folderInputEl: HTMLInputElement | null;

  export let onChooseUploadFilesFrom: (source: 'files' | 'folder', files: FileList | null | undefined) => void;
  export let doUpload: () => void | Promise<void>;
  export let chooseBg: (filename: string) => void | Promise<void>;

  export let deletingBg: boolean;
  export let requestDeleteBg: (filename: string) => void;

  // Toast state
  let showSaveSuccess = false;
  let showRotateSaveSuccess = false;

  async function handleChooseBg(filename: string) {
    await chooseBg(filename);
    showSaveSuccess = true;
    setTimeout(() => (showSaveSuccess = false), 2000);
  }

  async function handleSaveRotate() {
    await saveBackgroundRotate();
    if (!rotateError) {
      showRotateSaveSuccess = true;
      setTimeout(() => (showRotateSaveSuccess = false), 2000);
    }
  }

  $: selectedBg = settings?.background ?? null;
  $: images = settings?.images ?? [];
  $: hasImages = images.length > 0;
</script>

<!-- Hintergründe -->
<div class="bg-white/5 rounded-xl p-4" id="section-background">
  <div class="font-medium mb-1">Hintergrund</div>
  <p class="text-xs text-white/50 mb-4">
    Lade Bilder hoch und wähle eines als Hintergrund aus. Du kannst auch den Zufallsmodus aktivieren.
  </p>

  <!-- Zufallsmodus -->
  <div class="bg-white/5 rounded-lg p-3 mb-4">
    <div class="flex items-center justify-between gap-3">
      <div class="flex-1">
        <label class="flex items-center gap-2 text-sm text-white/90 cursor-pointer">
          <input
            type="checkbox"
            class="rounded bg-white/10 border-0 cursor-pointer"
            bind:checked={backgroundRotateEnabled}
            disabled={!authed || rotateSaving}
          />
          Zufälliger Wechsel
        </label>
        <p class="text-xs text-white/50 mt-1 ml-6">
          {#if backgroundRotateEnabled}
            Das Hintergrundbild wechselt automatisch alle 10 Minuten zufällig.
          {:else}
            Das ausgewählte Bild wird dauerhaft als Hintergrund verwendet.
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-2">
        {#if showRotateSaveSuccess}
          <span class="text-xs text-emerald-400 flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Gespeichert
          </span>
        {/if}
        <button
          class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50 transition-colors"
          on:click={handleSaveRotate}
          disabled={!authed || rotateSaving}
        >
          {rotateSaving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>
    </div>
    {#if rotateError}
      <div class="text-red-400 text-xs mt-2">{rotateError}</div>
    {/if}
  </div>

  <!-- Upload-Bereich -->
  <div class="mb-4">
    <div class="text-xs text-white/70 font-medium mb-2">Bilder hochladen</div>
    <div class="flex gap-2">
      <input
        class="flex-1 text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:text-sm file:hover:bg-white/15 file:cursor-pointer"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        on:change={(e) => onChooseUploadFilesFrom('files', (e.currentTarget as HTMLInputElement).files)}
        disabled={!authed}
      />

      <button
        class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50 transition-colors"
        type="button"
        on:click={() => folderInputEl?.click()}
        disabled={!authed}
      >
        Ordner
      </button>

      <input
        class="hidden"
        bind:this={folderInputEl}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        webkitdirectory
        on:change={(e) => onChooseUploadFilesFrom('folder', (e.currentTarget as HTMLInputElement).files)}
        disabled={!authed}
      />

      <button
        class={`h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${
          uploadFiles.length > 0 && !savingBg
            ? 'bg-emerald-500/30 hover:bg-emerald-500/40'
            : 'bg-white/20 hover:bg-white/25'
        }`}
        on:click={doUpload}
        disabled={!authed || uploadFiles.length === 0 || savingBg}
      >
        Upload
      </button>
    </div>

    <div class="flex items-center justify-between text-xs text-white/50 mt-2">
      <div>
        {uploadFiles.length > 0
          ? `${uploadFiles.length} Datei(en) ausgewählt`
          : 'Einzelne Bilder oder einen Ordner auswählen'}
      </div>
      {#if savingBg && uploadTotalLabel}
        <div>{uploadTotalLabel}</div>
      {/if}
    </div>

    {#if savingBg}
      <div class="h-2 rounded-full bg-white/10 overflow-hidden mt-2">
        <div class="h-full bg-white/40 transition-all" style={`width: ${Math.round(uploadProgress * 100)}%`}></div>
      </div>
    {/if}

    {#if uploadError}
      <div class="text-red-400 text-xs mt-2">{uploadError}</div>
    {/if}
  </div>

  <!-- Bildergalerie -->
  {#if hasImages}
    <div class="mb-2 flex items-center justify-between">
      <div class="text-xs text-white/70 font-medium">
        {#if backgroundRotateEnabled}
          Verfügbare Bilder ({images.length}) – wird zufällig gewählt
        {:else}
          Bild auswählen ({images.length})
        {/if}
      </div>
      {#if showSaveSuccess}
        <span class="text-xs text-emerald-400 flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Hintergrund gespeichert
        </span>
      {/if}
    </div>

    <div class="grid grid-cols-4 gap-2">
      {#each images as img}
        {@const isSelected = !backgroundRotateEnabled && selectedBg === img}
        <div class="relative group">
          <button
            class={`w-full aspect-video rounded-lg overflow-hidden border-2 transition-all ${
              isSelected
                ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                : 'border-transparent hover:border-white/30'
            }`}
            on:click={() => handleChooseBg(img)}
            disabled={!authed || savingBg || deletingBg}
            aria-label="Hintergrund auswählen"
          >
            <img class="w-full h-full object-cover" src={`/api/media/${img}`} alt={img} />
            
            <!-- Overlay für ausgewähltes Bild -->
            {#if isSelected}
              <div class="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                <div class="bg-emerald-500 rounded-full p-1.5">
                  <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            {/if}
          </button>

          <!-- Delete-Button -->
          <button
            type="button"
            class="absolute top-1 right-1 h-7 w-7 rounded-md bg-black/55 hover:bg-black/70 text-white/80 grid place-items-center disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Bild löschen"
            on:click|stopPropagation={() => requestDeleteBg(img)}
            disabled={!authed || savingBg || deletingBg}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        </div>
      {/each}
    </div>

    {#if backgroundRotateEnabled}
      <p class="text-xs text-white/40 mt-3 text-center">
        Im Zufallsmodus wird kein einzelnes Bild als "ausgewählt" markiert.
      </p>
    {/if}
  {:else}
    <div class="text-xs text-white/50 py-4 text-center border border-dashed border-white/10 rounded-lg">
      Noch keine Hintergründe hochgeladen.
    </div>
  {/if}
</div>
