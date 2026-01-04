<script lang="ts">
  import { fetchEvents, fetchTodos, updateTodo, type EventDto, type HolidayDto, type TodoItemDto } from '$lib/api';
  import { formatGermanShortDate, sameDay } from '$lib/date';
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import WeekPlannerDay from './WeekPlannerDay.svelte';
  import QuickAddEventModal from './QuickAddEventModal.svelte';
  import TodoModal from './TodoModal.svelte';
  import WeekPlannerTodoBar from './WeekPlannerTodoBar.svelte';

  export let selectedDate: Date;
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let outlookConnected = false;
  export let todoEnabled = true;
  export let recurringSuggestionsEnabled = false;
  export let onSelect: (d: Date) => void;
  export let onEditEvent: (e: EventDto) => void;
  export let onBack: () => void;
  export let onEventsChanged: () => void = () => {};

  // Quick Add Modal state
  let quickAddOpen = false;
  let quickAddDate = new Date();

  let quickAddPrefillTitle: string | null = null;
  let quickAddPrefillStartTime: string | null = null;
  let quickAddPrefillEndTime: string | null = null;
  let quickAddPrefillAllDay: boolean | null = null;
  let quickAddPrefillPersonIds: number[] | null = null;
  let quickAddPrefillTagId: number | null = null;

  function openQuickAdd(day: Date) {
    quickAddDate = day;
    quickAddPrefillTitle = null;
    quickAddPrefillStartTime = null;
    quickAddPrefillEndTime = null;
    quickAddPrefillAllDay = null;
    quickAddPrefillPersonIds = null;
    quickAddPrefillTagId = null;
    quickAddOpen = true;
  }

  function closeQuickAdd() {
    quickAddOpen = false;
  }

  type EventSuggestionDto = import('./WeekPlannerDay.svelte').EventSuggestionDto;
  let suggestions: EventSuggestionDto[] = [];
  let suggestionsLoading = false;
  let suggestionsForWeekKey = '';

  function normalizeTitle(t: string): string {
    return String(t || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function weekdayMon0(d: Date): number {
    return (d.getDay() + 6) % 7;
  }

  function minutesSinceMidnight(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  function bucket15(mins: number): number {
    return Math.max(0, Math.min(24 * 60 - 1, Math.round(mins / 15) * 15));
  }

  function hhmmFromMinutes(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function timeFromIso(iso: string): string {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  function overlaps(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
    const a0 = aStart.getTime();
    const a1 = (aEnd ?? aStart).getTime();
    const b0 = bStart.getTime();
    const b1 = (bEnd ?? bStart).getTime();
    return a0 <= b1 && b0 <= a1;
  }

  async function loadSuggestionsForWeek(weekStartLocal: Date, weekEndLocal: Date) {
    if (!recurringSuggestionsEnabled) {
      suggestions = [];
      return;
    }

    const weekKey = dateKey(weekStartLocal);
    if (suggestionsLoading || suggestionsForWeekKey === weekKey) return;
    suggestionsLoading = true;

    try {
      const lookbackWeeks = 10;
      const from = new Date(weekStartLocal);
      from.setDate(from.getDate() - lookbackWeeks * 7);
      from.setHours(0, 0, 0, 0);

      const to = new Date(weekStartLocal);
      to.setHours(0, 0, 0, 0);

      const history = await fetchEvents(from, to);

      const candidates = (history ?? []).filter((e) => {
        if (e.source === 'outlook') return false;
        if (e.allDay) return false;
        if (e.recurrence) return false;
        if (!e.title || !String(e.title).trim()) return false;
        return true;
      });

      const currentWeekEvents = (events ?? []).filter((e) => {
        const s = new Date(e.startAt);
        if (Number.isNaN(s.getTime())) return false;
        return s.getTime() >= weekStartLocal.getTime() && s.getTime() <= weekEndLocal.getTime();
      });

      type PatternAgg = {
        count: number;
        weeks: Set<string>;
        sample: EventDto;
        weekday: number;
        startBucket: number;
        durationBucket: number | null;
        titleNorm: string;
      };

      const bySig = new Map<string, PatternAgg>();

      for (const e of candidates) {
        const start = new Date(e.startAt);
        if (Number.isNaN(start.getTime())) continue;
        const wd = weekdayMon0(start);
        const startMin = bucket15(minutesSinceMidnight(start));

        const end = e.endAt ? new Date(e.endAt) : null;
        const durationMinRaw = end && !Number.isNaN(end.getTime()) ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : null;
        const durationBucket = durationMinRaw != null ? bucket15(durationMinRaw) : null;

        const titleNorm = normalizeTitle(e.title);
        if (!titleNorm) continue;

        const weekOfEvent = mondayStart(start);
        const weekId = dateKey(weekOfEvent);

        const sig = `${wd}|${startMin}|${durationBucket ?? 'x'}|${titleNorm}`;
        const existing = bySig.get(sig);
        if (existing) {
          existing.count++;
          existing.weeks.add(weekId);
          // Prefer the most recent sample (roughly)
          if (new Date(existing.sample.startAt).getTime() < start.getTime()) {
            existing.sample = e;
          }
        } else {
          bySig.set(sig, {
            count: 1,
            weeks: new Set([weekId]),
            sample: e,
            weekday: wd,
            startBucket: startMin,
            durationBucket,
            titleNorm,
          });
        }
      }

      const out: EventSuggestionDto[] = [];

      for (const [sig, agg] of bySig) {
        if (agg.count < 3) continue;
        if (agg.weeks.size < 3) continue;

        const day = new Date(weekStartLocal);
        day.setDate(day.getDate() + agg.weekday);
        day.setHours(0, 0, 0, 0);

        const start = new Date(day);
        const hhmm = hhmmFromMinutes(agg.startBucket);
        const [hh, mm] = hhmm.split(':').map((x) => Number(x));
        start.setHours(hh || 0, mm || 0, 0, 0);

        const end = agg.durationBucket != null ? new Date(start.getTime() + agg.durationBucket * 60000) : null;

        const conflicts = currentWeekEvents.some((e) => {
          const es = new Date(e.startAt);
          if (Number.isNaN(es.getTime())) return false;
          const ee = e.endAt ? new Date(e.endAt) : null;
          if (ee && Number.isNaN(ee.getTime())) return overlaps(start, end, es, null);
          return overlaps(start, end, es, ee);
        });

        if (conflicts) continue;

        out.push({
          suggestionKey: sig,
          title: agg.sample.title,
          startAt: start.toISOString(),
          endAt: end ? end.toISOString() : null,
          allDay: false,
          tag: agg.sample.tag,
          person: agg.sample.person,
          persons: agg.sample.persons,
        });
      }

      out.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

      suggestions = out.slice(0, 10);
      suggestionsForWeekKey = weekKey;
    } catch {
      suggestions = [];
      suggestionsForWeekKey = weekKey;
    } finally {
      suggestionsLoading = false;
    }
  }

  function handleEventCreated() {
    onEventsChanged();
    if (outlookConnected && todoEnabled) {
      void loadTodos();
    }
  }

  function handleEventDeleted() {
    onEventsChanged();
  }

  // ToDos (Outlook)
  let todoLoaded = false;
  let todoItems: TodoItemDto[] = [];
  let todoListName = 'Dashbo';
  let todoListNames: string[] = [];
  let todoModalOpen = false;
  let todoModalListName = '';
  let todoModalConnectionId: number | null = null;
  let todoPrefillDueAt: string | null = null;

  // Use local noon to avoid timezone offsets pushing the ISO date to the previous/next day.
  function isoNoonLocal(d: Date): string {
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    return x.toISOString();
  }

  async function loadTodos() {
    if (!outlookConnected || !todoEnabled) return;
    try {
      const r = await fetchTodos();
      todoListName = r.listName;
      todoListNames = Array.isArray(r.listNames) ? r.listNames : [];
      todoItems = Array.isArray(r.items) ? r.items : [];
    } catch {
      todoItems = [];
    } finally {
      todoLoaded = true;
    }
  }

  $: if (outlookConnected && todoEnabled && !todoLoaded) {
    void loadTodos();
  }

  async function toggleTodo(item: TodoItemDto) {
    const newCompleted = !item.completed;
    // optimistic
    todoItems = todoItems
      .map((i) =>
        i.taskId === item.taskId && i.listId === item.listId && i.connectionId === item.connectionId
          ? { ...i, completed: newCompleted, status: newCompleted ? 'completed' : 'notStarted' }
          : i
      )
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return a.title.localeCompare(b.title);
      });

    try {
      await updateTodo({
        connectionId: item.connectionId,
        listId: item.listId,
        taskId: item.taskId,
        completed: newCompleted
      });
      await loadTodos();
    } catch {
      await loadTodos();
    }
  }

  function openTodoCreate(dueDate: Date) {
    todoModalListName = (todoListNames && todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
    todoModalConnectionId = todoItems.length > 0 ? todoItems[0]!.connectionId : null;
    todoPrefillDueAt = isoNoonLocal(dueDate);
    todoModalOpen = true;
  }

  function closeTodoModal() {
    todoModalOpen = false;
  }

  function mondayStart(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const offset = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - offset);
    return x;
  }

  function getWeekNumber(d: Date): number {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }

  function buildDays(weekStart: Date): Date[] {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      out.push(d);
    }
    return out;
  }

  function dateKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function startOfLocalDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addLocalDays(d: Date, daysToAdd: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + daysToAdd);
    return x;
  }

  function shiftWeek(delta: number) {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + delta * 7);
    onSelect(next);
  }

  $: weekStart = mondayStart(selectedDate);
  $: days = buildDays(weekStart);
  $: weekEnd = days[6] ?? addLocalDays(weekStart, 6);
  $: weekNumber = getWeekNumber(selectedDate);

  $: if (recurringSuggestionsEnabled) {
    void loadSuggestionsForWeek(weekStart, weekEnd);
  } else {
    suggestions = [];
    suggestionsForWeekKey = '';
  }

  $: eventsByDay = (() => {
    const m = new Map<string, EventDto[]>();
    for (const e of events) {
      const start = startOfLocalDay(new Date(e.startAt));
      const end = e.endAt ? startOfLocalDay(new Date(e.endAt)) : start;
      const maxSpanDays = 62;
      const spanDays = Math.min(
        maxSpanDays,
        Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)))
      );
      for (let i = 0; i <= spanDays; i++) {
        const day = addLocalDays(start, i);
        const k = dateKey(day);
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
    return m;
  })();

  $: holidaysByDay = (() => {
    const m = new Map<string, HolidayDto[]>();
    for (const h of holidays) {
      const d = new Date(`${h.date}T00:00:00`);
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(h);
      m.set(k, arr);
    }
    return m;
  })();

  $: todosByDay = (() => {
    const m = new Map<string, TodoItemDto[]>();
    for (const t of todoItems) {
      if (!t.dueAt) continue;
      const d = startOfLocalDay(new Date(t.dueAt));
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    return m;
  })();

  $: suggestionsByDay = (() => {
    const m = new Map<string, EventSuggestionDto[]>();
    for (const s of suggestions) {
      const d = startOfLocalDay(new Date(s.startAt));
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return m;
  })();

  function acceptSuggestion(s: EventSuggestionDto) {
    const d = new Date(s.startAt);
    quickAddDate = d;
    quickAddPrefillTitle = s.title;
    quickAddPrefillStartTime = timeFromIso(s.startAt);
    quickAddPrefillEndTime = s.endAt ? timeFromIso(s.endAt) : '';
    quickAddPrefillAllDay = Boolean(s.allDay);
    quickAddPrefillPersonIds = (s.persons && s.persons.length > 0 ? s.persons : s.person ? [s.person] : []).map((p) => p.id);
    quickAddPrefillTagId = s.tag?.id ?? null;
    quickAddOpen = true;
  }
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-40 bg-black/40"
  in:fade={{ duration: 200 }}
  out:fade={{ duration: 150 }}
  on:click={onBack}
  on:keydown={(e) => e.key === 'Escape' && onBack()}
  role="button"
  tabindex="-1"
></div>

<!-- Planner Panel -->
<div
  class="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-2xl"
  in:fly={{ y: 40, duration: 280, opacity: 0 }}
  out:fly={{ y: 30, duration: 180, opacity: 0 }}
>
  <!-- Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-white/10" in:fade={{ duration: 200, delay: 80 }}>
    <button
      type="button"
      class="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-lg"
      on:click={onBack}
      aria-label="Zurück"
    >
      ✕
    </button>

    <div class="flex items-center gap-4">
      <button
        type="button"
        class="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-xl"
        on:click={() => shiftWeek(-1)}
        aria-label="Vorherige Woche"
      >
        ←
      </button>

      <div class="text-center min-w-[200px]">
        <div class="text-xl font-semibold tracking-wide">KW {weekNumber}</div>
        <div class="text-sm text-white/70">
          {formatGermanShortDate(weekStart)} – {formatGermanShortDate(weekEnd)}
        </div>
      </div>

      <button
        type="button"
        class="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-xl"
        on:click={() => shiftWeek(1)}
        aria-label="Nächste Woche"
      >
        →
      </button>
    </div>

    <button
      type="button"
      class="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition text-sm font-medium"
      on:click={() => onSelect(new Date())}
    >
      Heute
    </button>
  </div>

  <!-- Week Grid -->
  <div class="flex-1 min-h-0 p-4 overflow-hidden" in:fade={{ duration: 200, delay: 100 }}>
    <div class="h-full grid grid-cols-7 gap-3">
      {#each days as day, i (dateKey(day))}
        {@const isToday = sameDay(day, new Date())}
        {@const dayEvents = eventsByDay.get(dateKey(day)) ?? []}
        {@const daySuggestions = suggestionsByDay.get(dateKey(day)) ?? []}
        {@const dayHolidays = holidaysByDay.get(dateKey(day)) ?? []}
        {@const dayTodos = todosByDay.get(dateKey(day)) ?? []}
        <div in:fly={{ y: 20, duration: 220, delay: 120 + i * 30 }}>
          <WeekPlannerDay
            {day}
            {isToday}
            events={dayEvents}
            suggestions={daySuggestions}
            holidays={dayHolidays}
            todos={dayTodos}
            {outlookConnected}
            onAddEvent={() => openQuickAdd(day)}
            onEditEvent={onEditEvent}
            onAcceptSuggestion={acceptSuggestion}
            onEventDeleted={handleEventDeleted}
            onToggleTodo={toggleTodo}
          />
        </div>
      {/each}
    </div>
  </div>

  {#if outlookConnected && todoEnabled}
    <WeekPlannerTodoBar
      items={todoItems.filter((t) => !t.completed)}
      {selectedDate}
      onToggleTodo={toggleTodo}
      onAddTodo={openTodoCreate}
    />
  {:else}
    <!-- Footer hint -->
    <div class="px-6 py-3 border-t border-white/10 text-center text-sm text-white/50" in:fade={{ duration: 200, delay: 200 }}>
      Tippe in einen Tag um einen Termin hinzuzufügen · Tippe auf einen Termin zum Bearbeiten · Wische für Wochenwechsel
    </div>
  {/if}
</div>

<!-- Quick Add Event Modal -->
<QuickAddEventModal
  open={quickAddOpen}
  prefilledDate={quickAddDate}
  prefillTitle={quickAddPrefillTitle}
  prefillStartTime={quickAddPrefillStartTime}
  prefillEndTime={quickAddPrefillEndTime}
  prefillAllDay={quickAddPrefillAllDay}
  prefillPersonIds={quickAddPrefillPersonIds}
  prefillTagId={quickAddPrefillTagId}
  {outlookConnected}
  {todoEnabled}
  onClose={closeQuickAdd}
  onCreated={handleEventCreated}
/>

<TodoModal
  open={todoModalOpen}
  onClose={closeTodoModal}
  onSaved={() => loadTodos()}
  mode="create"
  item={null}
  listNames={todoListNames && todoListNames.length > 0 ? todoListNames : [todoListName]}
  selectedListName={todoModalListName}
  onChangeListName={(v) => (todoModalListName = v)}
  connections={Array.from(
    new Map(
      todoItems
        .map((i) => ({ id: i.connectionId, label: i.connectionLabel || 'Outlook', color: i.color }))
        .map((c) => [String(c.id), c])
    ).values()
  ).sort((a, b) => a.label.localeCompare(b.label))}
  selectedConnectionId={todoModalConnectionId}
  onChangeConnectionId={(v) => (todoModalConnectionId = v)}
  prefillDueAt={todoPrefillDueAt}
/>
