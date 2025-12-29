<script lang="ts">
  import { onDestroy } from 'svelte';
  import { clockStyleClasses, type ClockStyle } from '$lib/clockStyle';

  export let tone: 'light' | 'dark' = 'light';
  export let style: ClockStyle | null = null;

  let now = new Date();

  const id = setInterval(() => {
    now = new Date();
  }, 1000);

  onDestroy(() => clearInterval(id));

  $: time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
</script>

<div class={`${tone === 'dark' ? 'text-shadow-light' : 'text-shadow'} select-none ${clockStyleClasses(style)}`}>
  <div class="text-[92px] leading-none md:text-[120px]">{time}</div>
</div>
