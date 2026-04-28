import type { EventDto } from '$lib/api';

export type RecurringPatternType = 'weekly' | 'biweekly' | 'monthly';

export type RecurringPatternSuggestion = {
  suggestionKey: string;
  patternKey: string;
  patternType: RecurringPatternType;
  targetDay: Date;
  startAt: Date;
  endAt: Date | null;
  startTime: string;
  endTime: string | null;
  sample: EventDto;
};

type PatternAgg = {
  patternKey: string;
  baseKey: string;
  dates: Date[];
  weeks: Set<number>;
  months: Set<number>;
  sample: EventDto;
  weekday: number;
  startBucket: number;
  durationBucket: number | null;
  titleNorm: string;
  patternType: RecurringPatternType;
  biweeklyParity?: number;
  monthlyNth?: number;
};

export type RecurringPatternOptions = {
  sourceEvents: EventDto[];
  targetDays: Date[];
  existingEvents?: EventDto[];
  dismissedKeys?: Iterable<string>;
  minDate?: Date | null;
  enabled?: Partial<Record<RecurringPatternType, boolean>>;
  signatureMode?: 'dated' | 'pattern';
  existingMatchMode?: 'matching' | 'overlap';
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function normalizeTitle(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function weekdayMon0(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function bucket15(minutes: number): number {
  return Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes / 15) * 15));
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function hhmmFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function mondayStart(date: Date): Date {
  const copy = startOfLocalDay(date);
  copy.setDate(copy.getDate() - weekdayMon0(copy));
  return copy;
}

function weekIndex(date: Date): number {
  const monday = mondayStart(date);
  return Math.floor(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / WEEK_MS);
}

function nthWeekdayOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

function isNthWeekdayOfMonth(date: Date, nth: number, weekday: number): boolean {
  return weekdayMon0(date) === weekday && nthWeekdayOfMonth(date) === nth;
}

function uniqueSortedWeekIndexes(dates: Date[]): number[] {
  return Array.from(new Set(dates.map((date) => weekIndex(date)))).sort((left, right) => left - right);
}

function gaps(values: number[]): number[] {
  const result: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] - values[index - 1]);
  }
  return result;
}

function hasWeeklyCadence(dates: Date[]): boolean {
  const weeks = uniqueSortedWeekIndexes(dates);
  if (weeks.length < 3) return false;

  const weekGaps = gaps(weeks);
  const adjacentGaps = weekGaps.filter((gap) => gap === 1).length;
  if (adjacentGaps >= 2) return true;

  if (weeks.length < 4) return false;
  const span = weeks[weeks.length - 1] - weeks[0] + 1;
  const density = weeks.length / span;
  const maxGap = Math.max(...weekGaps);
  return density >= 0.6 && maxGap <= 2;
}

function hasBiweeklyCadence(dates: Date[]): boolean {
  const weeks = uniqueSortedWeekIndexes(dates);
  if (weeks.length < 2) return false;

  const weekGaps = gaps(weeks);
  const twoWeekGaps = weekGaps.filter((gap) => gap === 2).length;
  if (weeks.length === 2) return twoWeekGaps === 1;

  const maxGap = Math.max(...weekGaps);
  return twoWeekGaps >= weekGaps.length - 1 && maxGap <= 4;
}

function hasMonthlyOrdinalCadence(dates: Date[]): boolean {
  if (dates.length < 2) return false;
  const months = new Set(dates.map((date) => monthIndex(date)));
  return months.size >= 2;
}

function durationBucketFor(eventItem: EventDto, start: Date): number | null {
  if (!eventItem.endAt) return null;
  const end = new Date(eventItem.endAt);
  if (Number.isNaN(end.getTime())) return null;

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (durationMinutes < 15 || durationMinutes > 12 * 60) return null;
  return bucket15(durationMinutes);
}

function upsertPattern(
  patterns: Map<string, PatternAgg>,
  pattern: Omit<PatternAgg, 'dates' | 'weeks' | 'months' | 'sample'>,
  eventItem: EventDto,
  start: Date
) {
  const existing = patterns.get(pattern.patternKey);
  const eventWeek = weekIndex(start);
  const eventMonth = monthIndex(start);

  if (existing) {
    existing.dates.push(start);
    existing.weeks.add(eventWeek);
    existing.months.add(eventMonth);
    const currentSampleTime = new Date(existing.sample.startAt).getTime();
    if (Number.isNaN(currentSampleTime) || start.getTime() > currentSampleTime) {
      existing.sample = eventItem;
    }
    return;
  }

  patterns.set(pattern.patternKey, {
    ...pattern,
    dates: [start],
    weeks: new Set([eventWeek]),
    months: new Set([eventMonth]),
    sample: eventItem
  });
}

