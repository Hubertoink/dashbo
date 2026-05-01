<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { heosPlaybackStatus, type HeosPlayerPlaybackSummary } from '$lib/stores/heosPlayback';
  import { spotifyPlaybackStatus } from '$lib/stores/spotifyPlayback';
  import {
    EDGE_BASE_URL_KEY,
    EDGE_TOKEN_KEY,
    EDGE_HEOS_ENABLED_KEY,
    EDGE_HEOS_SELECTED_PLAYER_ID_KEY,
    EDGE_HEOS_HOSTS_KEY,
    EDGE_HEOS_SELECTED_PLAYER_NAME_KEY,
    edgeFetchJson,
    normalizeEdgeBaseUrl
  } from '$lib/edge';

  export let tone: 'light' | 'dark' = 'light';
  export let variant: 'card' | 'launcher' = 'card';

  type HeosPlayerDto = { pid: number; name: string; model?: string | null };

  let heosEnabled = false;
  let edgeBaseUrl = '';
  let edgeToken = '';
  let heosHosts = '';
  let selectedPid = '';
  let selectedName = '';

  let speakerOpen = false;
  let speakersBusy = false;
  let speakersError: string | null = null;
  let speakers: HeosPlayerDto[] = [];
  let heosStatusLine: string | null = null;

  let heosVolumeBusy = false;
  let heosVolumeError: string | null = null;
  let heosVolumeLevel: number | null = null;

  $: heosPlayerSummaries = $heosPlaybackStatus?.players ?? [];
  $: selectedSummary = summaryForPid(selectedPid);
  $: activeSummary = heosPlayerSummaries.find((summary) => summary.isActive) ?? null;
  $: watchedSummary = selectedSummary?.isActive ? selectedSummary : activeSummary ?? selectedSummary ?? null;
  $: watchedPid = watchedSummary?.pid ?? (selectedPid ? Number(selectedPid) : null);
  $: watchedName = watchedSummary?.name || selectedName || (watchedPid ? `Speaker ${watchedPid}` : '');

  $: heosActive = Boolean(heosEnabled && watchedSummary?.isActive);
  $: spotifyActive = Boolean($spotifyPlaybackStatus?.enabled && $spotifyPlaybackStatus?.active);
  $: nowPlayingActive = heosActive || spotifyActive;
  $: isPlayingForUi = heosActive ? Boolean(watchedSummary?.isPlaying) : Boolean($spotifyPlaybackStatus?.isPlaying);

  $: displayImageUrl =
    (heosActive ? cleanMeta(watchedSummary?.imageUrl) : '') || (spotifyActive ? cleanMeta($spotifyPlaybackStatus?.imageUrl) : '');
  $: displayTitle = heosActive
    ? cleanMeta(watchedSummary?.title) || cleanMeta(watchedSummary?.album) || 'Wiedergabe aktiv'
    : spotifyActive
      ? cleanMeta($spotifyPlaybackStatus?.title) || cleanMeta($spotifyPlaybackStatus?.album) || 'Wiedergabe aktiv'
      : 'Keine Wiedergabe';
  $: displayArtist = heosActive
    ? cleanMeta(watchedSummary?.artist) || cleanMeta(watchedSummary?.source) || watchedName || 'Musik'
    : spotifyActive
      ? cleanMeta($spotifyPlaybackStatus?.artist) || cleanMeta($spotifyPlaybackStatus?.source) || 'Spotify'
      : heosEnabled
        ? watchedName || 'HEOS'
        : 'Musik';
  $: displayAlbum = heosActive
    ? cleanMeta(watchedSummary?.album)
    : spotifyActive
      ? cleanMeta($spotifyPlaybackStatus?.album)
      : '';
  $: sourceLabel = heosActive
    ? cleanMeta(watchedSummary?.source) || 'HEOS'
    : spotifyActive
      ? cleanMeta($spotifyPlaybackStatus?.source) || 'Spotify'
      : heosEnabled
        ? 'HEOS'
        : 'Aus';
  $: statusLabel = nowPlayingActive ? (isPlayingForUi ? 'Live' : 'Pause') : 'Still';

  function cleanMeta(raw: unknown): string {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    const lower = value.toLowerCase();
    if (lower === 'url stream' || lower === 'stream' || lower === 'unknown' || lower === 'unknown artist' || lower === 'unknown title') return '';
    return value;
  }

  function summaryForPid(pid: number | string | null | undefined): HeosPlayerPlaybackSummary | null {
    const n = Number(pid);
    if (!Number.isFinite(n) || n === 0) return null;
    return heosPlayerSummaries.find((summary) => summary.pid === n) ?? null;
  }

  function heosStateLabel(summary: HeosPlayerPlaybackSummary | null): string {
    if (!summary) return 'Bereit';
    if (summary.error) return 'Fehler';
    if (summary.isPlaying) return 'Live';
    if (summary.isActive) return 'Pause';
    return 'Still';
  }

  function heosStateClass(summary: HeosPlayerPlaybackSummary | null): string {
    if (!summary) return 'bg-white/10 text-white/45';
    if (summary.error) return 'bg-red-500/15 text-red-200';
    if (summary.isPlaying) return 'bg-emerald-400/15 text-emerald-100';
    if (summary.isActive) return 'bg-amber-400/15 text-amber-100';
    return 'bg-white/10 text-white/45';
  }

  function heosTitleLine(summary: HeosPlayerPlaybackSummary | null, fallback: string): string {
    if (!summary) return fallback;
    if (summary.error) return summary.error;
    if (summary.isActive) return cleanMeta(summary.title) || cleanMeta(summary.album) || cleanMeta(summary.source) || 'Wiedergabe aktiv';
    return fallback;
  }

  function heosMetaLine(summary: HeosPlayerPlaybackSummary | null, fallback: string): string {
    if (!summary || summary.error) return fallback;
    if (!summary.isActive) return fallback;
    const parts = [cleanMeta(summary.artist), cleanMeta(summary.source)].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : fallback;
  }

  function loadHeosConfig() {
    if (typeof localStorage === 'undefined') return;
    heosEnabled = localStorage.getItem(EDGE_HEOS_ENABLED_KEY) === '1';
    edgeBaseUrl = localStorage.getItem(EDGE_BASE_URL_KEY) ?? '';
    edgeToken = localStorage.getItem(EDGE_TOKEN_KEY) ?? '';
    heosHosts = localStorage.getItem(EDGE_HEOS_HOSTS_KEY) ?? '';
    selectedPid = localStorage.getItem(EDGE_HEOS_SELECTED_PLAYER_ID_KEY) ?? '';
    selectedName = localStorage.getItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY) ?? '';
  }

  function fmtIsoShort(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  function heosHeaders(): Record<string, string> {
    return heosHosts.trim() ? { 'X-HEOS-HOSTS': heosHosts.trim() } : {};
  }

  async function fetchSpeakers(opts?: { force?: boolean }) {
    speakersError = null;
    heosStatusLine = null;
    speakersBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');

      const force = Boolean(opts?.force);
      const path = force ? '/api/heos/scan?force=1' : '/api/heos/players';
      const r = await edgeFetchJson<any>(
        base,
        path,
        edgeToken || undefined,
        force ? { method: 'POST', headers: heosHeaders() } : { headers: heosHeaders() }
      );
      speakers = Array.isArray(r?.players) ? r.players : [];

      if (selectedPid) {
        const n = Number(selectedPid);
        const match = speakers.find((player) => Number(player.pid) === n);
        if (match?.name && typeof localStorage !== 'undefined') {
          selectedName = String(match.name);
          localStorage.setItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY, selectedName);
        }
      }

      const count = speakers.length;
      const scannedAt = fmtIsoShort(r?.lastScanAt);
      const err = typeof r?.lastError === 'string' && r.lastError ? r.lastError : '';
      heosStatusLine = err ? `Fehler: ${err}` : scannedAt ? `${count} Speaker · ${scannedAt}` : `${count} Speaker`;
    } catch (err) {
      speakersError = err instanceof Error ? err.message : 'Speaker konnten nicht geladen werden.';
      speakers = [];
    } finally {
      speakersBusy = false;
    }
  }

  function persistSelectedPid(pid: string, nameOverride?: string) {
    try {
      if (typeof localStorage === 'undefined') return;
      const n = Number(pid);
      if (!pid || !Number.isFinite(n) || n === 0) {
        localStorage.removeItem(EDGE_HEOS_SELECTED_PLAYER_ID_KEY);
        localStorage.removeItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY);
        selectedPid = '';
        selectedName = '';
        return;
      }

      selectedPid = String(n);
      localStorage.setItem(EDGE_HEOS_SELECTED_PLAYER_ID_KEY, selectedPid);
      const matchName = nameOverride || speakers.find((speaker) => speaker.pid === n)?.name || '';
      selectedName = matchName;
      if (matchName) localStorage.setItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY, matchName);
      else localStorage.removeItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY);
    } catch {
      // ignore storage errors
    }
  }

  async function fetchVolumeForCurrent() {
    heosVolumeError = null;
    heosVolumeLevel = null;
    const pid = Number(watchedPid);
    if (!Number.isFinite(pid) || pid === 0) return;

    heosVolumeBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');
      const r = await edgeFetchJson<any>(base, `/api/heos/volume?pid=${encodeURIComponent(String(pid))}`, edgeToken || undefined, {
        headers: heosHeaders()
      });
      const level = Number.isFinite(Number(r?.level)) ? Number(r.level) : Number(r?.response?.heos?.message?.parsed?.level);
      if (Number.isFinite(level)) heosVolumeLevel = Math.max(0, Math.min(100, Math.round(level)));
    } catch (err) {
      heosVolumeError = err instanceof Error ? err.message : 'Lautstärke konnte nicht geladen werden.';
    } finally {
      heosVolumeBusy = false;
    }
  }

  async function setVolumeForCurrent(level: number) {
    heosVolumeError = null;
    const pid = Number(watchedPid);
    if (!Number.isFinite(pid) || pid === 0) return;

    heosVolumeBusy = true;
    try {
      const base = normalizeEdgeBaseUrl(edgeBaseUrl);
      if (!base) throw new Error('Edge Base URL fehlt');
      const r = await edgeFetchJson<any>(base, '/api/heos/volume', edgeToken || undefined, {
        method: 'POST',
        headers: { ...heosHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, level })
      });
      const applied = Number.isFinite(Number(r?.level)) ? Number(r.level) : Number(level);
      heosVolumeLevel = Math.max(0, Math.min(100, Math.round(applied)));
    } catch (err) {
      heosVolumeError = err instanceof Error ? err.message : 'Lautstärke konnte nicht gesetzt werden.';
    } finally {
      heosVolumeBusy = false;
    }
  }

  async function adjustVolumeForCurrent(delta: number) {
    const current = Number.isFinite(Number(heosVolumeLevel)) ? Number(heosVolumeLevel) : 0;
    await setVolumeForCurrent(Math.max(0, Math.min(100, Math.round(current + delta))));
  }

  async function toggleSpeakerPicker() {
    loadHeosConfig();
    speakerOpen = !speakerOpen;
    if (speakerOpen && speakers.length === 0 && !speakersBusy) await fetchSpeakers({ force: true });
    if (speakerOpen) await fetchVolumeForCurrent();
  }

  function closeSpeakerModal() {
    speakerOpen = false;
  }

  function handleSpeakerKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeSpeakerModal();
  }

  onMount(() => {
    loadHeosConfig();
  });
