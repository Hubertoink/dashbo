<script lang="ts">
  import { fetchTodos, updateTodo, type EventDto, type HolidayDto, type TodoItemDto } from '$lib/api';
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
  export let onSelect: (d: Date) => void;
  export let onEditEvent: (e: EventDto) => void;
  export let onBack: () => void;
  export let onEventsChanged: () => void = () => {};

  // Quick Add Modal state
  let quickAddOpen = false;
  let quickAddDate = new Date();

  function openQuickAdd(day: Date) {
    quickAddDate = day;
    quickAddOpen = true;
  }

  function closeQuickAdd() {
    quickAddOpen = false;
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

  let touchStartX = 0;
  let touchEndX = 0;
  let swiping = false;

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

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0]?.clientX ?? 0;
    swiping = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!swiping) return;
    touchEndX = e.touches[0]?.clientX ?? 0;
  }

  function handleTouchEnd() {
    if (!swiping) return;
    swiping = false;
    const diff = touchStartX - touchEndX;
    const threshold = 80;
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        shiftWeek(1);
      } else {
        shiftWeek(-1);
      }
    }
  }

  $: weekStart = mondayStart(selectedDate);
  $: days = buildDays(weekStart);
  $: weekEnd = days[6] ?? addLocalDays(weekStart, 6);
  $: weekNumber = getWeekNumber(selectedDate);

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
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
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
        {@const dayHolidays = holidaysByDay.get(dateKey(day)) ?? []}
        {@const dayTodos = todosByDay.get(dateKey(day)) ?? []}
        <div in:fly={{ y: 20, duration: 220, delay: 120 + i * 30 }}>
          <WeekPlannerDay
            {day}
            {isToday}
            events={dayEvents}
            holidays={dayHolidays}
            todos={dayTodos}
            {outlookConnected}
            onAddEvent={() => openQuickAdd(day)}
            onEditEvent={onEditEvent}
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
