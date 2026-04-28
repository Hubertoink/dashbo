import {
  fetchEvents,
  fetchOutlookStatus,
  fetchSettings,
  fetchTodos,
  listOutlookConnections,
  listPersons,
  listTags,
  type EventDto,
  type OutlookConnectionDto,
  type PersonDto,
  type TagDto
} from '$lib/api';
import { daysForMonthGrid, endOfDay, startOfDay } from '$lib/date';
import { applyTodoMetaDefaults, normalizeTodoMeta } from '$lib/planner/todoHelpers';
import {
  normalizeDismissedSuggestions,
  pickPlannerBackground,
  type PlannerWeekSpan
} from '$lib/planner/preferences';

export type PlannerMetaData = {
  backgroundUrl: string;
  scribbleEnabled: boolean;
  todoEnabled: boolean;
  dismissedSuggestions: string[];
  tags: TagDto[];
  persons: PersonDto[];
  outlookConnected: boolean;
};

export type PlannerTodoMetaData = {
  todoListName: string;
  todoListNames: string[];
  outlookConnections: OutlookConnectionDto[];
  todoSelectedConnectionId: number;
  todoSelectedListName: string;
};

function addDays(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
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

function sortPlannerMetaBySortOrder<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
}

function sortEventsByStart(items: EventDto[]): EventDto[] {
  return items.slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export async function fetchPlannerMeta(): Promise<PlannerMetaData> {
  const [settings, tags, persons, outlookStatus] = await Promise.all([
    fetchSettings(),
    listTags(),
    listPersons(),
    fetchOutlookStatus().catch(() => null)
  ]);

  return {
    backgroundUrl: pickPlannerBackground(settings),
    scribbleEnabled: settings.scribbleEnabled !== false,
    todoEnabled: settings.todoEnabled !== false,
    dismissedSuggestions: normalizeDismissedSuggestions((settings as any)?.dismissedSuggestions),
    tags: sortPlannerMetaBySortOrder(tags ?? []),
    persons: sortPlannerMetaBySortOrder(persons ?? []),
    outlookConnected: Boolean(outlookStatus?.connected)
  };
}

export async function fetchPlannerTodoMeta(input: {
  todoSelectedConnectionId: number | null;
  todoSelectedListName: string;
}): Promise<PlannerTodoMetaData> {
  const [todoMeta, connections] = await Promise.all([
    fetchTodos().catch(() => null),
    listOutlookConnections().catch(() => [])
  ]);

  const normalized = normalizeTodoMeta(todoMeta);
  const outlookConnections = Array.isArray(connections) ? connections : [];
  const defaults = applyTodoMetaDefaults({
    todoListNames: normalized.todoListNames,
    todoListName: normalized.todoListName,
    todoSelectedConnectionId: input.todoSelectedConnectionId,
    todoSelectedListName: input.todoSelectedListName
  });

  return {
    todoListName: normalized.todoListName,
    todoListNames: normalized.todoListNames,
    outlookConnections,
    todoSelectedConnectionId: defaults.todoSelectedConnectionId,
    todoSelectedListName: defaults.todoSelectedListName
  };
}

export async function fetchPlannerAgendaEvents(selectedDate: Date): Promise<EventDto[]> {
  const from = startOfDay(selectedDate);
  const to = endOfDay(addDays(selectedDate, 7));
  const items = await fetchEvents(from, to);
  return sortEventsByStart(items);
}

export async function fetchPlannerSuggestionEvents(now: Date = new Date()): Promise<EventDto[]> {
  const today = startOfLocalDay(now);
  const suggestFrom = startOfDay(addDays(today, -12 * 7));
  const suggestTo = endOfDay(addDays(today, 60));
  return fetchEvents(suggestFrom, suggestTo);
}

export async function fetchPlannerWeekEvents(selectedDate: Date, weekSpan: PlannerWeekSpan): Promise<EventDto[]> {
  const from =
    weekSpan === 3 ? startOfDay(addDays(selectedDate, -1)) : startOfDay(mondayStart(selectedDate));
  const to = weekSpan === 3 ? endOfDay(addDays(selectedDate, 1)) : endOfDay(addDays(mondayStart(selectedDate), 6));
  return fetchEvents(from, to);
}

export async function fetchPlannerMonthEvents(monthAnchor: Date): Promise<EventDto[]> {
  const days = daysForMonthGrid(monthAnchor);
  const from = startOfDay(days[0] ?? monthAnchor);
  const to = endOfDay(days[days.length - 1] ?? monthAnchor);
  return fetchEvents(from, to);
}