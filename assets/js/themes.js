// The 8 customer-menu themes. Each sets a palette (themes.css), a card layout and a default brand color.
// layout: row = photo beside text · tile = photo on top, grid · list = printed-menu style with dotted price leaders
export const THEMES = [
  { id: 'classic',  name: { ar: 'كلاسيكي دافئ', en: 'Warm Classic' },   mode: 'light', layout: 'row',  primary: '#B5532C', swatch: ['#F7F3EE', '#B5532C', '#1F1A15'] },
  { id: 'midnight', name: { ar: 'ليلي فاخر',    en: 'Midnight Luxe' },  mode: 'dark',  layout: 'tile', primary: '#C9A45C', swatch: ['#0D0D0F', '#C9A45C', '#F3EEE4'] },
  { id: 'fresh',    name: { ar: 'طازج',         en: 'Fresh' },          mode: 'light', layout: 'tile', primary: '#2E9A55', swatch: ['#F2F7F1', '#2E9A55', '#17301F'] },
  { id: 'minimal',  name: { ar: 'بسيط أنيق',    en: 'Minimal' },        mode: 'light', layout: 'list', primary: '#111111', swatch: ['#FFFFFF', '#111111', '#E6E6E6'] },
  { id: 'street',   name: { ar: 'شعبي جريء',    en: 'Street Bold' },    mode: 'light', layout: 'row',  primary: '#E63946', swatch: ['#FFF6DF', '#E63946', '#141414'] },
  { id: 'cafe',     name: { ar: 'مقهى',         en: 'Café' },           mode: 'light', layout: 'tile', primary: '#7A5230', swatch: ['#F3ECE3', '#7A5230', '#2B1D14'] },
  { id: 'ocean',    name: { ar: 'بحري',         en: 'Ocean' },          mode: 'light', layout: 'row',  primary: '#0E6F8F', swatch: ['#EDF4F7', '#0E6F8F', '#0D2733'] },
  { id: 'heritage', name: { ar: 'تراثي دمشقي',  en: 'Damascene Heritage' }, mode: 'light', layout: 'list', primary: '#7B2D3B', swatch: ['#F5EDE0', '#7B2D3B', '#B98A3E'] },
];
export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
// Older configs only had { primary, mode }.
export const themeIdOf = (cfgTheme = {}) => cfgTheme.id || (cfgTheme.mode === 'dark' ? 'midnight' : 'classic');
