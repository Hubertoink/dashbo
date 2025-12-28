<script lang="ts">
  import { onDestroy } from 'svelte';
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

  let audioEl: HTMLAudioElement | null = null;

  let queue: NowPlayingTrack[] = [];
  let index = 0;

  let heosActive = false;
  let heosPlaying = false;

  function buildHeosHeaders(): Record<string, string> {
    const hosts = getEdgeHeosHostsFromStorage().trim();
    return hosts ? { 'Content-Type': 'application/json', 'X-HEOS-HOSTS': hosts } : { 'Content-Type': 'application/json' };
  }

  function current(): NowPlayingTrack | null {
    return queue[index] ?? null;
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
    const track = current();
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
    setProgress(0, 0);

    heosActive = false;
    heosPlaying = false;

    try {
      if (heosEnabled && heosPid && edgeBaseUrl) {
        const url = buildEdgeStreamUrl(track.trackId);
        await edgeFetchJson(edgeBaseUrl, '/api/heos/play_stream', edgeToken || undefined, {
          method: 'POST',
          headers: buildHeosHeaders(),
          body: JSON.stringify({ pid: heosPid, url, name: `${track.artist} - ${track.title}` })
        });
        heosActive = true;
        heosPlaying = true;
        setNowPlaying(track, true);
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
          await startLocalPlayback(track);
          return;
        } catch {
          // fall through
        }
      }

      heosActive = false;
      heosPlaying = false;
      setNowPlaying(track, false);
    }
  }

  async function toggle() {
    const heosEnabled = getEdgeHeosEnabledFromStorage();
    const heosPid = getEdgeHeosSelectedPlayerIdFromStorage();
    const edgeBaseUrl = getEdgeBaseUrlFromStorage();
    const edgeToken = getEdgeTokenFromStorage();

    const track = current();

    if (!heosPid) {
      heosActive = false;
      heosPlaying = false;
    }

    if (heosEnabled && heosPid && edgeBaseUrl && track) {
      // If HEOS is selected but not active yet, start stream for the current track.
      if (!heosActive) {
        try {
          const url = buildEdgeStreamUrl(track.trackId);
          await edgeFetchJson(edgeBaseUrl, '/api/heos/play_stream', edgeToken || undefined, {
            method: 'POST',
            headers: buildHeosHeaders(),
            body: JSON.stringify({ pid: heosPid, url, name: `${track.artist} - ${track.title}` })
          });
          heosActive = true;
          heosPlaying = true;
          setNowPlaying(track, true);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err || 'HEOS play failed');
          console.error('[HEOS] play_stream failed (toggle):', msg);
          heosActive = false;
          heosPlaying = false;
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
    unsub();
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
