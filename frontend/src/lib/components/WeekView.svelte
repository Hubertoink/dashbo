<script lang="ts">
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { formatGermanShortDate, sameDay } from '$lib/date';
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  export let selectedDate: Date;
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let onSelect: (d: Date) => void;
  export let viewMode: 'agenda' | 'week' | 'month' = 'week';
  export let onSetViewMode: (m: 'agenda' | 'week' | 'month') => void;
  export let onEdit: (e: EventDto) => void;
  export let onCreate: (() => void) | null = null;
  export let onGoToSettings: (() => void) | null = null;

  let editPromptFor: string | null = null;
  let editPromptTimer: ReturnType<typeof setTimeout> | null = null;

  // Slide direction for week animation
  let slideDirection = 1;

  onDestroy(() => {
    if (editPromptTimer) clearTimeout(editPromptTimer);
  });

  function requestEdit(e: EventDto) {
    const key = e.occurrenceId ?? `${e.id}:${e.startAt}`;

    if (editPromptFor === key) {
      editPromptFor = null;
      if (editPromptTimer) {
        clearTimeout(editPromptTimer);
        editPromptTimer = null;
      }
      onEdit(e);
      return;
    }

    editPromptFor = key;
    if (editPromptTimer) clearTimeout(editPromptTimer);
    editPromptTimer = setTimeout(() => {
      editPromptFor = null;
      editPromptTimer = null;
    }, 3000);
  }

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

  function mondayStart(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const offset = (x.getDay() + 6) % 7; // Monday=0
    x.setDate(x.getDate() - offset);
    return x;
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

  function buildDays(weekStart: Date) {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      out.push(d);
    }
    return out;
  }

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTimeRange(startIso: string, endIso: string | null) {
    const start = fmtTime(startIso);
    if (endIso) return `${start} – ${fmtTime(endIso)}`;
    return start;
  }

  function shiftWeek(delta: number) {
    slideDirection = delta > 0 ? 1 : -1;
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + delta * 7);
    onSelect(next);
  }

  function jumpToToday() {
    const today = new Date();
    const currentWeekStart = mondayStart(selectedDate);
    const todayWeekStart = mondayStart(today);
    if (currentWeekStart.getTime() !== todayWeekStart.getTime()) {
      slideDirection = todayWeekStart > currentWeekStart ? 1 : -1;
    }
    onSelect(today);
  }

  $: weekStart = mondayStart(selectedDate);
  $: days = buildDays(weekStart);
  $: weekEnd = days[6] ?? new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  $: weekKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;

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
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
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
    for (const arr of m.values()) {
      arr.sort((a, b) => a.title.localeCompare(b.title));
    }
    return m;
  })();

  // Format short day name (MO, DI, MI...)
  function shortDayName(d: Date) {
    return d.toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase();
  }
</script>

