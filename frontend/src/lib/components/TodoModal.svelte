<script lang="ts">
  import { createTodo, updateTodo, type TodoItemDto } from '$lib/api';

  export let open: boolean;
  export let onClose: () => void;
  export let onSaved: () => void;

  export let mode: 'create' | 'edit' = 'create';
  export let item: TodoItemDto | null = null;

  let title = '';
  let description = '';
  let dateStr = '';
  let dueDateStr = '';
  let saving = false;
  let error: string | null = null;

  let prevOpen = false;
  let prefilledKey: string | null = null;

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
      dateStr = '';
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
