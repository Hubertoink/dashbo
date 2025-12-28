<script lang="ts">
  import { onDestroy } from 'svelte';
  import { musicPlayerCommand, setNowPlaying, buildEdgeStreamUrl, type NowPlayingTrack } from '$lib/stores/musicPlayer';

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
      return;
    }

    setNowPlaying(track, false);

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

  const unsub = musicPlayerCommand.subscribe((cmd) => {
    if (!cmd) return;
    if (cmd.type === 'play') {
      queue = cmd.queue;
      void startAt(cmd.index);
    }
    musicPlayerCommand.clear();
  });

  onDestroy(() => {
    unsub();
  });
</script>

<audio bind:this={audioEl} on:ended={onEnded} on:pause={onPause} on:play={onPlay}></audio>
