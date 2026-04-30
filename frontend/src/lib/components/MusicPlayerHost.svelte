<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fetchSpotifyNowPlaying } from '$lib/api';
  import {
    musicPlayerCommand,
    setNowPlaying,
    setProgress,
    buildEdgeStreamUrl,
    type NowPlayingTrack,
    type PlaybackTarget
  } from '$lib/stores/musicPlayer';

  import {
    edgeFetchJson,
    getEdgeBaseUrlFromStorage,
    getEdgePlayerWidgetEnabledFromStorage,
    getEdgeHeosEnabledFromStorage,
    getEdgeHeosHostsFromStorage,
    getEdgeHeosSelectedPlayerIdFromStorage,
    getEdgeTokenFromStorage
  } from '$lib/edge';
  import { addMusicDebugEntry } from '$lib/musicDebug';

  import {
    resetHeosPlaybackStatus,
    setHeosPlaybackStatus,
    type HeosPlaybackState,
    type HeosPlayerPlaybackSummary
  } from '$lib/stores/heosPlayback';
  import { resetSpotifyPlaybackStatus, setSpotifyPlaybackStatus } from '$lib/stores/spotifyPlayback';

  let audioEl: HTMLAudioElement | null = null;

  let queue: NowPlayingTrack[] = [];
  let index = 0;

  let heosActive = false;
  let heosPlaying = false;
  let activePlaybackTarget: PlaybackTarget = { kind: 'local' };

  const HEOS_DASHBO_MARKER = 'DashbO |';
  const HEOS_START_GRACE_MS = 75_000;

  let heosStatusPollTimer: ReturnType<typeof setInterval> | null = null;
  let spotifyStatusPollTimer: ReturnType<typeof setInterval> | null = null;

  let heosPollTimer: ReturnType<typeof setInterval> | null = null;
  let heosPosSec = 0;
  let heosDurationSec = 0;

  let heosDurationFetchInFlight = false;
  let heosDurationFetchTrackId: string | null = null;
  let heosDurationFetchLastAt = 0;
  let heosStartGraceUntil = 0;
  let heosStartGracePid: number | null = null;
  let heosStartGraceTrackId: string | null = null;
  let heosStartGraceStreamId: string | null = null;
  let suppressLocalPauseEvent = false;
  let playbackStartSeq = 0;
  let heosAutoAdvanceTrackId: string | null = null;

  const durationCache = new Map<string, number>();

  function debugNow(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }

  function debugDurationMs(startedAt: number): number {
    return Math.max(0, Math.round(debugNow() - startedAt));
  }

  function debugTrack(track: NowPlayingTrack | null | undefined): Record<string, unknown> | null {
    if (!track) return null;
    return {
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      durationSec: typeof track.durationSec === 'number' && Number.isFinite(track.durationSec) ? track.durationSec : null
    };
  }

  function debugTarget(target: PlaybackTarget = activePlaybackTarget): Record<string, unknown> {
    return target.kind === 'heos'
      ? { kind: 'heos', pid: target.pid, name: target.name ?? null }
      : { kind: 'local', name: target.name ?? null };
  }

  function debugError(err: unknown): Record<string, unknown> {
    return err instanceof Error ? { name: err.name, message: err.message } : { message: String(err || 'unknown_error') };
  }

  function debugHeosResponse(response: DashboHeosSessionResponse | null | undefined): Record<string, unknown> | null {
    if (!response) return null;
    return {
      ok: response.ok,
      pid: response.pid,
      trackId: response.trackId,
      streamId: response.streamId ?? response.target?.streamId ?? null,
      started: response.started,
      resumed: response.resumed,
      restarted: response.restarted,
      reused: response.reused,
      retried: response.retried,
      state: response.state,
      observedState: response.observedState,
      target: response.target
        ? {
            trackId: response.target.trackId,
            streamId: response.target.streamId,
            requestCount: response.target.requestCount,
            lastRequestedAt: response.target.lastRequestedAt,
            lastUserAgent: response.target.lastUserAgent
          }
        : null
    };
  }

  function buildHeosHeaders(): Record<string, string> {
    const hosts = getEdgeHeosHostsFromStorage().trim();
    return hosts ? { 'Content-Type': 'application/json', 'X-HEOS-HOSTS': hosts } : { 'Content-Type': 'application/json' };
  }

  function current(): NowPlayingTrack | null {
    return queue[index] ?? null;
  }

  function normalizePlaybackTarget(target?: PlaybackTarget | null): PlaybackTarget {
    if (target?.kind === 'local') return { kind: 'local', name: target.name ?? null };
    if (target?.kind === 'heos') {
      const pid = Number(target.pid);
      if (Number.isFinite(pid) && pid !== 0) {
        return { kind: 'heos', pid, name: target.name ?? null };
      }
    }

    const pid = getEdgeHeosSelectedPlayerIdFromStorage();
    return pid ? { kind: 'heos', pid } : { kind: 'local' };
  }

  function activeHeosPid(): number | null {
    return activePlaybackTarget.kind === 'heos' ? activePlaybackTarget.pid : null;
  }

  function playbackTargetLabel(target: PlaybackTarget = activePlaybackTarget): string {
    if (target.kind === 'heos') return target.name || `Speaker ${target.pid}`;
    return target.name || 'dieses Gerät';
  }

  function beginHeosStartGrace(pid: number, track: NowPlayingTrack, streamId: string) {
    heosStartGracePid = pid;
    heosStartGraceTrackId = track.trackId;
    heosStartGraceStreamId = streamId;
    heosStartGraceUntil = Date.now() + HEOS_START_GRACE_MS;
  }

  function isHeosStartGraceActive(pid: number | null, track: NowPlayingTrack | null, streamId?: string | null): boolean {
    if (!pid || !track) return false;
    if (heosStartGracePid !== pid || heosStartGraceTrackId !== track.trackId) return false;
    if (streamId && heosStartGraceStreamId !== streamId) return false;
    return Date.now() < heosStartGraceUntil;
  }

  function clearHeosStartGrace(pid?: number | null, trackId?: string | null, streamId?: string | null) {
    if (pid && heosStartGracePid !== pid) return;
    if (trackId && heosStartGraceTrackId !== trackId) return;
    if (streamId && heosStartGraceStreamId !== streamId) return;
    heosStartGraceUntil = 0;
    heosStartGracePid = null;
    heosStartGraceTrackId = null;
    heosStartGraceStreamId = null;
  }

  function isLatestPlaybackStart(startSeq: number): boolean {
    return startSeq === playbackStartSeq;
  }

  async function stopHeosTarget(pid: number | null) {
    if (!pid) return;
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();
    if (!edgeBaseUrl) return;

    const startedAt = debugNow();
    addMusicDebugEntry('heos.stop.request', { pid, target: debugTarget() });
    try {
      const response = await edgeFetchJson<DashboHeosSessionResponse>(edgeBaseUrl, '/api/heos/dashbo_play_state', edgeToken || undefined, {
        method: 'POST',
        headers: buildHeosHeaders(),
        body: JSON.stringify({ pid, state: 'stop' })
      });
      addMusicDebugEntry('heos.stop.result', { durationMs: debugDurationMs(startedAt), response: debugHeosResponse(response) });
    } catch (err) {
      addMusicDebugEntry('heos.stop.error', { durationMs: debugDurationMs(startedAt), error: debugError(err) }, 'error');
      throw err;
    }
  }

  async function stopPreviousHeosIfTargetChanged(previousPid: number | null, nextTarget: PlaybackTarget) {
    const nextPid = nextTarget.kind === 'heos' ? nextTarget.pid : null;
    if (!previousPid || previousPid === nextPid) return;
    try {
      await stopHeosTarget(previousPid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || 'HEOS stop failed');
      console.warn('[HEOS] previous target stop failed:', msg);
    }
  }

  function stopLocalAudio() {
    if (!audioEl) return;
    try {
      suppressLocalPauseEvent = !audioEl.paused;
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
    } catch {
      // ignore
    }
  }

  function normalizeTrack(track: NowPlayingTrack): NowPlayingTrack {
    const raw = (track as any)?.durationSec;
    const n = typeof raw === 'number' ? raw : Number(raw);
    const durationSec = Number.isFinite(n) ? Math.max(0, n) : null;
    return { ...track, durationSec };
  }

  async function fetchDurationFromEdge(trackId: string): Promise<number> {
    const id = String(trackId || '').trim();
    if (!id) return 0;
    const cached = durationCache.get(id);
    if (typeof cached === 'number' && cached > 0) return cached;

    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();
    if (!edgeBaseUrl) return 0;

    try {
      const r = await edgeFetchJson<any>(
        edgeBaseUrl,
        `/api/music/tracks/${encodeURIComponent(id)}/meta`,
        edgeToken || undefined,
        { method: 'GET' }
      );
      const durRaw = r?.mm?.format?.duration;
      const dur = Number(durRaw);
      const sec = Number.isFinite(dur) ? Math.max(0, Math.round(dur)) : 0;
      if (sec > 0) durationCache.set(id, sec);
      return sec;
    } catch {
      return 0;
    }
  }

  async function ensureHeosDuration(track: NowPlayingTrack) {
    if (heosDurationSec > 0) return;
    const rawKnown = typeof track.durationSec === 'number' && Number.isFinite(track.durationSec) ? Math.floor(track.durationSec) : 0;
    if (rawKnown > 0) {
      heosDurationSec = rawKnown;
      setProgress(heosPosSec, heosDurationSec);
      return;
    }
    const sec = await fetchDurationFromEdge(track.trackId);
    if (sec > 0) {
      heosDurationSec = sec;
      setProgress(heosPosSec, heosDurationSec);
    }
  }

  async function maybeEnsureHeosDurationFromPolling() {
    if (heosDurationSec > 0) return;
    if (heosDurationFetchInFlight) return;

    const trackRaw = current();
    const track = trackRaw ? normalizeTrack(trackRaw) : null;
    if (!track) return;
    if (!track.trackId) return;

    const nowTs = Date.now();
    const sameTrack = heosDurationFetchTrackId === track.trackId;
    const tooSoon = sameTrack && nowTs - heosDurationFetchLastAt < 15_000;
    if (tooSoon) return;

    heosDurationFetchInFlight = true;
    heosDurationFetchTrackId = track.trackId;
    heosDurationFetchLastAt = nowTs;
    try {
      await ensureHeosDuration(track);
    } finally {
      heosDurationFetchInFlight = false;
    }
  }

  function stopHeosPolling() {
    if (heosPollTimer) {
      clearInterval(heosPollTimer);
      heosPollTimer = null;
    }
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

  function maybeAutoAdvanceHeos() {
    const track = current();
    if (!heosActive || !heosPlaying || !track) return;
    if (heosDurationSec <= 0) return;
    if (heosPosSec < heosDurationSec + 2) return;
    if (heosAutoAdvanceTrackId === track.trackId) return;

    heosAutoAdvanceTrackId = track.trackId;
    onEnded();
  }

  function startSpotifyStatusPolling() {
    stopSpotifyStatusPolling();

    const tick = async () => {
      const playerWidgetEnabled = getEdgePlayerWidgetEnabledFromStorage();
      if (!playerWidgetEnabled) {
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
        // If user is logged out, api() throws 401; keep it quiet.
        if (String(msg).includes('API 401')) {
          resetSpotifyPlaybackStatus({ enabled: false, active: false, isPlaying: false, error: null });
          return;
        }
        setSpotifyPlaybackStatus({ enabled: true, active: false, isPlaying: false, updatedAt: Date.now(), error: msg });
      }
    };

    void tick();
    spotifyStatusPollTimer = setInterval(() => void tick(), 5000);
  }

  function looksLikeDashboPlayback(summary: any): boolean {
    const title = typeof summary?.title === 'string' ? summary.title : '';
    const artist = typeof summary?.artist === 'string' ? summary.artist : '';
    const album = typeof summary?.album === 'string' ? summary.album : '';
    const source = typeof summary?.source === 'string' ? summary.source : '';
    const url = typeof summary?.url === 'string' ? summary.url : '';

    const hay = `${title} ${artist} ${album} ${source}`.toLowerCase();
    if (hay.includes(HEOS_DASHBO_MARKER.toLowerCase())) return true;
    if (url.includes('/heos-stream/')) return true;
    if (url.includes('/api/music/heos/stream')) return true;
    if (url.includes('/api/music/tracks/')) return true;
    return false;
  }

  function isGenericHeosMetaValue(raw: string): boolean {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return true;
    return s === 'url stream' || s === 'stream' || s === 'url' || s === 'unknown' || s === 'unknown artist' || s === 'unknown title';
  }

  function summaryMatchesDashboTrack(summary: any, track: NowPlayingTrack): boolean {
    if (!summary || !track) return false;
    const url = typeof summary?.url === 'string' ? summary.url : '';
    if (url.includes('/heos-stream/')) return true;
    if (url.includes('/api/music/heos/stream')) return true;
    if (track.trackId && url.includes(`/api/music/tracks/${encodeURIComponent(track.trackId)}`)) return true;
    if (track.trackId && url.includes(`/api/music/tracks/${track.trackId}`)) return true;

    const st = typeof summary?.title === 'string' ? summary.title.toLowerCase() : '';
    const sa = typeof summary?.artist === 'string' ? summary.artist.toLowerCase() : '';
    const tt = track.title ? track.title.toLowerCase() : '';
    const ta = track.artist ? track.artist.toLowerCase() : '';

    if (tt && st && st.includes(tt)) {
      if (!ta) return true;
      if (sa && sa.includes(ta)) return true;
    }
    return false;
  }

  function normalizeHeosPlayerSummary(raw: any, updatedAt: number): HeosPlayerPlaybackSummary {
    const pid = Number(raw?.pid);
    const stateRaw = typeof raw?.state === 'string' ? String(raw.state) : 'unknown';
    const state: HeosPlaybackState =
      stateRaw === 'play' || stateRaw === 'pause' || stateRaw === 'stop' ? stateRaw : 'unknown';
    return {
      pid,
      name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name : String(pid || ''),
      model: typeof raw?.model === 'string' ? raw.model : null,
      state,
      isPlaying: Boolean(raw?.isPlaying),
      isActive: Boolean(raw?.isActive),
      title: typeof raw?.title === 'string' ? raw.title : null,
      artist: typeof raw?.artist === 'string' ? raw.artist : null,
      album: typeof raw?.album === 'string' ? raw.album : null,
      imageUrl: typeof raw?.imageUrl === 'string' ? raw.imageUrl : null,
      source: typeof raw?.source === 'string' ? raw.source : null,
      url: typeof raw?.url === 'string' ? raw.url : null,
      updatedAt,
      error: typeof raw?.error === 'string' ? raw.error : null
    };
  }

  function startHeosStatusPolling() {
    stopHeosStatusPolling();

    const tick = async () => {
      const playerWidgetEnabled = getEdgePlayerWidgetEnabledFromStorage();
      const heosEnabled = getEdgeHeosEnabledFromStorage();
      const selectedPid = getEdgeHeosSelectedPlayerIdFromStorage();
      const pid = activeHeosPid() ?? selectedPid;
      const edgeBaseUrl = getEdgeBaseUrlFromStorage();
      const edgeToken = getEdgeTokenFromStorage();

      if (!playerWidgetEnabled || !heosEnabled || !edgeBaseUrl) {
        if (!playerWidgetEnabled) {
          stopHeosPolling();
          heosActive = false;
          heosPlaying = false;
          setNowPlaying(null, false);
          setProgress(0, 0);
        }
        resetHeosPlaybackStatus({ enabled: Boolean(heosEnabled), pid: pid ?? null, players: [] });
        return;
      }

      try {
        let summary: any = null;
        let playerSummaries: HeosPlayerPlaybackSummary[] = [];
        const updatedAt = Date.now();

        try {
          const r = await edgeFetchJson<any>(
            edgeBaseUrl,
            '/api/heos/playback_summaries',
            edgeToken || undefined,
            { method: 'GET', headers: buildHeosHeaders() }
          );
          const rawSummaries = Array.isArray(r?.summaries) ? r.summaries : [];
          playerSummaries = rawSummaries
            .map((item: any) => normalizeHeosPlayerSummary(item, updatedAt))
            .filter((item: any) => Number.isFinite(item.pid) && item.pid !== 0);
          summary = pid ? playerSummaries.find((item) => item.pid === pid) ?? null : null;
        } catch {
          if (!pid) throw new Error('heos_status_failed');
        }

        if (!summary && pid) {
          const r = await edgeFetchJson<any>(
            edgeBaseUrl,
            `/api/heos/playback_summary?pid=${encodeURIComponent(String(pid))}`,
            edgeToken || undefined,
            { method: 'GET', headers: buildHeosHeaders() }
          );
          summary = r?.summary ?? null;
        }

        if (!pid) {
          setHeosPlaybackStatus({
            enabled: true,
            pid: null,
            players: playerSummaries,
            state: 'unknown',
            isPlaying: false,
            isActive: false,
            title: null,
            artist: null,
            album: null,
            imageUrl: null,
            source: null,
            url: null,
            isDashbo: false,
            isExternal: false,
            updatedAt: Date.now(),
            error: null
          });
          return;
        }

        const state = typeof summary?.state === 'string' ? String(summary.state) : 'unknown';
        const isPlaying = Boolean(summary?.isPlaying);
        const isActive = typeof summary?.isActive === 'boolean' ? summary.isActive : isPlaying;

        const dashboTrack = current();
        const dashboStreamingToHeos = Boolean(heosActive && dashboTrack && activeHeosPid() === pid);
        const heosStartGraceActive = isHeosStartGraceActive(pid, dashboTrack);

        // Detect takeover: if DashbO thinks it's controlling HEOS but the HEOS metadata clearly indicates
        // another source (e.g. Spotify) or a different non-generic track, switch to external mode.
        const source = typeof summary?.source === 'string' ? summary.source.toLowerCase() : '';
        const title = typeof summary?.title === 'string' ? summary.title : '';
        const artist = typeof summary?.artist === 'string' ? summary.artist : '';
        const hasNonGenericMeta = !isGenericHeosMetaValue(title) || !isGenericHeosMetaValue(artist);
        const matchesDashbo = dashboTrack ? summaryMatchesDashboTrack(summary, dashboTrack) : false;
        const looksDashbo = looksLikeDashboPlayback(summary);
        const indicatesSpotify = source.includes('spotify');

        const takeover =
          dashboStreamingToHeos &&
          !heosStartGraceActive &&
          isActive &&
          (indicatesSpotify || (hasNonGenericMeta && !matchesDashbo && !looksDashbo));
        if (takeover) {
          addMusicDebugEntry('heos.status.takeover_detected', {
            pid,
            state,
            source,
            title,
            artist,
            matchesDashbo,
            looksDashbo,
            track: debugTrack(dashboTrack)
          }, 'warn');
          clearHeosStartGrace(pid, dashboTrack?.trackId ?? null);
          heosActive = false;
          heosPlaying = false;
          stopHeosPolling();
          setNowPlaying(null, false);
          setProgress(0, 0);
        }

        if (heosStartGraceActive && (looksDashbo || matchesDashbo)) {
          addMusicDebugEntry('heos.status.grace_confirmed', {
            pid,
            state,
            isPlaying,
            matchesDashbo,
            looksDashbo,
            track: debugTrack(dashboTrack)
          });
          clearHeosStartGrace(pid, dashboTrack?.trackId ?? null);
          heosPlaying = isPlaying || heosPlaying;
          if (dashboTrack) setNowPlaying(dashboTrack, heosPlaying, activePlaybackTarget);
        }

        // If DashbO is currently streaming to HEOS, don't label the session as external by default
        // (HEOS can report generic 'Url Stream' metadata for our own streams).
        const isDashbo = heosStartGraceActive || (dashboStreamingToHeos && !takeover) || looksDashbo || matchesDashbo;
        const isExternal = isActive && !isDashbo;

        setHeosPlaybackStatus({
          enabled: true,
          pid,
          players: playerSummaries,
          state: state === 'play' || state === 'pause' || state === 'stop' ? state : 'unknown',
          isPlaying,
          isActive,
          title: typeof summary?.title === 'string' ? summary.title : null,
          artist: typeof summary?.artist === 'string' ? summary.artist : null,
          album: typeof summary?.album === 'string' ? summary.album : null,
          imageUrl: typeof summary?.imageUrl === 'string' ? summary.imageUrl : null,
          source: typeof summary?.source === 'string' ? summary.source : null,
          url: typeof summary?.url === 'string' ? summary.url : null,
          isDashbo,
          isExternal,
          updatedAt: Date.now(),
          error: null
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err || 'heos_status_failed');
        setHeosPlaybackStatus({
          enabled: true,
          pid,
          players: [],
          updatedAt: Date.now(),
          error: msg,
          isExternal: false,
          isDashbo: false,
          isPlaying: false,
          isActive: false,
          state: 'unknown'
        });
      }
    };

    void tick();
    heosStatusPollTimer = setInterval(() => void tick(), 4000);
  }

  function startHeosPolling(pid: number, durationSec: number) {
    stopHeosPolling();
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();
    if (!edgeBaseUrl || !pid) return;

    heosActive = true;
    heosPosSec = 0;
    heosDurationSec = Number.isFinite(durationSec) ? Math.max(0, Math.floor(durationSec)) : 0;
    setProgress(0, heosDurationSec);

    heosPollTimer = setInterval(async () => {
      try {
        if (heosActive && heosPlaying) {
          heosPosSec = heosPosSec + 1;
          setProgress(heosPosSec, heosDurationSec);
          maybeAutoAdvanceHeos();
        }

        const r = await edgeFetchJson<any>(edgeBaseUrl, `/api/heos/now_playing?pid=${encodeURIComponent(String(pid))}`, edgeToken || undefined, {
          method: 'GET',
          headers: buildHeosHeaders()
        });
        const payload = r?.response?.payload;
        if (!payload) return;

        // HEOS payload field names vary; try common variants.
        const rawPos = payload.cur_pos ?? payload.curPos ?? payload.position ?? payload.current_position ?? payload.currentPosition;
        const rawDur = payload.duration ?? payload.dur ?? payload.length;

        const pos = Number(rawPos);
        const dur = Number(rawDur);

        if (Number.isFinite(dur)) {
          heosDurationSec = Math.max(0, Math.floor(dur));
        }
        if (Number.isFinite(pos)) {
          heosPosSec = Math.max(0, Math.floor(pos));
        }
        maybeAutoAdvanceHeos();

        // Some HEOS streams (URL) don't report duration; best-effort pull it from the library.
        if (heosActive && heosDurationSec <= 0) {
          void maybeEnsureHeosDurationFromPolling();
        }
      } catch {
        // ignore polling errors
      }
    }, 1000);
  }

  type DashboHeosSessionResponse = {
    ok: boolean;
    pid?: number;
    trackId?: string;
    streamId?: string;
    started?: boolean;
    resumed?: boolean;
    restarted?: boolean;
    reused?: boolean;
    retried?: boolean;
    state?: string;
    observedState?: string;
    target?: {
      trackId?: string;
      streamId?: string | null;
      updatedAt?: number;
      lastRequestedAt?: number | null;
      requestCount?: number;
      lastUserAgent?: string | null;
    } | null;
  };

  async function playDashboTrackOnHeos(pid: number, track: NowPlayingTrack, opts?: { stopFirst?: boolean }): Promise<DashboHeosSessionResponse> {
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();
    if (!edgeBaseUrl) throw new Error('Edge Base URL fehlt');
    if (!pid) throw new Error('HEOS pid fehlt');
    if (!track?.trackId) throw new Error('Track fehlt');

    const startedAt = debugNow();
    addMusicDebugEntry('heos.play_dashbo_track.request', { pid, track: debugTrack(track), stopFirst: Boolean(opts?.stopFirst) });
    try {
      const response = await edgeFetchJson<DashboHeosSessionResponse>(edgeBaseUrl, '/api/heos/play_dashbo_track', edgeToken || undefined, {
        method: 'POST',
        headers: buildHeosHeaders(),
        body: JSON.stringify({ pid, trackId: track.trackId, name: track.title, stopFirst: Boolean(opts?.stopFirst) })
      });
      addMusicDebugEntry('heos.play_dashbo_track.result', {
        durationMs: debugDurationMs(startedAt),
        response: debugHeosResponse(response)
      }, response?.started ? 'info' : 'warn');
      return response;
    } catch (err) {
      addMusicDebugEntry('heos.play_dashbo_track.error', { durationMs: debugDurationMs(startedAt), error: debugError(err) }, 'error');
      throw err;
    }
  }

  async function setDashboHeosPlaybackState(
    pid: number,
    state: 'play' | 'pause' | 'stop',
    track?: NowPlayingTrack | null,
    opts?: { forceRestart?: boolean }
  ): Promise<DashboHeosSessionResponse> {
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();
    if (!edgeBaseUrl) throw new Error('Edge Base URL fehlt');
    if (!pid) throw new Error('HEOS pid fehlt');

    const startedAt = debugNow();
    addMusicDebugEntry('heos.dashbo_play_state.request', {
      pid,
      state,
      track: debugTrack(track || null),
      forceRestart: Boolean(opts?.forceRestart)
    });
    try {
      const response = await edgeFetchJson<DashboHeosSessionResponse>(edgeBaseUrl, '/api/heos/dashbo_play_state', edgeToken || undefined, {
        method: 'POST',
        headers: buildHeosHeaders(),
        body: JSON.stringify({ pid, state, trackId: track?.trackId, name: track?.title, forceRestart: Boolean(opts?.forceRestart) })
      });
      addMusicDebugEntry('heos.dashbo_play_state.result', {
        durationMs: debugDurationMs(startedAt),
        response: debugHeosResponse(response)
      }, response?.restarted && !response?.started ? 'warn' : 'info');
      return response;
    } catch (err) {
      addMusicDebugEntry('heos.dashbo_play_state.error', { durationMs: debugDurationMs(startedAt), error: debugError(err) }, 'error');
      throw err;
    }
  }

  async function startLocalPlayback(track: NowPlayingTrack) {
    clearHeosStartGrace();
    activePlaybackTarget = { kind: 'local' };
    if (!audioEl) {
      addMusicDebugEntry('local.play.no_audio_element', { track: debugTrack(track) }, 'warn');
      setNowPlaying(track, false, activePlaybackTarget);
      return;
    }

    audioEl.src = buildEdgeStreamUrl(track.trackId);
    try {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.coverUrl ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }] : []
        });
      }
    } catch {
      // ignore
    }

    const startedAt = debugNow();
    addMusicDebugEntry('local.play.request', { track: debugTrack(track), target: debugTarget(activePlaybackTarget) });
    try {
      await audioEl.play();
      addMusicDebugEntry('local.play.result', { durationMs: debugDurationMs(startedAt), track: debugTrack(track) });
      setNowPlaying(track, true, activePlaybackTarget);
    } catch (err) {
      addMusicDebugEntry('local.play.error', { durationMs: debugDurationMs(startedAt), track: debugTrack(track), error: debugError(err) }, 'error');
      throw err;
    }
  }

  async function startAt(i: number) {
    const startSeq = ++playbackStartSeq;
    index = i;
    const trackRaw = current();
    const track = trackRaw ? normalizeTrack(trackRaw) : null;
    if (!track) {
      addMusicDebugEntry('player.start.empty_queue', { index: i, target: debugTarget(activePlaybackTarget) }, 'warn');
      setNowPlaying(null, false);
      setProgress(0, 0);
      return;
    }

    const heosEnabled = getEdgeHeosEnabledFromStorage();
    const heosPid = activePlaybackTarget.kind === 'heos' ? activePlaybackTarget.pid : null;
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();

    const startingHeos = Boolean(heosEnabled && heosPid && edgeBaseUrl);
    addMusicDebugEntry('player.start.begin', {
      index: i,
      startSeq,
      target: debugTarget(activePlaybackTarget),
      track: debugTrack(track),
      heosEnabled,
      heosPid,
      edgeConfigured: Boolean(edgeBaseUrl),
      startingHeos
    });
    setNowPlaying(
      track,
      false,
      activePlaybackTarget,
      startingHeos
        ? {
            status: 'loading',
            statusText: `Sende an ${playbackTargetLabel()}...`
          }
        : undefined
    );
    const knownDuration = typeof track.durationSec === 'number' && Number.isFinite(track.durationSec) ? track.durationSec : 0;
    setProgress(0, knownDuration);

    const wasHeosActive = heosActive || heosPlaying;
    heosActive = false;
    heosPlaying = false;
    heosAutoAdvanceTrackId = null;
    stopHeosPolling();

    heosDurationFetchInFlight = false;
    heosDurationFetchTrackId = null;
    heosDurationFetchLastAt = 0;

    let heosStreamId: string | null = null;

    try {
      if (heosEnabled && heosPid && edgeBaseUrl) {
        stopLocalAudio();
        if (wasHeosActive) {
          setNowPlaying(track, false, activePlaybackTarget, {
            status: 'loading',
            statusText: `Wechsle Stream auf ${playbackTargetLabel()}...`
          });
        }
        setNowPlaying(track, false, activePlaybackTarget, {
          status: 'loading',
          statusText: `Warte auf ${playbackTargetLabel()}...`
        });
        const response = await playDashboTrackOnHeos(heosPid, track, { stopFirst: false });
        if (!isLatestPlaybackStart(startSeq)) {
          addMusicDebugEntry('player.start.stale_result', { startSeq, latestSeq: playbackStartSeq, track: debugTrack(track) }, 'warn');
          return;
        }
        heosStreamId = typeof response?.streamId === 'string' ? response.streamId : null;
        if (heosStreamId) beginHeosStartGrace(heosPid, track, heosStreamId);
        heosActive = true;
        heosPlaying = Boolean(response?.started);
        startHeosPolling(heosPid, knownDuration);
        void ensureHeosDuration(track);
        if (response?.started) {
          clearHeosStartGrace(heosPid, track.trackId, heosStreamId);
          addMusicDebugEntry('player.start.heos_ready', { track: debugTrack(track), response: debugHeosResponse(response) });
          setNowPlaying(track, true, activePlaybackTarget);
          return;
        }

        heosActive = false;
        heosPlaying = false;
        clearHeosStartGrace(heosPid, track.trackId, heosStreamId);
        stopHeosPolling();
        addMusicDebugEntry('player.start.heos_no_request', { track: debugTrack(track), response: debugHeosResponse(response) }, 'warn');
        setNowPlaying(track, false, activePlaybackTarget, {
          status: 'error',
          statusText: `${playbackTargetLabel()} hat den Dashbo-Stream nicht angefordert.`
        });
        return;
      }

      if (!isLatestPlaybackStart(startSeq)) return;
      await startLocalPlayback(track);
    } catch (err) {
      if (heosEnabled && heosPid) {
        const msg = err instanceof Error ? err.message : String(err || 'HEOS play failed');
        console.error('[HEOS] play_stream failed:', msg);
        addMusicDebugEntry('player.start.heos_error', { track: debugTrack(track), target: debugTarget(activePlaybackTarget), error: debugError(err) }, 'error');
        heosActive = false;
        heosPlaying = false;
        clearHeosStartGrace(heosPid, track.trackId, heosStreamId);
        stopHeosPolling();
        setNowPlaying(track, false, activePlaybackTarget, {
          status: 'error',
          statusText: `HEOS konnte ${playbackTargetLabel()} nicht starten.`
        });
        return;
      }

      heosActive = false;
      heosPlaying = false;
      clearHeosStartGrace(heosPid, track.trackId, heosStreamId);
      stopHeosPolling();
      activePlaybackTarget = { kind: 'local' };
      addMusicDebugEntry('player.start.local_fallback_state', { track: debugTrack(track), error: debugError(err) }, 'warn');
      setNowPlaying(track, false, activePlaybackTarget);
    }
  }

  async function toggle() {
    const heosEnabled = getEdgeHeosEnabledFromStorage();
    const heosPid = activePlaybackTarget.kind === 'heos' ? activePlaybackTarget.pid : null;
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const trackRaw = current();
    const track = trackRaw ? normalizeTrack(trackRaw) : null;

    if (!heosPid) {
      heosActive = false;
      heosPlaying = false;
    }

    addMusicDebugEntry('player.toggle.begin', {
      target: debugTarget(activePlaybackTarget),
      track: debugTrack(track),
      heosEnabled,
      heosPid,
      heosActive,
      heosPlaying,
      edgeConfigured: Boolean(edgeBaseUrl)
    });

    if (heosEnabled && heosPid && edgeBaseUrl && track) {
      if (!heosActive) {
        addMusicDebugEntry('player.toggle.start_instead', { pid: heosPid, track: debugTrack(track) });
        await startAt(index);
        return;
      }

      try {
        const nextState = heosPlaying ? 'pause' : 'play';
        setNowPlaying(track, heosPlaying, activePlaybackTarget, {
          status: 'loading',
          statusText: nextState === 'pause' ? `Pausiere ${playbackTargetLabel()}...` : `Setze ${playbackTargetLabel()} fort...`
        });
        const response = await setDashboHeosPlaybackState(heosPid, nextState, track);
        if (nextState === 'pause') {
          heosPlaying = false;
          addMusicDebugEntry('player.toggle.heos_paused', { pid: heosPid, track: debugTrack(track), response: debugHeosResponse(response) });
          setNowPlaying(track, false, activePlaybackTarget);
          return;
        }

        if (response?.restarted && !response?.started) {
          heosActive = false;
          heosPlaying = false;
          stopHeosPolling();
          addMusicDebugEntry('player.toggle.heos_restart_failed', { pid: heosPid, track: debugTrack(track), response: debugHeosResponse(response) }, 'warn');
          setNowPlaying(track, false, activePlaybackTarget, {
            status: 'error',
            statusText: `${playbackTargetLabel()} hat den Dashbo-Stream nicht fortgesetzt.`
          });
          return;
        }

        const streamId = typeof response?.streamId === 'string' ? response.streamId : response?.target?.streamId || null;
        if (streamId) clearHeosStartGrace(heosPid, track.trackId, streamId);
        heosActive = true;
        heosPlaying = true;
        startHeosPolling(heosPid, typeof track.durationSec === 'number' && Number.isFinite(track.durationSec) ? track.durationSec : heosDurationSec);
        addMusicDebugEntry('player.toggle.heos_playing', { pid: heosPid, track: debugTrack(track), response: debugHeosResponse(response) });
        setNowPlaying(track, true, activePlaybackTarget);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err || 'HEOS play state failed');
        console.error('[HEOS] dashbo_play_state failed:', msg);
        addMusicDebugEntry('player.toggle.heos_error', { pid: heosPid, track: debugTrack(track), error: debugError(err) }, 'error');
        setNowPlaying(track, heosPlaying, activePlaybackTarget, {
          status: 'error',
          statusText: `${playbackTargetLabel()} konnte nicht gesteuert werden.`
        });
        return;
      }
    }

    activePlaybackTarget = { kind: 'local' };

    if (!audioEl) return;
    if (audioEl.paused) {
      try {
        if (!audioEl.src && track) {
          // Recover from mode-switching: ensure local <audio> has a src.
          audioEl.src = buildEdgeStreamUrl(track.trackId);
        }
        await audioEl.play();
      } catch {
        // ignore
      }
    } else {
      audioEl.pause();
    }
  }

  function next() {
    if (queue.length === 0) return;
    const n = index + 1;
    if (n >= queue.length) return;
    void startAt(n);
  }

  function prev() {
    const heosEnabled = getEdgeHeosEnabledFromStorage();
    const heosPid = activePlaybackTarget.kind === 'heos' ? activePlaybackTarget.pid : null;
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    if (!heosEnabled || !heosPid || !edgeBaseUrl) {
      if (!audioEl) return;
      if (audioEl.currentTime > 3) {
        audioEl.currentTime = 0;
        return;
      }
    }
    if (queue.length === 0) return;
    const p = index - 1;
    if (p < 0) {
      if (audioEl) audioEl.currentTime = 0;
      return;
    }
    void startAt(p);
  }

  function onEnded() {
    if (queue.length === 0) return;
    const next = index + 1;
    addMusicDebugEntry('player.ended', { index, nextIndex: next, track: debugTrack(current()), target: debugTarget(activePlaybackTarget) });
    if (next >= queue.length) {
      setNowPlaying(current(), false, activePlaybackTarget);
      heosPlaying = false;
      return;
    }
    void startAt(next);
  }

  function onPause() {
    if (suppressLocalPauseEvent) {
      suppressLocalPauseEvent = false;
      return;
    }
    setNowPlaying(current(), false, activePlaybackTarget);
  }

  function onPlay() {
    setNowPlaying(current(), true, activePlaybackTarget);
  }

  function onTimeUpdate() {
    if (!audioEl) return;
    const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    setProgress(audioEl.currentTime || 0, duration || 0);
  }

  function onLoadedMetadata() {
    if (!audioEl) return;
    const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    setProgress(audioEl.currentTime || 0, duration || 0);
  }

  const unsub = musicPlayerCommand.subscribe((cmd) => {
    if (!cmd) return;
    if (cmd.type === 'play') {
      void (async () => {
        const previousPid = activeHeosPid();
        const nextTarget = normalizePlaybackTarget(cmd.target);
        addMusicDebugEntry('command.play', {
          index: cmd.index,
          queueLength: cmd.queue.length,
          previousPid,
          target: debugTarget(nextTarget),
          track: debugTrack(cmd.queue[cmd.index] ?? null)
        });
        queue = cmd.queue;
        activePlaybackTarget = nextTarget;
        await stopPreviousHeosIfTargetChanged(previousPid, nextTarget);
        await startAt(cmd.index);
      })();
    } else if (cmd.type === 'target') {
      void (async () => {
        const previousPid = activeHeosPid();
        const nextTarget = normalizePlaybackTarget(cmd.target);
        addMusicDebugEntry('command.target', { previousPid, target: debugTarget(nextTarget), currentTrack: debugTrack(current()) });
        activePlaybackTarget = nextTarget;
        await stopPreviousHeosIfTargetChanged(previousPid, nextTarget);
        if (current()) await startAt(index);
      })();
    } else if (cmd.type === 'toggle') {
      addMusicDebugEntry('command.toggle', { target: debugTarget(activePlaybackTarget), track: debugTrack(current()) });
      void toggle();
    } else if (cmd.type === 'next') {
      addMusicDebugEntry('command.next', { index, queueLength: queue.length, track: debugTrack(current()), target: debugTarget(activePlaybackTarget) });
      next();
    } else if (cmd.type === 'prev') {
      addMusicDebugEntry('command.prev', { index, queueLength: queue.length, track: debugTrack(current()), target: debugTarget(activePlaybackTarget) });
      prev();
    }
    musicPlayerCommand.clear();
  });

  onDestroy(() => {
    stopHeosPolling();
    stopHeosStatusPolling();
    stopSpotifyStatusPolling();
    unsub();
  });

  onMount(() => {
    startHeosStatusPolling();
    startSpotifyStatusPolling();
  });
</script>

<audio
  bind:this={audioEl}
  on:ended={onEnded}
  on:pause={onPause}
  on:play={onPlay}
  on:timeupdate={onTimeUpdate}
  on:loadedmetadata={onLoadedMetadata}
></audio>
