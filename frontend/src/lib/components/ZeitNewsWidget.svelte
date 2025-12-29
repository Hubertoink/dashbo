<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { fetchNews, type NewsItemDto, type NewsResponseDto } from '$lib/api';

  export let variant: 'panel' | 'plain' = 'panel';

  let items: NewsItemDto[] = [];
  let loading = true;
  let source: NewsResponseDto['source'] = 'zeit';
  let page = 0;
  let pageTimer: ReturnType<typeof setInterval> | null = null;
  let transitioning = false;

  const PAGE_SIZE = 3;
  const MAX_ITEMS = 12;
  const PAGE_ROTATE_MS = 20_000;
  const TRANSITION_OUT_MS = 180;
  const TRANSITION_IN_MS = 220;

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
      startPageRotation();
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
      items = (r.items ?? []).slice(0, MAX_ITEMS);
      startPageRotation();

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
      stopPageRotation();
    } finally {
      loading = false;
    }
  }

  function stopPageRotation() {
    if (pageTimer) {
      clearInterval(pageTimer);
      pageTimer = null;
    }
  }

  function startPageRotation() {
    stopPageRotation();
    const pageCount = Math.ceil(Math.min(items.length, MAX_ITEMS) / PAGE_SIZE);
    if (pageCount <= 1) {
      page = 0;
      return;
    }
    if (page >= pageCount) page = 0;
    pageTimer = setInterval(() => {
      const nextCount = Math.ceil(Math.min(items.length, MAX_ITEMS) / PAGE_SIZE);
      if (nextCount <= 1) {
        page = 0;
        stopPageRotation();
        return;
      }
      transitioning = true;
      setTimeout(() => {
        page = (page + 1) % nextCount;
        setTimeout(() => {
          transitioning = false;
        }, TRANSITION_IN_MS + 50);
      }, TRANSITION_OUT_MS);
    }, PAGE_ROTATE_MS);
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
    return () => {
      clearInterval(t);
      stopPageRotation();
    };
  });
</script>

{#if loading || items.length > 0}
  <div class={containerClass}>
    <div class="mb-2 flex items-center justify-between">
      <div class="text-base font-semibold">News</div>
      <div class="text-xs text-white/60">RSS</div>
    </div>

    {#if items.length > 0}
      {@const pageCount = Math.ceil(Math.min(items.length, MAX_ITEMS) / PAGE_SIZE)}
      {@const start = page * PAGE_SIZE}
      {@const view = items.slice(start, start + PAGE_SIZE)}
      <div class="relative overflow-hidden" style="min-height: {PAGE_SIZE * 1.75 + 1.5}rem;">
        {#key page}
          <div
            class="space-y-2 {transitioning ? 'absolute inset-x-0 top-0' : ''}"
            in:fade={{ duration: TRANSITION_IN_MS, delay: TRANSITION_OUT_MS }}
            out:fade={{ duration: TRANSITION_OUT_MS }}
          >
            {#each view as it (it.url)}
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

            {#if pageCount > 1}
              <div class="pt-1 text-[10px] tracking-widest uppercase text-white/35">
                {page + 1}/{pageCount}
              </div>
            {/if}
          </div>
        {/key}
      </div>
    {:else}
      <div class="text-white/50 text-sm">Keine Artikel verfügbar.</div>
    {/if}
  </div>
{/if}
