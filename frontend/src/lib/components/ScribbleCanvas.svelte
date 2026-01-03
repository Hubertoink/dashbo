<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  export let width = 400;
  export let height = 300;
  export let strokeColor = '#000000';
  export let strokeWidth = 5;
  export let backgroundColor = 'transparent';

  const dispatch = createEventDispatcher<{
    save: { imageData: string };
    change: void;
  }>();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  // Undo history
  let history: ImageData[] = [];
  const MAX_HISTORY = 20;

  onMount(() => {
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx && backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    saveToHistory();
  });

  function getCoords(e: PointerEvent | TouchEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return { x: 0, y: 0 };
    }

    // Scale coordinates if canvas is resized via CSS
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType === 'touch') return; // Handle via touch events
    e.preventDefault();
    startDrawing(e);
    canvas.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    if (!isDrawing) return;
    e.preventDefault();
    draw(e);
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    stopDrawing();
    canvas.releasePointerCapture(e.pointerId);
  }

  function handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length !== 1) return;
    startDrawing(e);
  }

  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (!isDrawing || e.touches.length !== 1) return;
    draw(e);
  }

  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    stopDrawing();
  }

  function startDrawing(e: PointerEvent | TouchEvent) {
    isDrawing = true;
    const coords = getCoords(e);
    lastX = coords.x;
    lastY = coords.y;
  }

  function draw(e: PointerEvent | TouchEvent) {
    if (!ctx || !isDrawing) return;

    const coords = getCoords(e);
    const x = coords.x;
    const y = coords.y;

    // Get pressure for stylus (0-1)
    let pressure = 0.5;
    if ('pressure' in e && typeof e.pressure === 'number' && e.pressure > 0) {
      pressure = e.pressure;
    }
    const dynamicWidth = strokeWidth * (0.5 + pressure * 0.8);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = dynamicWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastX = x;
    lastY = y;
    dispatch('change');
  }

  function stopDrawing() {
    if (isDrawing) {
      isDrawing = false;
      saveToHistory();
    }
  }

  function saveToHistory() {
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, width, height);
    history = [...history.slice(-(MAX_HISTORY - 1)), imageData];
  }

  export function undo() {
    if (!ctx || history.length <= 1) return;
    history = history.slice(0, -1);
    const prev = history[history.length - 1];
    if (prev) {
      ctx.putImageData(prev, 0, 0);
      dispatch('change');
    }
  }

  export function clear() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    saveToHistory();
    dispatch('change');
  }

  export function getImageData(): string {
    return canvas.toDataURL('image/png');
  }

  export function isEmpty(): boolean {
    if (!ctx) return true;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    // Check if all pixels are transparent or background color
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false; // Has visible pixels
    }
    return true;
  }

  export function save() {
    dispatch('save', { imageData: getImageData() });
  }
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="touch-none cursor-crosshair rounded-xl border border-white/20"
  style="background: {backgroundColor === 'transparent' ? 'rgba(255,255,255,0.05)' : backgroundColor};"
  on:pointerdown={handlePointerDown}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
  on:pointerleave={handlePointerUp}
  on:touchstart={handleTouchStart}
  on:touchmove={handleTouchMove}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchEnd}
/>

<style>
  canvas {
    touch-action: none;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
</style>
