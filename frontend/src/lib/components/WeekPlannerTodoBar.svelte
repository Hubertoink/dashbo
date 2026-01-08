<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { TodoItemDto } from '$lib/api';
  import { fly, fade } from 'svelte/transition';

  export let items: TodoItemDto[] = [];
  export let onToggleTodo: (item: TodoItemDto) => void;

  // Needed for pointer-based drop target mapping
  export let days: Date[] = [];
  export let onTodoDrop: (todoData: { connectionId: number; listId: string; taskId: string; title: string }, targetDate: Date) => void = () => {};
  export let onTodoDragOverDayChange: (dayKey: number | null) => void = () => {};

  // Quick add (title-only)
  export let quickAddText: string = '';
  export let quickAddSaving: boolean = false;
  export let onQuickAdd: () => void = () => {};

  // Open full create modal (optional)
  export let onOpenCreateModal: (() => void) | null = null;

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

  function startOfLocalDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dayKey(d: Date): number {
    return startOfLocalDay(d).getTime();
  }

  $: dayByKey = new Map(days.map((d) => [dayKey(d), d] as const));

  type DragTodoData = { connectionId: number; listId: string; taskId: string; title: string };
  let dragTodo: {
    pointerId: number;
    todo: TodoItemDto;
    data: DragTodoData;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    x: number;
    y: number;
    dragging: boolean;
    overDayKey: number | null;
  } | null = null;

  let suppressNextClick = false;

  function findDayKeyAtPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const host = (el?.closest?.('[data-weekplanner-daykey]') as HTMLElement | null) ?? null;
    if (!host) return null;
    const raw = host.getAttribute('data-weekplanner-daykey') || (host as any).dataset?.weekplannerDaykey;
    const n = raw != null ? Number(raw) : Number.NaN;
    return Number.isFinite(n) ? n : null;
  }

  function clearPointerDrag() {
    if (dragTodo?.dragging) {
      onTodoDragActiveChange(false);
      onTodoDragOverDayChange(null);
    }
    dragTodo = null;
  }

  onDestroy(() => {
    clearPointerDrag();
  });

  function startTodoPointerDrag(e: PointerEvent, todo: TodoItemDto, el: HTMLElement) {
    // Only left mouse button; touch/pen always ok
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (dragTodo) return;

    const rect = el.getBoundingClientRect();
    const offsetX = clamp(e.clientX - rect.left, 0, rect.width);
    const offsetY = clamp(e.clientY - rect.top, 0, rect.height);

    dragTodo = {
      pointerId: e.pointerId,
      todo,
      data: { connectionId: todo.connectionId, listId: todo.listId, taskId: todo.taskId, title: todo.title },
      startX: e.clientX,
      startY: e.clientY,
      offsetX,
      offsetY,
      x: e.clientX - offsetX,
      y: e.clientY - offsetY,
      dragging: false,
      overDayKey: null
    };

    el.setPointerCapture(e.pointerId);
  }

  function moveTodoPointerDrag(e: PointerEvent) {
    if (!dragTodo || e.pointerId !== dragTodo.pointerId) return;
    dragTodo.x = e.clientX - dragTodo.offsetX;
    dragTodo.y = e.clientY - dragTodo.offsetY;

    if (!dragTodo.dragging) {
      const dx = e.clientX - dragTodo.startX;
      const dy = e.clientY - dragTodo.startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        dragTodo.dragging = true;
        onTodoDragActiveChange(true);
      }
    }

    if (dragTodo.dragging) {
      const k = findDayKeyAtPoint(e.clientX, e.clientY);
      if (k !== dragTodo.overDayKey) {
        dragTodo.overDayKey = k;
        onTodoDragOverDayChange(k);
      }
    }
  }

  function endTodoPointerDrag(e: PointerEvent, el: HTMLElement) {
    if (!dragTodo || e.pointerId !== dragTodo.pointerId) return;
    el.releasePointerCapture?.(e.pointerId);

    if (dragTodo.dragging) {
      suppressNextClick = true;
      queueMicrotask(() => (suppressNextClick = false));

      const k = dragTodo.overDayKey;
      if (k != null) {
        const day = dayByKey.get(k);
        if (day) {
          onTodoDrop(dragTodo.data, new Date(day));
        }
      }
    }

    clearPointerDrag();
  }

  function cancelTodoPointerDrag(e: PointerEvent, el: HTMLElement) {
    if (!dragTodo || e.pointerId !== dragTodo.pointerId) return;
    el.releasePointerCapture?.(e.pointerId);
    clearPointerDrag();
  }

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
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

  function handleOpenCreateModal() {
    if (!onOpenCreateModal) return;
    onOpenCreateModal();
    isExpanded = false;
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

      {#if onOpenCreateModal}
        <!-- Open full create modal -->
        <button
          type="button"
          class="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center shrink-0"
          aria-label="ToDo erstellen (Erweitert)"
          title="ToDo erstellen (Erweitert)"
          on:click={handleOpenCreateModal}
        >
          <svg class="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        </button>
      {/if}
    </div>
  {:else}
    <!-- Collapsed icon button -->
    <button
      type="button"
      class="h-12 w-12 rounded-full bg-neutral-800/90 backdrop-blur-xl border border-white/15 shadow-lg hover:bg-neutral-700/90 active:scale-95 transition grid place-items-center"
      aria-label="ToDo hinzufügen"
      title="ToDo hinzufügen"
      on:click={toggleExpand}
      in:fade={{ duration: 150, delay: 150 }}
      out:fade={{ duration: 100 }}
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
            <button
              type="button"
              class={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-sm transition active:scale-[0.98] select-none touch-none cursor-grab active:cursor-grabbing ${
                t.completed
                  ? 'bg-white/5 border-white/10 text-white/40'
                  : 'bg-white/10 border-white/15 text-white/85 hover:bg-white/15'
              }`}
              on:pointerdown={(e) => startTodoPointerDrag(e, t, e.currentTarget as HTMLElement)}
              on:pointermove={moveTodoPointerDrag}
              on:pointerup={(e) => endTodoPointerDrag(e, e.currentTarget as HTMLElement)}
              on:pointercancel={(e) => cancelTodoPointerDrag(e, e.currentTarget as HTMLElement)}
              on:click={(e) => {
                if (suppressNextClick) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                onToggleTodo(t);
              }}
              title="Klicken zum Abhaken · Ziehen um Fälligkeit zu setzen"
              style="-webkit-touch-callout: none;"
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
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

{#if dragTodo && dragTodo.dragging}
  <div
    class="fixed left-0 top-0 z-[80] pointer-events-none"
    style={`transform: translate3d(${Math.round(dragTodo.x)}px, ${Math.round(dragTodo.y)}px, 0) rotate(-2deg) scale(1.03); transform-origin: ${Math.round(dragTodo.offsetX)}px ${Math.round(dragTodo.offsetY)}px; will-change: transform;`}
  >
    <div
      class={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-sm shadow-xl backdrop-blur-xl ${
        dragTodo.todo.completed
          ? 'bg-white/10 border-white/15 text-white/55'
          : 'bg-white/15 border-white/20 text-white/90'
      }`}
    >
      <span
        class={`w-4 h-4 rounded border grid place-items-center ${
          dragTodo.todo.completed ? 'bg-emerald-500/40 border-emerald-400/70' : 'border-white/30'
        }`}
        aria-hidden="true"
      >
        {#if dragTodo.todo.completed}
          <svg class="w-3 h-3 text-emerald-200" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
        {/if}
      </span>

      <span class={`truncate max-w-[240px] ${dragTodo.todo.completed ? 'line-through' : ''}`}>{dragTodo.todo.title}</span>
    </div>
  </div>
{/if}