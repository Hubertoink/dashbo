import type { SettingsDto } from '$lib/api';

export type PlannerViewMode = 'agenda' | 'week' | 'month';
export type PlannerWeekSpan = 3 | 7;

const DEFAULT_BACKGROUND = '/background.jpg';

export function pickPlannerBackground(settings: SettingsDto): string {
  const uploaded = (settings.images ?? []).map((image) => `/api/media/${image}`);
  if (uploaded.length > 0) {
    const preferred = settings.background ? `/api/media/${settings.background}` : null;
    return preferred && uploaded.includes(preferred) ? preferred : (uploaded[0] ?? DEFAULT_BACKGROUND);
  }

  if (settings.backgroundUrl) return `/api${settings.backgroundUrl}`;
  return DEFAULT_BACKGROUND;
}

export function normalizeDismissedSuggestions(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

export function parsePlannerView(value: unknown): PlannerViewMode | null {
  if (value === 'agenda' || value === 'week' || value === 'month') return value;
  return null;
}

export function loadPlannerDefaultView(storage: Pick<Storage, 'getItem'> | null | undefined, storageKey: string): PlannerViewMode {
  try {
    return parsePlannerView(storage?.getItem(storageKey)) ?? 'agenda';
  } catch {
    return 'agenda';
  }
}

export function savePlannerDefaultView(storage: Pick<Storage, 'setItem'> | null | undefined, storageKey: string, next: PlannerViewMode) {
  try {
    storage?.setItem(storageKey, next);
  } catch {
    // ignore storage errors
  }
}

export function getPlannerInitialWeekSpan(matchMedia: ((query: string) => MediaQueryList) | undefined): PlannerWeekSpan {
  try {
    return matchMedia?.('(max-width: 767px)').matches ? 3 : 7;
  } catch {
    return 7;
  }
}

export function shouldShowPlannerFabTeaser(
  matchMedia: ((query: string) => MediaQueryList) | undefined,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  storageKey: string
): boolean {
  try {
    const isMobile = matchMedia?.('(max-width: 767px)').matches;
    const reduceMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const seen = storage?.getItem(storageKey) === '1';
    if (!isMobile || reduceMotion || seen) return false;
    storage?.setItem(storageKey, '1');
    return true;
  } catch {
    return false;
  }
}