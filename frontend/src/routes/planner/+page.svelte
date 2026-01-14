<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';

  import AddEventModal from '$lib/components/AddEventModal.svelte';
  import ScribbleModal from '$lib/components/ScribbleModal.svelte';
  import TodoModal from '$lib/components/TodoModal.svelte';

  import {
    createEvent,
    createScribble,
    createTodo,
    dismissRecurringSuggestion,
    fetchEvents,
    fetchOutlookStatus,
    fetchSettings,
    fetchTodos,
    getStoredToken,
    listOutlookConnections,
    listPersons,
    listTags,
    type EventDto,
    type OutlookConnectionDto,
    type PersonDto,
    type SettingsDto,
    type TagColorKey,
    type TagDto
  } from '$lib/api';
  import { daysForMonthGrid, formatGermanDayLabel, formatMonthTitle, startOfDay, endOfDay, sameDay } from '$lib/date';

  type ViewMode = 'agenda' | 'week' | 'month';

  let view: ViewMode = 'agenda';

  let selectedDate = new Date();
  let monthAnchor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  let agendaLoading = false;
  let monthLoading = false;
  let weekLoading = false;
  let agendaError: string | null = null;
  let monthError: string | null = null;
  let weekError: string | null = null;

  let agendaEvents: EventDto[] = [];
  let monthEvents: EventDto[] = [];
  let weekEvents: EventDto[] = [];

  // Background (match dashboard setting)
  let backgroundUrl = '/background.jpg';
  const bgOverlay = 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.70) 100%)';

  // Tags/persons for quick add
  let tags: TagDto[] = [];
  let persons: PersonDto[] = [];
  let metaLoading = false;
  let metaError: string | null = null;

  // Quick add modal
  let quickAddOpen = false;
  let creating = false;
  let createError: string | null = null;
  let newTitle = '';
  let newLocation = '';
  let newDate = toDateInputValue(selectedDate);
  let newAllDay = false;
  let newStartTime = '';
  let newEndTime = '';
  let newTagIdStr = '';
  let newPersonIds: number[] = [];

  // Swipe to submit
  let swipeStartX = 0;
  let swipeCurrentX = 0;
  let swiping = false;
  const SWIPE_THRESHOLD = 180;

  let tagMenuOpen = false;
  let personMenuOpen = false;

  // Scribble Notes FAB
  let scribbleEnabled = false;
  let scribbleModalOpen = false;
  let scribbleSaving = false;

  // Mobile FAB launcher (dock)
  let fabDockOpen = false;
  let fabDockTimer: ReturnType<typeof setTimeout> | null = null;

  type MobileFabKey = 'event' | 'todo' | 'scribble';
  const MOBILE_FAB_STEP = '4rem';
  $: mobileFabBaseBottom = 'calc(1.5rem + env(safe-area-inset-bottom))';
  $: mobileFabOrder = (
    [
      'event',
      ...(todoEnabled ? (['todo'] as const) : []),
      ...(scribbleEnabled ? (['scribble'] as const) : [])
    ] satisfies readonly MobileFabKey[]
  ) as MobileFabKey[];

  function mobileFabBottom(key: MobileFabKey) {
    const idx = mobileFabOrder.indexOf(key);
    if (idx < 0) return null;
    // idx=0 is the first action above the trigger button
    return `calc(1.5rem + env(safe-area-inset-bottom) + ${(idx + 1).toString()} * ${MOBILE_FAB_STEP})`;
  }

  function mobileFabFlyY(key: MobileFabKey) {
    const idx = mobileFabOrder.indexOf(key);
    return 60 + Math.max(0, idx) * 50;
  }

  function clearFabDockTimer() {
    if (fabDockTimer) {
      clearTimeout(fabDockTimer);
      fabDockTimer = null;
    }
  }

  function startFabDockTimer() {
    clearFabDockTimer();
    fabDockTimer = setTimeout(() => {
      fabDockOpen = false;
      fabDockTimer = null;
    }, 8000);
  }

  function toggleFabDock() {
    fabDockOpen = !fabDockOpen;
    if (fabDockOpen) {
      startFabDockTimer();
    } else {
      clearFabDockTimer();
    }
  }

  // Outlook ToDos
  let outlookConnected = false;
  let todoEnabled = true;
  let outlookConnections: OutlookConnectionDto[] = [];
  let todoListName = 'Dashbo';
  let todoListNames: string[] = [];
  let todoSelectedConnectionId: number | null = null;
  let todoSelectedListName = '';
  let todoAccountMenuOpen = false;
  let todoText = '';
  let todoSectionOpen = false;
  let todoSaving = false;
  let todoError: string | null = null;

  // Standalone ToDo create modal (from FAB dock)
  let todoCreateOpen = false;
  let todoCreateListName = '';
  let todoCreateConnectionId: number | null = null;

  const DASHBO_TODO_CONNECTION_ID = -1;
  const DASHBO_TODO_ACCOUNT = { id: DASHBO_TODO_CONNECTION_ID, label: 'Dashbo', email: null, color: 'emerald' } as const;

  type TodoAccount = { id: number; label: string; email: string | null; color?: string };

  $: todoAccounts = [
    DASHBO_TODO_ACCOUNT,
    ...(outlookConnections ?? []).map((c) => ({ id: c.id, label: outlookConnectionLabel(c), email: c.email || null, color: c.color }))
  ] satisfies TodoAccount[];

  $: selectedTodoAccount =
    todoSelectedConnectionId != null ? todoAccounts.find((c) => c.id === todoSelectedConnectionId) ?? null : null;

  function outlookConnectionLabel(c: OutlookConnectionDto | null | undefined): string {
    if (!c) return '';
    const name = c.displayName || c.email || `Outlook ${c.id}`;
    if (c.email && c.displayName && c.displayName !== c.email) return `${c.displayName} (${c.email})`;
    return name;
  }

  function openTodoCreateModal() {
    todoCreateListName = (todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
    todoCreateConnectionId = todoAccounts.length > 0 ? todoAccounts[0]!.id : DASHBO_TODO_CONNECTION_ID;
    todoCreateOpen = true;
  }

  async function refreshTodoMeta() {
    if (!todoEnabled) return;
    try {
      const todoMeta = await fetchTodos();
      todoListName = todoMeta?.listName || 'Dashbo';
      todoListNames = Array.isArray(todoMeta?.listNames) ? todoMeta.listNames : [];
    } catch {
      // ignore
    }

    try {
      const conns = await listOutlookConnections();
      outlookConnections = Array.isArray(conns) ? conns : [];
    } catch {
      outlookConnections = [];
    }

    if (todoSelectedConnectionId == null) {
      todoSelectedConnectionId = DASHBO_TODO_CONNECTION_ID;
    }
    if (!todoSelectedListName) {
      todoSelectedListName = (todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
    }
  }

  // Recurring Suggestions
  interface PlannerSuggestionDto {
    title: string;
    date: Date;
    startTime: string | null;
    endTime: string | null;
    allDay: boolean;
    tagId: number | null;
    personIds: number[];
    signature: string;
  }
  let suggestionsAll: PlannerSuggestionDto[] = [];
  let suggestions: PlannerSuggestionDto[] = [];
  let dismissedSuggestions: string[] = [];
  let suggestionSourceEvents: EventDto[] = [];

  const tagBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500',
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    violet: 'bg-violet-400',
    sky: 'bg-sky-400',
    lime: 'bg-lime-400'
  };

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && hexRe.test(value);
  }

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

  $: newTagId = newTagIdStr ? Number(newTagIdStr) : null;
  $: selectedTag = newTagId != null ? tags.find((t) => t.id === newTagId) : undefined;

  $: selectedPersons = persons.filter((p) => newPersonIds.includes(p.id));
  $: selectedPersonLabel =
    selectedPersons.length === 0
      ? 'Keine Person'
      : selectedPersons.length === 1
        ? selectedPersons[0]?.name ?? '1 Person'
        : `${selectedPersons.length} Personen`;
  $: primaryPerson = selectedPersons[0];

  // Event modal
  let openEvent: EventDto | null = null;

  // Edit modal (reuse dashboard modal)
  let editOpen = false;
  let editEvent: EventDto | null = null;

  function openEditFromEvent(e: EventDto) {
    editEvent = e;
    editOpen = true;
    openEvent = null;
  }

  function closeEdit() {
    editOpen = false;
    editEvent = null;
  }

  async function onEventMutated() {
    await Promise.all([refreshAgenda(), refreshWeek(), refreshMonth()]);
  }

  const weekdayLabelDays = [
    new Date(2024, 0, 1),
    new Date(2024, 0, 2),
    new Date(2024, 0, 3),
    new Date(2024, 0, 4),
    new Date(2024, 0, 5),
    new Date(2024, 0, 6),
    new Date(2024, 0, 7)
  ];

  // Backwards-compatible alias (older template fragments / tooling diagnostics)
  const weekDays = weekdayLabelDays;

  function addDays(d: Date, delta: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + delta);
    return x;
  }

  function toDateInputValue(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseDateInputValue(v: string): Date | null {
    if (!v) return null;
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(v);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(y, mo, day);
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }

  function parseTime(v: string): { h: number; m: number } | null {
    if (!v) return null;
    const m = /^([0-9]{2}):([0-9]{2})$/.exec(v);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, m: min };
  }

  function toLocalDateTime(date: Date, time: { h: number; m: number }): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m, 0, 0);
  }

  function roundToNextHalfHourTime(now: Date): string {
    const d = new Date(now);
    d.setSeconds(0, 0);
    const m = d.getMinutes();
    const next = m === 0 || m === 30 ? m : m < 30 ? 30 : 60;
    if (next === 60) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
    } else {
      d.setMinutes(next, 0, 0);
    }
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatDayTitle(d: Date): string {
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function formatTime(d: Date): string {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function dateKeyLocal(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function cx(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
  }

  function eventKey(e: EventDto) {
    return e.occurrenceId ?? `${e.id}:${e.startAt}`;
  }

  function closePopovers() {
    tagMenuOpen = false;
    personMenuOpen = false;
  }

  function chooseTag(id: number | null) {
    newTagIdStr = id == null ? '' : String(id);
    tagMenuOpen = false;
  }

  function choosePerson(id: number | null) {
    if (id == null) {
      newPersonIds = [];
      personMenuOpen = false;
      return;
    }
    if (newPersonIds.includes(id)) {
      newPersonIds = newPersonIds.filter((x) => x !== id);
    } else {
      newPersonIds = [...newPersonIds, id];
    }
  }

  function formatEventDateLine(e: EventDto): string {
    const start = new Date(e.startAt);
    const d = start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (e.allDay) return d;

    const time = `${formatTime(start)}${e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}`;
    return `${d} · ${time}`;
  }

  function pickBackgroundFromSettings(s: SettingsDto): string {
    const uploaded = (s.images ?? []).map((img) => `/api/media/${img}`);
    if (uploaded.length > 0) {
      const preferred = s.background ? `/api/media/${s.background}` : null;
      return preferred && uploaded.includes(preferred) ? preferred : uploaded[0] ?? '/background.jpg';
    }
    if (s.backgroundUrl) return `/api${s.backgroundUrl}`;
    return '/background.jpg';
  }

  function startOfLocalDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function mondayStart(d: Date): Date {
    const x = startOfLocalDay(d);
    const offset = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - offset);
    return x;
  }

  function setView(next: ViewMode) {
    view = next;
    if (next === 'month') void refreshMonth();
    if (next === 'week') void refreshWeek();
    if (next === 'agenda') void refreshAgenda();
  }

  function eventDayKeys(e: EventDto): string[] {
    const start = startOfLocalDay(new Date(e.startAt));
    const end = e.endAt ? startOfLocalDay(new Date(e.endAt)) : start;
    const maxSpan = 62;
    const spanDays = Math.min(maxSpan, Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000))));

    const out: string[] = [];
    for (let i = 0; i <= spanDays; i++) {
      const d = addDays(start, i);
      out.push(dateKeyLocal(d));
    }
    return out;
  }

  $: monthDays = daysForMonthGrid(monthAnchor);
  $: monthTitle = formatMonthTitle(monthAnchor);

  let monthHasEvents = new Map<string, boolean>();
  $: {
    const m = new Map<string, boolean>();
    for (const e of monthEvents) {
      for (const k of eventDayKeys(e)) m.set(k, true);
    }
    monthHasEvents = m;
  }

  let monthEventsByDay = new Map<string, EventDto[]>();
  $: {
    const m = new Map<string, EventDto[]>();
    for (const e of monthEvents) {
      for (const k of eventDayKeys(e)) {
        const arr = m.get(k) ?? [];
        arr.push(e);
        m.set(k, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      });
    }
    monthEventsByDay = m;
  }

  let monthSuggestionsByDay = new Map<string, PlannerSuggestionDto[]>();
  $: {
    const m = new Map<string, PlannerSuggestionDto[]>();
    for (const s of suggestionsAll) {
      const k = dateKeyLocal(s.date);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    monthSuggestionsByDay = m;
  }

  // Selected day detail for month view
  $: selectedDayKey = dateKeyLocal(selectedDate);
  $: selectedDayEvents = monthEventsByDay.get(selectedDayKey) ?? [];
  $: selectedDaySuggestions = monthSuggestionsByDay.get(selectedDayKey) ?? [];

  // View swipe gesture state
  let viewSwipeStartX = 0;
  let viewSwipeDeltaX = 0;
  let viewSwiping = false;
  const VIEW_SWIPE_THRESHOLD = 80;

  function onViewSwipeStart(e: TouchEvent) {
    viewSwiping = true;
    viewSwipeStartX = e.touches[0].clientX;
    viewSwipeDeltaX = 0;
  }

  function onViewSwipeMove(e: TouchEvent) {
    if (!viewSwiping) return;
    viewSwipeDeltaX = e.touches[0].clientX - viewSwipeStartX;
  }

  function onViewSwipeEnd() {
    if (!viewSwiping) return;
    viewSwiping = false;
    // Cycle: month <-> week <-> agenda
    if (viewSwipeDeltaX < -VIEW_SWIPE_THRESHOLD) {
      if (view === 'month') setView('week');
      else if (view === 'week') setView('agenda');
    } else if (viewSwipeDeltaX > VIEW_SWIPE_THRESHOLD) {
      if (view === 'agenda') setView('week');
      else if (view === 'week') setView('month');
    }
    viewSwipeDeltaX = 0;
  }

  $: weekStart = mondayStart(selectedDate);
  $: weekEnd = addDays(weekStart, 6);
  $: weekStripDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  $: weekRangeLabel = `${weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${weekEnd.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  let weekEventsByDay = new Map<string, EventDto[]>();
  $: {
    const allowed = new Set(weekStripDays.map((d) => dateKeyLocal(d)));
    const m = new Map<string, EventDto[]>();
    for (const e of weekEvents) {
      for (const k of eventDayKeys(e)) {
        if (!allowed.has(k)) continue;
        const arr = m.get(k) ?? [];
        arr.push(e);
        m.set(k, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      });
    }
    weekEventsByDay = m;
  }

  async function refreshWeek() {
    weekLoading = true;
    weekError = null;
    try {
      const from = startOfDay(weekStart);
      const to = endOfDay(weekEnd);
      const items = await fetchEvents(from, to);
      weekEvents = items;
    } catch (err) {
      weekError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      weekEvents = [];
    } finally {
      weekLoading = false;
    }
  }

  function resetQuickAddDefaults(targetDate: Date) {
    newTitle = '';
    newLocation = '';
    newAllDay = false;
    newStartTime = roundToNextHalfHourTime(new Date());
    newEndTime = '';
    newTagIdStr = '';
    newPersonIds = [];
    todoText = '';
    todoSectionOpen = false;
    createError = null;
    selectedDate = targetDate;
    monthAnchor = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    newDate = toDateInputValue(targetDate);
    closePopovers();
  }

  function openQuickAddForDay(d: Date) {
    resetQuickAddDefaults(d);
    quickAddOpen = true;
  }

  let weekAutoScrollKey = '';
  const weekDayEls = new Map<string, HTMLElement>();
  function registerWeekDayEl(node: HTMLElement, key: string) {
    weekDayEls.set(key, node);
    return {
      destroy() {
        weekDayEls.delete(key);
      }
    };
  }

  $: if (view === 'week') {
    const k = dateKeyLocal(selectedDate);
    if (weekAutoScrollKey !== k) {
      weekAutoScrollKey = k;
      // Wait for DOM to paint the week columns
      window.setTimeout(() => {
        const el = weekDayEls.get(k);
        el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }, 0);
    }
  }

  function eventPersons(e: EventDto): Array<{ id: number; name: string; color: string }> {
    if (e.persons && e.persons.length > 0) return e.persons as any;
    if (e.person) return [e.person as any];
    return [];
  }

  function eventDot(e: EventDto): { cls: string; style: string } {
    const tagColor = e.tag?.color;
    const ps = eventPersons(e);
    const p0 = ps[0];
    const pc = p0?.color;

    if (tagColor) {
      if (isHexColor(tagColor)) return { cls: 'bg-transparent', style: `background-color: ${tagColor}` };
      return { cls: tagBg[tagColor as TagColorKey] ?? 'bg-white/25', style: '' };
    }

    if (pc) {
      if (isHexColor(pc)) return { cls: 'bg-transparent', style: `background-color: ${pc}` };
      return { cls: tagBg[pc as TagColorKey] ?? 'bg-white/25', style: '' };
    }

    return { cls: 'bg-white/25', style: '' };
  }

  function isInMonth(d: Date, anchor: Date): boolean {
    return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
  }

  function clampSelectedToMonth(nextAnchor: Date, currentSelected: Date): Date {
    const y = nextAnchor.getFullYear();
    const mo = nextAnchor.getMonth();
    const day = currentSelected.getDate();
    const last = new Date(y, mo + 1, 0).getDate();
    return new Date(y, mo, Math.min(day, last));
  }

  function shiftMonth(delta: number) {
    const nextAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1);
    monthAnchor = nextAnchor;
    selectedDate = clampSelectedToMonth(nextAnchor, selectedDate);
    newDate = toDateInputValue(selectedDate);
    void refreshMonth();
  }

  async function refreshAgenda() {
    agendaLoading = true;
    agendaError = null;
    try {
      const from = startOfDay(selectedDate);
      const to = endOfDay(addDays(selectedDate, 7));
      const items = await fetchEvents(from, to);
      agendaEvents = items
        .slice()
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      // Generate suggestions based on a wider window (needs past events to detect patterns)
      try {
        const today = startOfLocalDay(new Date());
        const suggestFrom = startOfDay(addDays(today, -56));
        // Include enough future events so the pattern can be inferred from already scheduled occurrences.
        const suggestTo = endOfDay(addDays(today, 60));
        const suggestEvents = await fetchEvents(suggestFrom, suggestTo);
        suggestionSourceEvents = suggestEvents;
        generateSuggestions(suggestEvents);
      } catch {
        suggestionSourceEvents = [];
        suggestions = [];
      }
    } catch (err) {
      agendaError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      agendaEvents = [];
    } finally {
      agendaLoading = false;
    }
  }

  // --- Suggestion generation (weekly recurring pattern detection) ---
  function generateSuggestions(events: EventDto[]) {
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const normalizeTitle = (t: string) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const weekdayMon0 = (d: Date) => (d.getDay() + 6) % 7;
    const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const bucket15 = (mins: number) => Math.round(mins / 15) * 15;
    const minutesSinceMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const hhmmFromMinutes = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const dismissedSet = new Set(dismissedSuggestions);

    // Filter out sources/records that create noisy suggestions.
    const candidates = (events ?? []).filter((e) => {
      if (e.source === 'outlook') return false;
      if (e.allDay) return false;
      if (e.recurrence) return false;
      if (!e.title || !String(e.title).trim()) return false;
      return true;
    });

    // Aggregate weekly patterns (12-week lookback) using 15-min buckets.
    // Also allow learning from already scheduled near-future events so month view can show upcoming suggestions.
    const lookbackFrom = addDays(todayStart, -12 * 7);
    const patternTo = addDays(todayStart, 60 + 1);
    const weeklyAgg = new Map<
      string,
      { dates: Date[]; sample: EventDto; weekday: number; startBucket: number; titleNorm: string }
    >();

    for (const e of candidates) {
      const start = new Date(e.startAt);
      if (Number.isNaN(start.getTime())) continue;
      if (start < lookbackFrom || start >= patternTo) continue;

      const wd = weekdayMon0(start);
      const startMin = bucket15(minutesSinceMidnight(start));
      const titleNorm = normalizeTitle(e.title);
      if (!titleNorm) continue;

      const sig = `weekly|${wd}|${startMin}|${titleNorm}`;
      const existing = weeklyAgg.get(sig);
      if (existing) {
        existing.dates.push(start);
        const existingSampleStart = new Date(existing.sample.startAt).getTime();
        const currentMs = start.getTime();
        if (!Number.isNaN(existingSampleStart) && currentMs > existingSampleStart) {
          existing.sample = e;
        }
      } else {
        weeklyAgg.set(sig, { dates: [start], sample: e, weekday: wd, startBucket: startMin, titleNorm });
      }
    }

    // Generate suggestions for the next ~2 months (month grid should show them too).
    const upcomingDays: Date[] = [];
    for (let i = 0; i <= 60; i++) upcomingDays.push(addDays(todayStart, i));

    const result: PlannerSuggestionDto[] = [];
    const addedKeys = new Set<string>();

    for (const [sig, agg] of weeklyAgg) {
      for (const day of upcomingDays) {
        const dayStart = startOfLocalDay(day);
        if (dayStart < todayStart) continue;
        if (weekdayMon0(dayStart) !== agg.weekday) continue;

        const datesBefore = agg.dates.filter((d) => d.getTime() < dayStart.getTime());
        if (datesBefore.length < 3) continue;
        const weeksBefore = new Set(
          datesBefore.map((d) => {
            const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayMon0(d));
            return dateKey(weekStart);
          })
        );
        if (weeksBefore.size < 3) continue;

        const dayDateKey = dateKey(dayStart);
        const suggKey = `${sig}|${dayDateKey}`;
        if (addedKeys.has(suggKey)) continue;
        if (dismissedSet.has(suggKey)) continue;

        // Check if event already exists on that day.
        const hasExisting = (events ?? []).some((ev) => {
          const evStart = new Date(ev.startAt);
          return dateKey(evStart) === dayDateKey && normalizeTitle(ev.title) === agg.titleNorm;
        });
        if (hasExisting) continue;

        addedKeys.add(suggKey);

        let endTime: string | null = null;
        try {
          const sampleStart = new Date(agg.sample.startAt);
          const sampleEnd = agg.sample.endAt ? new Date(agg.sample.endAt) : null;
          if (sampleEnd && !Number.isNaN(sampleStart.getTime()) && !Number.isNaN(sampleEnd.getTime())) {
            const deltaMs = sampleEnd.getTime() - sampleStart.getTime();
            const minMs = 15 * 60 * 1000;
            const maxMs = 12 * 60 * 60 * 1000;
            if (deltaMs >= minMs && deltaMs <= maxMs) {
              const durMins = Math.round(deltaMs / (60 * 1000));
              const endMins = agg.startBucket + durMins;
              if (endMins > 0 && endMins < 24 * 60) endTime = hhmmFromMinutes(endMins);
            }
          }
        } catch {
          // ignore
        }

        const ps = eventPersons(agg.sample);
        result.push({
          title: agg.sample.title,
          date: new Date(dayStart),
          allDay: false,
          startTime: hhmmFromMinutes(agg.startBucket),
          endTime,
          tagId: agg.sample.tag?.id ?? null,
          personIds: ps.map((p) => p.id),
          signature: suggKey
        });
      }
    }

    result.sort((a, b) => a.date.getTime() - b.date.getTime());
    suggestionsAll = result;
    suggestions = result.slice(0, 5);
  }

  async function dismissSuggestion(s: PlannerSuggestionDto) {
    dismissedSuggestions = [...dismissedSuggestions, s.signature];
    suggestionsAll = suggestionsAll.filter((x) => x.signature !== s.signature);
    suggestions = suggestions.filter((x) => x.signature !== s.signature);
    try {
      await dismissRecurringSuggestion(s.signature);
    } catch {
      // ignore
    }
  }

  function acceptSuggestion(s: PlannerSuggestionDto) {
    // Prefill the quick add form with suggestion data
    newTitle = s.title;
    newDate = toDateInputValue(s.date);
    newAllDay = s.allDay;
    newStartTime = s.startTime ?? '';
    newEndTime = s.endTime ?? '';
    newTagIdStr = s.tagId != null ? String(s.tagId) : '';
    newPersonIds = s.personIds.slice();
    todoSectionOpen = false;
    quickAddOpen = true;
    // Remove from suggestions
    suggestionsAll = suggestionsAll.filter((x) => x.signature !== s.signature);
    suggestions = suggestions.filter((x) => x.signature !== s.signature);
  }

  // Helper to parse ToDo lines from textarea
  function parseTodoLines(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  // Create ISO at local noon to avoid timezone offsets
  function isoNoonLocal(d: Date): string {
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    return x.toISOString();
  }

  async function refreshMonth() {
    monthLoading = true;
    monthError = null;
    try {
      const days = daysForMonthGrid(monthAnchor);
      const from = startOfDay(days[0] ?? monthAnchor);
      const to = endOfDay(days[days.length - 1] ?? monthAnchor);
      const items = await fetchEvents(from, to);
      monthEvents = items;
    } catch (err) {
      monthError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      monthEvents = [];
    } finally {
      monthLoading = false;
    }
  }

  function setSelected(d: Date) {
    selectedDate = d;
    newDate = toDateInputValue(d);
    closePopovers();
    // Refresh agenda in background so it's ready if user switches
    void refreshAgenda();
    // Prefetch week too so switching is instant
    void refreshWeek();
  }

  // Build a map of suggestions by day key for quick lookup
  let agendaSuggestionsByDay = new Map<string, PlannerSuggestionDto[]>();
  $: {
    const m = new Map<string, PlannerSuggestionDto[]>();
    for (const s of suggestionsAll) {
      const k = dateKeyLocal(s.date);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    agendaSuggestionsByDay = m;
  }

  $: agendaGroups = (() => {
    const groups: { day: Date; items: EventDto[]; suggestions: PlannerSuggestionDto[] }[] = [];
    for (let i = 0; i <= 7; i++) {
      const day = startOfLocalDay(addDays(selectedDate, i));
      const items = agendaEvents.filter((e) => sameDay(new Date(e.startAt), day));
      const daySuggestions = agendaSuggestionsByDay.get(dateKeyLocal(day)) ?? [];
      groups.push({ day, items, suggestions: daySuggestions });
    }
    return groups;
  })();

  async function doCreate() {
    createError = null;
    const title = newTitle.trim();
    if (!title) {
      createError = 'Titel fehlt.';
      return;
    }

    const d = parseDateInputValue(newDate);
    if (!d) {
      createError = 'Ungültiges Datum.';
      return;
    }

    let startAt: Date;
    let endAt: Date | null = null;

    if (newAllDay) {
      startAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    } else {
      const st = parseTime(newStartTime);
      if (!st) {
        createError = 'Startzeit fehlt.';
        return;
      }
      startAt = toLocalDateTime(d, st);

      const et = parseTime(newEndTime);
      if (et) {
        endAt = toLocalDateTime(d, et);
        if (endAt.getTime() <= startAt.getTime()) {
          createError = 'Ende muss nach Start liegen.';
          return;
        }
      }
    }

    creating = true;
    try {
      await createEvent({
        title,
        location: newLocation.trim() || null,
        startAt: startAt.toISOString(),
        endAt: endAt ? endAt.toISOString() : null,
        allDay: newAllDay,
        tagId: newTagId != null && Number.isFinite(newTagId) && newTagId > 0 ? newTagId : null,
        personIds: newPersonIds.length > 0 ? newPersonIds : null
      });

      // Create ToDos if enabled (Dashbo-local or Outlook)
      const todoLines = todoEnabled ? parseTodoLines(todoText) : [];
      if (todoLines.length > 0) {
        todoSaving = true;
        todoError = null;
        const dueAt = isoNoonLocal(d);
        const listName = todoSelectedListName || (todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
        const connectionId = todoSelectedConnectionId;
        try {
          await Promise.all(
            todoLines.map((t) =>
              createTodo({
                ...(connectionId != null ? { connectionId } : {}),
                ...(listName ? { listName } : {}),
                title: t,
                description: null,
                dueAt
              })
            )
          );
        } catch (e: any) {
          todoError = e?.message || 'Fehler beim Speichern der ToDos';
        } finally {
          todoSaving = false;
        }
      }

      newTitle = '';
      newLocation = '';
      if (!newAllDay) newEndTime = '';
      newTagIdStr = '';
      newPersonIds = [];
      todoText = '';
      todoError = null;
      closePopovers();

      // Keep the agenda anchored to the event day
      selectedDate = d;
      monthAnchor = new Date(d.getFullYear(), d.getMonth(), 1);

      await Promise.all([refreshAgenda(), refreshMonth()]);
      quickAddOpen = false; // Close modal on success
    } catch (err) {
      createError = err instanceof Error ? err.message : 'Fehler beim Anlegen.';
    } finally {
      creating = false;
    }
  }

  // Swipe handlers
  function handleSwipeStart(e: TouchEvent | MouseEvent) {
    if (creating) return;
    swiping = true;
    swipeStartX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    swipeCurrentX = 0;
  }

  function handleSwipeMove(e: TouchEvent | MouseEvent) {
    if (!swiping) return;
    const currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    swipeCurrentX = Math.max(0, currentX - swipeStartX);
  }

  function handleSwipeEnd() {
    if (!swiping) return;
    if (swipeCurrentX >= SWIPE_THRESHOLD) {
      void doCreate();
    }
    swiping = false;
    swipeCurrentX = 0;
  }

  $: swipeProgress = Math.min(1, swipeCurrentX / SWIPE_THRESHOLD);
  $: canSubmit = newTitle.trim().length > 0;
  $: anyModalOpen = quickAddOpen || scribbleModalOpen || editOpen || openEvent !== null || todoCreateOpen;

  onMount(() => {
    if (!getStoredToken()) {
      void goto(`/login?next=${encodeURIComponent('/planner')}`);
      return;
    }

    // One-time teaser animation for the mobile dock launcher
    try {
      const isMobile = window.matchMedia('(max-width: 767px)').matches;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const key = 'dashbo-planner-fab-teaser-seen';
      const seen = localStorage.getItem(key) === '1';
      if (isMobile && !reduceMotion && !seen) {
        localStorage.setItem(key, '1');
        window.setTimeout(() => {
          if (anyModalOpen) return;
          fabDockOpen = true;
          window.setTimeout(() => {
            fabDockOpen = false;
          }, 1200);
        }, 600);
      }
    } catch {
      // ignore teaser if storage/matchMedia unavailable
    }

    metaLoading = true;
    metaError = null;
    void (async () => {
      try {
        const [s, t, p, outlookSt] = await Promise.all([
          fetchSettings(),
          listTags(),
          listPersons(),
          fetchOutlookStatus().catch(() => null)
        ]);
        backgroundUrl = pickBackgroundFromSettings(s);
        scribbleEnabled = s.scribbleEnabled !== false;
        todoEnabled = s.todoEnabled !== false;
        {
          const ds = (s as any)?.dismissedSuggestions;
          dismissedSuggestions = Array.isArray(ds) ? (ds as string[]) : [];
        }
        tags = (t ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
        persons = (p ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
        outlookConnected = Boolean(outlookSt?.connected);

        if (todoEnabled) {
          await refreshTodoMeta();
        }
      } catch (err) {
        metaError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      } finally {
        metaLoading = false;
        // Recompute suggestions after settings (dismissed keys) are loaded.
        // Avoid re-fetching events (prevents double "Aktualisiere…" on initial load).
        if (suggestionSourceEvents.length > 0) {
          generateSuggestions(suggestionSourceEvents);
        }
      }
    })();

    void Promise.all([refreshAgenda(), refreshWeek(), refreshMonth()]);
  });

  // Scribble handlers
  async function handleScribbleSave(e: CustomEvent<{ imageData: string; authorName: string }>) {
    if (scribbleSaving) return;
    scribbleSaving = true;
    try {
      await createScribble({ imageData: e.detail.imageData, authorName: e.detail.authorName });
      scribbleModalOpen = false;
    } catch (err) {
      console.error('Scribble save failed', err);
    } finally {
      scribbleSaving = false;
    }
  }
</script>

<div class="min-h-screen text-white overflow-hidden relative bg-black">
  <div class="absolute inset-0 overflow-hidden">
    <div
      class="absolute inset-0"
      style={`background-image: ${bgOverlay}, url('${backgroundUrl}'); background-size: cover; background-position: center;`}
    ></div>
  </div>

  <div
    class="relative z-10 max-w-xl mx-auto px-4 py-4"
    on:touchstart={onViewSwipeStart}
    on:touchmove={onViewSwipeMove}
    on:touchend={onViewSwipeEnd}
  >
    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="text-xl font-semibold tracking-wide">Dashbo</div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class={cx(
            'h-9 px-3 rounded-lg text-sm font-medium transition-colors border border-white/10',
            view === 'agenda' ? 'bg-white/20' : 'hover:bg-white/15'
          )}
          on:click={() => setView('agenda')}
        >
          Agenda
        </button>
        <button
          type="button"
          class={cx(
            'h-9 px-3 rounded-lg text-sm font-medium transition-colors border border-white/10',
            view === 'week' ? 'bg-white/20' : 'hover:bg-white/15'
          )}
          on:click={() => setView('week')}
        >
          Woche
        </button>
        <button
          type="button"
          class={cx(
            'h-9 px-3 rounded-lg text-sm font-medium transition-colors border border-white/10',
            view === 'month' ? 'bg-white/20' : 'hover:bg-white/15'
          )}
          on:click={() => setView('month')}
        >
          Monat
        </button>
        <a
          href="/settings?from=/planner"
          class="h-9 w-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors border border-white/10 hover:bg-white/15"
          title="Einstellungen"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </a>
      </div>
    </div>

    {#if metaError}
      <div class="text-red-400 text-sm mb-3">{metaError}</div>
    {/if}

    {#if view === 'agenda'}
      <div class="relative z-10" in:fly={{ x: -30, duration: 200 }} out:fade={{ duration: 100 }}>
        <div class="flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2 text-white/85 text-sm">
            <button
              type="button"
              class="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/10"
              aria-label="Vorherige Woche"
              title="Vorherige Woche"
              on:click={() => {
                selectedDate = addDays(selectedDate, -7);
                monthAnchor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                newDate = toDateInputValue(selectedDate);
                closePopovers();
                void refreshAgenda();
              }}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div class="min-w-0">
              {selectedDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
              –
              {addDays(selectedDate, 6).toLocaleDateString('de-DE', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              })}
            </div>

            <button
              type="button"
              class="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/10"
              aria-label="Nächste Woche"
              title="Nächste Woche"
              on:click={() => {
                selectedDate = addDays(selectedDate, 7);
                monthAnchor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                newDate = toDateInputValue(selectedDate);
                closePopovers();
                void refreshAgenda();
              }}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            class="h-9 px-3 rounded-lg text-sm font-medium border border-white/10 hover:bg-white/10"
            on:click={() => {
              const d = new Date();
              selectedDate = d;
              monthAnchor = new Date(d.getFullYear(), d.getMonth(), 1);
              newDate = toDateInputValue(d);
              closePopovers();
              void refreshAgenda();
            }}
          >
            Heute
          </button>
        </div>

        {#if agendaError}
          <div class="text-red-400 text-sm mb-2">{agendaError}</div>
        {/if}

        {#if agendaLoading && agendaEvents.length === 0}
          <div class="text-white/60 text-sm">Lade…</div>
        {:else}
          {#if agendaLoading}
            <div class="text-white/50 text-xs mb-2">Aktualisiere…</div>
          {/if}

          <div class={cx('space-y-3', agendaLoading && 'opacity-60')}>
            {#each agendaGroups as g (dateKeyLocal(g.day))}
              {@const isSelected = sameDay(g.day, selectedDate)}
              {@const isToday = sameDay(g.day, new Date())}
              <div
                class={cx(
                  'bg-white/5 rounded-xl p-3 glass border border-white/10',
                  isSelected && 'border-white/25 ring-1 ring-white/15'
                )}
              >
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium flex items-center gap-2">
                  {g.day.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  {#if isToday}
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/25">Heute</span>
                  {/if}
                  {#if isSelected}
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">Ausgewählt</span>
                  {/if}
                </div>
                {#if isSelected}
                  <span class="text-xs text-white/40">Start</span>
                {:else}
                  <button
                    type="button"
                    class="text-xs text-white/60 hover:text-white"
                    on:click={() => {
                      selectedDate = g.day;
                      newDate = toDateInputValue(g.day);
                      void refreshAgenda();
                    }}
                  >
                    Woche ab hier
                  </button>
                {/if}
              </div>

              {#if g.items.length === 0 && g.suggestions.length === 0}
                <div class="text-white/40 text-sm mt-2">Keine Termine</div>
              {:else}
                <div class="mt-2 space-y-2">
                  {#each g.items as e (eventKey(e))}
                    {@const ps = eventPersons(e)}
                    {@const dot = eventDot(e)}
                    <button
                      type="button"
                      class="w-full text-left rounded-lg hover:bg-white/5 px-2 py-2 -mx-2"
                      on:click={() => (openEvent = e)}
                    >
                      <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex items-start gap-2">
                        <div class={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${dot.cls}`} style={dot.style}></div>
                        <div class="min-w-0">
                          <div class="text-sm font-medium truncate">{e.title}</div>
                          <div class="text-xs text-white/55 truncate">
                            {#if e.allDay}
                              Ganztägig
                            {:else}
                              {formatTime(new Date(e.startAt))}{e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}
                            {/if}
                            {#if e.location}
                              · {e.location}
                            {/if}
                            {#if e.tag}
                              · {e.tag.name}
                            {/if}
                          </div>
                          {#if ps.length > 0}
                            <div class="text-xs mt-0.5">
                              {#each ps as p, i (p.id)}
                                {@const pc = p.color as string}
                                <span
                                  class={`${!isHexColor(pc) ? (textFg[pc as TagColorKey] ?? 'text-white/70') : 'text-white/70'} font-medium`}
                                  style={isHexColor(pc) ? `color: ${pc}` : ''}
                                >
                                  {p.name}{#if i < ps.length - 1}, {/if}
                                </span>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      </div>
                      {#if e.source && e.source !== 'dashbo'}
                        <div class="text-[10px] text-white/40 mt-0.5">{e.source}</div>
                      {/if}
                      </div>
                    </button>
                  {/each}

                  <!-- Inline suggestions for this day -->
                  {#each g.suggestions as s (s.signature)}
                    {@const sPersons = persons.filter((p) => s.personIds.includes(p.id))}
                    {@const sTag = tags.find((t) => t.id === s.tagId)}
                    <div class="bg-gradient-to-r from-indigo-500/15 to-purple-500/15 border border-dashed border-indigo-400/40 rounded-lg px-2 py-2 -mx-2">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0 flex items-start gap-2 flex-1">
                          <div class="mt-1 h-2.5 w-2.5 rounded-full shrink-0 border-2 border-violet-400 border-dashed bg-transparent"></div>
                          <div class="min-w-0">
                            <div class="text-sm font-medium truncate text-white/80">{s.title}</div>
                            <div class="text-xs text-white/50 truncate">
                              {#if !s.allDay && s.startTime}
                                {s.startTime}{s.endTime ? ` – ${s.endTime}` : ''}
                              {:else if s.allDay}
                                Ganztägig
                              {/if}
                              <span class="ml-1 text-violet-300/70">Vorschlag</span>
                            </div>
                            {#if sPersons.length > 0 || sTag}
                              <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {#if sTag}
                                  <span class="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">{sTag.name}</span>
                                {/if}
                                {#each sPersons as p (p.id)}
                                  <span
                                    class="text-xs px-1.5 py-0.5 rounded-full bg-white/10"
                                    style={isHexColor(p.color) ? `color: ${p.color}` : ''}
                                  >{p.name}</span>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        </div>
                        <div class="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            class="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                            title="Vorschlag übernehmen"
                            on:click={() => acceptSuggestion(s)}
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            class="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                            title="Vorschlag ignorieren"
                            on:click={() => dismissSuggestion(s)}
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else if view === 'week'}
      <div class="relative z-10" in:fly={{ x: 0, duration: 200 }} out:fade={{ duration: 100 }}>
        <div class="flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2 text-white/85 text-sm">
            <button
              type="button"
              class="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/10"
              aria-label="Vorherige Woche"
              title="Vorherige Woche"
              on:click={() => {
                selectedDate = addDays(selectedDate, -7);
                monthAnchor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                newDate = toDateInputValue(selectedDate);
                closePopovers();
                void refreshWeek();
              }}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div class="min-w-0">{weekRangeLabel}</div>

            <button
              type="button"
              class="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/10"
              aria-label="Nächste Woche"
              title="Nächste Woche"
              on:click={() => {
                selectedDate = addDays(selectedDate, 7);
                monthAnchor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                newDate = toDateInputValue(selectedDate);
                closePopovers();
                void refreshWeek();
              }}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            class="h-9 px-3 rounded-lg text-sm font-medium border border-white/10 hover:bg-white/10"
            on:click={() => {
              const d = new Date();
              selectedDate = d;
              monthAnchor = new Date(d.getFullYear(), d.getMonth(), 1);
              newDate = toDateInputValue(d);
              closePopovers();
              void refreshWeek();
            }}
          >
            Heute
          </button>
        </div>

        {#if weekError}
          <div class="text-red-400 text-sm mb-2">{weekError}</div>
        {/if}

        {#if weekLoading && weekEvents.length === 0}
          <div class="text-white/60 text-sm">Lade…</div>
        {:else}
          {#if weekLoading}
            <div class="text-white/50 text-xs mb-2">Aktualisiere…</div>
          {/if}

          <div class={cx('relative', weekLoading && 'opacity-60')}>
            <div
              class="-mx-4"
              style="--dayw: calc((100% - 2 * 0.75rem) / 3);"
            >
              <div class="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scroll-px-4">
                {#each weekStripDays as d (dateKeyLocal(d))}
                  {@const k = dateKeyLocal(d)}
                  {@const isToday = sameDay(d, new Date())}
                  {@const isSelected = sameDay(d, selectedDate)}
                  {@const items = weekEventsByDay.get(k) ?? []}
                  <div class="snap-start" style="flex: 0 0 var(--dayw);" use:registerWeekDayEl={k}>
                    <div
                      class={cx(
                        'bg-white/5 glass border border-white/10 rounded-2xl overflow-hidden shadow-lg',
                        isSelected && 'border-white/25 ring-1 ring-white/15'
                      )}
                    >
                      <div class="px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          class="min-w-0 text-left"
                          on:click={() => {
                            selectedDate = d;
                            newDate = toDateInputValue(d);
                          }}
                        >
                          <div class="flex items-center gap-2">
                            <div class="text-xs font-semibold tracking-wide text-white/75">{formatGermanDayLabel(d)}</div>
                            <div class="text-sm font-bold text-white/90">{d.getDate()}.</div>
                            {#if isToday}
                              <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/25">Heute</span>
                            {/if}
                          </div>
                        </button>

                        <button
                          type="button"
                          class="h-8 w-8 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-white/80"
                          aria-label="Termin hinzufügen"
                          title="Termin hinzufügen"
                          on:click={() => openQuickAddForDay(d)}
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>

                      <div class="px-3 py-3 space-y-2">
                        {#if items.length === 0}
                          <div class="text-white/40 text-sm">—</div>
                        {:else}
                          {#each items as e (eventKey(e))}
                            {@const ps = eventPersons(e)}
                            {@const dot = eventDot(e)}
                            <button
                              type="button"
                              class="w-full text-left rounded-xl hover:bg-white/5 active:bg-white/10 px-2 py-2 -mx-2 transition"
                              on:click={() => (openEvent = e)}
                            >
                              <div class="flex items-start gap-2">
                                <div class={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${dot.cls}`} style={dot.style}></div>
                                <div class="min-w-0">
                                  <div class="text-sm font-medium truncate">{e.title}</div>
                                  <div class="text-xs text-white/55 truncate">
                                    {#if e.allDay}
                                      Ganztägig
                                    {:else}
                                      {formatTime(new Date(e.startAt))}{e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}
                                    {/if}
                                    {#if e.location}
                                      · {e.location}
                                    {/if}
                                  </div>
                                  {#if ps.length > 0}
                                    <div class="text-xs mt-0.5 truncate">
                                      {ps.map((p) => p.name).join(', ')}
                                    </div>
                                  {/if}
                                </div>
                              </div>
                            </button>
                          {/each}
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <div class="mt-2 text-center text-xs text-white/40">← Monat · Woche · Agenda →</div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="bg-white/5 rounded-xl p-3 glass border border-white/10 relative z-10" in:fly={{ x: 30, duration: 200 }} out:fade={{ duration: 100 }}>
        <div class="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            class="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15"
            aria-label="Vorheriger Monat"
            on:click={() => shiftMonth(-1)}
          >
            ‹
          </button>
          <div class="text-sm font-medium tracking-wide">{monthTitle}</div>
          <button
            type="button"
            class="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15"
            aria-label="Nächster Monat"
            on:click={() => shiftMonth(1)}
          >
            ›
          </button>
        </div>

        <div class="grid grid-cols-7 gap-1 text-[11px] text-white/55 mb-2">
          {#each weekdayLabelDays as d (d.toISOString())}
            <div class="text-center">{formatGermanDayLabel(d)}</div>
          {/each}
        </div>

        {#if monthError}
          <div class="text-red-400 text-sm mb-2">{monthError}</div>
        {/if}

        {#if monthLoading && monthEvents.length === 0}
          <div class="text-white/60 text-sm">Lade…</div>
        {:else}
          {#if monthLoading}
            <div class="text-white/50 text-xs mb-2">Aktualisiere…</div>
          {/if}
          <div class={cx('grid grid-cols-7 gap-1', monthLoading && 'opacity-60')}>
            {#each monthDays as d (d.toISOString())}
              {@const k = dateKeyLocal(d)}
              {@const dayEvents = monthEventsByDay.get(k) ?? []}
              {@const daySuggestions = monthSuggestionsByDay.get(k) ?? []}
              {@const showSuggestion = daySuggestions.length > 0}
              {@const maxEventDots = showSuggestion ? 2 : 3}
              <button
                type="button"
                class={cx(
                  'aspect-square rounded-lg flex flex-col items-center justify-center text-sm border border-white/10',
                  sameDay(d, selectedDate) ? 'bg-white/15' : 'hover:bg-white/10',
                  !isInMonth(d, monthAnchor) && 'opacity-60'
                )}
                on:click={() => setSelected(d)}
              >
                <div class="leading-none">{d.getDate()}</div>
                {#if dayEvents.length > 0 || showSuggestion}
                  <div class="mt-1 flex items-center justify-center gap-0.5">
                    {#each dayEvents.slice(0, maxEventDots) as ev (eventKey(ev))}
                      {@const d0 = eventDot(ev)}
                      <div class={`h-1.5 w-1.5 rounded-full ${d0.cls}`} style={d0.style}></div>
                    {/each}
                    {#if showSuggestion}
                      <div
                        class="h-1.5 w-1.5 rounded-full border border-dashed border-violet-400/70 bg-violet-500/30"
                        title={daySuggestions[0]?.title ? `Vorschlag: ${daySuggestions[0].title}` : 'Vorschlag'}
                      ></div>
                    {/if}
                    {#if dayEvents.length > maxEventDots || (showSuggestion && daySuggestions.length > 1)}
                      {@const extra = (dayEvents.length > maxEventDots ? dayEvents.length - maxEventDots : 0) + (showSuggestion ? Math.max(0, daySuggestions.length - 1) : 0)}
                      {#if extra > 0}
                        <div class="text-[10px] text-white/60 leading-none">+{extra}</div>
                      {/if}
                    {/if}
                  </div>
                {:else}
                  <div class="mt-1 h-1.5 w-1.5 rounded-full bg-transparent"></div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}

        <!-- Selected day detail panel -->
        <div class="mt-4 bg-white/5 rounded-xl p-3 border border-white/10">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium">
              {selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })}
              {#if sameDay(selectedDate, new Date())}
                <span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/25">Heute</span>
              {/if}
            </div>
            <button
              type="button"
              class="text-xs text-white/60 hover:text-white transition px-2 py-1 rounded hover:bg-white/10"
              on:click={() => { view = 'agenda'; }}
            >
              Zur Agenda →
            </button>
          </div>

          {#if selectedDayEvents.length === 0 && selectedDaySuggestions.length === 0}
            <div class="text-white/40 text-sm py-2">Keine Termine an diesem Tag</div>
          {:else}
            <div class="space-y-2">
              {#each selectedDayEvents as e (eventKey(e))}
                {@const ps = eventPersons(e)}
                {@const dot = eventDot(e)}
                <button
                  type="button"
                  class="w-full text-left rounded-lg bg-white/5 hover:bg-white/10 px-3 py-2 transition"
                  on:click={() => (openEvent = e)}
                >
                  <div class="flex items-start gap-2">
                    <div class={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${dot.cls}`} style={dot.style}></div>
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-medium truncate">{e.title}</div>
                      <div class="text-xs text-white/55">
                        {#if e.allDay}
                          Ganztägig
                        {:else}
                          {formatTime(new Date(e.startAt))}{e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}
                        {/if}
                        {#if e.location}
                          · {e.location}
                        {/if}
                      </div>
                      {#if ps.length > 0}
                        <div class="text-xs text-white/50 mt-0.5">{ps.map(p => p.name).join(', ')}</div>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}

              {#each selectedDaySuggestions as s (s.signature)}
                {@const sTag = s.tagId != null ? tags.find(t => t.id === s.tagId) : undefined}
                {@const sPersons = s.personIds.map(id => persons.find(p => p.id === id)).filter(Boolean) as PersonDto[]}
                <div class="rounded-lg border border-dashed border-violet-400/40 bg-violet-500/10 px-3 py-2">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-medium text-violet-200 truncate">{s.title}</div>
                      <div class="text-xs text-white/50">
                        {#if s.allDay}
                          Ganztägig
                        {:else if s.startTime}
                          {s.startTime}{s.endTime ? ` – ${s.endTime}` : ''}
                        {/if}
                        · Vorschlag
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                        title="Übernehmen"
                        on:click={() => acceptSuggestion(s)}
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        class="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
                        title="Ignorieren"
                        on:click={() => dismissSuggestion(s)}
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <div class="mt-3 text-center text-xs text-white/40">← Nach links wischen für Woche</div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if openEvent}
  <div class="fixed inset-0 z-50">
    <button type="button" class="absolute inset-0 bg-black/70" aria-label="Schließen" on:click={() => (openEvent = null)}></button>
    <div class="absolute inset-x-0 bottom-0 p-4">
      <div class="max-w-xl mx-auto glass border border-white/10 rounded-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-lg font-semibold leading-tight truncate">{openEvent.title}</div>
            <div class="text-sm text-white/70 mt-1">{formatEventDateLine(openEvent)}</div>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
              on:click={() => openEditFromEvent(openEvent!)}
            >
              Bearbeiten
            </button>
            <button type="button" class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm" on:click={() => (openEvent = null)}>
              Schließen
            </button>
          </div>
        </div>

        {#if openEvent.location}
          <div class="mt-3 text-sm text-white/80">
            <span class="text-white/50">Ort:</span> {openEvent.location}
          </div>
        {/if}

        {#if openEvent.tag || openEvent.person || (openEvent.persons && openEvent.persons.length > 0)}
          <div class="mt-3 text-sm text-white/80">
            {#if openEvent.tag}
              <div><span class="text-white/50">Tag:</span> {openEvent.tag.name}</div>
            {/if}
            {#if openEvent.persons && openEvent.persons.length > 0}
              <div>
                <span class="text-white/50">Personen:</span>
                {openEvent.persons.map((p) => p.name).join(', ')}
              </div>
            {:else if openEvent.person}
              <div><span class="text-white/50">Person:</span> {openEvent.person.name}</div>
            {/if}
          </div>
        {/if}

        {#if openEvent.description}
          <div class="mt-3 text-sm text-white/80 whitespace-pre-wrap">{openEvent.description}</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<AddEventModal
  open={editOpen}
  selectedDate={editEvent ? new Date(editEvent.startAt) : selectedDate}
  eventToEdit={editEvent}
  onClose={closeEdit}
  onCreated={onEventMutated}
  {outlookConnected}
  {todoEnabled}
/>

<!-- Quick Add Event Modal -->
{#if quickAddOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="w-full max-w-lg mx-4 mb-4 bg-black/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      transition:fly={{ y: 100, duration: 300 }}
      on:click|stopPropagation
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <button
          type="button"
          class="p-2 -m-2 text-white/60 hover:text-white transition"
          on:click={() => (quickAddOpen = false)}
          aria-label="Schließen"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 class="text-lg font-semibold text-white">Neuer Termin</h2>

        <div class="w-10"></div>
      </div>

      <!-- Form Content -->
      <div class="p-5 space-y-3">
        <input
          class="h-12 w-full px-4 rounded-xl bg-white/10 border-0 text-base placeholder:text-white/40"
          placeholder="Titel"
          aria-label="Titel"
          bind:value={newTitle}
        />

        <div class="relative">
          <input
            class="h-12 w-full px-4 pl-10 rounded-xl bg-white/10 border-0 text-sm placeholder:text-white/40"
            placeholder="Ort (optional)"
            aria-label="Ort"
            bind:value={newLocation}
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <input
            class="h-12 px-4 rounded-xl bg-white/10 border-0 text-sm"
            type="date"
            bind:value={newDate}
          />

          <label class="h-12 px-4 rounded-xl bg-white/10 border-0 text-sm flex items-center gap-2 text-white/80">
            <input type="checkbox" class="rounded bg-white/10 border-0" bind:checked={newAllDay} />
            Ganztägig
          </label>
        </div>

        {#if !newAllDay}
          <div class="grid grid-cols-2 gap-3">
            <div class="relative">
              <span class="absolute left-4 top-1 text-[10px] text-white/50 uppercase tracking-wide">Von</span>
              <input
                class="h-12 w-full px-4 pt-4 rounded-xl bg-white/10 border-0 text-sm"
                type="time"
                bind:value={newStartTime}
              />
            </div>
            <div class="relative">
              <span class="absolute left-4 top-1 text-[10px] text-white/50 uppercase tracking-wide">Bis</span>
              <input
                class="h-12 w-full px-4 pt-4 rounded-xl bg-white/10 border-0 text-sm"
                type="time"
                bind:value={newEndTime}
              />
            </div>
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-3">
          {#if tags.length > 0}
            <div class="relative">
              <button
                type="button"
                class="h-12 w-full rounded-xl bg-white/10 border border-white/10 text-sm px-4 flex items-center justify-between gap-3 hover:bg-white/15 active:bg-white/20 transition"
                aria-haspopup="listbox"
                aria-expanded={tagMenuOpen}
                disabled={metaLoading}
                on:click={() => (tagMenuOpen = !tagMenuOpen)}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class={`h-3 w-3 rounded-full ${
                      selectedTag
                        ? isHexColor(selectedTag.color)
                          ? 'bg-transparent'
                          : tagBg[selectedTag.color as TagColorKey] ?? 'bg-white/25'
                        : 'bg-white/25'
                    }`}
                    style={selectedTag && isHexColor(selectedTag.color) ? `background-color: ${selectedTag.color}` : ''}
                  ></div>
                  <div class="truncate text-white/85">{selectedTag ? selectedTag.name : 'Kein Tag'}</div>
                </div>
                <div class="text-white/60">▾</div>
              </button>

              {#if tagMenuOpen}
                <div
                  class="absolute z-50 bottom-full mb-2 w-full rounded-xl overflow-hidden border border-white/10 bg-black/80 backdrop-blur-md max-h-60 overflow-y-auto"
                  role="listbox"
                >
                  <button
                    type="button"
                    class={`w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${newTagId == null ? 'bg-white/10' : ''}`}
                    role="option"
                    aria-selected={newTagId == null}
                    on:click={() => chooseTag(null)}
                  >
                    <div class="h-3 w-3 rounded-full bg-white/25"></div>
                    <div>Kein Tag</div>
                  </button>

                  {#each tags as t (t.id)}
                    <button
                      type="button"
                      class={`w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${newTagId === t.id ? 'bg-white/10' : ''}`}
                      role="option"
                      aria-selected={newTagId === t.id}
                      on:click={() => chooseTag(t.id)}
                    >
                      <div
                        class={`h-3 w-3 rounded-full ${isHexColor(t.color) ? 'bg-transparent' : tagBg[t.color as TagColorKey] ?? 'bg-white/25'}`}
                        style={isHexColor(t.color) ? `background-color: ${t.color}` : ''}
                      ></div>
                      <div class="truncate">{t.name}</div>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div class="h-12 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-sm text-white/50">
              Kein Tag
            </div>
          {/if}

          {#if persons.length > 0}
            <div class="relative">
              <button
                type="button"
                class="h-12 w-full rounded-xl bg-white/10 border border-white/10 text-sm px-4 flex items-center justify-between gap-3 hover:bg-white/15 active:bg-white/20 transition"
                aria-haspopup="listbox"
                aria-expanded={personMenuOpen}
                disabled={metaLoading}
                on:click={() => (personMenuOpen = !personMenuOpen)}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class={`h-3 w-3 rounded-full ${primaryPerson
                      ? isHexColor(primaryPerson.color)
                        ? 'bg-transparent'
                        : tagBg[primaryPerson.color as TagColorKey] ?? 'bg-white/25'
                      : 'bg-white/25'}`}
                    style={primaryPerson && isHexColor(primaryPerson.color) ? `background-color: ${primaryPerson.color}` : ''}
                  ></div>
                  <div class="truncate text-white/85">{selectedPersonLabel}</div>
                </div>
                <div class="text-white/60">▾</div>
              </button>

              {#if personMenuOpen}
                <div
                  class="absolute z-50 bottom-full mb-2 w-full rounded-xl overflow-hidden border border-white/10 bg-black/80 backdrop-blur-md max-h-60 overflow-y-auto"
                  role="listbox"
                  aria-multiselectable="true"
                >
                  <button
                    type="button"
                    class="w-full px-4 py-3 text-left hover:bg-white/10 active:bg-white/15 transition"
                    on:click={() => (personMenuOpen = false)}
                  >
                    <div class="text-white/70">Fertig</div>
                  </button>

                  <button
                    type="button"
                    class={`w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${newPersonIds.length === 0 ? 'bg-white/10' : ''}`}
                    role="option"
                    aria-selected={newPersonIds.length === 0}
                    on:click={() => choosePerson(null)}
                  >
                    <div class="h-3 w-3 rounded-full bg-white/25"></div>
                    <div>Keine Person</div>
                  </button>

                  {#each persons as p (p.id)}
                    {@const selected = newPersonIds.includes(p.id)}
                    <button
                      type="button"
                      class={`w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${selected ? 'bg-white/10' : ''}`}
                      role="option"
                      aria-selected={selected}
                      on:click={() => choosePerson(p.id)}
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <div
                          class={`h-3 w-3 rounded-full ${isHexColor(p.color) ? 'bg-transparent' : tagBg[p.color as TagColorKey] ?? 'bg-white/25'}`}
                          style={isHexColor(p.color) ? `background-color: ${p.color}` : ''}
                        ></div>
                        <div class="truncate">{p.name}</div>
                      </div>
                      <div class="text-white/60">{selected ? '✓' : ''}</div>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div class="h-12 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-sm text-white/50">
              Keine Person
            </div>
          {/if}
        </div>

        <!-- ToDos (optional) -->
        {#if todoEnabled}
          <div class="border-t border-white/10 pt-3 mt-1">
            <div class="flex items-center justify-between">
              <div class="text-xs text-white/50">ToDos (optional)</div>
              <button
                type="button"
                class="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 active:scale-[0.98] transition text-xs font-medium"
                on:click={() => (todoSectionOpen = !todoSectionOpen)}
              >
                {todoSectionOpen ? 'ToDos ausblenden' : 'ToDo(s) hinzufügen'}
              </button>
            </div>

            {#if todoSectionOpen}
              <div class="mt-3">
                <div class="space-y-2">
                  {#if todoAccounts.length > 1}
                    <div class="relative">
                      <button
                        type="button"
                        class="w-full h-10 px-3 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90 flex items-center gap-2"
                        on:click={() => (todoAccountMenuOpen = !todoAccountMenuOpen)}
                      >
                        <span class="flex-1 text-left min-w-0">
                          <span class="block truncate">{selectedTodoAccount ? selectedTodoAccount.label : 'Konto wählen'}</span>
                          {#if selectedTodoAccount?.email}
                            <span class="block truncate text-xs text-white/50">{selectedTodoAccount.email}</span>
                          {/if}
                        </span>
                        <span class="text-white/50">▾</span>
                      </button>
                      {#if todoAccountMenuOpen}
                        <div class="absolute z-50 bottom-full mb-1 w-full rounded-lg bg-black/90 border border-white/10 max-h-40 overflow-auto">
                          {#each todoAccounts as c (c.id)}
                            <button
                              type="button"
                              class={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 ${c.id === todoSelectedConnectionId ? 'bg-white/10' : ''}`}
                              on:click={() => {
                                todoSelectedConnectionId = c.id;
                                todoAccountMenuOpen = false;
                              }}
                            >
                              <div class="min-w-0">
                                <div class="truncate text-white/90">{c.label}</div>
                                {#if c.email}
                                  <div class="truncate text-xs text-white/50">{c.email}</div>
                                {/if}
                              </div>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}

                    {#if todoListNames.length > 1}
                      <select
                        class="w-full h-10 px-3 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90 appearance-none"
                        bind:value={todoSelectedListName}
                      >
                        {#each todoListNames as ln}
                          <option class="bg-neutral-900" value={ln}>{ln}</option>
                        {/each}
                      </select>
                    {/if}

                    <textarea
                      class="w-full min-h-[60px] px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm placeholder:text-white/40 resize-none"
                      placeholder="Eine Zeile = ein ToDo"
                      bind:value={todoText}
                    ></textarea>
                    <div class="text-xs text-white/40 flex justify-between">
                      <span>Fällig am Termin-Tag</span>
                      <span>{parseTodoLines(todoText).length} ToDo(s)</span>
                    </div>
                    {#if todoError}
                      <div class="text-xs text-rose-400">{todoError}</div>
                    {/if}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if createError}
          <div class="text-red-400 text-sm">{createError}</div>
        {/if}

        <!-- Swipe to Submit -->
        <div class="pt-2">
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            class="relative h-14 rounded-full bg-white/5 border border-white/10 overflow-hidden select-none touch-pan-x"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(swipeProgress * 100)}
            on:touchstart={handleSwipeStart}
            on:touchmove={handleSwipeMove}
            on:touchend={handleSwipeEnd}
            on:mousedown={handleSwipeStart}
            on:mousemove={handleSwipeMove}
            on:mouseup={handleSwipeEnd}
            on:mouseleave={handleSwipeEnd}
          >
            <!-- Progress trail (only shows when swiping) -->
            {#if swipeCurrentX > 0}
              <div
                class="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/30 to-emerald-400/40 rounded-full"
                style="width: calc({swipeCurrentX}px + 56px)"
              ></div>
            {/if}

            <!-- Swipe handle -->
            <div
              class="absolute top-1 bottom-1 left-1 w-12 rounded-full shadow-lg flex items-center justify-center transition-colors"
              class:bg-gradient-to-br={!creating}
              class:from-emerald-400={!creating}
              class:to-emerald-600={!creating}
              class:bg-emerald-500={creating}
              style="transform: translateX({swipeCurrentX}px)"
            >
              {#if creating}
                <svg class="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              {:else}
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                </svg>
              {/if}
            </div>

            <!-- Label -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span class="text-white/50 text-sm font-medium pl-14">
                {creating ? 'Wird angelegt…' : swipeProgress > 0.5 ? 'Loslassen zum Anlegen' : 'Schieben zum Anlegen →'}
              </span>
            </div>

            <!-- Destination indicator -->
            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <div 
                class="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors {swipeProgress > 0.8 ? 'border-emerald-400 border-solid' : 'border-dashed border-white/20'}"
              >
                <svg 
                  class="w-4 h-4 transition-colors {swipeProgress > 0.8 ? 'text-emerald-400' : 'text-white/20'}" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Floating Buttons - hidden when any modal is open -->
{#if !anyModalOpen}
  <!-- Floating button on desktop: back to dashboard -->
  <a
    href="/"
    class="fixed bottom-6 left-6 z-50 hidden md:flex items-center gap-2 px-4 py-3 rounded-full bg-white/20 backdrop-blur-md border border-white/10 shadow-lg text-white text-sm font-medium hover:bg-white/30 transition-colors"
    aria-label="Zum Dashboard"
    in:fly={{ y: 50, duration: 300 }}
    out:fade={{ duration: 150 }}
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
    Dashboard
  </a>

  <!-- Mobile: docked side launcher (expands to bottom-right positions) -->
  <div class="fixed right-4 z-50 md:hidden" style="bottom: {mobileFabBaseBottom};">
    <!-- Trigger button -->
    <button
      type="button"
      class="h-14 w-14 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all duration-200 {fabDockOpen ? 'bg-white/25 backdrop-blur-lg border border-white/20' : 'bg-gradient-to-br from-indigo-500 to-purple-600 border border-indigo-400/30'}"
      aria-label={fabDockOpen ? 'Aktionen schließen' : 'Aktionen öffnen'}
      aria-expanded={fabDockOpen}
      on:click={toggleFabDock}
    >
      <div class={cx('transition-transform duration-300', fabDockOpen && 'rotate-45')}>
        <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
    </button>
  </div>

  {#if fabDockOpen}
    <!-- Add Event - flies up from trigger -->
    <div
      class="fixed right-4 z-50 md:hidden flex items-center justify-end gap-3"
      style="bottom: {mobileFabBottom('event')};"
      in:fly={{ y: mobileFabFlyY('event'), duration: 250 }}
      out:fly={{ y: mobileFabFlyY('event'), duration: 180 }}
    >
      <div class="pointer-events-none select-none px-3 py-2 rounded-full bg-black/55 backdrop-blur-md border border-white/10 shadow-lg text-white/85 text-xs font-semibold tracking-wide">
        <span class="inline-flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.6)]"></span>
          Termin
        </span>
      </div>

      <button
        type="button"
        class="h-14 w-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ring-2 ring-blue-300/20"
        aria-label="Neuen Termin erstellen"
        on:click={() => {
          clearFabDockTimer();
          fabDockOpen = false;
          todoSectionOpen = false;
          quickAddOpen = true;
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  {/if}

  {#if fabDockOpen && todoEnabled}
    <!-- Add ToDo - appears under the '+' dock, like dashboard -->
    <div
      class="fixed right-4 z-50 md:hidden flex items-center justify-end gap-3"
      style="bottom: {mobileFabBottom('todo')};"
      in:fly={{ y: mobileFabFlyY('todo'), duration: 270, delay: 20 }}
      out:fly={{ y: mobileFabFlyY('todo'), duration: 180 }}
    >
      <div class="pointer-events-none select-none px-3 py-2 rounded-full bg-black/55 backdrop-blur-md border border-white/10 shadow-lg text-white/85 text-xs font-semibold tracking-wide">
        <span class="inline-flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]"></span>
          ToDo
        </span>
      </div>

      <button
        type="button"
        class="h-14 w-14 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ring-2 ring-emerald-300/20"
        aria-label="ToDo erstellen"
        on:click={() => {
          clearFabDockTimer();
          fabDockOpen = false;
          openTodoCreateModal();
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  {/if}

  <!-- Scribble - separate block so it gets its own transition -->
  {#if fabDockOpen && scribbleEnabled}
    <div
      class="fixed right-4 z-50 md:hidden flex items-center justify-end gap-3"
      style="bottom: {mobileFabBottom('scribble')};"
      in:fly={{ y: mobileFabFlyY('scribble'), duration: 280, delay: 40 }}
      out:fly={{ y: mobileFabFlyY('scribble'), duration: 180 }}
    >
      <div class="pointer-events-none select-none px-3 py-2 rounded-full bg-black/55 backdrop-blur-md border border-white/10 shadow-lg text-white/85 text-xs font-semibold tracking-wide">
        <span class="inline-flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]"></span>
          Notiz
        </span>
      </div>

      <button
        type="button"
        class="h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ring-2 ring-amber-300/20"
        aria-label="Scribble Notiz erstellen"
        on:click={() => {
          clearFabDockTimer();
          fabDockOpen = false;
          scribbleModalOpen = true;
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  {/if}

  <!-- Desktop: keep classic floating add button -->
  <button
    type="button"
    class="fixed z-50 h-14 w-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 shadow-lg hidden md:flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
    class:bottom-24={scribbleEnabled}
    class:bottom-6={!scribbleEnabled}
    class:right-6={true}
    aria-label="Neuen Termin erstellen"
    on:click={() => {
      todoSectionOpen = false;
      quickAddOpen = true;
    }}
    in:fly={{ y: 50, duration: 300 }}
    out:fade={{ duration: 150 }}
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  </button>

  <!-- Desktop scribble (if enabled) -->
  {#if scribbleEnabled}
    <button
      type="button"
      class="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg hidden md:flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      aria-label="Scribble Notiz erstellen"
      on:click={() => (scribbleModalOpen = true)}
      in:fly={{ y: 50, duration: 300 }}
      out:fade={{ duration: 150 }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  {/if}
{/if}

<TodoModal
  open={todoCreateOpen}
  onClose={() => (todoCreateOpen = false)}
  onSaved={() => void refreshTodoMeta()}
  mode="create"
  item={null}
  listNames={todoListNames && todoListNames.length > 0 ? todoListNames : [todoListName]}
  selectedListName={todoCreateListName}
  onChangeListName={(v) => (todoCreateListName = v)}
  connections={todoAccounts.map((c) => ({ id: c.id, label: c.label, color: c.color }))}
  selectedConnectionId={todoCreateConnectionId}
  onChangeConnectionId={(v) => (todoCreateConnectionId = v)}
  prefillDueAt={null}
/>

<ScribbleModal
  bind:open={scribbleModalOpen}
  authorName=""
  on:close={() => (scribbleModalOpen = false)}
  on:save={handleScribbleSave}
/>
