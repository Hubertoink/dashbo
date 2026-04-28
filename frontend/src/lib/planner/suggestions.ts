import type { EventDto, PersonDto } from '$lib/api';

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

function normalizeTitle(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function weekdayMon0(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function bucket15(mins: number): number {
  return Math.round(mins / 15) * 15;
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function hhmmFromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getPlannerEventPersons(e: EventDto): PersonDto[] {
  if (e.persons && e.persons.length > 0) return e.persons;
  if (e.person) return [e.person];
  return [];
}

export function generatePlannerSuggestions(events: EventDto[], dismissedSuggestions: string[]): PlannerSuggestionDto[] {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const dismissedSet = new Set(dismissedSuggestions);

  const candidates = (events ?? []).filter((e) => {
    if (e.source === 'outlook') return false;
    if (e.allDay) return false;
    if (e.recurrence) return false;
    if (!e.title || !String(e.title).trim()) return false;
    return true;
  });

  const lookbackFrom = addDays(todayStart, -12 * 7);
  const patternTo = addDays(todayStart, 61);
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

  const upcomingDays: Date[] = [];
  for (let i = 0; i <= 60; i++) upcomingDays.push(addDays(todayStart, i));

  const result: PlannerSuggestionDto[] = [];
  const addedKeys = new Set<string>();

  function matchesSuggestedOccurrence(eventItem: EventDto, dayDateKey: string, titleNorm: string, startBucket: number): boolean {
    const eventStart = new Date(eventItem.startAt);
    if (Number.isNaN(eventStart.getTime())) return false;
    if (dateKey(eventStart) !== dayDateKey) return false;
    if (normalizeTitle(eventItem.title) === titleNorm) return true;
    if (eventItem.allDay) return false;
    return bucket15(minutesSinceMidnight(eventStart)) === startBucket;
  }

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
      if (addedKeys.has(suggKey) || dismissedSet.has(suggKey)) continue;

      const hasExisting = (events ?? []).some((ev) => {
        return matchesSuggestedOccurrence(ev, dayDateKey, agg.titleNorm, agg.startBucket);
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

      const persons = getPlannerEventPersons(agg.sample);
      result.push({
        title: agg.sample.title,
        location: agg.sample.location ?? null,
        date: new Date(dayStart),
        allDay: false,
        startTime: hhmmFromMinutes(agg.startBucket),
        endTime,
        tagId: agg.sample.tag?.id ?? null,
        personIds: persons.map((p) => p.id),
        signature: suggKey
      });
    }
  }

  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function takePlannerSuggestionPreview(items: PlannerSuggestionDto[], limit = 5): PlannerSuggestionDto[] {
  return items.slice(0, limit);
}

export function removePlannerSuggestion(items: PlannerSuggestionDto[], signature: string): PlannerSuggestionDto[] {
  return items.filter((item) => item.signature !== signature);
}