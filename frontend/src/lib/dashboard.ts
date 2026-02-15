import { normalizeClockStyle, type ClockStyle } from '$lib/clockStyle';

export const DASHBOARD_GLASS_BLUR_ENABLED_KEY = 'dashbo_dashboard_glass_blur_enabled';
export const DASHBOARD_TEXT_STYLE_KEY = 'dashbo_dashboard_text_style';
export const DASHBOARD_BG_DIMMING_KEY = 'dashbo_dashboard_bg_dimming';

/** Default background dimming percentage (0 = no overlay, 100 = fully opaque). */
export const DASHBOARD_BG_DIMMING_DEFAULT = 50;

export function getDashboardGlassBlurEnabledFromStorage(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DASHBOARD_GLASS_BLUR_ENABLED_KEY) === '1';
}

export function getDashboardTextStyleFromStorage(): ClockStyle {
  if (typeof localStorage === 'undefined') return 'modern';
  return normalizeClockStyle(localStorage.getItem(DASHBOARD_TEXT_STYLE_KEY));
}

/**
 * Returns background dimming value 0-100.
 * Returns `DASHBOARD_BG_DIMMING_DEFAULT` when nothing stored.
 */
export function getDashboardBgDimmingFromStorage(): number {
  if (typeof localStorage === 'undefined') return DASHBOARD_BG_DIMMING_DEFAULT;
  const raw = localStorage.getItem(DASHBOARD_BG_DIMMING_KEY);
  if (raw === null) return DASHBOARD_BG_DIMMING_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DASHBOARD_BG_DIMMING_DEFAULT;
  return Math.max(0, Math.min(100, Math.round(n)));
}
