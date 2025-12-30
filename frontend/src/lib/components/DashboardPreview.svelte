<script lang="ts">
  export let weatherEnabled = true;
  export let todoEnabled = true;
  export let newsEnabled = false;
  export let musicEnabled = false;

  // Highlight which widget the user is hovering/focusing
  export let highlightWidget: string | null = null;
</script>

<!-- Schematische Dashboard-Vorschau -->
<div class="rounded-xl border border-white/10 bg-white/5 p-4">
  <div class="text-xs text-white/50 mb-3 font-medium uppercase tracking-wide">Dashboard Vorschau</div>

  <div class="flex gap-3 min-h-40">
    <!-- Linke Sidebar -->
    <div class="w-28 flex flex-col gap-1.5 shrink-0">
      <!-- Wetter -->
      <div
        class="rounded-lg px-2 py-1.5 text-[10px] transition-all duration-150 {weatherEnabled
          ? 'bg-white/15 text-white/90'
          : 'bg-white/5 text-white/30'} {highlightWidget === 'weather' ? 'ring-2 ring-cyan-400/60' : ''}"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-sm">☀</span>
          <span>Wetter</span>
        </div>
      </div>

      <!-- To-Do -->
      <div
        class="rounded-lg px-2 py-1.5 text-[10px] transition-all duration-150 {todoEnabled
          ? 'bg-white/15 text-white/90'
          : 'bg-white/5 text-white/30'} {highlightWidget === 'todo' ? 'ring-2 ring-cyan-400/60' : ''}"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-sm">☑</span>
          <span>To-Do</span>
        </div>
      </div>

      <!-- News -->
      <div
        class="rounded-lg px-2 py-1.5 text-[10px] transition-all duration-150 {newsEnabled
          ? 'bg-white/15 text-white/90'
          : 'bg-white/5 text-white/30'} {highlightWidget === 'news' ? 'ring-2 ring-cyan-400/60' : ''}"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-sm">📰</span>
          <span>News</span>
        </div>
      </div>

      <!-- Musik -->
      <div
        class="rounded-lg px-2 py-1.5 text-[10px] transition-all duration-150 {musicEnabled
          ? 'bg-white/15 text-white/90'
          : 'bg-white/5 text-white/30'} {highlightWidget === 'music' ? 'ring-2 ring-cyan-400/60' : ''}"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-sm">🎵</span>
          <span>Musik</span>
        </div>
      </div>

      <!-- Uhr (immer aktiv) -->
      <div
        class="mt-auto rounded-lg px-2 py-1.5 text-[10px] bg-white/15 text-white/90 {highlightWidget === 'clock'
          ? 'ring-2 ring-cyan-400/60'
          : ''}"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-sm">🕐</span>
          <span>Uhr</span>
        </div>
      </div>
    </div>

    <!-- Rechte Seite: Kalender -->
      <div
        class="flex-1 rounded-lg bg-white/10 flex items-center justify-center transition-all duration-150 {highlightWidget === 'dashboard' || highlightWidget === 'calendar'
          ? 'ring-2 ring-cyan-400/60'
          : ''}"
      >
      <div class="text-center">
        <div class="text-2xl mb-1 opacity-40">📅</div>
        <div class="text-[10px] text-white/40">Kalender</div>
      </div>
    </div>
  </div>

  <div class="mt-3 text-[10px] text-white/40">
    Die linke Sidebar zeigt die aktiven Widgets. Deaktivierte Widgets werden ausgeblendet.
  </div>
</div>
