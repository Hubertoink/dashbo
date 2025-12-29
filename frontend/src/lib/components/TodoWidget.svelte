<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fetchTodos, updateTodo, type TodoItemDto } from '$lib/api';

  export let variant: 'panel' | 'plain' = 'panel';
  export let expanded = false;
  export let onToggleExpand: (() => void) | null = null;

  let listName = 'Dashbo';
  let items: TodoItemDto[] = [];
  let loading = true;
  let error: string | null = null;

  const saving = new Set<string>();
  let editingId: string | null = null;
  let editingTitle = '';
  let editInput: HTMLInputElement | null = null;

  const TODOS_CACHE_KEY = 'dashbo_todos_cache_v1';
  const TODOS_CACHE_TTL_MS = 5 * 60 * 1000;

  const HIDE_COMPLETED_AFTER_MS = 2 * 24 * 60 * 60 * 1000; // 2 Tage

  async function load(showLoading = true) {
    if (showLoading) loading = true;
    error = null;
    try {
      const r = await fetchTodos();
      listName = r.listName;
      items = r.items;

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(
            TODOS_CACHE_KEY,
            JSON.stringify({ at: Date.now(), listName: r.listName, items: r.items })
          );
        } catch {
          // ignore storage errors
        }
      }
    } catch (e: any) {
      error = e?.message || 'Fehler beim Laden';
    } finally {
      loading = false;
    }
  }

  async function toggleCompleted(item: TodoItemDto) {
    const key = `${item.connectionId}:${item.listId}:${item.taskId}`;
    saving.add(key);
    // Optimistic update: toggle immediately in UI
    const newCompleted = !item.completed;
    items = items.map((i) =>
      i.taskId === item.taskId && i.listId === item.listId && i.connectionId === item.connectionId
        ? { ...i, completed: newCompleted, status: newCompleted ? 'completed' : 'notStarted' }
        : i
    );
    // Re-sort after optimistic update
    items = items.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.title.localeCompare(b.title);
    });
    try {
      await updateTodo({
        connectionId: item.connectionId,
        listId: item.listId,
        taskId: item.taskId,
        completed: newCompleted,
      });
      // Background refresh without loading indicator
      await load(false);
    } catch (e: any) {
      error = e?.message || 'Fehler beim Speichern';
      // Revert on error
      await load(false);
    } finally {
      saving.delete(key);
    }
  }

  function startEdit(item: TodoItemDto) {
    editingId = item.taskId;
    editingTitle = item.title;
    void tick().then(() => editInput?.focus());
  }

  $: visibleItems = items.filter((item) => {
    if (!item.completed) return true;
    if (!item.completedAt) return true;
    const completedTs = new Date(item.completedAt).getTime();
    if (Number.isNaN(completedTs)) return true;
    const nowTs = Date.now();
    return nowTs - completedTs <= HIDE_COMPLETED_AFTER_MS;
  });

  $: containerClass =
    variant === 'plain' ? 'text-white' : 'rounded-lg bg-white/5 p-3 text-white';

  async function commitEdit(item: TodoItemDto) {
    if (!editingId) return;

    const newTitle = editingTitle.trim();
    editingId = null;

    if (!newTitle || newTitle === item.title) return;

    const key = `${item.connectionId}:${item.listId}:${item.taskId}`;
    saving.add(key);
    // Optimistic update for title
    items = items.map((i) =>
      i.taskId === item.taskId && i.listId === item.listId && i.connectionId === item.connectionId
        ? { ...i, title: newTitle }
        : i
    );
    try {
      await updateTodo({
        connectionId: item.connectionId,
        listId: item.listId,
        taskId: item.taskId,
        title: newTitle,
      });
      await load(false);
    } catch (e: any) {
      error = e?.message || 'Fehler beim Speichern';
      await load(false);
    } finally {
      saving.delete(key);
    }
  }

  function colorClass(name: string) {
    const n = String(name || '').toLowerCase();
    switch (n) {
      case 'red':
        return 'bg-red-500';
      case 'orange':
        return 'bg-orange-500';
      case 'amber':
        return 'bg-amber-500';
      case 'yellow':
        return 'bg-yellow-400';
      case 'lime':
        return 'bg-lime-500';
      case 'green':
        return 'bg-green-500';
      case 'emerald':
        return 'bg-emerald-500';
      case 'teal':
        return 'bg-teal-500';
      case 'cyan':
        return 'bg-cyan-500';
      case 'sky':
        return 'bg-sky-500';
      case 'blue':
        return 'bg-blue-500';
      case 'indigo':
        return 'bg-indigo-500';
      case 'violet':
        return 'bg-violet-500';
      case 'purple':
        return 'bg-purple-500';
      case 'fuchsia':
        return 'bg-fuchsia-500';
      case 'pink':
        return 'bg-pink-500';
      case 'rose':
        return 'bg-rose-500';
      case 'slate':
        return 'bg-slate-500';
      case 'gray':
        return 'bg-gray-500';
      case 'zinc':
        return 'bg-zinc-500';
      case 'neutral':
        return 'bg-neutral-500';
      case 'stone':
        return 'bg-stone-500';
      default:
        return 'bg-cyan-500';
    }
  }

  onMount(() => {
    // Try cache first so the widget appears instantly when switching screens.
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(TODOS_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { at?: number; listName?: string; items?: TodoItemDto[] };
          const at = typeof parsed?.at === 'number' ? parsed.at : 0;
          const isFresh = at > 0 && Date.now() - at <= TODOS_CACHE_TTL_MS;
          if (isFresh && typeof parsed?.listName === 'string' && Array.isArray(parsed?.items)) {
            listName = parsed.listName;
            items = parsed.items;
            loading = false;
          }
        }
      } catch {
        // ignore cache errors
      }
    }

    // Always refresh in background.
    void load(false);
    const t = setInterval(() => void load(false), 60_000);
    return () => clearInterval(t);
  });
