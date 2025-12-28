<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchForecast, type ForecastDto, type ForecastDayDto } from '$lib/api';

  let forecast: ForecastDto | null = null;

  async function load() {
    try {
      forecast = await fetchForecast();
    } catch {
      forecast = { ok: false, error: 'forecast_fetch_failed', fetchedAt: new Date().toISOString() };
    }
  }

  onMount(() => {
    void load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(id);
  });

  function fmtDay(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('de-DE', { weekday: 'short' });
  }

  function weatherIcon(code: number | null): string {
    if (code == null) return '○';
    if (code === 0) return '☀';
    if (code <= 3) return '⛅';
    if (code <= 48) return '🌫';
    if (code <= 57) return '🌧';
    if (code <= 67) return '🌧';
    if (code <= 77) return '❄';
    if (code <= 82) return '🌧';
    if (code <= 86) return '❄';
    return '⛈';
  }
</script>

<div class="text-white text-shadow select-none">
  {#if forecast?.ok}
    <div class="space-y-3">
      {#if forecast.city}
        <div class="text-left text-lg font-semibold tracking-wide opacity-80">{forecast.city}</div>
      {/if}
      {#each forecast.days as day}
        <div class="flex items-center gap-4">
          <div class="w-10 text-sm font-medium opacity-80">{fmtDay(day.date)}</div>
          <div class="text-xl">{weatherIcon(day.code)}</div>
          <div class="flex items-baseline gap-1.5">
            <span class="text-lg font-semibold">{day.tempMax != null ? Math.round(day.tempMax) : '--'}°</span>
            <span class="text-sm opacity-60">{day.tempMin != null ? Math.round(day.tempMin) : '--'}°</span>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-sm opacity-60">Vorhersage nicht verfügbar</div>
  {/if}
</div>
