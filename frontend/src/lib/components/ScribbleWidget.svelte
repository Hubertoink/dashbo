<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import { fetchScribbles, createScribble, deleteScribble, pinScribble, type ScribbleDto } from '$lib/api';
  import ScribbleModal from './ScribbleModal.svelte';

  /** Compact mode reduces height when many widgets are active */
  export let compact = false;
  export let expanded = false;
  export let onToggleExpand: (() => void) | null = null;
  /** Hide the add button (e.g. in standby) */
  export let showAddButton = true;
  /** Only show latest scribble (for standby mode) */
  export let standbyMode = false;

  let scribbles: ScribbleDto[] = [];
  let loading = true;
  let error: string | null = null;
  let modalOpen = false;
  let viewerOpen = false;
  let viewerScribble: ScribbleDto | null = null;
  let authorName = '';

  const SCRIBBLES_CACHE_KEY = 'dashbo_scribbles_cache_v1';
  const SCRIBBLES_CACHE_TTL_MS = 5 * 60 * 1000;

  async function load(showLoading = true) {
    if (showLoading) loading = true;
    error = null;
    try {
      const r = await fetchScribbles();
      scribbles = r.scribbles;
      cacheScribbles(scribbles);
    } catch (e: any) {
      error = e?.message || 'Fehler beim Laden';
    } finally {
      loading = false;
    }
  }

  function loadFromCache(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(SCRIBBLES_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { at?: number; scribbles?: ScribbleDto[] };
      const at = typeof parsed?.at === 'number' ? parsed.at : 0;
      const isFresh = at > 0 && Date.now() - at <= SCRIBBLES_CACHE_TTL_MS;
      if (!isFresh || !Array.isArray(parsed?.scribbles)) return false;
      scribbles = parsed.scribbles;
      return scribbles.length > 0;
    } catch {
      return false;
    }
  }

  function cacheScribbles(items: ScribbleDto[]) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SCRIBBLES_CACHE_KEY, JSON.stringify({ at: Date.now(), scribbles: items }));
    } catch {
      // ignore
    }
  }

  function getAuthorFromStorage(): string {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('dashbo_scribble_author') ?? '';
  }

  function setAuthorToStorage(name: string) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('dashbo_scribble_author', name);
  }

  onMount(() => {
    loadFromCache();
    authorName = getAuthorFromStorage();
    void load();
  });

  function openModal() {
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
  }

  async function handleSave(e: CustomEvent<{ imageData: string; authorName: string }>) {
    const { imageData, authorName: author } = e.detail;
    try {
      await createScribble({ imageData, authorName: author || undefined });
      if (author) {
        authorName = author;
        setAuthorToStorage(author);
      }
      closeModal();
      await load(false);
    } catch (err: any) {
      error = err?.message || 'Speichern fehlgeschlagen';
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteScribble(id);
      scribbles = scribbles.filter((s) => s.id !== id);
      viewerOpen = false;
      viewerScribble = null;
    } catch (err: any) {
      error = err?.message || 'Löschen fehlgeschlagen';
    }
  }

  async function handlePin(id: number, pinned: boolean) {
    try {
      await pinScribble(id, pinned);
      await load(false);
      // Update viewer to reflect the new pinned state immediately
      if (viewerScribble && viewerScribble.id === id) {
        viewerScribble = scribbles.find((s) => s.id === id) ?? null;
      }
    } catch (err: any) {
      error = err?.message || 'Aktualisierung fehlgeschlagen';
    }
  }

  function openViewer(scribble: ScribbleDto) {
    viewerScribble = scribble;
    viewerOpen = true;
  }

  function closeViewer() {
    viewerOpen = false;
    viewerScribble = null;
  }

  function formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  $: latestScribble = scribbles[0] ?? null;
  $: thumbnails = scribbles.slice(1);
  $: showThumbnails = !compact && thumbnails.length > 0;
</script>