</script>

<!-- Only render when there are visible items (graceful hide when To Do not available) -->
{#if visibleItems.length > 0}
<div class="{containerClass} {expanded ? 'flex-1 flex flex-col' : ''}">
  <div class="mb-2 flex items-center justify-between">
    <div class="text-base font-semibold">To Do</div>
    {#if onToggleExpand}
      <button
        type="button"
        class="p-1 rounded hover:bg-white/10 transition-colors"
        on:click|stopPropagation={onToggleExpand}
        title={expanded ? 'Verkleinern' : 'Vergrößern'}
      >
        <svg class="w-4 h-4 text-white/60" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          {#if expanded}
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 14h6m0 0v6m0-6L3 21M20 10h-6m0 0V4m0 6l7-7" />
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          {/if}
        </svg>
      </button>
    {/if}
  </div>
    <div class="space-y-2 {expanded ? 'flex-1 overflow-y-auto' : ''}">
      {#each visibleItems.slice(0, expanded ? 20 : 5) as item (item.taskId)}
        {@const key = `${item.connectionId}:${item.listId}:${item.taskId}`}
        <div class="flex items-center gap-2">
          <button
            class="h-6 w-6 rounded border border-white/30 flex items-center justify-center"
            on:click={() => toggleCompleted(item)}
            disabled={saving.has(key)}
            aria-label="Toggle completed"
          >
            {#if item.completed}
              <span class="text-sm">✓</span>
            {/if}
          </button>

          <div class={`h-2.5 w-2.5 rounded-full ${colorClass(item.color)}`} title={item.connectionLabel}></div>

          {#if editingId === item.taskId}
            <input
              class="flex-1 rounded bg-white/10 px-2 py-1 text-sm outline-none"
              bind:value={editingTitle}
              bind:this={editInput}
              on:blur={() => commitEdit(item)}
              on:keydown={(e) => {
                if (e.key === 'Enter') {
                  const el = e.currentTarget;
                  if (el instanceof HTMLInputElement) el.blur();
                }
                if (e.key === 'Escape') editingId = null;
              }}
            />
          {:else}
            <button
              class={`flex-1 text-left text-base truncate ${item.completed ? 'line-through opacity-60' : ''}`}
              on:click={() => startEdit(item)}
              title={item.title}
            >
              {item.title}
            </button>
          {/if}
        </div>
      {/each}
    </div>
</div>
{/if}
