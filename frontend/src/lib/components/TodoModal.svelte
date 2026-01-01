<script lang="ts">
  import { createTodo, updateTodo, type TodoItemDto } from '$lib/api';

  export let open: boolean;
  export let onClose: () => void;
  export let onSaved: () => void;

  export let mode: 'create' | 'edit' = 'create';
  export let item: TodoItemDto | null = null;

  export let listNames: string[] = [];
  export let selectedListName: string = '';
  export let onChangeListName: (value: string) => void = () => {};

  export let connections: Array<{ id: number; label: string; color?: string }> = [];
  export let selectedConnectionId: number | null = null;
  export let onChangeConnectionId: (value: number | null) => void = () => {};

  let title = '';
  let description = '';
  let dateStr = '';
  let dueDateStr = '';
  let saving = false;
  let error: string | null = null;

  let prevOpen = false;
  let prefilledKey: string | null = null;

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

  $: selectedConnection =
    selectedConnectionId != null ? connections.find((c) => c.id === selectedConnectionId) : null;

  function yyyymmddLocalFromIso(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function toIsoStartOfDay(date: string): string | null {
    if (!date) return null;
    const [y, mo, da] = date.split('-').map((x) => Number(x));
    if (!y || !mo || !da) return null;
    const d = new Date();
    d.setFullYear(y, mo - 1, da);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  $: if (!open) {
    saving = false;
    error = null;
    prevOpen = false;
    prefilledKey = null;
  }

  $: if (open && !prevOpen) {
    error = null;

    if (mode === 'edit' && item) {
      const key = `${item.connectionId}:${item.listId}:${item.taskId}`;
      if (prefilledKey !== key) {
        prefilledKey = key;
        title = item.title ?? '';
        description = item.bodyPreview ?? '';
        dateStr = yyyymmddLocalFromIso(item.startAt ?? null);
        dueDateStr = yyyymmddLocalFromIso(item.dueAt);
      }
    } else {
      title = '';
      description = '';
      dateStr = yyyymmddLocalFromIso(new Date().toISOString());
      dueDateStr = '';
    }

    prevOpen = true;
  }

  async function submit() {
    if (saving) return;
    if (!title.trim()) {
      error = 'Bitte einen Namen eingeben.';
      return;
    }

    saving = true;
    error = null;

    const startAt = dateStr ? toIsoStartOfDay(dateStr) : null;
    const dueAt = dueDateStr ? toIsoStartOfDay(dueDateStr) : null;
    const desc = description.trim() ? description.trim() : null;

    try {
      if (mode === 'edit' && item) {
        await updateTodo({
          connectionId: item.connectionId,
          listId: item.listId,
          taskId: item.taskId,
          title: title.trim(),
          description: desc,
          startAt,
          dueAt,
        });
      } else {
        await createTodo({
          ...(selectedConnectionId != null ? { connectionId: selectedConnectionId } : {}),
          ...(selectedListName && selectedListName.trim() ? { listName: selectedListName.trim() } : {}),
          title: title.trim(),
          description: desc,
          startAt,
          dueAt,
        });
      }

      onSaved();
      onClose();
    } catch (e: any) {
      error = e?.message || 'Fehler beim Speichern';
    } finally {
      saving = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    on:click={(e) => e.currentTarget === e.target && onClose()}
  >
    <div class="absolute inset-0 bg-black/70"></div>
    <div class="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border border-white/10">
      <div class="font-semibold text-lg mb-1">{mode === 'edit' ? 'ToDo bearbeiten' : 'ToDo erstellen'}</div>

      <div class="space-y-3 mt-4">
        {#if mode === 'create' && Array.isArray(connections) && connections.length > 1}
          <div>
            <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Konto</div>
            <div class="relative">
              <span
                class={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ${connectionColorClass(
                  selectedConnection?.color
                )}`}
              ></span>
              <select
                class="w-full h-10 pl-8 pr-10 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90 appearance-none focus:outline-none focus:ring-2 focus:ring-white/10"
                value={selectedConnectionId ?? ''}
                on:change={(e) => {
                  const el = e.currentTarget;
                  if (!(el instanceof HTMLSelectElement)) return;
                  const v = el.value;
                  onChangeConnectionId(v ? Number(v) : null);
                }}
              >
                {#each connections as c}
                  <option class="bg-zinc-900 text-white" value={String(c.id)}>{c.label}</option>
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

        {#if mode === 'create' && Array.isArray(listNames) && listNames.length > 1}
          <div>
            <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Liste</div>
            <div class="relative">
              <select
                class="w-full h-10 px-3 pr-10 rounded-lg bg-white/10 border border-white/10 text-sm text-white/90 appearance-none focus:outline-none focus:ring-2 focus:ring-white/10"
                value={selectedListName}
                on:change={(e) => {
                  const el = e.currentTarget;
                  if (el instanceof HTMLSelectElement) onChangeListName(el.value);
                }}
              >
                {#each listNames as ln}
                  <option class="bg-zinc-900 text-white" value={ln}>{ln}</option>
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
          <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Name</div>
          <input
            class="w-full h-10 px-3 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
            placeholder="z.B. Einkaufsliste"
            bind:value={title}
          />
        </div>

        <div>
          <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Beschreibung</div>
          <textarea
            class="w-full min-h-[80px] px-3 py-2 rounded-lg bg-white/10 border-0 text-sm placeholder:text-white/40"
            placeholder="Optional"
            bind:value={description}
          ></textarea>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Datum</div>
            <input
              class="w-full h-10 px-3 rounded-lg bg-white/10 border-0 text-sm"
              type="date"
              bind:value={dateStr}
            />
          </div>

          <div>
            <div class="text-[11px] uppercase tracking-widest text-white/45 mb-1">Fälligkeitsdatum</div>
            <input
              class="w-full h-10 px-3 rounded-lg bg-white/10 border-0 text-sm"
              type="date"
              bind:value={dueDateStr}
            />
          </div>
        </div>

        {#if error}
          <div class="text-red-400 text-xs">{error}</div>
        {/if}
      </div>

      <div class="flex gap-2 mt-5">
        <button
          class="flex-1 h-10 rounded-lg bg-white/20 hover:bg-white/25 text-sm font-medium disabled:opacity-50"
          on:click={submit}
          disabled={saving}
        >
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        <button
          class="flex-1 h-10 rounded-lg bg-white/10 hover:bg-white/15 text-sm"
          on:click={onClose}
          disabled={saving}
        >
          Abbrechen
        </button>
      </div>
    </div>
  </div>
{/if}
