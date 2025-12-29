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
</script>

<!-- Hintergründe -->
<div class="bg-white/5 rounded-xl p-4" id="section-background">
  <div class="font-medium mb-3">Hintergrund</div>

  <div class="flex items-center gap-3 mb-3">
    <label class="flex items-center gap-2 text-sm text-white/80">
      <input
        type="checkbox"
        class="rounded bg-white/10 border-0"
        bind:checked={backgroundRotateEnabled}
        disabled={!authed || rotateSaving}
      />
      Zufällig wechseln (alle 10 Minuten)
    </label>
    <button
      class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
      on:click={saveBackgroundRotate}
      disabled={!authed || rotateSaving}
    >
      Speichern
    </button>
  </div>

  {#if rotateError}
    <div class="text-red-400 text-xs mb-2">{rotateError}</div>
  {/if}

  <div class="flex gap-2 mb-3">
    <input
      class="flex-1 text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white file:text-sm file:hover:bg-white/15"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      on:change={(e) => onChooseUploadFilesFrom('files', (e.currentTarget as HTMLInputElement).files)}
      disabled={!authed}
    />

    <button
      class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
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
      class={`h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50 ${
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

  <div class="flex items-center justify-between text-xs text-white/50 mb-2">
    <div>
      {uploadFiles.length > 0
        ? `${uploadFiles.length} Datei(en) ausgewählt`
        : 'Mehrere Bilder oder einen Ordner auswählen (Browser-abhängig)'}
    </div>
    {#if savingBg && uploadTotalLabel}
      <div>{uploadTotalLabel}</div>
    {/if}
  </div>

  {#if savingBg}
    <div class="h-2 rounded-full bg-white/10 overflow-hidden mb-2">
      <div class="h-full bg-white/40" style={`width: ${Math.round(uploadProgress * 100)}%`}></div>
    </div>
  {/if}

  {#if uploadError}
    <div class="text-red-400 text-xs mb-2">{uploadError}</div>
  {/if}

  {#if (settings?.images?.length ?? 0) > 0}
    <div class="grid grid-cols-4 gap-2">
      {#each settings?.images ?? [] as img}
        <div class="relative">
          <button
            class={`w-full aspect-video rounded-lg overflow-hidden border-2 ${
              settings?.background === img ? 'border-white/60' : 'border-transparent'
            } hover:border-white/30`}
            on:click={() => chooseBg(img)}
            disabled={!authed || savingBg || deletingBg}
            aria-label="Hintergrund auswählen"
          >
            <img class="w-full h-full object-cover" src={`/api/media/${img}`} alt={img} />
          </button>

          <button
            type="button"
            class="absolute top-1 right-1 h-7 w-7 rounded-md bg-black/55 hover:bg-black/70 text-white/80 grid place-items-center disabled:opacity-50"
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
  {:else}
    <div class="text-xs text-white/50">Keine Hintergründe hochgeladen.</div>
  {/if}
</div>
