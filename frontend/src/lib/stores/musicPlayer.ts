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
  positionSec: number;
  durationSec: number;
};

type PlayCommand = {
  type: 'play';
  queue: NowPlayingTrack[];
  index: number;
};

type ControlCommand =
  | { type: 'toggle' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'next' }
  | { type: 'prev' };

type PlayerCommand = PlayCommand | ControlCommand;

const _state = writable<PlayerState>({ now: null, playing: false, positionSec: 0, durationSec: 0 });
const _command = writable<PlayerCommand | null>(null);

export const musicPlayerState = {
  subscribe: _state.subscribe
};

export const musicPlayerCommand = {
  subscribe: _command.subscribe,
  clear: () => _command.set(null)
};

export function setNowPlaying(now: NowPlayingTrack | null, playing: boolean) {
  _state.update((prev) => ({
    ...prev,
    now,
    playing,
    positionSec: now ? prev.positionSec : 0,
    durationSec: now ? prev.durationSec : 0
  }));
}

export function setProgress(positionSec: number, durationSec: number) {
  const p = Number.isFinite(positionSec) ? Math.max(0, positionSec) : 0;
  const d = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0;
  _state.update((prev) => ({ ...prev, positionSec: p, durationSec: d }));
}

export function playTrack(track: NowPlayingTrack) {
  _command.set({ type: 'play', queue: [track], index: 0 });
}

export function playAlbum(tracks: NowPlayingTrack[], startIndex = 0) {
  const idx = Math.max(0, Math.min(tracks.length - 1, startIndex));
  _command.set({ type: 'play', queue: tracks, index: idx });
}

export function togglePlayPause() {
  _command.set({ type: 'toggle' });
}

export function playNext() {
  _command.set({ type: 'next' });
}

export function playPrev() {
  _command.set({ type: 'prev' });
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
