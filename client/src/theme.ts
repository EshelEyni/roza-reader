import { DEFAULT_THEME, THEME_IDS, type ThemeId } from '../../shared/themes';

const CACHE_KEY = 'roza-reader-theme';

// settings.json is the source of truth; the browser cache only paints the right theme before it loads.
export function cachedTheme(): ThemeId {
  try {
    const cached = localStorage.getItem(CACHE_KEY) as ThemeId | null;
    const isKnownTheme = cached !== null && THEME_IDS.includes(cached);
    return isKnownTheme ? cached : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this session.
  }
}
