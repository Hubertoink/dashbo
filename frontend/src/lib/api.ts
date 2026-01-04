import type { ClockStyle } from './clockStyle';

export type EventDto = {
  id: number;
  occurrenceId: string;
  source?: 'dashbo' | 'outlook';
  externalId?: string | null;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  tag: TagDto | null;
  person: PersonDto | null;
  persons?: PersonDto[];
  recurrence: { freq: 'weekly' | 'monthly'; interval: number; until: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export type OutlookStatusDto = {
  connected: boolean;
  expiresAt: string | null;
  scope: string | null;
};

export type OutlookConnectionDto = {
  id: number;
  email: string | null;
  displayName: string | null;
  color: TagColorKey;
  expiresAt: string | null;
  scope: string | null;
};

export type TodoItemDto = {
  connectionId: number;
  connectionLabel: string;
  color: TagColorKey;
  listId: string;
  taskId: string;
  title: string;
  status: string;
  completed: boolean;
  startAt?: string | null;
  dueAt: string | null;
  bodyPreview: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

export type TodosResponseDto = {
  listName: string;
  listNames?: string[];
  items: TodoItemDto[];
};

export type NewsFeedId = 'zeit' | 'guardian' | 'newyorker' | 'sz';

export type NewsItemDto = {
  source?: NewsFeedId;
  title: string;
  url: string;
  publishedAt: string | null;
  teaser?: string | null;
  imageUrl?: string | null;
};

export type NewsResponseDto = {
  enabled: boolean;
  source: 'zeit' | 'guardian' | 'newyorker' | 'sz' | 'mixed';
  items: NewsItemDto[];
  error?: string;
};

export type SpotifyNowPlayingDto = {
  enabled: boolean;
  active: boolean;
  isPlaying?: boolean;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  imageUrl?: string | null;
  source?: string | null;
  deviceName?: string | null;
  deviceType?: string | null;
  progressMs?: number | null;
  error?: string;
};

export type TagColorKey = 'fuchsia' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'sky' | 'lime';

// Either one of the predefined palette keys or a custom hex color (#RRGGBB)
export type PersonColorKey = TagColorKey | string;

export type TagDto = {
  id: number;
  name: string;
  // Either one of the predefined palette keys or a custom hex color (#RRGGBB)
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PersonDto = {
  id: number;
  name: string;
  // Either one of the predefined palette keys or a custom hex color (#RRGGBB)
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const API_BASE = '/api';

function getToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('dashbo_token');
}

export function getStoredToken(): string | null {
  return getToken();
}

export function setToken(token: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (!token) localStorage.removeItem('dashbo_token');
  else localStorage.setItem('dashbo_token', token);
}

export function decodeJwtPayload<T = any>(token: string): T | null {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    },
    ...init
  });

  if (!resp.ok) {
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await resp.json().catch(() => null)) as any;
      const msg = typeof data?.message === 'string' ? data.message : JSON.stringify(data);
      throw new Error(`API ${resp.status}: ${msg}`);
    }
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }

  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

async function apiForm<T>(path: string, form: FormData, init?: RequestInit): Promise<T> {
  const token = getToken();
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    },
    method: 'POST',
    body: form,
    ...init
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }

  return (await resp.json()) as T;
}

export async function fetchEvents(from: Date, to: Date): Promise<EventDto[]> {
  const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return api<EventDto[]>(`/events?${qs.toString()}`);
}

export async function fetchOutlookStatus(): Promise<OutlookStatusDto> {
  return api<OutlookStatusDto>('/outlook/status');
}

export async function getOutlookAuthUrl(): Promise<{ url: string }> {
  return api<{ url: string }>('/outlook/auth-url', { method: 'POST' });
}

export async function disconnectOutlook(): Promise<{ ok: true }> {
  return api<{ ok: true }>('/outlook/disconnect', { method: 'POST' });
}

export async function listOutlookConnections(): Promise<OutlookConnectionDto[]> {
  return api<OutlookConnectionDto[]>('/outlook/connections');
}

export async function setOutlookConnectionColor(id: number, color: TagColorKey): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/outlook/connections/${id}/color`, { method: 'POST', body: JSON.stringify({ color }) });
}

export async function disconnectOutlookConnection(id: number): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/outlook/connections/${id}/disconnect`, { method: 'POST' });
}

export async function fetchTodos(): Promise<TodosResponseDto> {
  return api<TodosResponseDto>('/todos');
}

export async function fetchSpotifyNowPlaying(): Promise<SpotifyNowPlayingDto> {
  return api<SpotifyNowPlayingDto>('/spotify/now-playing');
}

export async function updateTodo(input: {
  connectionId: number;
  listId: string;
  taskId: string;
  title?: string;
  completed?: boolean;
  description?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
}): Promise<{ ok: true }> {
  return api<{ ok: true }>('/todos/update', { method: 'POST', body: JSON.stringify(input) });
}

export async function createTodo(input: {
  connectionId?: number;
  listName?: string;
  title: string;
  description?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
}): Promise<{ ok: true }> {
  return api<{ ok: true }>('/todos/create', { method: 'POST', body: JSON.stringify(input) });
}

