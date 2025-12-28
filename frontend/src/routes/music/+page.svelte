<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getStoredToken } from '$lib/api';
  import {
    edgeFetchJson,
    getEdgeBaseUrlFromStorage,
    getEdgeTokenFromStorage,
    normalizeEdgeBaseUrl
  } from '$lib/edge';
  import { playAlbum, playTrack, type NowPlayingTrack } from '$lib/stores/musicPlayer';

  type EdgeMusicStatusDto = {
    ok: boolean;
    scanning: boolean;
    lastScanAt: string | null;
    lastError: string | null;
    libraryPath: string;
    counts: { tracks: number; albums: number };
  };

  type AlbumListItem = {
    id: string;
    artist: string;
    album: string;
    year?: number | null;
    coverRelPath?: string | null;
    trackCount?: number;
  };

  type AlbumDetails = {
    id: string;
    artist: string;
    album: string;
    coverRelPath?: string | null;
    tracks: Array<{
      id: string;
      title: string;
      artist: string;
      album: string;
      trackNo?: number | null;
      durationSec?: number | null;
    }>;
  };

  let edgeBaseUrl = '';
  let edgeToken = '';

  let status: EdgeMusicStatusDto | null = null;
  let albums: AlbumListItem[] = [];

  let loading = false;
  let error: string | null = null;

  let q = '';
  let letter = 'All';
  const letters = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'];

  let selected: AlbumDetails | null = null;
  let modalOpen = false;
  let modalLoading = false;
  let modalError: string | null = null;

  let qTimer: any;
  let mounted = false;

  function base(): string {
    return normalizeEdgeBaseUrl(edgeBaseUrl);
  }

  function coverUrl(albumId: string): string | null {
    const b = base();
    if (!b) return null;
    const qs = edgeToken ? `?token=${encodeURIComponent(edgeToken)}` : '';
    return `${b}/api/music/albums/${encodeURIComponent(albumId)}/cover${qs}`;
  }

  async function loadStatusAndAlbums() {
    edgeBaseUrl = getEdgeBaseUrlFromStorage();
    edgeToken = getEdgeTokenFromStorage();

    if (!edgeBaseUrl) {
      error = 'Pi/PC Edge ist nicht konfiguriert.';
      status = null;
      albums = [];
      return;
    }

    loading = true;
    error = null;

    try {
      status = await edgeFetchJson<EdgeMusicStatusDto>(edgeBaseUrl, '/api/music/status', edgeToken || undefined);

      const params = new URLSearchParams();
      params.set('limit', '200');
      if (q.trim()) params.set('q', q.trim());
      if (letter !== 'All') params.set('letter', letter);

      const data = await edgeFetchJson<{ ok: boolean; total: number; items: AlbumListItem[] }>(
        edgeBaseUrl,
        `/api/music/albums?${params.toString()}`,
        edgeToken || undefined
      );

      albums = data.items ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fehler beim Laden.';
      status = null;
      albums = [];
    } finally {
      loading = false;
    }
  }

  async function scan() {
    if (!edgeBaseUrl) return;
    loading = true;
    error = null;

    try {
      await edgeFetchJson(edgeBaseUrl, '/api/music/scan', edgeToken || undefined, { method: 'POST' });
      await loadStatusAndAlbums();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Scan fehlgeschlagen.';
    } finally {
      loading = false;
    }
  }

  async function openAlbum(albumId: string) {
    if (!edgeBaseUrl) return;

    modalOpen = true;
    modalLoading = true;
    modalError = null;
    selected = null;

    try {
      const r = await edgeFetchJson<{ ok: boolean; album: AlbumDetails }>(
        edgeBaseUrl,
        `/api/music/albums/${encodeURIComponent(albumId)}`,
        edgeToken || undefined
      );
      selected = r?.album ?? null;
    } catch (err) {
      modalError = err instanceof Error ? err.message : 'Album konnte nicht geladen werden.';
    } finally {
      modalLoading = false;
    }
  }

  function closeModal() {
    modalOpen = false;
    modalLoading = false;
    modalError = null;
    selected = null;
  }

  function playSelectedAlbum() {
    if (!selected) return;
    const cover = coverUrl(selected.id);
    const queue: NowPlayingTrack[] = (selected.tracks ?? []).map((t) => ({
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: cover
    }));

    if (queue.length === 0) return;
    playAlbum(queue, 0);
    closeModal();
    void goto('/');
  }

  function playSelectedTrack(trackId: string) {
    if (!selected) return;
    const t = (selected.tracks ?? []).find((x) => x.id === trackId);
    if (!t) return;

    playTrack({
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverUrl: coverUrl(selected.id)
    });
    closeModal();
    void goto('/');
  }

  onMount(() => {
    if (!getStoredToken()) {
      void goto('/login');
      return;
    }

    mounted = true;
    void loadStatusAndAlbums();
  });

  onDestroy(() => {
    clearTimeout(qTimer);
  });

  $: if (mounted) {
    // Only re-query when search/filter changes (debounced)
    const _key = `${q}\n${letter}`;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      void loadStatusAndAlbums();
    }, 250);
  }