</script>

{#if variant === 'launcher'}
  {#if heosEnabled}
    <button
      type="button"
      class={`h-10 w-10 shrink-0 flex items-center justify-center rounded-full backdrop-blur-sm active:scale-95 transition-all duration-200 ${
        tone === 'dark'
          ? 'border border-black/20 bg-black/10 text-emerald-700 hover:bg-black/15 hover:text-emerald-800'
          : 'border border-white/15 bg-white/8 text-emerald-300/90 hover:bg-white/15 hover:text-emerald-200'
      }`}
      on:click={toggleSpeakerPicker}
      aria-label="HEOS Anzeige öffnen"
      title="HEOS Anzeige"
    >
      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M4 10v4c0 1.1.9 2 2 2h2l5 4V4L8 8H6c-1.1 0-2 .9-2 2zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
    </button>
  {/if}
{:else}
  <div class="relative min-h-[112px] overflow-hidden rounded-lg border border-white/10 bg-black/45 text-white shadow-lg shadow-black/20 backdrop-blur-md">
    {#if displayImageUrl}
      <img src={displayImageUrl} alt="" class="absolute inset-0 h-full w-full object-cover opacity-28 blur-sm scale-105" loading="lazy" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/45"></div>
    {:else}
      <div class="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black"></div>
    {/if}

    <div class="relative flex h-full min-h-[112px] items-center gap-3 p-3">
      <div class="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/10 shadow-md shadow-black/25">
        {#if displayImageUrl}
          <img src={displayImageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
        {:else}
          <div class="flex h-full w-full items-center justify-center bg-white/5">
            <svg viewBox="0 0 24 24" class="h-8 w-8 text-white/25" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        {/if}
      </div>

      <div class="min-w-0 flex-1 self-stretch py-1">
        <div class="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/50">
          <span class={`h-1.5 w-1.5 rounded-full ${nowPlayingActive ? 'bg-emerald-300' : 'bg-white/30'}`}></span>
          <span>{statusLabel}</span>
          <span class="text-white/25">·</span>
          <span class="truncate">{sourceLabel}</span>
          {#if watchedName}
            <span class="hidden min-w-0 truncate text-white/35 sm:inline">{watchedName}</span>
          {/if}
        </div>

        <div class="truncate text-base font-semibold leading-tight text-white">{displayArtist}</div>
        <div class="mt-0.5 line-clamp-2 text-sm leading-snug text-white/70">{displayTitle}</div>
        {#if displayAlbum && displayAlbum !== displayTitle}
          <div class="mt-1 truncate text-[11px] text-white/40">{displayAlbum}</div>
        {/if}
        {#if heosEnabled && $heosPlaybackStatus?.error}
          <div class="mt-1 truncate text-[11px] text-red-200">{$heosPlaybackStatus.error}</div>
        {/if}
      </div>

      <div class="flex shrink-0 flex-col items-center gap-1 self-stretch py-1">
        {#if heosEnabled}
          <button
            type="button"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/75 transition hover:bg-white/20 hover:text-white"
            on:click={toggleSpeakerPicker}
            aria-label="HEOS Speaker wählen"
            title="HEOS Speaker wählen"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M4 10v4c0 1.1.9 2 2 2h2l5 4V4L8 8H6c-1.1 0-2 .9-2 2zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<svelte:window on:keydown={speakerOpen ? handleSpeakerKeydown : undefined} />

{#if heosEnabled && speakerOpen}
  <div class="fixed inset-0 z-[120] flex" role="dialog" aria-modal="true" aria-label="HEOS Speaker">
    <button
      type="button"
      class={`absolute inset-0 backdrop-blur-sm ${tone === 'dark' ? 'bg-black/35' : 'bg-black/60'}`}
      aria-label="Schließen"
      on:click={closeSpeakerModal}
      transition:fade={{ duration: 180 }}
    ></button>

    <div
      class="relative flex h-full w-[420px] max-w-[90vw] flex-col overflow-hidden border-r border-white/10 bg-zinc-950/[.97] text-white shadow-2xl shadow-black/30 backdrop-blur-xl"
      transition:fly={{ x: -420, duration: 300, easing: cubicOut }}
    >
      <div class="shrink-0 px-5 pb-3 pt-5">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h3 class="truncate text-base font-semibold leading-tight">HEOS Anzeige</h3>
            <div class="mt-0.5 truncate text-[11px] text-white/45">{watchedName || 'Automatisch'}</div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/65 transition hover:bg-white/15 hover:text-white disabled:opacity-50"
              title="Aktualisieren"
              aria-label="Aktualisieren"
              disabled={speakersBusy}
              on:click={async () => {
                await fetchSpeakers({ force: true });
                await fetchVolumeForCurrent();
              }}
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4 {speakersBusy ? 'animate-spin' : ''}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
            <button
              type="button"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/65 transition hover:bg-white/15 hover:text-white"
              aria-label="Schließen"
              on:click={closeSpeakerModal}
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
        {#if heosStatusLine}
          <div class="mt-3 text-[11px] text-white/45">{heosStatusLine}</div>
        {/if}
      </div>

      <div class="h-px shrink-0 bg-white/10"></div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {#if speakersBusy}
          <div class="text-xs text-white/60">Lade...</div>
        {:else if speakersError}
          <div class="text-xs text-red-200">{speakersError}</div>
        {:else}
          <div class="overflow-hidden rounded-lg border border-white/10 bg-white/5">
            <button
              type="button"
              class={`w-full px-4 py-3 text-left text-sm transition hover:bg-white/10 ${!selectedPid ? 'bg-white/10' : ''}`}
              on:click={() => {
                persistSelectedPid('');
                void fetchVolumeForCurrent();
              }}
            >
              <div class="font-medium">Automatisch</div>
              <div class="mt-0.5 truncate text-[11px] text-white/45">Aktive Wiedergabe im HEOS-System</div>
            </button>

            {#each speakers as speaker, index (speaker.pid)}
              {@const summary = summaryForPid(speaker.pid)}
              <button
                type="button"
                class={`w-full border-t border-white/10 px-4 py-3 text-left text-sm transition hover:bg-white/10 ${selectedPid === String(speaker.pid) ? 'bg-cyan-400/10 text-cyan-100' : ''}`}
                style="animation: speakerCardIn {160 + index * 35}ms {index * 25}ms both cubic-bezier(.22,1,.36,1)"
                on:click={() => {
                  persistSelectedPid(String(speaker.pid), speaker.name);
                  void fetchVolumeForCurrent();
                }}
              >
                <div class="flex items-center gap-3">
                  <div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/10">
                    {#if summary?.imageUrl}
                      <img src={summary.imageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                    {:else}
                      <div class="flex h-full w-full items-center justify-center">
                        <svg viewBox="0 0 24 24" class="h-4 w-4 text-white/35" fill="currentColor">
                          <path d="M4 10v4c0 1.1.9 2 2 2h2l5 4V4L8 8H6c-1.1 0-2 .9-2 2zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                        </svg>
                      </div>
                    {/if}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="truncate font-medium">{speaker.name}</span>
                      <span class={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${heosStateClass(summary)}`}>{heosStateLabel(summary)}</span>
                    </div>
                    <div class="mt-0.5 truncate text-[11px] text-white/55">{heosTitleLine(summary, speaker.model || 'Bereit')}</div>
                    <div class="mt-0.5 truncate text-[10px] text-white/35">{heosMetaLine(summary, speaker.model || '')}</div>
                  </div>
                </div>
              </button>
            {/each}
          </div>

          {#if watchedPid}
            <div class="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
              <div class="mb-3 flex items-center justify-between">
                <div class="text-xs font-medium text-white/65">Lautstärke</div>
                <div class="text-xs font-medium tabular-nums text-white/50">{heosVolumeLevel ?? '--'}</div>
              </div>

              {#if heosVolumeError}
                <div class="mb-2 text-xs text-red-200">{heosVolumeError}</div>
              {/if}

              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/15 disabled:opacity-50"
                  on:click={() => void adjustVolumeForCurrent(-5)}
                  disabled={heosVolumeBusy}
                  aria-label="Lautstärke verringern"
                >
                  -
                </button>
                <input
                  class="heos-range min-w-0 flex-1"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={heosVolumeLevel ?? 0}
                  disabled={heosVolumeBusy}
                  on:change={(event) => {
                    const value = Number((event.currentTarget as HTMLInputElement).value);
                    void setVolumeForCurrent(value);
                  }}
                />
                <button
                  type="button"
                  class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white/80 transition hover:bg-white/15 disabled:opacity-50"
                  on:click={() => void adjustVolumeForCurrent(5)}
                  disabled={heosVolumeBusy}
                  aria-label="Lautstärke erhöhen"
                >
                  +
                </button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes speakerCardIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .heos-range {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 9999px;
    background: linear-gradient(to right, rgba(255,255,255,0.12), rgba(52,211,153,0.55));
    outline: none;
  }

  .heos-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #34d399;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(52,211,153,0.45);
  }

  .heos-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: #34d399;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(52,211,153,0.45);
  }
</style>
