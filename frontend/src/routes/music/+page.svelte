<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getStoredToken } from '$lib/api';
  import {
    edgeFetchJson,
    getEdgeBaseUrlFromStorage,
    getEdgeTokenFromStorage
  } from '$lib/edge';

  type EdgeMusicStatusDto = {
    ok: boolean;
    scanning: boolean;
    lastScanAt: string | null;
    lastError: string | null;
    libraryPath: string;
    counts: { tracks: number; albums: number };
  };

  type TrackDto = {
    id: string;
    relPath: string;
    name: string;
    ext: string;
    size: number;
    mtimeMs: number;
  };

  type TracksResponseDto = {
    ok: boolean;
    total: number;
    offset: number;
    limit: number;
    items: TrackDto[];
  };

  let edgeBaseUrl = '';
  let edgeToken = '';

  let status: EdgeMusicStatusDto | null = null;
  let tracks: TrackDto[] = [];
  let total = 0;

  let loading = false;
  let scanning = false;
  let error: string | null = null;

  async function loadAll() {
    edgeBaseUrl = getEdgeBaseUrlFromStorage();
    edgeToken = getEdgeTokenFromStorage();

    if (!edgeBaseUrl) {
      error = 'Pi/PC Edge ist nicht konfiguriert.';
      status = null;
      tracks = [];
      total = 0;
      return;
    }

    loading = true;
    error = null;

    try {
      const s = await edgeFetchJson<EdgeMusicStatusDto>(edgeBaseUrl, '/api/music/status', edgeToken || undefined);
      status = s;

      const r = await edgeFetchJson<TracksResponseDto>(edgeBaseUrl, '/api/music/tracks?limit=50&offset=0', edgeToken || undefined);
      tracks = r.items ?? [];
      total = Number(r.total ?? 0);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fehler beim Laden.';
      status = null;
      tracks = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  async function startScan() {
    if (!edgeBaseUrl) return;
    scanning = true;
    error = null;

    try {
      await edgeFetchJson(edgeBaseUrl, '/api/music/scan', edgeToken || undefined, { method: 'POST' });
      await loadAll();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Scan fehlgeschlagen.';
    } finally {
      scanning = false;
    }
  }

  onMount(() => {
    if (!getStoredToken()) {
      void goto('/login');
      return;
    }

    void loadAll();
  });
</script>

<div class="min-h-screen bg-zinc-950 text-white">
  <div class="max-w-3xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-8">
      <h1 class="text-3xl font-bold">Musik</h1>
      <div class="flex items-center gap-3">
        <a class="text-white/60 hover:text-white text-sm" href="/">← Zurück</a>
        <a class="text-white/60 hover:text-white text-sm" href="/settings#section-edge">Edge Einstellungen</a>
      </div>
    </div>

    <div class="bg-white/5 rounded-xl p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-medium">Library</div>
          <div class="text-white/50 text-xs">Edge: {edgeBaseUrl || '—'}</div>
        </div>
        <div class="flex gap-2">
          <button
            class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
            type="button"
            on:click={loadAll}
            disabled={loading || scanning}
          >
            Neu laden
          </button>
          <button
            class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
            type="button"
            on:click={startScan}
            disabled={loading || scanning || !edgeBaseUrl}
          >
            Scan starten
          </button>
        </div>
      </div>

      {#if error}
        <div class="text-red-300 text-sm mt-3">{error}</div>
      {/if}

      {#if status}
        <div class="grid md:grid-cols-3 gap-3 mt-4 text-sm">
          <div class="bg-white/5 rounded-lg p-3">
            <div class="text-white/50 text-xs">Status</div>
            <div class="mt-1">{status.scanning ? 'Scanning…' : 'Idle'}</div>
          </div>
          <div class="bg-white/5 rounded-lg p-3">
            <div class="text-white/50 text-xs">Tracks</div>
            <div class="mt-1">{status.counts?.tracks ?? 0}</div>
          </div>
          <div class="bg-white/5 rounded-lg p-3">
            <div class="text-white/50 text-xs">Last Scan</div>
            <div class="mt-1">{status.lastScanAt ? new Date(status.lastScanAt).toLocaleString() : '—'}</div>
          </div>
        </div>

        {#if status.lastError}
          <div class="text-red-300 text-xs mt-2">{status.lastError}</div>
        {/if}
      {/if}

      <div class="mt-6">
        <div class="text-white/60 text-xs mb-2">Angezeigt: {tracks.length} / {total}</div>

        {#if loading}
          <div class="text-white/60 text-sm">Lade…</div>
        {:else if tracks.length === 0}
          <div class="text-white/70 text-sm">Keine Tracks gefunden (erst Scan ausführen).</div>
        {:else}
          <div class="space-y-2">
            {#each tracks as t (t.id)}
              <div class="bg-white/5 rounded-lg p-3">
                <div class="font-medium truncate">{t.name}</div>
                <div class="text-white/40 text-xs truncate">{t.relPath}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