{#if standbyMode}
  <!-- Standby: Show recent scribbles -->
  {#if scribbles.length > 0}
    <div class="scribble-standby" transition:fade={{ duration: 300 }}>
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span class="text-sm font-medium text-white/70">Notizen</span>
      </div>
      <div class="grid grid-cols-2 gap-3">
        {#each scribbles.slice(0, 4) as scribble (scribble.id)}
          <div class="bg-white/5 rounded-xl p-2 backdrop-blur-sm">
            <img
              src={scribble.imageData}
              alt="Notiz"
              class="w-full aspect-[4/3] object-contain rounded-lg"
            />
            {#if scribble.authorName}
              <div class="text-white/50 text-xs mt-1.5 truncate">
                {scribble.authorName}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}
{:else}
  <!-- Dashboard Widget -->
  <div class="scribble-widget rounded-lg bg-white/5 p-3 text-white {compact ? 'pb-2' : ''}" transition:slide={{ duration: 300 }}>
    <!-- Header -->
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span class="text-sm font-medium text-white/80">Notizen</span>
        {#if scribbles.length > 0}
          <span class="text-xs text-white/40">({scribbles.length})</span>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        {#if onToggleExpand}
          <button
            type="button"
            class="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition"
            on:click={onToggleExpand}
            title={expanded ? 'Verkleinern' : 'Vergrößern'}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              {#if expanded}
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 14h6m0 0v6m0-6L3 21M20 10h-6m0 0V4m0 6l7-7" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              {/if}
            </svg>
          </button>
        {/if}
        {#if showAddButton}
          <button
            type="button"
            class="p-1 text-white/40 hover:text-emerald-400 transition"
            on:click={openModal}
            title="Neue Notiz"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Content -->
    {#if loading && scribbles.length === 0}
      <div class="text-white/40 text-sm py-4 text-center">Laden...</div>
    {:else if error && scribbles.length === 0}
      <div class="text-rose-400/80 text-sm py-2">{error}</div>
    {:else if scribbles.length === 0}
      <button
        type="button"
        class="w-full py-6 text-center text-white/40 hover:text-white/60 hover:bg-white/5 rounded-lg transition border border-dashed border-white/10"
        on:click={openModal}
      >
        <svg class="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span class="text-sm">Erste Notiz erstellen</span>
      </button>
    {:else}
      <!-- Latest scribble -->
      <button
        type="button"
        class="w-full text-left hover:bg-white/5 rounded-lg transition p-1 -m-1"
        on:click={() => latestScribble && openViewer(latestScribble)}
      >
        <div class="flex items-start gap-3">
          <img
            src={latestScribble?.imageData}
            alt="Notiz"
            class="w-20 h-14 object-contain rounded-md bg-white/5 flex-shrink-0 {compact ? 'w-16 h-11' : ''}"
          />
          <div class="min-w-0 flex-1 py-0.5">
            {#if latestScribble?.authorName}
              <div class="text-sm font-medium text-white/80 truncate">{latestScribble.authorName}</div>
            {/if}
            <div class="text-xs text-white/40">{formatTime(latestScribble?.createdAt ?? '')}</div>
            {#if latestScribble?.pinned}
              <span class="inline-flex items-center gap-1 text-xs text-amber-400/80 mt-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15z" />
                </svg>
                Angepinnt
              </span>
            {/if}
          </div>
        </div>
      </button>

      <!-- Thumbnails (hidden in compact mode) -->
      {#if showThumbnails && !compact}
        <div class="mt-3 grid grid-cols-4 gap-2" transition:slide={{ duration: 200 }}>
          {#each thumbnails.slice(0, expanded ? 8 : 4) as scribble (scribble.id)}
            <button
              type="button"
              class="aspect-[4/3] rounded-md overflow-hidden bg-white/5 hover:ring-2 hover:ring-white/30 transition"
              on:click={() => openViewer(scribble)}
            >
              <img src={scribble.imageData} alt="" class="w-full h-full object-contain" />
            </button>
          {/each}
          {#if thumbnails.length > (expanded ? 8 : 4)}
            <div class="aspect-[4/3] rounded-md bg-white/5 flex items-center justify-center text-white/40 text-xs">
              +{thumbnails.length - (expanded ? 8 : 4)}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{/if}

<!-- Create Modal -->
<ScribbleModal bind:open={modalOpen} {authorName} on:close={closeModal} on:save={handleSave} />

<!-- Viewer Modal -->
{#if viewerOpen && viewerScribble}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    on:click={closeViewer}
  >
    <div
      class="max-w-lg mx-4 bg-black/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      on:click|stopPropagation
    >
      <div class="p-4">
        <img
          src={viewerScribble.imageData}
          alt="Notiz"
          class="max-w-full max-h-[60vh] rounded-xl mx-auto bg-white/5"
        />
      </div>
      <div class="px-4 pb-4 flex items-center justify-between">
        <div class="text-sm text-white/60">
          {#if viewerScribble.authorName}
            <span class="font-medium text-white/80">{viewerScribble.authorName}</span> ·
          {/if}
          {formatTime(viewerScribble.createdAt)}
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-2 text-white/60 hover:text-amber-400 transition rounded-lg hover:bg-white/10"
            on:click={() => viewerScribble && handlePin(viewerScribble.id, !viewerScribble.pinned)}
            title={viewerScribble.pinned ? 'Nicht mehr anpinnen' : 'Anpinnen'}
          >
            <svg class="w-5 h-5 {viewerScribble.pinned ? 'text-amber-400' : ''}" fill={viewerScribble.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          <button
            type="button"
            class="p-2 text-white/60 hover:text-rose-400 transition rounded-lg hover:bg-white/10"
            on:click={() => viewerScribble && handleDelete(viewerScribble.id)}
            title="Löschen"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            type="button"
            class="p-2 text-white/60 hover:text-white transition rounded-lg hover:bg-white/10"
            on:click={closeViewer}
            title="Schließen"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
