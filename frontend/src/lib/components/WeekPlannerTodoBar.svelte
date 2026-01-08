<script lang="ts">
  import type { TodoItemDto } from '$lib/api';
  import { fly, fade } from 'svelte/transition';

  export let items: TodoItemDto[] = [];
  export let selectedDate: Date;
  export let onToggleTodo: (item: TodoItemDto) => void;

  // Quick add (title-only)
  export let quickAddText: string = '';
  export let quickAddSaving: boolean = false;
  export let onQuickAdd: () => void = () => {};

  // Drag hinting
  export let onTodoDragActiveChange: (active: boolean) => void = () => {};

  // Collapsed state for floating input
  let isExpanded = false;
  let inputEl: HTMLInputElement | null = null;

  function toggleExpand() {
    isExpanded = !isExpanded;
    if (isExpanded) {
      // Focus input after expansion animation
      setTimeout(() => inputEl?.focus(), 100);
    }
  }

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
    onTodoDragActiveChange(true);
  }

  function handleDragEnd() {
    onTodoDragActiveChange(false);
  }

  function onQuickKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      isExpanded = false;
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (quickAddSaving) return;
    if (!quickAddText || !quickAddText.trim()) return;
    onQuickAdd();
    // Keep expanded for quick successive adds
  }

  function handleQuickAddClick() {
    if (!quickAddText.trim()) return;
    onQuickAdd();
  }
</script>

<!-- Floating ToDo Add Button and Expandable Input -->
<div class="fixed z-[55] left-4 transition-all duration-200" style="bottom: calc(1rem + env(safe-area-inset-bottom));">
  {#if isExpanded}
    <!-- Expanded input panel -->
    <div
      class="flex items-center gap-2 bg-neutral-900/95 backdrop-blur-xl border border-white/15 rounded-2xl p-2 shadow-xl"
      in:fly={{ x: -20, duration: 200 }}
      out:fly={{ x: -20, duration: 150 }}
    >
      <!-- Close button -->
      <button
        type="button"
        class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center shrink-0"
        aria-label="Schließen"
        on:click={toggleExpand}
      >
        <svg class="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <!-- Input field -->
      <input
        bind:this={inputEl}
        class="w-56 h-10 px-3 rounded-xl bg-white/10 border border-white/10 text-sm text-white/90 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
        placeholder="ToDo hinzufügen…"
        bind:value={quickAddText}
        on:keydown={onQuickKeyDown}
        disabled={quickAddSaving}
      />

      <!-- Add button -->
      <button
        type="button"
        class="h-10 w-10 rounded-xl bg-emerald-500/30 hover:bg-emerald-500/40 active:scale-95 transition grid place-items-center disabled:opacity-50 shrink-0"
        aria-label="ToDo hinzufügen"
        title="ToDo hinzufügen"
        on:click={handleQuickAddClick}
        disabled={quickAddSaving || !quickAddText.trim()}
      >
        {#if quickAddSaving}
          <svg class="w-5 h-5 text-white/80 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        {:else}
          <svg class="w-5 h-5 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        {/if}
      </button>
    </div>
  {:else}
    <!-- Collapsed icon button -->
    <button
      type="button"
      class="h-12 w-12 rounded-full bg-neutral-800/90 backdrop-blur-xl border border-white/15 shadow-lg hover:bg-neutral-700/90 active:scale-95 transition grid place-items-center"
      aria-label="ToDo hinzufügen"
      title="ToDo hinzufügen"
      on:click={toggleExpand}
      in:fade={{ duration: 150 }}
    >
      <svg class="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    </button>
  {/if}
</div>

<!-- Inbox todos horizontal strip (only when there are items) -->
{#if items.length > 0}
  <div class="border-t border-white/10 px-4 py-2">
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 text-xs text-white/50 shrink-0" title="ToDos ohne Fälligkeitsdatum – auf einen Tag ziehen um Fälligkeit zu setzen">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        Inbox
      </div>

      <div class="flex-1 overflow-x-auto">
        <div class="flex items-center gap-2 min-w-max">
          {#each items as t (t.taskId + ':' + t.listId + ':' + t.connectionId)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              draggable="true"
              on:dragstart={(e) => handleDragStart(e, t)}
              on:dragend={handleDragEnd}
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
        </div>
      </div>
    </div>
  </div>
{/if}