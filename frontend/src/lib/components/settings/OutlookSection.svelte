<script lang="ts">
  import type { OutlookConnectionDto, OutlookStatusDto, TagColorKey } from '$lib/api';

  export let authed: boolean;

  export let outlookStatus: OutlookStatusDto | null;
  export let outlookConnections: OutlookConnectionDto[];
  export let outlookError: string | null;
  export let outlookBusy: boolean;

  export let outlookColorMenuFor: number | null;

  export let colorBg: Record<TagColorKey, string>;
  export let colorNames: TagColorKey[];

  export let doOutlookConnect: () => void | Promise<void>;
  export let doOutlookDisconnect: () => void | Promise<void>;
  export let doOutlookDisconnectConnection: (id: number) => void | Promise<void>;
  export let doOutlookSetConnectionColor: (id: number, c: TagColorKey) => void | Promise<void>;

  // Use a more "serious" palette for Outlook connections so it reads differently
  // from tag/person colors.
  const outlookColorBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-700',
    cyan: 'bg-cyan-700',
    emerald: 'bg-emerald-700',
    amber: 'bg-amber-700',
    rose: 'bg-rose-700',
    violet: 'bg-violet-700',
    sky: 'bg-sky-700',
    lime: 'bg-lime-700'
  };

  function outlookDotClass(c: TagColorKey) {
    return outlookColorBg[c] ?? colorBg[c] ?? 'bg-white/30';
  }
</script>

<!-- Outlook (privat, nur anzeigen) -->
<div class="bg-white/5 rounded-xl p-4" id="section-outlook">
  <div class="flex items-center justify-between mb-3">
    <div class="font-medium">Outlook Kalender</div>
    <div class="text-white/50 text-xs">Privat · nur anzeigen</div>
  </div>

  {#if !authed}
    <div class="text-white/40 text-sm">Login erforderlich</div>
  {:else}
    <div class="flex items-center justify-between gap-3">
      <div class="text-sm text-white/70">
        {#if (outlookConnections?.length ?? 0) > 0}
          Verbunden ({outlookConnections.length})
        {:else if outlookStatus?.connected}
          Verbunden
        {:else}
          Nicht verbunden
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <button
          class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
          on:click={doOutlookConnect}
          disabled={outlookBusy}
        >
          {#if (outlookConnections?.length ?? 0) > 0 || outlookStatus?.connected}
            Weiteren verbinden
          {:else}
            Verbinden
          {/if}
        </button>

        {#if outlookStatus?.connected}
          <button
            class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
            on:click={doOutlookDisconnect}
            disabled={outlookBusy}
          >
            Alle trennen
          </button>
        {/if}
      </div>
    </div>

    {#if (outlookConnections?.length ?? 0) > 0}
      <div class="mt-3 space-y-2">
        {#each outlookConnections as c (c.id)}
          <div class="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2">
            <div class="min-w-0 flex items-center gap-3">
              <div class="relative">
                <button
                  type="button"
                  class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium flex items-center gap-2"
                  aria-label="Farbe"
                  disabled={outlookBusy}
                  on:click|stopPropagation={() => (outlookColorMenuFor = outlookColorMenuFor === c.id ? null : c.id)}
                >
                  <span class={`w-3 h-3 rounded-full ${outlookDotClass(c.color as TagColorKey)}`}></span>
                  <span class="text-white/70">Farbe</span>
                  <span class="text-white/50">▼</span>
                </button>

                {#if outlookColorMenuFor === c.id}
                  <div class="absolute z-20 mt-2 w-44 rounded-xl bg-black/80 backdrop-blur border border-white/10 overflow-hidden">
                    {#each colorNames as col}
                      <button
                        class="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-white/10"
                        on:click={() => doOutlookSetConnectionColor(c.id, col as TagColorKey)}
                      >
                        <span class={`w-3 h-3 rounded-full ${outlookDotClass(col)}`}></span>
                        <span class="capitalize">{col}</span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="min-w-0">
                <div class="text-sm font-medium text-white/90 truncate">
                  {c.displayName ?? c.email ?? 'Outlook'}
                </div>
                {#if c.email && c.displayName}
                  <div class="text-xs text-white/50 truncate">{c.email}</div>
                {/if}
              </div>
            </div>

            <button
              class="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
              on:click={() => doOutlookDisconnectConnection(c.id)}
              disabled={outlookBusy}
            >
              Trennen
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if outlookError}
      <div class="mt-2 text-red-400 text-xs">{outlookError}</div>
    {/if}
  {/if}
</div>
