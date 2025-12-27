<script lang="ts">
  import { onMount } from 'svelte';
  import type { WeatherDto } from '$lib/api';
  import { fetchWeather } from '$lib/api';

  export let tone: 'light' | 'dark' = 'light';

  let weather: WeatherDto | null = null;

  async function load() {
    try {
      weather = await fetchWeather();
    } catch {
      weather = { ok: false, error: 'weather_fetch_failed', fetchedAt: new Date().toISOString() };
    }
  }

  onMount(() => {
    void load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
  });
</script>

<div class={`flex items-center gap-3 ${tone === 'dark' ? 'text-shadow-light' : 'text-shadow'} select-none`}>
  <div
    class={`h-10 w-10 rounded-full ${tone === 'dark' ? 'bg-black/15' : 'bg-white/15'} backdrop-blur-md flex items-center justify-center`}
  >
    {#if weather?.ok}
      <span class="text-sm">{Math.round(weather.temp ?? 0)}°</span>
    {:else}
      <span class="text-xs opacity-80">--</span>
    {/if}
  </div>
  <div class="leading-tight">
    {#if weather?.ok}
      <div class="text-sm font-semibold">{weather.description ?? 'Wetter'}</div>
      <div class="text-xs opacity-80">{weather.city ?? ''}</div>
    {:else}
      <div class="text-sm font-semibold">Wetter</div>
      <div class="text-xs opacity-80">nicht konfiguriert</div>
    {/if}
  </div>
</div>
