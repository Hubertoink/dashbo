<script context="module" lang="ts">
  export type DashboardSuggestionDto = {
    suggestionKey: string;
    title: string;
    description?: string | null;
    location?: string | null;
    date: Date;
    allDay: boolean;
    startTime?: string; // HH:MM (local)
    endTime?: string; // HH:MM (local)
    tag?: import('$lib/api').EventDto['tag'];
    person?: import('$lib/api').EventDto['person'];
    persons?: import('$lib/api').EventDto['persons'];
  };
</script>

<script lang="ts">
  import { daysForMonthGrid, formatGermanDayLabel, formatMonthTitle, sameDay } from '$lib/date';
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { fade, fly } from 'svelte/transition';

  type DashboardSuggestionDto = {
    suggestionKey: string;
    title: string;
    description?: string | null;
    location?: string | null;
    date: Date;
    allDay: boolean;
    startTime?: string; // HH:MM (local)
    endTime?: string; // HH:MM (local)
    tag?: import('$lib/api').EventDto['tag'];
    person?: import('$lib/api').EventDto['person'];
    persons?: import('$lib/api').EventDto['persons'];
  };

  export let monthAnchor: Date;
  export let selected: Date;
  export let onSelect: (d: Date) => void;
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let suggestions: DashboardSuggestionDto[] = [];
  export let onMonthChange: ((delta: number) => void) | null = null;
  export let onAcceptSuggestion: ((s: DashboardSuggestionDto) => void) | null = null;
  export let onJumpToToday: (() => void) | null = null;
  export let viewMode: 'month' | 'week' = 'month';
  export let onSetViewMode: (m: 'month' | 'week') => void;
  export let upcomingMode: boolean = false;
  export let onToggleUpcoming: () => void;
  export let onOpenPlanner: (() => void) | null = null;
  export let tone: 'light' | 'dark' = 'light';

  // Keep public props referenced even if the current template variant doesn't use them.
  $: void onAcceptSuggestion;
  $: void viewMode;
  $: void onSetViewMode;

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

  const pillBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500/30',
    cyan: 'bg-cyan-400/30',
    emerald: 'bg-emerald-400/30',
    amber: 'bg-amber-400/30',
    rose: 'bg-rose-400/30',
    violet: 'bg-violet-400/30',
    sky: 'bg-sky-400/30',
    lime: 'bg-lime-400/30'
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
    title: string;
    isStart: boolean;
    isEnd: boolean;
    isOutlook: boolean;
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

  function startsOnDay(e: EventDto, day: Date) {
    return sameDay(startOfLocalDay(new Date(e.startAt)), startOfLocalDay(day));
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

  let suggestionsByDay: Map<string, DashboardSuggestionDto[]> = new Map();
  $: {
    const m = new Map<string, DashboardSuggestionDto[]>();
    for (const s of suggestions) {
      const k = dateKey(s.date);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    suggestionsByDay = m;
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
            ? ''
            : pillBg[e.tag.color as TagColorKey] ?? 'bg-white/20'
          : p0
            ? pillBg[p0.color as TagColorKey] ?? 'bg-white/20'
            : 'bg-white/20';
        const colorStyle = e.tag && isHexColor(e.tag.color) ? `background-color: ${e.tag.color}66;` : undefined;
        const key = e.occurrenceId ?? `${e.id}:${e.startAt}`;
        const isStart = sameDay(segStart, s);
        const isEnd = sameDay(segEnd, end);

        segments.push({ key, startCol, endCol, colorClass, colorStyle, title: e.title, isStart, isEnd, isOutlook: e.source === 'outlook' });
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

  $: weekLaneCount = weekSegments.map(lanes =>
    (lanes[1]?.length ?? 0) > 0 ? 2 : (lanes[0]?.length ?? 0) > 0 ? 1 : 0
  );

  // Track slide direction for animation: 1 = forward (right to left), -1 = backward (left to right)
  let slideDirection = 1;
  // Unique key for triggering grid animation
  $: monthKey = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;

  function clampDateToMonth(d: Date, anchor: Date) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const day = d.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  }

  function shiftMonth(delta: number) {
    slideDirection = delta > 0 ? 1 : -1;
    const nextAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1);
    const nextSelected = clampDateToMonth(selected, nextAnchor);
    onSelect(nextSelected);
  }
</script>

<div class="h-full min-h-0 flex flex-col {tone === 'dark' ? 'text-shadow-light' : 'text-shadow'}">
  <div class="relative overflow-hidden">
    <div class="px-4 lg:px-8 pt-6 lg:pt-8 pb-3 lg:pb-4 opacity-0 pointer-events-none select-none" aria-hidden="true">
      <div class="flex items-center justify-between gap-4">
        <div class="text-3xl lg:text-4xl font-semibold tracking-wide">{monthTitle}</div>
        <div class="h-9 w-9"></div>
      </div>
    </div>

    {#key monthTitle}
      <div
        class="absolute inset-0 px-4 lg:px-8 pt-6 lg:pt-8 pb-3 lg:pb-4"
        in:fly={{ x: slideDirection * 40, duration: 180 }}
        out:fly|local={{ x: slideDirection * -40, duration: 180 }}
      >
        <div class="flex items-center justify-between gap-4">
          <div class="grid items-center gap-3" style="grid-template-columns: 2rem auto 2rem;">
            {#if onMonthChange}
              <button
                type="button"
                class="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/50 hover:text-white/80 transition-all grid place-items-center"
                aria-label="Vorheriger Monat"
                on:click={() => {
                  slideDirection = -1;
                  onMonthChange?.(-1);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            {:else}
              <div class="h-8 w-8"></div>
            {/if}

          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="text-3xl lg:text-4xl font-semibold tracking-wide cursor-pointer select-none"
            aria-label="Zum aktuellen Monat"
            title="Zum aktuellen Monat"
            on:click={() => onJumpToToday?.()}
          >
            {monthTitle}
          </div>

          {#if onMonthChange}
            <button
              type="button"
              class="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/50 hover:text-white/80 transition-all grid place-items-center"
              aria-label="Nächster Monat"
              on:click={() => {
                slideDirection = 1;
                onMonthChange?.(1);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          {:else}
            <div class="h-8 w-8"></div>
          {/if}
        </div>

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
  </div>

  <div class="px-4 lg:px-8">
    <div class="grid grid-cols-7 gap-1.5 lg:gap-3 text-white/70">
      {#each weekDays as d}
        <div class="px-1.5 lg:px-3 text-xs lg:text-base font-semibold">{formatGermanDayLabel(d)}</div>
      {/each}
    </div>
  </div>

  <div class="px-4 lg:px-8 pt-3 lg:pt-4 flex-1 min-h-0 overflow-hidden relative">
    {#key monthKey}
    <div
      class="absolute inset-0 h-full min-h-0 grid grid-rows-6 gap-1 lg:gap-1.5"
      in:fly={{ x: slideDirection * 50, duration: 200 }}
      out:fly|local={{ x: slideDirection * -50, duration: 180 }}
    >
      {#each weeks as week, wi}
        <div class="relative min-h-0">
          <div class="relative z-10 grid grid-cols-7 gap-1.5 lg:gap-3 h-full">
            {#each week as d}
              {@const isSelected = sameDay(d, selected)}
              {@const inMonth = d.getMonth() === monthAnchor.getMonth()}
              {@const isToday = sameDay(d, new Date())}
              {@const dayEvents = eventsByDay.get(dateKey(d)) ?? []}
              {@const visibleEventBadges = dayEvents.filter((ev) => !isMultiDay(ev))}
              {@const dayHolidays = holidaysByDay.get(dateKey(d)) ?? []}
              {@const daySuggestions = suggestionsByDay.get(dateKey(d)) ?? []}
              {@const numLanes = weekLaneCount[wi] ?? 0}

              <button
                type="button"
                class={`relative h-full min-h-[48px] lg:min-h-[60px] rounded-xl lg:rounded-2xl text-left px-2 lg:px-3 pt-1.5 lg:pt-2 pb-1 lg:pb-1.5 transition flex flex-col justify-start overflow-hidden
                  ${inMonth ? 'text-white' : 'text-white/35'}
                  ${isSelected ? 'bg-white/15' : 'bg-white/0 hover:bg-white/10 active:bg-white/15'}
                  ${isToday ? 'ring-2 ring-inset ring-white/30' : ''}
                  active:scale-95
                `}
                on:click={() => onSelect(new Date(d))}
              >
                <!-- Day number (z-0, multi-day bars overlay with transparency) -->
                <div class="text-xl lg:text-3xl font-semibold leading-none relative" style="text-shadow: 0 1px 3px rgba(0,0,0,0.5);">{d.getDate()}</div>

                <!-- Pill badges below date number, stacked vertically -->
                {#if visibleEventBadges.length > 0 || dayHolidays.length > 0 || daySuggestions.length > 0}
                  {@const MAX_PILLS = numLanes >= 2 ? 2 : 3}
                  {@const allBadgeItems = [
                    ...dayHolidays.map(h => ({ type: 'holiday' as const, title: h.title, colorClass: '', colorStyle: '', source: null })),
                    ...visibleEventBadges.map(ev => {
                      const p0 = (ev.persons && ev.persons.length > 0 ? ev.persons[0] : ev.person) ?? null;
                      const bgClass = ev.tag
                        ? isTagColorKey(ev.tag.color) ? pillBg[ev.tag.color] : isHexColor(ev.tag.color) ? '' : 'bg-white/20'
                        : p0 ? pillBg[p0.color as TagColorKey] ?? 'bg-white/20' : 'bg-white/20';
                      const bgStyle = ev.tag && isHexColor(ev.tag.color) ? `background-color: ${ev.tag.color}44` : '';
                      return { type: 'event' as const, title: ev.title, colorClass: bgClass, colorStyle: bgStyle, source: ev.source ?? 'dashbo' };
                    }),
                    ...daySuggestions.map(sg => ({ type: 'suggestion' as const, title: sg.title, colorClass: 'bg-violet-500/30', colorStyle: '', source: null }))
                  ]}
                  {@const visibleBadges = allBadgeItems.slice(0, MAX_PILLS)}
                  {@const overflow = allBadgeItems.length - MAX_PILLS}
                  <div class="mt-0.5 flex flex-col gap-[2px] lg:gap-0.5 min-w-0 overflow-hidden">
                    {#each visibleBadges as badge, i}
                      {#if badge.type === 'holiday'}
                        <div class="h-[14px] lg:h-[18px] rounded-full border border-white/50 bg-white/0 px-1.5 lg:px-2 flex items-center self-start max-w-full" title={badge.title}>
                          <span class="text-[8px] lg:text-[10px] font-semibold text-white/60 truncate leading-none">{badge.title}</span>
                        </div>
                      {:else if badge.type === 'suggestion'}
                        <div class="h-[14px] lg:h-[18px] rounded-full border border-dashed border-violet-400/60 bg-violet-500/25 px-1.5 lg:px-2 flex items-center self-start max-w-full" title={badge.title}>
                          <span class="text-[8px] lg:text-[10px] font-semibold text-violet-200/80 truncate leading-none">{badge.title}</span>
                        </div>
                      {:else}
                        {#if i === 0}
                          <!-- First event: full-width pill with truncated title -->
                          <div
                            class={`h-[14px] lg:h-[18px] rounded-full px-1.5 lg:px-2 flex items-center self-start max-w-full ${badge.colorClass} ${badge.source === 'outlook' ? 'border border-dashed border-cyan-200/60 ring-1 ring-inset ring-cyan-100/35' : ''}`}
                            style={badge.colorStyle}
                            title={badge.source === 'outlook' ? `Outlook · ${badge.title}` : badge.title}
                          >
                            <span class="text-[8px] lg:text-[10px] font-semibold text-white/90 truncate leading-none">{badge.title}</span>
                          </div>
                        {:else}
                          <!-- Additional events: smaller pill -->
                          <div
                            class={`h-[12px] lg:h-[16px] rounded-full px-1.5 lg:px-2 flex items-center self-start max-w-full ${badge.colorClass} ${badge.source === 'outlook' ? 'border border-dashed border-cyan-200/60 ring-1 ring-inset ring-cyan-100/35' : ''}`}
                            style={badge.colorStyle}
                            title={badge.source === 'outlook' ? `Outlook · ${badge.title}` : badge.title}
                          >
                            <span class="text-[7px] lg:text-[9px] font-semibold text-white/75 truncate leading-none">{badge.title}</span>
                          </div>
                        {/if}
                      {/if}
                    {/each}
                    {#if overflow > 0}
                      <div class="h-[12px] lg:h-[16px] rounded-full bg-white/10 px-1.5 lg:px-2 flex items-center self-start">
                        <span class="text-[7px] lg:text-[9px] font-semibold text-white/50 leading-none">+{overflow}</span>
                      </div>
                    {/if}
                  </div>
                {/if}
              </button>
            {/each}
          </div>

          <!-- Multi-day bars (up to 2 lanes) -->
          {#if (weekSegments[wi]?.[0]?.length ?? 0) > 0}
            <div class="pointer-events-none absolute inset-x-0 top-[2px] lg:top-[4px] px-4 lg:px-8 z-20">
              <div class="grid grid-cols-7 gap-1.5 lg:gap-3">
                {#each weekSegments[wi]?.[0] ?? [] as seg (seg.key)}
                  <div
                    class={`h-[14px] lg:h-[18px] flex items-center overflow-hidden backdrop-blur-[1px] ${seg.isStart && seg.isEnd ? 'rounded-full' : seg.isStart ? 'rounded-l-full' : seg.isEnd ? 'rounded-r-full' : ''} ${seg.colorClass} ${seg.isOutlook ? 'border border-dashed border-cyan-200/60 ring-1 ring-inset ring-cyan-100/35' : ''}`}
                    style={`grid-column: ${seg.startCol} / ${seg.endCol + 1}; ${seg.colorStyle ?? ''}`}
                    title={seg.isOutlook ? `Outlook · ${seg.title}` : seg.title}
                  >
                    {#if seg.isStart}
                      <span class="text-[8px] lg:text-[10px] font-semibold text-white/90 truncate leading-none whitespace-nowrap pl-1.5 lg:pl-2 pr-1">{seg.title}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if (weekSegments[wi]?.[1]?.length ?? 0) > 0}
            <div class="pointer-events-none absolute inset-x-0 top-[18px] lg:top-[24px] px-4 lg:px-8 z-20">
              <div class="grid grid-cols-7 gap-1.5 lg:gap-3">
                {#each weekSegments[wi]?.[1] ?? [] as seg (seg.key)}
                  <div
                    class={`h-[14px] lg:h-[18px] flex items-center overflow-hidden backdrop-blur-[1px] ${seg.isStart && seg.isEnd ? 'rounded-full' : seg.isStart ? 'rounded-l-full' : seg.isEnd ? 'rounded-r-full' : ''} ${seg.colorClass} opacity-90 ${seg.isOutlook ? 'border border-dashed border-cyan-200/60 ring-1 ring-inset ring-cyan-100/35' : ''}`}
                    style={`grid-column: ${seg.startCol} / ${seg.endCol + 1}; ${seg.colorStyle ?? ''}`}
                    title={seg.isOutlook ? `Outlook · ${seg.title}` : seg.title}
                  >
                    {#if seg.isStart}
                      <span class="text-[8px] lg:text-[10px] font-semibold text-white/90 truncate leading-none whitespace-nowrap pl-1.5 lg:pl-2 pr-1">{seg.title}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {/key}
  </div>
</div>
