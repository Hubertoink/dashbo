<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchForecast, type ForecastDto, type ForecastDayDto } from '$lib/api';

  export let compact = false;

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
    <div class={compact ? 'space-y-1.5' : 'space-y-3'}>
      {#if forecast.city}
        <div class="text-left {compact ? 'text-sm' : 'text-lg'} font-semibold tracking-wide opacity-80">{forecast.city}</div>
      {/if}
      {#each compact ? forecast.days.slice(0, 5) : forecast.days as day}
        <div class="flex items-center {compact ? 'gap-2' : 'gap-4'}">
          <div class="{compact ? 'w-7 text-xs' : 'w-10 text-sm'} font-medium opacity-80">{fmtDay(day.date)}</div>
          <div class={compact ? 'text-base' : 'text-xl'}>{weatherIcon(day.code)}</div>
          <div class="flex items-baseline gap-1">
            <span class="{compact ? 'text-sm' : 'text-lg'} font-semibold">{day.tempMax != null ? Math.round(day.tempMax) : '--'}°</span>
            <span class="{compact ? 'text-xs' : 'text-sm'} opacity-60">{day.tempMin != null ? Math.round(day.tempMin) : '--'}°</span>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-sm opacity-60">Vorhersage nicht verfügbar</div>
  {/if}
</div>
