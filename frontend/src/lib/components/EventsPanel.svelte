<script lang="ts">
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { fetchTodos, type TodoItemDto } from '$lib/api';
  import type { DashboardSuggestionDto } from '$lib/components/CalendarMonth.svelte';
  import { fade, fly } from 'svelte/transition';
  import { onDestroy } from 'svelte';
  import { formatGermanShortDate, sameDay, startOfDay, endOfDay } from '$lib/date';

  export let selectedDate: Date;
  export let events: EventDto[];
  export let holidays: HolidayDto[] = [];
  export let suggestions: DashboardSuggestionDto[] = [];
  export let onCreate: () => void;
  export let onCreateFromSuggestion: ((s: DashboardSuggestionDto) => void) | null = null;
  export let onDismissSuggestion: ((s: DashboardSuggestionDto) => void) | null = null;
  export let onEdit: (e: EventDto) => void;
  export let onSelectDate: ((d: Date) => void) | null = null;

  let panelActivated = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  let editPromptFor: string | null = null;
  let editPromptTimer: ReturnType<typeof setTimeout> | null = null;

  let searchOpen = false;
  let searchQuery = '';
  let searchBusy = false;
  let searchError: string | null = null;
  let searchInputEl: HTMLInputElement | null = null;

  let todosIndex: TodoItemDto[] = [];
  let todosLoadedAt = 0;
  const TODOS_INDEX_TTL_MS = 60_000;
  const SEARCH_MAX_RESULTS = 60;

  $: isToday = sameDay(selectedDate, new Date());
  $: header = isToday ? 'HEUTE' : formatGermanShortDate(selectedDate);

  function open() {
    onCreate();
  }

  function activatePanel() {
    panelActivated = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (searchOpen) return;
      panelActivated = false;
      hideTimer = null;
    }, 10_000);
  }

  async function ensureTodosLoaded(force = false) {
    const fresh = !force && todosLoadedAt > 0 && Date.now() - todosLoadedAt < TODOS_INDEX_TTL_MS;
    if (fresh || searchBusy) return;

    searchBusy = true;
    searchError = null;
    try {
      const data = await fetchTodos();
      todosIndex = Array.isArray(data?.items) ? data.items : [];
      todosLoadedAt = Date.now();
    } catch (e: any) {
      searchError = e?.message ? String(e.message) : 'Todos konnten nicht geladen werden.';
    } finally {
      searchBusy = false;
    }
  }

  function openSearch() {
    panelActivated = true;
    searchOpen = true;
    void ensureTodosLoaded();
    setTimeout(() => searchInputEl?.focus(), 0);
  }

  function closeSearch() {
    searchOpen = false;
    searchError = null;
  }

  function normalizeForSearch(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function tokenizeSearch(value: string): string[] {
    return normalizeForSearch(value)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function formatDateTimeLabel(iso: string | null | undefined) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDateLabel(iso: string | null | undefined) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function formatTodoMeta(todo: TodoItemDto) {
    const due = formatDateLabel(todo.dueAt ?? null);
    const state = todo.completed ? 'Erledigt' : 'Offen';
    const list = todo.listId?.startsWith('dashbo:') ? 'Dashbo' : todo.connectionLabel || 'Todo';
    if (due) return `${list} · ${state} · Fällig ${due}`;
    return `${list} · ${state}`;
  }

  function formatEventMeta(event: EventDto) {
    const when = event.allDay
      ? `${formatDateLabel(event.startAt)} · Ganztägig`
      : formatDateTimeLabel(event.startAt);
    const where = event.location ? ` · ${event.location}` : '';
    return `${when}${where}`;
  }

  type SearchResultItem = {
    kind: 'event' | 'todo';
    key: string;
    title: string;
    subtitle: string;
    meta: string;
    rank: number;
    timestamp: number;
    event?: EventDto;
    todo?: TodoItemDto;
  };

  function scoreTokens(haystack: string, tokens: string[]) {
    if (tokens.length === 0) return 0;
    let score = 0;
    for (const token of tokens) {
      const idx = haystack.indexOf(token);
      if (idx < 0) return -1;
      score += idx === 0 ? 16 : idx < 30 ? 10 : 6;
      score += Math.min(8, token.length);
    }
    return score;
  }

  $: searchTokens = tokenizeSearch(searchQuery);

  $: searchResults = (() => {
    if (searchTokens.length === 0) return [] as SearchResultItem[];
    const out: SearchResultItem[] = [];

    for (const event of events) {
      const persons = event.persons && event.persons.length > 0
        ? event.persons.map((p) => p.name).join(' ')
        : event.person?.name || '';
      const haystack = normalizeForSearch([
        event.title,
        event.description,
        event.location,
        event.tag?.name,
        persons,
        formatDateLabel(event.startAt)
      ].join(' '));
      const tokenScore = scoreTokens(haystack, searchTokens);
      if (tokenScore < 0) continue;

      const startTs = new Date(event.startAt).getTime();
      const isUpcoming = Number.isFinite(startTs) && startTs >= Date.now();
      const rank = tokenScore + (isUpcoming ? 8 : 0);

      out.push({
        kind: 'event',
        key: `event:${event.occurrenceId ?? `${event.id}:${event.startAt}`}`,
        title: event.title,
        subtitle: event.description || event.location || '',
        meta: formatEventMeta(event),
        rank,
        timestamp: Number.isFinite(startTs) ? startTs : 0,
        event
      });
    }

    for (const todo of todosIndex) {
      const haystack = normalizeForSearch([
        todo.title,
        todo.bodyPreview,
        todo.connectionLabel,
        todo.listId,
        formatDateLabel(todo.dueAt)
      ].join(' '));
      const tokenScore = scoreTokens(haystack, searchTokens);
      if (tokenScore < 0) continue;

      const dueTs = todo.dueAt ? new Date(todo.dueAt).getTime() : 0;
      const rank = tokenScore + (todo.completed ? 0 : 5);

      out.push({
        kind: 'todo',
        key: `todo:${todo.connectionId}:${todo.listId}:${todo.taskId}`,
        title: todo.title,
        subtitle: todo.bodyPreview || '',
        meta: formatTodoMeta(todo),
        rank,
        timestamp: Number.isFinite(dueTs) ? dueTs : 0,
        todo
      });
    }

    return out
      .sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;
        const aTs = a.timestamp || Number.POSITIVE_INFINITY;
        const bTs = b.timestamp || Number.POSITIVE_INFINITY;
        return aTs - bTs;
      })
      .slice(0, SEARCH_MAX_RESULTS);
  })();

  function onSelectSearchResult(item: SearchResultItem) {
    if (item.kind === 'event' && item.event) {
      const start = new Date(item.event.startAt);
      if (!Number.isNaN(start.getTime())) onSelectDate?.(start);
      if (item.event.source !== 'outlook') onEdit(item.event);
    } else if (item.kind === 'todo' && item.todo?.dueAt) {
      const due = new Date(item.todo.dueAt);
      if (!Number.isNaN(due.getTime())) onSelectDate?.(due);
    }
    closeSearch();
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      onSelectSearchResult(searchResults[0]);
    }
  }

  onDestroy(() => {
    if (hideTimer) clearTimeout(hideTimer);
    if (editPromptTimer) clearTimeout(editPromptTimer);
  });

  function requestEdit(e: EventDto) {
    if (e.source === 'outlook') return;
    const key = e.occurrenceId ?? `${e.id}:${e.startAt}`;

    if (editPromptFor === key) {
      editPromptFor = null;
      if (editPromptTimer) {
        clearTimeout(editPromptTimer);
        editPromptTimer = null;
      }
      onEdit(e);
      return;
    }

    editPromptFor = key;
    if (editPromptTimer) clearTimeout(editPromptTimer);
    editPromptTimer = setTimeout(() => {
      editPromptFor = null;
      editPromptTimer = null;
    }, 3000);
  }

  $: dayStart = startOfDay(selectedDate);
  $: dayEnd = endOfDay(selectedDate);

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && hexRe.test(value);
  }

  function dateKeyLocal(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  $: dayHolidays = holidays
    .filter((h) => {
      const hd = new Date(`${h.date}T00:00:00`);
      return dateKeyLocal(hd) === dateKeyLocal(selectedDate);
    })
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));

  $: dayEvents = events
    .filter((e) => {
      const s = new Date(e.startAt);
      const end = e.endAt ? new Date(e.endAt) : null;

      // If no end time is set, treat event as point-in-time on its start day only.
      if (!end) return s >= dayStart && s <= dayEnd;

      // Otherwise include if it overlaps the selected day.
      return s <= dayEnd && end >= dayStart;
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  function sameDayLocal(a: Date, b: Date) {
    return dateKeyLocal(a) === dateKeyLocal(b);
  }

  $: daySuggestions = (suggestions ?? []).filter((s) => sameDayLocal(s.date, selectedDate));

  $: hasAnyItems = dayEvents.length > 0 || dayHolidays.length > 0 || daySuggestions.length > 0;

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTimeRange(startIso: string, endIso: string | null) {
    const start = fmtTime(startIso);
    if (endIso) return `${start} - ${fmtTime(endIso)} Uhr`;
    return `${start} Uhr`;
  }

  function fmtHHMMRange(startHHMM: string, endHHMM?: string) {
    if (!startHHMM) return '';
    if (endHHMM) return `${startHHMM} - ${endHHMM} Uhr`;
    return `${startHHMM} Uhr`;
  }

  const dotBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500',
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    violet: 'bg-violet-400',
    sky: 'bg-sky-400',
    lime: 'bg-lime-400'
  };

  const textFg: Record<TagColorKey, string> = {
    fuchsia: 'text-fuchsia-300',
    cyan: 'text-cyan-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-200',
    rose: 'text-rose-300',
    violet: 'text-violet-300',
    sky: 'text-sky-300',
    lime: 'text-lime-300'
  };

  function yyyymmddLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isMultiDayEvent(e: EventDto) {
    if (!e.endAt) return false;
    const s = new Date(e.startAt);
    const end = new Date(e.endAt);
    return yyyymmddLocal(s) !== yyyymmddLocal(end);
  }

  function fmtDateRange(e: EventDto) {
    if (!e.endAt) return '';
    const s = new Date(e.startAt);
    const end = new Date(e.endAt);
    return `${formatGermanShortDate(s)} – ${formatGermanShortDate(end)}`;
  }
</script>

<svelte:window on:keydown={searchOpen ? onSearchKeydown : undefined} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="h-full flex flex-col min-h-0 px-6 md:px-8 py-3" on:click={activatePanel}>
  <div class="flex items-end justify-between gap-6 shrink-0">
    <div class="grid">
      {#key header}
        <div
          class="text-2xl md:text-3xl font-semibold tracking-wide col-start-1 row-start-1"
          in:fly={{ y: 8, duration: 140 }}
          out:fade={{ duration: 120 }}
        >
          {header}
        </div>
      {/key}
    </div>

    {#if panelActivated}
      <div class="fixed right-6 bottom-6 z-40 flex flex-col items-center gap-2" in:fly={{ y: 10, duration: 180 }} out:fade={{ duration: 120 }}>
        <button
          type="button"
          class="h-14 w-14 rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 active:scale-95 backdrop-blur-md transition-all duration-150 grid place-items-center"
          aria-label="Suche"
          title="Termine und Todos suchen"
          on:click|stopPropagation={openSearch}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        <button
          type="button"
          class="h-14 w-14 rounded-2xl bg-white/15 hover:bg-white/20 active:bg-white/25 active:scale-95 backdrop-blur-md text-3xl font-semibold transition-all duration-150"
          aria-label="Neuen Termin"
          on:click|stopPropagation={open}
        >
          +
        </button>
        <a
          href="/settings"
          class="h-14 w-14 rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 active:scale-95 backdrop-blur-md transition-all duration-150 grid place-items-center"
          aria-label="Settings"
          on:click|stopPropagation
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      </div>
    {/if}
  </div>

  <div class="mt-2 flex-1 min-h-0 overflow-hidden">
    <div class="grid h-full">
      {#key selectedDate.toDateString()}
        <div class="col-start-1 row-start-1 h-full" in:fade={{ duration: 180 }} out:fade={{ duration: 160 }}>
          <div class="h-full overflow-y-auto pr-1">
            {#if !hasAnyItems}
              <div class="text-white/60 text-sm">Keine Termine.</div>
            {:else}
              <div class="flex flex-wrap gap-x-6 gap-y-2 items-start">
                {#each daySuggestions as s (s.suggestionKey)}
                  {@const ps = s.persons && s.persons.length > 0 ? s.persons : s.person ? [s.person] : []}
                  <div class="relative group/sugg" in:fly={{ y: 4, duration: 120 }}>
                    <button
                      type="button"
                      class="flex items-center gap-2 max-w-full px-3 py-2 pr-10 rounded-2xl border border-dashed border-violet-400/40 bg-violet-500/10 text-left hover:bg-violet-500/15 active:bg-violet-500/20 transition"
                      on:click|stopPropagation={() => onCreateFromSuggestion?.(s)}
                      aria-label="Vorschlag übernehmen"
                    >
                      <div class="h-3 w-3 rounded-full border border-dashed border-violet-300/70 shrink-0"></div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                          <div class="text-base md:text-lg font-semibold leading-tight truncate">{s.title}</div>
                          <div class="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200/90 border border-violet-400/30 font-semibold">Vorschlag</div>
                        </div>
                        <div class="text-white/50 text-xs leading-tight">
                          {#if s.allDay}
                            Ganztägig
                          {:else if s.startTime}
                            {fmtHHMMRange(s.startTime, s.endTime)}
                          {:else}
                            Uhrzeit wie üblich
                          {/if}
                          {#if s.tag} · {s.tag.name}{/if}
                          {#if ps.length > 0}
                            {' · '}
                            {#each ps as p, i (p.id)}
                              {#if i > 0}, {/if}
                              <span class={`${textFg[p.color as TagColorKey] ?? 'text-white/70'} font-medium`}>{p.name}</span>
                            {/each}
                          {/if}
                        </div>
                      </div>
                    </button>
                    <!-- Dismiss button -->
                    <button
                      type="button"
                      class="absolute top-1/2 -translate-y-1/2 right-2 h-6 w-6 rounded-full bg-white/5 hover:bg-red-500/20 active:bg-red-500/30 transition flex items-center justify-center text-white/40 hover:text-red-400 opacity-0 group-hover/sugg:opacity-100"
                      on:click|stopPropagation={() => onDismissSuggestion?.(s)}
                      aria-label="Vorschlag ignorieren"
                      title="Ignorieren"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                {/each}

                {#each dayHolidays as h (h.date + ':' + h.title)}
                  <div class="flex items-center gap-2 max-w-full" in:fly={{ y: 4, duration: 120 }}>
                    <div class="h-3 w-3 rounded-full border border-white/50 shrink-0"></div>
                    <div class="min-w-0">
                      <div class="text-base md:text-lg font-semibold leading-tight truncate">{h.title}</div>
                      <div class="text-white/50 text-xs leading-tight">Feiertag · Ganztägig</div>
                    </div>
                  </div>
                {/each}

                {#each dayEvents as e, idx}
                  {@const k = e.occurrenceId ?? `${e.id}:${e.startAt}`}
                  {@const isPrompt = editPromptFor === k}
                  {@const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : []}
                  {@const p0 = ps[0]}
                  <button
                    type="button"
                    class="flex items-center gap-2 max-w-full text-left relative"
                    on:click|stopPropagation={() => requestEdit(e)}
                    in:fly={{ y: 4, duration: 120 }}
                  >
                    <div
                      class={`h-3 w-3 rounded-full shrink-0 ${
                        e.tag
                          ? isHexColor(e.tag.color)
                            ? 'bg-transparent'
                            : dotBg[e.tag.color as TagColorKey] ?? 'bg-white/25'
                          : p0
                            ? dotBg[p0.color as TagColorKey] ?? 'bg-white/25'
                            : 'bg-white/25'
                      }`}
                      style={e.tag && isHexColor(e.tag.color) ? `background-color: ${e.tag.color}` : ''}
                    ></div>
                    <div class="min-w-0 relative">
                      {#if isPrompt}
                        <div class="absolute left-0 top-0 z-10" in:fly={{ y: -4, duration: 140 }} out:fade={{ duration: 100 }}>
                          <div class="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-sm font-semibold">Bearbeiten?</div>
                        </div>
                      {/if}

                      <div class={isPrompt ? 'blur-sm' : ''}>
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span class="text-base md:text-lg font-semibold leading-tight truncate">{e.title}</span>
                          {#if e.recurrence?.freq}
                            <svg
                              class="shrink-0 text-white/50"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-label="Wiederholung"
                            >
                              <path d="M21 12a9 9 0 1 1-3-6.7" />
                              <path d="M21 3v6h-6" />
                            </svg>
                          {/if}
                        </div>

                        <div class="text-white/50 text-xs leading-tight">{#if isMultiDayEvent(e)}{fmtDateRange(e)} · {/if}{#if e.allDay}Ganztägig{:else}{fmtTimeRange(e.startAt, e.endAt)}{/if}{#if e.location} · {e.location}{/if}{#if e.tag} · {e.tag.name}{/if}{#if ps.length > 0} · {#each ps as p, i (p.id)}{#if i > 0},{/if}<span class={`${textFg[p.color as TagColorKey] ?? 'text-white/70'} font-medium ${i > 0 ? 'pl-0.5' : ''}`}>{p.name}</span>{/each}{/if}</div>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/key}
    </div>
  </div>
</div>

{#if searchOpen}
  <div class="fixed inset-0 z-[130]">
    <button
      type="button"
      class="absolute inset-0 bg-black/65 backdrop-blur-sm"
      aria-label="Suche schließen"
      on:click={closeSearch}
      transition:fade={{ duration: 180 }}
    ></button>

    <div class="absolute inset-x-4 md:inset-x-12 lg:inset-x-24 top-[12vh]">
      <div class="max-w-4xl mx-auto" in:fly={{ y: 16, duration: 220 }} out:fade={{ duration: 140 }}>
        <div class="rounded-2xl border border-white/20 bg-zinc-950/90 backdrop-blur-xl shadow-2xl shadow-black/50 p-3 md:p-4">
          <div class="flex items-center gap-3 px-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white/55 shrink-0">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              bind:this={searchInputEl}
              bind:value={searchQuery}
              type="text"
              class="w-full bg-transparent outline-none text-lg md:text-xl text-white placeholder:text-white/35"
              placeholder="Termine und Todos durchsuchen…"
              aria-label="Suche nach Terminen und Todos"
            />
            <button
              type="button"
              class="h-9 w-9 rounded-lg bg-white/8 hover:bg-white/14 text-white/60 hover:text-white/90 grid place-items-center transition"
              aria-label="Suche schließen"
              on:click={closeSearch}
            >
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="mt-3 h-px bg-gradient-to-r from-white/15 via-white/8 to-transparent"></div>

          <div class="mt-3 max-h-[52vh] overflow-y-auto pr-1">
            {#if searchBusy}
              <div class="text-sm text-white/55 px-2 py-3">Lade Todos…</div>
            {/if}

            {#if searchError}
              <div class="text-sm text-rose-300 px-2 py-2">{searchError}</div>
            {/if}

            {#if searchTokens.length === 0}
              <div class="text-sm text-white/45 px-2 py-3">Suche nach Titel, Ort, Beschreibung, Person oder Fälligkeitsdatum.</div>
            {:else if searchResults.length === 0}
              <div class="text-sm text-white/45 px-2 py-3">Keine Treffer für „{searchQuery.trim()}“.</div>
            {:else}
              <div class="space-y-1.5">
                {#each searchResults as item (item.key)}
                  <button
                    type="button"
                    class="w-full text-left rounded-xl px-3 py-2.5 hover:bg-white/8 active:bg-white/12 transition"
                    on:click={() => onSelectSearchResult(item)}
                  >
                    <div class="flex items-start gap-3">
                      <div class="mt-1 h-2.5 w-2.5 rounded-full shrink-0 {item.kind === 'event' ? 'bg-cyan-400' : 'bg-emerald-400'}"></div>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 min-w-0">
                          <div class="font-semibold text-white truncate">{item.title}</div>
                          <span class="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border border-white/15 text-white/55 shrink-0">
                            {item.kind === 'event' ? 'Termin' : 'Todo'}
                          </span>
                        </div>
                        {#if item.subtitle}
                          <div class="text-xs text-white/55 mt-0.5 line-clamp-1">{item.subtitle}</div>
                        {/if}
                        <div class="text-[11px] text-white/40 mt-0.5">{item.meta}</div>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
