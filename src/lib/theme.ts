/**
 * Theme tokens — user-adjustable accent (the primary "neon" hue), kept within
 * the strict dark palette. Surfaces (#090a0c / #131316) and the functional
 * node colors (violet trigger, cyan target, ...) are intentionally fixed; only
 * the primary accent is customizable. The accent is expressed as a CSS variable
 * (--neon-rgb "R G B") that Tailwind's `neon` color reads, so changing it
 * re-tints buttons, rings, glows and active states live.
 */
export interface ThemePreset {
  id: string;
  name: string;
  rgb: [number, number, number];
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'teal', name: 'Teal', rgb: [94, 234, 212] },
  { id: 'violet', name: 'Violet', rgb: [167, 139, 250] },
  { id: 'azure', name: 'Azure', rgb: [56, 189, 248] },
  { id: 'amber', name: 'Amber', rgb: [251, 191, 36] },
  { id: 'rose', name: 'Rose', rgb: [244, 114, 182] },
  { id: 'emerald', name: 'Emerald', rgb: [52, 211, 153] },
];

const KEY = 'bfrs-accent';

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function applyAccent(rgb: [number, number, number]): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--neon-rgb', rgb.map((v) => Math.round(v)).join(' '));
}

export function loadAccent(): [number, number, number] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (Array.isArray(v) && v.length === 3) return v as [number, number, number];
    }
  } catch {
    /* ignore */
  }
  return [94, 234, 212];
}

export function saveAccent(rgb: [number, number, number]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rgb));
  } catch {
    /* ignore */
  }
}

export function setPreset(id: string): void {
  const p = THEME_PRESETS.find((t) => t.id === id);
  if (!p) return;
  applyAccent(p.rgb);
  saveAccent(p.rgb);
}

export function setHue(h: number): void {
  const rgb = hslToRgb(h, 78, 64);
  applyAccent(rgb);
  saveAccent(rgb);
}

export type ThemeMode = 'dark' | 'light';
const MODE_KEY = 'bfrs-theme-mode';

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
}

export function loadThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function setThemeMode(mode: ThemeMode): void {
  applyThemeMode(mode);
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = (document.documentElement.dataset.theme === 'light') ? 'dark' : 'light';
  setThemeMode(next);
  return next;
}
