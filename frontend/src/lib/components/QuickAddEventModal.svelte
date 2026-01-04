<script lang="ts">
  import {
    createEvent,
    createTodo,
    fetchTodos,
    listOutlookConnections,
    listPersons,
    listTags,
    type OutlookConnectionDto,
    type PersonDto,
    type TagDto,
    type TagColorKey
  } from '$lib/api';
  import { fade, fly, scale } from 'svelte/transition';

  export let open: boolean;
  export let prefilledDate: Date;
  export let prefillTitle: string | null = null;
  export let prefillStartTime: string | null = null;
  export let prefillEndTime: string | null = null;
  export let prefillAllDay: boolean | null = null;
  export let prefillPersonIds: number[] | null = null;
  export let prefillTagId: number | null = null;
  export let outlookConnected = false;
  export let todoEnabled = true;
  export let onClose: () => void;
  export let onCreated: () => void;

  let title = '';
  let startTime = '12:00';
  let endTime = '';
  let allDay = false;
  let personIds: number[] = [];
  let tagId: number | null = null;
  let saving = false;

  // Optional ToDos created alongside the event
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

  let tags: TagDto[] = [];
  let persons: PersonDto[] = [];
  let dataLoaded = false;

  let lastPrefillKey = '';

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

  async function loadData() {
    try {
      [tags, persons] = await Promise.all([listTags(), listPersons()]);
    } catch {
      tags = [];
      persons = [];
    }

    if (outlookConnected && todoEnabled) {
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
  }

  $: if (open && !dataLoaded) {
    dataLoaded = true;
    void loadData();
  }

  function normalizeHhMm(v: string | null): string | null {
    if (!v) return null;
    const m = String(v).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!m) return null;
    const hh = m[1].padStart(2, '0');
    const mm = m[2];
    return `${hh}:${mm}`;
  }

  $: if (open) {
    const key = JSON.stringify({
      d: yyyymmddLocal(prefilledDate),
      t: prefillTitle ?? null,
      st: prefillStartTime ?? null,
      et: prefillEndTime ?? null,
      ad: prefillAllDay ?? null,
      ps: Array.isArray(prefillPersonIds) ? prefillPersonIds : null,
      tag: prefillTagId ?? null
    });
    if (key !== lastPrefillKey) {
      lastPrefillKey = key;
      if (prefillTitle != null) title = String(prefillTitle);
      const st = normalizeHhMm(prefillStartTime);
      if (st) startTime = st;
      const et = normalizeHhMm(prefillEndTime);
      if (prefillEndTime === '') {
        endTime = '';
      } else if (et) {
        endTime = et;
      }
      if (prefillAllDay != null) allDay = Boolean(prefillAllDay);
      if (Array.isArray(prefillPersonIds)) personIds = prefillPersonIds.slice(0, 20);
      if (prefillTagId !== undefined) tagId = prefillTagId;
    }
  }

  $: if (!open) {
    dataLoaded = false;
    lastPrefillKey = '';
    resetForm();
  }

  function resetForm() {
    title = '';
    startTime = '12:00';
    endTime = '';
    allDay = false;
    personIds = [];
    tagId = null;
    saving = false;
    todoText = '';
    todoSaving = false;
    todoError = null;
    todoAccountMenuOpen = false;
  }

  function yyyymmddLocal(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  function togglePerson(id: number) {
    if (personIds.includes(id)) {
      personIds = personIds.filter(p => p !== id);
    } else {
      personIds = [...personIds, id];
    }
  }

  function haptic(pattern: number | number[] = 10) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }

  // Use local noon to avoid timezone offsets pushing the ISO date to the previous/next day.
  function isoNoonLocal(d: Date): string {
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    return x.toISOString();
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

  async function submit() {
    if (!title.trim() || saving) return;
    saving = true;
    haptic(15);

    try {
      const dateStr = yyyymmddLocal(prefilledDate);
      const startAtIso = allDay ? toIsoFromDateStr(dateStr, '00:00') : toIsoFromDateStr(dateStr, startTime);
      const endAtIso = allDay ? endOfDayIso(dateStr) : (endTime ? toIsoFromDateStr(dateStr, endTime) : null);

      await createEvent({
        title: title.trim(),
        description: null,
        location: null,
        startAt: startAtIso,
        endAt: endAtIso,
        allDay,
        tagId,
        personIds: personIds.length > 0 ? personIds : null,
        recurrence: null
      });

      // Optional: create ToDos from textarea lines
      const todoLines = outlookConnected && todoEnabled ? parseTodos(todoText) : [];
      if (todoLines.length > 0) {
        todoSaving = true;
        todoError = null;

        const dueAt = isoNoonLocal(prefilledDate);
        const listName = todoSelectedListName || (todoListNames && todoListNames.length > 0 ? todoListNames[0] : todoListName) || '';
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

      haptic([10, 50, 10]);
      onCreated();
      onClose();
    } catch (err) {
      console.error('Quick add event failed:', err);
      haptic([50, 30, 50, 30, 50]);
    } finally {
      saving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey && title.trim()) {
      e.preventDefault();
      submit();
    }
  }

  $: dateLabel = prefilledDate.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
    transition:fade={{ duration: 200 }}
    on:click|self={onClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="quick-add-title"
  >
    <!-- Modal Panel -->
    <div
      class="w-full sm:max-w-md bg-neutral-900/95 backdrop-blur-xl border-t sm:border border-white/10 sm:rounded-2xl overflow-hidden"
      in:fly={{ y: 100, duration: 250, delay: 50 }}
      out:fly={{ y: 100, duration: 200 }}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <h2 id="quick-add-title" class="text-lg font-semibold">Neuer Termin</h2>
          <p class="text-sm text-white/60">{dateLabel}</p>
        </div>
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

      <!-- Form -->
      <form on:submit|preventDefault={submit} class="p-4 space-y-4">
        <!-- Title -->
        <div>
          <input
            type="text"
            bind:value={title}
            placeholder="Was ist geplant?"
            class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-lg placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition"
            autofocus
          />
        </div>

        <!-- Time Row -->
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={allDay}
              class="w-5 h-5 rounded bg-white/10 border-white/20 text-emerald-500 focus:ring-emerald-500/50"
            />
            <span class="text-sm">Ganztägig</span>
          </label>

          {#if !allDay}
            <div class="flex items-center gap-2 flex-1" transition:fade={{ duration: 150 }}>
              <input
                type="time"
                bind:value={startTime}
                class="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <span class="text-white/40">–</span>
              <input
                type="time"
                bind:value={endTime}
                placeholder="Ende"
                class="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
          {/if}
        </div>

        <!-- Person Chips -->
        {#if persons.length > 0}
          <div>
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
          <div>
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
          <div>
            <div class="text-xs text-white/50 mb-2">ToDos (optional)</div>

            {#if outlookConnections.length === 0}
              <div class="text-xs text-white/50">Keine Outlook-Verbindung gefunden.</div>
            {/if}

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

            <div>
              <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Was muss gemacht werden?</div>
              <textarea
                class="w-full min-h-[72px] px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
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
        {/if}

        <!-- Submit Button -->
        <button
          type="submit"
          disabled={!title.trim() || saving || todoSaving}
          class="w-full py-3 rounded-xl font-semibold text-lg transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white"
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
            Termin erstellen
          {/if}
        </button>
      </form>
    </div>
  </div>
{/if}
