<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchNews, type NewsItemDto, type NewsResponseDto } from '$lib/api';

  export let variant: 'panel' | 'plain' = 'panel';

  let items: NewsItemDto[] = [];
  let loading = true;
  let source: NewsResponseDto['source'] = 'zeit';

  const NEWS_CACHE_KEY = 'dashbo_news_cache_v1';
  const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

  function loadFromCache(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(NEWS_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { at?: number; items?: NewsItemDto[]; source?: NewsResponseDto['source'] };
      const at = typeof parsed?.at === 'number' ? parsed.at : 0;
      const isFresh = at > 0 && Date.now() - at <= NEWS_CACHE_TTL_MS;
      if (!isFresh || !Array.isArray(parsed?.items)) return false;
      items = parsed.items;
      if (typeof parsed?.source === 'string') source = parsed.source as any;
      loading = false;
      return true;
    } catch {
      return false;
    }
  }

  async function load(showLoading = true) {
    if (showLoading) loading = true;
    try {
      const r = await fetchNews();
      source = r.source;
      items = (r.items ?? []).slice(0, 8);

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ at: Date.now(), source, items }));
        } catch {
          // ignore
        }
      }
    } catch {
      // fail closed: hide items
      items = [];
    } finally {
      loading = false;
    }
  }

  const SOURCE_LABEL: Record<string, string> = {
    zeit: 'ZEIT',
    guardian: 'Guardian',
    newyorker: 'New Yorker',
    sz: 'SZ'
  };

  function itemSourceLabel(it: NewsItemDto): string {
    const s = (it as any)?.source;
    return typeof s === 'string' && SOURCE_LABEL[s] ? SOURCE_LABEL[s] : '';
  }

  $: containerClass = variant === 'plain' ? 'text-white' : 'rounded-lg bg-white/5 p-3 text-white';

  onMount(() => {
    loadFromCache();
    void load(false);
    const t = setInterval(() => void load(false), 10 * 60 * 1000);
    return () => clearInterval(t);
  });
</script>

{#if loading || items.length > 0}
  <div class={containerClass}>
    <div class="mb-2 flex items-center justify-between">
      <div class="text-base font-semibold">News</div>
      <div class="text-xs text-white/60">RSS</div>
    </div>

    {#if items.length > 0}
      <div class="space-y-2">
        {#each items.slice(0, 8) as it (it.url)}
          <a
            class="block text-sm text-white/85 hover:text-white underline-offset-2 hover:underline whitespace-normal break-words"
            href={it.url}
            rel="noopener"
          >
            {#if source === 'mixed'}
              {@const lbl = itemSourceLabel(it)}
              {#if lbl}
                <span class="mr-2 text-[10px] tracking-widest uppercase text-white/45">{lbl}</span>
              {/if}
            {/if}
            {it.title}
          </a>
        {/each}
      </div>
    {:else}
      <div class="text-white/50 text-sm">Keine Artikel verfügbar.</div>
    {/if}
  </div>
{/if}
