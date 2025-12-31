<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    musicPlayerCommand,
    setNowPlaying,
    setProgress,
    buildEdgeStreamUrl,
    type NowPlayingTrack
  } from '$lib/stores/musicPlayer';

  import {
    edgeFetchJson,
    getEdgeBaseUrlFromStorage,
    getEdgeHeosEnabledFromStorage,
    getEdgeHeosHostsFromStorage,
    getEdgeHeosSelectedPlayerIdFromStorage,
    getEdgeTokenFromStorage
  } from '$lib/edge';

  import { resetHeosPlaybackStatus, setHeosPlaybackStatus } from '$lib/stores/heosPlayback';

  let audioEl: HTMLAudioElement | null = null;

  let queue: NowPlayingTrack[] = [];
  let index = 0;

  let heosActive = false;
  let heosPlaying = false;

  const HEOS_DASHBO_MARKER = 'DashbO |';

  let heosStatusPollTimer: ReturnType<typeof setInterval> | null = null;

  let heosPollTimer: ReturnType<typeof setInterval> | null = null;
  let heosPosSec = 0;
  let heosDurationSec = 0;

  let heosDurationFetchInFlight = false;
  let heosDurationFetchTrackId: string | null = null;
  let heosDurationFetchLastAt = 0;

  const durationCache = new Map<string, number>();

  function buildHeosHeaders(): Record<string, string> {
    const hosts = getEdgeHeosHostsFromStorage().trim();
    return hosts ? { 'Content-Type': 'application/json', 'X-HEOS-HOSTS': hosts } : { 'Content-Type': 'application/json' };
  }

  function current(): NowPlayingTrack | null {
    return queue[index] ?? null;
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

  function looksLikeDashboPlayback(summary: any): boolean {
    const title = typeof summary?.title === 'string' ? summary.title : '';
    const artist = typeof summary?.artist === 'string' ? summary.artist : '';
    const album = typeof summary?.album === 'string' ? summary.album : '';
    const source = typeof summary?.source === 'string' ? summary.source : '';
    const url = typeof summary?.url === 'string' ? summary.url : '';

    const hay = `${title} ${artist} ${album} ${source}`.toLowerCase();
    if (hay.includes(HEOS_DASHBO_MARKER.toLowerCase())) return true;
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
    // New stable HEOS stream endpoint does not include trackId; matching via URL is best-effort.
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

  function startHeosStatusPolling() {
    stopHeosStatusPolling();

    const tick = async () => {
      const heosEnabled = getEdgeHeosEnabledFromStorage();
      const pid = getEdgeHeosSelectedPlayerIdFromStorage();
      const edgeBaseUrl = getEdgeBaseUrlFromStorage();
      const edgeToken = getEdgeTokenFromStorage();

      if (!heosEnabled || !pid || !edgeBaseUrl) {
        resetHeosPlaybackStatus({ enabled: Boolean(heosEnabled), pid: pid ?? null });
        return;
      }

      try {
        const r = await edgeFetchJson<any>(
          edgeBaseUrl,
          `/api/heos/playback_summary?pid=${encodeURIComponent(String(pid))}`,
          edgeToken || undefined,
          { method: 'GET', headers: buildHeosHeaders() }
        );

        const summary = r?.summary ?? null;
        const state = typeof summary?.state === 'string' ? String(summary.state) : 'unknown';
        const isPlaying = Boolean(summary?.isPlaying);
        const isActive = typeof summary?.isActive === 'boolean' ? summary.isActive : isPlaying;

        const dashboTrack = current();
        const dashboStreamingToHeos = Boolean(heosActive && dashboTrack);

        // Detect takeover: if DashbO thinks it's controlling HEOS but the HEOS metadata clearly indicates
        // another source (e.g. Spotify) or a different non-generic track, switch to external mode.
        const source = typeof summary?.source === 'string' ? summary.source.toLowerCase() : '';
        const title = typeof summary?.title === 'string' ? summary.title : '';
        const artist = typeof summary?.artist === 'string' ? summary.artist : '';
        const hasNonGenericMeta = !isGenericHeosMetaValue(title) || !isGenericHeosMetaValue(artist);
        const matchesDashbo = dashboTrack ? summaryMatchesDashboTrack(summary, dashboTrack) : false;
        const looksDashbo = looksLikeDashboPlayback(summary);
        const indicatesSpotify = source.includes('spotify');

        const takeover = dashboStreamingToHeos && isActive && (indicatesSpotify || (hasNonGenericMeta && !matchesDashbo && !looksDashbo));
        if (takeover) {
          heosActive = false;
          heosPlaying = false;
          stopHeosPolling();
          setNowPlaying(null, false);
          setProgress(0, 0);
        }

        // If DashbO is currently streaming to HEOS, don't label the session as external by default
        // (HEOS can report generic 'Url Stream' metadata for our own streams).
        const isDashbo = (dashboStreamingToHeos && !takeover) || looksDashbo || matchesDashbo;
        const isExternal = isActive && !isDashbo;

        setHeosPlaybackStatus({
          enabled: true,
          pid,
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

    heosPosSec = 0;
    heosDurationSec = Number.isFinite(durationSec) ? Math.max(0, Math.floor(durationSec)) : 0;
    setProgress(0, heosDurationSec);

    heosPollTimer = setInterval(async () => {
      try {
        if (heosActive && heosPlaying) {
          heosPosSec = heosPosSec + 1;
          setProgress(heosPosSec, heosDurationSec);
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

        // Some HEOS streams (URL) don't report duration; best-effort pull it from the library.
        if (heosActive && heosDurationSec <= 0) {
          void maybeEnsureHeosDurationFromPolling();
        }
      } catch {
        // ignore polling errors
      }
    }, 1000);
  }

  function sleep(ms: number) {
    const t = Math.max(0, Math.floor(ms));
    return new Promise<void>((resolve) => setTimeout(resolve, t));
  }

  async function forceHeosPlayStream(pid: number, url: string, name: string) {
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();
    if (!edgeBaseUrl) throw new Error('Edge Base URL fehlt');
    if (!pid) throw new Error('HEOS pid fehlt');
    if (!url) throw new Error('Stream URL fehlt');

    await edgeFetchJson(edgeBaseUrl, '/api/heos/play_stream', edgeToken || undefined, {
      method: 'POST',
      headers: buildHeosHeaders(),
      body: JSON.stringify({ pid, url, name })
    });

    // Ensure state is really 'play' after replacing the stream.
    try {
      await edgeFetchJson(edgeBaseUrl, '/api/heos/play_state', edgeToken || undefined, {
        method: 'POST',
        headers: buildHeosHeaders(),
        body: JSON.stringify({ pid, state: 'play' })
      });
    } catch {
      // ignore; play_stream often starts playback implicitly
    }
  }

  function buildHeosStableStreamUrl(pid: number): string {
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const token = getEdgeTokenFromStorage();
    if (!edgeBaseUrl) throw new Error('Edge Base URL fehlt');
    if (!pid) throw new Error('HEOS pid fehlt');

    // HEOS cannot send Authorization headers reliably; use query token like the track stream endpoint.
    const qToken = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${edgeBaseUrl}/api/music/heos/stream?pid=${encodeURIComponent(String(pid))}${qToken}`;
  }

  async function setHeosTargetTrack(pid: number, trackId: string) {
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();
    if (!edgeBaseUrl) throw new Error('Edge Base URL fehlt');
    if (!pid) throw new Error('HEOS pid fehlt');
    if (!trackId) throw new Error('Track fehlt');

    await edgeFetchJson(edgeBaseUrl, '/api/music/heos/target', edgeToken || undefined, {
      method: 'POST',
      headers: buildHeosHeaders(),
      body: JSON.stringify({ pid, trackId })
    });
  }

  async function forceHeosPlayStreamWithRetry(pid: number, url: string, name: string) {
    try {
      await forceHeosPlayStream(pid, url, name);
      return;
    } catch {
      await sleep(300);
      await forceHeosPlayStream(pid, url, name);
    }
  }

  async function startLocalPlayback(track: NowPlayingTrack) {
    if (!audioEl) {
      setNowPlaying(track, false);
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

    await audioEl.play();
    setNowPlaying(track, true);
  }

  async function startAt(i: number) {
    index = i;
    const trackRaw = current();
    const track = trackRaw ? normalizeTrack(trackRaw) : null;
    if (!track) {
      setNowPlaying(null, false);
      setProgress(0, 0);
      return;
    }

    const heosEnabled = getEdgeHeosEnabledFromStorage();
    const heosPid = getEdgeHeosSelectedPlayerIdFromStorage();
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();

    setNowPlaying(track, false);
    const knownDuration = typeof track.durationSec === 'number' && Number.isFinite(track.durationSec) ? track.durationSec : 0;
    setProgress(0, knownDuration);

    heosActive = false;
    heosPlaying = false;
    stopHeosPolling();

    heosDurationFetchInFlight = false;
    heosDurationFetchTrackId = null;
    heosDurationFetchLastAt = 0;

    try {
      if (heosEnabled && heosPid && edgeBaseUrl) {
        await setHeosTargetTrack(heosPid, track.trackId);
        const url = buildHeosStableStreamUrl(heosPid);
        // Keep the name stable to avoid accumulating many different URL stream entries in the HEOS app.
        await forceHeosPlayStreamWithRetry(heosPid, url, `${HEOS_DASHBO_MARKER} Stream`);
        heosActive = true;
        heosPlaying = true;
        startHeosPolling(heosPid, knownDuration);
        setNowPlaying(track, true);
        void ensureHeosDuration(track);
        return;
      }

      await startLocalPlayback(track);
    } catch (err) {
      // If HEOS fails, fall back to local playback so the player doesn't get stuck.
      if (heosEnabled && heosPid) {
        const msg = err instanceof Error ? err.message : String(err || 'HEOS play failed');
        console.error('[HEOS] play_stream failed:', msg);
        try {
          heosActive = false;
          heosPlaying = false;
          stopHeosPolling();
          await startLocalPlayback(track);
          return;
        } catch {
          // fall through
        }
      }

      heosActive = false;
      heosPlaying = false;
      stopHeosPolling();
      setNowPlaying(track, false);
    }
  }

  async function toggle() {
    const heosEnabled = getEdgeHeosEnabledFromStorage();
    const heosPid = getEdgeHeosSelectedPlayerIdFromStorage();
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();

    const trackRaw = current();
    const track = trackRaw ? normalizeTrack(trackRaw) : null;

    if (!heosPid) {
      heosActive = false;
      heosPlaying = false;
    }

    if (heosEnabled && heosPid && edgeBaseUrl && track) {
      // If HEOS is selected but not active yet, start stream for the current track.
      if (!heosActive) {
        try {
          await setHeosTargetTrack(heosPid, track.trackId);
          const url = buildHeosStableStreamUrl(heosPid);
          await forceHeosPlayStreamWithRetry(heosPid, url, `${HEOS_DASHBO_MARKER} Stream`);
          heosActive = true;
          heosPlaying = true;
          startHeosPolling(heosPid, typeof track.durationSec === 'number' && Number.isFinite(track.durationSec) ? track.durationSec : 0);
          setNowPlaying(track, true);
          void ensureHeosDuration(track);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err || 'HEOS play failed');
          console.error('[HEOS] play_stream failed (toggle):', msg);
          heosActive = false;
          heosPlaying = false;
          stopHeosPolling();
          // fall through to local
        }
      } else {
        try {
          const state = heosPlaying ? 'pause' : 'play';
          await edgeFetchJson(edgeBaseUrl, '/api/heos/play_state', edgeToken || undefined, {
            method: 'POST',
            headers: buildHeosHeaders(),
            body: JSON.stringify({ pid: heosPid, state })
          });
          heosPlaying = !heosPlaying;
          setNowPlaying(track, heosPlaying);
          return;
        } catch {
          heosActive = false;
          heosPlaying = false;
          stopHeosPolling();
          // fall through to local
        }
      }
    }

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
    const heosPid = getEdgeHeosSelectedPlayerIdFromStorage();
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
    if (next >= queue.length) {
      setNowPlaying(current(), false);
      heosPlaying = false;
      return;
    }
    void startAt(next);
  }

  function onPause() {
    setNowPlaying(current(), false);
  }

  function onPlay() {
    setNowPlaying(current(), true);
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
      queue = cmd.queue;
      void startAt(cmd.index);
    } else if (cmd.type === 'toggle') {
      void toggle();
    } else if (cmd.type === 'next') {
      next();
    } else if (cmd.type === 'prev') {
      prev();
    }
    musicPlayerCommand.clear();
  });

  onDestroy(() => {
    stopHeosPolling();
    stopHeosStatusPolling();
    unsub();
  });

  onMount(() => {
    startHeosStatusPolling();
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
