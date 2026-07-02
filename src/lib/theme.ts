/**
 * Theme — dark (default) vs paper (light, via the banner toggle). One
 * class on <html>: `reading-paper` present = paper everywhere (the
 * --bpmn-* token remap in index.css cascades into every token-driven
 * surface); absent = the original dark canvas. Dark is the default
 * because the desktop's entry/auth screen and canvas world are
 * dark-native surfaces. Hardcoded-dark working surfaces (call graph,
 * code panel, canvas world) opt out via .theme-dark-island either way.
 */
const KEY = 'underscore-theme';
export type Theme = 'paper' | 'dark';

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'dark' || t === 'paper') return t;
  } catch { /* ignore */ }
  return 'dark';
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('reading-paper', t === 'paper');
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  // Two writers exist (ThemeToggle button + Cmd+K action) — let mounted
  // toggles re-sync their icon mirror.
  window.dispatchEvent(new Event('underscore-theme'));
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('reading-paper') ? 'paper' : 'dark';
}
