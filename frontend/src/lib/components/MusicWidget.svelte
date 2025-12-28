<script lang="ts">
  import { onMount } from 'svelte';
  import {
    edgeFetchJson,
    getEdgeBaseUrlFromStorage,
    getEdgeTokenFromStorage
  } from '$lib/edge';

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

  let loading = false;
  let error: string | null = null;
  let tracks: TrackDto[] = [];
  let total = 0;

  let edgeBaseUrl = '';
  let edgeToken = '';

  async function loadTracks() {
    edgeBaseUrl = getEdgeBaseUrlFromStorage();
    edgeToken = getEdgeTokenFromStorage();

    if (!edgeBaseUrl) {
      error = 'Pi/PC Edge ist nicht konfiguriert.';
      tracks = [];
      total = 0;
      return;
    }

    loading = true;
    error = null;
    try {
      const r = await edgeFetchJson<TracksResponseDto>(edgeBaseUrl, '/api/music/tracks?limit=10&offset=0', edgeToken || undefined);
      if (!r?.ok) throw new Error('Ungültige Antwort vom Edge.');
      tracks = r.items ?? [];
      total = Number(r.total ?? 0);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fehler beim Laden.';
      tracks = [];
      total = 0;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadTracks();
  });
</script>

<div class="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5">
  <div class="flex items-center justify-between mb-3">
    <div class="text-lg font-semibold">Musik</div>
    <button
      class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium disabled:opacity-50"
      on:click={loadTracks}
      disabled={loading}
      type="button"
    >
      Neu laden
    </button>
  </div>

  {#if error}
    <div class="text-white/70 text-sm">
      {error}
      <a class="ml-1 text-white/80 hover:text-white underline" href="/settings#section-edge">Einstellungen</a>
    </div>
  {:else if loading}
    <div class="text-white/60 text-sm">Lade…</div>
  {:else}
    <div class="text-white/60 text-xs mb-2">Tracks: {total}</div>

    {#if tracks.length === 0}
      <div class="text-white/70 text-sm">Keine Tracks gefunden (erst Scan ausführen).</div>
    {:else}
      <div class="space-y-2">
        {#each tracks as t (t.id)}
          <div class="text-sm">
            <div class="font-medium truncate">{t.name}</div>
            <div class="text-white/40 text-xs truncate">{t.relPath}</div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
