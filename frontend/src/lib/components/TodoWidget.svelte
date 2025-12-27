<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { fetchTodos, updateTodo, type TodoItemDto } from '$lib/api';

  let listName = 'Dashbo';
  let items: TodoItemDto[] = [];
  let loading = true;
  let error: string | null = null;

  const saving = new Set<string>();
  let editingId: string | null = null;
  let editingTitle = '';
  let editInput: HTMLInputElement | null = null;

  async function load() {
    loading = true;
    error = null;
    try {
      const r = await fetchTodos();
      listName = r.listName;
      items = r.items;
    } catch (e: any) {
      error = e?.message || 'Fehler beim Laden';
    } finally {
      loading = false;
    }
  }

  async function toggleCompleted(item: TodoItemDto) {
    const key = `${item.connectionId}:${item.listId}:${item.taskId}`;
    saving.add(key);
    try {
      await updateTodo({
        connectionId: item.connectionId,
        listId: item.listId,
        taskId: item.taskId,
        completed: !item.completed,
      });
      await load();
    } catch (e: any) {
      error = e?.message || 'Fehler beim Speichern';
    } finally {
      saving.delete(key);
    }
  }

  function startEdit(item: TodoItemDto) {
    editingId = item.taskId;
    editingTitle = item.title;
    void tick().then(() => editInput?.focus());
  }

  async function commitEdit(item: TodoItemDto) {
    if (!editingId) return;

    const newTitle = editingTitle.trim();
    editingId = null;

    if (!newTitle || newTitle === item.title) return;

    const key = `${item.connectionId}:${item.listId}:${item.taskId}`;
    saving.add(key);
    try {
      await updateTodo({
        connectionId: item.connectionId,
        listId: item.listId,
        taskId: item.taskId,
        title: newTitle,
      });
      await load();
    } catch (e: any) {
      error = e?.message || 'Fehler beim Speichern';
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
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  });
</script>

<!-- Only render when there are items (graceful hide when To Do not available) -->
{#if !loading && items.length > 0}
<div class="rounded-lg bg-white/5 p-3 text-white">
  <div class="mb-2 flex items-center justify-between">
    <div class="text-sm font-semibold">To Do</div>
    <div class="text-xs opacity-80">{listName}</div>
  </div>
    <div class="space-y-2">
      {#each items.slice(0, 6) as item (item.taskId)}
        {@const key = `${item.connectionId}:${item.listId}:${item.taskId}`}
        <div class="flex items-center gap-2">
          <button
            class="h-5 w-5 rounded border border-white/30 flex items-center justify-center"
            on:click={() => toggleCompleted(item)}
            disabled={saving.has(key)}
            aria-label="Toggle completed"
          >
            {#if item.completed}
              <span class="text-xs">✓</span>
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
              class={`flex-1 text-left text-sm ${item.completed ? 'line-through opacity-60' : ''}`}
              on:click={() => startEdit(item)}
              title={item.connectionLabel}
            >
              {item.title}
            </button>
          {/if}
        </div>
      {/each}
    </div>
</div>
{/if}
