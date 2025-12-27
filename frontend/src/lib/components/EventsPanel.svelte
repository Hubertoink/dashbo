<script lang="ts">
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { fade, fly } from 'svelte/transition';
  import { onDestroy } from 'svelte';
  import { formatGermanShortDate, sameDay, startOfDay, endOfDay } from '$lib/date';

  export let selectedDate: Date;
  export let events: EventDto[];
  export let holidays: HolidayDto[] = [];
  export let onCreate: () => void;
  export let onEdit: (e: EventDto) => void;

  let panelActivated = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  let editPromptFor: string | null = null;
  let editPromptTimer: ReturnType<typeof setTimeout> | null = null;

  $: isToday = sameDay(selectedDate, new Date());
  $: header = isToday ? 'HEUTE' : formatGermanShortDate(selectedDate);

  function open() {
    onCreate();
  }

  function activatePanel() {
    panelActivated = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      panelActivated = false;
      hideTimer = null;
    }, 10_000);
  }

  onDestroy(() => {
    if (hideTimer) clearTimeout(hideTimer);
    if (editPromptTimer) clearTimeout(editPromptTimer);
  });

  function requestEdit(e: EventDto) {
    if (e.source === 'outlook') return;
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

  $: dayStart = startOfDay(selectedDate);
  $: dayEnd = endOfDay(selectedDate);

  function dateKeyLocal(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  $: dayHolidays = holidays
    .filter((h) => {
      const hd = new Date(`${h.date}T00:00:00`);
      return dateKeyLocal(hd) === dateKeyLocal(selectedDate);
    })
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));

  $: dayEvents = events
    .filter((e) => {
      const s = new Date(e.startAt);
      const end = e.endAt ? new Date(e.endAt) : null;
      return s <= dayEnd && (!end || end >= dayStart);
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  $: hasAnyItems = dayEvents.length > 0 || dayHolidays.length > 0;

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTimeRange(startIso: string, endIso: string | null) {
    const start = fmtTime(startIso);
    if (endIso) return `${start} - ${fmtTime(endIso)} Uhr`;
    return `${start} Uhr`;
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

  function yyyymmddLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isMultiDayEvent(e: EventDto) {
    if (!e.endAt) return false;
    const s = new Date(e.startAt);
    const end = new Date(e.endAt);
    return yyyymmddLocal(s) !== yyyymmddLocal(end);
  }

  function fmtDateRange(e: EventDto) {
    if (!e.endAt) return '';
    const s = new Date(e.startAt);
    const end = new Date(e.endAt);
    return `${formatGermanShortDate(s)} – ${formatGermanShortDate(end)}`;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="h-full flex flex-col min-h-0 px-6 md:px-8 py-3" on:click={activatePanel}>
  <div class="flex items-end justify-between gap-6 shrink-0">
    <div class="grid">
      {#key header}
        <div
          class="text-4xl md:text-5xl font-semibold tracking-wide col-start-1 row-start-1"
          in:fly={{ y: 8, duration: 140 }}
          out:fade={{ duration: 120 }}
        >
          {header}
        </div>
      {/key}
    </div>

    {#if panelActivated}
      <div class="fixed right-6 bottom-6 z-40 flex flex-col items-center gap-2" in:fly={{ y: 10, duration: 180 }} out:fade={{ duration: 120 }}>
        <button
          type="button"
          class="h-14 w-14 rounded-2xl bg-white/15 hover:bg-white/20 active:bg-white/25 active:scale-95 backdrop-blur-md text-3xl font-semibold transition-all duration-150"
          aria-label="Neuen Termin"
          on:click|stopPropagation={open}
        >
          +
        </button>
        <a
          href="/settings"
          class="h-14 w-14 rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 active:scale-95 backdrop-blur-md transition-all duration-150 grid place-items-center"
          aria-label="Settings"
          on:click|stopPropagation
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      </div>
    {/if}
  </div>

  <div class="mt-4 flex-1 min-h-0 overflow-hidden">
    <div class="grid h-full">
      {#key selectedDate.toDateString()}
        <div class="col-start-1 row-start-1 h-full" in:fade={{ duration: 180 }} out:fade={{ duration: 160 }}>
          <div class="h-full overflow-y-auto pr-1">
            {#if !hasAnyItems}
              <div class="text-white/70 text-base">Keine Termine.</div>
            {:else}
              <div class="space-y-4">
                {#each dayHolidays as h (h.date + ':' + h.title)}
                  <div class="w-fit max-w-full text-left relative" in:fly={{ y: 6, duration: 140 }}>
                    <div class="flex items-start gap-4">
                      <div class="mt-2 flex items-center gap-2">
                        <div class="h-4 w-4 rounded-full border border-white/60"></div>
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                          <div class="text-2xl md:text-3xl font-semibold leading-tight truncate">{h.title}</div>
                        </div>
                        <div class="text-white/70 text-base md:text-lg leading-tight">
                          <span class="text-white/60">Feiertag</span> | <span class="text-white/60">Ganztägig</span>
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}

                {#each dayEvents as e, idx}
                  {@const k = e.occurrenceId ?? `${e.id}:${e.startAt}`}
                  {@const isPrompt = editPromptFor === k}
                  <button
                    type="button"
                    class="w-fit max-w-full text-left relative"
                    on:click|stopPropagation={() => requestEdit(e)}
                    in:fly={{ y: 6, duration: 140 }}
                  >
                    <div class="flex items-start gap-4">
                      <div class="mt-2 flex items-center gap-2">
                        <div
                          class={`h-4 w-4 rounded-full ${e.tag ? (dotBg[e.tag.color] ?? 'bg-white/25') : e.person ? (dotBg[e.person.color] ?? 'bg-white/25') : 'bg-white/25'}`}
                        ></div>
                      </div>
                      <div class="flex-1 min-w-0 relative">
                        {#if isPrompt}
                          <div class="absolute left-0 top-0 z-10" in:fly={{ y: -6, duration: 160 }} out:fade={{ duration: 120 }}>
                            <div class="px-5 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md text-2xl font-semibold">Bearbeiten?</div>
                          </div>
                        {/if}

                        <div class={isPrompt ? 'blur-sm' : ''}>
                          <div class="flex items-center gap-2 min-w-0">
                            <div class="text-2xl md:text-3xl font-semibold leading-tight truncate">{e.title}</div>
                            {#if e.recurrence?.freq}
                              <svg
                                class="shrink-0 text-white/60"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-label="Wiederholung"
                              >
                                <path d="M21 12a9 9 0 1 1-3-6.7" />
                                <path d="M21 3v6h-6" />
                              </svg>
                            {/if}
                          </div>

                          <div class="text-white/70 text-base md:text-lg leading-tight">
                            {#if isMultiDayEvent(e)}
                              <span class="text-white/70">{fmtDateRange(e)} | </span>
                            {/if}

                            {#if e.allDay}
                              <span class="text-white/60">Ganztägig</span>
                            {:else}
                              {fmtTimeRange(e.startAt, e.endAt)}
                            {/if}
                            {#if e.location} | {e.location}{/if}
                            {#if e.tag} | {e.tag.name}{/if}
                            {#if e.person}
                              <span>
                                | <span class={`${textFg[e.person.color] ?? 'text-white/80'} font-semibold`}>{e.person.name}</span>
                              </span>
                            {/if}
                          </div>

                          {#if e.description}
                            <div class="text-white/60 text-base leading-tight mt-1">{e.description}</div>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/key}
    </div>
  </div>
</div>
