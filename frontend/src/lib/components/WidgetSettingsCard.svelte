<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let title: string;
  export let icon: string = '⚙';
  export let kicker: string | null = null;
  export let enabled: boolean;
  export let widgetKey: string;
  export let saving: boolean = false;
  export let error: string | null = null;
  export let showToggle: boolean = true;

  $: effectiveKicker = kicker ?? widgetKey;

  const dispatch = createEventDispatcher<{
    toggle: { enabled: boolean };
    hover: { key: string | null };
  }>();

  function handleToggle() {
    dispatch('toggle', { enabled: !enabled });
  }

  function handleMouseEnter() {
    dispatch('hover', { key: widgetKey });
  }

  function handleMouseLeave() {
    dispatch('hover', { key: null });
  }
</script>

<div
  class="rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all duration-150 hover:border-white/20"
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
  role="region"
  aria-label={title}
>
  <!-- Header -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
    {#if icon && icon.trim().length > 0}
      <span class="text-lg leading-none">{icon}</span>
    {/if}

    <div class="min-w-0">
      {#if effectiveKicker && effectiveKicker.trim().length > 0}
        <div class="text-[11px] uppercase tracking-widest text-white/45 leading-none">
          {effectiveKicker}
        </div>
      {/if}
      <div class="font-medium text-white/90 leading-snug">{title}</div>
    </div>

    <div class="ml-auto flex items-center gap-3">
      {#if saving}
        <span class="text-xs text-white/50">Speichern…</span>
      {/if}

      {#if showToggle}
        <button
          type="button"
          class="relative h-6 w-11 rounded-full transition-colors duration-200 {enabled
            ? 'bg-cyan-500/60'
            : 'bg-white/20'}"
          on:click={handleToggle}
          disabled={saving}
          aria-pressed={enabled}
          aria-label="{title} {enabled ? 'deaktivieren' : 'aktivieren'}"
        >
          <span
            class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 {enabled
              ? 'translate-x-5'
              : 'translate-x-0'}"
          ></span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Content (slot) -->
  <div class="p-4 {!enabled ? 'opacity-50 pointer-events-none' : ''}">
    <slot />
  </div>

  {#if error}
    <div class="px-4 pb-3 text-red-400 text-xs">{error}</div>
  {/if}
</div>
