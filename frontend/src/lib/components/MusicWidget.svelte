<script lang="ts">
  import { musicPlayerState, togglePlayPause, playNext, playPrev } from '$lib/stores/musicPlayer';

  $: now = $musicPlayerState.now;
  $: playing = $musicPlayerState.playing;
  $: positionSec = $musicPlayerState.positionSec;
  $: durationSec = $musicPlayerState.durationSec;
  $: pct = durationSec > 0 ? Math.min(100, Math.max(0, (positionSec / durationSec) * 100)) : 0;

  function fmt(sec: number) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
</script>

<div class="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5">
  <div class="flex items-center justify-between mb-3">
    <div class="text-lg font-semibold">Musik</div>
    <a class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium inline-flex items-center" href="/music">
      Bibliothek
    </a>
  </div>

  <div class="flex items-center gap-3">
    <div class="h-12 w-12 overflow-hidden rounded-xl border border-white/10 bg-white/5">
      {#if now?.coverUrl}
        <img src={now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
      {/if}
    </div>

    <div class="min-w-0 flex-1">
      {#if now}
        <div class="text-sm font-medium truncate">{now.title}</div>
        <div class="text-white/50 text-xs truncate">{now.artist} — {now.album}</div>
        <div class="mt-2 flex items-center justify-between gap-2">
          <div class="text-white/40 text-xs">{playing ? 'Wiedergabe läuft' : 'Pausiert'}</div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/15 inline-flex items-center justify-center disabled:opacity-50"
              on:click={playPrev}
              aria-label="Zurück"
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M6 5h2v14H6V5zm14 0L10 12l10 7V5z" />
              </svg>
            </button>

            <button
              type="button"
              class="h-8 w-10 rounded-lg bg-white/10 hover:bg-white/15 inline-flex items-center justify-center"
              on:click={togglePlayPause}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {#if playing}
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l12-7L8 5z" />
                </svg>
              {/if}
            </button>

            <button
              type="button"
              class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/15 inline-flex items-center justify-center disabled:opacity-50"
              on:click={playNext}
              aria-label="Weiter"
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M16 5h2v14h-2V5zM4 5l10 7-10 7V5z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="mt-2">
          <div class="h-2 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full bg-white/25" style={`width: ${pct}%`}></div>
          </div>
          <div class="mt-1 flex items-center justify-between text-[11px] text-white/40 tabular-nums">
            <div>{fmt(positionSec)}</div>
            <div>{durationSec > 0 ? fmt(durationSec) : '--:--'}</div>
          </div>
        </div>
      {:else}
        <div class="text-white/70 text-sm">Keine Wiedergabe</div>
        <div class="text-white/40 text-xs">Öffne die Bibliothek zum Abspielen.</div>
      {/if}
    </div>
  </div>
</div>