<div class="h-full flex flex-col min-h-0">
  <!-- Header -->
  <div class="shrink-0 px-6 pt-6 pb-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="text-2xl md:text-3xl font-semibold tracking-wide">Dashbo</div>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class={`h-9 px-4 rounded-full text-sm font-medium transition-all duration-150 ${viewMode === 'agenda' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'}`}
        on:click={() => onSetViewMode('agenda')}
      >
        Agenda
      </button>
      <button
        type="button"
        class={`h-9 px-4 rounded-full text-sm font-medium transition-all duration-150 ${viewMode === 'week' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'}`}
        on:click={() => onSetViewMode('week')}
      >
        Woche
      </button>
      <button
        type="button"
        class={`h-9 px-4 rounded-full text-sm font-medium transition-all duration-150 ${viewMode === 'month' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'}`}
        on:click={() => onSetViewMode('month')}
      >
        Monat
      </button>
      {#if onGoToSettings}
        <button
          type="button"
          class="h-9 w-9 rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 transition-all duration-150 grid place-items-center ml-2"
          aria-label="Einstellungen"
          on:click={onGoToSettings}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Week Navigation -->
  <div class="shrink-0 px-6 pb-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/50 hover:text-white/80 transition-all grid place-items-center"
        aria-label="Vorherige Woche"
        on:click={() => shiftWeek(-1)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div class="text-lg font-medium text-white/90">
        {formatGermanShortDate(weekStart)} – {formatGermanShortDate(weekEnd)}
      </div>
      <button
        type="button"
        class="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 text-white/50 hover:text-white/80 transition-all grid place-items-center"
        aria-label="Nächste Woche"
        on:click={() => shiftWeek(1)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
    <button
      type="button"
      class="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-medium transition-all"
      on:click={jumpToToday}
    >
      Heute
    </button>
  </div>

  <!-- Week Grid - Full Height -->
  <div class="flex-1 min-h-0 px-4 pb-4 overflow-hidden relative">
    {#key weekKey}
    <div 
      class="h-full grid grid-cols-7 gap-2"
      in:fly={{ x: slideDirection * 50, duration: 200 }}
      out:fly|local={{ x: slideDirection * -50, duration: 180 }}
    >
      {#each days as d}
        {@const isSelected = sameDay(d, selectedDate)}
        {@const isToday = sameDay(d, new Date())}
        {@const dayEvents = eventsByDay.get(dateKey(d)) ?? []}
        {@const dayHolidays = holidaysByDay.get(dateKey(d)) ?? []}
        <div
          class={`h-full rounded-2xl border border-white/10 flex flex-col bg-black/30 backdrop-blur-sm transition overflow-hidden ${isToday ? 'ring-2 ring-emerald-400/50' : ''}`}
        >
          <!-- Day Header -->
          <button
            type="button"
            class={`shrink-0 px-3 py-3 flex flex-col items-center transition-all hover:bg-white/5 ${isSelected ? 'bg-white/10' : ''}`}
            on:click={() => onSelect(new Date(d))}
          >
            <div class="text-xs font-semibold tracking-wider text-white/60">{shortDayName(d)}</div>
            <div class={`text-2xl font-bold mt-1 ${isToday ? 'text-emerald-400' : ''}`}>{d.getDate()}.</div>
            {#if isToday}
              <div class="mt-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold tracking-wide">
                Heute
              </div>
            {/if}
          </button>

          <!-- Add Event Button -->
          {#if onCreate && isSelected}
            <button
              type="button"
              class="shrink-0 mx-2 mb-2 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-medium flex items-center justify-center gap-1 transition-all"
              on:click={onCreate}
              aria-label="Termin hinzufügen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          {/if}

          <!-- Events List -->
          <div class="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-1.5">
            {#if dayEvents.length === 0 && dayHolidays.length === 0}
              <div class="text-white/30 text-sm text-center py-2">—</div>
            {:else}
              {#each dayHolidays as h (h.date + ':' + h.title)}
                <div class="rounded-lg px-2 py-2 bg-white/5">
                  <div class="flex gap-2 items-start">
                    <div class="mt-1 h-2.5 w-2.5 rounded-full border border-white/60 shrink-0"></div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-semibold leading-tight line-clamp-2">{h.title}</div>
                    </div>
                  </div>
                </div>
              {/each}
              {#each dayEvents as e (e.occurrenceId ?? `${e.id}:${e.startAt}`)}
                {@const k = e.occurrenceId ?? `${e.id}:${e.startAt}`}
                {@const isPrompt = editPromptFor === k}
                {@const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : []}
                {@const p0 = ps[0]}
                <button
                  type="button"
                  class="w-full text-left rounded-lg px-2 py-2 hover:bg-white/10 active:bg-white/15 transition relative overflow-hidden bg-white/5"
                  on:click|stopPropagation={() => requestEdit(e)}
                >
                  {#if isPrompt}
                    <div class="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg" in:fade={{ duration: 120 }} out:fade={{ duration: 100 }}>
                      <span class="text-xs font-semibold">Bearbeiten?</span>
                    </div>
                  {/if}
                  <div class="flex gap-2 items-start">
                    <div
                      class={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
                        e.tag
                          ? isHexColor(e.tag.color)
                            ? 'bg-transparent'
                            : dotBg[e.tag.color as TagColorKey] ?? 'bg-white/25'
                          : p0
                            ? dotBg[p0.color as TagColorKey] ?? 'bg-white/25'
                            : 'bg-white/25'
                      }`}
                      style={e.tag && isHexColor(e.tag.color) ? `background-color: ${e.tag.color}` : ''}
                    ></div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-semibold leading-tight line-clamp-2">{e.title}</div>
                      <div class="text-[10px] text-white/60 leading-tight mt-0.5">
                        {e.allDay ? 'Ganztägig' : fmtTimeRange(e.startAt, e.endAt)}
                        {#if e.location}<span class="truncate"> · {e.location}</span>{/if}
                      </div>
                      {#if ps.length > 0}
                        <div class="text-[10px] text-white/50 leading-tight mt-0.5 truncate">
                          {#each ps as p, i (p.id)}{#if i > 0}, {/if}<span class={`${textFg[p.color as TagColorKey] ?? 'text-white/70'} font-medium`}>{p.name}</span>{/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/each}
    </div>
    {/key}
  </div>

  <!-- Bottom Navigation Hint -->
  <div class="shrink-0 px-6 py-3 border-t border-white/10 bg-black/20 backdrop-blur-md">
    <div class="flex items-center justify-center">
      <div class="text-sm text-white/40">
        ← Monat · Woche · Agenda →
      </div>
    </div>
  </div>
</div>
