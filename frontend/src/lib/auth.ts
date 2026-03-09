import { decodeJwtPayload, fetchMe, getStoredToken, setToken, type MeDto } from '$lib/api';

type JwtPayload = {
  exp?: number;
};

export function normalizeNextPath(nextPath: string | null | undefined): string {
  const value = String(nextPath || '/').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function getLoginRedirectPath(nextPath?: string | null): string {
  const normalized = normalizeNextPath(nextPath);
  return normalized === '/' ? '/login' : `/login?next=${encodeURIComponent(normalized)}`;
}

export async function resolveStoredUser(): Promise<MeDto | null> {
  const token = getStoredToken();
  if (!token) return null;

  const payload = decodeJwtPayload<JwtPayload>(token);
  if (typeof payload?.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    setToken(null);
    return null;
  }

  try {
    return await fetchMe();
  } catch {
    setToken(null);
    return null;
  }
}