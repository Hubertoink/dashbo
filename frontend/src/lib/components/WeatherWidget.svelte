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

<div class={`flex items-center gap-4 ${tone === 'dark' ? 'text-shadow-light' : 'text-shadow'} select-none`}>
  <div
    class={`h-14 w-14 rounded-full ${tone === 'dark' ? 'bg-black/15' : 'bg-white/15'} backdrop-blur-md flex items-center justify-center`}
  >
    {#if weather?.ok}
      <span class="text-xl font-semibold">{Math.round(weather.temp ?? 0)}°</span>
    {:else}
      <span class="text-sm opacity-80">--</span>
    {/if}
  </div>
  <div class="leading-tight">
    {#if weather?.ok}
      <div class="text-base md:text-lg font-semibold">{weather.description ?? 'Wetter'}</div>
      <div class="text-sm opacity-80">{weather.city ?? ''}</div>
    {:else}
      <div class="text-base md:text-lg font-semibold">Wetter</div>
      <div class="text-sm opacity-80">nicht konfiguriert</div>
    {/if}
  </div>
</div>
