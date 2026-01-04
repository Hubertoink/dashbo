<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fade, fly, slide } from 'svelte/transition';
  import Clock from '$lib/components/Clock.svelte';
  import WeatherWidget from '$lib/components/WeatherWidget.svelte';
  import TodoWidget from '$lib/components/TodoWidget.svelte';
  import ZeitNewsWidget from '$lib/components/ZeitNewsWidget.svelte';
  import ForecastWidget from '$lib/components/ForecastWidget.svelte';
  import MusicWidget from '$lib/components/MusicWidget.svelte';
  import ScribbleWidget from '$lib/components/ScribbleWidget.svelte';
  import CalendarMonth from '$lib/components/CalendarMonth.svelte';
  import WeekView from '$lib/components/WeekView.svelte';
  import WeekPlanner from '$lib/components/WeekPlanner.svelte';
  import EventsPanel from '$lib/components/EventsPanel.svelte';
  import AddEventModal from '$lib/components/AddEventModal.svelte';
  import {
    fetchEvents,
    fetchHolidays,
    fetchNews,
    fetchScribbles,
    type HolidayDto,
    type EventDto,
    type NewsItemDto,
    type ScribbleDto,
    type TagColorKey,
    fetchSettings,
    fetchOutlookStatus,
    getStoredToken
  } from '$lib/api';
  import { daysForMonthGrid } from '$lib/date';
  import { getEdgePlayerWidgetEnabledFromStorage } from '$lib/edge';
  import { getDashboardGlassBlurEnabledFromStorage, getDashboardTextStyleFromStorage } from '$lib/dashboard';
  import { musicPlayerState } from '$lib/stores/musicPlayer';
  import { heosPlaybackStatus } from '$lib/stores/heosPlayback';
  import { clockStyleClasses, normalizeClockStyle, type ClockStyle } from '$lib/clockStyle';

  let selectedDate = new Date();
  let monthAnchor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  let events: EventDto[] = [];
  let backgroundUrl = '/background.jpg';
  let uploadedBackgroundUrls: string[] = [];
  let bgIndex = 0;
  const BG_ROTATE_MS = 10 * 60 * 1000;
  let bgRotateInterval: ReturnType<typeof setInterval> | null = null;
  let viewMode: 'month' | 'week' = 'month';
  let tone: 'light' | 'dark' = 'light';

  let clockStyle: ClockStyle = 'modern';

  let upcomingMode = false;
  let standbyMode = false;

  let musicWidgetEnabled = false;
  let dashboardGlassBlurEnabled = false;
  let dashboardTextStyle: ClockStyle = 'modern';

  const STANDBY_TRANSITION_MS = 700;
  let standbyTransitioning = false;
  let standbyOverlayVisible = false;
  let standbySwitchTimer: ReturnType<typeof setTimeout> | null = null;
  let standbyUnlockTimer: ReturnType<typeof setTimeout> | null = null;

  let holidaysEnabled = false;
  let todoEnabled = true;
  let newsEnabled = false;
  let holidays: HolidayDto[] = [];

  let outlookConnected = false;
  let scribbleEnabled = false;

  let scribbleStandbySeconds = 20;
  let scribblePaperLook = true;
  let standbyScribbles: ScribbleDto[] = [];
  let standbyScribbleIndex = 0;
  let standbyScribbleRotateInterval: ReturnType<typeof setInterval> | null = null;

  async function loadStandbyScribbles() {
    try {
      const r = await fetchScribbles();
      standbyScribbles = (r.scribbles ?? []).slice(0, 5);
      standbyScribbleIndex = 0;
    } catch {
      standbyScribbles = [];
      standbyScribbleIndex = 0;
    }
  }

  function clearStandbyScribbleRotation() {
    if (standbyScribbleRotateInterval) clearInterval(standbyScribbleRotateInterval);
    standbyScribbleRotateInterval = null;
    if (standbyScribbleRefreshInterval) clearInterval(standbyScribbleRefreshInterval);
    standbyScribbleRefreshInterval = null;
  }

  let standbyScribbleRefreshInterval: ReturnType<typeof setInterval> | null = null;

  function startStandbyScribbleRotation() {
    clearStandbyScribbleRotation();
    if (!scribbleEnabled) return;
    const seconds = Math.max(5, Math.min(300, Math.round(Number(scribbleStandbySeconds) || 20)));
    if (standbyScribbles.length === 0) {
      void loadStandbyScribbles();
    }

    // Rotation interval for switching between scribbles
    standbyScribbleRotateInterval = setInterval(() => {
      if (standbyScribbles.length <= 1) return;
      standbyScribbleIndex = (standbyScribbleIndex + 1) % standbyScribbles.length;
    }, seconds * 1000);

    // Refresh interval to sync with backend (every 30 seconds)
    standbyScribbleRefreshInterval = setInterval(async () => {
      const oldLength = standbyScribbles.length;
      await loadStandbyScribbles();
      // Adjust index if current index is out of bounds after refresh
      if (standbyScribbleIndex >= standbyScribbles.length && standbyScribbles.length > 0) {
        standbyScribbleIndex = 0;
      }
    }, 30_000);
  }

  // Track which widget is expanded in the dashboard sidebar (null = none)
  let expandedWidget: 'todo' | 'news' | 'scribble' | null = null;

  // Count active widgets in sidebar to enable compact mode when > 3
  $: activeWidgetCount = [
    todoEnabled && outlookConnected,
    newsEnabled,
    scribbleEnabled,
    musicWidgetEnabled
  ].filter(Boolean).length;
  $: compactWidgets = activeWidgetCount > 3;

  let standbyNewsItems: NewsItemDto[] = [];
  let standbyNewsIndex = 0;
  let standbyNewsLoading = false;
  let standbyNewsMultiSource = false;
  let standbyNewsRotateInterval: ReturnType<typeof setInterval> | null = null;
  let standbyNewsRotationKey = '';
  let standbyNewsRefreshInterval: ReturnType<typeof setInterval> | null = null;

  const NEWS_CACHE_KEY = 'dashbo_news_cache_v1';
  const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;

  function recomputeStandbyNewsMultiSource(items: NewsItemDto[]) {
    try {
      const srcs = new Set((items ?? []).map((it: any) => (typeof it?.source === 'string' ? it.source : null)).filter(Boolean));
      standbyNewsMultiSource = srcs.size > 1;
    } catch {
      standbyNewsMultiSource = false;
    }
  }

  function newsSourceLabel(id: any): string {
    const s = typeof id === 'string' ? id.toLowerCase() : '';
    if (s === 'guardian') return 'Guardian';
    if (s === 'newyorker') return 'New Yorker';
    if (s === 'sz') return 'SZ';
    if (s === 'zeit') return 'ZEIT';
    return '';
  }

  function loadNewsFromCache(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(NEWS_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { at?: number; items?: NewsItemDto[] };
      const at = typeof parsed?.at === 'number' ? parsed.at : 0;
      const isFresh = at > 0 && Date.now() - at <= NEWS_CACHE_TTL_MS;
      if (!isFresh || !Array.isArray(parsed?.items)) return false;
      standbyNewsItems = parsed.items.slice(0, 8);
      recomputeStandbyNewsMultiSource(standbyNewsItems);
      return standbyNewsItems.length > 0;
    } catch {
      return false;
    }
  }

  async function loadNews() {
    standbyNewsLoading = true;
    try {
      const r = await fetchNews();
      standbyNewsItems = (r.items ?? []).slice(0, 8);
      recomputeStandbyNewsMultiSource(standbyNewsItems);

      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ at: Date.now(), items: standbyNewsItems }));
        } catch {
          // ignore
        }
      }
    } catch {
      standbyNewsItems = [];
      standbyNewsMultiSource = false;
    } finally {
      standbyNewsLoading = false;
    }
  }

  function loadLocalWidgetToggles() {
    try {
      musicWidgetEnabled = getEdgePlayerWidgetEnabledFromStorage();
      dashboardGlassBlurEnabled = getDashboardGlassBlurEnabledFromStorage();
      dashboardTextStyle = getDashboardTextStyleFromStorage();
    } catch {
      musicWidgetEnabled = false;
      dashboardGlassBlurEnabled = false;
      dashboardTextStyle = 'modern';
    }
  }

  $: dashboardTextClasses = clockStyleClasses(dashboardTextStyle);

  function startNewsRefresh(enabled: boolean) {
    if (standbyNewsRefreshInterval) {
      clearInterval(standbyNewsRefreshInterval);
      standbyNewsRefreshInterval = null;
    }
    if (!enabled) return;
    standbyNewsRefreshInterval = setInterval(() => void loadNews(), 10 * 60 * 1000);
  }

  let standbyTimer: ReturnType<typeof setTimeout> | null = null;
  const STANDBY_IDLE_MS = 10 * 60 * 1000;

  const STANDBY_PAGE_SIZE = 4;
  const STANDBY_PAGE_MS = 10_000;
  const STANDBY_NEWS_MS = 10_000;

  let dataRefreshMs = 60_000;
  let dataRefreshInterval: ReturnType<typeof setInterval> | null = null;

  let standbyPageIndex = 0;
  let standbyRotateInterval: ReturnType<typeof setInterval> | null = null;
  let standbyRotationKey = '';

  let showAddEventModal = false;
  let eventToEdit: EventDto | null = null;
  let plannerOpen = false;

  $: bgOverlay =
    tone === 'dark'
      ? 'linear-gradient(to right, rgba(0,0,0,0.75), rgba(0,0,0,0.88))'
      : 'linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0.78))';

  function openAddEventModal() {
    eventToEdit = null;
    showAddEventModal = true;
  }

  function openPlanner() {
    plannerOpen = true;
  }

  function closePlanner() {
    plannerOpen = false;
  }

  function openEditEventModal(e: EventDto) {
    if (e.source === 'outlook') return;
    // keep UI in sync with the clicked occurrence day
    onSelect(new Date(e.startAt));
    eventToEdit = e;
    showAddEventModal = true;
  }

  function closeAddEventModal() {
    showAddEventModal = false;
    eventToEdit = null;
  }

  function setViewMode(next: 'month' | 'week') {
    if (viewMode === next) return;
    viewMode = next;
    void loadEvents();
  }

  function toggleUpcomingMode() {
    upcomingMode = !upcomingMode;
    void loadEvents();
  }

  function enterStandby() {
    transitionToStandby();
  }

  function exitStandby() {
    if (standbyMode) {
      transitionFromStandby();
      return;
    }
    if (upcomingMode) {
      transitionFromUpcoming();
    }
  }

  function clearStandbyTransitionTimers() {
    if (standbySwitchTimer) clearTimeout(standbySwitchTimer);
    if (standbyUnlockTimer) clearTimeout(standbyUnlockTimer);
    standbySwitchTimer = null;
    standbyUnlockTimer = null;
  }

  function transitionToStandby() {
    if (standbyTransitioning || standbyMode) return;
    standbyTransitioning = true;
    standbyOverlayVisible = true;
    clearStandbyTransitionTimers();

    standbySwitchTimer = setTimeout(() => {
      standbyMode = true;
      upcomingMode = true;
      void loadEvents();
      if (newsEnabled) void loadNews();
      if (scribbleEnabled) void loadStandbyScribbles();
      standbyOverlayVisible = false;
      standbySwitchTimer = null;
    }, STANDBY_TRANSITION_MS);

    standbyUnlockTimer = setTimeout(() => {
      standbyTransitioning = false;
      standbyUnlockTimer = null;
    }, STANDBY_TRANSITION_MS * 2 + 30);
  }

  function transitionFromStandby() {
    if (standbyTransitioning || !standbyMode) return;
    standbyTransitioning = true;
    standbyOverlayVisible = true;
    clearStandbyTransitionTimers();

    standbySwitchTimer = setTimeout(() => {
      standbyMode = false;
      upcomingMode = false;
      void loadEvents();
      standbyOverlayVisible = false;
      standbySwitchTimer = null;
    }, STANDBY_TRANSITION_MS);

    standbyUnlockTimer = setTimeout(() => {
      standbyTransitioning = false;
      standbyUnlockTimer = null;
    }, STANDBY_TRANSITION_MS * 2 + 30);
  }

  function transitionFromUpcoming() {
    if (standbyTransitioning || !upcomingMode || standbyMode) return;
    standbyTransitioning = true;
    standbyOverlayVisible = true;
    clearStandbyTransitionTimers();

    standbySwitchTimer = setTimeout(() => {
      upcomingMode = false;
      void loadEvents();
      standbyOverlayVisible = false;
      standbySwitchTimer = null;
    }, STANDBY_TRANSITION_MS);

    standbyUnlockTimer = setTimeout(() => {
      standbyTransitioning = false;
      standbyUnlockTimer = null;
    }, STANDBY_TRANSITION_MS * 2 + 30);
  }

  function scheduleStandby() {
    if (standbyTimer) clearTimeout(standbyTimer);
    // Only auto-standby when in month/week (not already standby)
    if (!standbyMode && !upcomingMode) {
      standbyTimer = setTimeout(() => {
        transitionToStandby();
      }, STANDBY_IDLE_MS);
    }
  }

  function onUserActivity() {
    scheduleStandby();
  }

  $: showUpcomingStandby = upcomingMode && !standbyMode;
  $: if (showUpcomingStandby && scribbleEnabled) {
    startStandbyScribbleRotation();
  } else {
    clearStandbyScribbleRotation();
  }

  const dotBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500',
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    violet: 'bg-violet-400',
    sky: 'bg-sky-400',
    lime: 'bg-lime-400'
  };

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && hexRe.test(value);
  }

  const textFg: Record<TagColorKey, string> = {
    fuchsia: 'text-fuchsia-300',
    cyan: 'text-cyan-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-200',
    rose: 'text-rose-300',
    violet: 'text-violet-300',
    sky: 'text-sky-300',
    lime: 'text-lime-300'
  };

  function fmtUpcomingDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  }

  function fmtFullDate(d: Date) {
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  $: todayFullDate = fmtFullDate(new Date());

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTimeRange(startIso: string, endIso: string | null) {
    const start = fmtTime(startIso);
    if (endIso) return `${start} - ${fmtTime(endIso)} Uhr`;
    return `${start} Uhr`;
  }

  $: upcomingEvents = (() => {
    const now = new Date();
    return events
      .filter((e) => {
        const s = new Date(e.startAt);
        const end = e.endAt ? new Date(e.endAt) : null;
        return s >= now || (end && end >= now);
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  })();

  function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr.slice()];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  $: standbyPages = chunk(upcomingEvents, STANDBY_PAGE_SIZE);

  $: {
    const key = `${upcomingMode}:${standbyPages.length}`;
    if (key !== standbyRotationKey) {
      standbyRotationKey = key;
      standbyPageIndex = 0;
      if (standbyRotateInterval) {
        clearInterval(standbyRotateInterval);
        standbyRotateInterval = null;
      }

      if (upcomingMode && standbyPages.length > 1) {
        standbyRotateInterval = setInterval(() => {
          standbyPageIndex = (standbyPageIndex + 1) % standbyPages.length;
        }, STANDBY_PAGE_MS);
      }
    }
  }

  $: {
    const showStandbyNews = (standbyMode || upcomingMode) && newsEnabled;
    const key = `${showStandbyNews}:${standbyNewsItems.length}`;
    if (key !== standbyNewsRotationKey) {
      standbyNewsRotationKey = key;
      standbyNewsIndex = 0;

      if (standbyNewsRotateInterval) {
        clearInterval(standbyNewsRotateInterval);
        standbyNewsRotateInterval = null;
      }

      if (showStandbyNews && standbyNewsItems.length > 1) {
        standbyNewsRotateInterval = setInterval(() => {
          standbyNewsIndex = (standbyNewsIndex + 1) % standbyNewsItems.length;
        }, STANDBY_NEWS_MS);
      }
    }
  }

  $: {
    // When standby starts, make sure news is actually loaded.
    // (At page load, the cache may not exist yet because the dashboard widget writes it later.)
    if (standbyMode && newsEnabled && standbyNewsItems.length === 0 && !standbyNewsLoading) {
      loadNewsFromCache();
      if (standbyNewsItems.length === 0) void loadNews();
    }
  }

  onDestroy(() => {
    clearStandbyTransitionTimers();
    clearStandbyScribbleRotation();
    if (standbyRotateInterval) clearInterval(standbyRotateInterval);
    if (standbyNewsRotateInterval) clearInterval(standbyNewsRotateInterval);
    if (standbyNewsRefreshInterval) clearInterval(standbyNewsRefreshInterval);
    if (bgRotateInterval) clearInterval(bgRotateInterval);
    if (dataRefreshInterval) clearInterval(dataRefreshInterval);
  });

  function mondayStart(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const offset = (x.getDay() + 6) % 7; // Monday=0
    x.setDate(x.getDate() - offset);
    return x;
  }

  function endOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  // Random photo from /static (fallback to /background.jpg)
  const staticImages = Object.values(
    import.meta.glob('/static/**/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })
  ) as string[];

  async function computeToneFromImage(url: string): Promise<'light' | 'dark'> {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.src = url;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image_load_failed'));
      });

      const canvas = document.createElement('canvas');
      const w = 32;
      const h = 32;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return 'light';

      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;

      let sum = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        // sRGB luminance approximation
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sum += lum;
        n++;
      }

      const avg = n > 0 ? sum / n : 0.5;
      return avg > 0.72 ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  async function applyBackground(nextUrl: string) {
    backgroundUrl = nextUrl;
    tone = await computeToneFromImage(nextUrl);
  }

  async function loadEvents(opts?: { includeHolidays?: boolean }) {
    const includeHolidays = opts?.includeHolidays !== false;
    try {
      if (upcomingMode) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 90);
        end.setHours(23, 59, 59, 999);
        events = await fetchEvents(start, end);
        if (!holidaysEnabled) {
          holidays = [];
        } else if (includeHolidays) {
          const h = await fetchHolidays(start, end);
          holidays = h.ok && h.enabled ? h.holidays : [];
        }
        return;
      }

      if (viewMode === 'week') {
        const start = mondayStart(selectedDate);
        const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
        events = await fetchEvents(start, end);
        if (!holidaysEnabled) {
          holidays = [];
        } else if (includeHolidays) {
          const h = await fetchHolidays(start, end);
          holidays = h.ok && h.enabled ? h.holidays : [];
        }
        return;
      }

      const from = new Date(monthAnchor);
      // Month view shows a full grid including adjacent days; load events/holidays for that range.
      const gridDays = daysForMonthGrid(from);
      const gridStart = gridDays[0] ?? new Date(from.getFullYear(), from.getMonth(), 1);
      const gridEnd = gridDays[gridDays.length - 1] ?? new Date(from.getFullYear(), from.getMonth() + 1, 0);

      const start = new Date(gridStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(gridEnd);
      end.setHours(23, 59, 59, 999);

      events = await fetchEvents(start, end);
      if (!holidaysEnabled) {
        holidays = [];
      } else if (includeHolidays) {
        const h = await fetchHolidays(start, end);
        holidays = h.ok && h.enabled ? h.holidays : [];
      }
    } catch (e) {
      console.error(e);
      events = [];
      holidays = [];
    }
  }

  function onSelect(d: Date) {
    const newAnchor = new Date(d.getFullYear(), d.getMonth(), 1);
    const anchorChanged = newAnchor.getTime() !== monthAnchor.getTime();
    selectedDate = d;
    if (anchorChanged) monthAnchor = newAnchor;
    if (!upcomingMode && (viewMode === 'week' || anchorChanged)) void loadEvents();
  }

  onMount(() => {
    if (!getStoredToken()) {
      void goto('/login');
      return;
    }

    loadLocalWidgetToggles();

    loadNewsFromCache();

    void loadEvents();

    // Auto-refresh events; holidays only on explicit refresh/manual reload.
    const startRefreshInterval = () => {
      if (dataRefreshInterval) clearInterval(dataRefreshInterval);
      dataRefreshInterval = setInterval(() => {
        void loadEvents({ includeHolidays: false });
      }, Math.max(5_000, Number(dataRefreshMs) || 60_000));
    };

    startRefreshInterval();
    void (async () => {
      try {
        const s = await fetchSettings();
        clockStyle = normalizeClockStyle((s as any)?.clockStyle);

        try {
          const st = await fetchOutlookStatus();
          outlookConnected = Boolean(st?.connected);
        } catch {
          outlookConnected = false;
        }

        if (typeof s?.dataRefreshMs === 'number' && Number.isFinite(s.dataRefreshMs) && s.dataRefreshMs > 0) {
          dataRefreshMs = s.dataRefreshMs;
          startRefreshInterval();
        }

        const uploaded = (s.images ?? []).map((img: string) => `/api/media/${img}`);
        const rotateSubset = Array.isArray((s as any)?.backgroundRotateImages)
          ? ((s as any).backgroundRotateImages as string[]).map((img) => `/api/media/${img}`).filter((u) => uploaded.includes(u))
          : [];

        uploadedBackgroundUrls = uploaded;

        if (bgRotateInterval) {
          clearInterval(bgRotateInterval);
          bgRotateInterval = null;
        }

        const rotateEnabled = Boolean(s.backgroundRotateEnabled);

        if (uploadedBackgroundUrls.length > 0) {
          const rotateCandidates = rotateEnabled && rotateSubset.length > 0 ? rotateSubset : uploadedBackgroundUrls;
          if (rotateEnabled) {
            // Rotation enabled: start on a random uploaded image.
            bgIndex = Math.floor(Math.random() * rotateCandidates.length);
            await applyBackground(rotateCandidates[bgIndex] ?? '/background.jpg');

            if (rotateCandidates.length > 1) {
              bgRotateInterval = setInterval(() => {
                // pick a random next index (avoid immediate repeat when possible)
                const max = rotateCandidates.length;
                let nextIndex = Math.floor(Math.random() * max);
                if (max > 1 && nextIndex === bgIndex) nextIndex = (nextIndex + 1) % max;
                bgIndex = nextIndex;
                const next = rotateCandidates[bgIndex];
                if (next) void applyBackground(next);
              }, BG_ROTATE_MS);
            }
          } else {
            // Rotation disabled: keep chosen background (if any).
            const preferred = s.background ? `/api/media/${s.background}` : null;
            const preferredIndex = preferred ? uploadedBackgroundUrls.indexOf(preferred) : -1;
            bgIndex = preferredIndex >= 0 ? preferredIndex : 0;
            await applyBackground(uploadedBackgroundUrls[bgIndex] ?? '/background.jpg');
          }
        } else if (s.backgroundUrl) {
          await applyBackground(`/api${s.backgroundUrl}`);
        } else if (staticImages.length > 0) {
          await applyBackground(staticImages[Math.floor(Math.random() * staticImages.length)]);
        }

        const nextHolidaysEnabled = Boolean(s.holidaysEnabled);
        const holidaysChanged = nextHolidaysEnabled !== holidaysEnabled;
        holidaysEnabled = nextHolidaysEnabled;

        const nextTodoEnabled = s.todoEnabled !== false;
        const todoChanged = nextTodoEnabled !== todoEnabled;
        todoEnabled = nextTodoEnabled;

        const nextNewsEnabled = Boolean(s.newsEnabled);
        const newsChanged = nextNewsEnabled !== newsEnabled;
        newsEnabled = nextNewsEnabled;

        const nextScribbleEnabled = s.scribbleEnabled !== false;
        scribbleEnabled = nextScribbleEnabled;
        const nextScribbleStandbySeconds = Number.isFinite(Number((s as any)?.scribbleStandbySeconds))
          ? Number((s as any)?.scribbleStandbySeconds)
          : 20;
        scribbleStandbySeconds = nextScribbleStandbySeconds;
        scribblePaperLook = (s as any)?.scribblePaperLook !== false;

        if (nextNewsEnabled) {
          void loadNews();
        } else {
          standbyNewsItems = [];
        }
        startNewsRefresh(nextNewsEnabled);

        // If holidays/todo/news setting changed (or first load), reload to reflect immediately.
        if (holidaysChanged || todoChanged || newsChanged) void loadEvents();
      } catch {
        // ignore
        if (staticImages.length > 0) await applyBackground(staticImages[Math.floor(Math.random() * staticImages.length)]);
      }
    })();

    // start in normal view, but enable auto-standby after inactivity
    scheduleStandby();

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel'];
    for (const ev of events) window.addEventListener(ev, onUserActivity, { passive: true });

    return () => {
      if (standbyTimer) clearTimeout(standbyTimer);
      for (const ev of events) window.removeEventListener(ev, onUserActivity);
      if (dataRefreshInterval) {
        clearInterval(dataRefreshInterval);
        dataRefreshInterval = null;
      }
    };
  });
