<script lang="ts">
  import type { TodoItemDto } from '$lib/api';

  export let items: TodoItemDto[] = [];
  export let selectedDate: Date;
  export let onToggleTodo: (item: TodoItemDto) => void;
  export let onAddTodo: (dueDate: Date) => void;

  function dueLabel(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('de-DE', { weekday: 'short' });
  }

  function handleDragStart(e: DragEvent, todo: TodoItemDto) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-dashbo-todo', JSON.stringify({
      connectionId: todo.connectionId,
      listId: todo.listId,
      taskId: todo.taskId,
      title: todo.title
    }));
  }
</script>

<div class="border-t border-white/10 px-4 py-3">
  <div class="flex items-center gap-2">
    <div class="text-xs text-white/50 shrink-0" title="ToDos ohne Fälligkeitsdatum – auf einen Tag ziehen um Fälligkeit zu setzen">📥 Inbox</div>

    <div class="flex-1 overflow-x-auto">
      <div class="flex items-center gap-2 min-w-max">
        {#each items as t (t.taskId + ':' + t.listId + ':' + t.connectionId)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            draggable="true"
            on:dragstart={(e) => handleDragStart(e, t)}
            class="cursor-grab active:cursor-grabbing"
          >
            <button
              type="button"
              class={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-sm transition active:scale-[0.98] ${
                t.completed
                  ? 'bg-white/5 border-white/10 text-white/40'
                  : 'bg-white/10 border-white/15 text-white/85 hover:bg-white/15'
              }`}
              on:click={() => onToggleTodo(t)}
              title="Klicken zum Abhaken · Ziehen um Fälligkeit zu setzen"
            >
            <span
              class={`w-4 h-4 rounded border grid place-items-center ${
                t.completed ? 'bg-emerald-500/40 border-emerald-400/70' : 'border-white/30'
              }`}
              aria-hidden="true"
            >
              {#if t.completed}
                <svg class="w-3 h-3 text-emerald-200" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              {/if}
            </span>

            <span class={`truncate max-w-[240px] ${t.completed ? 'line-through' : ''}`}>{t.title}</span>
            {#if t.dueAt}
              <span class="text-xs text-white/45">({dueLabel(t.dueAt)})</span>
            {/if}
            </button>
          </div>
        {/each}

        {#if items.length === 0}
          <div class="text-sm text-white/40">Alle ToDos haben ein Fälligkeitsdatum</div>
        {/if}
      </div>
    </div>

    <button
      type="button"
      class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center"
      on:click={() => onAddTodo(selectedDate)}
      aria-label="ToDo hinzufügen"
      title="ToDo hinzufügen"
    >
      <svg class="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
</div>
