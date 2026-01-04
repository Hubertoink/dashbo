<script lang="ts">
  import {
    createEvent,
    deleteEvent,
    updateEvent,
    listPersons,
    listTags,
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

  let title = '';
  let description = '';
  let location = '';
  let allDay = false;
  let startDateStr = '';
  let endDateStr = '';
  let startTime = '12:00';
  let endTime = '';
  let tagId: number | null = null;
  let tagIdStr = '';
  let personIds: number[] = [];
  let recurrence: 'weekly' | 'monthly' | null = null;
  let recurrenceStr: '' | 'weekly' | 'monthly' = '';
  let saving = false;

  let prefilledForEventId: number | null = null;

  let tags: TagDto[] = [];
  let tagsLoadedForOpen = false;
  let tagMenuOpen = false;

  let persons: PersonDto[] = [];
  let personsLoadedForOpen = false;
  let personMenuOpen = false;

  let recurrenceMenuOpen = false;
  let showDeleteConfirm = false;

  let prevOpen = false;

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

  $: if (!open) {
    tagsLoadedForOpen = false;
    tagMenuOpen = false;
    personsLoadedForOpen = false;
    personMenuOpen = false;
    recurrenceMenuOpen = false;
    showDeleteConfirm = false;
    prefilledForEventId = null;
  }

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
    tagIdStr = '';
    personIds = [];
    recurrence = null;
    recurrenceStr = '';
    prefilledForEventId = null;
    showDeleteConfirm = false;
  }

  $: {
    // On opening the modal for a NEW event, ensure we don't keep stale form values
    if (open && !prevOpen && !eventToEdit) {
      resetFormForNewEvent();
    }
    prevOpen = open;
  }

  $: tagId = tagIdStr ? Number(tagIdStr) : null;
  $: selectedTag = tagId != null ? tags.find((t) => t.id === tagId) : undefined;

  $: selectedPersons = persons.filter((p) => personIds.includes(p.id));
  $: selectedPersonLabel =
    selectedPersons.length === 0
      ? 'Keine Person'
      : selectedPersons.length === 1
        ? selectedPersons[0]?.name ?? '1 Person'
        : `${selectedPersons.length} Personen`;
  $: primaryPerson = selectedPersons[0];

  $: recurrence = recurrenceStr ? recurrenceStr : null;

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
    tagIdStr = eventToEdit.tag ? String(eventToEdit.tag.id) : '';
    personIds = (eventToEdit.persons && eventToEdit.persons.length > 0
      ? eventToEdit.persons.map((p) => p.id)
      : eventToEdit.person
        ? [eventToEdit.person.id]
        : []) as number[];
    recurrenceStr = eventToEdit.recurrence?.freq ?? '';
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

      title = '';
      description = '';
      location = '';
      allDay = false;
      startDateStr = '';
      endDateStr = '';
      startTime = '12:00';
      endTime = '';
      tagId = null;
      tagIdStr = '';
      personIds = [];
      recurrence = null;
      recurrenceStr = '';
      prefilledForEventId = null;

      onCreated();
      onClose();
    } finally {
      saving = false;
    }
  }

  function closeIfBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function chooseTag(id: number | null) {
    tagIdStr = id == null ? '' : String(id);
    tagMenuOpen = false;
  }

  function choosePerson(id: number | null) {
    if (id == null) {
      personIds = [];
      personMenuOpen = false;
      return;
    }
    if (personIds.includes(id)) {
      personIds = personIds.filter((x) => x !== id);
    } else {
      personIds = [...personIds, id];
    }
  }

  function chooseRecurrence(v: '' | 'weekly' | 'monthly') {
    recurrenceStr = v;
    recurrenceMenuOpen = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;

    if (showDeleteConfirm) {
      showDeleteConfirm = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (tagMenuOpen) {
      tagMenuOpen = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (personMenuOpen) {
      personMenuOpen = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (recurrenceMenuOpen) {
      recurrenceMenuOpen = false;
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
</script>

<svelte:window on:keydown={onGlobalKeyDown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-[1000]" on:click={closeIfBackdrop} transition:fade={{ duration: 140 }}>
    <div class="absolute inset-0 bg-black/55 backdrop-blur-sm"></div>

    <div class="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto">
      <div
        class="w-full max-w-2xl max-h-[92vh] rounded-3xl glass border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        transition:fly={{ y: 12, duration: 220 }}
        role="dialog"
        aria-modal="true"
        tabindex="0"
        on:click={() => {
          tagMenuOpen = false;
          personMenuOpen = false;
          recurrenceMenuOpen = false;
        }}
      >
        <div class="p-6 md:p-8">
          <div class="flex items-center justify-between gap-4">
            <div class="text-xl font-semibold">{eventToEdit ? 'Termin bearbeiten' : 'Neuer Termin'}</div>
            <button
              type="button"
              class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 grid place-items-center"
              title="Schließen"
              on:click={onClose}
            >
              <svg class="w-5 h-5 text-white/70" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div class="px-6 md:px-8 pb-6 md:pb-8 overflow-auto flex-1 min-h-0">
          <div class="space-y-4">
            <!-- Title -->
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-white/50 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              <input class="flex-1 h-12 rounded-xl bg-black/30 border border-white/10 px-4 text-base placeholder:text-white/40" placeholder="Titel" bind:value={title} />
            </div>

            <!-- Location -->
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-white/50 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
              <input class="flex-1 h-12 rounded-xl bg-black/30 border border-white/10 px-4 text-base placeholder:text-white/40" placeholder="Ort" bind:value={location} />
            </div>

            <!-- All-day toggle -->
            <div class="flex items-center gap-3 pl-8">
              <label class="inline-flex items-center gap-3 select-none cursor-pointer">
                <input type="checkbox" class="h-5 w-5 rounded bg-black/30 border border-white/10" bind:checked={allDay} />
                <span class="text-white/60 text-sm">Ganztägig</span>
              </label>
            </div>

            <!-- Dates -->
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-white/50 shrink-0 mt-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <div class="flex-1 grid grid-cols-2 gap-3">
                <input class="h-12 w-full rounded-xl bg-black/30 border border-white/10 px-4 text-base" type="date" bind:value={startDateStr} />
                <input class="h-12 w-full rounded-xl bg-black/30 border border-white/10 px-4 text-base" type="date" bind:value={endDateStr} placeholder="Ende" />
              </div>
            </div>

            {#if tags.length > 0}
              <!-- Tag -->
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-white/50 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                <div class="flex-1 relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class="h-14 w-full rounded-xl bg-black/30 border border-white/10 text-lg px-4 flex items-center justify-between gap-3 hover:bg-black/35 active:bg-black/40 transition"
                    aria-haspopup="listbox"
                    aria-expanded={tagMenuOpen}
                    on:click={() => (tagMenuOpen = !tagMenuOpen)}
                  >
                    <div class="flex items-center gap-3 min-w-0">
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
                      <div class="truncate">{selectedTag ? selectedTag.name : 'Kein Tag'}</div>
                    </div>

                    <div class="text-white/60">▾</div>
                  </button>

                  {#if tagMenuOpen}
                    <div
                      class="absolute z-10 mt-2 w-full rounded-2xl overflow-hidden border border-white/10 bg-black/60 backdrop-blur-md"
                      role="listbox"
                    >
                      <button
                        type="button"
                        class={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/10 active:bg-white/15 transition ${tagId == null ? 'bg-white/10' : ''}`}
                        role="option"
                        aria-selected={tagId == null}
                        on:click={() => chooseTag(null)}
                      >
                        <div class="h-3 w-3 rounded-full bg-white/25"></div>
                        <div>Kein Tag</div>
                      </button>

                      {#each tags as t (t.id)}
                        <button
                          type="button"
                          class={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/10 active:bg-white/15 transition ${tagId === t.id ? 'bg-white/10' : ''}`}
                          role="option"
                          aria-selected={tagId === t.id}
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
              </div>
            {/if}

            {#if persons.length > 0}
              <!-- Persons -->
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-white/50 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                <div class="flex-1 relative" on:click|stopPropagation>
                  <button
                    type="button"
                    class="h-14 w-full rounded-xl bg-black/30 border border-white/10 text-lg px-4 flex items-center justify-between gap-3 hover:bg-black/35 active:bg-black/40 transition"
                    aria-haspopup="listbox"
                    aria-expanded={personMenuOpen}
                    on:click={() => (personMenuOpen = !personMenuOpen)}
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <div
                        class={`h-3 w-3 rounded-full ${primaryPerson
                          ? isHexColor(primaryPerson.color)
                            ? 'bg-transparent'
                            : tagBg[primaryPerson.color as TagColorKey] ?? 'bg-white/25'
                          : 'bg-white/25'}`}
                        style={primaryPerson && isHexColor(primaryPerson.color) ? `background-color: ${primaryPerson.color}` : ''}
                      ></div>
                      <div class="truncate">{selectedPersonLabel}</div>
                    </div>

                    <div class="text-white/60">▾</div>
                  </button>

                  {#if personMenuOpen}
                    <div
                      class="absolute z-10 mt-2 w-full rounded-2xl overflow-hidden border border-white/10 bg-black/60 backdrop-blur-md"
                      role="listbox"
                      aria-multiselectable="true"
                    >
                      <button
                        type="button"
                        class="w-full px-4 py-3 text-left hover:bg-white/10 active:bg-white/15 transition"
                        on:click={() => (personMenuOpen = false)}
                      >
                        <div class="text-white/70">Fertig</div>
                      </button>

                      <button
                        type="button"
                        class={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/10 active:bg-white/15 transition ${personIds.length === 0 ? 'bg-white/10' : ''}`}
                        role="option"
                        aria-selected={personIds.length === 0}
                        on:click={() => choosePerson(null)}
                      >
                        <div class="h-3 w-3 rounded-full bg-white/25"></div>
                        <div>Keine Person</div>
                      </button>

                      {#each persons as p (p.id)}
                        {@const selected = personIds.includes(p.id)}
                        <button
                          type="button"
                          class={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/10 active:bg-white/15 transition ${selected ? 'bg-white/10' : ''}`}
                          role="option"
                          aria-selected={selected}
                          on:click={() => choosePerson(p.id)}
                        >
                          <div class="flex items-center gap-3 min-w-0">
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
              </div>
            {/if}

            <!-- Times -->
            {#if !allDay}
              <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-white/50 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <div class="flex-1 grid grid-cols-2 gap-3">
                  <input class="h-12 rounded-xl bg-black/30 border border-white/10 px-4 text-base" type="time" bind:value={startTime} />
                  <input class="h-12 rounded-xl bg-black/30 border border-white/10 px-4 text-base" type="time" bind:value={endTime} />
                </div>
              </div>
            {/if}

            <!-- Recurrence -->
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-white/50 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <div class="flex-1 relative" on:click|stopPropagation>
                <button
                  type="button"
                  class="h-14 w-full rounded-xl bg-black/30 border border-white/10 text-lg px-4 flex items-center justify-between gap-3 hover:bg-black/35 active:bg-black/40 transition"
                  aria-haspopup="listbox"
                  aria-expanded={recurrenceMenuOpen}
                  on:click={() => (recurrenceMenuOpen = !recurrenceMenuOpen)}
                >
                  <div class="truncate">
                    {#if recurrenceStr === 'weekly'}
                      Wöchentlich
                    {:else if recurrenceStr === 'monthly'}
                      Monatlich
                    {:else}
                      Keine
                    {/if}
                  </div>

                  <div class="text-white/60">▾</div>
                </button>

                {#if recurrenceMenuOpen}
                  <div
                    class="absolute z-10 mt-2 w-full rounded-2xl overflow-hidden border border-white/10 bg-black/60 backdrop-blur-md"
                    role="listbox"
                  >
                    <button
                      type="button"
                      class={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/10 active:bg-white/15 transition ${recurrenceStr === '' ? 'bg-white/10' : ''}`}
                      role="option"
                      aria-selected={recurrenceStr === ''}
                      on:click={() => chooseRecurrence('')}
                    >
                      <div>Keine</div>
                    </button>

                    <button
                      type="button"
                      class={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/10 active:bg-white/15 transition ${recurrenceStr === 'weekly' ? 'bg-white/10' : ''}`}
                      role="option"
                      aria-selected={recurrenceStr === 'weekly'}
                      on:click={() => chooseRecurrence('weekly')}
                    >
                      <div>Wöchentlich</div>
                    </button>

                    <button
                      type="button"
                      class={`w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/10 active:bg-white/15 transition ${recurrenceStr === 'monthly' ? 'bg-white/10' : ''}`}
                      role="option"
                      aria-selected={recurrenceStr === 'monthly'}
                      on:click={() => chooseRecurrence('monthly')}
                    >
                      <div>Monatlich</div>
                    </button>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Description -->
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-white/50 shrink-0 mt-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7"/></svg>
              <textarea
                class="flex-1 min-h-[100px] rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-base placeholder:text-white/40 resize-none"
                placeholder="Beschreibung"
                bind:value={description}
              ></textarea>
            </div>
          </div>
        </div>

        <div class="px-6 md:px-8 py-4 border-t border-white/10 flex items-center gap-3 justify-end shrink-0">
          {#if eventToEdit}
            <button
              type="button"
              class="h-11 w-11 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 grid place-items-center"
              title="Termin löschen"
              on:click={() => (showDeleteConfirm = true)}
              disabled={saving}
            >
              <svg class="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          {/if}

          <div class="flex-1"></div>

          <button
            type="button"
            class="h-11 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
            on:click={onClose}
          >
            Abbrechen
          </button>
          <button
            type="button"
            class="h-11 px-5 rounded-xl bg-white/20 hover:bg-white/25 text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
            on:click={submit}
            disabled={saving}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            {eventToEdit ? 'Speichern' : 'Erstellen'}
          </button>
        </div>

        {#if showDeleteConfirm}
          <div class="absolute inset-0 z-20 grid place-items-center p-6">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" on:click={() => (showDeleteConfirm = false)}></div>
            <div class="relative w-full max-w-md rounded-3xl glass border border-white/10 p-6">
              <div class="text-2xl font-semibold">Termin löschen?</div>
              <div class="text-white/70 mt-2">Möchtest du diesen Termin wirklich löschen?</div>

              <div class="mt-6 flex flex-col md:flex-row gap-3 md:justify-end">
                <button
                  type="button"
                  class="h-14 px-6 rounded-xl bg-white/20 hover:bg-white/25 active:bg-white/30 text-lg font-semibold disabled:opacity-40"
                  on:click={confirmDelete}
                  disabled={saving}
                >
                  Löschen
                </button>
                <button
                  type="button"
                  class="h-14 px-6 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-lg"
                  on:click={() => (showDeleteConfirm = false)}
                  disabled={saving}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
