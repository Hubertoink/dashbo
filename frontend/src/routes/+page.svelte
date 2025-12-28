<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import Clock from '$lib/components/Clock.svelte';
  import WeatherWidget from '$lib/components/WeatherWidget.svelte';
  import TodoWidget from '$lib/components/TodoWidget.svelte';
  import ZeitNewsWidget from '$lib/components/ZeitNewsWidget.svelte';
  import ForecastWidget from '$lib/components/ForecastWidget.svelte';
  import CalendarMonth from '$lib/components/CalendarMonth.svelte';
  import WeekView from '$lib/components/WeekView.svelte';
  import EventsPanel from '$lib/components/EventsPanel.svelte';
  import AddEventModal from '$lib/components/AddEventModal.svelte';
  import { fetchEvents, fetchHolidays, type HolidayDto, type EventDto, type TagColorKey, fetchSettings, getStoredToken } from '$lib/api';
  import { daysForMonthGrid } from '$lib/date';

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

  let upcomingMode = false;
  let standbyMode = false;

  const STANDBY_TRANSITION_MS = 700;
  let standbyTransitioning = false;
  let standbyOverlayVisible = false;
  let standbySwitchTimer: ReturnType<typeof setTimeout> | null = null;
  let standbyUnlockTimer: ReturnType<typeof setTimeout> | null = null;

  let holidaysEnabled = false;
  let todoEnabled = true;
  let newsEnabled = false;
  let holidays: HolidayDto[] = [];

  let standbyTimer: ReturnType<typeof setTimeout> | null = null;
  const STANDBY_IDLE_MS = 10 * 60 * 1000;

  const STANDBY_PAGE_SIZE = 5;
  const STANDBY_PAGE_MS = 10_000;

  let dataRefreshMs = 60_000;
  let dataRefreshInterval: ReturnType<typeof setInterval> | null = null;

  let standbyPageIndex = 0;
  let standbyRotateInterval: ReturnType<typeof setInterval> | null = null;
  let standbyRotationKey = '';

  let showAddEventModal = false;
  let eventToEdit: EventDto | null = null;

  function openAddEventModal() {
    eventToEdit = null;
    showAddEventModal = true;
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

  onDestroy(() => {
    clearStandbyTransitionTimers();
    if (standbyRotateInterval) clearInterval(standbyRotateInterval);
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

        if (typeof s?.dataRefreshMs === 'number' && Number.isFinite(s.dataRefreshMs) && s.dataRefreshMs > 0) {
          dataRefreshMs = s.dataRefreshMs;
          startRefreshInterval();
        }

        const uploaded = (s.images ?? []).map((img: string) => `/api/media/${img}`);
        uploadedBackgroundUrls = uploaded;

        if (bgRotateInterval) {
          clearInterval(bgRotateInterval);
          bgRotateInterval = null;
        }

        const rotateEnabled = Boolean(s.backgroundRotateEnabled);

        if (uploadedBackgroundUrls.length > 0) {
          if (rotateEnabled) {
            // Rotation enabled: start on a random uploaded image.
            bgIndex = Math.floor(Math.random() * uploadedBackgroundUrls.length);
            await applyBackground(uploadedBackgroundUrls[bgIndex] ?? '/background.jpg');

            if (uploadedBackgroundUrls.length > 1) {
              bgRotateInterval = setInterval(() => {
                // pick a random next index (avoid immediate repeat when possible)
                const max = uploadedBackgroundUrls.length;
                let nextIndex = Math.floor(Math.random() * max);
                if (max > 1 && nextIndex === bgIndex) nextIndex = (nextIndex + 1) % max;
                bgIndex = nextIndex;
                const next = uploadedBackgroundUrls[bgIndex];
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
      style={`background-image: linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0.78)), url('${backgroundUrl}'); background-size: cover; background-position: center;`}
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
        <div class={tone === 'dark' ? 'text-black' : 'text-white'}>
          <WeatherWidget {tone} />
        </div>

        {#if todoEnabled}
          <div class={`mt-6 pb-8 ${tone === 'dark' ? 'text-black' : 'text-white'}`}>
            <TodoWidget />
          </div>
        {/if}

        {#if newsEnabled}
          <div class={`mt-2 pb-8 ${tone === 'dark' ? 'text-black' : 'text-white'}`}>
            <ZeitNewsWidget />
          </div>
        {/if}

        <div class="mt-auto pb-2">
          <div class={tone === 'dark' ? 'text-black' : 'text-white'}>
            <Clock {tone} />
          </div>
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
            <div class="hidden md:flex w-[34%] min-w-[280px] flex-col justify-between p-10 h-full">
              {#if todoEnabled}
                <div class={tone === 'dark' ? 'text-black' : 'text-white'}>
                  <TodoWidget />
                </div>
              {/if}

              <div class={tone === 'dark' ? 'text-black' : 'text-white'}>
                <ForecastWidget {tone} />
              </div>

              <div class="pb-2">
                <div class={tone === 'dark' ? 'text-black' : 'text-white'}>
                  <div class="text-xl md:text-2xl font-semibold tracking-wide mb-3">{todayFullDate}</div>
                  <Clock {tone} />
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
                                  : e.person
                                    ? dotBg[e.person.color as TagColorKey] ?? 'bg-white/25'
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
                                {#if e.person}
                                  <span>
                                    · <span class={`${textFg[e.person.color] ?? 'text-white/80'} font-semibold`}>{e.person.name}</span>
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
            </div>
          </div>
        </div>
      {:else if !upcomingMode}
        <div class="h-screen grid grid-rows-[1fr,minmax(140px,24vh)]" out:fly={{ x: 180, duration: 220 }}>
          <div class="min-h-0 overflow-hidden">
            {#if viewMode === 'month'}
              <div class="glass border-b border-white/10 h-full overflow-hidden" transition:fade={{ duration: 180 }}>
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
                />
              </div>
            {:else}
              <div class="glass border-b border-white/10 h-full overflow-hidden" transition:fade={{ duration: 180 }}>
                <WeekView {selectedDate} {events} {holidays} onSelect={onSelect} {viewMode} onSetViewMode={setViewMode} onEdit={openEditEventModal} />
              </div>
            {/if}
          </div>
          <div class="border-t border-white/10 glass h-full overflow-hidden">
            <EventsPanel {selectedDate} {events} {holidays} onCreate={openAddEventModal} onEdit={openEditEventModal} />
          </div>
        </div>
      {:else}
        <div class="h-screen overflow-hidden" in:fly={{ x: 120, duration: 220 }}>
          <div class="h-full flex">
            <!-- Left: forecast + todo + clock -->
            <div class="hidden md:flex w-[34%] min-w-[280px] flex-col p-10 h-full">
              <div class={tone === 'dark' ? 'text-black' : 'text-white'}>
                <ForecastWidget {tone} />
              </div>

              {#if todoEnabled}
                <div class={`mt-6 pb-8 ${tone === 'dark' ? 'text-black' : 'text-white'}`}>
                  <TodoWidget variant="plain" />
                </div>
              {/if}

              <div class="mt-auto pb-2">
                <div class={tone === 'dark' ? 'text-black' : 'text-white'}>
                  <div class="text-xl md:text-2xl font-semibold tracking-wide mb-3">{todayFullDate}</div>
                  <Clock {tone} />
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
                                  : e.person
                                    ? dotBg[e.person.color as TagColorKey] ?? 'bg-white/25'
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
                                {#if e.person}
                                  <span>
                                    · <span class={`${textFg[e.person.color] ?? 'text-white/80'} font-semibold`}>{e.person.name}</span>
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
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <AddEventModal open={showAddEventModal} {selectedDate} {eventToEdit} onClose={closeAddEventModal} onCreated={loadEvents} />

  <!-- Mobile fallback: show widgets above -->
  {#if !upcomingMode}
    <div class="relative z-10 md:hidden p-6 border-t border-white/10 glass">
      <div class="flex items-center justify-between">
        <WeatherWidget />
        <Clock />
      </div>
    </div>
  {/if}
</div>
