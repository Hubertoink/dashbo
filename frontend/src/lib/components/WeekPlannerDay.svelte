<script lang="ts">
  import type { EventDto, HolidayDto, TagColorKey, TodoItemDto } from '$lib/api';
  import { formatGermanDayLabel } from '$lib/date';
  import { fade, fly } from 'svelte/transition';

  export let day: Date;
  export let isToday = false;
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let todos: TodoItemDto[] = [];
  export let outlookConnected = false;
  export let onAddEvent: () => void;
  export let onEditEvent: (e: EventDto) => void;

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

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTimeRange(startIso: string, endIso: string | null): string {
    const start = fmtTime(startIso);
    if (endIso) return `${start} – ${fmtTime(endIso)}`;
    return start;
  }

  $: dayLabel = formatGermanDayLabel(day);
  $: dateNum = day.getDate();
  $: hasHoliday = holidays.length > 0;
  $: holidayName = holidays[0]?.title ?? '';
</script>

<div
  class={`flex flex-col rounded-2xl border transition-all h-full ${
    isToday
      ? 'border-white/30 bg-white/10 ring-2 ring-white/20'
      : 'border-white/10 bg-black/20 hover:bg-black/30'
  }`}
>
  <!-- Day Header -->
  <div class="px-3 py-2 border-b border-white/10">
    <div class="flex items-baseline justify-between">
      <span class="text-sm font-semibold tracking-wide">{dayLabel}</span>
      <span class={`text-lg font-bold ${isToday ? 'text-white' : 'text-white/80'}`}>{dateNum}.</span>
    </div>
    {#if hasHoliday}
      <div class="text-xs text-amber-300/80 truncate mt-0.5" title={holidayName}>
        {holidayName}
      </div>
    {/if}
  </div>

  <!-- Events List -->
  <div class="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1.5">
    {#each events as e (e.occurrenceId ?? `${e.id}:${e.startAt}`)}
      {@const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : []}
      {@const p0 = ps[0]}
      {@const tagColor = e.tag?.color}
      <button
        type="button"
        class="w-full text-left rounded-xl px-2.5 py-2 bg-white/5 hover:bg-white/10 active:bg-white/15 active:scale-[0.98] transition group"
        on:click={() => onEditEvent(e)}
      >
        <div class="flex gap-2 items-start">
          <!-- Color dot -->
          <div
            class={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${
              tagColor
                ? isHexColor(tagColor)
                  ? ''
                  : dotBg[tagColor as TagColorKey] ?? 'bg-white/40'
                : p0
                  ? dotBg[p0.color as TagColorKey] ?? 'bg-white/40'
                  : 'bg-white/40'
            }`}
            style={tagColor && isHexColor(tagColor) ? `background-color: ${tagColor}` : ''}
          ></div>

          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium leading-tight truncate group-hover:text-white transition">
              {e.title}
            </div>
            <div class="text-xs text-white/60 leading-tight mt-0.5">
              {#if e.allDay}
                Ganztägig
              {:else}
                {fmtTimeRange(e.startAt, e.endAt)}
              {/if}
              {#if e.location}
                <span class="text-white/40"> · {e.location}</span>
              {/if}
            </div>
            {#if ps.length > 0}
              <div class="text-xs mt-0.5">
                {#each ps as p, i (p.id)}
                  <span class={`${textFg[p.color] ?? 'text-white/70'} font-medium`}>
                    {p.name}{#if i < ps.length - 1}, {/if}
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </button>
    {/each}

    {#if events.length === 0 && holidays.length === 0}
      <div class="text-center text-white/40 text-sm py-4">
        Keine Termine
      </div>
    {/if}
  </div>

  <!-- ToDos Section (if Outlook connected) -->
  {#if outlookConnected && todos.length > 0}
    <div class="px-2 py-2 border-t border-white/10">
      <div class="text-xs text-white/50 mb-1 px-1">ToDos</div>
      {#each todos.slice(0, 3) as t (t.taskId)}
        <div class="flex items-center gap-2 px-1 py-1 text-xs">
          <span class={`w-3 h-3 rounded border ${t.completed ? 'bg-emerald-500/50 border-emerald-400' : 'border-white/30'}`}></span>
          <span class={`truncate ${t.completed ? 'line-through text-white/40' : 'text-white/80'}`}>{t.title}</span>
        </div>
      {/each}
      {#if todos.length > 3}
        <div class="text-xs text-white/40 px-1">+{todos.length - 3} weitere</div>
      {/if}
    </div>
  {/if}

  <!-- Add Button -->
  <div class="px-2 py-2 border-t border-white/10">
    <button
      type="button"
      class="w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 active:scale-[0.98] transition flex items-center justify-center gap-2 text-white/60 hover:text-white/80"
      on:click={onAddEvent}
    >
      <span class="text-xl leading-none">+</span>
      <span class="text-sm">Hinzufügen</span>
    </button>
  </div>
</div>