function eventOverlaps(start: Date, end: Date | null, otherStart: Date, otherEnd: Date | null): boolean {
  const startMs = start.getTime();
  const endMs = (end ?? start).getTime();
  const otherStartMs = otherStart.getTime();
  const otherEndMs = (otherEnd ?? otherStart).getTime();
  return startMs <= otherEndMs && otherStartMs <= endMs;
}

function hasExistingOccurrence(
  events: EventDto[],
  pattern: PatternAgg,
  targetDayKey: string,
  startAt: Date,
  endAt: Date | null,
  mode: 'matching' | 'overlap'
): boolean {
  for (const eventItem of events ?? []) {
    const eventStart = new Date(eventItem.startAt);
    if (Number.isNaN(eventStart.getTime())) continue;

    if (mode === 'overlap') {
      if (dateKey(eventStart) !== targetDayKey) continue;
      const eventEnd = eventItem.endAt ? new Date(eventItem.endAt) : null;
      if (eventEnd && Number.isNaN(eventEnd.getTime())) {
        if (eventOverlaps(startAt, endAt, eventStart, null)) return true;
        continue;
      }
      if (eventOverlaps(startAt, endAt, eventStart, eventEnd)) return true;
      continue;
    }

    if (dateKey(eventStart) !== targetDayKey) continue;
    if (normalizeTitle(eventItem.title) === pattern.titleNorm) return true;
    if (eventItem.allDay) continue;
    if (bucket15(minutesSinceMidnight(eventStart)) === pattern.startBucket) return true;
  }

  return false;
}

function isTargetForPattern(pattern: PatternAgg, targetDay: Date): boolean {
  if (weekdayMon0(targetDay) !== pattern.weekday) return false;

  if (pattern.patternType === 'biweekly') {
    return weekIndex(targetDay) % 2 === pattern.biweeklyParity;
  }

  if (pattern.patternType === 'monthly') {
    return pattern.monthlyNth != null && isNthWeekdayOfMonth(targetDay, pattern.monthlyNth, pattern.weekday);
  }

  return true;
}

function hasEnoughEvidence(pattern: PatternAgg, targetDay: Date): boolean {
  const targetTime = targetDay.getTime();
  const datesBeforeTarget = pattern.dates.filter((date) => date.getTime() < targetTime);

  if (pattern.patternType === 'weekly') return hasWeeklyCadence(datesBeforeTarget);
  if (pattern.patternType === 'biweekly') return hasBiweeklyCadence(datesBeforeTarget);
  return hasMonthlyOrdinalCadence(datesBeforeTarget);
}

function datedKey(patternKey: string, targetDay: Date): string {
  return `${patternKey}|${dateKey(targetDay)}`;
}

function legacyWeeklyDatedKey(pattern: PatternAgg, targetDay: Date): string | null {
  if (pattern.patternType !== 'weekly') return null;
  return `weekly|${pattern.weekday}|${pattern.startBucket}|${pattern.titleNorm}|${dateKey(targetDay)}`;
}