</script>

<!-- Capture ensures clicks still exit even if inner components stopPropagation -->
<svelte:window on:click|capture={() => ((standbyMode || upcomingMode) ? exitStandby() : undefined)} />

<div class="h-screen text-white overflow-hidden relative bg-black">
  <div class="absolute inset-0 overflow-hidden">
    <div
      class="kenburns absolute inset-0"
      style={`background-image: ${bgOverlay}, url('${backgroundUrl}'); background-size: cover; background-position: center;`}
    ></div>
  </div>

  {#if standbyOverlayVisible}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="absolute inset-0 z-40 bg-black"
      in:fade={{ duration: STANDBY_TRANSITION_MS }}
      out:fade={{ duration: STANDBY_TRANSITION_MS }}
      on:click|stopPropagation={() => {
        /* swallow clicks during transition */
      }}
    ></div>
  {/if}

  <div class="relative z-10 flex h-screen overflow-hidden items-stretch">
    <!-- Left: weather + ToDo + clock -->
    {#if !upcomingMode}
      <div class="w-[34%] min-w-[320px] hidden md:flex flex-col p-10 h-screen">
        <div class="text-white"><WeatherWidget tone="light" /></div>

        {#if expandedWidget === 'todo'}
          <!-- Expanded To-Do takes all space between weather and clock -->
          <div class="mt-6 pb-8 text-white flex-1 flex flex-col min-h-0" transition:slide={{ duration: 300 }}>
            <TodoWidget expanded={true} onToggleExpand={() => expandedWidget = null} />
          </div>
        {:else if expandedWidget === 'news'}
          <!-- Expanded News takes all space between weather and clock -->
          <div class="mt-6 pb-8 text-white flex-1 flex flex-col min-h-0" transition:slide={{ duration: 300 }}>
            <ZeitNewsWidget expanded={true} onToggleExpand={() => expandedWidget = null} />
          </div>
        {:else if expandedWidget === 'scribble'}
          <!-- Expanded Scribble takes all space between weather and clock -->
          <div class="mt-6 pb-8 text-white flex-1 flex flex-col min-h-0" transition:slide={{ duration: 300 }}>
            <ScribbleWidget expanded={true} rotationSeconds={scribbleStandbySeconds} onToggleExpand={() => expandedWidget = null} />
          </div>
        {:else}
          <!-- Normal layout with all widgets -->
          {#if todoEnabled && outlookConnected}
            <div class="mt-6 {compactWidgets ? 'pb-4' : 'pb-8'} text-white" transition:slide={{ duration: 300 }}>
              <TodoWidget compact={compactWidgets} onToggleExpand={() => expandedWidget = 'todo'} />
            </div>
          {/if}

          {#if newsEnabled}
            <div class="mt-2 {compactWidgets ? 'pb-4' : 'pb-8'} text-white" transition:slide={{ duration: 300 }}>
              <ZeitNewsWidget compact={compactWidgets} onToggleExpand={() => expandedWidget = 'news'} />
            </div>
          {/if}

          {#if scribbleEnabled}
            <div class="mt-2 {compactWidgets ? 'pb-3' : 'pb-6'} text-white" transition:slide={{ duration: 300 }}>
              <ScribbleWidget compact={compactWidgets} rotationSeconds={scribbleStandbySeconds} onToggleExpand={() => expandedWidget = 'scribble'} />
            </div>
          {/if}

          {#if musicWidgetEnabled}
            <div class="mt-2 pb-4 text-white" transition:slide={{ duration: 300 }}>
              <MusicWidget />
            </div>
          {/if}
        {/if}

        {#if standbyMode && musicWidgetEnabled && (($musicPlayerState.playing && $musicPlayerState.now) || $heosPlaybackStatus.isExternal)}
          <div class="standby-music mt-2 pb-4 text-white">
            <div class="relative h-24 w-24 overflow-hidden rounded-none shadow-lg shadow-black/30">
              {#if $musicPlayerState.now?.coverUrl}
                <img src={$musicPlayerState.now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
              {:else if $heosPlaybackStatus.isExternal && $heosPlaybackStatus.imageUrl}
                <img src={$heosPlaybackStatus.imageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
              {:else}
                <div class="h-full w-full bg-white/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" class="h-7 w-7 text-white/30" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
              {/if}
              <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"></div>
              <div class="absolute inset-x-0 bottom-0 p-2">
                {#if $musicPlayerState.now}
                  <div class="text-sm font-semibold text-white leading-tight line-clamp-1">{$musicPlayerState.now.artist}</div>
                  <div class="text-[11px] text-white/70 leading-tight line-clamp-1">{$musicPlayerState.now.title}</div>
                {:else if $heosPlaybackStatus.isExternal}
                  <div class="text-sm font-semibold text-white leading-tight line-clamp-1">{$heosPlaybackStatus.artist ?? 'Musik'}</div>
                  <div class="text-[11px] text-white/70 leading-tight line-clamp-1">{$heosPlaybackStatus.title ?? 'Wiedergabe'}</div>
                {:else}
                  <div class="text-[11px] text-white/60">Keine Wiedergabe</div>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <div class="mt-auto pb-2">
          <div class="text-white"><Clock tone="light" style={clockStyle} /></div>
        </div>
      </div>
    {/if}

    <!-- Right: calendar + events OR standby -->
    <div class="flex-1 h-screen overflow-hidden">
      {#if standbyMode}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <!-- Standby screen (click anywhere to exit) -->
        <div class="h-screen overflow-hidden">
          <div class="h-full flex" on:click|stopPropagation={exitStandby}>
            <div class="hidden md:flex w-[38%] min-w-[320px] flex-col p-8 h-full">
              <!-- Top row: Todo + Weather side by side -->
              <div class="flex gap-6">
                {#if todoEnabled && outlookConnected}
                  <div class="flex-1 min-w-0 text-white">
                    <TodoWidget variant="plain" showAddButton={false} compact={true} />
                  </div>
                {/if}
                <div class="w-36 shrink-0 text-white">
                  <ForecastWidget compact={true} />
                </div>
              </div>

              {#if scribbleEnabled}
                <div class="text-white mt-5 mb-4">
                  {#if standbyScribbles.length > 0}
                    <!-- Grid container for crossfade without layout jump -->
                    <div class="grid place-items-start" style="grid-template-areas: 'stack';">
                      {#key standbyScribbles[standbyScribbleIndex]?.id}
                        <div
                          class="{scribblePaperLook ? 'scribble-paper-bg' : 'bg-white/5 backdrop-blur-md'} rounded-2xl p-2 shadow-lg inline-flex flex-col items-center justify-self-start"
                          style="grid-area: stack;"
                          in:fade={{ duration: 300 }}
                          out:fade={{ duration: 300 }}
                        >
                          <img
                            src={standbyScribbles[standbyScribbleIndex]?.imageData}
                            alt="Notiz"
                            class="w-64 max-w-[280px] aspect-square object-contain rounded-lg"
                          />
                          {#if standbyScribbles[standbyScribbleIndex]?.authorName}
                            <div class="{scribblePaperLook ? 'text-zinc-500' : 'text-white/50'} text-xs mt-1.5 truncate text-center font-medium">
                              {standbyScribbles[standbyScribbleIndex].authorName}
                            </div>
                          {/if}
                        </div>
                      {/key}
                    </div>
                  {/if}
                </div>
              {/if}

              {#if musicWidgetEnabled && (($musicPlayerState.playing && $musicPlayerState.now) || $heosPlaybackStatus.isExternal)}
                <div class="standby-music mt-10 mb-6">
                  <div class="flex items-center gap-5">
                    <div class="relative w-28 h-28 overflow-hidden rounded-lg shadow-2xl shadow-black/50 shrink-0">
                      {#if $musicPlayerState.now?.coverUrl}
                        <img src={$musicPlayerState.now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                      {:else if $heosPlaybackStatus.isExternal && $heosPlaybackStatus.imageUrl}
                        <img src={$heosPlaybackStatus.imageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                      {:else}
                        <div class="h-full w-full bg-white/10 flex items-center justify-center">
                          <svg viewBox="0 0 24 24" class="h-10 w-10 text-white/30" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                        </div>
                      {/if}
                      <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                    </div>

                    <div class="min-w-0">
                      {#if $musicPlayerState.now}
                        <div class="text-lg font-semibold text-white leading-tight truncate">{$musicPlayerState.now.artist}</div>
                        <div class="text-white/60 text-sm mt-1 leading-snug line-clamp-2">{$musicPlayerState.now.title}</div>
                      {:else if $heosPlaybackStatus.isExternal}
                        <div class="text-lg font-semibold text-white leading-tight truncate">{$heosPlaybackStatus.artist ?? 'Musik'}</div>
                        <div class="text-white/60 text-sm mt-1 leading-snug line-clamp-2">{$heosPlaybackStatus.title ?? 'Wiedergabe'}</div>
                      {:else}
                        <div class="text-white/40 text-sm">Keine Wiedergabe</div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}

              <div class="mt-auto pb-2">
                <div class="text-white">
                  <div class="text-xl md:text-2xl font-semibold tracking-wide mb-3">{todayFullDate}</div>
                  <Clock tone="light" style={clockStyle} />
                </div>
              </div>
            </div>

            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div class="w-full md:w-[54%] lg:w-[44%] ml-auto h-full flex flex-col min-h-0 px-8 py-8" on:click|stopPropagation={exitStandby}>
              <div class="flex-1 min-h-0 overflow-hidden relative">
                {#if upcomingEvents.length === 0}
                  <div class="text-white/60 text-lg">Keine kommenden Termine.</div>
                {:else}
                  {@const page = standbyPages[standbyPageIndex] ?? []}
                  {#key standbyPageIndex}
                    <div class="space-y-5 absolute inset-0" in:fade={{ duration: 400, delay: 200 }} out:fade={{ duration: 300 }}>
                      {#each page as e (e.occurrenceId ?? `${e.id}:${e.startAt}`)}
                        {@const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : []}
                        {@const p0 = ps[0]}
                        <button
                          type="button"
                          class="w-full text-left py-4 border-b border-white/5 hover:bg-white/5 active:bg-white/8 transition -mx-4 px-4 rounded-xl"
                          on:click={() => openEditEventModal(e)}
                        >
                          <div class="flex items-start gap-4">
                            <div
                              class={`mt-1.5 h-3 w-3 rounded-full shrink-0 ${
                                e.tag
                                  ? isHexColor(e.tag.color)
                                    ? 'bg-transparent'
                                    : dotBg[e.tag.color as TagColorKey] ?? 'bg-white/25'
                                  : p0
                                    ? dotBg[p0.color as TagColorKey] ?? 'bg-white/25'
                                    : 'bg-white/25'
                              }`}
                              style={e.tag && isHexColor(e.tag.color) ? `background-color: ${e.tag.color}` : ''}
                            ></div>
                            <div class="min-w-0 flex-1">
                              <div class="text-2xl font-semibold truncate">{e.title}</div>
                              <div class="text-white/60 mt-1 text-lg">
                                {fmtUpcomingDate(e.startAt)}
                                {#if e.allDay}
                                  <span> · Ganztägig</span>
                                {:else}
                                  <span> · {fmtTimeRange(e.startAt, e.endAt)}</span>
                                {/if}
                                {#if e.location} <span> · {e.location}</span>{/if}
                                {#if ps.length > 0}
                                  <span>
                                    · {#each ps as p, i (p.id)}{#if i > 0},{/if}<span class={`${textFg[p.color as TagColorKey] ?? 'text-white/80'} font-semibold ${i > 0 ? 'pl-0.5' : ''}`}>{p.name}</span>{/each}
                                  </span>
                                {/if}
                              </div>
                              {#if e.description}
                                <div class="text-white/50 mt-2 text-base leading-tight">{e.description}</div>
                              {/if}
                            </div>
                          </div>
                        </button>
                      {/each}
                    </div>
                  {/key}
                {/if}
              </div>

              {#if musicWidgetEnabled && (($musicPlayerState.playing && $musicPlayerState.now) || $heosPlaybackStatus.isExternal)}
                <div class="standby-music mt-6 md:hidden">
                  <div class="relative h-24 w-24 overflow-hidden rounded-none shadow-lg shadow-black/30">
                    {#if $musicPlayerState.now?.coverUrl}
                      <img src={$musicPlayerState.now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                    {:else if $heosPlaybackStatus.isExternal && $heosPlaybackStatus.imageUrl}
                      <img src={$heosPlaybackStatus.imageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                    {:else}
                      <div class="h-full w-full bg-white/10 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" class="h-7 w-7 text-white/30" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                      </div>
                    {/if}
                    <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"></div>
                    <div class="absolute inset-x-0 bottom-0 p-2">
                      {#if $musicPlayerState.now}
                        <div class="text-sm font-semibold text-white leading-tight line-clamp-1">{$musicPlayerState.now.artist}</div>
                        <div class="text-[11px] text-white/70 leading-tight line-clamp-1">{$musicPlayerState.now.title}</div>
                      {:else if $heosPlaybackStatus.isExternal}
                        <div class="text-sm font-semibold text-white leading-tight line-clamp-1">{$heosPlaybackStatus.artist ?? 'Musik'}</div>
                        <div class="text-[11px] text-white/70 leading-tight line-clamp-1">{$heosPlaybackStatus.title ?? 'Wiedergabe'}</div>
                      {:else}
                        <div class="text-[11px] text-white/60">Keine Wiedergabe</div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}

              {#if newsEnabled}
                <div class="mt-auto pt-6">
                  {#if standbyNewsItems.length > 0}
                    <div class="standby-news-container relative h-[220px] w-full">
                      {#key standbyNewsIndex}
                        {@const n = standbyNewsItems[standbyNewsIndex]}
                        {@const validTeaser = n.teaser && n.teaser !== 'None' && n.teaser.trim() !== ''}
                        <div
                          class="standby-zeit-news absolute inset-0 w-full overflow-hidden rounded-2xl bg-white/5 backdrop-blur-md"
                          in:fade={{ duration: 600, delay: 300 }}
                          out:fade={{ duration: 300 }}
                        >
                          {#if n.imageUrl}
                            <div class="absolute inset-0 bg-cover bg-center opacity-45" style={`background-image: url('${n.imageUrl}');`}></div>
                            <div class="absolute inset-0 bg-gradient-to-r from-black/55 via-black/35 to-black/15"></div>
                          {:else}
                            <div class="absolute inset-0 bg-white/5"></div>
                          {/if}
                          <div class="relative px-6 pt-6 pb-9">
                            <div class="flex items-center gap-2 text-xs tracking-widest uppercase text-white/50 font-medium">
                              <span class="inline-block w-4 h-px bg-white/30"></span>
                              <span>News</span>
                              {#if standbyNewsMultiSource && n.source}
                                <span class="ml-2 text-white/35">{newsSourceLabel(n.source)}</span>
                              {/if}
                            </div>
                            <div class="mt-3 text-xl md:text-2xl font-semibold leading-snug">{n.title}</div>
                            {#if validTeaser}
                              <div class="mt-3 text-white/60 text-base leading-relaxed line-clamp-3">{n.teaser}</div>
                            {/if}
                            {#if standbyNewsItems.length > 1}
                              <div class="mt-4 flex gap-1.5">
                                {#each standbyNewsItems as _, i}
                                  <div class="h-1 rounded-full transition-all duration-300 {i === standbyNewsIndex ? 'w-6 bg-white/70' : 'w-1.5 bg-white/20'}"></div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/key}
                    </div>
                  {:else}
                    <div class="standby-zeit-news w-full overflow-hidden rounded-2xl bg-white/5 backdrop-blur-md">
                      <div class="px-6 pt-6 pb-9">
                        <div class="flex items-center gap-2 text-xs tracking-widest uppercase text-white/50 font-medium">
                          <span class="inline-block w-4 h-px bg-white/30"></span>
                          <span>News</span>
                        </div>
                        <div class="mt-3 text-white/60 text-base">
                          {#if standbyNewsLoading}
                            Lade News…
                          {:else}
                            Keine Artikel verfügbar.
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {:else if !upcomingMode}
        <div class="h-screen grid grid-rows-[1fr,minmax(140px,24vh)]" out:fly={{ x: 180, duration: 220 }}>
          <div class="min-h-0 overflow-hidden">
            <div class={`${dashboardTextClasses} ${dashboardGlassBlurEnabled ? 'glass-dashboard-blur' : 'glass-dashboard-flat'} border-b border-white/10 h-full overflow-hidden`} transition:fade={{ duration: 180 }}>
              <CalendarMonth
                {monthAnchor}
                selected={selectedDate}
                onSelect={onSelect}
                {events}
                {holidays}
                {viewMode}
                onSetViewMode={setViewMode}
                {upcomingMode}
                onToggleUpcoming={toggleUpcomingMode}
                onOpenPlanner={openPlanner}
              />
            </div>
          </div>
          <div class={`${dashboardTextClasses} border-t border-white/10 ${dashboardGlassBlurEnabled ? 'glass-dashboard-blur' : 'glass-dashboard-flat'} h-full overflow-hidden`}>
            <EventsPanel {selectedDate} {events} {holidays} onCreate={openAddEventModal} onEdit={openEditEventModal} />
          </div>
        </div>
      {:else}
        <div class="h-screen overflow-hidden" in:fly={{ x: 120, duration: 220 }}>
          <div class="h-full flex">
            <!-- Left: todo + weather (side by side) + scribble + clock -->
            <div class="hidden md:flex w-[38%] min-w-[320px] flex-col p-8 h-full">
              <!-- Top row: Todo + Weather side by side -->
              <div class="flex gap-6">
                {#if todoEnabled && outlookConnected}
                  <div class="flex-1 min-w-0 text-white">
                    <TodoWidget variant="plain" showAddButton={false} compact={true} />
                  </div>
                {/if}
                <div class="w-36 shrink-0 text-white">
                  <ForecastWidget compact={true} />
                </div>
              </div>

              {#if scribbleEnabled}
                <div class="text-white mt-5 mb-4">
                  {#if standbyScribbles.length > 0}
                    <!-- Grid container for crossfade without layout jump -->
                    <div class="grid place-items-start" style="grid-template-areas: 'stack';">
                      {#key standbyScribbles[standbyScribbleIndex]?.id}
                        <div
                          class="{scribblePaperLook ? 'scribble-paper-bg' : 'bg-white/5 backdrop-blur-md'} rounded-2xl p-2 shadow-lg inline-flex flex-col items-center justify-self-start"
                          style="grid-area: stack;"
                          in:fade={{ duration: 300 }}
                          out:fade={{ duration: 300 }}
                        >
                          <img
                            src={standbyScribbles[standbyScribbleIndex]?.imageData}
                            alt="Notiz"
                            class="w-64 max-w-[280px] aspect-square object-contain rounded-lg"
                          />
                          {#if standbyScribbles[standbyScribbleIndex]?.authorName}
                            <div class="{scribblePaperLook ? 'text-zinc-500' : 'text-white/50'} text-xs mt-1.5 truncate text-center font-medium">
                              {standbyScribbles[standbyScribbleIndex].authorName}
                            </div>
                          {/if}
                        </div>
                      {/key}
                    </div>
                  {/if}
                </div>
              {/if}

              {#if musicWidgetEnabled && ($musicPlayerState.now || $heosPlaybackStatus.isExternal)}
                <div class="standby-music mt-10 mb-6">
                  <div class="flex items-center gap-5">
                    <div class="relative w-28 h-28 overflow-hidden rounded-lg shadow-2xl shadow-black/50 shrink-0">
                      {#if $musicPlayerState.now?.coverUrl}
                        <img src={$musicPlayerState.now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                      {:else if $heosPlaybackStatus.isExternal && $heosPlaybackStatus.imageUrl}
                        <img src={$heosPlaybackStatus.imageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                      {:else}
                        <div class="h-full w-full bg-white/10 flex items-center justify-center">
                          <svg viewBox="0 0 24 24" class="h-10 w-10 text-white/30" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                        </div>
                      {/if}
                      <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                    </div>

                    <div class="min-w-0">
                      {#if $musicPlayerState.now}
                        <div class="text-lg font-semibold text-white leading-tight truncate">{$musicPlayerState.now.artist}</div>
                        <div class="text-white/60 text-sm mt-1 leading-snug line-clamp-2">{$musicPlayerState.now.title}</div>
                      {:else if $heosPlaybackStatus.isExternal}
                        <div class="text-lg font-semibold text-white leading-tight truncate">{$heosPlaybackStatus.artist ?? 'Musik'}</div>
                        <div class="text-white/60 text-sm mt-1 leading-snug line-clamp-2">{$heosPlaybackStatus.title ?? 'Wiedergabe'}</div>
                      {:else}
                        <div class="text-white/40 text-sm">Keine Wiedergabe</div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}

              <div class="mt-auto pb-2">
                <div class="text-white">
                  <div class="text-xl md:text-2xl font-semibold tracking-wide mb-3">{todayFullDate}</div>
                  <Clock tone="light" style={clockStyle} />
                </div>
              </div>
            </div>

            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <!-- Right: events -->
            <div class="w-full md:w-[54%] lg:w-[44%] ml-auto h-full flex flex-col min-h-0 px-8 py-8" on:click|stopPropagation={exitStandby}>

              <div class="flex-1 min-h-0 overflow-hidden relative">
                {#if upcomingEvents.length === 0}
                  <div class="text-white/60 text-lg">Keine kommenden Termine.</div>
                {:else}
                  {@const page = standbyPages[standbyPageIndex] ?? []}
                  {#key standbyPageIndex}
                    <div class="space-y-5 absolute inset-0" in:fade={{ duration: 400, delay: 200 }} out:fade={{ duration: 300 }}>
                      {#each page as e (e.occurrenceId ?? `${e.id}:${e.startAt}`)}
                        {@const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : []}
                        {@const p0 = ps[0]}
                        <button
                          type="button"
                          class="w-full text-left py-4 border-b border-white/5 hover:bg-white/5 active:bg-white/8 transition -mx-4 px-4 rounded-xl"
                          on:click={() => openEditEventModal(e)}
                        >
                          <div class="flex items-start gap-4">
                            <div
                              class={`mt-1.5 h-3 w-3 rounded-full shrink-0 ${
                                e.tag
                                  ? isHexColor(e.tag.color)
                                    ? 'bg-transparent'
                                    : dotBg[e.tag.color as TagColorKey] ?? 'bg-white/25'
                                  : p0
                                    ? dotBg[p0.color as TagColorKey] ?? 'bg-white/25'
                                    : 'bg-white/25'
                              }`}
                              style={e.tag && isHexColor(e.tag.color) ? `background-color: ${e.tag.color}` : ''}
                            ></div>
                            <div class="min-w-0 flex-1">
                              <div class="text-2xl font-semibold truncate">{e.title}</div>
                              <div class="text-white/60 mt-1 text-lg">
                                {fmtUpcomingDate(e.startAt)}
                                {#if e.allDay}
                                  <span> · Ganztägig</span>
                                {:else}
                                  <span> · {fmtTimeRange(e.startAt, e.endAt)}</span>
                                {/if}
                                {#if e.location} <span> · {e.location}</span>{/if}
                                {#if ps.length > 0}
                                  <span>
                                    · {#each ps as p, i (p.id)}{#if i > 0},{/if}<span class={`${textFg[p.color as TagColorKey] ?? 'text-white/80'} font-semibold ${i > 0 ? 'pl-0.5' : ''}`}>{p.name}</span>{/each}
                                  </span>
                                {/if}
                              </div>
                              {#if e.description}
                                <div class="text-white/50 mt-2 text-base leading-tight">{e.description}</div>
                              {/if}
                            </div>
                          </div>
                        </button>
                      {/each}
                    </div>
                  {/key}
                {/if}
              </div>

              {#if musicWidgetEnabled && ($musicPlayerState.now || $heosPlaybackStatus.isExternal)}
                <div class="standby-music mt-6 md:hidden">
                  <div class="flex items-center gap-4">
                    <div class="h-14 w-14 overflow-hidden rounded-none shadow-lg shadow-black/30 shrink-0">
                      {#if $musicPlayerState.now?.coverUrl}
                        <img src={$musicPlayerState.now.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                      {:else if $heosPlaybackStatus.isExternal && $heosPlaybackStatus.imageUrl}
                        <img src={$heosPlaybackStatus.imageUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
                      {:else}
                        <div class="h-full w-full bg-white/10 flex items-center justify-center">
                          <svg viewBox="0 0 24 24" class="h-5 w-5 text-white/30" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                        </div>
                      {/if}
                    </div>
                    <div class="min-w-0">
                      {#if $musicPlayerState.now}
                        <div class="text-base font-semibold text-white truncate">{$musicPlayerState.now.artist}</div>
                        <div class="text-white/50 text-sm truncate">{$musicPlayerState.now.title}</div>
                      {:else if $heosPlaybackStatus.isExternal}
                        <div class="text-base font-semibold text-white truncate">{$heosPlaybackStatus.artist ?? 'Musik'}</div>
                        <div class="text-white/50 text-sm truncate">{$heosPlaybackStatus.title ?? 'Wiedergabe'}</div>
                      {:else}
                        <div class="text-white/40 text-sm">Keine Wiedergabe</div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}

              {#if newsEnabled}
                <div class="mt-auto pt-6">
                              {#if standbyNewsItems.length > 0}
                    <div class="standby-news-container relative h-[220px] w-full">
                      {#key standbyNewsIndex}
                        {@const n = standbyNewsItems[standbyNewsIndex]}
                        {@const validTeaser = n.teaser && n.teaser !== 'None' && n.teaser.trim() !== ''}
                        <div
                          class="standby-zeit-news absolute inset-0 w-full overflow-hidden rounded-2xl bg-white/5 backdrop-blur-md"
                          in:fade={{ duration: 600, delay: 300 }}
                          out:fade={{ duration: 300 }}
                        >
                          {#if n.imageUrl}
                            <div class="absolute inset-0 bg-cover bg-center opacity-45" style={`background-image: url('${n.imageUrl}');`}></div>
                            <div class="absolute inset-0 bg-gradient-to-r from-black/55 via-black/35 to-black/15"></div>
                          {:else}
                            <div class="absolute inset-0 bg-white/5"></div>
                          {/if}
                          <div class="relative px-6 pt-6 pb-9">
                            <div class="flex items-center gap-2 text-xs tracking-widest uppercase text-white/50 font-medium">
                              <span class="inline-block w-4 h-px bg-white/30"></span>
                              <span>News</span>
                              {#if standbyNewsMultiSource && n.source}
                                <span class="ml-2 text-white/35">{newsSourceLabel(n.source)}</span>
                              {/if}
                            </div>
                            <div class="mt-3 text-xl md:text-2xl font-semibold leading-snug">{n.title}</div>
                            {#if validTeaser}
                              <div class="mt-3 text-white/60 text-base leading-relaxed line-clamp-3">{n.teaser}</div>
                            {/if}
                            {#if standbyNewsItems.length > 1}
                              <div class="mt-4 flex gap-1.5">
                                {#each standbyNewsItems as _, i}
                                  <div class="h-1 rounded-full transition-all duration-300 {i === standbyNewsIndex ? 'w-6 bg-white/70' : 'w-1.5 bg-white/20'}"></div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/key}
                    </div>
                  {:else}
                    <div class="standby-zeit-news w-full overflow-hidden rounded-2xl bg-white/5 backdrop-blur-md">
                      <div class="px-6 pt-6 pb-9">
                        <div class="flex items-center gap-2 text-xs tracking-widest uppercase text-white/50 font-medium">
                          <span class="inline-block w-4 h-px bg-white/30"></span>
                          <span>News</span>
                        </div>
                        <div class="mt-3 text-white/60 text-base">
                          {#if standbyNewsLoading}
                            Lade News…
                          {:else}
                            Keine Artikel verfügbar.
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <AddEventModal open={showAddEventModal} {selectedDate} {eventToEdit} onClose={closeAddEventModal} onCreated={loadEvents} />

  <!-- Week Planner Overlay -->
  {#if plannerOpen}
    <WeekPlanner
      {selectedDate}
      {events}
      {holidays}
      {outlookConnected}
      {todoEnabled}
      onSelect={onSelect}
      onEditEvent={openEditEventModal}
      onBack={closePlanner}
      onEventsChanged={loadEvents}
    />
  {/if}

  <!-- Mobile fallback: show widgets above -->
  {#if !upcomingMode}
    <div class="relative z-10 md:hidden p-6 border-t border-white/10 glass">
      <div class="flex items-center justify-between">
        <WeatherWidget />
        <Clock style={clockStyle} />
      </div>
    </div>
  {/if}

  <!-- Floating button on mobile: hint at /planner -->
  {#if !standbyMode && !plannerOpen}
    <a
      href="/planner"
      class="fixed bottom-6 right-6 z-50 md:hidden flex items-center gap-2 px-4 py-3 rounded-full bg-white/20 backdrop-blur-md border border-white/10 shadow-lg text-white text-sm font-medium hover:bg-white/30 transition-colors"
      in:fly={{ y: 20, duration: 250, delay: 500 }}
      out:fade={{ duration: 150 }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      Mobile Ansicht
    </a>
  {/if}
</div>

<style>
  .standby-zeit-news {
    -webkit-mask-image: radial-gradient(120% 120% at 50% 50%, #000 72%, transparent 100%);
    mask-image: radial-gradient(120% 120% at 50% 50%, #000 72%, transparent 100%);
  }
</style>