export async function createEvent(input: {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  tagId?: number | null;
  personId?: number | null;
  personIds?: number[] | null;
  recurrence?: 'weekly' | 'monthly' | null;
}): Promise<EventDto> {
  return api<EventDto>('/events', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateEvent(
  id: number,
  patch: {
    title?: string;
    description?: string | null;
    location?: string | null;
    startAt?: string;
    endAt?: string | null;
    allDay?: boolean;
    tagId?: number | null;
    personId?: number | null;
    personIds?: number[] | null;
    recurrence?: 'weekly' | 'monthly' | null;
  }
): Promise<EventDto> {
  return api<EventDto>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
}

export async function deleteEvent(id: number): Promise<void> {
  await api<void>(`/events/${id}`, { method: 'DELETE' });
}

export async function listTags(): Promise<TagDto[]> {
  return api<TagDto[]>('/tags');
}

export async function createTag(input: { name: string; color: string; sortOrder?: number }): Promise<TagDto> {
  return api<TagDto>('/tags', { method: 'POST', body: JSON.stringify(input) });
}

export async function deleteTag(id: number): Promise<void> {
  await api<void>(`/tags/${id}`, { method: 'DELETE' });
}

export async function listPersons(): Promise<PersonDto[]> {
  return api<PersonDto[]>('/persons');
}

export async function createPerson(input: { name: string; color: string; sortOrder?: number }): Promise<PersonDto> {
  return api<PersonDto>('/persons', { method: 'POST', body: JSON.stringify(input) });
}

export async function deletePerson(id: number): Promise<void> {
  await api<void>(`/persons/${id}`, { method: 'DELETE' });
}

export type WeatherDto =
  | { ok: true; temp: number | null; description: string | null; icon: string | null; city: string | null; fetchedAt: string }
  | { ok: false; error: string; fetchedAt: string; status?: number };

export async function fetchWeather(): Promise<WeatherDto> {
  return api<WeatherDto>('/weather');
}

export type ForecastDayDto = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  code: number | null;
  description: string | null;
};

export type ForecastDto =
  | { ok: true; city: string | null; days: ForecastDayDto[]; fetchedAt: string }
  | { ok: false; error: string; fetchedAt: string; status?: number };

export async function fetchForecast(): Promise<ForecastDto> {
  return api<ForecastDto>('/weather/forecast');
}

export type LoginResponse = {
  token: string;
  user: { id: number; email: string; name: string; isAdmin: boolean; createdAt: string; updatedAt: string };
};

export async function login(email: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function register(email: string, name: string, password: string): Promise<LoginResponse> {
  return api<LoginResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) });
}

export type MeDto = {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  role: 'admin' | 'member' | string;
  calendarId: number | null;
  emailVerified?: boolean;
};

export async function fetchMe(): Promise<MeDto> {
  return api<MeDto>('/auth/me');
}

export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  return api<{ ok: true }>('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function resetPasswordWithToken(token: string, password: string): Promise<{ ok: true }> {
  return api<{ ok: true }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
}

