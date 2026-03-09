<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';

  import AddEventModal from '$lib/components/AddEventModal.svelte';
  import RecurringEditChoiceModal, { type RecurringEditScope } from '$lib/components/RecurringEditChoiceModal.svelte';
  import ScribbleModal from '$lib/components/ScribbleModal.svelte';
  import TodoModal from '$lib/components/TodoModal.svelte';

  import {
    createEvent,
    createScribble,
    createTodo,
    dismissRecurringSuggestion,
    type EventDto,
    type OutlookConnectionDto,
    type PersonDto,
    type TagColorKey,
    type TagDto
  } from '$lib/api';
  import { getLoginRedirectPath, resolveStoredUser } from '$lib/auth';
  import { daysForMonthGrid, formatGermanDayLabel, formatMonthTitle, startOfDay, endOfDay, sameDay } from '$lib/date';
  import {
    applyTodoMetaDefaults,
    buildPlannerTodoAccounts,
    DASHBO_TODO_CONNECTION_ID,
    getInitialTodoCreateState,
    normalizeTodoMeta,
    parseTodoLines,
    type PlannerTodoAccount
  } from '$lib/planner/todoHelpers';
  import {
    getPlannerInitialWeekSpan,
    loadPlannerDefaultView,
    savePlannerDefaultView as persistPlannerDefaultView,
    shouldShowPlannerFabTeaser,
    type PlannerViewMode
  } from '$lib/planner/preferences';
  import {
    buildPlannerEventCreateInput,
    buildPlannerTodoCreateInputs,
    canSubmitPlannerQuickAdd,
    createPlannerQuickAddDefaults,
    parseQuarterHourTime,
    roundToNextHalfHourTime,
    toDateInputValue,
    type PlannerRecurrence
  } from '$lib/planner/quickAdd';
  import {
    fetchPlannerAgendaEvents,
    fetchPlannerMeta,
    fetchPlannerMonthEvents,
    fetchPlannerSuggestionEvents,
    fetchPlannerTodoMeta,
    fetchPlannerWeekEvents
  } from '$lib/planner/data';
  import {
    generatePlannerSuggestions,
    getPlannerEventPersons,
    removePlannerSuggestion,
    takePlannerSuggestionPreview,
    type PlannerSuggestionDto
  } from '$lib/planner/suggestions';

  type ViewMode = PlannerViewMode;
  const PLANNER_DEFAULT_VIEW_KEY = 'dashbo-planner-default-view';
  const PLANNER_FAB_TEASER_KEY = 'dashbo-planner-fab-teaser-seen';
  const plannerViewOptions: Array<{ value: ViewMode; label: string }> = [
    { value: 'agenda', label: 'Agenda' },
    { value: 'week', label: 'Woche' },
    { value: 'month', label: 'Monat' }
  ];

  let view: ViewMode = 'agenda';
  let plannerDefaultView: ViewMode = 'agenda';
  let plannerSettingsOpen = false;

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
  let newEndDate = '';
  let newAllDay = false;
  let newStartTime = '';
  let newEndTime = '';
  let newRecurrence: PlannerRecurrence = null;
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
  // Keep the FAB above the bottom navigation on mobile.
  const MOBILE_BOTTOM_NAV_GUARD = '6rem';
  $: mobileFabBaseBottom = `calc(${MOBILE_BOTTOM_NAV_GUARD} + 0.75rem + env(safe-area-inset-bottom))`;
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
    return `calc(${MOBILE_BOTTOM_NAV_GUARD} + 0.75rem + env(safe-area-inset-bottom) + ${(idx + 1).toString()} * ${MOBILE_FAB_STEP})`;
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

  $: todoAccounts = buildPlannerTodoAccounts(outlookConnections) satisfies PlannerTodoAccount[];

  $: selectedTodoAccount =
    todoSelectedConnectionId != null ? todoAccounts.find((c) => c.id === todoSelectedConnectionId) ?? null : null;

  function openTodoCreateModal() {
    const initialState = getInitialTodoCreateState({ todoListNames, todoListName, todoAccounts });
    todoCreateListName = initialState.listName;
    todoCreateConnectionId = initialState.connectionId;
    todoCreateOpen = true;
  }

  async function refreshTodoMeta() {
    if (!todoEnabled) return;
    const next = await fetchPlannerTodoMeta({ todoSelectedConnectionId, todoSelectedListName });
    todoListName = next.todoListName;
    todoListNames = next.todoListNames;
    outlookConnections = next.outlookConnections;
    todoSelectedConnectionId = next.todoSelectedConnectionId;
    todoSelectedListName = next.todoSelectedListName;
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

  let editScope: RecurringEditScope = 'series';
  let editOccurrenceStartAt: string | null = null;

  let recurringEditChoiceOpen = false;
  let recurringEditChoiceEvent: EventDto | null = null;

  function openEditFromEvent(e: EventDto) {
    if (e.source === 'outlook') return;

    if (e.recurrence?.freq) {
      recurringEditChoiceEvent = e;
      recurringEditChoiceOpen = true;
      return;
    }

    editScope = 'series';
    editOccurrenceStartAt = null;
    editEvent = e;
    editOpen = true;
    openEvent = null;
  }

  function closeRecurringEditChoice() {
    recurringEditChoiceOpen = false;
    recurringEditChoiceEvent = null;
  }

  function chooseRecurringEdit(scope: RecurringEditScope) {
    const e = recurringEditChoiceEvent;
    closeRecurringEditChoice();
    if (!e) return;
    if (e.source === 'outlook') return;

    editScope = scope;
    editOccurrenceStartAt = scope === 'occurrence' ? e.startAt : null;
    editEvent = e;
    editOpen = true;
    openEvent = null;
  }

  function closeEdit() {
    editOpen = false;
    editEvent = null;
    editScope = 'series';
    editOccurrenceStartAt = null;
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
    if (e.allDay) {
      if (e.endAt) {
        const end = new Date(e.endAt);
        const sameRange = sameDay(start, end);
        if (!sameRange) {
          return `${d} – ${end.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`;
        }
      }
      return d;
    }

    const time = `${formatTime(start)}${e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}`;
    return `${d} · ${time}`;
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

  function savePlannerDefaultView(next: ViewMode) {
    persistPlannerDefaultView(window.localStorage, PLANNER_DEFAULT_VIEW_KEY, next);
  }

  function choosePlannerDefaultView(next: ViewMode) {
    plannerDefaultView = next;
    savePlannerDefaultView(next);
    setView(next);
    plannerSettingsOpen = false;
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

  $: weekStart = mondayStart(selectedDate);
  $: weekEnd = addDays(weekStart, 6);
  $: weekStripDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  $: weekRangeLabel = `${weekStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${weekEnd.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  type WeekSpan = 3 | 7;
  let weekSpan: WeekSpan = 7;
  $: weekNavShiftDays = weekSpan === 7 ? 7 : 3;
  $: weekVisibleDays =
    weekSpan === 7 ? weekStripDays : [addDays(selectedDate, -1), selectedDate, addDays(selectedDate, 1)];
  $: weekVisibleRangeLabel = (() => {
    const start = weekVisibleDays[0];
    const end = weekVisibleDays[weekVisibleDays.length - 1];
    return `${start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  })();

  type WeekAllDaySegment = {
    event: EventDto;
    start: number;
    span: number;
  };

  let weekEventsByDay = new Map<string, EventDto[]>();
  $: {
    // Use weekVisibleDays to support both 7-day and 3-day views correctly
    const allowed = new Set(weekVisibleDays.map((d) => dateKeyLocal(d)));
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

  let weekAllDayRows: WeekAllDaySegment[][] = [];
  $: {
    const visibleStart = weekVisibleDays[0];
    const visibleEnd = weekVisibleDays[weekVisibleDays.length - 1];
    const segments: WeekAllDaySegment[] = [];
    const seen = new Set<string>();

    for (const event of weekEvents) {
      if (!event.allDay) continue;

      const key = eventKey(event);
      if (seen.has(key)) continue;
      seen.add(key);

      const eventStart = startOfLocalDay(new Date(event.startAt));
      const eventEnd = startOfLocalDay(event.endAt ? new Date(event.endAt) : new Date(event.startAt));

      if (eventEnd < visibleStart || eventStart > visibleEnd) continue;

      let startIndex = 0;
      while (startIndex < weekVisibleDays.length && weekVisibleDays[startIndex]!.getTime() < eventStart.getTime()) {
        startIndex += 1;
      }

      let endIndex = weekVisibleDays.length - 1;
      while (endIndex >= 0 && weekVisibleDays[endIndex]!.getTime() > eventEnd.getTime()) {
        endIndex -= 1;
      }

      if (startIndex > endIndex) continue;
      segments.push({ event, start: startIndex, span: endIndex - startIndex + 1 });
    }

    segments.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.span !== b.span) return b.span - a.span;
      return new Date(a.event.startAt).getTime() - new Date(b.event.startAt).getTime();
    });

    const rows: WeekAllDaySegment[][] = [];
    for (const segment of segments) {
      let placed = false;
      for (const row of rows) {
        const overlaps = row.some((entry) => {
          const entryEnd = entry.start + entry.span - 1;
          const segmentEnd = segment.start + segment.span - 1;
          return segment.start <= entryEnd && entry.start <= segmentEnd;
        });
        if (!overlaps) {
          row.push(segment);
          placed = true;
          break;
        }
      }
      if (!placed) rows.push([segment]);
    }

    weekAllDayRows = rows;
  }

  async function refreshWeek() {
    weekLoading = true;
    weekError = null;
    try {
      weekEvents = await fetchPlannerWeekEvents(selectedDate, weekSpan);
    } catch (err) {
      weekError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      weekEvents = [];
    } finally {
      weekLoading = false;
    }
  }

  function resetQuickAddDefaults(targetDate: Date) {
    const defaults = createPlannerQuickAddDefaults(targetDate, new Date());
    newTitle = defaults.title;
    newLocation = defaults.location;
    newEndDate = defaults.endDate;
    newAllDay = defaults.allDay;
    newStartTime = defaults.startTime;
    newEndTime = defaults.endTime;
    newRecurrence = defaults.recurrence;
    newTagIdStr = defaults.tagId != null ? String(defaults.tagId) : '';
    newPersonIds = defaults.personIds;
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

  const eventPersons = getPlannerEventPersons;

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

  function jumpToCurrentMonth() {
    const today = new Date();
    monthAnchor = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    newDate = toDateInputValue(selectedDate);
    closePopovers();
    void refreshMonth();
    void refreshAgenda();
    void refreshWeek();
  }
  $: isMonthAnchorCurrent = (() => {
    const now = new Date();
    return monthAnchor.getFullYear() === now.getFullYear() && monthAnchor.getMonth() === now.getMonth();
  })();

  async function refreshAgenda() {
    agendaLoading = true;
    agendaError = null;
    try {
      agendaEvents = await fetchPlannerAgendaEvents(selectedDate);
      // Generate suggestions based on a wider window (needs past events to detect patterns)
      try {
        const suggestEvents = await fetchPlannerSuggestionEvents();
        suggestionSourceEvents = suggestEvents;
        suggestionsAll = generatePlannerSuggestions(suggestEvents, dismissedSuggestions);
        suggestions = takePlannerSuggestionPreview(suggestionsAll);
      } catch {
        suggestionSourceEvents = [];
        suggestionsAll = [];
        suggestions = [];
      }
    } catch (err) {
      agendaError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      agendaEvents = [];
    } finally {
      agendaLoading = false;
    }
  }

  async function dismissSuggestion(s: PlannerSuggestionDto) {
    dismissedSuggestions = [...dismissedSuggestions, s.signature];
    suggestionsAll = removePlannerSuggestion(suggestionsAll, s.signature);
    suggestions = takePlannerSuggestionPreview(suggestionsAll);
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
    newEndDate = '';
    newAllDay = s.allDay;
    newStartTime = s.startTime ?? '';
    newEndTime = s.endTime ?? '';
    newRecurrence = null;
    newTagIdStr = s.tagId != null ? String(s.tagId) : '';
    newPersonIds = s.personIds.slice();
    todoSectionOpen = false;
    quickAddOpen = true;
    suggestionsAll = removePlannerSuggestion(suggestionsAll, s.signature);
    suggestions = takePlannerSuggestionPreview(suggestionsAll);
  }

  async function refreshMonth() {
    monthLoading = true;
    monthError = null;
    try {
      monthEvents = await fetchPlannerMonthEvents(monthAnchor);
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
    const builtEvent = buildPlannerEventCreateInput({
      title: newTitle,
      location: newLocation,
      date: newDate,
      endDate: newEndDate,
      allDay: newAllDay,
      startTime: newStartTime,
      endTime: newEndTime,
      recurrence: newRecurrence,
      tagId: newTagId,
      personIds: newPersonIds
    });

    if ('error' in builtEvent) {
      createError = builtEvent.error;
      return;
    }

    creating = true;
    try {
      await createEvent(builtEvent.payload);

      // Create ToDos if enabled (Dashbo-local or Outlook)
      const todoInputs = buildPlannerTodoCreateInputs({
        enabled: todoEnabled,
        todoText,
        selectedDate: builtEvent.selectedDate,
        todoSelectedListName,
        todoListNames,
        todoListName,
        todoSelectedConnectionId,
        parseTodoLines
      });
      if (todoInputs.length > 0) {
        todoSaving = true;
        todoError = null;
        try {
          await Promise.all(todoInputs.map((input) => createTodo(input)));
        } catch (e: any) {
          todoError = e?.message || 'Fehler beim Speichern der ToDos';
        } finally {
          todoSaving = false;
        }
      }

      const defaults = createPlannerQuickAddDefaults(builtEvent.selectedDate, new Date());
      newTitle = defaults.title;
      newLocation = defaults.location;
      newEndDate = defaults.endDate;
      newAllDay = defaults.allDay;
      newStartTime = defaults.startTime;
      newEndTime = defaults.endTime;
      newRecurrence = defaults.recurrence;
      newTagIdStr = defaults.tagId != null ? String(defaults.tagId) : '';
      newPersonIds = defaults.personIds;
      todoText = '';
      todoError = null;
      closePopovers();

      // Keep the agenda anchored to the event day
      selectedDate = builtEvent.selectedDate;
      monthAnchor = new Date(builtEvent.selectedDate.getFullYear(), builtEvent.selectedDate.getMonth(), 1);

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
    if (creating || !canSubmit) return;
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
    if (canSubmit && swipeCurrentX >= SWIPE_THRESHOLD) {
      void doCreate();
    }
    swiping = false;
    swipeCurrentX = 0;
  }

  $: swipeProgress = Math.min(1, swipeCurrentX / SWIPE_THRESHOLD);
  $: canSubmit = canSubmitPlannerQuickAdd(
    {
      title: newTitle,
      location: newLocation,
      date: newDate,
      endDate: newEndDate,
      allDay: newAllDay,
      startTime: newStartTime,
      endTime: newEndTime,
      recurrence: newRecurrence,
      tagId: newTagId,
      personIds: newPersonIds
    },
    creating,
    todoSaving
  );
  $: anyModalOpen = quickAddOpen || scribbleModalOpen || editOpen || openEvent !== null || todoCreateOpen;

  onMount(() => {
    void (async () => {
      if (!(await resolveStoredUser())) {
        await goto(getLoginRedirectPath('/planner'));
        return;
      }

      try {
        plannerDefaultView = loadPlannerDefaultView(window.localStorage, PLANNER_DEFAULT_VIEW_KEY);
        view = plannerDefaultView;
        weekSpan = getPlannerInitialWeekSpan(window.matchMedia);
      } catch {
        // ignore viewport detection errors
      }

      if (shouldShowPlannerFabTeaser(window.matchMedia, window.localStorage, PLANNER_FAB_TEASER_KEY)) {
        window.setTimeout(() => {
          if (anyModalOpen) return;
          fabDockOpen = true;
          window.setTimeout(() => {
            fabDockOpen = false;
          }, 1200);
        }, 600);
      }

      metaLoading = true;
      metaError = null;
      try {
        const meta = await fetchPlannerMeta();
        backgroundUrl = meta.backgroundUrl;
        scribbleEnabled = meta.scribbleEnabled;
        todoEnabled = meta.todoEnabled;
        dismissedSuggestions = meta.dismissedSuggestions;
        tags = meta.tags;
        persons = meta.persons;
        outlookConnected = meta.outlookConnected;

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
          suggestionsAll = generatePlannerSuggestions(suggestionSourceEvents, dismissedSuggestions);
          suggestions = takePlannerSuggestionPreview(suggestionsAll);
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

<div class="h-screen text-white overflow-hidden relative bg-black flex flex-col">
  <div class="absolute inset-0 overflow-hidden">
    <div
      class="absolute inset-0"
      style={`background-image: ${bgOverlay}, url('${backgroundUrl}'); background-size: cover; background-position: center;`}
    ></div>
  </div>

  <div
    class="relative z-10 flex-1 flex flex-col min-h-0 max-w-xl mx-auto w-full"
  >
    <!-- Header -->
    <div class="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between gap-3">
      <div class="text-xl font-semibold tracking-wide">Dashbo</div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="h-9 w-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors border border-white/10 hover:bg-white/15"
          title="Einstellungen"
          on:click={() => {
            plannerSettingsOpen = true;
            closePopovers();
          }}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>

    {#if metaError}
      <div class="shrink-0 text-red-400 text-sm mb-3 px-4">{metaError}</div>
    {/if}

    {#if view === 'agenda'}
      <div class="flex-1 flex flex-col min-h-0 px-4" in:fly={{ x: -30, duration: 200 }} out:fade={{ duration: 100 }}>
        <div class="shrink-0 flex items-center justify-between gap-3 mb-3">
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

            <div class="min-w-0 font-medium">
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

        <div class="flex-1 min-h-0 overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
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
      </div>
    {:else if view === 'week'}
      <div class="flex-1 flex flex-col min-h-0 px-4" in:fly={{ x: 0, duration: 200 }} out:fade={{ duration: 100 }}>
        <!-- Week Navigation -->
        <div class="shrink-0 flex items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2 text-white/85 text-sm">
            <button
              type="button"
              class="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/10"
              aria-label={weekSpan === 7 ? 'Vorherige Woche' : 'Vorherige 3 Tage'}
              title={weekSpan === 7 ? 'Vorherige Woche' : 'Vorherige 3 Tage'}
              on:click={() => {
                selectedDate = addDays(selectedDate, -weekNavShiftDays);
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

            <div class="min-w-0 font-medium">{weekSpan === 7 ? weekRangeLabel : weekVisibleRangeLabel}</div>

            <button
              type="button"
              class="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 hover:bg-white/10"
              aria-label={weekSpan === 7 ? 'Nächste Woche' : 'Nächste 3 Tage'}
              title={weekSpan === 7 ? 'Nächste Woche' : 'Nächste 3 Tage'}
              on:click={() => {
                selectedDate = addDays(selectedDate, weekNavShiftDays);
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

          <div class="flex items-center gap-2">
            <div class="h-9 p-1 rounded-xl bg-white/5 border border-white/10 flex items-center">
              <button
                type="button"
                class={cx(
                  'h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors',
                  weekSpan === 3 ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                )}
                on:click={() => {
                  if (weekSpan !== 3) {
                    weekSpan = 3;
                    void refreshWeek();
                  }
                }}
              >
                3T
              </button>
              <button
                type="button"
                class={cx(
                  'h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors',
                  weekSpan === 7 ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                )}
                on:click={() => {
                  if (weekSpan !== 7) {
                    weekSpan = 7;
                    void refreshWeek();
                  }
                }}
              >
                7T
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
        </div>

        {#if weekError}
          <div class="shrink-0 text-red-400 text-sm mb-2">{weekError}</div>
        {/if}

        {#if weekLoading && weekEvents.length === 0}
          <div class="shrink-0 text-white/60 text-sm">Lade…</div>
        {:else}
          {#if weekLoading}
            <div class="shrink-0 text-white/50 text-xs mb-2">Aktualisiere…</div>
          {/if}

          {#if weekAllDayRows.length > 0}
            <div class="shrink-0 mb-2 px-1">
              <div class="text-[10px] uppercase tracking-wide text-white/45 mb-1">Ganztägig</div>
              <div class={cx('grid gap-1.5', weekSpan === 7 ? 'grid-cols-7' : 'grid-cols-3')}>
                {#each weekAllDayRows as row, rowIndex}
                  {#each row as segment (eventKey(segment.event))}
                    {@const dot = eventDot(segment.event)}
                    <button
                      type="button"
                      class="min-w-0 h-8 rounded-lg px-2 text-left text-[10px] font-medium bg-white/8 hover:bg-white/12 transition flex items-center gap-1.5"
                      style={`grid-column: ${segment.start + 1} / span ${segment.span}; grid-row: ${rowIndex + 1};`}
                      on:click={() => (openEvent = segment.event)}
                      title={segment.event.title}
                    >
                      <div class={`h-2 w-2 rounded-full shrink-0 ${dot.cls}`} style={dot.style}></div>
                      <span class="truncate">{segment.event.title}</span>
                    </button>
                  {/each}
                {/each}
              </div>
            </div>
          {/if}

          <!-- Full-height week grid -->
          <div
            class={cx(
              'flex-1 min-h-0 grid gap-1.5',
              weekSpan === 7 ? 'grid-cols-7' : 'grid-cols-3',
              weekLoading && 'opacity-60'
            )}
          >
            {#each weekVisibleDays as d (dateKeyLocal(d))}
              {@const k = dateKeyLocal(d)}
              {@const isToday = sameDay(d, new Date())}
              {@const isSelected = sameDay(d, selectedDate)}
              {@const items = (weekEventsByDay.get(k) ?? []).filter((event) => !event.allDay)}
              <div
                class={cx(
                  'h-full flex flex-col rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm overflow-hidden transition',
                  isToday && 'ring-2 ring-emerald-400/50',
                  isSelected && 'bg-white/5'
                )}
              >
                <!-- Day Header -->
                <button
                  type="button"
                  class={cx(
                    'shrink-0 py-2 flex flex-col items-center transition-all hover:bg-white/5',
                    isSelected && 'bg-white/10'
                  )}
                  on:click={() => {
                    selectedDate = d;
                    newDate = toDateInputValue(d);
                  }}
                >
                  <div class="text-[10px] font-semibold tracking-wider text-white/60">{formatGermanDayLabel(d).toUpperCase()}</div>
                  <div class={cx('text-lg font-bold mt-0.5', isToday ? 'text-emerald-400' : '')}>
                    {d.getDate()}.
                  </div>
                  {#if isToday}
                    <div class="mt-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] font-semibold tracking-wide">
                      Heute
                    </div>
                  {/if}
                </button>

                <!-- Add button (on selected day) -->
                {#if isSelected}
                  <button
                    type="button"
                    class="shrink-0 mx-2 mt-2 mb-2 h-9 rounded-xl bg-white/6 hover:bg-white/12 text-white/60 hover:text-white text-sm font-medium flex items-center justify-center gap-1 transition-all"
                    aria-label="Termin hinzufügen"
                    on:click={() => openQuickAddForDay(d)}
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                {/if}

                <!-- Events List -->
                <div class="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2 space-y-1">
                  {#if items.length === 0}
                    <div class="text-white/30 text-xs text-center py-1">—</div>
                  {:else}
                    {#each items as e (eventKey(e))}
                      {@const ps = eventPersons(e)}
                      {@const dot = eventDot(e)}
                      <button
                        type="button"
                        class="w-full text-left rounded-lg hover:bg-white/10 active:bg-white/15 px-1.5 py-1.5 transition bg-white/5"
                        on:click={() => (openEvent = e)}
                      >
                        <div class="flex items-start gap-1.5">
                          <div class={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${dot.cls}`} style={dot.style}></div>
                          <div class="min-w-0 flex-1">
                            <div class="text-[11px] font-semibold leading-tight line-clamp-2">{e.title}</div>
                            <div class="text-[9px] text-white/55 leading-tight mt-0.5">
                              {#if e.allDay}
                                Ganztägig
                              {:else}
                                {formatTime(new Date(e.startAt))}{e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}
                              {/if}
                            </div>
                            {#if ps.length > 0}
                              <div class="text-[9px] text-white/45 mt-0.5 truncate">
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
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex-1 min-h-0 overflow-y-auto px-4 pb-4" in:fly={{ x: 30, duration: 200 }} out:fade={{ duration: 100 }}>
        <div class="bg-white/5 rounded-xl p-3 glass border border-white/10">
        <div class="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            class="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15"
            aria-label="Vorheriger Monat"
            on:click={() => shiftMonth(-1)}
          >
            ‹
          </button>
          <div class="flex items-center gap-2">
            <div class="text-sm font-medium tracking-wide">{monthTitle}</div>
            {#if !isMonthAnchorCurrent}
              <button
                type="button"
                class="h-7 px-2.5 rounded-md bg-white/10 hover:bg-white/15 text-[11px] font-medium text-white/85"
                on:click={jumpToCurrentMonth}
              >
                Heute
              </button>
            {/if}
          </div>
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
        <div class="mt-4 mb-20 bg-white/5 rounded-xl p-3 border border-white/10">
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
        </div>
        </div>
      </div>
    {/if}

    <!-- Bottom Navigation Bar -->
    <div class="shrink-0 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div class="flex items-center justify-center gap-2 py-2.5 px-3 rounded-3xl bg-black/45 backdrop-blur-xl border border-white/15 shadow-[0_14px_50px_rgba(0,0,0,0.55)]">
        <button
          type="button"
          class={cx(
            'flex-1 flex flex-col items-center gap-1 py-2 px-2.5 rounded-2xl transition-all',
            view === 'agenda'
              ? 'bg-white/15 text-white ring-1 ring-white/10'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          )}
          on:click={() => setView('agenda')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span class="text-xs font-medium">Agenda</span>
        </button>
        <button
          type="button"
          class={cx(
            'flex-1 flex flex-col items-center gap-1 py-2 px-2.5 rounded-2xl transition-all',
            view === 'week' ? 'bg-white/15 text-white ring-1 ring-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'
          )}
          on:click={() => setView('week')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="text-xs font-medium">Woche</span>
        </button>
        <button
          type="button"
          class={cx(
            'flex-1 flex flex-col items-center gap-1 py-2 px-2.5 rounded-2xl transition-all',
            view === 'month' ? 'bg-white/15 text-white ring-1 ring-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'
          )}
          on:click={() => setView('month')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span class="text-xs font-medium">Monat</span>
        </button>
        <button
          type="button"
          class="flex flex-col items-center gap-1 py-2 px-2.5 rounded-2xl text-white/60 hover:text-white hover:bg-white/5 transition-all"
          on:click={() => {
            plannerSettingsOpen = true;
            closePopovers();
          }}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-xs font-medium">Settings</span>
        </button>
      </div>
    </div>
  </div>
</div>

{#if plannerSettingsOpen}
  <div class="fixed inset-0 z-50">
    <button
      type="button"
      class="absolute inset-0 bg-black/65"
      aria-label="Einstellungen schließen"
      on:click={() => (plannerSettingsOpen = false)}
    ></button>
    <div class="absolute inset-x-0 bottom-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div class="max-w-xl mx-auto glass border border-white/10 rounded-2xl p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="text-base font-semibold">Mobile Einstellungen</div>
          <button
            type="button"
            class="h-8 w-8 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
            aria-label="Schließen"
            on:click={() => (plannerSettingsOpen = false)}
          >
            <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="mt-4">
          <div class="text-sm text-white/75 mb-2">Standardansicht beim Öffnen</div>
          <div class="grid grid-cols-3 gap-2">
            {#each plannerViewOptions as option (option.value)}
              <button
                type="button"
                class={cx(
                  'py-2 px-2 rounded-lg text-sm border transition',
                  plannerDefaultView === option.value
                    ? 'bg-white/15 text-white border-white/30'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                )}
                on:click={() => choosePlannerDefaultView(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-white/10">
          <a
            href="/settings?from=/planner"
            class="inline-flex items-center gap-2 text-sm text-white/75 hover:text-white transition"
            on:click={() => (plannerSettingsOpen = false)}
          >
            Erweiterte Einstellungen öffnen
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if openEvent}
  {@const openEventPersons = openEvent.persons && openEvent.persons.length > 0 ? openEvent.persons : openEvent.person ? [openEvent.person] : []}
  <div class="fixed inset-0 z-50">
    <button type="button" class="absolute inset-0 bg-black/70" aria-label="Schließen" on:click={() => (openEvent = null)}></button>
    <div class="absolute inset-x-0 bottom-0 p-4">
      <div class="max-w-xl mx-auto glass border border-white/10 rounded-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="text-lg font-semibold leading-tight truncate">{openEvent.title}</div>
            <div class="text-sm text-white/70 mt-1">{formatEventDateLine(openEvent)}</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="h-9 w-9 rounded-lg bg-transparent hover:bg-white/5 active:bg-white/10 transition grid place-items-center text-white"
              aria-label="Bearbeiten"
              title="Bearbeiten"
              on:click={() => openEditFromEvent(openEvent!)}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              type="button"
              class="h-9 w-9 rounded-lg bg-transparent hover:bg-white/5 active:bg-white/10 transition grid place-items-center text-white"
              aria-label="Schließen"
              title="Schließen"
              on:click={() => (openEvent = null)}
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {#if openEvent.location}
          <div class="mt-3 text-sm text-white/80">
            <span class="text-white/50">Ort:</span> {openEvent.location}
          </div>
        {/if}

        {#if openEvent.tag || openEventPersons.length > 0}
          <div class="mt-3 flex flex-wrap items-center gap-2">
            {#if openEvent.tag}
              {@const tagColor = openEvent.tag.color}
              <span
                class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  isHexColor(tagColor) ? 'border-white/20' : 'border-transparent'
                } ${isHexColor(tagColor) ? '' : tagBg[tagColor as TagColorKey] + '/20 ' + textFg[tagColor as TagColorKey]}`}
                style={isHexColor(tagColor) ? `background-color: ${tagColor}22; color: ${tagColor}` : ''}
              >
                <span
                  class={`w-2 h-2 rounded-full ${isHexColor(tagColor) ? '' : tagBg[tagColor as TagColorKey]}`}
                  style={isHexColor(tagColor) ? `background-color: ${tagColor}` : ''}
                ></span>
                {openEvent.tag.name}
              </span>
            {/if}
            {#each openEventPersons as p (p.id)}
              {@const pColor = p.color}
              <span
                class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  isHexColor(pColor) ? 'border-white/20' : 'border-transparent'
                } ${isHexColor(pColor) ? '' : tagBg[pColor as TagColorKey] + '/20 ' + textFg[pColor as TagColorKey]}`}
                style={isHexColor(pColor) ? `background-color: ${pColor}22; color: ${pColor}` : ''}
              >
                <span
                  class={`w-2 h-2 rounded-full ${isHexColor(pColor) ? '' : tagBg[pColor as TagColorKey]}`}
                  style={isHexColor(pColor) ? `background-color: ${pColor}` : ''}
                ></span>
                {p.name}
              </span>
            {/each}
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
  {editScope}
  occurrenceStartAt={editOccurrenceStartAt}
  onClose={closeEdit}
  onCreated={onEventMutated}
  {outlookConnected}
  {todoEnabled}
/>

<RecurringEditChoiceModal
  open={recurringEditChoiceOpen}
  title={recurringEditChoiceEvent?.title ?? ''}
  onChoose={chooseRecurringEdit}
  onClose={closeRecurringEditChoice}
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

        {#if newAllDay}
          <div class="relative">
            <span class="absolute left-4 top-1 text-[10px] text-white/50 uppercase tracking-wide">Bis</span>
            <input
              class="h-12 w-full px-4 pt-4 rounded-xl bg-white/10 border-0 text-sm"
              type="date"
              bind:value={newEndDate}
            />
          </div>
        {/if}

        {#if !newAllDay}
          <div class="grid grid-cols-2 gap-3">
            <div class="relative">
              <span class="absolute left-4 top-1 text-[10px] text-white/50 uppercase tracking-wide">Von</span>
              <input
                class="h-12 w-full px-4 pt-4 rounded-xl bg-white/10 border-0 text-sm"
                type="time"
                step="900"
                bind:value={newStartTime}
              />
            </div>
            <div class="relative">
              <span class="absolute left-4 top-1 text-[10px] text-white/50 uppercase tracking-wide">Bis</span>
              <input
                class="h-12 w-full px-4 pt-4 rounded-xl bg-white/10 border-0 text-sm"
                type="time"
                step="900"
                bind:value={newEndTime}
              />
            </div>
          </div>
        {/if}

        <div>
          <div class="text-xs text-white/50 mb-2">Wiederholung</div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 ${
                newRecurrence === null
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
              on:click={() => (newRecurrence = null)}
            >
              Keine
            </button>
            <button
              type="button"
              class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 ${
                newRecurrence === 'weekly'
                  ? 'bg-emerald-500/35 border-emerald-300/70 text-emerald-100'
                  : 'bg-emerald-500/10 border-emerald-300/25 text-emerald-200/80 hover:bg-emerald-500/20'
              }`}
              on:click={() => (newRecurrence = 'weekly')}
            >
              Wöchentlich
            </button>
            <button
              type="button"
              class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 ${
                newRecurrence === 'monthly'
                  ? 'bg-violet-500/35 border-violet-300/70 text-violet-100'
                  : 'bg-violet-500/10 border-violet-300/25 text-violet-200/80 hover:bg-violet-500/20'
              }`}
              on:click={() => (newRecurrence = 'monthly')}
            >
              Monatlich
            </button>
          </div>
        </div>

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
          <div class="border-t border-white/10 pt-3 mt-1 rounded-xl bg-white/[0.03] px-3 pb-3">
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
            class={`relative h-14 rounded-full overflow-hidden select-none touch-pan-x transition-colors ${canSubmit ? 'bg-white/5 border border-white/10' : 'bg-white/[0.03] border border-white/5'}`}
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
                class={`absolute inset-y-0 left-0 rounded-full ${canSubmit ? 'bg-gradient-to-r from-emerald-500/30 to-emerald-400/40' : 'bg-gradient-to-r from-white/10 to-white/15'}`}
                style="width: calc({swipeCurrentX}px + 56px)"
              ></div>
            {/if}

            <!-- Swipe handle -->
            <div
              class={`absolute top-1 bottom-1 left-1 w-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${creating ? 'bg-emerald-500' : canSubmit ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-white/20'}`}
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
              <span class={`text-sm font-medium pl-14 ${canSubmit ? 'text-white/50' : 'text-white/35'}`}>
                {creating ? 'Wird angelegt…' : swipeProgress > 0.5 ? 'Loslassen zum Anlegen' : 'Schieben zum Anlegen →'}
              </span>
            </div>

            <!-- Destination indicator -->
            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <div 
                class="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors {canSubmit && swipeProgress > 0.8 ? 'border-emerald-400 border-solid' : 'border-dashed border-white/20'}"
              >
                <svg 
                  class="w-4 h-4 transition-colors {canSubmit && swipeProgress > 0.8 ? 'text-emerald-400' : 'text-white/20'}" 
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
