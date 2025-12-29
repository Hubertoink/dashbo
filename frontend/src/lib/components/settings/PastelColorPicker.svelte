<script lang="ts">
  export let value: string | null = null;
  export let onPick: (hex: string) => void;

  const pastelHexes = [
    '#34D399', // emerald
    '#2DD4BF', // teal
    '#38BDF8', // sky
    '#818CF8', // indigo
    '#A78BFA', // violet
    '#F472B6', // pink
    '#FB923C', // orange
    '#FBBF24', // amber
    '#C084FC', // purple
    '#4ADE80', // green
    '#FB7185', // rose
    '#A1A1AA' // zinc
  ];
</script>

<div class="px-3 py-2 border-t border-white/10">
  <div class="text-sm text-white/80 text-center mb-2">Pastellfarben</div>

  <div class="flex justify-center">
    <div class="grid grid-cols-6 gap-2">
      {#each pastelHexes as hex}
        <button
          type="button"
          class={`h-6 w-6 rounded-full border ${value === hex ? 'border-white/70' : 'border-white/10'} hover:border-white/40`}
          style={`background-color: ${hex}`}
          aria-label={`Farbe ${hex}`}
          on:click={() => onPick(hex)}
        ></button>
      {/each}
    </div>
  </div>
</div>
