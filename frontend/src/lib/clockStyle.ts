export type ClockStyle = 'modern' | 'elegant' | 'serif' | 'mono';

export const CLOCK_STYLE_OPTIONS: Array<{ id: ClockStyle; label: string; classes: string }> = [
  {
    id: 'modern',
    label: 'Modern',
    classes: 'font-sans font-semibold tracking-tight tabular-nums'
  },
  {
    id: 'elegant',
    label: 'Elegant',
    classes: 'font-sans font-light tracking-widest tabular-nums'
  },
  {
    id: 'serif',
    label: 'Serif',
    classes: 'font-serif font-semibold tracking-tight tabular-nums'
  },
  {
    id: 'mono',
    label: 'Mono',
    classes: 'font-mono font-semibold tracking-widest tabular-nums'
  }
];

export function normalizeClockStyle(value: unknown): ClockStyle {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  // Backwards mapping from previous experimental styles
  if (v === 'soft') return 'elegant';
  if (v === 'bold') return 'modern';

  if (v === 'modern' || v === 'elegant' || v === 'serif' || v === 'mono') return v;
  return 'modern';
}

export function clockStyleClasses(style?: ClockStyle | null): string {
  const effective = normalizeClockStyle(style);
  return CLOCK_STYLE_OPTIONS.find((o) => o.id === effective)?.classes ?? 'font-sans font-semibold tracking-tight tabular-nums';
}
