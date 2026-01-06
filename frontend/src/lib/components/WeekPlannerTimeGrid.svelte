<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { EventDto, HolidayDto, TagColorKey } from '$lib/api';
  import { deleteEvent, updateEvent } from '$lib/api';
  import { formatGermanDayLabel, sameDay } from '$lib/date';
  import { fade, scale } from 'svelte/transition';
  import { layoutWeekTimedSegments, type PositionedSegment, type WeekPlannerConfig } from '$lib/weekPlannerLayout';

  type EventSuggestionDto = {
    suggestionKey: string;
    title: string;
    startAt: string;
    endAt: string | null;
    allDay: boolean;
    tag: EventDto['tag'];
    person: EventDto['person'];
    persons?: EventDto['persons'];
  };

  export let days: Date[] = [];
  export let events: EventDto[] = [];
  export let holidays: HolidayDto[] = [];
  export let suggestions: EventSuggestionDto[] = [];
  export let backgroundUrl: string = '';
  export let onAddEvent: (d: Date) => void;
  export let onAddAllDayEvent: (d: Date) => void = () => {};
  export let onEditEvent: (e: EventDto) => void;
  export let onEventDeleted: () => void = () => {};
  export let onEventMoved: () => void = () => {};
  export let onAcceptSuggestion: (s: EventSuggestionDto) => void = () => {};
  export let onDismissSuggestion: (s: EventSuggestionDto) => void = () => {};

  const config: WeekPlannerConfig = {
    startHour: 6,
    endHour: 22,
    defaultDurationMinutes: 60,
    pxPerMinute: 1.0,
    snapMinutes: 15
  };

  const tileBg: Record<TagColorKey, string> = {
    fuchsia: 'bg-fuchsia-500/25',
    cyan: 'bg-cyan-400/25',
    emerald: 'bg-emerald-400/25',
    amber: 'bg-amber-400/25',
    rose: 'bg-rose-400/25',
    violet: 'bg-violet-400/25',
    sky: 'bg-sky-400/25',
    lime: 'bg-lime-400/25'
  };

  const hexRe = /^#[0-9a-fA-F]{6}$/;
  function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && hexRe.test(value);
  }

  function hexToRgba(hex: string, alpha: number): string {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function startOfLocalDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dateKey(d: Date): number {
    return startOfLocalDay(d).getTime();
  }

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTimeRange(startIso: string, endIso: string | null): string {
    const start = fmtTime(startIso);
    if (endIso) return `${start} – ${fmtTime(endIso)}`;
    return start;
  }

  function minutesOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  function fmtSuggestionTime(s: EventSuggestionDto): string {
    if (s.allDay) return 'Ganztägig';
    return fmtTimeRange(s.startAt, s.endAt);
  }

  function eventBaseColor(e: EventDto): string | null {
    const tagColor = e.tag?.color;
    if (tagColor && typeof tagColor === 'string') return tagColor;
    const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : [];
    const p0 = ps[0];
    return p0?.color ?? null;
  }

  function eventPersons(e: EventDto): { name: string; color?: string }[] {
    const ps = e.persons && e.persons.length > 0 ? e.persons : e.person ? [e.person] : [];
    return ps.map((p) => ({ name: p.name, color: p.color }));
  }

  function suggestionBaseColor(s: EventSuggestionDto): string | null {
    const tagColor = s.tag?.color;
    if (tagColor && typeof tagColor === 'string') return tagColor;
    const ps = s.persons && s.persons.length > 0 ? s.persons : s.person ? [s.person] : [];
    const p0 = ps[0];
    return (p0 as any)?.color ?? null;
  }

  function eventTileStyle(color: string | null): string {
    if (!color) return '';
    if (isHexColor(color)) {
      return `background-color: ${hexToRgba(color, 0.30)}; border-color: ${hexToRgba(color, 0.55)};`;
    }
    // palette key -> keep to existing tokens; use border only, bg via tailwind class
    return '';
  }

  function eventTileBgClass(color: string | null): string {
    if (!color) return 'bg-white/5 border-white/10';
    if (isHexColor(color)) return 'bg-white/5';
    const key = color as TagColorKey;
    return `${tileBg[key] ?? 'bg-white/10'} border-white/10`;
  }

  $: holidaysByDay = (() => {
    const m = new Map<number, HolidayDto[]>();
    for (const h of holidays) {
      const d = new Date(`${h.date}T00:00:00`);
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(h);
      m.set(k, arr);
    }
    return m;
  })();

  $: allDayByDay = (() => {
    const m = new Map<number, EventDto[]>();
    for (const e of events) {
      if (!e.allDay) continue;
      const start = startOfLocalDay(new Date(e.startAt));
      const end = e.endAt ? startOfLocalDay(new Date(e.endAt)) : start;
      const maxSpanDays = 62;
      const spanDays = Math.min(
        maxSpanDays,
        Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)))
      );
      for (let i = 0; i <= spanDays; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        const k = dateKey(day);
        const arr = m.get(k) ?? [];
        arr.push(e);
        m.set(k, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return m;
  })();

  $: timedByDay = layoutWeekTimedSegments(events, days, config);

  $: suggestionsByDay = (() => {
    const m = new Map<number, EventSuggestionDto[]>();
    for (const s of suggestions) {
      const d = startOfLocalDay(new Date(s.startAt));
      const k = dateKey(d);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return m;
  })();

  const totalMinutes = (config.endHour - config.startHour) * 60;
  const gridHeightPx = totalMinutes * config.pxPerMinute;
  const hours: number[] = Array.from({ length: config.endHour - config.startHour + 1 }, (_, i) => config.startHour + i);

  let deleteConfirmEvent: EventDto | null = null;
  let deleting = false;

  function requestDelete(event: EventDto) {
    deleteConfirmEvent = event;
  }

  async function confirmDelete() {
    if (!deleteConfirmEvent || deleting) return;
    deleting = true;
    try {
      await deleteEvent(deleteConfirmEvent.id);
      deleteConfirmEvent = null;
      onEventDeleted();
    } catch (err) {
      console.error('Delete event failed:', err);
    } finally {
      deleting = false;
    }
  }

  function cancelDelete() {
    deleteConfirmEvent = null;
  }

  // Drag & Drop state
  let dragEvent: EventDto | null = null;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragOffsetX = 0; // offset within tile where user grabbed (x)
  let dragOffsetY = 0; // offset within tile where user grabbed
  let dragCurrentX = 0;
  let dragCurrentY = 0;
  let dragTileW = 0;
  let dragTileH = 0;
  let dragGridRect: DOMRect | null = null;
  let dragDayRects: { day: Date; left: number; right: number }[] = [];
  let dragTargetDay: Date | null = null;
  let dragTargetMinutes: number | null = null;
  let dragMoving = false;
  let dragDropping = false;
  let dragSaving = false;

  // Floating "paper" overlay (pixel-accurate drag with inertia)
  let dragFloatX = 0;
  let dragFloatY = 0;
  let dragFloatW = 0;
  let dragFloatH = 0;
  let dragFloatTargetX = 0;
  let dragFloatTargetY = 0;
  let dragFloatTargetW = 0;
  let dragFloatTargetH = 0;
  let dragFloatVX = 0;
  let dragFloatVY = 0;
  let dragFloatVW = 0;
  let dragFloatVH = 0;
  let dragRaf: number | null = null;
  let dragFloatEl: HTMLDivElement | null = null;
  let dragFlutterEnergy = 0;

  function startDragLoop() {
    if (dragRaf != null) return;
    const tick = () => {
      if (!dragEvent) {
        dragRaf = null;
        return;
      }

      // Keep the loop alive even before dragMoving flips true.
      // This avoids a "tiny tile at 0,0" when the floating element appears.
      if (!dragMoving && !dragDropping) {
        dragRaf = requestAnimationFrame(tick);
        return;
      }

      {
        // Soft/heavy follow while dragging (no snapping): mild spring towards pointer
        // Stronger settle on drop to land into the grid.
        const stiffness = dragDropping ? 0.18 : 0.16;
        const damping = dragDropping ? 0.76 : 0.80;

        let nextVX = (dragFloatVX + (dragFloatTargetX - dragFloatX) * stiffness) * damping;
        let nextVY = (dragFloatVY + (dragFloatTargetY - dragFloatY) * stiffness) * damping;
        let nextVW = (dragFloatVW + (dragFloatTargetW - dragFloatW) * stiffness) * damping;
        let nextVH = (dragFloatVH + (dragFloatTargetH - dragFloatH) * stiffness) * damping;

        // Avoid big "swing" on fast pointer moves.
        if (!dragDropping) {
          const maxSpeed = 28; // px per frame
          const s = Math.hypot(nextVX, nextVY);
          if (s > maxSpeed) {
            const k = maxSpeed / s;
            nextVX *= k;
            nextVY *= k;
          }
        }

        dragFloatVX = nextVX;
        dragFloatVY = nextVY;
        dragFloatVW = nextVW;
        dragFloatVH = nextVH;

        dragFloatX += dragFloatVX;
        dragFloatY += dragFloatVY;
        dragFloatW += dragFloatVW;
        dragFloatH += dragFloatVH;
      }

      // Paper flutter effect based on velocity
      const speed = Math.hypot(dragFloatVX, dragFloatVY);
      const targetEnergy = Math.min(1, speed / 22);
      // Smooth the flutter so it feels soft (no jitter)
      dragFlutterEnergy = dragFlutterEnergy * 0.92 + targetEnergy * 0.08;
      const flutterAmt = dragDropping ? dragFlutterEnergy * 0.35 : dragFlutterEnergy;
      const t = Date.now();
      const tilt = clamp(dragFloatVX * 0.25, -10, 10);
      const fold = clamp(-dragFloatVY * 0.14, -8, 8);
      const wobbleZ = Math.sin(t * 0.010) * (1.2 + 3.2 * flutterAmt);
      const flutterX = Math.sin(t * 0.014) * (0.9 + 3.8 * flutterAmt);
      const flutterY = Math.cos(t * 0.012) * (0.6 + 2.6 * flutterAmt);
      const scalePulse = 1 + (dragDropping ? 0 : Math.sin(t * 0.009) * 0.0035 * flutterAmt);

      // Update DOM directly for smooth 60fps
      if (dragFloatEl) {
        const x = Math.round(dragFloatX);
        const y = Math.round(dragFloatY);
        const w = Math.max(40, Math.round(dragFloatW));
        const h = Math.max(18, Math.round(dragFloatH));
        const ox = Math.max(0, Math.min(w, dragOffsetX));
        const oy = Math.max(0, Math.min(h, dragOffsetY));
        const scale = dragDropping ? 1.0 : 1.035;
        dragFloatEl.style.cssText = `
          position: fixed; left: 0; top: 0; z-index: 80; pointer-events: none;
          width: ${w}px; height: ${h}px;
          transform: translate3d(${x}px, ${y}px, 0) rotate(${tilt + wobbleZ}deg) rotateX(${fold + flutterX}deg) rotateY(${flutterY}deg) scale(${scale * scalePulse});
          transform-origin: ${ox}px ${oy}px;
          will-change: transform;
        `;
      }

      dragRaf = requestAnimationFrame(tick);
    };
    dragRaf = requestAnimationFrame(tick);
  }

  function stopDragLoop() {
    if (dragRaf != null) cancelAnimationFrame(dragRaf);
    dragRaf = null;
  }

  function snapToGrid(minutes: number): number {
    return Math.round(minutes / config.snapMinutes) * config.snapMinutes;
  }

  function clampMinutes(minutes: number, durationMin: number): number {
    const startMinOfDay = config.startHour * 60;
    const endMinOfDay = config.endHour * 60;
    const clamped = Math.max(startMinOfDay, Math.min(endMinOfDay - durationMin, minutes));
    return snapToGrid(clamped);
  }

  function startDrag(e: PointerEvent, event: EventDto, tileEl: HTMLElement) {
    if (dragSaving) return;
    const rect = tileEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    dragCurrentX = e.clientX;
    dragCurrentY = e.clientY;
    dragEvent = event;
    dragMoving = false;
    dragDropping = false;

    // Initialize floating overlay at the tile position/size
    dragTileW = rect.width;
    dragTileH = rect.height;
    dragFloatX = rect.left;
    dragFloatY = rect.top;
    dragFloatW = rect.width;
    dragFloatH = rect.height;
    dragFloatTargetX = rect.left;
    dragFloatTargetY = rect.top;
    dragFloatTargetW = rect.width;
    dragFloatTargetH = rect.height;
    dragFloatVX = 0;
    dragFloatVY = 0;
    dragFloatVW = 0;
    dragFloatVH = 0;

    // Capture grid and day column positions
    const gridEl = document.getElementById('weekplanner-timegrid-scroll');
    if (gridEl) {
      dragGridRect = gridEl.getBoundingClientRect();
      // Find day column elements
      const dayColumns = gridEl.querySelectorAll('[data-day-key]');
      dragDayRects = [];
      dayColumns.forEach((col) => {
        const dayKey = col.getAttribute('data-day-key');
        if (dayKey) {
          const colRect = col.getBoundingClientRect();
          const day = days.find(d => dateKey(d).toString() === dayKey);
          if (day) {
            dragDayRects.push({ day, left: colRect.left, right: colRect.right });
          }
        }
      });
    }

    tileEl.setPointerCapture(e.pointerId);
    startDragLoop();
    e.preventDefault();
  }

  function moveDrag(e: PointerEvent) {
    if (!dragEvent) return;
    dragCurrentX = e.clientX;
    dragCurrentY = e.clientY;

    // Always update the floating target position (pixel-accurate)
    dragFloatTargetX = e.clientX - dragOffsetX;
    dragFloatTargetY = e.clientY - dragOffsetY;
    dragFloatTargetW = dragTileW;
    dragFloatTargetH = dragTileH;

    // Start actual drag after threshold (5px) to distinguish from click
    if (!dragMoving) {
      const dx = dragCurrentX - dragStartClientX;
      const dy = dragCurrentY - dragStartClientY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        dragMoving = true;
      }
    }

    if (dragMoving && dragGridRect) {
      // Find target day
      dragTargetDay = null;
      for (const dr of dragDayRects) {
        if (dragCurrentX >= dr.left && dragCurrentX < dr.right) {
          dragTargetDay = dr.day;
          break;
        }
      }

      // Calculate target time
      const scrollEl = document.getElementById('weekplanner-timegrid-scroll');
      const scrollOffset = scrollEl?.scrollTop ?? 0;
      const gridTop = dragGridRect.top;
      const yInGrid = dragCurrentY - gridTop + scrollOffset - dragOffsetY;
      const rawMinutes = (yInGrid / config.pxPerMinute) + (config.startHour * 60);
      const eventDuration = dragEvent.endAt
        ? Math.round((new Date(dragEvent.endAt).getTime() - new Date(dragEvent.startAt).getTime()) / 60000)
        : config.defaultDurationMinutes;
      dragTargetMinutes = clampMinutes(rawMinutes, eventDuration);
    }
  }

  async function endDrag(e: PointerEvent) {
    if (!dragEvent) return;

    (e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);

    if (!dragMoving || !dragTargetDay || dragTargetMinutes == null) {
      // Was a click, not a drag
      dragEvent = null;
      dragMoving = false;
      dragDropping = false;
      dragTargetDay = null;
      dragTargetMinutes = null;
      stopDragLoop();
      return;
    }

    // Calculate new start/end times
    const eventDuration = dragEvent.endAt
      ? Math.round((new Date(dragEvent.endAt).getTime() - new Date(dragEvent.startAt).getTime()) / 60000)
      : config.defaultDurationMinutes;

    const targetHour = Math.floor(dragTargetMinutes / 60);
    const targetMin = dragTargetMinutes % 60;

    const newStart = new Date(dragTargetDay);
    newStart.setHours(targetHour, targetMin, 0, 0);

    const newEnd = new Date(newStart.getTime() + eventDuration * 60000);

    // Check if actually moved
    const oldStart = new Date(dragEvent.startAt);
    if (newStart.getTime() === oldStart.getTime()) {
      dragEvent = null;
      dragMoving = false;
      dragDropping = false;
      dragTargetDay = null;
      dragTargetMinutes = null;
      stopDragLoop();
      return;
    }

    // Animate the floating tile into the snapped grid target ("weight")
    dragDropping = true;
    if (dragGridRect) {
      const scrollEl = document.getElementById('weekplanner-timegrid-scroll') as HTMLDivElement | null;
      const scrollOffset = scrollEl?.scrollTop ?? 0;
      const topPx = (dragTargetMinutes - config.startHour * 60) * config.pxPerMinute;
      const dropY = dragGridRect.top - scrollOffset + topPx;

      const dayRect = dragDayRects.find((dr) => sameDay(dr.day, dragTargetDay!));
      if (dayRect) {
        const dropX = dayRect.left + 2;
        const dropW = Math.max(60, dayRect.right - dayRect.left - 4);
        const dropH = Math.max(18, eventDuration * config.pxPerMinute);
        dragFloatTargetX = dropX;
        dragFloatTargetY = dropY;
        dragFloatTargetW = dropW;
        dragFloatTargetH = dropH;
      } else {
        dragFloatTargetY = dropY;
        dragFloatTargetH = Math.max(18, eventDuration * config.pxPerMinute);
      }
    }

    // Save to API
    dragSaving = true;
    try {
      const settleMs = 240;
      await Promise.all([
        updateEvent(dragEvent.id, {
          startAt: newStart.toISOString(),
          endAt: newEnd.toISOString()
        }),
        new Promise((r) => setTimeout(r, settleMs))
      ]);
      onEventMoved();
    } catch (err) {
      console.error('Failed to move event:', err);
    } finally {
      dragSaving = false;
      dragEvent = null;
      dragMoving = false;
      dragDropping = false;
      dragTargetDay = null;
      dragTargetMinutes = null;
      stopDragLoop();
    }
  }

  function cancelDrag() {
    dragEvent = null;
    dragMoving = false;
    dragDropping = false;
    dragTargetDay = null;
    dragTargetMinutes = null;
    stopDragLoop();
  }

  // dragFloatStyle is now set directly in the RAF loop for smooth animation

  // Computed drag ghost position
  $: dragGhostStyle = (() => {
    if (!dragMoving || !dragEvent || !dragTargetDay || dragTargetMinutes == null) return '';
    const eventDuration = dragEvent.endAt
      ? Math.round((new Date(dragEvent.endAt).getTime() - new Date(dragEvent.startAt).getTime()) / 60000)
      : config.defaultDurationMinutes;
    const top = (dragTargetMinutes - config.startHour * 60) * config.pxPerMinute;
    const height = Math.max(18, eventDuration * config.pxPerMinute);
    return `top: ${top}px; height: ${height}px;`;
  })();

  $: dragGhostDayIndex = dragTargetDay ? days.findIndex(d => sameDay(d, dragTargetDay!)) : -1;

  function isContinuation(event: EventDto, day: Date): boolean {
    return !sameDay(new Date(event.startAt), day);
  }

  function segmentStyle(seg: PositionedSegment): string {
    const top = seg.startMin * config.pxPerMinute;
    const height = Math.max(18, (seg.endMin - seg.startMin) * config.pxPerMinute);
    const widthPct = 100 / seg.colCount;
    const leftPct = seg.colIndex * widthPct;
    return `top: ${top}px; height: ${height}px; left: ${leftPct}%; width: ${widthPct}%;`;
  }

  // Custom scrollbar (floated overlay)
  let scrollEl: HTMLDivElement | null = null;
  let trackEl: HTMLDivElement | null = null;
  let scrollTop = 0;
  let scrollHeight = 0;
  let viewportHeight = 0;
  let trackHeight = 0;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;
  let resizeObs: ResizeObserver | null = null;

  // Current time indicator
  let now = new Date();
  let nowTimer: ReturnType<typeof setInterval> | null = null;

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
  }

  function updateScrollMetrics() {
    if (!scrollEl) return;
    scrollTop = scrollEl.scrollTop;
    scrollHeight = scrollEl.scrollHeight;
    viewportHeight = scrollEl.clientHeight;
    if (trackEl) trackHeight = trackEl.getBoundingClientRect().height;
  }

  $: scrollbarVisible = scrollHeight > viewportHeight + 1;
  const MIN_THUMB_PX = 36;
  $: maxScroll = Math.max(0, scrollHeight - viewportHeight);
  $: thumbHeight = (() => {
    if (!scrollbarVisible) return 0;
    const th = trackHeight || viewportHeight;
    const h = Math.max(MIN_THUMB_PX, (th * th) / Math.max(1, scrollHeight));
    return clamp(h, MIN_THUMB_PX, th);
  })();
  $: thumbTop = (() => {
    if (!scrollbarVisible) return 0;
    const maxScrollSafe = Math.max(1, scrollHeight - viewportHeight);
    const th = trackHeight || viewportHeight;
    const maxThumbTravel = Math.max(0, th - thumbHeight);
    return (scrollTop / maxScrollSafe) * maxThumbTravel;
  })();

  function scrollToThumbTop(nextThumbTop: number) {
    if (!scrollEl || !scrollbarVisible) return;
    const th = trackHeight || viewportHeight;
    const maxThumbTravel = Math.max(1, th - thumbHeight);
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);
    const ratio = clamp(nextThumbTop / maxThumbTravel, 0, 1);
    scrollEl.scrollTop = ratio * maxScroll;
    updateScrollMetrics();
  }

  function onThumbPointerDown(e: PointerEvent) {
    if (!scrollEl) return;
    dragging = true;
    dragStartY = e.clientY;
    dragStartScrollTop = scrollEl.scrollTop;
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onThumbPointerMove(e: PointerEvent) {
    if (!scrollEl || !dragging || !scrollbarVisible) return;
    const dy = e.clientY - dragStartY;
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);
    const th = trackHeight || viewportHeight;
    const maxThumbTravel = Math.max(1, th - thumbHeight);
    const scrollDelta = (dy / maxThumbTravel) * maxScroll;
    scrollEl.scrollTop = clamp(dragStartScrollTop + scrollDelta, 0, maxScroll);
    updateScrollMetrics();
  }

  function onThumbPointerUp() {
    dragging = false;
  }

  function onTrackPointerDown(e: PointerEvent) {
    if (!trackEl || !scrollEl || !scrollbarVisible) return;
    // jump so the thumb centers at click position
    const r = trackEl.getBoundingClientRect();
    const y = e.clientY - r.top;
    scrollToThumbTop(y - thumbHeight / 2);
  }

  function onScrollbarKeyDown(e: KeyboardEvent) {
    if (!scrollEl || !scrollbarVisible) return;
    const hourPx = 60 * config.pxPerMinute;
    const halfHourPx = 30 * config.pxPerMinute;
    const pagePx = Math.max(hourPx, viewportHeight * 0.8);
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);

    let next = scrollEl.scrollTop;
    if (e.key === 'ArrowDown') next += halfHourPx;
    else if (e.key === 'ArrowUp') next -= halfHourPx;
    else if (e.key === 'PageDown') next += pagePx;
    else if (e.key === 'PageUp') next -= pagePx;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = maxScroll;
    else return;

    e.preventDefault();
    scrollEl.scrollTop = clamp(next, 0, maxScroll);
    updateScrollMetrics();
  }

  onMount(() => {
    updateScrollMetrics();
    if (scrollEl) {
      const onScroll = () => updateScrollMetrics();
      scrollEl.addEventListener('scroll', onScroll, { passive: true });
      resizeObs = new ResizeObserver(() => updateScrollMetrics());
      resizeObs.observe(scrollEl);
      if (trackEl) resizeObs.observe(trackEl);
      onDestroy(() => {
        scrollEl?.removeEventListener('scroll', onScroll);
        resizeObs?.disconnect();
        resizeObs = null;
      });
    }

    // tick "now" periodically for the current-time line
    nowTimer = setInterval(() => {
      now = new Date();
    }, 30_000);
  });

  onDestroy(() => {
    stopDragLoop();
    if (nowTimer) clearInterval(nowTimer);
    nowTimer = null;
  });
