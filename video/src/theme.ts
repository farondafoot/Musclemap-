/**
 * MuscleMap brand tokens, lifted from Index.html so the video matches the app.
 */

export const theme = {
  bg:      '#0a0a0b',
  s1:      '#111113',
  s2:      '#19191c',
  s3:      '#222226',
  b1:      '#2a2a30',
  b2:      '#38383f',
  t1:      '#ededef',
  t2:      '#8b8b96',
  t3:      '#4a4a54',
  accent:  '#5b8def',
  accent2: '#4070d4',
  accent3: '#8ab4f8',
  success: '#30c48a',
  warn:    '#f0a030',
  danger:  '#e05050',

  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
} as const;

export const VIDEO = {
  width:  1080,
  height: 1920,
  fps:    30,
} as const;

/** Accent glow used on hero elements. */
export const glow = (color: string = theme.accent, strength = 1) =>
  `0 0 ${40 * strength}px ${color}55, 0 0 ${100 * strength}px ${color}22`;
