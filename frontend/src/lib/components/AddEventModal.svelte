<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    createEvent,
    createTodo,
    deleteEvent,
    fetchTodos,
    updateEvent,
    listOutlookConnections,
    listPersons,
    listTags,
    type OutlookConnectionDto,
    type EventDto,
    type PersonDto,
    type TagDto,
    type TagColorKey
  } from '$lib/api';
  import { fade, fly } from 'svelte/transition';

  export let open: boolean;
  export let selectedDate: Date;
  export let onClose: () => void;
  export let onCreated: () => void;
  export let eventToEdit: EventDto | null = null;
  export let outlookConnected = false;
  export let todoEnabled = true;
  export let prefill:
    | {
        title?: string;
        allDay?: boolean;
        startTime?: string;
        endTime?: string;
        tagId?: number | null;
        personIds?: number[];
      }
    | null = null;
  export let prefillKey: string | null = null;

  let title = '';
  let description = '';
  let location = '';
  let allDay = false;
  let startDateStr = '';
  let endDateStr = '';
  let startTime = '12:00';
  let endTime = '';
  let tagId: number | null = null;
  let personIds: number[] = [];
  let recurrence: 'weekly' | 'monthly' | null = null;
  let saving = false;

  // Optional ToDos created alongside the event (new events only)
  let todoText = '';
  let todoSaving = false;
  let todoError: string | null = null;

  let outlookConnections: OutlookConnectionDto[] = [];
  let todoListName = 'Dashbo';
  let todoListNames: string[] = [];
  let todoSelectedConnectionId: number | null = null;
  let todoSelectedListName = '';
  let todoAccountMenuOpen = false;

  $: selectedTodoConnection =
    todoSelectedConnectionId != null ? outlookConnections.find((c) => c.id === todoSelectedConnectionId) ?? null : null;

  let prefilledForEventId: number | null = null;
  let prefilledForKey: string | null = null;

  let tags: TagDto[] = [];
  let tagsLoadedForOpen = false;

  let persons: PersonDto[] = [];
  let personsLoadedForOpen = false;

  let todoLoadedForOpen = false;

  let showDeleteConfirm = false;

  let prevOpen = false;

  let prevBodyOverflow: string | null = null;
  function lockBodyScroll() {
    if (typeof document === 'undefined') return;
    if (prevBodyOverflow !== null) return;
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  function unlockBodyScroll() {
    if (typeof document === 'undefined') return;
    if (prevBodyOverflow === null) return;
    document.body.style.overflow = prevBodyOverflow;
    prevBodyOverflow = null;
  }

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

  const personOutline: Record<TagColorKey, string> = {
    fuchsia: 'border-fuchsia-400/40 text-fuchsia-200/90',
    cyan: 'border-cyan-400/40 text-cyan-200/90',
    emerald: 'border-emerald-400/40 text-emerald-200/90',
    amber: 'border-amber-400/40 text-amber-200/90',
    rose: 'border-rose-400/40 text-rose-200/90',
    violet: 'border-violet-400/40 text-violet-200/90',
    sky: 'border-sky-400/40 text-sky-200/90',
    lime: 'border-lime-400/40 text-lime-200/90'
  };

  const personSelected: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500/15 border-fuchsia-400/70 text-fuchsia-200',
    cyan: 'bg-cyan-400/15 border-cyan-400/70 text-cyan-200',
    emerald: 'bg-emerald-400/15 border-emerald-400/70 text-emerald-200',
    amber: 'bg-amber-400/15 border-amber-400/70 text-amber-200',
    rose: 'bg-rose-400/15 border-rose-400/70 text-rose-200',
    violet: 'bg-violet-400/15 border-violet-400/70 text-violet-200',
    sky: 'bg-sky-400/15 border-sky-400/70 text-sky-200',
    lime: 'bg-lime-400/15 border-lime-400/70 text-lime-200'
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

  function personChipStyle(color: string, selected: boolean): string {
    if (!isHexColor(color)) return '';
    const border = hexToRgba(color, selected ? 0.7 : 0.4);
    const bg = selected ? hexToRgba(color, 0.16) : 'rgba(0,0,0,0)';
    const fg = hexToRgba(color, selected ? 1 : 0.92);
    return `border-color: ${border}; background-color: ${bg}; color: ${fg};`;
  }

  async function loadTags() {
    try {
      tags = await listTags();
    } catch {
      tags = [];
    }
  }

  async function loadPersons() {
    try {
      persons = await listPersons();
    } catch {
      persons = [];
    }
  }

  $: if (open && !tagsLoadedForOpen) {
    tagsLoadedForOpen = true;
    void loadTags();
  }

  $: if (open && !personsLoadedForOpen) {
    personsLoadedForOpen = true;
    void loadPersons();
  }

  async function loadTodoMeta() {
    if (!(outlookConnected && todoEnabled)) return;
    try {
      const [conns, todoMeta] = await Promise.all([listOutlookConnections(), fetchTodos()]);
      outlookConnections = Array.isArray(conns) ? conns : [];
      todoListName = todoMeta?.listName || 'Dashbo';
      todoListNames = Array.isArray(todoMeta?.listNames) ? todoMeta.listNames : [];

      if (todoSelectedConnectionId == null && outlookConnections.length > 0) {
        todoSelectedConnectionId = outlookConnections[0]!.id;
      }
      if (!todoSelectedListName) {
        todoSelectedListName = (todoListNames && todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
      }
    } catch {
      outlookConnections = [];
      todoListName = 'Dashbo';
      todoListNames = [];
    }
  }

  $: if (open && outlookConnected && todoEnabled && !todoLoadedForOpen) {
    todoLoadedForOpen = true;
    void loadTodoMeta();
  }

  $: if (!open) {
    tagsLoadedForOpen = false;
    personsLoadedForOpen = false;
    todoLoadedForOpen = false;
    showDeleteConfirm = false;
    prefilledForEventId = null;
    prefilledForKey = null;
    todoAccountMenuOpen = false;
  }

  $: if (open) lockBodyScroll();
  $: if (!open) unlockBodyScroll();

  onDestroy(() => {
    unlockBodyScroll();
  });

  function resetFormForNewEvent() {
    title = '';
    description = '';
    location = '';
    allDay = false;
    startDateStr = yyyymmddLocal(selectedDate);
    endDateStr = '';
    startTime = '12:00';
    endTime = '';
    tagId = null;
    personIds = [];
    recurrence = null;
    todoText = '';
    todoSaving = false;
    todoError = null;
    prefilledForEventId = null;
    showDeleteConfirm = false;
  }

  $: {
    // On opening the modal for a NEW event, ensure we don't keep stale form values
    if (open && !prevOpen && !eventToEdit) {
      resetFormForNewEvent();

      if (prefillKey && prefillKey !== prefilledForKey) {
        prefilledForKey = prefillKey;
        if (prefill?.title != null) title = prefill.title;
        if (typeof prefill?.allDay === 'boolean') allDay = prefill.allDay;
        if (prefill?.startTime) startTime = prefill.startTime;
        if (prefill?.endTime != null) endTime = prefill.endTime;
        if (prefill && 'tagId' in prefill) tagId = prefill.tagId ?? null;
        if (prefill?.personIds) personIds = Array.isArray(prefill.personIds) ? prefill.personIds : [];
      }
    }
    prevOpen = open;
  }

  function hhmmFromIso(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function yyyymmddLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  $: if (open && eventToEdit && prefilledForEventId !== eventToEdit.id) {
    prefilledForEventId = eventToEdit.id;

    title = eventToEdit.title ?? '';
    description = eventToEdit.description ?? '';
    location = eventToEdit.location ?? '';
    allDay = Boolean(eventToEdit.allDay);

    const startD = new Date(eventToEdit.startAt);
    startDateStr = yyyymmddLocal(startD);

    const endD = eventToEdit.endAt ? new Date(eventToEdit.endAt) : null;
    endDateStr = endD ? yyyymmddLocal(endD) : '';

    startTime = hhmmFromIso(eventToEdit.startAt);
    endTime = eventToEdit.endAt ? hhmmFromIso(eventToEdit.endAt) : '';
    tagId = eventToEdit.tag?.id ?? null;
    personIds = (eventToEdit.persons && eventToEdit.persons.length > 0
      ? eventToEdit.persons.map((p) => p.id)
      : eventToEdit.person
        ? [eventToEdit.person.id]
        : []) as number[];
    recurrence = eventToEdit.recurrence?.freq ?? null;

    // Do not carry ToDo input between modal opens when editing.
    todoText = '';
    todoSaving = false;
    todoError = null;
    todoAccountMenuOpen = false;
  }

  $: if (open && !eventToEdit && !startDateStr) {
    // default dates for new event
    startDateStr = yyyymmddLocal(selectedDate);
    endDateStr = '';
    allDay = false;
  }

  function toIsoFromDateStr(dateStr: string, hhmm: string) {
    const [y, mo, da] = dateStr.split('-').map((x) => Number(x));
    const [h, m] = hhmm.split(':').map((x) => Number(x));
    const d = new Date();
    d.setFullYear(y || 1970, (mo || 1) - 1, da || 1);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.toISOString();
  }

  function endOfDayIso(dateStr: string) {
    const [y, mo, da] = dateStr.split('-').map((x) => Number(x));
    const d = new Date();
    d.setFullYear(y || 1970, (mo || 1) - 1, da || 1);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }

  // Use local noon to avoid timezone offsets pushing the ISO date to the previous/next day.
  function isoNoonLocalFromDateStr(dateStr: string): string {
    const [y, mo, da] = dateStr.split('-').map((x) => Number(x));
    const d = new Date();
    d.setFullYear(y || 1970, (mo || 1) - 1, da || 1);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
  }

  function parseTodos(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  function connectionColorClass(name: string | null | undefined) {
    const n = String(name || '').toLowerCase();
    switch (n) {
      case 'cyan':
        return 'bg-cyan-700';
      case 'fuchsia':
        return 'bg-fuchsia-700';
      case 'emerald':
        return 'bg-emerald-700';
      case 'amber':
        return 'bg-amber-700';
      case 'rose':
        return 'bg-rose-700';
      case 'violet':
        return 'bg-violet-700';
      case 'sky':
        return 'bg-sky-700';
      case 'lime':
        return 'bg-lime-700';
      default:
        return 'bg-white/30';
    }
  }

  function connectionLabel(c: OutlookConnectionDto): string {
    return c.displayName || c.email || `Outlook ${c.id}`;
  }

  function togglePerson(id: number) {
    if (personIds.includes(id)) {
      personIds = personIds.filter(p => p !== id);
    } else {
      personIds = [...personIds, id];
    }
  }

  async function submit() {
    if (!title.trim() || saving) return;
    saving = true;

    try {
      const startAtIso = allDay ? toIsoFromDateStr(startDateStr, '00:00') : toIsoFromDateStr(startDateStr, startTime);

      let endAtIso: string | null;
      if (allDay) {
        const endDate = endDateStr || startDateStr;
        endAtIso = endOfDayIso(endDate);
      } else if (endTime) {
        const endDate = endDateStr || startDateStr;
        endAtIso = toIsoFromDateStr(endDate, endTime);
      } else {
        endAtIso = null;
      }

      const payload = {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        location: location.trim() ? location.trim() : null,
        startAt: startAtIso,
        endAt: endAtIso,
        allDay,
        tagId,
        personIds: personIds.length > 0 ? personIds : null,
        recurrence
      };

      if (eventToEdit) await updateEvent(eventToEdit.id, payload);
      else await createEvent(payload);

      // Optional: create ToDos from textarea lines (also allowed when editing)
      const todoLines = outlookConnected && todoEnabled ? parseTodos(todoText) : [];
      if (todoLines.length > 0) {
        todoSaving = true;
        todoError = null;

        const dueAt = isoNoonLocalFromDateStr(startDateStr || yyyymmddLocal(selectedDate));
        const listName =
          todoSelectedListName ||
          (todoListNames && todoListNames.length > 0 ? todoListNames[0] : todoListName) ||
          '';
        const connectionId = todoSelectedConnectionId;

        try {
          await Promise.all(
            todoLines.map((t) =>
              createTodo({
                ...(connectionId != null ? { connectionId } : {}),
                ...(listName ? { listName } : {}),
                title: t,
                description: null,
                dueAt
              })
            )
          );
        } catch (e: any) {
          todoError = e?.message || 'Fehler beim Speichern der ToDos';
          // Do not block event creation.
        } finally {
          todoSaving = false;
        }
      }

      title = '';
      description = '';
      location = '';
      allDay = false;
      startDateStr = '';
      endDateStr = '';
      startTime = '12:00';
      endTime = '';
      tagId = null;
      personIds = [];
      recurrence = null;
      todoText = '';
      todoSaving = false;
      todoError = null;
      todoAccountMenuOpen = false;
      prefilledForEventId = null;

      onCreated();
      onClose();
    } finally {
      saving = false;
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;

    if (showDeleteConfirm) {
      showDeleteConfirm = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    onClose();
    e.preventDefault();
    e.stopPropagation();
  }

  function onGlobalKeyDown(e: KeyboardEvent) {
    if (!open) return;
    onKeyDown(e);
  }

  async function confirmDelete() {
    if (!eventToEdit || saving) return;
    saving = true;
    try {
      await deleteEvent(eventToEdit.id);
      showDeleteConfirm = false;
      prefilledForEventId = null;
      onCreated();
      onClose();
    } finally {
      saving = false;
    }
  }

  $: dateLabel = selectedDate.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
</script>

<svelte:window on:keydown={onGlobalKeyDown} />

{#if open}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
    transition:fade={{ duration: 200 }}
    on:click|self={onClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-event-title"
  >
    <!-- Modal Panel -->
    <div
      class="w-full sm:max-w-2xl lg:max-w-3xl max-h-[92vh] max-h-[92svh] max-h-[92dvh] bg-neutral-900/95 backdrop-blur-xl border-t sm:border border-white/10 sm:rounded-2xl overflow-hidden flex flex-col"
      in:fly={{ y: 100, duration: 250, delay: 50 }}
      out:fly={{ y: 100, duration: 200 }}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-white/10 shrink-0">
        <div>
          <h2 id="add-event-title" class="text-lg font-semibold">{eventToEdit ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
          <p class="text-sm text-white/60">{dateLabel}</p>
        </div>
        <div class="flex items-center gap-2">
          {#if eventToEdit}
            <button
              type="button"
              class="p-2 rounded-full hover:bg-rose-500/20 active:bg-rose-500/30 transition"
              title="Termin löschen"
              on:click={() => (showDeleteConfirm = true)}
              aria-label="Löschen"
            >
              <svg class="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          {/if}
          <button
            type="button"
            class="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition"
            on:click={onClose}
            aria-label="Schließen"
          >
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Form -->
      <form on:submit|preventDefault={submit} class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-auto overscroll-contain flex-1 min-h-0">
        <!-- Title -->
        <div class="sm:col-span-2">
          <input
            type="text"
            bind:value={title}
            placeholder="Was ist geplant?"
            class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-lg placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition"
            autofocus
          />
        </div>

        <!-- Time Row -->
        <div class="sm:col-span-2">
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer shrink-0">
              <input
                type="checkbox"
                bind:checked={allDay}
                class="w-5 h-5 rounded bg-white/10 border-white/20 text-emerald-500 focus:ring-emerald-500/50"
              />
              <span class="text-sm">Ganztägig</span>
            </label>

            {#if !allDay}
              <div class="flex items-center gap-2 flex-1 min-w-[200px]" transition:fade={{ duration: 150 }}>
                <input
                  type="time"
                  bind:value={startTime}
                  class="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <span class="text-white/40">–</span>
                <input
                  type="time"
                  bind:value={endTime}
                  placeholder="Ende"
                  class="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
            {/if}
          </div>
        </div>

        <!-- Date Row (for multi-day events or editing) -->
        {#if eventToEdit || endDateStr}
          <div class="sm:col-span-2">
            <div class="text-xs text-white/50 mb-2">Datum</div>
            <div class="flex items-center gap-2">
              <input
                type="date"
                bind:value={startDateStr}
                class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <span class="text-white/40 shrink-0">–</span>
              <input
                type="date"
                bind:value={endDateStr}
                placeholder="Ende"
                class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
          </div>
        {/if}

        <!-- Location -->
        <div class="sm:col-span-2">
          <input
            type="text"
            bind:value={location}
            placeholder="Ort (optional)"
            class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition"
          />
        </div>

        <!-- Recurrence -->
        <div class="sm:col-span-2">
          <div class="text-xs text-white/50 mb-2">Wiederholung</div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 ${
                recurrence === null
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
              on:click={() => recurrence = null}
            >
              Keine
            </button>
            <button
              type="button"
              class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 ${
                recurrence === 'weekly'
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
              on:click={() => recurrence = 'weekly'}
            >
              Wöchentlich
            </button>
            <button
              type="button"
              class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 ${
                recurrence === 'monthly'
                  ? 'bg-white/20 border-white/40 text-white'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
              }`}
              on:click={() => recurrence = 'monthly'}
            >
              Monatlich
            </button>
          </div>
        </div>

        <!-- Description -->
        <div class="sm:col-span-2">
          <textarea
            bind:value={description}
            placeholder="Beschreibung (optional)"
            rows="2"
            class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 resize-none transition"
          ></textarea>
        </div>

        <!-- Person Chips -->
        {#if persons.length > 0}
          <div class="sm:col-span-2">
            <div class="text-xs text-white/50 mb-2">Personen</div>
            <div class="flex flex-wrap gap-2">
              {#each persons as p (p.id)}
                {@const selected = personIds.includes(p.id)}
                {@const c = p.color as string}
                <button
                  type="button"
                  class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 inline-flex items-center gap-2 ${
                    isHexColor(c)
                      ? (selected ? 'bg-white/5' : 'bg-white/5 hover:bg-white/10')
                      : selected
                        ? (personSelected[c as TagColorKey] ?? 'bg-white/15 border-white/20 text-white')
                        : (personOutline[c as TagColorKey] ?? 'border-white/15 text-white/70')
                  }`}
                  style={personChipStyle(c, selected)}
                  on:click={() => togglePerson(p.id)}
                >
                  <span
                    class={`w-2.5 h-2.5 rounded-full ${
                      isHexColor(c) ? '' : tagBg[c as TagColorKey] ?? 'bg-white/40'
                    }`}
                    style={isHexColor(c) ? `background-color: ${c}` : ''}
                    aria-hidden="true"
                  ></span>
                  {p.name}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Tag Selection (optional) -->
        {#if tags.length > 0}
          <div class="sm:col-span-2">
            <div class="text-xs text-white/50 mb-2">Kategorie (optional)</div>
            <div class="flex flex-wrap gap-2">
              {#each tags as t (t.id)}
                {@const selected = tagId === t.id}
                <button
                  type="button"
                  class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 flex items-center gap-1.5 ${
                    selected
                      ? 'bg-white/20 border-white/40 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                  on:click={() => tagId = selected ? null : t.id}
                >
                  <span
                    class={`w-2.5 h-2.5 rounded-full ${
                      isHexColor(t.color) ? '' : tagBg[t.color as TagColorKey] ?? 'bg-white/40'
                    }`}
                    style={isHexColor(t.color) ? `background-color: ${t.color}` : ''}
                  ></span>
                  {t.name}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- ToDos (optional, Outlook) -->
        {#if outlookConnected && todoEnabled}
          <div class="sm:col-span-2">
            <div class="text-xs text-white/50 mb-2">ToDos (optional)</div>

            {#if outlookConnections.length === 0}
              <div class="text-xs text-white/50">Keine Outlook-Verbindung gefunden.</div>
            {/if}

            <div class="sm:grid sm:grid-cols-2 sm:gap-4">
              <div>
                {#if outlookConnections.length > 1}
                  <div class="mb-3">
                    <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Konto</div>
                    <div class="relative">
                      <button
                        type="button"
                        class="w-full h-10 px-3 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-white/10"
                        on:click={() => (todoAccountMenuOpen = !todoAccountMenuOpen)}
                      >
                        <span
                          class={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${connectionColorClass(selectedTodoConnection?.color)}`}
                        ></span>
                        <span class="flex-1 text-left min-w-0">
                          <span class="block truncate">{selectedTodoConnection ? connectionLabel(selectedTodoConnection) : 'Konto wählen'}</span>
                          {#if selectedTodoConnection?.email}
                            <span class="block truncate text-xs text-white/50">{selectedTodoConnection.email}</span>
                          {/if}
                        </span>
                        <svg
                          class={`h-4 w-4 text-white/50 transition-transform ${todoAccountMenuOpen ? 'rotate-180' : ''}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>

                      {#if todoAccountMenuOpen}
                        <div class="absolute z-10 mt-1 w-full rounded-lg bg-neutral-800 border border-white/10 shadow-lg overflow-hidden">
                          {#each outlookConnections as c (c.id)}
                            <button
                              type="button"
                              class={`w-full px-3 py-2 flex items-center gap-2 text-sm text-white/90 hover:bg-white/10 transition-colors ${c.id === todoSelectedConnectionId ? 'bg-white/5' : ''}`}
                              on:click={() => {
                                todoSelectedConnectionId = c.id;
                                todoAccountMenuOpen = false;
                              }}
                            >
                              <span class={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${connectionColorClass(c.color)}`}></span>
                              <span class="flex-1 text-left min-w-0">
                                <span class="block truncate">{connectionLabel(c)}</span>
                                {#if c.email}
                                  <span class="block truncate text-xs text-white/50">{c.email}</span>
                                {/if}
                              </span>
                            </button>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}

                {#if todoListNames.length > 1}
                  <div class="mb-3">
                    <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Liste</div>
                    <div class="relative">
                      <select
                        class="w-full h-10 px-3 pr-10 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90 appearance-none focus:outline-none focus:ring-2 focus:ring-white/10"
                        bind:value={todoSelectedListName}
                      >
                        {#each todoListNames as ln}
                          <option class="bg-neutral-900 text-white" value={ln}>{ln}</option>
                        {/each}
                      </select>
                      <svg
                        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                {/if}
              </div>

              <div>
                <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Was muss gemacht werden?</div>
                <textarea
                  class="w-full min-h-[96px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                  placeholder="Eine Zeile = ein ToDo\nz.B. Müll rausbringen\nEinkaufsliste schreiben"
                  bind:value={todoText}
                ></textarea>
                <div class="mt-1 flex items-center justify-between">
                  <div class="text-xs text-white/40">Fällig am ausgewählten Tag</div>
                  <div class="text-xs text-white/50">{parseTodos(todoText).length} ToDo(s)</div>
                </div>

                {#if todoError}
                  <div class="mt-2 text-xs text-rose-300">{todoError}</div>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- Submit Button -->
        <button
          type="submit"
          disabled={!title.trim() || saving || todoSaving}
          class="w-full sm:col-span-2 py-3 rounded-xl font-semibold text-lg transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {#if saving || todoSaving}
            <span class="inline-flex items-center gap-2">
              <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Speichern…
            </span>
          {:else}
            {eventToEdit ? 'Änderungen speichern' : 'Termin erstellen'}
          {/if}
        </button>
      </form>

      <!-- Delete Confirmation Overlay -->
      {#if showDeleteConfirm}
        <div class="absolute inset-0 z-20 grid place-items-center p-4" transition:fade={{ duration: 150 }}>
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" on:click={() => (showDeleteConfirm = false)}></div>
          <div class="relative w-full max-w-sm rounded-2xl bg-neutral-900 border border-white/10 p-5">
            <div class="text-xl font-semibold">Termin löschen?</div>
            <div class="text-white/70 mt-2 text-sm">Möchtest du diesen Termin wirklich löschen?</div>

            <div class="mt-5 flex gap-3">
              <button
                type="button"
                class="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition"
                on:click={() => (showDeleteConfirm = false)}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                class="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-sm font-semibold transition"
                on:click={confirmDelete}
                disabled={saving}
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
