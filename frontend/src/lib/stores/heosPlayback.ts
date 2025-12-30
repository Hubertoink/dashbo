import { writable } from 'svelte/store';

export type HeosPlaybackState = 'play' | 'pause' | 'stop' | 'unknown';

export type HeosPlaybackStatus = {
  enabled: boolean;
  pid: number | null;

  state: HeosPlaybackState;
  isPlaying: boolean;
  isActive: boolean;

  title: string | null;
  artist: string | null;
  album: string | null;
  imageUrl: string | null;
  source: string | null;
  url: string | null;

  isDashbo: boolean;
  isExternal: boolean;

  updatedAt: number | null;
  error: string | null;
};

const initial: HeosPlaybackStatus = {
  enabled: false,
  pid: null,
  state: 'unknown',
  isPlaying: false,
  isActive: false,
  title: null,
  artist: null,
  album: null,
  imageUrl: null,
  source: null,
  url: null,
  isDashbo: false,
  isExternal: false,
  updatedAt: null,
  error: null
};

const _status = writable<HeosPlaybackStatus>(initial);

export const heosPlaybackStatus = {
  subscribe: _status.subscribe
};

export function resetHeosPlaybackStatus(next?: Partial<HeosPlaybackStatus>) {
  _status.set({ ...initial, ...(next ?? {}) });
}

export function setHeosPlaybackStatus(patch: Partial<HeosPlaybackStatus>) {
  _status.update((prev) => ({ ...prev, ...patch }));
}
