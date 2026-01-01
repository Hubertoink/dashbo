<script lang="ts">
  import { daysForMonthGrid, formatGermanDayLabel, formatMonthTitle, sameDay } from '$lib/date';
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { fade, fly } from 'svelte/transition';

  export let monthAnchor: Date;
  export let selected: Date;
  export let onSelect: (d: Date) => void;
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let viewMode: 'month' | 'week' = 'month';
  export let onSetViewMode: (m: 'month' | 'week') => void;
  export let upcomingMode: boolean = false;
  export let onToggleUpcoming: () => void;
  export let onOpenPlanner: (() => void) | null = null;

  const dotBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500',
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    violet: 'bg-violet-400',
    sky: 'bg-sky-400',
    lime: 'bg-lime-400'
  };

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

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && hexRe.test(value);
  }

  function isTagColorKey(value: unknown): value is TagColorKey {
    return typeof value === 'string' && value in dotBg;
  }

  function dateKey(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function startOfLocalDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addLocalDays(d: Date, daysToAdd: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + daysToAdd);
    return x;
  }

  type WeekSegment = {
    key: string;
    startCol: number; // 1..7
    endCol: number; // 1..7
    colorClass: string;
    colorStyle?: string;
  };

  function yyyymmddLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isMultiDay(e: EventDto) {
    if (!e.endAt) return false;
    const s = new Date(e.startAt);
    const end = new Date(e.endAt);
    return yyyymmddLocal(s) !== yyyymmddLocal(end);
  }

  let eventsByDay: Map<string, EventDto[]> = new Map();
  $: {
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
    eventsByDay = m;
  }

  let holidaysByDay: Map<string, HolidayDto[]> = new Map();
  $: {
    const m = new Map<string, HolidayDto[]>();
    for (const h of holidays) {
      const d = new Date(`${h.date}T00:00:00`);
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(h);
      m.set(k, arr);
    }
    holidaysByDay = m;
  }

  const weekDays = [
    new Date(2024, 0, 1),
    new Date(2024, 0, 2),
    new Date(2024, 0, 3),
    new Date(2024, 0, 4),
    new Date(2024, 0, 5),
    new Date(2024, 0, 6),
    new Date(2024, 0, 7)
  ];

  $: days = daysForMonthGrid(monthAnchor);
  $: monthTitle = formatMonthTitle(monthAnchor);

  $: weeks = (() => {
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  })();

  $: weekSegments = (() => {
    const out: WeekSegment[][][] = [];

    const spanning = events
      .filter((e) => isMultiDay(e))
      .slice()
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    for (const weekDays of weeks) {
      const weekStart = startOfLocalDay(weekDays[0] ?? new Date());
      const weekEnd = startOfLocalDay(weekDays[6] ?? weekStart);
      const segments: WeekSegment[] = [];

      for (const e of spanning) {
        const p0 = (e.persons && e.persons.length > 0 ? e.persons[0] : e.person) ?? null;
        const s = startOfLocalDay(new Date(e.startAt));
        const end = e.endAt ? startOfLocalDay(new Date(e.endAt)) : s;
        if (end < weekStart || s > weekEnd) continue;

        const segStart = s < weekStart ? weekStart : s;
        const segEnd = end > weekEnd ? weekEnd : end;

        const startIdx = Math.max(0, weekDays.findIndex((d) => sameDay(d, segStart)));
        const endIdx = Math.max(0, weekDays.findIndex((d) => sameDay(d, segEnd)));

        const startCol = startIdx + 1;
        const endCol = endIdx + 1;
        const colorClass = e.tag
          ? isHexColor(e.tag.color)
            ? 'bg-transparent'
            : dotBg[e.tag.color as TagColorKey] ?? 'bg-white/25'
          : p0
            ? dotBg[p0.color as TagColorKey] ?? 'bg-white/25'
            : 'bg-white/25';
        const colorStyle = e.tag && isHexColor(e.tag.color) ? `background-color: ${e.tag.color};` : undefined;
        const key = e.occurrenceId ?? `${e.id}:${e.startAt}`;

        segments.push({ key, startCol, endCol, colorClass, colorStyle });
      }

      // Greedy lane assignment (max 2 lanes) to avoid overlaps in the same week
      segments.sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
      const lanes: WeekSegment[][] = [[], []];
      for (const seg of segments) {
        let placed = false;
        for (let li = 0; li < lanes.length; li++) {
          const lane = lanes[li];
          const last = lane[lane.length - 1];
          if (!last || seg.startCol > last.endCol) {
            lane.push(seg);
            placed = true;
            break;
          }
        }
        if (!placed) {
          // drop if we already used both lanes
        }
      }

      out.push(lanes);
    }

    return out;
  })();

  let touchStartX: number | null = null;
  let touchStartY: number | null = null;

  function clampDateToMonth(d: Date, anchor: Date) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const day = d.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  }

  function shiftMonth(delta: number) {
    const nextAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1);
    const nextSelected = clampDateToMonth(selected, nextAnchor);
    onSelect(nextSelected);
  }

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touchStartX = t?.clientX ?? null;
    touchStartY = t?.clientY ?? null;
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX == null || touchStartY == null) return;
    const t = e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;

    // horizontal swipe (ignore vertical scroll)
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

    if (dx < 0) shiftMonth(1);
    else shiftMonth(-1);
  }