</script>

<div class="h-full flex flex-col rounded-2xl border border-white/10 bg-black/20 overflow-hidden relative">
  <!-- Background image -->
  {#if backgroundUrl}
    <div
      class="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none"
      style={`background-image: url('${backgroundUrl}');`}
    ></div>
  {/if}

  <!-- All-day lane: headers + all-day events -->
  <div class="border-b border-white/10 relative z-10">
    <div class="grid" style="grid-template-columns: 56px repeat(7, minmax(0, 1fr));">
      <div class="px-2 py-2"></div>
      {#each days as day (dateKey(day))}
        {@const k = dateKey(day)}
        {@const isToday = sameDay(day, new Date())}
        {@const holidayName = (holidaysByDay.get(k) ?? [])[0]?.title ?? ''}
        <div class={`px-2 py-2 border-l border-white/10 ${isToday ? 'bg-white/5' : ''}`}>
          <div class="flex items-baseline justify-between">
            <span class="text-xs font-semibold tracking-wide">{formatGermanDayLabel(day)}</span>
            <span class={`text-sm font-bold ${isToday ? 'text-white' : 'text-white/80'}`}>{day.getDate()}.</span>
          </div>
          {#if holidayName}
            <div class="text-[11px] text-amber-300/80 truncate mt-0.5" title={holidayName}>{holidayName}</div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="grid" style="grid-template-columns: 56px repeat(7, minmax(0, 1fr));">
      <div class="px-2 py-2 text-[11px] text-white/45">Ganzt.</div>
      {#each days as day (dateKey(day))}
        {@const k = dateKey(day)}
        {@const allDayEvents = allDayByDay.get(k) ?? []}
        {@const daySuggestions = suggestionsByDay.get(k) ?? []}
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div
          class="px-2 py-2 border-l border-white/10 min-h-[64px] text-left hover:bg-white/5 transition cursor-pointer"
          on:click|self={() => onAddAllDayEvent(day)}
        >
          <div class="space-y-1 max-h-[88px] overflow-y-auto pr-1">
            {#each allDayEvents as e (e.occurrenceId ?? `${e.id}:${e.startAt}`)}
              {@const color = eventBaseColor(e)}
              {@const cont = isContinuation(e, day)}
              <div class="relative">
                <button
                  type="button"
                  class={`w-full text-left rounded-lg px-2 py-1.5 pr-9 border text-xs transition active:scale-[0.99] ${eventTileBgClass(color)} ${cont ? 'border-dashed opacity-90' : ''}`}
                  style={eventTileStyle(color)}
                  on:click|stopPropagation={() => onEditEvent(e)}
                >
                  <div class="truncate font-medium">{e.title}</div>
                </button>
                <button
                  type="button"
                  class="absolute top-1 right-1 h-6 w-6 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 transition grid place-items-center text-white/60 hover:text-rose-300"
                  aria-label="Termin löschen"
                  title="Löschen"
                  on:click|stopPropagation={() => requestDelete(e)}
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            {/each}

            {#each daySuggestions as s (s.suggestionKey)}
              {@const color = suggestionBaseColor(s)}
              <div class="relative">
                <button
                  type="button"
                  class={`w-full text-left rounded-lg px-2 py-1.5 pr-16 border text-xs transition active:scale-[0.99] ${eventTileBgClass(color)} border-dashed opacity-90`}
                  style={eventTileStyle(color)}
                  on:click|stopPropagation={() => onAcceptSuggestion(s)}
                  title="Vorschlag übernehmen"
                >
                  <div class="truncate font-medium">{s.title}</div>
                  <div class="text-[11px] text-white/60 truncate mt-0.5">{fmtSuggestionTime(s)}</div>
                </button>

                <button
                  type="button"
                  class="absolute top-1 right-1 h-6 w-6 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 transition grid place-items-center text-white/60"
                  aria-label="Vorschlag ausblenden"
                  title="Ausblenden"
                  on:click|stopPropagation={() => onDismissSuggestion(s)}
                >
                  ✕
                </button>

                <button
                  type="button"
                  class="absolute top-1 right-8 h-6 px-2 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 transition text-[11px] font-semibold text-white/75"
                  aria-label="Vorschlag übernehmen"
                  title="Übernehmen"
                  on:click|stopPropagation={() => onAcceptSuggestion(s)}
                >
                  +
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Time grid (shared scroll) -->
  <div class="flex-1 min-h-0 relative z-10">
    <div id="weekplanner-timegrid-scroll" bind:this={scrollEl} class="wp-scroll h-full overflow-y-auto">
      <div class="grid" style="grid-template-columns: 56px repeat(7, minmax(0, 1fr));">
      <!-- Time labels -->
      <div class="relative" style={`height: ${gridHeightPx}px;`}>
        {#each hours as h (h)}
          {@const y = (h - config.startHour) * 60 * config.pxPerMinute}
          <div class="absolute left-0 right-0" style={`top: ${y}px;`}>
            <div class="-mt-2 px-2 text-[11px] text-white/45">{String(h).padStart(2, '0')}:00</div>
          </div>
        {/each}
      </div>

      <!-- Day columns -->
      {#each days as day, dayIndex (dateKey(day))}
        {@const k = dateKey(day)}
        {@const segs = timedByDay.get(k) ?? []}
        {@const isToday = sameDay(day, now)}
        {@const nowMin = minutesOfDay(now)}
        <div
          class="relative border-l border-white/10"
          style={`height: ${gridHeightPx}px;`}
          data-day-key={k}
          role="button"
          tabindex="0"
          on:click={() => onAddEvent(day)}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAddEvent(day);
            }
          }}
        >
          <!-- grid lines -->
          {#each hours as h (h)}
            {@const y = (h - config.startHour) * 60 * config.pxPerMinute}
            <div class="absolute left-0 right-0 border-t border-white/5" style={`top: ${y}px;`}></div>
          {/each}

          <!-- Current time line (today only) -->
          {#if isToday && nowMin >= config.startHour * 60 && nowMin <= config.endHour * 60}
            {@const nowTop = (nowMin - config.startHour * 60) * config.pxPerMinute}
            <div class="absolute left-0 right-0 z-20 pointer-events-none" style={`top: ${nowTop}px;`}
              aria-hidden="true"
            >
              <div class="absolute left-0 right-0 h-px bg-white/60"></div>
              <div class="absolute -top-2 left-1 flex items-center">
                <div class="text-[10px] text-white/75 bg-black/35 px-1.5 py-0.5 rounded-md border border-white/10">
                  {fmtTime(now.toISOString())}
                </div>
              </div>
            </div>
          {/if}

          <!-- Drag ghost preview intentionally hidden (floating tile only) -->

          {#each segs as seg (seg.event.occurrenceId ?? `${seg.event.id}:${seg.event.startAt}:${k}:${seg.startMin}`)}
            {@const e = seg.event}
            {@const color = eventBaseColor(e)}
            {@const ePersons = eventPersons(e)}
            {@const isCompact = seg.colCount > 1}
            {@const isDragging = dragEvent?.id === e.id && (dragMoving || dragDropping)}
            <div
              class={`absolute px-0.5 ${isDragging ? 'opacity-0 pointer-events-none' : ''}`}
              style={segmentStyle(seg)}
            >
              <div class="relative h-full">
                <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
                <div
                  class={`w-full h-full text-left rounded-xl px-2 py-1 border text-xs leading-tight overflow-hidden cursor-grab select-none touch-none ${eventTileBgClass(color)} ${seg.isContinuation ? 'border-dashed opacity-90' : ''} ${isCompact ? '' : 'pr-9'} ${dragSaving && dragEvent?.id === e.id ? 'animate-pulse' : ''}`}
                  style={eventTileStyle(color)}
                  role="button"
                  tabindex="0"
                  on:pointerdown={(ev) => startDrag(ev, e, ev.currentTarget as HTMLElement)}
                  on:pointermove={moveDrag}
                  on:pointerup={endDrag}
                  on:pointercancel={cancelDrag}
                  on:click|stopPropagation={() => {
                    if (!dragMoving) onEditEvent(e);
                  }}
                  on:keydown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onEditEvent(e);
                    }
                  }}
                >
                  {#if isCompact}
                    <!-- Compact mode: only title -->
                    <div class="font-semibold truncate min-w-0">{e.title}</div>
                    <div class="text-[10px] text-white/60 whitespace-nowrap mt-0.5">{fmtTimeRange(e.startAt, e.endAt)}</div>
                  {:else}
                    <!-- Full mode: title + time + location + persons -->
                    <div class="font-semibold truncate min-w-0">{e.title}</div>
                    <div class="text-[10px] text-white/60 whitespace-nowrap mt-0.5">{fmtTimeRange(e.startAt, e.endAt)}</div>
                    {#if e.location}
                      <div class="text-[10px] text-white/50 truncate">📍 {e.location}</div>
                    {/if}
                    {#if ePersons.length > 0}
                      <div class="text-[10px] text-white/50 truncate">{ePersons.map(p => p.name).join(', ')}</div>
                    {/if}
                  {/if}
                </div>

                {#if !isCompact && !isDragging}
                  <button
                    type="button"
                    class="absolute top-1 right-1 h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 transition grid place-items-center text-white/60 hover:text-rose-300"
                    aria-label="Termin löschen"
                    title="Löschen"
                    on:click|stopPropagation={() => requestDelete(e)}
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}
      </div>
    </div>

    <!-- Floating dragged tile (smooth, pixel-accurate "paper") -->
    {#if dragEvent && (dragMoving || dragDropping)}
      {@const floatColor = eventBaseColor(dragEvent)}
      <div bind:this={dragFloatEl} class="fixed left-0 top-0 z-[80] pointer-events-none">
        <div
          class={`relative h-full rounded-xl border text-xs leading-tight overflow-hidden select-none ${eventTileBgClass(floatColor)} shadow-xl shadow-black/40 ${dragSaving ? 'animate-pulse' : ''}`}
          style={`${eventTileStyle(floatColor)} backdrop-filter: blur(2px); perspective: 800px;`}
        >
          <!-- Paper texture overlay -->
          <div class="absolute inset-0 rounded-xl bg-gradient-to-br from-white/15 via-transparent to-black/15 opacity-80"></div>
          <!-- Subtle fold line -->
          <div class="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
          <div class="relative px-2 py-1 font-semibold truncate">{dragEvent.title}</div>
          <div class="relative px-2 text-[10px] text-white/65 whitespace-nowrap">{fmtTimeRange(dragEvent.startAt, dragEvent.endAt)}</div>
          {#if dragEvent.location}
            <div class="relative px-2 text-[10px] text-white/60 truncate">📍 {dragEvent.location}</div>
          {/if}
        </div>
      </div>
    {/if}

    {#if scrollbarVisible}
      <div
        class="absolute top-0 bottom-0 right-2 w-3 z-20"
        role="scrollbar"
        aria-controls="weekplanner-timegrid-scroll"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxScroll)}
        aria-valuenow={Math.round(scrollTop)}
        tabindex="0"
        on:keydown={onScrollbarKeyDown}
      >
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div
          bind:this={trackEl}
          class="absolute inset-y-2 left-0 right-0 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition"
          on:pointerdown={onTrackPointerDown}
        >
          <div
            class={`absolute left-0 right-0 rounded-full bg-white/25 border border-white/20 ${dragging ? 'bg-white/35' : ''}`}
            style={`top: ${thumbTop}px; height: ${thumbHeight}px;`}
            on:pointerdown={onThumbPointerDown}
            on:pointermove={onThumbPointerMove}
            on:pointerup={onThumbPointerUp}
            on:pointercancel={onThumbPointerUp}
          ></div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.wp-scroll) {
    scrollbar-width: none; /* Firefox */
  }
  :global(.wp-scroll::-webkit-scrollbar) {
    width: 0;
    height: 0;
  }
</style>

<!-- Delete Confirmation Modal -->
{#if deleteConfirmEvent}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    transition:fade={{ duration: 150 }}
    on:click|self={cancelDelete}
    on:keydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelDelete();
      }
    }}
    role="dialog"
    aria-modal="true"
    tabindex="0"
  >
    <div
      class="mx-4 max-w-sm w-full bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
      in:scale={{ start: 0.9, duration: 200 }}
      out:scale={{ start: 0.9, duration: 150 }}
    >
      <div class="p-5 text-center">
        <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/20 flex items-center justify-center">
          <svg class="w-7 h-7 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>
        <h3 class="text-lg font-semibold mb-1">Termin löschen?</h3>
        <p class="text-sm text-white/60 mb-1 truncate px-2">„{deleteConfirmEvent.title}"</p>
        <p class="text-xs text-white/40">Diese Aktion kann nicht rückgängig gemacht werden.</p>
      </div>
      <div class="flex border-t border-white/10">
        <button
          type="button"
          class="flex-1 py-3 text-center font-medium text-white/70 hover:bg-white/5 active:bg-white/10 transition"
          on:click={cancelDelete}
          disabled={deleting}
        >
          Abbrechen
        </button>
        <button
          type="button"
          class="flex-1 py-3 text-center font-semibold text-rose-300 hover:bg-rose-500/10 active:bg-rose-500/20 transition"
          on:click={confirmDelete}
          disabled={deleting}
        >
          {deleting ? 'Löschen…' : 'Löschen'}
        </button>
      </div>
    </div>
  </div>
{/if}
