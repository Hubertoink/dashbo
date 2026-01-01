import { writable } from 'svelte/store';

export type SpotifyPlaybackStatus = {
  enabled: boolean;
  active: boolean;
  isPlaying: boolean;

  title: string | null;
  artist: string | null;
  album: string | null;
  imageUrl: string | null;
  source: string | null;
  deviceName: string | null;
  deviceType: string | null;

  updatedAt: number | null;
  error: string | null;
};

const initial: SpotifyPlaybackStatus = {
  enabled: false,
  active: false,
  isPlaying: false,
  title: null,
  artist: null,
  album: null,
  imageUrl: null,
  source: null,
  deviceName: null,
  deviceType: null,
  updatedAt: null,
  error: null,
};

const _status = writable<SpotifyPlaybackStatus>(initial);

export const spotifyPlaybackStatus = {
  subscribe: _status.subscribe,
};

export function resetSpotifyPlaybackStatus(next?: Partial<SpotifyPlaybackStatus>) {
  _status.set({ ...initial, ...(next ?? {}) });
}

export function setSpotifyPlaybackStatus(patch: Partial<SpotifyPlaybackStatus>) {
  _status.update((prev) => ({ ...prev, ...patch }));
}
