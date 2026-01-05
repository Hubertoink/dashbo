import type { EventDto } from './api';
import { sameDay } from './date';

export type WeekPlannerConfig = {
  startHour: number; // e.g. 6
  endHour: number; // e.g. 22
  defaultDurationMinutes: number; // e.g. 60
  pxPerMinute: number; // e.g. 1.8
  snapMinutes: number; // e.g. 15 (for potential future interactions)
};

export type DaySegment = {
  event: EventDto;
  day: Date;
  startMin: number; // minutes since startHour
  endMin: number; // minutes since startHour
  isContinuation: boolean; // true on days after the start day
};

export type PositionedSegment = DaySegment & {
  colIndex: number;
  colCount: number;
};

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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function buildTimedSegmentsForWeek(events: EventDto[], days: Date[], config: WeekPlannerConfig): DaySegment[] {
  const dayStarts = days.map((d) => startOfLocalDay(d));
  const dayStartMs = new Map(dayStarts.map((d) => [d.getTime(), d] as const));

  const minMinute = config.startHour * 60;
  const maxMinute = config.endHour * 60;
  const totalMinutes = Math.max(0, maxMinute - minMinute);

  const out: DaySegment[] = [];

  for (const e of events) {
    if (e.allDay) continue;

    const start = new Date(e.startAt);
    const end = e.endAt ? new Date(e.endAt) : new Date(start.getTime() + config.defaultDurationMinutes * 60_000);

    const startDay = startOfLocalDay(start);
    const endDay = startOfLocalDay(end);

    const maxSpanDays = 62;
    const spanDays = Math.min(
      maxSpanDays,
      Math.max(0, Math.round((endDay.getTime() - startDay.getTime()) / (24 * 3600 * 1000)))
    );

    for (let i = 0; i <= spanDays; i++) {
      const day = addLocalDays(startDay, i);
      const dayKey = day.getTime();
      if (!dayStartMs.has(dayKey)) continue; // only within the displayed week

      const isContinuation = i > 0;

      // Determine the segment bounds for this day in local minutes.
      const segStartMinute = i === 0 ? minutesSinceMidnight(start) : 0;
      const segEndMinute = i === spanDays ? minutesSinceMidnight(end) : 24 * 60;

      // Clip to the visible window.
      const clippedStart = clamp(segStartMinute, minMinute, maxMinute);
      const clippedEnd = clamp(segEndMinute, minMinute, maxMinute);
      const startMin = clippedStart - minMinute;
      const endMin = clippedEnd - minMinute;

      if (endMin <= startMin) continue;

      out.push({
        event: e,
        day,
        startMin,
        endMin,
        isContinuation
      });
    }
  }

  // Stable-ish ordering
  out.sort((a, b) => {
    if (a.day.getTime() !== b.day.getTime()) return a.day.getTime() - b.day.getTime();
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    return a.event.title.localeCompare(b.event.title);
  });

  void totalMinutes;
  return out;
}

function groupByDay<T extends { day: Date }>(items: T[]): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const it of items) {
    const k = startOfLocalDay(it.day).getTime();
    const arr = m.get(k) ?? [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}

function buildOverlapGroups(segments: DaySegment[]): DaySegment[][] {
  const sorted = [...segments].sort((a, b) => (a.startMin !== b.startMin ? a.startMin - b.startMin : b.endMin - a.endMin));
  const groups: DaySegment[][] = [];
  let current: DaySegment[] = [];
  let currentEnd = -1;

  for (const s of sorted) {
    if (current.length === 0) {
      current = [s];
      currentEnd = s.endMin;
      continue;
    }

    if (s.startMin < currentEnd) {
      current.push(s);
      currentEnd = Math.max(currentEnd, s.endMin);
    } else {
      groups.push(current);
      current = [s];
      currentEnd = s.endMin;
    }
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

function layoutGroup(group: DaySegment[]): PositionedSegment[] {
  const sorted = [...group].sort((a, b) => (a.startMin !== b.startMin ? a.startMin - b.startMin : b.endMin - a.endMin));
  const active: Array<{ seg: DaySegment; col: number } & { endMin: number }> = [];
  const placed: Array<{ seg: DaySegment; col: number }> = [];
  let maxCol = 0;

  for (const s of sorted) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.endMin <= s.startMin) active.splice(i, 1);
    }

    const used = new Set(active.map((a) => a.col));
    let col = 0;
    while (used.has(col)) col++;
    maxCol = Math.max(maxCol, col);

    active.push({ seg: s, col, endMin: s.endMin });
    placed.push({ seg: s, col });
  }

  const colCount = maxCol + 1;
  return placed.map(({ seg, col }) => ({ ...seg, colIndex: col, colCount }));
}

export function layoutWeekTimedSegments(events: EventDto[], days: Date[], config: WeekPlannerConfig) {
  const segments = buildTimedSegmentsForWeek(events, days, config);
  const byDay = groupByDay(segments);
  const positionedByDay = new Map<number, PositionedSegment[]>();

  for (const d of days) {
    const k = startOfLocalDay(d).getTime();
    const daySegs = byDay.get(k) ?? [];
    const groups = buildOverlapGroups(daySegs);
    const positioned = groups.flatMap((g) => layoutGroup(g));
    positionedByDay.set(k, positioned);
  }

  return positionedByDay;
}

export function isContinuationDay(event: EventDto, day: Date): boolean {
  const start = new Date(event.startAt);
  return !sameDay(start, day);
}
