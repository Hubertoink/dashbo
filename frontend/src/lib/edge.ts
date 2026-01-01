export type EdgeHealthDto = {
  ok: boolean;
  service?: string;
  time?: string;
  apiVersion?: number;
  version?: string | null;
  buildSha?: string | null;
};

export const MIN_EDGE_API_VERSION = 1;

export const EDGE_BASE_URL_KEY = 'dashbo_edge_base_url';
export const EDGE_TOKEN_KEY = 'dashbo_edge_token';
export const EDGE_PLAYER_WIDGET_ENABLED_KEY = 'dashbo_edge_player_widget_enabled';
export const EDGE_HEOS_ENABLED_KEY = 'dashbo_edge_heos_enabled';
export const EDGE_HEOS_SELECTED_PLAYER_ID_KEY = 'dashbo_edge_heos_selected_player_id';
export const EDGE_HEOS_HOSTS_KEY = 'dashbo_edge_heos_hosts';
export const EDGE_HEOS_SELECTED_PLAYER_NAME_KEY = 'dashbo_edge_heos_selected_player_name';

export function normalizeEdgeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, '');
}

export function getEdgeBaseUrlFromStorage(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(EDGE_BASE_URL_KEY) ?? '';
}

export function getEdgeTokenFromStorage(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(EDGE_TOKEN_KEY) ?? '';
}

export function getEdgePlayerWidgetEnabledFromStorage(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(EDGE_PLAYER_WIDGET_ENABLED_KEY) === '1';
}

export function getEdgeHeosEnabledFromStorage(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(EDGE_HEOS_ENABLED_KEY) === '1';
}

export function getEdgeHeosSelectedPlayerIdFromStorage(): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(EDGE_HEOS_SELECTED_PLAYER_ID_KEY);
  if (!raw) return null;
  const pid = Number(raw);
  return Number.isFinite(pid) && pid !== 0 ? pid : null;
}

export function getEdgeHeosHostsFromStorage(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(EDGE_HEOS_HOSTS_KEY) ?? '';
}

export function getEdgeHeosSelectedPlayerNameFromStorage(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(EDGE_HEOS_SELECTED_PLAYER_NAME_KEY) ?? '';
}

export async function edgeFetchJson<T>(
  baseUrl: string,
  path: string,
  token?: string,
  init?: RequestInit
): Promise<T> {
  const base = normalizeEdgeBaseUrl(baseUrl);
  if (!base) throw new Error('Edge Base URL fehlt');

  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init?.headers ?? undefined);

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function edgeHealth(baseUrl: string, token?: string): Promise<EdgeHealthDto> {
  return edgeFetchJson<EdgeHealthDto>(baseUrl, '/health', token);
}
