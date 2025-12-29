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
            <div class="text-2xl font-semibold">{eventToEdit ? 'Termin bearbeiten' : 'Neuer Termin'}</div>
            <button
              type="button"
              class="h-12 px-4 rounded-xl bg-white/10 hover:bg-white/15"
              on:click={onClose}
            >
              Schließen
            </button>
          </div>
        </div>

        <div class="px-6 md:px-8 pb-6 md:pb-8 overflow-auto flex-1 min-h-0">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input class="h-14 rounded-xl bg-black/30 border-white/10 text-lg" placeholder="Titel" bind:value={title} />
            <input class="h-14 rounded-xl bg-black/30 border-white/10 text-lg" placeholder="Ort" bind:value={location} />

            <div class="md:col-span-2">
              <label class="inline-flex items-center gap-3 select-none">
                <input type="checkbox" class="h-5 w-5" bind:checked={allDay} />
                <span class="text-white/65 text-lg">Ganztägig</span>
              </label>
            </div>

            <div>
              <div class="text-white/70 text-sm mb-2">Startdatum</div>
              <input class="h-14 w-full rounded-xl bg-black/30 border-white/10 text-lg px-4" type="date" bind:value={startDateStr} />
            </div>

            <div>
              <div class="text-white/70 text-sm mb-2">Enddatum (optional)</div>
              <input class="h-14 w-full rounded-xl bg-black/30 border-white/10 text-lg px-4" type="date" bind:value={endDateStr} />
            </div>

            {#if tags.length > 0}
              <div class="md:col-span-2">
                <div class="text-white/70 text-sm mb-2">Tag</div>

                <div class="relative" on:click|stopPropagation>
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
              <div class="md:col-span-2">
                <div class="text-white/70 text-sm mb-2">Personen</div>

                <div class="relative" on:click|stopPropagation>
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

            {#if !allDay}
              <input class="h-14 rounded-xl bg-black/30 border-white/10 text-lg" type="time" bind:value={startTime} />
              <input class="h-14 rounded-xl bg-black/30 border-white/10 text-lg" type="time" bind:value={endTime} />
            {:else}
              <div class="h-14 rounded-xl bg-black/20 border border-white/10 grid place-items-center text-white/60">—</div>
              <div class="h-14 rounded-xl bg-black/20 border border-white/10 grid place-items-center text-white/60">—</div>
            {/if}

            <div class="md:col-span-2">
              <div class="text-white/70 text-sm mb-2">Wiederholung</div>

              <div class="relative" on:click|stopPropagation>
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

            <textarea
              class="min-h-[120px] md:col-span-2 rounded-xl bg-black/30 border-white/10 text-lg"
              placeholder="Beschreibung"
              bind:value={description}
            ></textarea>
          </div>
        </div>

        <div class="px-6 md:px-8 py-5 border-t border-white/10 flex flex-col md:flex-row gap-3 md:justify-end shrink-0">
          {#if eventToEdit}
            <button
              type="button"
              class="h-14 px-6 rounded-xl bg-rose-500/15 hover:bg-rose-500/20 active:bg-rose-500/25 text-lg w-full md:w-auto"
              on:click={() => (showDeleteConfirm = true)}
              disabled={saving}
            >
              Termin löschen
            </button>
          {/if}

          <button
            type="button"
            class="h-14 px-6 rounded-xl bg-white/20 hover:bg-white/25 active:bg-white/30 text-lg font-semibold disabled:opacity-40 w-full md:w-auto"
            on:click={submit}
            disabled={saving}
          >
            {eventToEdit ? 'Änderungen speichern' : 'Termin speichern'}
          </button>
          <button
            type="button"
            class="h-14 px-6 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 text-lg w-full md:w-auto"
            on:click={onClose}
          >
            Abbrechen
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
