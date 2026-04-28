import type { EventDto, PersonDto } from '$lib/api';
import { generateRecurringPatternSuggestions } from '$lib/planner/recurringPatterns';

export type PlannerSuggestionDto = {
  title: string;
  location: string | null;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  tagId: number | null;
  personIds: number[];
  signature: string;
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

export function getPlannerEventPersons(e: EventDto): PersonDto[] {
  if (e.persons && e.persons.length > 0) return e.persons;
  if (e.person) return [e.person];
  return [];
}

export function generatePlannerSuggestions(events: EventDto[], dismissedSuggestions: string[]): PlannerSuggestionDto[] {
  const todayStart = startOfLocalDay(new Date());

  const upcomingDays: Date[] = [];
  for (let i = 0; i <= 60; i++) upcomingDays.push(addDays(todayStart, i));

  return generateRecurringPatternSuggestions({
    sourceEvents: events,
    targetDays: upcomingDays,
    existingEvents: events,
    dismissedKeys: dismissedSuggestions,
    minDate: todayStart,
    signatureMode: 'dated',
    existingMatchMode: 'matching'
  }).map((suggestion) => {
    const persons = getPlannerEventPersons(suggestion.sample);
    return {
      title: suggestion.sample.title,
      location: suggestion.sample.location ?? null,
      date: new Date(suggestion.targetDay),
      allDay: false,
      startTime: suggestion.startTime,
      endTime: suggestion.endTime,
      tagId: suggestion.sample.tag?.id ?? null,
      personIds: persons.map((person) => person.id),
      signature: suggestion.suggestionKey
    };
  });
}

export function takePlannerSuggestionPreview(items: PlannerSuggestionDto[], limit = 5): PlannerSuggestionDto[] {
  return items.slice(0, limit);
}

export function removePlannerSuggestion(items: PlannerSuggestionDto[], signature: string): PlannerSuggestionDto[] {
  return items.filter((item) => item.signature !== signature);
}