export function generateRecurringPatternSuggestions(options: RecurringPatternOptions): RecurringPatternSuggestion[] {
  const enabled = {
    weekly: options.enabled?.weekly !== false,
    biweekly: options.enabled?.biweekly !== false,
    monthly: options.enabled?.monthly !== false
  };
  const dismissed = new Set(Array.from(options.dismissedKeys ?? []));
  const signatureMode = options.signatureMode ?? 'dated';
  const existingMatchMode = options.existingMatchMode ?? 'matching';
  const existingEvents = options.existingEvents ?? options.sourceEvents ?? [];
  const minDate = options.minDate === null ? null : startOfLocalDay(options.minDate ?? new Date());

  const targetDays = Array.from(
    new Map(
      (options.targetDays ?? [])
        .map((day) => startOfLocalDay(day))
        .filter((day) => !Number.isNaN(day.getTime()))
        .filter((day) => !minDate || day.getTime() >= minDate.getTime())
        .sort((left, right) => left.getTime() - right.getTime())
        .map((day) => [dateKey(day), day] as const)
    ).values()
  );

  const weeklyPatterns = new Map<string, PatternAgg>();
  const biweeklyPatterns = new Map<string, PatternAgg>();
  const monthlyPatterns = new Map<string, PatternAgg>();

  for (const eventItem of options.sourceEvents ?? []) {
    if (eventItem.source === 'outlook') continue;
    if (eventItem.allDay) continue;
    if (eventItem.recurrence) continue;
    if (!eventItem.title || !String(eventItem.title).trim()) continue;

    const start = new Date(eventItem.startAt);
    if (Number.isNaN(start.getTime())) continue;

    const weekday = weekdayMon0(start);
    const startBucket = bucket15(minutesSinceMidnight(start));
    const titleNorm = normalizeTitle(eventItem.title);
    if (!titleNorm) continue;

    const durationBucket = durationBucketFor(eventItem, start);
    const baseKey = `${weekday}|${startBucket}|${durationBucket ?? 'x'}|${titleNorm}`;

    const weeklyPatternKey = `weekly|${baseKey}`;
    upsertPattern(
      weeklyPatterns,
      { patternKey: weeklyPatternKey, baseKey, weekday, startBucket, durationBucket, titleNorm, patternType: 'weekly' },
      eventItem,
      start
    );

    const biweeklyParity = weekIndex(start) % 2;
    const biweeklyPatternKey = `biweekly|${baseKey}|${biweeklyParity}`;
    upsertPattern(
      biweeklyPatterns,
      {
        patternKey: biweeklyPatternKey,
        baseKey,
        weekday,
        startBucket,
        durationBucket,
        titleNorm,
        patternType: 'biweekly',
        biweeklyParity
      },
      eventItem,
      start
    );

    const monthlyNth = nthWeekdayOfMonth(start);
    const monthlyPatternKey = `monthly|${monthlyNth}|${baseKey}`;
    upsertPattern(
      monthlyPatterns,
      {
        patternKey: monthlyPatternKey,
        baseKey,
        weekday,
        startBucket,
        durationBucket,
        titleNorm,
        patternType: 'monthly',
        monthlyNth
      },
      eventItem,
      start
    );
  }

  const result: RecurringPatternSuggestion[] = [];
  const addedBaseDays = new Set<string>();

  function tryAdd(pattern: PatternAgg, targetDay: Date) {
    if (!isTargetForPattern(pattern, targetDay)) return;
    if (!hasEnoughEvidence(pattern, targetDay)) return;

    const targetDayKey = dateKey(targetDay);
    const baseDayKey = `${pattern.baseKey}|${targetDayKey}`;
    if (addedBaseDays.has(baseDayKey)) return;

    const suggestionKey = signatureMode === 'pattern' ? pattern.patternKey : datedKey(pattern.patternKey, targetDay);
    const legacyDatedKey = legacyWeeklyDatedKey(pattern, targetDay);
    if (dismissed.has(suggestionKey) || dismissed.has(pattern.patternKey) || (legacyDatedKey && dismissed.has(legacyDatedKey))) return;

    const startAt = new Date(targetDay);
    startAt.setHours(Math.floor(pattern.startBucket / 60), pattern.startBucket % 60, 0, 0);
    const endAt = pattern.durationBucket != null ? new Date(startAt.getTime() + pattern.durationBucket * 60000) : null;

    if (hasExistingOccurrence(existingEvents, pattern, targetDayKey, startAt, endAt, existingMatchMode)) return;

    addedBaseDays.add(baseDayKey);
    result.push({
      suggestionKey,
      patternKey: pattern.patternKey,
      patternType: pattern.patternType,
      targetDay: new Date(targetDay),
      startAt,
      endAt,
      startTime: hhmmFromMinutes(pattern.startBucket),
      endTime: endAt && dateKey(endAt) === targetDayKey ? hhmmFromMinutes(minutesSinceMidnight(endAt)) : null,
      sample: pattern.sample
    });
  }

  const orderedPatterns: PatternAgg[][] = [];
  if (enabled.weekly) orderedPatterns.push(Array.from(weeklyPatterns.values()));
  if (enabled.biweekly) orderedPatterns.push(Array.from(biweeklyPatterns.values()));
  if (enabled.monthly) orderedPatterns.push(Array.from(monthlyPatterns.values()));

  for (const patterns of orderedPatterns) {
    for (const pattern of patterns) {
      for (const targetDay of targetDays) {
        tryAdd(pattern, targetDay);
      }
    }
  }

  return result.sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
}