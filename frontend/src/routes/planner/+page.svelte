<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  import {
    createEvent,
    fetchEvents,
    fetchSettings,
    getStoredToken,
    listPersons,
    listTags,
    type EventDto,
    type PersonDto,
    type SettingsDto,
    type TagColorKey,
    type TagDto
  } from '$lib/api';
  import { daysForMonthGrid, formatGermanDayLabel, formatMonthTitle, startOfDay, endOfDay, sameDay } from '$lib/date';

  type ViewMode = 'agenda' | 'month';

  let view: ViewMode = 'agenda';

  let selectedDate = new Date();
  let monthAnchor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  let agendaLoading = false;
  let monthLoading = false;
  let agendaError: string | null = null;
  let monthError: string | null = null;

  let agendaEvents: EventDto[] = [];
  let monthEvents: EventDto[] = [];

  // Background (match dashboard setting)
  let backgroundUrl = '/background.jpg';
  const bgOverlay = 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.70) 100%)';

  // Tags/persons for quick add
  let tags: TagDto[] = [];
  let persons: PersonDto[] = [];
  let metaLoading = false;
  let metaError: string | null = null;

  // Quick add
  let creating = false;
  let createError: string | null = null;
  let newTitle = '';
  let newDate = toDateInputValue(selectedDate);
  let newAllDay = false;
  let newStartTime = roundToNextHalfHourTime(new Date());
  let newEndTime = '';
  let newTagIdStr = '';
  let newPersonIds: number[] = [];

  let tagMenuOpen = false;
  let personMenuOpen = false;

  const tagBg: Record<TagColorKey, string> = {
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

  $: newTagId = newTagIdStr ? Number(newTagIdStr) : null;
  $: selectedTag = newTagId != null ? tags.find((t) => t.id === newTagId) : undefined;

  $: selectedPersons = persons.filter((p) => newPersonIds.includes(p.id));
  $: selectedPersonLabel =
    selectedPersons.length === 0
      ? 'Keine Person'
      : selectedPersons.length === 1
        ? selectedPersons[0]?.name ?? '1 Person'
        : `${selectedPersons.length} Personen`;
  $: primaryPerson = selectedPersons[0];

  // Event modal
  let openEvent: EventDto | null = null;

  const weekDays = [
    new Date(2024, 0, 1),
    new Date(2024, 0, 2),
    new Date(2024, 0, 3),
    new Date(2024, 0, 4),
    new Date(2024, 0, 5),
    new Date(2024, 0, 6),
    new Date(2024, 0, 7)
  ];

  function addDays(d: Date, delta: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + delta);
    return x;
  }

  function toDateInputValue(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseDateInputValue(v: string): Date | null {
    if (!v) return null;
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(v);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(y, mo, day);
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }

  function parseTime(v: string): { h: number; m: number } | null {
    if (!v) return null;
    const m = /^([0-9]{2}):([0-9]{2})$/.exec(v);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, m: min };
  }

  function toLocalDateTime(date: Date, time: { h: number; m: number }): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.h, time.m, 0, 0);
  }

  function roundToNextHalfHourTime(now: Date): string {
    const d = new Date(now);
    d.setSeconds(0, 0);
    const m = d.getMinutes();
    const next = m === 0 || m === 30 ? m : m < 30 ? 30 : 60;
    if (next === 60) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
    } else {
      d.setMinutes(next, 0, 0);
    }
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatDayTitle(d: Date): string {
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function formatTime(d: Date): string {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function dateKeyLocal(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function cx(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
  }

  function eventKey(e: EventDto) {
    return e.occurrenceId ?? `${e.id}:${e.startAt}`;
  }

  function closePopovers() {
    tagMenuOpen = false;
    personMenuOpen = false;
  }

  function chooseTag(id: number | null) {
    newTagIdStr = id == null ? '' : String(id);
    tagMenuOpen = false;
  }

  function choosePerson(id: number | null) {
    if (id == null) {
      newPersonIds = [];
      personMenuOpen = false;
      return;
    }
    if (newPersonIds.includes(id)) {
      newPersonIds = newPersonIds.filter((x) => x !== id);
    } else {
      newPersonIds = [...newPersonIds, id];
    }
  }

  function formatEventDateLine(e: EventDto): string {
    const start = new Date(e.startAt);
    const d = start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (e.allDay) return d;

    const time = `${formatTime(start)}${e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}`;
    return `${d} · ${time}`;
  }

  function pickBackgroundFromSettings(s: SettingsDto): string {
    const uploaded = (s.images ?? []).map((img) => `/api/media/${img}`);
    if (uploaded.length > 0) {
      const preferred = s.background ? `/api/media/${s.background}` : null;
      return preferred && uploaded.includes(preferred) ? preferred : uploaded[0] ?? '/background.jpg';
    }
    if (s.backgroundUrl) return `/api${s.backgroundUrl}`;
    return '/background.jpg';
  }

  function startOfLocalDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function eventDayKeys(e: EventDto): string[] {
    const start = startOfLocalDay(new Date(e.startAt));
    const end = e.endAt ? startOfLocalDay(new Date(e.endAt)) : start;
    const maxSpan = 62;
    const spanDays = Math.min(maxSpan, Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000))));

    const out: string[] = [];
    for (let i = 0; i <= spanDays; i++) {
      const d = addDays(start, i);
      out.push(dateKeyLocal(d));
    }
    return out;
  }

  $: monthDays = daysForMonthGrid(monthAnchor);
  $: monthTitle = formatMonthTitle(monthAnchor);

  let monthHasEvents = new Map<string, boolean>();
  $: {
    const m = new Map<string, boolean>();
    for (const e of monthEvents) {
      for (const k of eventDayKeys(e)) m.set(k, true);
    }
    monthHasEvents = m;
  }

  function isInMonth(d: Date, anchor: Date): boolean {
    return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth();
  }

  function clampSelectedToMonth(nextAnchor: Date, currentSelected: Date): Date {
    const y = nextAnchor.getFullYear();
    const mo = nextAnchor.getMonth();
    const day = currentSelected.getDate();
    const last = new Date(y, mo + 1, 0).getDate();
    return new Date(y, mo, Math.min(day, last));
  }

  function shiftMonth(delta: number) {
    const nextAnchor = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1);
    monthAnchor = nextAnchor;
    selectedDate = clampSelectedToMonth(nextAnchor, selectedDate);
    newDate = toDateInputValue(selectedDate);
    void refreshMonth();
  }

  async function refreshAgenda() {
    agendaLoading = true;
    agendaError = null;
    try {
      const from = startOfDay(selectedDate);
      const to = endOfDay(addDays(selectedDate, 7));
      const items = await fetchEvents(from, to);
      agendaEvents = items
        .slice()
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    } catch (err) {
      agendaError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      agendaEvents = [];
    } finally {
      agendaLoading = false;
    }
  }

  async function refreshMonth() {
    monthLoading = true;
    monthError = null;
    try {
      const days = daysForMonthGrid(monthAnchor);
      const from = startOfDay(days[0] ?? monthAnchor);
      const to = endOfDay(days[days.length - 1] ?? monthAnchor);
      const items = await fetchEvents(from, to);
      monthEvents = items;
    } catch (err) {
      monthError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      monthEvents = [];
    } finally {
      monthLoading = false;
    }
  }

  function setSelected(d: Date) {
    selectedDate = d;
    newDate = toDateInputValue(d);
    view = 'agenda';
    closePopovers();
    void refreshAgenda();
  }

  $: agendaGroups = (() => {
    const groups: { day: Date; items: EventDto[] }[] = [];
    for (let i = 0; i <= 7; i++) {
      const day = startOfLocalDay(addDays(selectedDate, i));
      const items = agendaEvents.filter((e) => sameDay(new Date(e.startAt), day));
      groups.push({ day, items });
    }
    return groups;
  })();

  async function doCreate() {
    createError = null;
    const title = newTitle.trim();
    if (!title) {
      createError = 'Titel fehlt.';
      return;
    }

    const d = parseDateInputValue(newDate);
    if (!d) {
      createError = 'Ungültiges Datum.';
      return;
    }

    let startAt: Date;
    let endAt: Date | null = null;

    if (newAllDay) {
      startAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    } else {
      const st = parseTime(newStartTime);
      if (!st) {
        createError = 'Startzeit fehlt.';
        return;
      }
      startAt = toLocalDateTime(d, st);

      const et = parseTime(newEndTime);
      if (et) {
        endAt = toLocalDateTime(d, et);
        if (endAt.getTime() <= startAt.getTime()) {
          createError = 'Ende muss nach Start liegen.';
          return;
        }
      }
    }

    creating = true;
    try {
      await createEvent({
        title,
        startAt: startAt.toISOString(),
        endAt: endAt ? endAt.toISOString() : null,
        allDay: newAllDay,
        tagId: newTagId != null && Number.isFinite(newTagId) && newTagId > 0 ? newTagId : null,
        personIds: newPersonIds.length > 0 ? newPersonIds : null
      });

      newTitle = '';
      if (!newAllDay) newEndTime = '';
      newTagIdStr = '';
      newPersonIds = [];
      closePopovers();

      // Keep the agenda anchored to the event day
      selectedDate = d;
      monthAnchor = new Date(d.getFullYear(), d.getMonth(), 1);

      await Promise.all([refreshAgenda(), refreshMonth()]);
    } catch (err) {
      createError = err instanceof Error ? err.message : 'Fehler beim Anlegen.';
    } finally {
      creating = false;
    }
  }

  onMount(() => {
    if (!getStoredToken()) {
      void goto(`/login?next=${encodeURIComponent('/planner')}`);
      return;
    }

    metaLoading = true;
    metaError = null;
    void (async () => {
      try {
        const [s, t, p] = await Promise.all([fetchSettings(), listTags(), listPersons()]);
        backgroundUrl = pickBackgroundFromSettings(s);
        tags = (t ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
        persons = (p ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
      } catch (err) {
        metaError = err instanceof Error ? err.message : 'Fehler beim Laden.';
      } finally {
        metaLoading = false;
      }
    })();

    void Promise.all([refreshAgenda(), refreshMonth()]);
  });
</script>

<div class="min-h-screen text-white overflow-hidden relative bg-black">
  <div class="absolute inset-0 overflow-hidden">
    <div
      class="absolute inset-0"
      style={`background-image: ${bgOverlay}, url('${backgroundUrl}'); background-size: cover; background-position: center;`}
    ></div>
  </div>

  <div class="relative z-10 max-w-xl mx-auto px-4 py-4">
    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="text-xl font-semibold tracking-wide">Dashbo</div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class={cx(
            'h-9 px-3 rounded-lg text-sm font-medium transition-colors border border-white/10',
            view === 'agenda' ? 'bg-white/20' : 'hover:bg-white/15'
          )}
          on:click={() => (view = 'agenda')}
        >
          Agenda
        </button>
        <button
          type="button"
          class={cx(
            'h-9 px-3 rounded-lg text-sm font-medium transition-colors border border-white/10',
            view === 'month' ? 'bg-white/20' : 'hover:bg-white/15'
          )}
          on:click={() => (view = 'month')}
        >
          Monat
        </button>
      </div>
    </div>

    {#if metaError}
      <div class="text-red-400 text-sm mb-3">{metaError}</div>
    {/if}

    <div class="bg-white/5 rounded-xl p-4 mb-4 glass border border-white/10">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div class="font-medium">Neuer Termin</div>
      </div>

      <div class="space-y-2">
        <input
          class="h-10 w-full px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
          placeholder="Titel"
          bind:value={newTitle}
        />

        <div class="grid grid-cols-2 gap-2">
          <input
            class="h-10 px-3 rounded-lg bg-white/10 border-0 text-sm"
            type="date"
            bind:value={newDate}
          />

          <label class="h-10 px-3 rounded-lg bg-white/10 border-0 text-sm flex items-center gap-2 text-white/80">
            <input type="checkbox" class="rounded bg-white/10 border-0" bind:checked={newAllDay} />
            Ganztägig
          </label>
        </div>

        {#if !newAllDay}
          <div class="grid grid-cols-2 gap-2">
            <input
              class="h-10 px-3 rounded-lg bg-white/10 border-0 text-sm"
              type="time"
              bind:value={newStartTime}
            />
            <input
              class="h-10 px-3 rounded-lg bg-white/10 border-0 text-sm"
              type="time"
              placeholder="Ende (optional)"
              bind:value={newEndTime}
            />
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-2">
          {#if tags.length > 0}
            <div class="relative">
              <button
                type="button"
                class="h-10 w-full rounded-lg bg-white/10 border border-white/10 text-sm px-3 flex items-center justify-between gap-3 hover:bg-white/15 active:bg-white/20 transition"
                aria-haspopup="listbox"
                aria-expanded={tagMenuOpen}
                disabled={metaLoading}
                on:click={() => (tagMenuOpen = !tagMenuOpen)}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class={`h-3 w-3 rounded-full ${
                      selectedTag
                        ? isHexColor(selectedTag.color)
                          ? 'bg-transparent'
                          : tagBg[selectedTag.color as TagColorKey] ?? 'bg-white/25'
                        : 'bg-white/25'
                    }`}
                    style={selectedTag && isHexColor(selectedTag.color) ? `background-color: ${selectedTag.color}` : ''}
                  ></div>
                  <div class="truncate text-white/85">{selectedTag ? selectedTag.name : 'Kein Tag'}</div>
                </div>
                <div class="text-white/60">▾</div>
              </button>

              {#if tagMenuOpen}
                <div
                  class="absolute z-20 mt-2 w-full rounded-xl overflow-hidden border border-white/10 bg-black/60 backdrop-blur-md"
                  role="listbox"
                >
                  <button
                    type="button"
                    class={`w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${newTagId == null ? 'bg-white/10' : ''}`}
                    role="option"
                    aria-selected={newTagId == null}
                    on:click={() => chooseTag(null)}
                  >
                    <div class="h-3 w-3 rounded-full bg-white/25"></div>
                    <div>Kein Tag</div>
                  </button>

                  {#each tags as t (t.id)}
                    <button
                      type="button"
                      class={`w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${newTagId === t.id ? 'bg-white/10' : ''}`}
                      role="option"
                      aria-selected={newTagId === t.id}
                      on:click={() => chooseTag(t.id)}
                    >
                      <div
                        class={`h-3 w-3 rounded-full ${isHexColor(t.color) ? 'bg-transparent' : tagBg[t.color as TagColorKey] ?? 'bg-white/25'}`}
                        style={isHexColor(t.color) ? `background-color: ${t.color}` : ''}
                      ></div>
                      <div class="truncate">{t.name}</div>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div class="h-10 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-sm text-white/50">
              Kein Tag
            </div>
          {/if}

          {#if persons.length > 0}
            <div class="relative">
              <button
                type="button"
                class="h-10 w-full rounded-lg bg-white/10 border border-white/10 text-sm px-3 flex items-center justify-between gap-3 hover:bg-white/15 active:bg-white/20 transition"
                aria-haspopup="listbox"
                aria-expanded={personMenuOpen}
                disabled={metaLoading}
                on:click={() => (personMenuOpen = !personMenuOpen)}
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class={`h-3 w-3 rounded-full ${primaryPerson
                      ? isHexColor(primaryPerson.color)
                        ? 'bg-transparent'
                        : tagBg[primaryPerson.color as TagColorKey] ?? 'bg-white/25'
                      : 'bg-white/25'}`}
                    style={primaryPerson && isHexColor(primaryPerson.color) ? `background-color: ${primaryPerson.color}` : ''}
                  ></div>
                  <div class="truncate text-white/85">{selectedPersonLabel}</div>
                </div>
                <div class="text-white/60">▾</div>
              </button>

              {#if personMenuOpen}
                <div
                  class="absolute z-20 mt-2 w-full rounded-xl overflow-hidden border border-white/10 bg-black/60 backdrop-blur-md"
                  role="listbox"
                  aria-multiselectable="true"
                >
                  <button
                    type="button"
                    class="w-full px-3 py-2.5 text-left hover:bg-white/10 active:bg-white/15 transition"
                    on:click={() => (personMenuOpen = false)}
                  >
                    <div class="text-white/70">Fertig</div>
                  </button>

                  <button
                    type="button"
                    class={`w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${newPersonIds.length === 0 ? 'bg-white/10' : ''}`}
                    role="option"
                    aria-selected={newPersonIds.length === 0}
                    on:click={() => choosePerson(null)}
                  >
                    <div class="h-3 w-3 rounded-full bg-white/25"></div>
                    <div>Keine Person</div>
                  </button>

                  {#each persons as p (p.id)}
                    {@const selected = newPersonIds.includes(p.id)}
                    <button
                      type="button"
                      class={`w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-white/10 active:bg-white/15 transition ${selected ? 'bg-white/10' : ''}`}
                      role="option"
                      aria-selected={selected}
                      on:click={() => choosePerson(p.id)}
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <div
                          class={`h-3 w-3 rounded-full ${isHexColor(p.color) ? 'bg-transparent' : tagBg[p.color as TagColorKey] ?? 'bg-white/25'}`}
                          style={isHexColor(p.color) ? `background-color: ${p.color}` : ''}
                        ></div>
                        <div class="truncate">{p.name}</div>
                      </div>
                      <div class="text-white/60">{selected ? '✓' : ''}</div>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div class="h-10 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-sm text-white/50">
              Keine Person
            </div>
          {/if}
        </div>

        <div class="flex items-center justify-between gap-3">
          <button
            class="h-10 px-4 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
            disabled={creating}
            on:click={doCreate}
          >
            {creating ? 'Speichere…' : 'Anlegen'}
          </button>

          {#if createError}
            <div class="text-red-400 text-xs text-right">{createError}</div>
          {/if}
        </div>
      </div>
    </div>

    {#if view === 'agenda'}
      <div class="flex items-center justify-between gap-3 mb-3">
        <div class="text-white/85 text-sm">{formatDayTitle(selectedDate)} → +7 Tage</div>
        <button
          type="button"
          class="h-9 px-3 rounded-lg text-sm font-medium border border-white/10 hover:bg-white/10"
          on:click={() => {
            const d = new Date();
            selectedDate = d;
            monthAnchor = new Date(d.getFullYear(), d.getMonth(), 1);
            newDate = toDateInputValue(d);
            closePopovers();
            void refreshAgenda();
          }}
        >
          Heute
        </button>
      </div>

      {#if agendaLoading}
        <div class="text-white/60 text-sm">Lade…</div>
      {:else if agendaError}
        <div class="text-red-400 text-sm">{agendaError}</div>
      {:else}
        <div class="space-y-3">
          {#each agendaGroups as g (dateKeyLocal(g.day))}
            <div class="bg-white/5 rounded-xl p-3 glass border border-white/10">
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium">
                  {g.day.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </div>
                <button
                  type="button"
                  class="text-xs text-white/60 hover:text-white"
                  on:click={() => {
                    selectedDate = g.day;
                    newDate = toDateInputValue(g.day);
                    void refreshAgenda();
                  }}
                >
                  Öffnen
                </button>
              </div>

              {#if g.items.length === 0}
                <div class="text-white/40 text-sm mt-2">Keine Termine</div>
              {:else}
                <div class="mt-2 space-y-2">
                  {#each g.items as e (eventKey(e))}
                    <button
                      type="button"
                      class="w-full text-left rounded-lg hover:bg-white/5 px-2 py-2 -mx-2"
                      on:click={() => (openEvent = e)}
                    >
                      <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="text-sm font-medium truncate">{e.title}</div>
                        <div class="text-xs text-white/55 truncate">
                          {#if e.allDay}
                            Ganztägig
                          {:else}
                            {formatTime(new Date(e.startAt))}{e.endAt ? ` – ${formatTime(new Date(e.endAt))}` : ''}
                          {/if}
                          {#if e.location}
                            · {e.location}
                          {/if}
                        </div>
                      </div>
                      {#if e.source && e.source !== 'dashbo'}
                        <div class="text-[10px] text-white/40 mt-0.5">{e.source}</div>
                      {/if}
                      </div>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="bg-white/5 rounded-xl p-3 glass border border-white/10">
        <div class="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            class="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15"
            aria-label="Vorheriger Monat"
            on:click={() => shiftMonth(-1)}
          >
            ‹
          </button>
          <div class="text-sm font-medium tracking-wide">{monthTitle}</div>
          <button
            type="button"
            class="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/15"
            aria-label="Nächster Monat"
            on:click={() => shiftMonth(1)}
          >
            ›
          </button>
        </div>

        <div class="grid grid-cols-7 gap-1 text-[11px] text-white/55 mb-2">
          {#each weekDays as d (d.toISOString())}
            <div class="text-center">{formatGermanDayLabel(d)}</div>
          {/each}
        </div>

        {#if monthLoading}
          <div class="text-white/60 text-sm">Lade…</div>
        {:else if monthError}
          <div class="text-red-400 text-sm">{monthError}</div>
        {:else}
          <div class="grid grid-cols-7 gap-1">
            {#each monthDays as d (d.toISOString())}
              {@const k = dateKeyLocal(d)}
              <button
                type="button"
                class={cx(
                  'aspect-square rounded-lg flex flex-col items-center justify-center text-sm border border-white/10',
                  sameDay(d, selectedDate) ? 'bg-white/15' : 'hover:bg-white/10',
                  !isInMonth(d, monthAnchor) && 'opacity-60'
                )}
                on:click={() => setSelected(d)}
              >
                <div class="leading-none">{d.getDate()}</div>
                {#if monthHasEvents.get(k)}
                  <div class="mt-1 h-1.5 w-1.5 rounded-full bg-white/70"></div>
                {:else}
                  <div class="mt-1 h-1.5 w-1.5 rounded-full bg-transparent"></div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if openEvent}
  <div class="fixed inset-0 z-50">
    <button type="button" class="absolute inset-0 bg-black/70" aria-label="Schließen" on:click={() => (openEvent = null)}></button>
    <div class="absolute inset-x-0 bottom-0 p-4">
      <div class="max-w-xl mx-auto glass border border-white/10 rounded-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-lg font-semibold leading-tight truncate">{openEvent.title}</div>
            <div class="text-sm text-white/70 mt-1">{formatEventDateLine(openEvent)}</div>
          </div>
          <button type="button" class="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm" on:click={() => (openEvent = null)}>
            Schließen
          </button>
        </div>

        {#if openEvent.location}
          <div class="mt-3 text-sm text-white/80">
            <span class="text-white/50">Ort:</span> {openEvent.location}
          </div>
        {/if}

        {#if openEvent.tag || openEvent.person || (openEvent.persons && openEvent.persons.length > 0)}
          <div class="mt-3 text-sm text-white/80">
            {#if openEvent.tag}
              <div><span class="text-white/50">Tag:</span> {openEvent.tag.name}</div>
            {/if}
            {#if openEvent.person}
              <div><span class="text-white/50">Person:</span> {openEvent.person.name}</div>
            {/if}
            {#if openEvent.persons && openEvent.persons.length > 0}
              <div>
                <span class="text-white/50">Personen:</span>
                {openEvent.persons.map((p) => p.name).join(', ')}
              </div>
            {/if}
          </div>
        {/if}

        {#if openEvent.description}
          <div class="mt-3 text-sm text-white/80 whitespace-pre-wrap">{openEvent.description}</div>
        {/if}
      </div>
    </div>
  </div>
{/if}
