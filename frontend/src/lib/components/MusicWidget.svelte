<script lang="ts">
  import { musicPlayerState } from '$lib/stores/musicPlayer';

  $: now = $musicPlayerState.now;
  $: playing = $musicPlayerState.playing;
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
        <div class="text-white/40 text-xs mt-1">{playing ? 'Wiedergabe läuft' : 'Pausiert'}</div>
      {:else}
        <div class="text-white/70 text-sm">Keine Wiedergabe</div>
        <div class="text-white/40 text-xs">Öffne die Bibliothek zum Abspielen.</div>
      {/if}
    </div>
  </div>
</div>
