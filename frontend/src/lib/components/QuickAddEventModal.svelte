<script lang="ts">
  import { createEvent, listPersons, listTags, type PersonDto, type TagDto, type TagColorKey } from '$lib/api';
  import { fade, fly, scale } from 'svelte/transition';

  export let open: boolean;
  export let prefilledDate: Date;
  export let onClose: () => void;
  export let onCreated: () => void;

  let title = '';
  let startTime = '12:00';
  let endTime = '';
  let allDay = false;
  let personIds: number[] = [];
  let tagId: number | null = null;
  let saving = false;

  let tags: TagDto[] = [];
  let persons: PersonDto[] = [];
  let dataLoaded = false;

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

  const personBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500/20 border-fuchsia-400 text-fuchsia-300',
    cyan: 'bg-cyan-400/20 border-cyan-400 text-cyan-300',
    emerald: 'bg-emerald-400/20 border-emerald-400 text-emerald-300',
    amber: 'bg-amber-400/20 border-amber-400 text-amber-200',
    rose: 'bg-rose-400/20 border-rose-400 text-rose-300',
    violet: 'bg-violet-400/20 border-violet-400 text-violet-300',
    sky: 'bg-sky-400/20 border-sky-400 text-sky-300',
    lime: 'bg-lime-400/20 border-lime-400 text-lime-300'
  };

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && hexRe.test(value);
  }

  async function loadData() {
    try {
      [tags, persons] = await Promise.all([listTags(), listPersons()]);
    } catch {
      tags = [];
      persons = [];
    }
  }

  $: if (open && !dataLoaded) {
    dataLoaded = true;
    void loadData();
  }

  $: if (!open) {
    dataLoaded = false;
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
                <button
                  type="button"
                  class={`px-3 py-1.5 rounded-full text-sm font-medium border transition active:scale-95 ${
                    selected
                      ? personBg[p.color as TagColorKey] ?? 'bg-white/20 border-white/40 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                  on:click={() => togglePerson(p.id)}
                >
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

        <!-- Submit Button -->
        <button
          type="submit"
          disabled={!title.trim() || saving}
          class="w-full py-3 rounded-xl font-semibold text-lg transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {#if saving}
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
