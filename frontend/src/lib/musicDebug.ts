import { get, writable } from 'svelte/store';

export type MusicDebugLevel = 'info' | 'warn' | 'error';

export type MusicDebugEntry = {
  id: string;
  at: number;
  level: MusicDebugLevel;
  event: string;
  details?: Record<string, unknown>;
};

export const MUSIC_DEBUG_ENABLED_KEY = 'dashbo_music_debug_enabled';
const MUSIC_DEBUG_ENTRIES_KEY = 'dashbo_music_debug_entries';
const MAX_DEBUG_ENTRIES = 200;

export const musicDebugEnabled = writable(false);
export const musicDebugEntries = writable<MusicDebugEntry[]>([]);

let initialized = false;

function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage quota/private mode errors
  }
}

function removeStorage(key: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readStoredEntries(): MusicDebugEntry[] {
  const raw = readStorage(MUSIC_DEBUG_ENTRIES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeEntry(item))
      .filter((item): item is MusicDebugEntry => Boolean(item))
      .slice(-MAX_DEBUG_ENTRIES);
  } catch {
    return [];
  }
}

function normalizeEntry(item: unknown): MusicDebugEntry | null {
  const entry = item as Partial<MusicDebugEntry> | null;
  if (!entry || typeof entry !== 'object') return null;
  const at = Number(entry.at || 0);
  const event = String(entry.event || '').trim();
  if (!Number.isFinite(at) || !event) return null;
  const level = entry.level === 'warn' || entry.level === 'error' ? entry.level : 'info';
  const details = entry.details && typeof entry.details === 'object' ? (entry.details as Record<string, unknown>) : undefined;
  return {
    id: String(entry.id || `${at}-${event}`),
    at,
    level,
    event,
    ...(details ? { details } : {})
  };
}

function persistEntries(entries: MusicDebugEntry[]) {
  writeStorage(MUSIC_DEBUG_ENTRIES_KEY, JSON.stringify(entries.slice(-MAX_DEBUG_ENTRIES)));
}

function sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const seen = new WeakSet<object>();
  const sanitized = sanitizeValue(details, seen, 0);
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? (sanitized as Record<string, unknown>) : undefined;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value == null) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  if (depth >= 4) return '[truncated]';

  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, seen, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (/token|authorization|password|secret/i.test(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = sanitizeValue(item, seen, depth + 1);
    }
  }
  return out;
}

export function initMusicDebug() {
  if (initialized) return;
  initialized = true;
  musicDebugEnabled.set(readStorage(MUSIC_DEBUG_ENABLED_KEY) === '1');
  musicDebugEntries.set(readStoredEntries());
}

export function setMusicDebugEnabled(enabled: boolean) {
  initMusicDebug();
  musicDebugEnabled.set(Boolean(enabled));
  writeStorage(MUSIC_DEBUG_ENABLED_KEY, enabled ? '1' : '0');
  addMusicDebugEntry(enabled ? 'debug.enabled' : 'debug.disabled', undefined, 'info', { force: true });
}

export function clearMusicDebugEntries() {
  initMusicDebug();
  musicDebugEntries.set([]);
  removeStorage(MUSIC_DEBUG_ENTRIES_KEY);
}

export function addMusicDebugEntry(
  event: string,
  details?: Record<string, unknown>,
  level: MusicDebugLevel = 'info',
  opts?: { force?: boolean }
) {
  initMusicDebug();
  if (!opts?.force && !get(musicDebugEnabled)) return;

  const sanitizedDetails = sanitizeDetails(details);
  const entry: MusicDebugEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    level,
    event,
    ...(sanitizedDetails ? { details: sanitizedDetails } : {})
  };

  musicDebugEntries.update((entries) => {
    const next = [...entries, entry].slice(-MAX_DEBUG_ENTRIES);
    persistEntries(next);
    return next;
  });
}

export function exportMusicDebugEntries(): string {
  initMusicDebug();
  return JSON.stringify(get(musicDebugEntries), null, 2);
}