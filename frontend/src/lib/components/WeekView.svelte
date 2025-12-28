<script lang="ts">
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { formatGermanDayLabel, formatGermanShortDate, sameDay, formatMonthTitle } from '$lib/date';
  import { onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  export let selectedDate: Date;
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let onSelect: (d: Date) => void;
  export let viewMode: 'month' | 'week' = 'week';
  export let onSetViewMode: (m: 'month' | 'week') => void;
  export let onEdit: (e: EventDto) => void;

  let editPromptFor: string | null = null;
  let editPromptTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (endIso) return `${start} - ${fmtTime(endIso)} Uhr`;
    return `${start} Uhr`;
  }

  function shiftWeek(delta: number) {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + delta * 7);
    onSelect(next);
  }

  $: weekStart = mondayStart(selectedDate);
  $: days = buildDays(weekStart);
  $: weekEnd = days[6] ?? new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  $: monthTitle = formatMonthTitle(selectedDate);

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
</script>

<div class="h-full p-4 md:p-6 flex flex-col min-h-0">
  <div class="flex items-center justify-between gap-4">
    <div>
      <div class="flex items-center gap-3">
        <div class="text-2xl md:text-3xl font-semibold tracking-wide">{monthTitle}</div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class={`h-9 w-9 rounded-xl transition-all duration-150 grid place-items-center ${viewMode === 'month' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'}`}
            aria-label="Monat"
            on:click={() => onSetViewMode('month')}
          >
            <span class="text-xl leading-none">_</span>
          </button>

          <button
            type="button"
            class={`h-9 w-9 rounded-xl transition-all duration-150 grid place-items-center ${viewMode === 'week' ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'}`}
            aria-label="Woche"
            on:click={() => onSetViewMode('week')}
          >
            <span class="text-xl leading-none">|</span>
          </button>
        </div>
      </div>

      <div class="text-white/70 mt-1">
        {formatGermanShortDate(weekStart)} – {formatGermanShortDate(weekEnd)}
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button class="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition" type="button" on:click={() => shiftWeek(-1)}>
        ←
      </button>
      <button class="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition" type="button" on:click={() => shiftWeek(1)}>
        →
      </button>
    </div>
  </div>

  <div class="mt-4 flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
    {#each days as d}
      {@const isSelected = sameDay(d, selectedDate)}
      {@const isToday = sameDay(d, new Date())}
      {@const dayEvents = eventsByDay.get(dateKey(d)) ?? []}
      {@const dayHolidays = holidaysByDay.get(dateKey(d)) ?? []}
      <div
        class={`rounded-2xl border border-white/10 p-3 min-h-0 flex flex-col bg-black/20 transition ${isSelected ? 'bg-white/10' : ''} ${isToday ? 'ring-2 ring-white/20' : ''}`}
      >
        <button
          type="button"
          class="flex items-baseline justify-between text-left rounded-xl px-2 py-2 hover:bg-white/5 active:bg-white/10 active:scale-[0.99] transition"
          on:click={() => onSelect(new Date(d))}
        >
          <div class="text-sm font-semibold tracking-wide">{formatGermanDayLabel(d)}</div>
          <div class="text-sm text-white/70">{d.getDate()}.</div>
        </button>

        <div class="mt-2 px-2 pb-1 flex-1 min-h-0 overflow-y-auto space-y-2">
          {#if dayEvents.length === 0 && dayHolidays.length === 0}
            <div class="text-white/50 text-sm">—</div>
          {:else}
            {#each dayHolidays as h (h.date + ':' + h.title)}
              <div class="w-full text-left rounded-xl px-2 py-2 bg-white/0">
                <div class="flex gap-2">
                  <div class="mt-1 h-3 w-3 rounded-full border border-white/60 shrink-0"></div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-semibold leading-tight truncate">{h.title}</div>
                    <div class="text-xs text-white/70 leading-tight">Feiertag | Ganztägig</div>
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
                  class="w-full text-left rounded-xl px-2 py-2 hover:bg-white/5 active:bg-white/10 transition relative overflow-hidden"
                  on:click|stopPropagation={() => requestEdit(e)}
                >
                  <div class="flex gap-2">
                    <div
                      class={`mt-1 h-3 w-3 rounded-full ${
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
                    <div class="min-w-0 relative flex-1">
                      {#if isPrompt}
                        <div class="absolute left-0 top-0 z-10" in:fly={{ y: -4, duration: 140 }} out:fade={{ duration: 120 }}>
                          <div class="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-sm font-semibold">
                            Bearbeiten?
                          </div>
                        </div>
                      {/if}

                      <div class={isPrompt ? 'blur-sm' : ''}>
                        <div class="text-sm font-semibold leading-tight truncate">{e.title}</div>
                        <div class="text-xs text-white/70 leading-tight">
                        {e.allDay ? 'Ganztägig' : fmtTimeRange(e.startAt, e.endAt)}
                        {#if e.location} | {e.location}{/if}
                        {#if ps.length > 0}
                          <span>
                            | <span class={`${p0 ? textFg[p0.color] ?? 'text-white/80' : 'text-white/80'} font-semibold`}>{ps.map((p) => p.name).join(', ')}</span>
                          </span>
                        {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
            {/each}
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
