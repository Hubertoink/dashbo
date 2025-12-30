import { normalizeClockStyle, type ClockStyle } from '$lib/clockStyle';

export const DASHBOARD_GLASS_BLUR_ENABLED_KEY = 'dashbo_dashboard_glass_blur_enabled';
export const DASHBOARD_TEXT_STYLE_KEY = 'dashbo_dashboard_text_style';

export function getDashboardGlassBlurEnabledFromStorage(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DASHBOARD_GLASS_BLUR_ENABLED_KEY) === '1';
}

export function getDashboardTextStyleFromStorage(): ClockStyle {
  if (typeof localStorage === 'undefined') return 'modern';
  return normalizeClockStyle(localStorage.getItem(DASHBOARD_TEXT_STYLE_KEY));
}
