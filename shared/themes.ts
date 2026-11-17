// The full palettes live in client/src/themes.css; these swatches drive the theme menu previews
// and the Electron window background before the page paints.
export const THEMES = [
  {
    id: 'sand',
    label: 'Sand',
    description: 'Warm beige, terracotta accent',
    swatch: { bg: '#f4efe6', panel: '#fbf8f2', accent: '#a85a32', text: '#2b2620' },
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Clean, bright and neutral',
    swatch: { bg: '#f6f7f9', panel: '#ffffff', accent: '#4f5bd5', text: '#1f2328' },
  },
  {
    id: 'sage',
    label: 'Sage',
    description: 'Soft green, calm and muted',
    swatch: { bg: '#eef1ea', panel: '#f8faf5', accent: '#4f7a4f', text: '#232a22' },
  },
  {
    id: 'espresso',
    label: 'Espresso',
    description: 'Warm dark brown with caramel',
    swatch: { bg: '#1c1814', panel: '#25201b', accent: '#d9a066', text: '#efe6d8' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'The original dark theme',
    swatch: { bg: '#0b0d12', panel: '#12151c', accent: '#7c8cff', text: '#e6e9f0' },
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_IDS = THEMES.map((theme) => theme.id);

export const DEFAULT_THEME: ThemeId = 'sand';

export const themeById = (id: ThemeId) => THEMES.find((theme) => theme.id === id) ?? THEMES[0];
