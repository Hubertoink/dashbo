<script lang="ts">
  import {
    dismissRecurringSuggestion,
    createTodo,
    fetchEvents,
    fetchSettings,
    fetchTodos,
    updateTodo,
    type EventDto,
    type HolidayDto,
    type TodoItemDto
  } from '$lib/api';
  import { formatGermanShortDate, sameDay } from '$lib/date';
  import { pushToast } from '$lib/stores/toast';
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import WeekPlannerTimeGrid from './WeekPlannerTimeGrid.svelte';
  import QuickAddEventModal from './QuickAddEventModal.svelte';
  import TodoModal from './TodoModal.svelte';
  import WeekPlannerTodoBar from './WeekPlannerTodoBar.svelte';

  export let selectedDate: Date;
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let outlookConnected = false;
  export let todoEnabled = true;
  export let recurringSuggestionsEnabled = false;
  export let recurringSuggestionsWeekly = true;
  export let recurringSuggestionsBiweekly = true;
  export let recurringSuggestionsMonthly = true;
  export let recurringSuggestionsBirthdays = true;
  export let onSelect: (d: Date) => void;
  export let onEditEvent: (e: EventDto) => void;
  export let onBack: () => void;
  export let onEventsChanged: () => void = () => {};
  export let backgroundUrl: string = '';

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
    // If caller passes a Date with a time (e.g. click position in the grid), prefill that time.
    const mins = minutesSinceMidnight(day);
    quickAddPrefillStartTime = mins > 0 ? hhmmFromMinutes(bucket15(mins)) : null;
    quickAddPrefillEndTime = null;
    quickAddPrefillAllDay = null;
    quickAddPrefillPersonIds = null;
    quickAddPrefillTagId = null;
    quickAddOpen = true;
  }

  function openQuickAddAllDay(day: Date) {
    quickAddDate = day;
    quickAddPrefillTitle = null;
    quickAddPrefillStartTime = null;
    quickAddPrefillEndTime = null;
    quickAddPrefillAllDay = true;
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
  let dismissedSuggestionKeys = new Set<string>();
  let dismissedLoaded = false;

  async function loadDismissed() {
    if (dismissedLoaded) return;
    dismissedLoaded = true;
    try {
      const s = await fetchSettings();
      const arr = Array.isArray((s as any)?.recurringSuggestionsDismissed)
        ? (((s as any).recurringSuggestionsDismissed as any[]) ?? []).map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      dismissedSuggestionKeys = new Set(arr.slice(0, 1000));
    } catch {
      dismissedSuggestionKeys = new Set();
    }
  }

  onMount(() => {
    if (recurringSuggestionsEnabled) {
      void loadDismissed();
    }
  });

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

  // Get the nth weekday occurrence in a month (1-based: 1st, 2nd, 3rd, 4th, 5th)
  function getNthWeekdayOfMonth(d: Date): number {
    const dayOfMonth = d.getDate();
    return Math.ceil(dayOfMonth / 7);
  }

  // Check if target date is the nth weekday of its month
  function isNthWeekdayOfMonth(target: Date, nth: number, weekday: number): boolean {
    if (weekdayMon0(target) !== weekday) return false;
    return getNthWeekdayOfMonth(target) === nth;
  }

  // Get week number within the lookback period (for biweekly detection)
  function getWeekIndex(d: Date, referenceStart: Date): number {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const diff = d.getTime() - referenceStart.getTime();
    return Math.floor(diff / msPerWeek);
  }

  function isLeapYear(y: number): boolean {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  }

  function isBirthdayEvent(e: EventDto): boolean {
    const titleNorm = normalizeTitle(e.title);
    const tagNorm = normalizeTitle(e.tag?.name ?? '');
    const re = /\b(geburtstag|birthday)\b/i;
    return re.test(titleNorm) || re.test(tagNorm);
  }

  async function loadSuggestionsForWeek(weekStartLocal: Date, weekEndLocal: Date) {
    if (!recurringSuggestionsEnabled) {
      suggestions = [];
      return;
    }

    if (!dismissedLoaded) {
      await loadDismissed();
    }

    const weekKey = dateKey(weekStartLocal);
    if (suggestionsLoading || suggestionsForWeekKey === weekKey) return;
    suggestionsLoading = true;

    try {
      const lookbackWeeks = 12; // Extended for monthly patterns
      const from = new Date(weekStartLocal);
      from.setDate(from.getDate() - lookbackWeeks * 7);
      from.setHours(0, 0, 0, 0);

      const to = new Date(weekStartLocal);
      to.setHours(0, 0, 0, 0);

      const historyPromise = fetchEvents(from, to);

      const historyBirthdaysPromise = (() => {
        if (!recurringSuggestionsBirthdays) return Promise.resolve([] as EventDto[]);
        const fromBirthdays = new Date(weekStartLocal);
        fromBirthdays.setDate(fromBirthdays.getDate() - 370);
        fromBirthdays.setHours(0, 0, 0, 0);
        return fetchEvents(fromBirthdays, to);
      })();

      const [history, historyBirthdays] = await Promise.all([historyPromise, historyBirthdaysPromise]);

      const candidates = (history ?? []).filter((e) => {
        if (e.source === 'outlook') return false;
        if (e.allDay) return false;
        if (e.recurrence) return false;
        if (!e.title || !String(e.title).trim()) return false;
        return true;
      });

      const birthdayCandidates = recurringSuggestionsBirthdays
        ? (historyBirthdays ?? []).filter((e) => {
        if (e.source === 'outlook') return false;
        if (e.recurrence) return false;
        if (!e.title || !String(e.title).trim()) return false;
        return isBirthdayEvent(e);
        })
        : [];

      const currentWeekEvents = (events ?? []).filter((e) => {
        const s = new Date(e.startAt);
        if (Number.isNaN(s.getTime())) return false;
        return s.getTime() >= weekStartLocal.getTime() && s.getTime() <= weekEndLocal.getTime();
      });

      // ===== PATTERN TYPES =====
      // 1. Weekly: same weekday + time + title (existing)
      // 2. Biweekly: same weekday + time + title, but every 2 weeks
      // 3. Monthly: same nth-weekday + time + title (e.g., "3rd Wednesday")

      type PatternAgg = {
        count: number;
        weeks: Set<string>;
        dates: Date[];
        sample: EventDto;
        weekday: number;
        startBucket: number;
        durationBucket: number | null;
        titleNorm: string;
        patternType: 'weekly' | 'biweekly' | 'monthly';
        monthlyNth?: number;
      };

      const weeklyBySig = new Map<string, PatternAgg>();
      const biweeklyBySig = new Map<string, PatternAgg>();
      const monthlyBySig = new Map<string, PatternAgg>();

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
        const nthWeekday = getNthWeekdayOfMonth(start);

        // Weekly signature
        const weeklySig = `weekly|${wd}|${startMin}|${durationBucket ?? 'x'}|${titleNorm}`;
        const existingWeekly = weeklyBySig.get(weeklySig);
        if (existingWeekly) {
          existingWeekly.count++;
          existingWeekly.weeks.add(weekId);
          existingWeekly.dates.push(start);
          if (new Date(existingWeekly.sample.startAt).getTime() < start.getTime()) {
            existingWeekly.sample = e;
          }
        } else {
          weeklyBySig.set(weeklySig, {
            count: 1,
            weeks: new Set([weekId]),
            dates: [start],
            sample: e,
            weekday: wd,
            startBucket: startMin,
            durationBucket,
            titleNorm,
            patternType: 'weekly',
          });
        }

        // Biweekly signature (group by odd/even week index)
        const weekIdx = getWeekIndex(start, from);
        const biweeklyParity = weekIdx % 2;
        const biweeklySig = `biweekly|${wd}|${startMin}|${durationBucket ?? 'x'}|${titleNorm}|${biweeklyParity}`;
        const existingBiweekly = biweeklyBySig.get(biweeklySig);
        if (existingBiweekly) {
          existingBiweekly.count++;
          existingBiweekly.weeks.add(weekId);
          existingBiweekly.dates.push(start);
          if (new Date(existingBiweekly.sample.startAt).getTime() < start.getTime()) {
            existingBiweekly.sample = e;
          }
        } else {
          biweeklyBySig.set(biweeklySig, {
            count: 1,
            weeks: new Set([weekId]),
            dates: [start],
            sample: e,
            weekday: wd,
            startBucket: startMin,
            durationBucket,
            titleNorm,
            patternType: 'biweekly',
          });
        }

        // Monthly signature (nth weekday of month)
        const monthlySig = `monthly|${nthWeekday}|${wd}|${startMin}|${durationBucket ?? 'x'}|${titleNorm}`;
        const existingMonthly = monthlyBySig.get(monthlySig);
        if (existingMonthly) {
          existingMonthly.count++;
          existingMonthly.weeks.add(weekId);
          existingMonthly.dates.push(start);
          if (new Date(existingMonthly.sample.startAt).getTime() < start.getTime()) {
            existingMonthly.sample = e;
          }
        } else {
          monthlyBySig.set(monthlySig, {
            count: 1,
            weeks: new Set([weekId]),
            dates: [start],
            sample: e,
            weekday: wd,
            startBucket: startMin,
            durationBucket,
            titleNorm,
            patternType: 'monthly',
            monthlyNth: nthWeekday,
          });
        }
      }

      const out: EventSuggestionDto[] = [];
      const addedSigBases = new Set<string>(); // Prevent duplicates across pattern types

      // Helper to check conflicts and add suggestion
      const tryAddSuggestion = (sig: string, agg: PatternAgg, targetDay: Date) => {
        const sigBase = `${agg.weekday}|${agg.startBucket}|${agg.durationBucket ?? 'x'}|${agg.titleNorm}`;
        if (addedSigBases.has(sigBase)) return;
        if (dismissedSuggestionKeys.has(sig)) return;

        const start = new Date(targetDay);
        const hhmm = hhmmFromMinutes(agg.startBucket);
        const [hh, mm] = hhmm.split(':').map((x) => Number(x));
        start.setHours(hh || 0, mm || 0, 0, 0);

        const end = agg.durationBucket != null ? new Date(start.getTime() + agg.durationBucket * 60000) : null;

        // Check for conflicts with existing events
        const conflicts = currentWeekEvents.some((e) => {
          const es = new Date(e.startAt);
          if (Number.isNaN(es.getTime())) return false;
          const ee = e.endAt ? new Date(e.endAt) : null;
          if (ee && Number.isNaN(ee.getTime())) return overlaps(start, end, es, null);
          return overlaps(start, end, es, ee);
        });

        if (conflicts) return;

        addedSigBases.add(sigBase);
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
      };

      // 1. Process weekly patterns (need 3+ occurrences in 3+ different weeks)
      if (recurringSuggestionsWeekly) {
        for (const [sig, agg] of weeklyBySig) {
          if (agg.count < 3 || agg.weeks.size < 3) continue;

          const targetDay = new Date(weekStartLocal);
          targetDay.setDate(targetDay.getDate() + agg.weekday);
          targetDay.setHours(0, 0, 0, 0);

          tryAddSuggestion(sig, agg, targetDay);
        }
      }

      // 2. Process biweekly patterns (need 2+ occurrences, check if this week matches parity)
      if (recurringSuggestionsBiweekly) {
        const currentWeekIdx = getWeekIndex(weekStartLocal, from);
        for (const [sig, agg] of biweeklyBySig) {
          if (agg.count < 2 || agg.weeks.size < 2) continue;

          // Check if this week has the right parity
          const sigParts = sig.split('|');
          const expectedParity = Number(sigParts[sigParts.length - 1]);
          if (currentWeekIdx % 2 !== expectedParity) continue;

          const targetDay = new Date(weekStartLocal);
          targetDay.setDate(targetDay.getDate() + agg.weekday);
          targetDay.setHours(0, 0, 0, 0);

          tryAddSuggestion(sig, agg, targetDay);
        }
      }

      // 3. Process monthly patterns (need 2+ occurrences, check if target week has nth weekday)
      if (recurringSuggestionsMonthly) {
        for (const [sig, agg] of monthlyBySig) {
          if (agg.count < 2 || agg.weeks.size < 2) continue;
          if (agg.monthlyNth == null) continue;

          // Find if any day in the target week is the nth weekday
          for (let i = 0; i < 7; i++) {
            const day = new Date(weekStartLocal);
            day.setDate(weekStartLocal.getDate() + i);
            day.setHours(0, 0, 0, 0);

            if (isNthWeekdayOfMonth(day, agg.monthlyNth, agg.weekday)) {
              tryAddSuggestion(sig, agg, day);
              break;
            }
          }
        }
      }

      // 4. Birthdays: yearly all-day suggestion based on title/tag
      if (recurringSuggestionsBirthdays) {
        const birthdaySeenForDay = new Set<string>();
        for (const e of birthdayCandidates) {
          const baseTitleNorm = normalizeTitle(e.title);
          if (!baseTitleNorm) continue;

          const eventStart = new Date(e.startAt);
          if (Number.isNaN(eventStart.getTime())) continue;

          const srcMonth = eventStart.getMonth();
          const srcDay = eventStart.getDate();

          for (let i = 0; i < 7; i++) {
            const day = new Date(weekStartLocal);
            day.setDate(weekStartLocal.getDate() + i);
            day.setHours(0, 0, 0, 0);

            const year = day.getFullYear();
            const month = day.getMonth();
            const date = day.getDate();

            const effDay = srcMonth === 1 && srcDay === 29 && !isLeapYear(year) ? 28 : srcDay;
            if (month !== srcMonth || date !== effDay) continue;

            const sig = `birthday|${dateKey(day)}|${baseTitleNorm}`;
            if (dismissedSuggestionKeys.has(sig)) continue;

            const dayKey = `${dateKey(day)}|${baseTitleNorm}`;
            if (birthdaySeenForDay.has(dayKey)) continue;

            // Avoid duplicates if event already exists that day (same title)
            const alreadyExists = currentWeekEvents.some((x) => {
              const xs = new Date(x.startAt);
              if (Number.isNaN(xs.getTime())) return false;
              return sameDay(xs, day) && normalizeTitle(x.title) === baseTitleNorm;
            });
            if (alreadyExists) continue;

            birthdaySeenForDay.add(dayKey);
            out.push({
              suggestionKey: sig,
              title: e.title,
              startAt: isoNoonLocal(day),
              endAt: null,
              allDay: true,
              tag: e.tag,
              person: e.person,
              persons: e.persons,
            });
            break;
          }
        }
      }

      out.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      });

      suggestions = out.slice(0, 10);
      suggestionsForWeekKey = weekKey;
    } catch {
      suggestions = [];
      suggestionsForWeekKey = weekKey;
    } finally {
      suggestionsLoading = false;
    }
  }

  async function dismissSuggestion(s: EventSuggestionDto) {
    const key = String(s?.suggestionKey || '').trim();
    if (!key) return;
    // optimistic
    dismissedSuggestionKeys = new Set([key, ...Array.from(dismissedSuggestionKeys)]);
    suggestions = suggestions.filter((x) => x.suggestionKey !== key);
    try {
      await dismissRecurringSuggestion(key);
    } catch {
      // keep optimistic behavior; worst case user will see it again after reload
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

  // Quick add todo (title-only)
  let todoQuickText = '';
  let todoQuickSaving = false;
  let todoDragActive = false;
  let todoDragOverDayKey: number | null = null;

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

  // Group todos by their due date (ISO date string -> todos)
  $: todosByDay = (() => {
    const m = new Map<number, TodoItemDto[]>();
    for (const t of todoItems) {
      if (t.completed) continue; // skip completed
      if (!t.dueAt) continue; // only those with due date
      const d = new Date(t.dueAt);
      if (Number.isNaN(d.getTime())) continue;
      const dayStart = startOfLocalDay(d);
      const k = dayStart.getTime();
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    }
    // Sort each day's todos by title
    for (const arr of m.values()) {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    }
    return m;
  })();

  // Todos without due date (for inbox bar)
  $: inboxTodos = todoItems.filter((t) => !t.completed && !t.dueAt);

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
      if (newCompleted) pushToast('ToDo erledigt', 'success');
    } catch {
      await loadTodos();
    }
  }

  async function handleTodoDrop(
    todoData: { connectionId: number; listId: string; taskId: string; title: string },
    targetDate: Date
  ) {
    // Set dueAt to noon on the target date
    const dueAt = isoNoonLocal(targetDate);

    // Optimistic update: move from inbox to day
    todoItems = todoItems.map((t) =>
      t.connectionId === todoData.connectionId &&
      t.listId === todoData.listId &&
      t.taskId === todoData.taskId
        ? { ...t, dueAt }
        : t
    );

    try {
      await updateTodo({
        connectionId: todoData.connectionId,
        listId: todoData.listId,
        taskId: todoData.taskId,
        dueAt
      });
      await loadTodos();
    } catch {
      await loadTodos();
    }
  }

  function openTodoCreate(dueDate?: Date | null) {
    todoModalListName = (todoListNames && todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
    todoModalConnectionId = todoItems.length > 0 ? todoItems[0]!.connectionId : null;
    todoPrefillDueAt = dueDate ? isoNoonLocal(dueDate) : null;
    todoModalOpen = true;
  }

  function closeTodoModal() {
    todoModalOpen = false;
  }

  async function submitQuickTodo() {
    const title = todoQuickText.trim();
    if (!title) return;
    if (!outlookConnected || !todoEnabled) return;
    if (todoQuickSaving) return;

    todoQuickSaving = true;
    try {
      const listName = (todoListNames && todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
      const connectionId = todoItems.length > 0 ? todoItems[0]!.connectionId : undefined;
      await createTodo({
        ...(connectionId != null ? { connectionId } : {}),
        ...(listName ? { listName } : {}),
        title,
        description: null,
        startAt: null,
        dueAt: null
      });
      todoQuickText = '';
      await loadTodos();
      pushToast('ToDo erstellt', 'success');
    } catch (err) {
      console.error('Quick todo create failed', err);
      pushToast('Fehler beim ToDo anlegen', 'error');
    } finally {
      todoQuickSaving = false;
    }
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
  $: isCurrentWeek = (() => {
    const today = new Date();
    const todayWeekStart = mondayStart(today);
    return weekStart.getTime() === todayWeekStart.getTime();
  })();

  $: if (recurringSuggestionsEnabled) {
    void loadSuggestionsForWeek(weekStart, weekEnd);
  } else {
    suggestions = [];
    suggestionsForWeekKey = '';
  }

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
  <div class="flex items-center justify-between px-4 py-2 border-b border-white/10" in:fade={{ duration: 200, delay: 80 }}>
    <button
      type="button"
      class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-lg"
      on:click={onBack}
      aria-label="Zurück"
    >
      ✕
    </button>

    <div class="flex items-center gap-3">
      <button
        type="button"
        class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-xl"
        on:click={() => shiftWeek(-1)}
        aria-label="Vorherige Woche"
      >
        ←
      </button>

      <div class="text-center min-w-[180px]">
        <div class="text-lg font-semibold tracking-wide">KW {weekNumber}</div>
        <div class="text-xs text-white/70">
          {formatGermanShortDate(weekStart)} – {formatGermanShortDate(weekEnd)}
        </div>
      </div>

      <button
        type="button"
        class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-xl"
        on:click={() => shiftWeek(1)}
        aria-label="Nächste Woche"
      >
        →
      </button>

      <button
        type="button"
        class={`h-10 px-3 rounded-xl text-sm font-medium transition active:scale-95 ${
          isCurrentWeek
            ? 'bg-white/10 hover:bg-white/15 text-white/60'
            : 'bg-white/15 hover:bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.3)] ring-1 ring-white/30'
        }`}
        on:click={() => onSelect(new Date())}
      >
        Heute
      </button>
    </div>

    <!-- Spacer for balance -->
    <div class="w-10"></div>
  </div>

  <!-- Week Grid -->
  <div class="flex-1 min-h-0 p-2 overflow-hidden" in:fade={{ duration: 200, delay: 100 }}>
    <div class="h-full" in:fly={{ y: 20, duration: 220, delay: 120 }}>
      <WeekPlannerTimeGrid
        {days}
        {events}
        {holidays}
        suggestions={suggestions}
        {backgroundUrl}
        {todosByDay}
        todoDragActive={todoDragActive}
        todoDragOverDayKey={todoDragOverDayKey}
        onToggleTodo={toggleTodo}
        onAddTodo={openTodoCreate}
        onTodoDrop={handleTodoDrop}
        onAddEvent={(d) => openQuickAdd(d)}
        onAddAllDayEvent={(d) => openQuickAddAllDay(d)}
        onEditEvent={onEditEvent}
        onEventDeleted={handleEventDeleted}
        onEventMoved={handleEventDeleted}
        onAcceptSuggestion={acceptSuggestion}
        onDismissSuggestion={dismissSuggestion}
      />
    </div>
  </div>

  {#if outlookConnected && todoEnabled}
    <WeekPlannerTodoBar
      items={inboxTodos}
      onToggleTodo={toggleTodo}
      {days}
      onTodoDrop={handleTodoDrop}
      bind:quickAddText={todoQuickText}
      quickAddSaving={todoQuickSaving}
      onQuickAdd={submitQuickTodo}
      onOpenCreateModal={() => openTodoCreate(null)}
      onTodoDragActiveChange={(v) => {
        todoDragActive = v;
        if (!v) todoDragOverDayKey = null;
      }}
      onTodoDragOverDayChange={(k) => (todoDragOverDayKey = k)}
    />
  {:else}
    <!-- Footer hint -->
    <div class="px-6 py-3 border-t border-white/10 text-center text-sm text-white/50" in:fade={{ duration: 200, delay: 200 }}>
      Tippe in einen Tag um einen Termin hinzuzufügen · Tippe auf einen Termin zum Bearbeiten · Wische für Wochenwechsel
    </div>
  {/if}

  <!-- Floating ToDo button -->
  {#if outlookConnected && todoEnabled}
    <button
      type="button"
      class="fixed z-[60] h-14 w-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ring-2 ring-blue-300/20"
      style="bottom: calc(1.5rem + env(safe-area-inset-bottom) + 2.5rem); right: 1.5rem;"
      aria-label="Neuen Termin erstellen"
      on:click={() => openQuickAdd(new Date(selectedDate))}
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </button>
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