export async function verifyEmailWithToken(token: string): Promise<{ ok: true }> {
  return api<{ ok: true }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function requestEmailVerification(): Promise<{ ok: true }> {
  return api<{ ok: true }>('/auth/request-email-verification', { method: 'POST' });
}

export type UserDto = {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  role?: string;
  calendarId?: number | null;
  invited?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export async function listUsers(): Promise<UserDto[]> {
  return api<UserDto[]>('/users');
}

export type UserRosterDto = {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  role: string;
};

export async function listUserRoster(): Promise<UserRosterDto[]> {
  return api<UserRosterDto[]>('/users/roster');
}

export async function createUser(input: { email: string; name: string; password: string; isAdmin?: boolean }): Promise<UserDto> {
  return api<UserDto>('/users', { method: 'POST', body: JSON.stringify(input) });
}

export async function inviteUser(input: {
  email: string;
  name: string;
  isAdmin?: boolean;
}): Promise<{ ok: true; user: UserDto; mailSent: boolean; link: string }> {
  return api<{ ok: true; user: UserDto; mailSent: boolean; link: string }>('/users/invite', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export async function createInviteLinkForUser(id: number): Promise<{ ok: true; link: string }> {
  return api<{ ok: true; link: string }>(`/users/${id}/invite-link`, { method: 'POST' });
}

export async function createCalendarInviteLink(): Promise<{ ok: true; link: string }> {
  return api<{ ok: true; link: string }>(`/users/calendar-invite-link`, { method: 'POST' });
}

export async function acceptCalendarInvite(
  token: string,
  input: { email: string; name: string; password: string }
): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/auth/accept-calendar-invite`, { method: 'POST', body: JSON.stringify({ token, ...input }) });
}

export async function acceptInvite(token: string, input: { name: string; password: string }): Promise<{ ok: true }> {
  return api<{ ok: true }>('/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, ...input }) });
}

export async function deleteUser(id: number): Promise<void> {
  await api<void>(`/users/${id}`, { method: 'DELETE' });
}

export async function resetUserPassword(id: number, newPassword: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password: newPassword })
  });
}

export type SettingsDto = {
  background: string | null;
  backgroundUrl: string | null;
  images: string[];
  recurringSuggestionsEnabled?: boolean;
  recurringSuggestionsDismissed?: string[];
  backgroundRotateEnabled?: boolean;
  backgroundRotateImages?: string[];
  weatherLocation?: string | null;
  holidaysEnabled?: boolean;
  todoEnabled?: boolean;
  newsEnabled?: boolean;
  scribbleEnabled?: boolean;
  scribbleStandbySeconds?: number;
  scribblePaperLook?: boolean;
  todoListName?: string | null;
  todoListNames?: string[];
  newsFeeds?: NewsFeedId[];
  dataRefreshMs?: number | null;
  clockStyle?: ClockStyle;
};

export async function fetchSettings(): Promise<SettingsDto> {
  return api<SettingsDto>('/settings');
}

export async function fetchNews(): Promise<NewsResponseDto> {
  return api<NewsResponseDto>('/news');
}

export async function setNewsEnabled(enabled: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/news', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setScribbleEnabled(enabled: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/scribble', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setScribbleStandbySeconds(seconds: number): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/scribble/standby-seconds', { method: 'POST', body: JSON.stringify({ seconds }) });
}

export async function setScribblePaperLook(enabled: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/scribble/paper-look', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setClockStyle(style: ClockStyle): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/clock/style', { method: 'POST', body: JSON.stringify({ style }) });
}

export async function setBackground(filename: string): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/background', { method: 'POST', body: JSON.stringify({ filename }) });
}

export async function deleteBackgroundImage(filename: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/settings/background/${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

export async function uploadBackground(file: File): Promise<{ filename: string; url: string }> {
  const form = new FormData();
  form.append('file', file);
  return apiForm<{ filename: string; url: string }>('/settings/background/upload', form);
}

export async function setBackgroundRotateEnabled(enabled: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/background/rotate', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setBackgroundRotateImages(images: string[]): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/background/rotate-images', { method: 'POST', body: JSON.stringify({ images }) });
}

export async function setRecurringSuggestionsEnabled(enabled: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/recurring-suggestions', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function dismissRecurringSuggestion(key: string): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/recurring-suggestions/dismiss', { method: 'POST', body: JSON.stringify({ key }) });
}

export function uploadBackgroundWithProgress(
  file: File,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<{ filename: string; url: string }> {
  const token = getToken();
  const url = `${API_BASE}/settings/background/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (evt.lengthComputable) onProgress(evt.loaded, evt.total);
    };

    xhr.onerror = () => reject(new Error('API network error'));

    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok) {
        reject(new Error(`API ${xhr.status}: ${xhr.responseText || ''}`.trim()));
        return;
      }

      try {
        const parsed = JSON.parse(xhr.responseText) as { filename: string; url: string };
        resolve(parsed);
      } catch {
        reject(new Error('API invalid JSON'));
      }
    };

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export async function setWeatherLocation(location: string): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/weather', { method: 'POST', body: JSON.stringify({ location }) });
}

export async function setHolidaysEnabled(enabled: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/holidays', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setTodoEnabled(enabled: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/todo', { method: 'POST', body: JSON.stringify({ enabled }) });
}

export async function setTodoListNames(listNames: string[]): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/todo/list-names', { method: 'POST', body: JSON.stringify({ listNames }) });
}

export async function setNewsFeeds(feeds: NewsFeedId[]): Promise<{ ok: true }> {
  return api<{ ok: true }>('/settings/news/feeds', { method: 'POST', body: JSON.stringify({ feeds }) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scribble Notes
// ─────────────────────────────────────────────────────────────────────────────

export type ScribbleDto = {
  id: number;
  userId: number;
  imageData: string; // Base64 data URL
  authorName: string | null;
  createdAt: string;
  expiresAt: string | null;
  pinned: boolean;
};

export type ScribblesResponseDto = {
  scribbles: ScribbleDto[];
  maxScribbles: number;
};

export async function fetchScribbles(): Promise<ScribblesResponseDto> {
  return api<ScribblesResponseDto>('/scribbles');
}

export async function createScribble(input: {
  imageData: string;
  authorName?: string;
  expiresInDays?: number;
}): Promise<{ scribble: ScribbleDto }> {
  return api<{ scribble: ScribbleDto }>('/scribbles', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteScribble(id: number): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/scribbles/${id}`, { method: 'DELETE' });
}

export async function pinScribble(id: number, pinned: boolean): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/scribbles/${id}/pin`, {
    method: 'PATCH',
    body: JSON.stringify({ pinned }),
  });
}

export type HolidayDto = {
  date: string; // YYYY-MM-DD
  title: string;
};

export type HolidaysResponse =
  | { ok: true; enabled: false; location: string | null; stateName: string | null; stateCode: string | null; holidays: HolidayDto[] }
  | { ok: true; enabled: true; location: string | null; stateName: string | null; stateCode: string | null; holidays: HolidayDto[] };

export async function fetchHolidays(from: Date, to: Date): Promise<HolidaysResponse> {
  const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return api<HolidaysResponse>(`/holidays?${qs.toString()}`);
}
