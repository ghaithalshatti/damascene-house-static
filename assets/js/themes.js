// The 12 customer-menu themes. Each sets a palette (themes.css), a card layout and a default brand color.
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
  { id: 'ember',    name: { ar: 'جمر ومشاوي',   en: 'Ember Grill' },    mode: 'dark',  layout: 'row',  primary: '#E8590C', swatch: ['#141110', '#E8590C', '#F5E6D8'] },
  { id: 'rose',     name: { ar: 'حلويات وردي',  en: 'Rosé Patisserie' }, mode: 'light', layout: 'tile', primary: '#D6336C', swatch: ['#FFF3F6', '#D6336C', '#3B1022'] },
  { id: 'olive',    name: { ar: 'زيتوني متوسطي', en: 'Mediterranean Olive' }, mode: 'light', layout: 'list', primary: '#5E7A2C', swatch: ['#F4F2E8', '#5E7A2C', '#C9A227'] },
  { id: 'royal',    name: { ar: 'ملكي',         en: 'Royal Velvet' },   mode: 'light', layout: 'row',  primary: '#5B3FA8', swatch: ['#F5F2FB', '#5B3FA8', '#C8A24A'] },
];
export const getTheme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
// Older configs only had { primary, mode }.
export const themeIdOf = (cfgTheme = {}) => cfgTheme.id || (cfgTheme.mode === 'dark' ? 'midnight' : 'classic');
