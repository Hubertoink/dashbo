<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { HueLightDto, HueRoomDto } from '$lib/api';

  export let open = false;
  export let tone: 'light' | 'dark' = 'light';
  export let loading = false;
  export let error: string | null = null;
  export let lights: HueLightDto[] = [];
  export let rooms: HueRoomDto[] = [];

  export let onClose: () => void;
  export let onRefresh: () => void | Promise<void>;
  export let onToggle: (id: string, on: boolean) => void | Promise<void>;
  export let onSetBrightness: (id: string, brightness: number) => void | Promise<void>;
  export let onSetColor: (id: string, hexColor: string) => void | Promise<void>;
  export let onRoomToggle: (groupedLightId: string, on: boolean) => void | Promise<void>;
  export let onRoomSetBrightness: (groupedLightId: string, brightness: number) => void | Promise<void>;

  type Tab = 'lights' | 'rooms';
  let activeTab: Tab = 'lights';

  /** Debounce brightness slider to avoid flooding the API */
  const brightnessTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  function debouncedBrightness(id: string, value: number) {
    clearTimeout(brightnessTimers[id]);
    brightnessTimers[id] = setTimeout(() => {
      onSetBrightness(id, value);
    }, 250);
  }

  const roomBrightnessTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  function debouncedRoomBrightness(id: string, value: number) {
    clearTimeout(roomBrightnessTimers[id]);
    roomBrightnessTimers[id] = setTimeout(() => {
      onRoomSetBrightness(id, value);
    }, 250);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  $: totalCount = activeTab === 'lights' ? lights.length : rooms.length;
  $: countLabel = activeTab === 'lights'
    ? `${lights.length} ${lights.length === 1 ? 'Lampe' : 'Lampen'}`
    : `${rooms.length} ${rooms.length === 1 ? 'Zimmer' : 'Zimmer'}`;
</script>

<svelte:window on:keydown={open ? handleKeydown : undefined} />

{#if open}
  <div class="fixed inset-0 z-[120] hidden md:flex" role="dialog" aria-modal="true" aria-label="Hue Lampen">
    <!-- Backdrop -->
    <button
      type="button"
      class={`absolute inset-0 backdrop-blur-sm ${tone === 'dark' ? 'bg-black/35' : 'bg-black/60'}`}
      aria-label="Schließen"
      on:click={onClose}
      transition:fade={{ duration: 250 }}
    ></button>

    <!-- Panel -->
    <div
      class={`relative w-[420px] max-w-[90vw] h-full backdrop-blur-xl overflow-hidden flex flex-col ${tone === 'dark' ? 'hue-tone-dark border-r border-black/10 bg-white/95 text-zinc-900' : 'hue-tone-light border-r border-white/10 bg-zinc-950/[.97] text-white'}`}
      transition:fly={{ x: -420, duration: 380, easing: cubicOut }}
    >
      <!-- Header -->
      <div class="shrink-0 px-6 pt-6 pb-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="h-9 w-9 rounded-xl bg-amber-400/15 flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="h-5 w-5 text-amber-300" fill="currentColor">
                <path d="M9 21h6v-1H9v1zm3-19C8.69 2 6 4.69 6 8c0 2.39 1.42 4.44 3.46 5.39.33.15.54.49.54.86V16h4v-1.75c0-.37.21-.71.54-.86A5.99 5.99 0 0 0 18 8c0-3.31-2.69-6-6-6z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-white leading-tight">Philips Hue</h3>
              <p class="text-[11px] text-white/45 mt-0.5">{countLabel}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="h-8 w-8 rounded-lg bg-white/8 hover:bg-white/14 text-white/60 hover:text-white/90 flex items-center justify-center transition-all duration-200"
              title="Aktualisieren"
              on:click={onRefresh}
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
            <button
              type="button"
              class="h-8 w-8 rounded-lg bg-white/8 hover:bg-white/14 text-white/60 hover:text-white/90 flex items-center justify-center transition-all duration-200"
              aria-label="Schließen"
              on:click={onClose}
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="mx-6 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent"></div>

      <!-- Tabs -->
      <div class="shrink-0 px-6 pt-3 pb-1 flex gap-1">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 {activeTab === 'lights' ? 'bg-amber-400/15 text-amber-300' : 'text-white/45 hover:text-white/70 hover:bg-white/5'}"
          on:click={() => (activeTab = 'lights')}
        >
          <span class="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
              <path d="M9 21h6v-1H9v1zm3-19C8.69 2 6 4.69 6 8c0 2.39 1.42 4.44 3.46 5.39.33.15.54.49.54.86V16h4v-1.75c0-.37.21-.71.54-.86A5.99 5.99 0 0 0 18 8c0-3.31-2.69-6-6-6z"/>
            </svg>
            Lampen
          </span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 {activeTab === 'rooms' ? 'bg-amber-400/15 text-amber-300' : 'text-white/45 hover:text-white/70 hover:bg-white/5'}"
          on:click={() => (activeTab = 'rooms')}
        >
          <span class="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            Zimmer
          </span>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-6 py-4 scroll-smooth" style="scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;">
        {#if loading && lights.length === 0 && rooms.length === 0}
          <div class="flex flex-col items-center justify-center py-16 gap-3">
            <div class="h-8 w-8 rounded-full border-2 border-white/20 border-t-amber-300 animate-spin"></div>
            <span class="text-sm text-white/50">{activeTab === 'lights' ? 'Lade Lampen…' : 'Lade Zimmer…'}</span>
          </div>
        {:else}
          {#if error}
            <div class="mb-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300 flex items-start gap-2">
              <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 mt-0.5" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              <span>{error}</span>
            </div>
          {/if}

          <!-- LIGHTS TAB -->
          {#if activeTab === 'lights'}
            {#if lights.length === 0 && !loading}
              <div class="flex flex-col items-center justify-center py-16 gap-3 text-white/45">
                <svg viewBox="0 0 24 24" class="h-10 w-10" fill="currentColor" opacity="0.3">
                  <path d="M9 21h6v-1H9v1zm3-19C8.69 2 6 4.69 6 8c0 2.39 1.42 4.44 3.46 5.39.33.15.54.49.54.86V16h4v-1.75c0-.37.21-.71.54-.86A5.99 5.99 0 0 0 18 8c0-3.31-2.69-6-6-6z"/>
                </svg>
                <span class="text-sm">Keine Lampen gefunden</span>
              </div>
            {:else}
              <div class="space-y-3">
                {#each lights as light, i (light.id)}
                  <div
                    class="group rounded-2xl border transition-all duration-300 {light.on ? 'border-amber-400/20 bg-amber-400/[.06]' : 'border-white/8 bg-white/[.03]'} p-4"
                    style="animation: lightCardIn {180 + i * 60}ms {i * 40}ms both cubic-bezier(.22,1,.36,1)"
                  >
                    <!-- Top row: name + toggle -->
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-3 min-w-0">
                        <!-- Color dot indicator -->
                        <div
                          class="h-3 w-3 shrink-0 rounded-full transition-all duration-500 shadow-sm"
                          style="background-color: {light.on ? (light.colorHex || '#FBBF24') : '#3f3f46'}; box-shadow: {light.on ? `0 0 8px ${light.colorHex || '#FBBF24'}40` : 'none'};"
                        ></div>
                        <span class="text-sm font-medium truncate transition-colors duration-300 {light.on ? 'text-white' : 'text-white/50'}">{light.name}</span>
                      </div>

                      <!-- Toggle switch -->
                      <button
                        type="button"
                        class="relative h-7 w-12 shrink-0 rounded-full transition-all duration-300 {light.on ? 'bg-amber-400/80' : 'bg-white/15'}"
                        on:click={() => onToggle(light.id, !light.on)}
                        role="switch"
                        aria-checked={light.on}
                        aria-label="{light.name} {light.on ? 'ausschalten' : 'einschalten'}"
                      >
                        <div class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 {light.on ? 'translate-x-5' : 'translate-x-0'}"></div>
                      </button>
                    </div>

                    <!-- Brightness + Color (only visible when on) -->
                    {#if light.on}
                      <div class="mt-4 space-y-3" transition:fade={{ duration: 200 }}>
                        <!-- Brightness slider -->
                        <div class="flex items-center gap-3">
                          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-white/35" fill="currentColor">
                            <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5l-1 3h2l-1-3zm0 20l1-3h-2l1 3zM5.64 7.05l2.12 2.12 1.06-1.06L6.7 5.99 5.64 7.05zM18.36 16.95l-2.12-2.12-1.06 1.06 2.12 2.12 1.06-1.06zM2 13h3v-2H2v2zm17 0h3v-2h-3v2zM5.64 16.95l1.06 1.06 2.12-2.12-1.06-1.06-2.12 2.12zM18.36 7.05L17.3 5.99l-2.12 2.12 1.06 1.06 2.12-2.12z"/>
                          </svg>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            value={light.brightness ?? 50}
                            class="hue-range flex-1"
                            on:input={(e) => debouncedBrightness(light.id, Number((e.currentTarget as HTMLInputElement).value))}
                          />
                          <span class="w-9 text-right text-xs tabular-nums text-white/50 font-medium">{light.brightness ?? 0}%</span>
                        </div>

                        <!-- Color picker -->
                        <div class="flex items-center gap-3">
                          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-white/35" fill="currentColor">
                            <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                          </svg>
                          <label class="relative h-8 w-8 rounded-lg overflow-hidden cursor-pointer border border-white/15 transition-all hover:border-white/30 hover:scale-105 active:scale-95">
                            <input
                              type="color"
                              value={light.colorHex || '#FFFFFF'}
                              class="absolute inset-0 opacity-0 cursor-pointer"
                              on:change={(e) => onSetColor(light.id, (e.currentTarget as HTMLInputElement).value)}
                            />
                            <div class="h-full w-full rounded-lg" style="background-color: {light.colorHex || '#FFFFFF'};"></div>
                          </label>
                          <span class="text-xs text-white/30 font-mono">{light.colorHex || '#FFFFFF'}</span>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

          <!-- ROOMS TAB -->
          {:else}
            {#if rooms.length === 0 && !loading}
              <div class="flex flex-col items-center justify-center py-16 gap-3 text-white/45">
                <svg viewBox="0 0 24 24" class="h-10 w-10" fill="currentColor" opacity="0.3">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
                <span class="text-sm">Keine Zimmer gefunden</span>
              </div>
            {:else}
              <div class="space-y-3">
                {#each rooms as room, i (room.id)}
                  <div
                    class="group rounded-2xl border transition-all duration-300 {room.on ? 'border-amber-400/20 bg-amber-400/[.06]' : 'border-white/8 bg-white/[.03]'} p-4"
                    style="animation: lightCardIn {180 + i * 60}ms {i * 40}ms both cubic-bezier(.22,1,.36,1)"
                  >
                    <!-- Top row: name + toggle -->
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-3 min-w-0">
                        <!-- Room icon -->
                        <div
                          class="h-3 w-3 shrink-0 rounded-sm transition-all duration-500 shadow-sm"
                          style="background-color: {room.on ? '#FBBF24' : '#3f3f46'}; box-shadow: {room.on ? '0 0 8px rgba(251,191,36,0.25)' : 'none'};"
                        ></div>
                        <div class="min-w-0">
                          <span class="text-sm font-medium truncate transition-colors duration-300 block {room.on ? 'text-white' : 'text-white/50'}">{room.name}</span>
                          <span class="text-[10px] text-white/30">{room.lightCount} {room.lightCount === 1 ? 'Lampe' : 'Lampen'}</span>
                        </div>
                      </div>

                      <!-- Toggle switch -->
                      <button
                        type="button"
                        class="relative h-7 w-12 shrink-0 rounded-full transition-all duration-300 {room.on ? 'bg-amber-400/80' : 'bg-white/15'}"
                        on:click={() => room.groupedLightId && onRoomToggle(room.groupedLightId, !room.on)}
                        role="switch"
                        aria-checked={room.on}
                        aria-label="{room.name} {room.on ? 'ausschalten' : 'einschalten'}"
                      >
                        <div class="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 {room.on ? 'translate-x-5' : 'translate-x-0'}"></div>
                      </button>
                    </div>

                    <!-- Brightness (only visible when on) -->
                    {#if room.on && room.groupedLightId}
                      <div class="mt-4" transition:fade={{ duration: 200 }}>
                        <div class="flex items-center gap-3">
                          <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-white/35" fill="currentColor">
                            <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5l-1 3h2l-1-3zm0 20l1-3h-2l1 3zM5.64 7.05l2.12 2.12 1.06-1.06L6.7 5.99 5.64 7.05zM18.36 16.95l-2.12-2.12-1.06 1.06 2.12 2.12 1.06-1.06zM2 13h3v-2H2v2zm17 0h3v-2h-3v2zM5.64 16.95l1.06 1.06 2.12-2.12-1.06-1.06-2.12 2.12zM18.36 7.05L17.3 5.99l-2.12 2.12 1.06 1.06 2.12-2.12z"/>
                          </svg>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            value={room.brightness ?? 50}
                            class="hue-range flex-1"
                            on:input={(e) => room.groupedLightId && debouncedRoomBrightness(room.groupedLightId, Number((e.currentTarget as HTMLInputElement).value))}
                          />
                          <span class="w-9 text-right text-xs tabular-nums text-white/50 font-medium">{room.brightness ?? 0}%</span>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .hue-tone-dark :global(.text-white) {
    color: rgb(24 24 27) !important;
  }

  .hue-tone-dark :global(.text-white\/60) {
    color: rgba(24, 24, 27, 0.62) !important;
  }

  .hue-tone-dark :global(.text-white\/50) {
    color: rgba(24, 24, 27, 0.54) !important;
  }

  .hue-tone-dark :global(.text-white\/45) {
    color: rgba(24, 24, 27, 0.5) !important;
  }

  .hue-tone-dark :global(.text-white\/35) {
    color: rgba(24, 24, 27, 0.42) !important;
  }

  .hue-tone-dark :global(.text-white\/30) {
    color: rgba(24, 24, 27, 0.34) !important;
  }

  .hue-tone-dark :global(.border-white\/10) {
    border-color: rgba(24, 24, 27, 0.16) !important;
  }

  .hue-tone-dark :global(.border-white\/8) {
    border-color: rgba(24, 24, 27, 0.13) !important;
  }

  .hue-tone-dark :global(.bg-white\/8) {
    background-color: rgba(24, 24, 27, 0.08) !important;
  }

  .hue-tone-dark :global(.bg-white\/5) {
    background-color: rgba(24, 24, 27, 0.05) !important;
  }

  .hue-tone-dark :global(.bg-white\/15) {
    background-color: rgba(24, 24, 27, 0.15) !important;
  }

  .hue-tone-dark :global(.bg-white\/\[\.03\]) {
    background-color: rgba(24, 24, 27, 0.04) !important;
  }

  @keyframes lightCardIn {
    from {
      opacity: 0;
      transform: translateX(-12px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Custom range slider styling */
  .hue-range {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 9999px;
    background: linear-gradient(to right, rgba(255,255,255,0.1), rgba(251,191,36,0.5));
    outline: none;
  }
  .hue-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fbbf24;
    cursor: pointer;
    box-shadow: 0 0 6px rgba(251,191,36,0.4);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .hue-range::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 10px rgba(251,191,36,0.6);
  }
  .hue-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fbbf24;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 6px rgba(251,191,36,0.4);
  }
</style>
