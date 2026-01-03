<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import ScribbleCanvas from './ScribbleCanvas.svelte';

  export let open = false;
  export let authorName = '';

  const dispatch = createEventDispatcher<{
    close: void;
    save: { imageData: string; authorName: string };
  }>();

  let canvasComponent: ScribbleCanvas;
  let selectedColor = '#000000';
  let selectedSize: 'S' | 'M' | 'L' = 'M';
  let hasContent = false;
  let saving = false;

  const colors = [
    { name: 'Schwarz', value: '#000000' },
    { name: 'Weiß', value: '#FFFFFF' },
    { name: 'Rot', value: '#EF4444' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Gelb', value: '#EAB308' },
    { name: 'Grün', value: '#22C55E' },
    { name: 'Blau', value: '#3B82F6' },
    { name: 'Lila', value: '#A855F7' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Cyan', value: '#06B6D4' },
  ];

  const sizes: { key: 'S' | 'M' | 'L'; width: number; label: string }[] = [
    { key: 'S', width: 2, label: 'Dünn' },
    { key: 'M', width: 5, label: 'Mittel' },
    { key: 'L', width: 12, label: 'Dick' },
  ];

  $: strokeWidth = sizes.find((s) => s.key === selectedSize)?.width ?? 5;

  function handleClose() {
    dispatch('close');
  }

  async function handleSave() {
    if (!canvasComponent || saving) return;
    saving = true;
    try {
      const imageData = canvasComponent.getImageData();
      dispatch('save', { imageData, authorName });
    } finally {
      saving = false;
    }
  }

  function handleUndo() {
    canvasComponent?.undo();
  }

  function handleClear() {
    canvasComponent?.clear();
    hasContent = false;
  }

  function handleChange() {
    hasContent = true;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      handleUndo();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="w-full max-w-xl mx-4 bg-black/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      transition:fly={{ y: 50, duration: 300 }}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <button
          type="button"
          class="p-2 -m-2 text-white/60 hover:text-white transition"
          on:click={handleClose}
          aria-label="Schließen"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 class="text-lg font-semibold text-white">Neue Notiz</h2>

        <button
          type="button"
          class="p-2 -m-2 text-emerald-400 hover:text-emerald-300 transition disabled:opacity-40"
          on:click={handleSave}
          disabled={!hasContent || saving}
          aria-label="Speichern"
        >
          {#if saving}
            <svg class="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          {:else}
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          {/if}
        </button>
      </div>

      <!-- Canvas -->
      <div class="p-4 flex justify-center">
        <ScribbleCanvas
          bind:this={canvasComponent}
          width={400}
          height={280}
          strokeColor={selectedColor}
          {strokeWidth}
          backgroundColor="transparent"
          on:change={handleChange}
        />
      </div>

      <!-- Toolbar -->
      <div class="px-4 pb-4 space-y-3">
        <!-- Color palette -->
        <div class="flex items-center gap-2 flex-wrap justify-center">
          {#each colors as color}
            <button
              type="button"
              class="w-8 h-8 rounded-full border-2 transition-all {selectedColor === color.value
                ? 'border-white scale-110 shadow-lg'
                : 'border-white/20 hover:border-white/40'}"
              style="background-color: {color.value};"
              on:click={() => (selectedColor = color.value)}
              title={color.name}
              aria-label={color.name}
            />
          {/each}
        </div>

        <!-- Size & Actions -->
        <div class="flex items-center justify-between gap-4">
          <!-- Sizes -->
          <div class="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            {#each sizes as size}
              <button
                type="button"
                class="px-3 py-1.5 text-sm rounded-md transition {selectedSize === size.key
                  ? 'bg-white/20 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'}"
                on:click={() => (selectedSize = size.key)}
              >
                {size.key}
              </button>
            {/each}
          </div>

          <!-- Author name -->
          <input
            type="text"
            bind:value={authorName}
            placeholder="Dein Name"
            class="flex-1 max-w-[140px] px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/30"
          />

          <!-- Actions -->
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"
              on:click={handleUndo}
              title="Rückgängig (Strg+Z)"
              aria-label="Rückgängig"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a4 4 0 014 4v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button
              type="button"
              class="p-2 text-white/60 hover:text-rose-400 hover:bg-white/10 rounded-lg transition"
              on:click={handleClear}
              title="Alles löschen"
              aria-label="Alles löschen"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
