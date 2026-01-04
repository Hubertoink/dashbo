<script lang="ts">
  import type { EventDto, HolidayDto, TagColorKey, TodoItemDto } from '$lib/api';
  import { deleteEvent } from '$lib/api';
  import { formatGermanDayLabel } from '$lib/date';
  import { fade, scale } from 'svelte/transition';

  export type EventSuggestionDto = {
    suggestionKey: string;
    title: string;
    startAt: string;
    endAt: string | null;
    allDay: boolean;
    tag: EventDto['tag'];
    person: EventDto['person'];
    persons?: EventDto['persons'];
  };

  export let day: Date;
  export let isToday = false;
  export let events: EventDto[] = [];
  export let suggestions: EventSuggestionDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let todos: TodoItemDto[] = [];
  export let outlookConnected = false;
  export let onAddEvent: () => void;
  export let onEditEvent: (e: EventDto) => void;
  export let onAcceptSuggestion: (s: EventSuggestionDto) => void;
  export let onEventDeleted: () => void = () => {};
  export let onToggleTodo: (t: TodoItemDto) => void = () => {};

  let deleteConfirmEvent: EventDto | null = null;
  let deleting = false;

  function haptic(pattern: number | number[] = 10) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }

  function requestDelete(event: EventDto) {
    haptic([20, 30]);
    deleteConfirmEvent = event;
  }

  async function confirmDelete() {
    if (!deleteConfirmEvent || deleting) return;
    deleting = true;
    haptic(15);

    try {
      await deleteEvent(deleteConfirmEvent.id);
      haptic([10, 50, 10]);
      deleteConfirmEvent = null;
      onEventDeleted();
    } catch (err) {
      console.error('Delete event failed:', err);
      haptic([50, 30, 50, 30, 50]);
    } finally {
      deleting = false;
    }
  }

  function cancelDelete() {
    deleteConfirmEvent = null;
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
  on:click={onAddEvent}
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAddEvent();
    }
  }}
  role="button"
  tabindex="0"
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
    {#each suggestions as s (s.suggestionKey)}
      {@const ps = s.persons && s.persons.length > 0 ? s.persons : s.person ? [s.person] : []}
      {@const p0 = ps[0]}
      {@const tagColor = s.tag?.color}
      <div class="relative">
        <button
          type="button"
          class="w-full text-left rounded-xl px-2.5 py-2 pr-3 bg-white/5 border border-white/15 border-dashed hover:bg-white/10 active:bg-white/15 active:scale-[0.98] transition group touch-manipulation select-none opacity-70 hover:opacity-100"
          style="-webkit-touch-callout: none;"
          on:click|stopPropagation={() => onAcceptSuggestion(s)}
        >
          <div class="flex gap-2 items-start">
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
                {s.title}
                <span class="text-white/40 text-xs font-normal"> · Vorschlag</span>
              </div>
              <div class="text-xs text-white/60 leading-tight mt-0.5">
                {#if s.allDay}
                  Ganztägig
                {:else}
                  {fmtTimeRange(s.startAt, s.endAt)}
                {/if}
              </div>
              {#if ps.length > 0}
                <div class="text-xs mt-0.5">
                  {#each ps as p, i (p.id)}
                    {@const pc = p.color as string}
                    <span
                      class={`${!isHexColor(pc) ? (textFg[pc as TagColorKey] ?? 'text-white/70') : 'text-white/70'} font-medium`}
                      style={isHexColor(pc) ? `color: ${pc}` : ''}
                    >
                      {p.name}{#if i < ps.length - 1}, {/if}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </button>
      </div>
    {/each}

    {#each events as e (e.occurrenceId ?? `${e.id}:${e.startAt}`)}
      {@const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : []}
      {@const p0 = ps[0]}
      {@const tagColor = e.tag?.color}
      <div class="relative">
        <button
          type="button"
          class="w-full text-left rounded-xl px-2.5 py-2 pr-10 bg-white/5 hover:bg-white/10 active:bg-white/15 active:scale-[0.98] transition group touch-manipulation select-none"
          style="-webkit-touch-callout: none;"
          on:click|stopPropagation={() => onEditEvent(e)}
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
                    {@const pc = p.color as string}
                    <span
                      class={`${!isHexColor(pc) ? (textFg[pc as TagColorKey] ?? 'text-white/70') : 'text-white/70'} font-medium`}
                      style={isHexColor(pc) ? `color: ${pc}` : ''}
                    >
                      {p.name}{#if i < ps.length - 1}, {/if}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </button>

        <button
          type="button"
          class="absolute top-1.5 right-1.5 h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 transition grid place-items-center text-white/60 hover:text-rose-300"
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
    {/each}

    {#if events.length === 0 && suggestions.length === 0 && holidays.length === 0}
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
        <button
          type="button"
          class="w-full flex items-center gap-2 px-1 py-1 text-xs text-left rounded-lg hover:bg-white/5 active:bg-white/10 transition"
          on:click|stopPropagation={() => onToggleTodo(t)}
        >
          <span class={`w-3 h-3 rounded border ${t.completed ? 'bg-emerald-500/50 border-emerald-400' : 'border-white/30'}`}></span>
          <span class={`truncate ${t.completed ? 'line-through text-white/40' : 'text-white/80'}`}>{t.title}</span>
        </button>
      {/each}
      {#if todos.length > 3}
        <div class="text-xs text-white/40 px-1">+{todos.length - 3} weitere</div>
      {/if}
    </div>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if deleteConfirmEvent}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    on:click|self={cancelDelete}
    role="dialog"
    aria-modal="true"
  >
    <div
      class="mx-4 max-w-sm w-full bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
      in:scale={{ start: 0.9, duration: 200 }}
      out:scale={{ start: 0.9, duration: 150 }}
    >
      <div class="p-5 text-center">
        <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/20 flex items-center justify-center">
          <svg class="w-7 h-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
        >
          Abbrechen
        </button>
        <button
          type="button"
          class="flex-1 py-3 text-center font-semibold text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 transition border-l border-white/10"
          on:click={confirmDelete}
          disabled={deleting}
        >
          {#if deleting}
            Löschen…
          {:else}
            Löschen
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
