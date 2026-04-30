<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fetchSpotifyNowPlaying } from '$lib/api';
  import {
    edgeFetchJson,
    getEdgeBaseUrlFromStorage,
    getEdgeHeosEnabledFromStorage,
    getEdgeHeosHostsFromStorage,
    getEdgeHeosSelectedPlayerIdFromStorage,
    getEdgePlayerWidgetEnabledFromStorage,
    getEdgeTokenFromStorage
  } from '$lib/edge';
  import { setNowPlaying, setProgress } from '$lib/stores/musicPlayer';
  import {
    resetHeosPlaybackStatus,
    setHeosPlaybackStatus,
    type HeosPlaybackState,
    type HeosPlayerPlaybackSummary
  } from '$lib/stores/heosPlayback';
  import { resetSpotifyPlaybackStatus, setSpotifyPlaybackStatus } from '$lib/stores/spotifyPlayback';

  let heosStatusPollTimer: ReturnType<typeof setInterval> | null = null;
  let spotifyStatusPollTimer: ReturnType<typeof setInterval> | null = null;

  function buildHeosHeaders(): Record<string, string> {
    const hosts = getEdgeHeosHostsFromStorage().trim();
    return hosts ? { 'X-HEOS-HOSTS': hosts } : {};
  }

  function normalizeState(raw: unknown): HeosPlaybackState {
    const state = String(raw || '').trim().toLowerCase();
    return state === 'play' || state === 'pause' || state === 'stop' ? state : 'unknown';
  }

  function normalizeSummary(raw: any, updatedAt: number): HeosPlayerPlaybackSummary {
    const pid = Number(raw?.pid);
    return {
      pid,
      name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name : String(pid || ''),
      model: typeof raw?.model === 'string' ? raw.model : null,
      state: normalizeState(raw?.state),
      isPlaying: Boolean(raw?.isPlaying),
      isActive: Boolean(raw?.isActive || raw?.isPlaying),
      title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title : null,
      artist: typeof raw?.artist === 'string' && raw.artist.trim() ? raw.artist : null,
      album: typeof raw?.album === 'string' && raw.album.trim() ? raw.album : null,
      imageUrl: typeof raw?.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl : null,
      source: typeof raw?.source === 'string' && raw.source.trim() ? raw.source : null,
      url: typeof raw?.url === 'string' && raw.url.trim() ? raw.url : null,
      updatedAt,
      error: typeof raw?.error === 'string' && raw.error.trim() ? raw.error : null
    };
  }

  function choosePrimarySummary(summaries: HeosPlayerPlaybackSummary[], selectedPid: number | null) {
    const selected = selectedPid ? summaries.find((summary) => summary.pid === selectedPid) ?? null : null;
    if (selected?.isActive) return selected;
    return summaries.find((summary) => summary.isActive) ?? selected ?? summaries[0] ?? null;
  }

  function stopHeosStatusPolling() {
    if (heosStatusPollTimer) {
      clearInterval(heosStatusPollTimer);
      heosStatusPollTimer = null;
    }
  }

  function stopSpotifyStatusPolling() {
    if (spotifyStatusPollTimer) {
      clearInterval(spotifyStatusPollTimer);
      spotifyStatusPollTimer = null;
    }
  }

  function startSpotifyStatusPolling() {
    stopSpotifyStatusPolling();

    const tick = async () => {
      if (!getEdgePlayerWidgetEnabledFromStorage()) {
        resetSpotifyPlaybackStatus({ enabled: false, active: false, isPlaying: false, error: null });
        return;
      }

      try {
        const r = await fetchSpotifyNowPlaying();
        const enabled = Boolean(r?.enabled);
        const active = Boolean(r?.active);

        if (!enabled) {
          resetSpotifyPlaybackStatus({ enabled: false, active: false, isPlaying: false });
          return;
        }

        setSpotifyPlaybackStatus({
          enabled: true,
          active,
          isPlaying: Boolean(r?.isPlaying),
          title: typeof r?.title === 'string' ? r.title : null,
          artist: typeof r?.artist === 'string' ? r.artist : null,
          album: typeof r?.album === 'string' ? r.album : null,
          imageUrl: typeof r?.imageUrl === 'string' ? r.imageUrl : null,
          source: typeof r?.source === 'string' ? r.source : 'Spotify',
          deviceName: typeof r?.deviceName === 'string' ? r.deviceName : null,
          deviceType: typeof r?.deviceType === 'string' ? r.deviceType : null,
          updatedAt: Date.now(),
          error: typeof r?.error === 'string' ? r.error : null
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err || 'spotify_status_failed');
        if (msg.includes('API 401')) {
          resetSpotifyPlaybackStatus({ enabled: false, active: false, isPlaying: false, error: null });
          return;
        }
        setSpotifyPlaybackStatus({ enabled: true, active: false, isPlaying: false, updatedAt: Date.now(), error: msg });
      }
    };

    void tick();
    spotifyStatusPollTimer = setInterval(() => void tick(), 5000);
  }

  function startHeosStatusPolling() {
    stopHeosStatusPolling();

    const tick = async () => {
      const playerWidgetEnabled = getEdgePlayerWidgetEnabledFromStorage();
      const heosEnabled = getEdgeHeosEnabledFromStorage();
      const selectedPid = getEdgeHeosSelectedPlayerIdFromStorage();
      const edgeBaseUrl = getEdgeBaseUrlFromStorage();
      const edgeToken = getEdgeTokenFromStorage();

      if (!playerWidgetEnabled || !heosEnabled || !edgeBaseUrl) {
        resetHeosPlaybackStatus({ enabled: Boolean(heosEnabled), pid: selectedPid ?? null, players: [] });
        return;
      }

      try {
        const updatedAt = Date.now();
        const r = await edgeFetchJson<any>(edgeBaseUrl, '/api/heos/playback_summaries', edgeToken || undefined, {
          method: 'GET',
          headers: buildHeosHeaders()
        });
        const summaries = (Array.isArray(r?.summaries) ? r.summaries : [])
          .map((item: any) => normalizeSummary(item, updatedAt))
          .filter((item: HeosPlayerPlaybackSummary) => Number.isFinite(item.pid) && item.pid !== 0);
        const primary = choosePrimarySummary(summaries, selectedPid);
        const isActive = Boolean(primary?.isActive || primary?.isPlaying);

        setHeosPlaybackStatus({
          enabled: true,
          pid: primary?.pid ?? selectedPid ?? null,
          players: summaries,
          state: primary?.state ?? 'unknown',
          isPlaying: Boolean(primary?.isPlaying),
          isActive,
          title: primary?.title ?? null,
          artist: primary?.artist ?? null,
          album: primary?.album ?? null,
          imageUrl: primary?.imageUrl ?? null,
          source: primary?.source ?? null,
          url: primary?.url ?? null,
          isDashbo: false,
          isExternal: isActive,
          updatedAt,
          error: primary?.error ?? null
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err || 'heos_status_failed');
        setHeosPlaybackStatus({
          enabled: true,
          pid: selectedPid ?? null,
          players: [],
          state: 'unknown',
          isPlaying: false,
          isActive: false,
          isDashbo: false,
          isExternal: false,
          updatedAt: Date.now(),
          error: msg
        });
      }
    };

    void tick();
    heosStatusPollTimer = setInterval(() => void tick(), 4000);
  }

  onMount(() => {
    setNowPlaying(null, false);
    setProgress(0, 0);
    startHeosStatusPolling();
    startSpotifyStatusPolling();
  });

  onDestroy(() => {
    stopHeosStatusPolling();
    stopSpotifyStatusPolling();
  });
</script>
