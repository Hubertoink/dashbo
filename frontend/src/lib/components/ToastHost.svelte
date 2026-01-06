<script lang="ts">
  import { toasts, dismissToast, type ToastItem } from '$lib/stores/toast';

  function toastClasses(t: ToastItem) {
    switch (t.variant) {
      case 'success':
        return 'bg-emerald-500/20 border-emerald-300/20 text-emerald-100';
      case 'error':
        return 'bg-rose-500/20 border-rose-300/20 text-rose-100';
      default:
        return 'bg-white/10 border-white/10 text-white/90';
    }
  }
</script>

<div
  class="fixed left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
  style="bottom: calc(1.5rem + env(safe-area-inset-bottom));"
  aria-live="polite"
  aria-atomic="true"
>
  <div class="flex flex-col gap-2">
    {#each $toasts as t (t.id)}
      <div
        class={`pointer-events-auto min-w-[220px] max-w-[90vw] rounded-xl border px-4 py-2 backdrop-blur-xl shadow-lg ${toastClasses(t)}`}
      >
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm font-medium">{t.message}</div>
          <button
            type="button"
            class="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/15 active:scale-95 transition grid place-items-center text-white/80"
            aria-label="Toast schließen"
            on:click={() => dismissToast(t.id)}
          >
            ✕
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>
