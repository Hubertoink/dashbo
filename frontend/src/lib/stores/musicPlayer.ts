import { writable } from 'svelte/store';
import { getEdgeBaseUrlFromStorage, getEdgeTokenFromStorage, normalizeEdgeBaseUrl } from '$lib/edge';

export type NowPlayingTrack = {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  coverUrl?: string | null;
};

type PlayerState = {
  now: NowPlayingTrack | null;
  playing: boolean;
};

type PlayCommand = {
  type: 'play';
  queue: NowPlayingTrack[];
  index: number;
};

const _state = writable<PlayerState>({ now: null, playing: false });
const _command = writable<PlayCommand | null>(null);

export const musicPlayerState = {
  subscribe: _state.subscribe
};

export const musicPlayerCommand = {
  subscribe: _command.subscribe,
  clear: () => _command.set(null)
};

export function setNowPlaying(now: NowPlayingTrack | null, playing: boolean) {
  _state.set({ now, playing });
}

export function playTrack(track: NowPlayingTrack) {
  _command.set({ type: 'play', queue: [track], index: 0 });
}

export function playAlbum(tracks: NowPlayingTrack[], startIndex = 0) {
  const idx = Math.max(0, Math.min(tracks.length - 1, startIndex));
  _command.set({ type: 'play', queue: tracks, index: idx });
}

export function buildEdgeStreamUrl(trackId: string): string {
  const base = normalizeEdgeBaseUrl(getEdgeBaseUrlFromStorage());
  const token = getEdgeTokenFromStorage();
  if (!base) throw new Error('Edge Base URL fehlt');
  if (!trackId) throw new Error('Track fehlt');

  // <audio> cannot send Authorization header reliably; use query token.
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${base}/api/music/tracks/${encodeURIComponent(trackId)}/stream${q}`;
}
