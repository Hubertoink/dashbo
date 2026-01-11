<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { NewsFeedId, OutlookConnectionDto, SettingsDto } from '$lib/api';

  import DashboardPreview from '$lib/components/DashboardPreview.svelte';
  import WidgetSettingsCard from '$lib/components/WidgetSettingsCard.svelte';
  import { CLOCK_STYLE_OPTIONS, clockStyleClasses, type ClockStyle } from '$lib/clockStyle';

  export let authed: boolean;
  export let settings: SettingsDto | null;

  export let weatherLocation: string;
  export let weatherSaving: boolean;
  export let weatherError: string | null;
  export let saveWeatherLocation: () => void | Promise<void>;

  export let holidaysEnabled: boolean;
  export let holidaysSaving: boolean;
  export let holidaysError: string | null;
  export let saveHolidays: () => void | Promise<void>;

  export let todoEnabled: boolean;
  export let todoSaving: boolean;
  export let todoError: string | null;
  export let saveTodo: () => void | Promise<void>;

  export let todoListNamesText: string;
  export let todoListNamesSaving: boolean;
  export let todoListNamesError: string | null;
  export let saveTodoListNames: () => void | Promise<void>;

  export let outlookConnections: OutlookConnectionDto[];
  export let todoDefaultConnectionId: number | null;
  export let todoDefaultConnectionSaving: boolean;
  export let todoDefaultConnectionError: string | null;
  export let saveTodoDefaultConnection: () => void | Promise<void>;

  export let newsEnabled: boolean;
  export let newsSaving: boolean;
  export let newsError: string | null;
  export let saveNews: () => void | Promise<void>;

  export let scribbleEnabled: boolean;
  export let scribbleSaving: boolean;
  export let scribbleError: string | null;
  export let saveScribble: () => void | Promise<void>;

  export let scribbleStandbySeconds: number;
  export let scribbleStandbySecondsSaving: boolean;
  export let scribbleStandbySecondsError: string | null;
  export let saveScribbleStandbySeconds: () => void | Promise<void>;

  export let scribblePaperLook: boolean;
  export let scribblePaperLookSaving: boolean;
  export let scribblePaperLookError: string | null;
  export let saveScribblePaperLook: () => void | Promise<void>;

  export let newsFeeds: NewsFeedId[];
  export let newsFeedsSaving: boolean;
  export let newsFeedsError: string | null;
  export let saveNewsFeeds: () => void | Promise<void>;

  export let clockStyle: ClockStyle;
  export let clockStyleSaving: boolean;
  export let clockStyleError: string | null;
  export let saveClockStyle: () => void | Promise<void>;

  export let edgeBaseUrl: string;
  export let edgeToken: string;
  export let edgeSaving: boolean;
  export let edgePlayerWidgetEnabled: boolean;
  export let saveEdgePlayerWidgetEnabled: () => void | Promise<void>;
  export let openEdgeSetup: () => void;

  export let saveEdgeConfig: () => void | Promise<void>;

  export let testEdgeConnection: () => void | Promise<void>;
  export let edgeTestBusy: boolean;
  export let edgeTestMessage: string | null;
  export let edgeTestOk: boolean | null;

  export let scanEdgeNow: () => void | Promise<void>;
  export let edgeScanBusy: boolean;
  export let edgeScanMessage: string | null;

  export let edgeHeosEnabled: boolean;
  export let saveEdgeHeosEnabled: () => void | Promise<void>;
  export let edgeHeosHosts: string;
  export let isLocalhostUrl: (url: string) => boolean;

  export let dashboardGlassBlurEnabled: boolean;
  export let saveDashboardGlassBlurEnabled: () => void | Promise<void>;

  export let dashboardTextStyle: ClockStyle;
  export let saveDashboardTextStyle: () => void | Promise<void>;

  type HeosPlayerDto = { pid: number; name: string; model?: string };
  export let heosGroupPlayers: HeosPlayerDto[];
  export let heosGroupSelected: Record<string, boolean>;
  export let heosGroupBusy: boolean;
  export let heosGroupError: string | null;
  export let heosGroupMessage: string | null;

  type HeosGroupPlayerDto = { name: string; pid: number; role?: 'leader' | 'member' | string };
  type HeosGroupDto = { name: string; gid: number | string; players: HeosGroupPlayerDto[] };
  export let heosGroups: HeosGroupDto[];
  export let heosGroupsLoaded: boolean;
  export let heosGroupsBusy: boolean;
  export let heosGroupsError: string | null;
  export let heosGroupsMessage: string | null;

  export let loadHeosGroups: () => void | Promise<void>;
  export let loadHeosPlayersForGrouping: () => void | Promise<void>;
  export let createHeosGroup: () => void | Promise<void>;
  export let dissolveHeosGroup: () => void | Promise<void>;
  export let dissolveHeosGroupByPid: (pid: number) => void | Promise<void>;
  export let getHeosGroupLeaderPid: (g: HeosGroupDto) => number | null;

  export let showPreview = true;
  export let previewClass = 'mb-6';
  export let highlightWidget: string | null = null;

  function toggleNewsFeed(id: NewsFeedId) {
    if (newsFeeds.includes(id)) newsFeeds = newsFeeds.filter((x) => x !== id);
    else newsFeeds = [...newsFeeds, id];
  }

  function formatOutlookConnectionLabel(c: OutlookConnectionDto): string {
    const displayName = String(c?.displayName || '').trim();
    const email = String(c?.email || '').trim();
    if (displayName && email && !displayName.toLowerCase().includes(email.toLowerCase())) return `${displayName} (${email})`;
    return displayName || email || `Outlook ${c.id}`;
  }

  const DASHBO_TODO_CONNECTION_ID = -1;
  const DASHBO_TODO_CONNECTION = { id: DASHBO_TODO_CONNECTION_ID, label: 'Dashbo', color: 'emerald' } as const;
  let todoDefaultAccountDropdownOpen = false;
  let todoDefaultAccountAnchor: HTMLButtonElement | null = null;
  let todoDefaultAccountMenuStyle = '';

  const TODO_DEFAULT_MENU_MAX_H = 256;

  function updateTodoDefaultAccountMenuPosition() {
    if (!todoDefaultAccountAnchor) return;
    const rect = todoDefaultAccountAnchor.getBoundingClientRect();

    const width = Math.max(200, rect.width);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);

    const preferredTop = rect.bottom + 6;
    const top = Math.min(preferredTop, window.innerHeight - TODO_DEFAULT_MENU_MAX_H - 8);
    const safeTop = Math.max(8, top);

    todoDefaultAccountMenuStyle = `top:${safeTop}px;left:${left}px;width:${width}px;max-height:${TODO_DEFAULT_MENU_MAX_H}px;`;
  }

  async function setTodoDefaultAccountDropdownOpen(next: boolean) {
    todoDefaultAccountDropdownOpen = next;
    if (todoDefaultAccountDropdownOpen) {
      await tick();
      updateTodoDefaultAccountMenuPosition();
      window.addEventListener('resize', updateTodoDefaultAccountMenuPosition);
      window.addEventListener('scroll', updateTodoDefaultAccountMenuPosition, true);
    } else {
      window.removeEventListener('resize', updateTodoDefaultAccountMenuPosition);
      window.removeEventListener('scroll', updateTodoDefaultAccountMenuPosition, true);
    }
  }

  onDestroy(() => {
    window.removeEventListener('resize', updateTodoDefaultAccountMenuPosition);
    window.removeEventListener('scroll', updateTodoDefaultAccountMenuPosition, true);
  });

  type TodoAccountOption = { id: number | null; label: string; color?: string };

  function connectionColorClass(name: string | null | undefined) {
    const n = String(name || '').toLowerCase();
    switch (n) {
      case 'cyan':
        return 'bg-cyan-700';
      case 'fuchsia':
        return 'bg-fuchsia-700';
      case 'emerald':
        return 'bg-emerald-700';
      case 'amber':
        return 'bg-amber-700';
      case 'rose':
        return 'bg-rose-700';
      case 'violet':
        return 'bg-violet-700';
      case 'sky':
        return 'bg-sky-700';
      case 'lime':
        return 'bg-lime-700';
      default:
        return 'bg-white/30';
    }
  }

  $: todoDefaultAccountOptions = ((): TodoAccountOption[] => {
    const opts: TodoAccountOption[] = [{ id: null, label: 'Automatisch' }, DASHBO_TODO_CONNECTION];
    for (const c of outlookConnections ?? []) {
      opts.push({ id: c.id, label: formatOutlookConnectionLabel(c), color: c.color });
    }
    return opts;
  })();

  $: selectedTodoDefaultAccount =
    todoDefaultConnectionId == null
      ? todoDefaultAccountOptions[0] ?? null
      : todoDefaultAccountOptions.find((o) => o.id === todoDefaultConnectionId) ?? todoDefaultAccountOptions[0] ?? null;
