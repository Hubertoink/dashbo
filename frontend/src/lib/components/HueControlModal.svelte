<script lang="ts">
  import type { HueLightDto } from '$lib/api';

  export let open = false;
  export let loading = false;
  export let error: string | null = null;
  export let lights: HueLightDto[] = [];

  export let onClose: () => void;
  export let onRefresh: () => void | Promise<void>;
  export let onToggle: (id: string, on: boolean) => void | Promise<void>;
  export let onSetBrightness: (id: string, brightness: number) => void | Promise<void>;
  export let onSetColor: (id: string, hexColor: string) => void | Promise<void>;
</script>

{#if open}
  <div class="fixed inset-0 z-[120] hidden md:block" role="dialog" aria-modal="true" aria-label="Hue Lampen">
    <button type="button" class="absolute inset-0 bg-black/55" aria-label="Schließen" on:click={onClose}></button>

    <div class="absolute inset-y-0 left-0 w-[46%] max-w-[680px] border-r border-white/10 bg-zinc-950/95 backdrop-blur-md p-4 overflow-auto">
      <div class="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 class="text-lg font-semibold text-white">Philips Hue</h3>
          <div class="text-xs text-white/50">Lampen steuern</div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/20 text-xs font-medium"
            on:click={onRefresh}
          >
            Aktualisieren
          </button>
          <button
            type="button"
            class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/15 text-white/80"
            aria-label="Schließen"
            on:click={onClose}
          >
            ✕
          </button>
        </div>
      </div>

      {#if loading}
        <div class="text-sm text-white/70">Lade Lampen…</div>
      {:else}
        {#if error}
          <div class="text-sm text-rose-300 mb-3">{error}</div>
        {/if}

        {#if lights.length === 0}
          <div class="text-sm text-white/60">Keine Lampen gefunden.</div>
        {:else}
          <div class="space-y-3">
            {#each lights as light (light.id)}
              <div class="rounded-xl border border-white/10 bg-white/5 p-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-sm font-medium text-white truncate">{light.name}</div>
                  <button
                    type="button"
                    class={`h-8 px-3 rounded-lg text-xs font-medium transition ${light.on ? 'bg-emerald-500/25 text-emerald-200 hover:bg-emerald-500/35' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    on:click={() => onToggle(light.id, !light.on)}
                  >
                    {light.on ? 'An' : 'Aus'}
                  </button>
                </div>

                <div class="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/80"
                    on:click={() => onSetBrightness(light.id, Math.max(1, (light.brightness ?? 50) - 10))}
                  >
                    −
                  </button>

                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={light.brightness ?? 50}
                    class="flex-1 accent-emerald-400"
                    on:change={(e) => onSetBrightness(light.id, Number((e.currentTarget as HTMLInputElement).value))}
                  />

                  <button
                    type="button"
                    class="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/80"
                    on:click={() => onSetBrightness(light.id, Math.min(100, (light.brightness ?? 50) + 10))}
                  >
                    +
                  </button>

                  <div class="w-10 text-right text-xs text-white/60">{light.brightness ?? 0}%</div>
                </div>

                <div class="mt-3 flex items-center gap-2">
                  <div class="text-xs text-white/60">Farbe</div>
                  <input
                    type="color"
                    value={light.colorHex || '#FFFFFF'}
                    class="h-8 w-12 rounded border border-white/20 bg-transparent"
                    on:change={(e) => onSetColor(light.id, (e.currentTarget as HTMLInputElement).value)}
                  />
                  <div class="text-xs text-white/40">{light.colorHex || '#FFFFFF'}</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
