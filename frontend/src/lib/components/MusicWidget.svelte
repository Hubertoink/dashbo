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

<!-- Kompaktes Widget mit Cover als Teil des Rahmens -->
<div class="relative rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 overflow-hidden h-[88px]">
  <!-- Cover als Hintergrund-Teil links (1/3 Breite) -->
  <div class="absolute inset-y-0 left-0 w-1/3">
    {#if now?.coverUrl}
      <img src={now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
      <div class="absolute inset-0 bg-gradient-to-r from-transparent to-black/70"></div>
    {:else}
      <div class="h-full w-full bg-white/5 flex items-center justify-center">
        <svg viewBox="0 0 24 24" class="h-8 w-8 text-white/20" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>
    {/if}
  </div>

  <!-- Content rechts über dem Cover hinausragend -->
  <div class="relative h-full flex items-center pl-[36%] pr-3">
    {#if now}
      <div class="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <div class="text-sm font-semibold truncate leading-tight">{now.title}</div>
        <div class="text-white/50 text-xs truncate">{now.artist} — {now.album}</div>
        
        <!-- Progress bar -->
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-[10px] text-white/40 tabular-nums w-7">{fmt(positionSec)}</span>
          <div class="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div class="h-full bg-white/30" style={`width: ${pct}%`}></div>
          </div>
          <span class="text-[10px] text-white/40 tabular-nums w-7 text-right">{durationSec > 0 ? fmt(durationSec) : '--:--'}</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-1 ml-2">
        <button
          type="button"
          class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
          on:click={playPrev}
          aria-label="Zurück"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
            <path d="M6 5h2v14H6V5zm14 0L10 12l10 7V5z" />
          </svg>
        </button>

        <button
          type="button"
          class="h-8 w-8 rounded-lg bg-white/15 hover:bg-white/25 inline-flex items-center justify-center"
          on:click={togglePlayPause}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {#if playing}
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          {:else}
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M8 5v14l12-7L8 5z" />
            </svg>
          {/if}
        </button>

        <button
          type="button"
          class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
          on:click={playNext}
          aria-label="Weiter"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
            <path d="M16 5h2v14h-2V5zM4 5l10 7-10 7V5z" />
          </svg>
        </button>

        <!-- Bibliothek Icon-Button -->
        <a
          class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center ml-1"
          href="/music"
          aria-label="Bibliothek"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
          </svg>
        </a>
      </div>
    {:else}
      <div class="flex-1">
        <div class="text-white/70 text-sm font-medium">Musik</div>
        <div class="text-white/40 text-xs">Keine Wiedergabe</div>
      </div>
      <a
        class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center justify-center"
        href="/music"
        aria-label="Bibliothek"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
        </svg>
      </a>
    {/if}
  </div>
</div>
