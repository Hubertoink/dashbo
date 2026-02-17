/**
 * PWA install prompt helper.
 *
 * Captures the browser's `beforeinstallprompt` event so we can trigger
 * the native install dialog from a button inside settings.
 *
 * Usage:
 *   import { pwaCanInstall, pwaIsInstalled, pwaPromptInstall } from '$lib/pwaInstall';
 *
 * The stores are reactive Svelte 5 $state-based, but we also expose
 * plain getters so they work from +page.svelte scripts.
 */

let deferredPrompt: any = null;

/** Whether the browser offered install and we captured the prompt */
let _canInstall = false;
/** Whether the app is already running as installed PWA */
let _isInstalled = false;

const listeners: Array<() => void> = [];
function notify() {
  for (const fn of listeners) fn();
}
export function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function getCanInstall() {
  return _canInstall;
}
export function getIsInstalled() {
  return _isInstalled;
}

/**
 * Trigger the native install prompt.
 * Returns true if the user accepted, false otherwise.
 */
export async function pwaPromptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  _canInstall = false;
  if (outcome === 'accepted') {
    _isInstalled = true;
  }
  notify();
  return outcome === 'accepted';
}

/**
 * Must be called once from onMount in the root layout or settings page
 * to attach the browser event listeners.
 */
export function initPwaInstallListeners() {
  if (typeof window === 'undefined') return;

  // Check if already installed (display-mode: standalone or fullscreen)
  const mq = window.matchMedia('(display-mode: standalone)');
  _isInstalled = mq.matches || (navigator as any).standalone === true;

  mq.addEventListener('change', (e) => {
    _isInstalled = e.matches;
    notify();
  });

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e;
    _canInstall = true;
    _isInstalled = false;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    _canInstall = false;
    _isInstalled = true;
    notify();
  });

  notify();
}
