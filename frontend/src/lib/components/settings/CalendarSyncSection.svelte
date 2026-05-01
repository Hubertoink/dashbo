<script lang="ts">
  import type { CalendarSyncFeedDto } from '$lib/api';

  export let authed: boolean;
  export let isAdmin: boolean;
  export let calendarSyncFeed: CalendarSyncFeedDto | null;
  export let calendarSyncBusy: boolean;
  export let calendarSyncError: string | null;

  export let doEnableCalendarSyncFeed: () => void | Promise<void>;
  export let doRegenerateCalendarSyncFeed: () => void | Promise<void>;
  export let doDisableCalendarSyncFeed: () => void | Promise<void>;
  export let copyCalendarSyncUrl: (kind: 'webcal' | 'https') => void | Promise<void>;

  $: feedEnabled = Boolean(calendarSyncFeed?.enabled && calendarSyncFeed?.url);
  $: displayUrl = calendarSyncFeed?.webcalUrl || calendarSyncFeed?.url || '';

  function formatSyncDate(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  }
</script>

<div class="bg-white/5 rounded-xl p-4" id="section-calendar-sync">
  <div class="flex items-center justify-between gap-3 mb-3">
    <div>
      <div class="font-medium">Kalender-Synchronisierung</div>
      <div class="text-xs text-white/45 mt-0.5">Outlook · Google · Apple Calendar</div>
    </div>
    <div class="text-xs rounded-full px-2 py-1 {feedEnabled ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/45'}">
      {feedEnabled ? 'Aktiv' : 'Aus'}
    </div>
  </div>

  {#if !authed}
    <div class="text-white/40 text-sm">Login erforderlich</div>
  {:else if !isAdmin}
    <div class="text-white/50 text-sm">Nur Admins können den Kalender-Feed verwalten.</div>
  {:else}
    {#if feedEnabled}
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <input
            class="min-w-0 flex-1 h-9 px-3 rounded-lg bg-black/20 border border-white/10 text-xs text-white/70 font-mono"
            readonly
            value={displayUrl}
            aria-label="Kalender-Feed-Link"
          />
          <button
            class="h-9 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
            on:click={() => copyCalendarSyncUrl('webcal')}
            disabled={calendarSyncBusy}
          >
            Webcal kopieren
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium disabled:opacity-50"
            on:click={() => copyCalendarSyncUrl('https')}
            disabled={calendarSyncBusy}
          >
            HTTPS kopieren
          </button>
          <button
            class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium disabled:opacity-50"
            on:click={doRegenerateCalendarSyncFeed}
            disabled={calendarSyncBusy}
          >
            Neu generieren
          </button>
          <button
            class="h-9 px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/20 text-xs font-medium text-rose-100 disabled:opacity-50"
            on:click={doDisableCalendarSyncFeed}
            disabled={calendarSyncBusy}
          >
            Deaktivieren
          </button>
        </div>

        {#if calendarSyncFeed?.updatedAt}
          <div class="text-[11px] text-white/40">Aktualisiert: {formatSyncDate(calendarSyncFeed.updatedAt)}</div>
        {/if}
      </div>
    {:else}
      <div class="flex items-center justify-between gap-3">
        <div class="text-sm text-white/60">Kein Kalender-Feed aktiv</div>
        <button
          class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
          on:click={doEnableCalendarSyncFeed}
          disabled={calendarSyncBusy}
        >
          {calendarSyncBusy ? 'Aktiviere…' : 'Feed aktivieren'}
        </button>
      </div>
    {/if}

    <div class="mt-3 text-[11px] text-white/45">
      Abonnierte Kalender aktualisieren den Feed selbstständig; das Abrufintervall bestimmt die jeweilige Kalender-App.
    </div>

    {#if calendarSyncError}
      <div class="mt-2 text-red-400 text-xs">{calendarSyncError}</div>
    {/if}
  {/if}
</div>