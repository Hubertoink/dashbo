import { writable } from 'svelte/store';

export type ToastVariant = 'success' | 'info' | 'error';

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

const toasts = writable<ToastItem[]>([]);

function genId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function pushToast(message: string, variant: ToastVariant = 'info', timeoutMs = 2200) {
  const id = genId();
  const item: ToastItem = { id, message, variant };
  toasts.update((arr) => [...arr, item]);

  if (timeoutMs > 0) {
    setTimeout(() => {
      toasts.update((arr) => arr.filter((t) => t.id !== id));
    }, timeoutMs);
  }

  return id;
}

export function dismissToast(id: string) {
  toasts.update((arr) => arr.filter((t) => t.id !== id));
}

export { toasts };
