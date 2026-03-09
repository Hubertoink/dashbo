export type PlannerRecurrence = 'weekly' | 'monthly' | null;

export type PlannerQuickAddFormState = {
  title: string;
  location: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  recurrence: PlannerRecurrence;
  tagId: number | null;
  personIds: number[];
};

export type PlannerEventCreateInput = {
  title: string;
  location: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  recurrence: PlannerRecurrence;
  tagId: number | null;
  personIds: number[] | null;
};

export type PlannerTodoCreateInput = {
  connectionId?: number;
  listName?: string;
  title: string;
  description: null;
  dueAt: string;
};

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateInputValue(v: string): Date | null {
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

export function parseQuarterHourTime(v: string): { h: number; m: number } | null {
  if (!v) return null;
  const m = /^([0-9]{2}):([0-9]{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  if (min % 15 !== 0) return null;
  return { h, m: min };
}

export function roundToNextHalfHourTime(now: Date): string {
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

function toLocalDateTime(date: Date, time: { h: number; m: number }): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m, 0, 0);
}

function isoNoonLocal(d: Date): string {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString();
}

export function createPlannerQuickAddDefaults(targetDate: Date, now: Date = new Date()): PlannerQuickAddFormState {
  return {
    title: '',
    location: '',
    date: toDateInputValue(targetDate),
    allDay: false,
    startTime: roundToNextHalfHourTime(now),
    endTime: '',
    recurrence: null,
    tagId: null,
    personIds: []
  };
}

export function canSubmitPlannerQuickAdd(form: PlannerQuickAddFormState, creating: boolean, todoSaving: boolean): boolean {
  return form.title.trim().length > 0 && (form.allDay || parseQuarterHourTime(form.startTime) !== null) && !creating && !todoSaving;
}

export function buildPlannerEventCreateInput(
  form: PlannerQuickAddFormState
): { selectedDate: Date; payload: PlannerEventCreateInput } | { error: string } {
  const title = form.title.trim();
  if (!title) return { error: 'Titel fehlt.' };

  const selectedDate = parseDateInputValue(form.date);
  if (!selectedDate) return { error: 'Ungültiges Datum.' };

  let startAt: Date;
  let endAt: Date | null = null;

  if (form.allDay) {
    startAt = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0, 0);
  } else {
    const startTime = parseQuarterHourTime(form.startTime);
    if (!startTime) return { error: 'Startzeit fehlt.' };

    startAt = toLocalDateTime(selectedDate, startTime);

    const endTime = parseQuarterHourTime(form.endTime);
    if (endTime) {
      endAt = toLocalDateTime(selectedDate, endTime);
      if (endAt.getTime() <= startAt.getTime()) {
        return { error: 'Ende muss nach Start liegen.' };
      }
    }
  }

  return {
    selectedDate,
    payload: {
      title,
      location: form.location.trim() || null,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      allDay: form.allDay,
      recurrence: form.recurrence,
      tagId: form.tagId != null && Number.isFinite(form.tagId) && form.tagId > 0 ? form.tagId : null,
      personIds: form.personIds.length > 0 ? form.personIds : null
    }
  };
}

export function buildPlannerTodoCreateInputs(input: {
  enabled: boolean;
  todoText: string;
  selectedDate: Date;
  todoSelectedListName: string;
  todoListNames: string[];
  todoListName: string;
  todoSelectedConnectionId: number | null;
  parseTodoLines: (text: string) => string[];
}): PlannerTodoCreateInput[] {
  if (!input.enabled) return [];

  const todoLines = input.parseTodoLines(input.todoText);
  if (todoLines.length === 0) return [];

  const dueAt = isoNoonLocal(input.selectedDate);
  const listName = input.todoSelectedListName || (input.todoListNames.length > 0 ? input.todoListNames[0] : input.todoListName) || '';
  const connectionId = input.todoSelectedConnectionId;

  return todoLines.map((title) => ({
    ...(connectionId != null ? { connectionId } : {}),
    ...(listName ? { listName } : {}),
    title,
    description: null,
    dueAt
  }));
}