</script>

<div class="h-full min-h-0 flex flex-col" on:touchstart={onTouchStart} on:touchend={onTouchEnd}>
  {#key monthTitle}
    <div class="px-8 pt-8 pb-4" in:fly={{ y: -10, duration: 160 }} out:fade={{ duration: 120 }}>
      <div class="flex items-center justify-between gap-4">
        <div class="text-4xl font-semibold tracking-wide">{monthTitle}</div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="h-9 w-9 rounded-xl transition-all duration-150 grid place-items-center bg-white/5 text-white/70 hover:bg-white/10 hover:text-white/85"
            aria-label={upcomingMode ? 'Zurück' : 'Mehr anzeigen'}
            on:click={onToggleUpcoming}
          >
            {#if upcomingMode}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white/80">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white/80">
                <path d="M9 18l6-6-6-6" />
              </svg>
            {/if}
          </button>

          <button
            type="button"
            class={`h-9 w-9 rounded-xl transition-all duration-150 grid place-items-center ${viewMode === 'month' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'}`}
            aria-label="Monat"
            on:click={() => onSetViewMode('month')}
          >
            <span class="text-xl leading-none">_</span>
          </button>

          {#if onOpenPlanner}
            <button
              type="button"
              class="h-9 w-9 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all duration-150 grid place-items-center"
              aria-label="Wochenplaner"
              on:click={onOpenPlanner}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <line x1="10" y1="14" x2="10" y2="18"></line>
                <line x1="14" y1="14" x2="14" y2="18"></line>
                <line x1="8" y1="16" x2="16" y2="16"></line>
              </svg>
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/key}

  <div class="px-8">
    <div class="grid grid-cols-7 gap-4 text-white/70">
      {#each weekDays as d}
        <div class="px-3 text-sm md:text-base font-semibold">{formatGermanDayLabel(d)}</div>
      {/each}
    </div>
  </div>

  <div class="px-8 pt-4 flex-1 min-h-0 overflow-hidden">
    <div class="space-y-4">
      {#each weeks as week, wi}
        <div class="relative">
          <div class="relative z-10 grid grid-cols-7 gap-4">
            {#each week as d}
              {@const isSelected = sameDay(d, selected)}
              {@const inMonth = d.getMonth() === monthAnchor.getMonth()}
              {@const isToday = sameDay(d, new Date())}
              {@const dayEvents = eventsByDay.get(dateKey(d)) ?? []}
              {@const singleDayEvents = dayEvents.filter((ev) => !isMultiDay(ev))}
              {@const dayHolidays = holidaysByDay.get(dateKey(d)) ?? []}
              {@const maxEventDots = dayHolidays.length > 0 ? 2 : 3}

              <button
                type="button"
                class={`relative h-[58px] md:h-[72px] rounded-2xl text-left px-3 py-2 transition
                  ${inMonth ? 'text-white' : 'text-white/35'}
                  ${isSelected ? 'bg-white/15' : 'bg-white/0 hover:bg-white/10 active:bg-white/15'}
                  ${isToday ? 'ring-2 ring-white/30' : ''}
                  active:scale-95
                `}
                on:click={() => onSelect(new Date(d))}
              >
                <div class="absolute left-3 top-2 text-2xl md:text-3xl font-semibold leading-none">{d.getDate()}</div>

                <div class="pt-8 md:pt-10 pr-7 md:pr-8">
                  {#if singleDayEvents.length > 0}
                    {@const ev0 = singleDayEvents[0]}
                    {@const p0 = (ev0.persons && ev0.persons.length > 0 ? ev0.persons[0] : ev0.person) ?? null}
                    <div
                      class={`text-xs md:text-sm font-semibold leading-tight line-clamp-2 whitespace-normal break-words ${
                        ev0.tag
                          ? isTagColorKey(ev0.tag.color)
                            ? textFg[ev0.tag.color]
                            : 'text-white/80'
                          : p0
                            ? textFg[p0.color as TagColorKey] ?? 'text-white/80'
                            : 'text-white/80'
                      }`}
                    >
                      {ev0.title}
                    </div>
                  {:else if dayHolidays.length > 0}
                    <div class="text-xs md:text-sm font-semibold leading-tight line-clamp-2 whitespace-normal break-words text-white/70">{dayHolidays[0]?.title}</div>
                  {/if}
                </div>
                {#if singleDayEvents.length > 0 || dayHolidays.length > 0}
                  <div class="absolute right-4 bottom-3 flex flex-col items-end gap-1">
                    {#if dayHolidays.length > 0}
                      <div class="h-2.5 w-2.5 rounded-full border border-white/60 bg-white/0"></div>
                    {/if}
                    {#each singleDayEvents.slice(0, maxEventDots) as ev (ev.occurrenceId ?? `${ev.id}:${ev.startAt}`)}
                      {@const p0 = (ev.persons && ev.persons.length > 0 ? ev.persons[0] : ev.person) ?? null}
                      <div
                        class={`h-2.5 w-2.5 rounded-full ${
                          ev.tag
                            ? isHexColor(ev.tag.color)
                              ? 'bg-transparent'
                              : dotBg[ev.tag.color as TagColorKey] ?? 'bg-white/25'
                            : p0
                              ? dotBg[p0.color as TagColorKey] ?? 'bg-white/25'
                              : 'bg-white/25'
                        }`}
                        style={ev.tag && isHexColor(ev.tag.color) ? `background-color: ${ev.tag.color}` : ''}
                      ></div>
                    {/each}
                  </div>
                {/if}
              </button>
            {/each}
          </div>

          <!-- Multi-day bars (up to 2 lanes) - positioned above day number -->
          {#if (weekSegments[wi]?.[0]?.length ?? 0) > 0}
            <div class="pointer-events-none absolute inset-x-0 top-[4px] md:top-[6px] px-8 z-0">
              <div class="grid grid-cols-7 gap-4">
                {#each weekSegments[wi]?.[0] ?? [] as seg (seg.key)}
                  <div
                    class={`h-1.5 rounded-full ${seg.colorClass} opacity-70`}
                    style={`grid-column: ${seg.startCol} / ${seg.endCol + 1}; ${seg.colorStyle ?? ''}`}
                  ></div>
                {/each}
              </div>
            </div>
          {/if}

          {#if (weekSegments[wi]?.[1]?.length ?? 0) > 0}
            <div class="pointer-events-none absolute inset-x-0 top-[10px] md:top-[13px] px-8 z-0">
              <div class="grid grid-cols-7 gap-4">
                {#each weekSegments[wi]?.[1] ?? [] as seg (seg.key)}
                  <div
                    class={`h-1.5 rounded-full ${seg.colorClass} opacity-60`}
                    style={`grid-column: ${seg.startCol} / ${seg.endCol + 1}; ${seg.colorStyle ?? ''}`}
                  ></div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
