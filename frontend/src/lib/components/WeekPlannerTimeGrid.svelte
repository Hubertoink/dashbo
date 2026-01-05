<script lang="ts">
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { deleteEvent } from '$lib/api';
  import { formatGermanDayLabel, sameDay } from '$lib/date';
  import { fade, scale } from 'svelte/transition';
  import { layoutWeekTimedSegments, type PositionedSegment, type WeekPlannerConfig } from '$lib/weekPlannerLayout';
  import type { EventSuggestionDto } from './WeekPlannerDay.svelte';

  export let days: Date[] = [];
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let suggestions: EventSuggestionDto[] = [];
  export let onAddEvent: (d: Date) => void;
  export let onEditEvent: (e: EventDto) => void;
  export let onEventDeleted: () => void = () => {};
  export let onAcceptSuggestion: (s: EventSuggestionDto) => void = () => {};
  export let onDismissSuggestion: (s: EventSuggestionDto) => void = () => {};

  const config: WeekPlannerConfig = {
    startHour: 6,
    endHour: 22,
    defaultDurationMinutes: 60,
    pxPerMinute: 1.8,
    snapMinutes: 15
  };

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

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && hexRe.test(value);
  }

  function hexToRgba(hex: string, alpha: number): string {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function startOfLocalDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dateKey(d: Date): number {
    return startOfLocalDay(d).getTime();
  }

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTimeRange(startIso: string, endIso: string | null): string {
    const start = fmtTime(startIso);
    if (endIso) return `${start} – ${fmtTime(endIso)}`;
    return start;
  }

  function fmtSuggestionTime(s: EventSuggestionDto): string {
    if (s.allDay) return 'Ganztägig';
    return fmtTimeRange(s.startAt, s.endAt);
  }

  function eventBaseColor(e: EventDto): string | null {
    const tagColor = e.tag?.color;
    if (tagColor && typeof tagColor === 'string') return tagColor;
    const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : [];
    const p0 = ps[0];
    return p0?.color ?? null;
  }

  function suggestionBaseColor(s: EventSuggestionDto): string | null {
    const tagColor = s.tag?.color;
    if (tagColor && typeof tagColor === 'string') return tagColor;
    const ps = s.persons && s.persons.length > 0 ? s.persons : s.person ? [s.person] : [];
    const p0 = ps[0];
    return (p0 as any)?.color ?? null;
  }

  function eventTileStyle(color: string | null): string {
    if (!color) return '';
    if (isHexColor(color)) {
      return `background-color: ${hexToRgba(color, 0.18)}; border-color: ${hexToRgba(color, 0.35)};`;
    }
    // palette key -> keep to existing tokens; use border only, bg via tailwind class
    return '';
  }

  function eventTileBgClass(color: string | null): string {
    if (!color) return 'bg-white/5 border-white/10';
    if (isHexColor(color)) return 'bg-white/5';
    const key = color as TagColorKey;
    return `${dotBg[key] ?? 'bg-white/10'}/15 border-white/10`;
  }

  $: holidaysByDay = (() => {
    const m = new Map<number, HolidayDto[]>();
    for (const h of holidays) {
      const d = new Date(`${h.date}T00:00:00`);
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(h);
      m.set(k, arr);
    }
    return m;
  })();

  $: allDayByDay = (() => {
    const m = new Map<number, EventDto[]>();
    for (const e of events) {
      if (!e.allDay) continue;
      const start = startOfLocalDay(new Date(e.startAt));
      const end = e.endAt ? startOfLocalDay(new Date(e.endAt)) : start;
      const maxSpanDays = 62;
      const spanDays = Math.min(
        maxSpanDays,
        Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)))
      );
      for (let i = 0; i <= spanDays; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
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

  $: timedByDay = layoutWeekTimedSegments(events, days, config);

  $: suggestionsByDay = (() => {
    const m = new Map<number, EventSuggestionDto[]>();
    for (const s of suggestions) {
      const d = startOfLocalDay(new Date(s.startAt));
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return m;
  })();

  const totalMinutes = (config.endHour - config.startHour) * 60;
  const gridHeightPx = totalMinutes * config.pxPerMinute;
  const hours: number[] = Array.from({ length: config.endHour - config.startHour + 1 }, (_, i) => config.startHour + i);

  let deleteConfirmEvent: EventDto | null = null;
  let deleting = false;

  function requestDelete(event: EventDto) {
    deleteConfirmEvent = event;
  }

  async function confirmDelete() {
    if (!deleteConfirmEvent || deleting) return;
    deleting = true;
    try {
      await deleteEvent(deleteConfirmEvent.id);
      deleteConfirmEvent = null;
      onEventDeleted();
    } catch (err) {
      console.error('Delete event failed:', err);
    } finally {
      deleting = false;
    }
  }

  function cancelDelete() {
    deleteConfirmEvent = null;
  }

  function isContinuation(event: EventDto, day: Date): boolean {
    return !sameDay(new Date(event.startAt), day);
  }

  function segmentStyle(seg: PositionedSegment): string {
    const top = seg.startMin * config.pxPerMinute;
    const height = Math.max(18, (seg.endMin - seg.startMin) * config.pxPerMinute);
    const widthPct = 100 / seg.colCount;
    const leftPct = seg.colIndex * widthPct;
    return `top: ${top}px; height: ${height}px; left: ${leftPct}%; width: ${widthPct}%;`;
  }
</script>

<div class="h-full flex flex-col rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
  <!-- All-day lane: headers + all-day events -->
  <div class="border-b border-white/10">
    <div class="grid" style="grid-template-columns: 56px repeat(7, minmax(0, 1fr));">
      <div class="px-2 py-2"></div>
      {#each days as day (dateKey(day))}
        {@const k = dateKey(day)}
        {@const isToday = sameDay(day, new Date())}
        {@const holidayName = (holidaysByDay.get(k) ?? [])[0]?.title ?? ''}
        <div class={`px-2 py-2 border-l border-white/10 ${isToday ? 'bg-white/5' : ''}`}>
          <div class="flex items-baseline justify-between">
            <span class="text-xs font-semibold tracking-wide">{formatGermanDayLabel(day)}</span>
            <span class={`text-sm font-bold ${isToday ? 'text-white' : 'text-white/80'}`}>{day.getDate()}.</span>
          </div>
          {#if holidayName}
            <div class="text-[11px] text-amber-300/80 truncate mt-0.5" title={holidayName}>{holidayName}</div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="grid" style="grid-template-columns: 56px repeat(7, minmax(0, 1fr));">
      <div class="px-2 py-2 text-[11px] text-white/45">Ganzt.</div>
      {#each days as day (dateKey(day))}
        {@const k = dateKey(day)}
        {@const allDayEvents = allDayByDay.get(k) ?? []}
        {@const daySuggestions = suggestionsByDay.get(k) ?? []}
        <div class="px-2 py-2 border-l border-white/10 min-h-[64px]">
          <div class="space-y-1 max-h-[88px] overflow-y-auto pr-1">
            {#each allDayEvents as e (e.occurrenceId ?? `${e.id}:${e.startAt}`)}
              {@const color = eventBaseColor(e)}
              {@const cont = isContinuation(e, day)}
              <div class="relative">
                <button
                  type="button"
                  class={`w-full text-left rounded-lg px-2 py-1.5 pr-9 border text-xs transition active:scale-[0.99] ${eventTileBgClass(color)} ${cont ? 'border-dashed opacity-90' : ''}`}
                  style={eventTileStyle(color)}
                  on:click|stopPropagation={() => onEditEvent(e)}
                >
                  <div class="truncate font-medium">{e.title}</div>
                </button>
                <button
                  type="button"
                  class="absolute top-1 right-1 h-6 w-6 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 transition grid place-items-center text-white/60 hover:text-rose-300"
                  aria-label="Termin löschen"
                  title="Löschen"
                  on:click|stopPropagation={() => requestDelete(e)}
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            {/each}

            {#each daySuggestions as s (s.suggestionKey)}
              {@const color = suggestionBaseColor(s)}
              <div class="relative">
                <button
                  type="button"
                  class={`w-full text-left rounded-lg px-2 py-1.5 pr-16 border text-xs transition active:scale-[0.99] ${eventTileBgClass(color)} border-dashed opacity-90`}
                  style={eventTileStyle(color)}
                  on:click|stopPropagation={() => onAcceptSuggestion(s)}
                  title="Vorschlag übernehmen"
                >
                  <div class="truncate font-medium">{s.title}</div>
                  <div class="text-[11px] text-white/60 truncate mt-0.5">{fmtSuggestionTime(s)}</div>
                </button>

                <button
                  type="button"
                  class="absolute top-1 right-1 h-6 w-6 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 transition grid place-items-center text-white/60"
                  aria-label="Vorschlag ausblenden"
                  title="Ausblenden"
                  on:click|stopPropagation={() => onDismissSuggestion(s)}
                >
                  ✕
                </button>

                <button
                  type="button"
                  class="absolute top-1 right-8 h-6 px-2 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 transition text-[11px] font-semibold text-white/75"
                  aria-label="Vorschlag übernehmen"
                  title="Übernehmen"
                  on:click|stopPropagation={() => onAcceptSuggestion(s)}
                >
                  +
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Time grid (shared scroll) -->
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="grid" style="grid-template-columns: 56px repeat(7, minmax(0, 1fr));">
      <!-- Time labels -->
      <div class="relative" style={`height: ${gridHeightPx}px;`}>
        {#each hours as h (h)}
          {@const y = (h - config.startHour) * 60 * config.pxPerMinute}
          <div class="absolute left-0 right-0" style={`top: ${y}px;`}>
            <div class="-mt-2 px-2 text-[11px] text-white/45">{String(h).padStart(2, '0')}:00</div>
          </div>
        {/each}
      </div>

      <!-- Day columns -->
      {#each days as day (dateKey(day))}
        {@const k = dateKey(day)}
        {@const segs = timedByDay.get(k) ?? []}
        <div
          class="relative border-l border-white/10"
          style={`height: ${gridHeightPx}px;`}
          role="button"
          tabindex="0"
          on:click={() => onAddEvent(day)}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAddEvent(day);
            }
          }}
        >
          <!-- grid lines -->
          {#each hours as h (h)}
            {@const y = (h - config.startHour) * 60 * config.pxPerMinute}
            <div class="absolute left-0 right-0 border-t border-white/5" style={`top: ${y}px;`}></div>
          {/each}

          {#each segs as seg (seg.event.occurrenceId ?? `${seg.event.id}:${seg.event.startAt}:${k}:${seg.startMin}`)}
            {@const e = seg.event}
            {@const color = eventBaseColor(e)}
            <div class="absolute px-1" style={segmentStyle(seg)}>
              <div class="relative h-full">
                <button
                  type="button"
                  class={`w-full h-full text-left rounded-xl px-2 py-1.5 pr-9 border text-xs leading-tight transition active:scale-[0.99] ${eventTileBgClass(color)} ${seg.isContinuation ? 'border-dashed opacity-90' : ''}`}
                  style={eventTileStyle(color)}
                  on:click|stopPropagation={() => onEditEvent(e)}
                >
                  <div class="font-semibold truncate">{e.title}</div>
                  <div class="text-[11px] text-white/60 truncate mt-0.5">{fmtTimeRange(e.startAt, e.endAt)}</div>
                </button>

                <button
                  type="button"
                  class="absolute top-1 right-1 h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 transition grid place-items-center text-white/60 hover:text-rose-300"
                  aria-label="Termin löschen"
                  title="Löschen"
                  on:click|stopPropagation={() => requestDelete(e)}
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- Delete Confirmation Modal -->
{#if deleteConfirmEvent}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    on:click|self={cancelDelete}
    on:keydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelDelete();
      }
    }}
    role="dialog"
    aria-modal="true"
    tabindex="0"
  >
    <div
      class="mx-4 max-w-sm w-full bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
      in:scale={{ start: 0.9, duration: 200 }}
      out:scale={{ start: 0.9, duration: 150 }}
    >
      <div class="p-5 text-center">
        <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/20 flex items-center justify-center">
          <svg class="w-7 h-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>
        <h3 class="text-lg font-semibold mb-1">Termin löschen?</h3>
        <p class="text-sm text-white/60 mb-1 truncate px-2">„{deleteConfirmEvent.title}"</p>
        <p class="text-xs text-white/40">Diese Aktion kann nicht rückgängig gemacht werden.</p>
      </div>
      <div class="flex border-t border-white/10">
        <button
          type="button"
          class="flex-1 py-3 text-center font-medium text-white/70 hover:bg-white/5 active:bg-white/10 transition"
          on:click={cancelDelete}
          disabled={deleting}
        >
          Abbrechen
        </button>
        <button
          type="button"
          class="flex-1 py-3 text-center font-semibold text-rose-300 hover:bg-rose-500/10 active:bg-rose-500/20 transition"
          on:click={confirmDelete}
          disabled={deleting}
        >
          {deleting ? 'Löschen…' : 'Löschen'}
        </button>
      </div>
    </div>
  </div>
{/if}