</script>

<div class="mx-auto max-w-6xl p-6">
  <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div class="flex items-center gap-3">
      <button class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm" on:click={() => goto('/')}>Zurück</button>
      <div>
        <h1 class="text-xl font-semibold">Musik</h1>
        {#if status}
          <div class="mt-1 text-xs text-white/60">
            {status.counts?.albums ?? 0} Alben · {status.counts?.tracks ?? 0} Tracks
          </div>
        {/if}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input
        class="h-10 w-64 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
        placeholder="Suchen (Artist/Album)"
        bind:value={q}
      />
      <button class="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm hover:bg-white/10" on:click={scan} disabled={loading}>
        Scan starten
      </button>
      <button
        class="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm hover:bg-white/10"
        on:click={loadStatusAndAlbums}
        disabled={loading}
      >
        Neu laden
      </button>
    </div>
  </div>

  <div class="mt-3 flex flex-wrap gap-1">
    {#each letters as l}
      <button
        class={
          'h-8 rounded-md border px-2 text-xs ' +
          (letter === l
            ? 'border-white/20 bg-white/10 text-white'
            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10')
        }
        on:click={() => (letter = l)}
      >
        {l}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="mt-4 rounded-lg border border-red-200/20 bg-red-500/10 p-3 text-sm text-red-100">
      {error}
      <a class="ml-2 underline text-red-100/90 hover:text-red-50" href="/settings#section-edge">Einstellungen</a>
    </div>
  {/if}

  <div class="mt-6">
    {#if loading}
      <div class="text-sm text-white/60">Lade…</div>
    {:else if albums.length === 0}
      <div class="text-sm text-white/60">Keine Alben gefunden.</div>
    {:else}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {#each albums as a (a.id)}
          <button class="group text-left" on:click={() => openAlbum(a.id)} aria-label={`Album öffnen: ${a.artist} - ${a.album}`}>
            <div class="aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5">
              {#if coverUrl(a.id)}
                <img src={coverUrl(a.id) ?? ''} alt="" class="h-full w-full object-cover" loading="lazy" />
              {/if}
            </div>
            <div class="mt-2 min-w-0">
              <div class="text-xs text-white/90 line-clamp-1">{a.album}</div>
              <div class="text-[11px] text-white/60 line-clamp-1">{a.artist}</div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if modalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button class="absolute inset-0 bg-black/60" on:click={closeModal} aria-label="Schließen"></button>
      <div class="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur">
        <div class="flex items-start gap-4">
          <div class="h-24 w-24 overflow-hidden rounded-xl border border-white/10 bg-white/5">
            {#if selected}
              {#if coverUrl(selected.id)}
                <img src={coverUrl(selected.id) ?? ''} alt="" class="h-full w-full object-cover" />
              {/if}
            {/if}
          </div>

          <div class="min-w-0 flex-1">
            {#if modalLoading}
              <div class="text-sm text-white/70">Lade Album…</div>
            {:else if modalError}
              <div class="text-sm text-red-100">{modalError}</div>
            {:else if selected}
              <div class="text-sm font-semibold text-white line-clamp-1">{selected.album}</div>
              <div class="text-xs text-white/60 line-clamp-1">{selected.artist}</div>
              <div class="mt-3 flex gap-2">
                <button class="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm hover:bg-white/10" on:click={playSelectedAlbum}>
                  Album abspielen
                </button>
                <button class="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm hover:bg-white/10" on:click={closeModal}>
                  Schließen
                </button>
              </div>
            {/if}
          </div>
        </div>

        {#if selected}
          <div class="mt-4 max-h-[60vh] overflow-auto rounded-xl border border-white/10">
            <ul class="divide-y divide-white/10">
              {#each selected.tracks as t (t.id)}
                <li class="flex items-center justify-between gap-3 p-3">
                  <div class="min-w-0">
                    <div class="text-sm text-white/90 line-clamp-1">
                      {#if t.trackNo}{t.trackNo}. {/if}{t.title}
                    </div>
                    <div class="text-xs text-white/50 line-clamp-1">{t.artist}</div>
                  </div>
                  <button
                    class="h-8 shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 text-xs hover:bg-white/10"
                    on:click={() => playSelectedTrack(t.id)}
                  >
                    Play
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
