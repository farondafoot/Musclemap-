/**
 * Everything AI Daily — brand tokens.
 *
 * Tech-newsroom palette: near-black, sharp cyan signal, amber and rose for
 * stories with heat. Mono is used structurally (kickers, sources, timestamps)
 * so the frame reads as a wire report rather than a lifestyle post.
 */

export const theme = {
  bg:      '#08090c',
  s1:      '#0e1015',
  s2:      '#151821',
  s3:      '#1d212c',
  b1:      '#272c3a',
  b2:      '#373d4f',
  t1:      '#f2f4f8',
  t2:      '#8b93a7',
  t3:      '#4b5366',

  accent:  '#38bdf8',   // signal cyan
  accent2: '#0ea5e9',
  accent3: '#7dd3fc',

  alert:   '#f43f5e',   // breach / incident stories
  warn:    '#fbbf24',   // funding, regulation
  good:    '#34d399',   // launches, wins

  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
} as const;

export const BRAND = {
  name:    'EVERYTHING',
  name2:   'AI DAILY',
  tagline: 'Your daily AI briefing',
} as const;

export const VIDEO = {
  width:  1080,
  height: 1920,
  fps:    30,
} as const;

/** Story tone drives the accent, so a breach doesn't look like a product launch. */
export type Tone = 'signal' | 'alert' | 'warn' | 'good';

export const toneColor = (tone: Tone = 'signal') =>
  ({ signal: theme.accent, alert: theme.alert, warn: theme.warn, good: theme.good }[tone]);

export const glow = (color: string, strength = 1) =>
  `0 0 ${40 * strength}px ${color}55, 0 0 ${100 * strength}px ${color}22`;
