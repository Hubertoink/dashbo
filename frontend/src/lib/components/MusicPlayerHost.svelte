<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    musicPlayerCommand,
    setNowPlaying,
    setProgress,
    buildEdgeStreamUrl,
    type NowPlayingTrack
  } from '$lib/stores/musicPlayer';

  let audioEl: HTMLAudioElement | null = null;

  let queue: NowPlayingTrack[] = [];
  let index = 0;

  function current(): NowPlayingTrack | null {
    return queue[index] ?? null;
  }

  async function startAt(i: number) {
    index = i;
    const track = current();
    if (!track || !audioEl) {
      setNowPlaying(null, false);
      setProgress(0, 0);
      return;
    }

    setNowPlaying(track, false);
    setProgress(0, 0);

    try {
      audioEl.src = buildEdgeStreamUrl(track.trackId);
      // Make the cover available to the Media Session API (nice-to-have but harmless)
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
    } catch {
      // Autoplay may be blocked; keep state as not playing.
      setNowPlaying(track, false);
    }
  }

  async function toggle() {
    if (!audioEl) return;
    if (audioEl.paused) {
      try {
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
    if (!audioEl) return;
    if (audioEl.currentTime > 3) {
      audioEl.currentTime = 0;
      return;
    }
    if (queue.length === 0) return;
    const p = index - 1;
    if (p < 0) {
      audioEl.currentTime = 0;
      return;
    }
    void startAt(p);
  }

  function onEnded() {
    if (queue.length === 0) return;
    const next = index + 1;
    if (next >= queue.length) {
      setNowPlaying(current(), false);
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