</script>

<!-- Schematische Dashboard-Vorschau -->
{#if showPreview}
  <div class={previewClass}>
    <DashboardPreview
      weatherEnabled={true}
      todoEnabled={todoEnabled}
      newsEnabled={newsEnabled}
      scribbleEnabled={scribbleEnabled}
      musicEnabled={edgePlayerWidgetEnabled}
      {highlightWidget}
    />
  </div>
{/if}

<div class="space-y-4">
  <!-- Dashboard (optional blur) -->
  <WidgetSettingsCard
    title="Dashboard"
    icon="▦"
    kicker="dashboard"
    enabled={true}
    widgetKey="dashboard"
    saving={false}
    error={null}
    showToggle={false}
    disableContentWhenOff={false}
    on:hover={(e) => (highlightWidget = e.detail.key)}
  >
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="text-sm text-white/80">Glas-Effekt</div>
          <div class="text-xs text-white/50">Optionaler Glas-Effekt im Kalender/Tag-View. Aus = nur transparent.</div>
        </div>

        <button
          type="button"
          class="relative h-6 w-11 rounded-full transition-colors duration-200 {dashboardGlassBlurEnabled
            ? 'bg-cyan-500/60'
            : 'bg-white/20'} disabled:opacity-50"
          on:click={() => {
            if (!authed) return;
            dashboardGlassBlurEnabled = !dashboardGlassBlurEnabled;
            void saveDashboardGlassBlurEnabled();
          }}
          disabled={!authed}
          aria-pressed={dashboardGlassBlurEnabled}
          aria-label="Glas-Effekt {dashboardGlassBlurEnabled ? 'deaktivieren' : 'aktivieren'}"
        >
          <span
            class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 {dashboardGlassBlurEnabled
              ? 'translate-x-5'
              : 'translate-x-0'}"
          ></span>
        </button>
      </div>

      <div>
        <div class="text-sm text-white/80">Schriftstil</div>
        <div class="mt-2 grid grid-cols-2 gap-2">
          {#each CLOCK_STYLE_OPTIONS as opt (opt.id)}
            <button
              type="button"
              class="rounded-lg border px-3 py-2 text-left transition-colors {dashboardTextStyle === opt.id
                ? 'border-white/30 bg-white/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'}"
              on:click={() => (dashboardTextStyle = opt.id)}
              disabled={!authed}
            >
              <div class={`text-2xl leading-none ${clockStyleClasses(opt.id)} text-shadow`}>Mo 30</div>
              <div class="mt-1 text-xs text-white/60">{opt.label}</div>
            </button>
          {/each}
        </div>

        <div class="mt-2 flex items-center gap-2">
          <button
            class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
            on:click={saveDashboardTextStyle}
            disabled={!authed}
          >
            Speichern
          </button>
          <div class="text-xs text-white/40">Gilt für Kalender & Tagesliste.</div>
        </div>
      </div>
    </div>
  </WidgetSettingsCard>

  <!-- Wetter Widget -->
  <WidgetSettingsCard
    title="Wetter & Vorhersage"
    icon="☀"
    kicker="weather"
    enabled={true}
    widgetKey="weather"
    saving={weatherSaving}
    error={weatherError}
    on:hover={(e) => (highlightWidget = e.detail.key)}
  >
    <div class="space-y-3">
      <div class="flex gap-2">
        <input
          class="flex-1 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
          placeholder="Ort (z.B. Berlin)"
          bind:value={weatherLocation}
          disabled={!authed}
        />
        <button
          class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
          on:click={saveWeatherLocation}
          disabled={!authed || weatherSaving}
        >
          Speichern
        </button>
      </div>

      <label class="flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          class="rounded bg-white/10 border-0"
          bind:checked={holidaysEnabled}
          disabled={!authed}
        />
        Feiertage im Kalender anzeigen
        <button
          class="ml-auto h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
          on:click={saveHolidays}
          disabled={!authed || holidaysSaving}
        >
          Speichern
        </button>
      </label>

      {#if holidaysError}
        <div class="text-red-400 text-xs">{holidaysError}</div>
      {/if}
    </div>
  </WidgetSettingsCard>

  <!-- To-Do Widget -->
  <WidgetSettingsCard
    title="To-Do Liste"
    icon="☑"
    kicker="todo"
    enabled={todoEnabled}
    widgetKey="todo"
    saving={todoSaving}
    error={todoError}
    on:toggle={() => {
      todoEnabled = !todoEnabled;
      void saveTodo();
    }}
    on:hover={(e) => (highlightWidget = e.detail.key)}
  >
    <div class="space-y-2">
      <div class="text-sm text-white/80">Outlook Liste(n)</div>

      <div class="space-y-2">
        <textarea
          class="w-full min-h-[72px] px-3 py-2 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
          placeholder="z.B. Dashbo\nInbox"
          bind:value={todoListNamesText}
          disabled={!authed}
        ></textarea>

        <div class="flex items-center gap-2">
          <button
            class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
            on:click={saveTodoListNames}
            disabled={!authed || todoListNamesSaving}
          >
            Speichern
          </button>

          {#if settings?.todoListNames?.length}
            <div class="text-xs text-white/50">Aktuell: {settings.todoListNames.join(', ')}</div>
          {:else if settings?.todoListName}
            <div class="text-xs text-white/50">Aktuell: {settings.todoListName}</div>
          {/if}
        </div>

        {#if todoListNamesError}
          <div class="text-red-400 text-xs">{todoListNamesError}</div>
        {/if}
      </div>

      <div class="pt-2 space-y-2">
        <div class="text-sm text-white/80">Standardkonto (Quick-ToDos im Wochenplaner)</div>

        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <button
              type="button"
              class="w-full h-9 px-3 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90 flex items-center gap-2 disabled:opacity-50"
              disabled={!authed}
              bind:this={todoDefaultAccountAnchor}
              on:click={() => setTodoDefaultAccountDropdownOpen(!todoDefaultAccountDropdownOpen)}
            >
              <span class={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${selectedTodoDefaultAccount?.id == null ? 'bg-white/30' : connectionColorClass(selectedTodoDefaultAccount?.color)}`}></span>
              <span class="flex-1 text-left truncate">{selectedTodoDefaultAccount?.label ?? 'Konto wählen'}</span>
              <span class="text-white/60">▾</span>
            </button>

            {#if todoDefaultAccountDropdownOpen}
              <div
                class="fixed inset-0 z-[999]"
                on:click={() => setTodoDefaultAccountDropdownOpen(false)}
                aria-hidden="true"
              ></div>

              <div
                class="fixed z-[1000] rounded-lg bg-zinc-800 border border-white/10 shadow-lg overflow-auto"
                style={todoDefaultAccountMenuStyle}
              >
                {#each todoDefaultAccountOptions as opt (String(opt.id))}
                  <button
                    type="button"
                    class={`w-full px-3 py-2 flex items-center gap-2 text-sm text-white/90 hover:bg-white/10 transition-colors ${opt.id === todoDefaultConnectionId ? 'bg-white/5' : ''}`}
                    on:click={() => {
                      todoDefaultConnectionId = opt.id;
                      void setTodoDefaultAccountDropdownOpen(false);
                    }}
                  >
                    <span class={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${opt.id == null ? 'bg-white/30' : connectionColorClass(opt.color)}`}></span>
                    <span class="truncate">{opt.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <button
            class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
            on:click={saveTodoDefaultConnection}
            disabled={!authed || todoDefaultConnectionSaving}
          >
            Speichern
          </button>
        </div>

        {#if todoDefaultConnectionError}
          <div class="text-red-400 text-xs">{todoDefaultConnectionError}</div>
        {/if}

        <div class="text-xs text-white/40">
          Wird genutzt, wenn beim Quick-ToDo kein Konto ausgewählt ist.
        </div>
      </div>

      <div class="text-xs text-white/40">Zeigt offene Aufgaben aus deiner Outlook To-Do Liste in der Sidebar.</div>
    </div>
  </WidgetSettingsCard>

  <!-- News Widget -->
  <WidgetSettingsCard
    title="News (RSS)"
    icon="📰"
    kicker="news"
    enabled={newsEnabled}
    widgetKey="news"
    saving={newsSaving}
    error={newsError}
    on:toggle={() => {
      newsEnabled = !newsEnabled;
      void saveNews();
    }}
    on:hover={(e) => (highlightWidget = e.detail.key)}
  >
    <div class="space-y-3">
      <div class="text-sm text-white/80">Feeds</div>

      <div class="grid sm:grid-cols-2 gap-2 text-sm text-white/80">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="rounded bg-white/10 border-0"
            checked={newsFeeds.includes('zeit')}
            disabled={!authed}
            on:change={() => toggleNewsFeed('zeit')}
          />
          ZEIT
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="rounded bg-white/10 border-0"
            checked={newsFeeds.includes('guardian')}
            disabled={!authed}
            on:change={() => toggleNewsFeed('guardian')}
          />
          The Guardian
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="rounded bg-white/10 border-0"
            checked={newsFeeds.includes('newyorker')}
            disabled={!authed}
            on:change={() => toggleNewsFeed('newyorker')}
          />
          The New Yorker
        </label>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            class="rounded bg-white/10 border-0"
            checked={newsFeeds.includes('sz')}
            disabled={!authed}
            on:change={() => toggleNewsFeed('sz')}
          />
          Süddeutsche Zeitung
        </label>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
          on:click={saveNewsFeeds}
          disabled={!authed || newsFeedsSaving}
        >
          Speichern
        </button>

        {#if settings?.newsFeeds?.length}
          <div class="text-xs text-white/50">Aktuell: {settings.newsFeeds.join(', ')}</div>
        {/if}
      </div>

      {#if newsFeedsError}
        <div class="text-red-400 text-xs">{newsFeedsError}</div>
      {/if}

      <div class="text-xs text-white/40">Zeigt aktuelle Schlagzeilen aus den ausgewählten RSS-Feeds in der Sidebar.</div>
    </div>
  </WidgetSettingsCard>

  <!-- Scribble Notes Widget -->
  <WidgetSettingsCard
    title="Scribble Notizen"
    icon="✏️"
    kicker="scribble"
    enabled={scribbleEnabled}
    widgetKey="scribble"
    saving={scribbleSaving}
    error={scribbleError}
    on:toggle={() => {
      scribbleEnabled = !scribbleEnabled;
      void saveScribble();
    }}
    on:hover={(e) => (highlightWidget = e.detail.key)}
  >
    <div class="space-y-2">
      <div class="text-xs text-white/40">
        Ermöglicht handgezeichnete Notizen per Touch oder Stift. Perfekt für schnelle Nachrichten an die Familie.
        Die Notizen werden auf dem Dashboard und im Standby-Modus angezeigt.
      </div>

      <div class="pt-1">
        <div class="text-sm text-white/80">Anzeige-Dauer im Standby</div>
        <div class="mt-2 flex items-center gap-2">
          <input
            type="number"
            min="5"
            max="300"
            step="1"
            class="w-24 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm"
            bind:value={scribbleStandbySeconds}
            disabled={!authed}
          />
          <div class="text-xs text-white/40">Sekunden pro Notiz</div>
          <button
            class="ml-auto h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
            on:click={saveScribbleStandbySeconds}
            disabled={!authed || scribbleStandbySecondsSaving}
          >
            Speichern
          </button>
        </div>

        {#if scribbleStandbySecondsError}
          <div class="mt-2 text-red-400 text-xs">{scribbleStandbySecondsError}</div>
        {/if}
      </div>

      <div class="pt-2">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm text-white/80">Papier-Look</div>
            <div class="text-xs text-white/50">Zeigt Notizen im Standby mit Papier-Textur. Aus = transparent.</div>
          </div>
          <button
            type="button"
            class="relative h-6 w-11 rounded-full transition-colors duration-200 {scribblePaperLook
              ? 'bg-cyan-500/60'
              : 'bg-white/20'} disabled:opacity-50"
            on:click={() => {
              if (!authed) return;
              scribblePaperLook = !scribblePaperLook;
              void saveScribblePaperLook();
            }}
            disabled={!authed || scribblePaperLookSaving}
            aria-pressed={scribblePaperLook}
            aria-label="Papier-Look {scribblePaperLook ? 'deaktivieren' : 'aktivieren'}"
          >
            <span
              class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 {scribblePaperLook
                ? 'translate-x-5'
                : 'translate-x-0'}"
            ></span>
          </button>
        </div>
        {#if scribblePaperLookError}
          <div class="mt-2 text-red-400 text-xs">{scribblePaperLookError}</div>
        {/if}
      </div>
    </div>
  </WidgetSettingsCard>

  <!-- Musik Widget -->
  <WidgetSettingsCard
    title="Musik-Player"
    icon="🎵"
    kicker="music"
    enabled={edgePlayerWidgetEnabled}
    widgetKey="music"
    saving={edgeSaving}
    on:toggle={() => {
      edgePlayerWidgetEnabled = !edgePlayerWidgetEnabled;
      void saveEdgePlayerWidgetEnabled();
    }}
    on:hover={(e) => (highlightWidget = e.detail.key)}
  >
    <div class="space-y-4">
      <!-- Edge-Verbindung -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <div class="text-sm font-medium text-white/80">Edge-Service Verbindung</div>
          <button
            class="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium"
            type="button"
            on:click={openEdgeSetup}
          >
            Setup-Anleitung
          </button>
        </div>
        <div class="text-[11px] text-white/50">Für lokale Musik und HEOS-Steuerung wird der Edge-Service benötigt.</div>

        <div class="grid md:grid-cols-3 gap-2">
          <input
            class="md:col-span-2 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
            placeholder="Edge Base URL (z.B. https://pi.local:8787)"
            bind:value={edgeBaseUrl}
          />
          <button
            class="h-9 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
            on:click={saveEdgeConfig}
            disabled={edgeSaving}
          >
            Speichern
          </button>
        </div>

        <div class="grid md:grid-cols-3 gap-2">
          <input
            class="md:col-span-2 h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
            placeholder="Edge Token (Bearer)"
            bind:value={edgeToken}
          />
        </div>

        <div class="flex items-center gap-2">
          <button
            class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
            on:click={testEdgeConnection}
            disabled={edgeTestBusy || !edgeBaseUrl.trim()}
          >
            Verbindung testen
          </button>

          <button
            class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
            on:click={scanEdgeNow}
            disabled={edgeScanBusy || !edgeBaseUrl.trim()}
            title="Scanne die Musikbibliothek auf dem Edge (force)"
          >
            Rescan starten
          </button>

          {#if edgeTestMessage}
            <div class={edgeTestOk ? 'text-emerald-300 text-xs' : 'text-red-300 text-xs'}>{edgeTestMessage}</div>
          {/if}

          {#if edgeScanMessage}
            <div class="text-white/70 text-xs">{edgeScanMessage}</div>
          {/if}
        </div>
      </div>

      <!-- HEOS Einstellungen -->
      <div class="rounded-xl border border-white/10 bg-white/5 p-3">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-medium text-white/90">HEOS Multi-Room</div>
          <label class="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              class="rounded bg-white/10 border-0"
              bind:checked={edgeHeosEnabled}
              on:change={saveEdgeHeosEnabled}
            />
            Aktiviert
          </label>
        </div>

        {#if edgeHeosEnabled}
          <div class="space-y-3">
            <input
              class="w-full h-9 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
              placeholder="HEOS Speaker IPs (optional, z.B. 192.168.178.24,192.168.178.40)"
              bind:value={edgeHeosHosts}
              on:change={saveEdgeConfig}
            />
            <div class="text-[11px] text-white/50">
              Tipp: Unter Windows/Docker ist SSDP oft blockiert. Mit IPs funktioniert die Speaker-Liste zuverlässig.
            </div>

            {#if edgeBaseUrl.trim() && isLocalhostUrl(edgeBaseUrl)}
              <div class="text-[11px] text-amber-300">
                Hinweis: HEOS Speaker können <span class="font-medium">localhost</span> nicht erreichen. Setze die Edge Base
                URL auf eine LAN-IP/Hostname (z.B. <span class="font-medium">http://192.168.178.X:8787</span>).
              </div>
            {/if}

            <!-- HEOS Gruppen -->
            <div class="pt-2 border-t border-white/10">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium text-white/80">Gruppen</div>
                <div class="flex items-center gap-2">
                  <button
                    class="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium disabled:opacity-50"
                    type="button"
                    on:click={loadHeosGroups}
                    disabled={heosGroupsBusy || heosGroupBusy || !edgeBaseUrl.trim() || !edgeHeosEnabled}
                  >
                    Gruppen laden
                  </button>
                  <button
                    class="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium disabled:opacity-50"
                    type="button"
                    on:click={loadHeosPlayersForGrouping}
                    disabled={heosGroupBusy || !edgeBaseUrl.trim() || !edgeHeosEnabled}
                  >
                    Speaker laden
                  </button>
                </div>
              </div>

              <div class="text-[11px] text-white/50 mt-1">Wähle mehrere Speaker aus. Der erste ausgewählte gilt als Leader.</div>

              {#if heosGroupError}
                <div class="mt-2 text-xs text-red-200">{heosGroupError}</div>
              {/if}

              {#if heosGroupMessage}
                <div class="mt-2 text-xs text-white/70">{heosGroupMessage}</div>
              {/if}

              {#if heosGroupsError}
                <div class="mt-2 text-xs text-red-200">{heosGroupsError}</div>
              {/if}

              {#if heosGroupsMessage}
                <div class="mt-2 text-xs text-white/70">{heosGroupsMessage}</div>
              {/if}

              {#if heosGroups.length > 0}
                <div class="mt-3 rounded-lg border border-white/10 overflow-hidden">
                  <div class="divide-y divide-white/10">
                    {#each heosGroups as g (String(g.gid))}
                      <div class="p-2">
                        <div class="flex items-center gap-2">
                          <div class="min-w-0">
                            <div class="text-sm text-white/90 line-clamp-1">{g.name}</div>
                            <div class="text-[11px] text-white/40 tabular-nums">gid: {g.gid}</div>
                          </div>
                          <button
                            class="ml-auto h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium disabled:opacity-50"
                            type="button"
                            on:click={() => {
                              const leaderPid = getHeosGroupLeaderPid(g);
                              if (leaderPid) void dissolveHeosGroupByPid(leaderPid);
                            }}
                            disabled={heosGroupBusy || !edgeBaseUrl.trim() || !edgeHeosEnabled || !getHeosGroupLeaderPid(g)}
                            title="Gruppe auflösen (Leader)"
                          >
                            Auflösen
                          </button>
                        </div>

                        {#if g.players.length > 0}
                          <div class="mt-2 grid gap-1">
                            {#each g.players as p (p.pid)}
                              <div class="flex items-center gap-2 text-[12px] text-white/75">
                                <span class="min-w-0 line-clamp-1">{p.name}</span>
                                <span class="text-[11px] text-white/40">{String(p.role || '').toLowerCase()}</span>
                                <span class="ml-auto text-[11px] text-white/40 tabular-nums">{p.pid}</span>
                              </div>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {:else if heosGroupsLoaded}
                <div class="mt-3 text-[11px] text-white/50">Keine Gruppen vorhanden.</div>
              {/if}

              {#if heosGroupPlayers.length > 0}
                <div class="mt-3 max-h-40 overflow-auto rounded-lg border border-white/10">
                  <div class="divide-y divide-white/10">
                    {#each heosGroupPlayers as p (p.pid)}
                      <label class="flex items-center gap-2 p-2 text-sm text-white/85">
                        <input
                          type="checkbox"
                          class="rounded bg-white/10 border-0"
                          bind:checked={heosGroupSelected[String(p.pid)]}
                        />
                        <span class="min-w-0 line-clamp-1">{p.name}</span>
                        <span class="ml-auto text-[11px] text-white/40 tabular-nums">{p.pid}</span>
                      </label>
                    {/each}
                  </div>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
                    type="button"
                    on:click={createHeosGroup}
                    disabled={heosGroupBusy || !edgeBaseUrl.trim() || !edgeHeosEnabled}
                  >
                    Gruppe erstellen
                  </button>
                  <button
                    class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium disabled:opacity-50"
                    type="button"
                    on:click={dissolveHeosGroup}
                    disabled={heosGroupBusy || !edgeBaseUrl.trim() || !edgeHeosEnabled}
                  >
                    Gruppe auflösen
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div class="text-[11px] text-white/50">HEOS ist deaktiviert. Aktiviere HEOS, um Speaker zu laden und Gruppen zu steuern.</div>
        {/if}
      </div>

      <div class="text-xs text-white/40">Diese Werte werden nur im Browser (localStorage) gespeichert.</div>
    </div>
  </WidgetSettingsCard>

  <!-- Uhrzeit Widget -->
  <WidgetSettingsCard
    title="Uhrzeit"
    icon="🕒"
    kicker="clock"
    enabled={true}
    widgetKey="clock"
    saving={clockStyleSaving}
    error={clockStyleError}
    showToggle={false}
    on:hover={(e) => (highlightWidget = e.detail.key)}
  >
    <div class="space-y-3">
      <div class="text-sm text-white/80">Stil</div>

      <div class="grid grid-cols-2 gap-2">
        {#each CLOCK_STYLE_OPTIONS as opt (opt.id)}
          <button
            type="button"
            class="rounded-lg border px-3 py-2 text-left transition-colors {clockStyle === opt.id
              ? 'border-white/30 bg-white/10'
              : 'border-white/10 bg-white/5 hover:bg-white/10'}"
            on:click={() => (clockStyle = opt.id)}
            disabled={!authed}
          >
            <div class={`text-2xl leading-none ${clockStyleClasses(opt.id)} text-shadow`}>12:34</div>
            <div class="mt-1 text-xs text-white/60">{opt.label}</div>
          </button>
        {/each}
      </div>

      <div class="flex items-center gap-2">
        <button
          class="h-8 px-3 rounded-lg bg-white/20 hover:bg-white/25 text-xs font-medium disabled:opacity-50"
          on:click={saveClockStyle}
          disabled={!authed || clockStyleSaving}
        >
          Speichern
        </button>

        <div class="text-xs text-white/40">Bestimmt die Uhr im Dashboard und im Standby.</div>
      </div>
    </div>
  </WidgetSettingsCard>
</div>
