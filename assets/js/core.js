// Shared helpers for menu, admin and setup pages.
import { STRINGS } from './i18n.js';
import { getTheme, themeIdOf } from './themes.js';

export const ROOT = new URL('../../', import.meta.url);
export const siteUrl = (p = '') => new URL(p, ROOT).href;

const DRAFT_CONFIG = 'rm:draft:config';
const DRAFT_MENU = 'rm:draft:menu';

/* ---------- storage ---------- */
export const ls = {
  get(k, fb = null) { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- data ---------- */
export async function fetchJSON(path) {
  const u = new URL(path, ROOT);
  u.searchParams.set('v', Date.now());
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
  return r.json();
}

export const isRepoConfigured = (cfg) => !!(cfg?.github?.owner && cfg?.github?.repo);

// Local trial mode: when the site isn't linked to GitHub yet, edits live in this browser only.
export async function loadSite() {
  let [config, menu] = await Promise.all([fetchJSON('data/config.json'), fetchJSON('data/menu.json')]);
  let draft = false;
  if (!isRepoConfigured(config)) {
    const dc = ls.get(DRAFT_CONFIG); const dm = ls.get(DRAFT_MENU);
    if (dc) { config = deepMerge(config, dc); draft = true; }
    if (dm) { menu = dm; draft = true; }
  }
  return { config: normalizeConfig(config), menu: normalizeMenu(menu), draft };
}
export const saveDraft = { config: (c) => ls.set(DRAFT_CONFIG, c), menu: (m) => ls.set(DRAFT_MENU, m), clear() { ls.del(DRAFT_CONFIG); ls.del(DRAFT_MENU); } };

export function normalizeConfig(c = {}) {
  const d = {
    restaurant: { name: { ar: '', en: '' }, tagline: { ar: '', en: '' }, logo: '', cover: '', phone: '', address: { ar: '', en: '' }, hours: { ar: '', en: '' }, mapUrl: '', social: { instagram: '', facebook: '', tiktok: '', website: '' } },
    theme: { id: '', primary: '' },
    currency: { ar: 'ل.س', en: 'SYP' },
    languages: { default: 'ar', enabled: ['ar', 'en'] },
    tables: { count: 10 },
    github: { owner: '', repo: '', branch: 'main' },
    poweredBy: { name: '', url: '' },
  };
  return deepMerge(d, c);
}
export function normalizeMenu(m = {}) {
  return {
    updatedAt: m.updatedAt || null,
    categories: (m.categories || []).map((c) => ({ id: c.id, name: { ar: '', en: '', ...c.name }, icon: c.icon || '🍽️' })),
    items: (m.items || []).map((i) => ({
      id: i.id, categoryId: i.categoryId,
      name: { ar: '', en: '', ...i.name }, description: { ar: '', en: '', ...i.description },
      price: Number(i.price) || 0,
      sizes: (i.sizes || []).map((s) => ({ name: { ar: '', en: '', ...s.name }, price: Number(s.price) || 0 })),
      image: i.image || '', available: i.available !== false, tags: i.tags || [],
    })),
  };
}
export function deepMerge(a, b) {
  if (Array.isArray(b)) return b.slice();
  if (b && typeof b === 'object') {
    const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
    for (const k of Object.keys(b)) out[k] = deepMerge(out[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

/* ---------- language ---------- */
let LANG = 'ar';
export const getLang = () => LANG;
export function initLang(cfg) {
  const enabled = cfg?.languages?.enabled?.length ? cfg.languages.enabled : ['ar', 'en'];
  const saved = ls.get('rm:lang');
  LANG = enabled.includes(saved) ? saved : (enabled.includes(cfg?.languages?.default) ? cfg.languages.default : enabled[0]);
  applyLang();
  return enabled;
}
export function setLang(l) { LANG = l; ls.set('rm:lang', l); applyLang(); }
function applyLang() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
}
// Text in the current language, falling back to the other one.
export const tx = (o) => (o ? (o[LANG] || o[LANG === 'ar' ? 'en' : 'ar'] || '') : '');
export function t(key, vars) {
  let s = STRINGS[LANG]?.[key] ?? STRINGS.ar[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
export function applyStatic(root = document) {
  root.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll('[data-t-ph]').forEach((el) => { el.placeholder = t(el.dataset.tPh); });
  root.querySelectorAll('[data-t-title]').forEach((el) => { el.title = t(el.dataset.tTitle); el.setAttribute('aria-label', t(el.dataset.tTitle)); });
}

/* ---------- formatting ---------- */
export function formatPrice(n, cfg) {
  const num = Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const cur = tx(cfg?.currency) || '';
  return LANG === 'ar' ? `${num} ${cur}` : `${num} ${cur}`;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = 'i') => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function normalizeSearch(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .trim();
}
export function imgSrc(p) {
  if (!p) return '';
  if (/^(data:|blob:|https?:)/.test(p)) return p;
  return siteUrl(p);
}

/* ---------- theme ---------- */
// Dashboards (admin=true) share the theme's palette but not the menu's card layout.
export function applyTheme(cfg, { admin = false } = {}) {
  const root = document.documentElement;
  const th = getTheme(themeIdOf(cfg?.theme));
  const primary = cfg?.theme?.primary || th.primary;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--on-primary', contrastText(primary));
  root.dataset.skin = th.id;
  root.dataset.theme = th.mode;
  if (admin) delete root.dataset.layout; else root.dataset.layout = th.layout;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = admin ? primary : (th.mode === 'dark' ? '#0D0D0F' : primary);
  return th;
}
export function contrastText(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? '#1d1a16' : '#ffffff';
}

/* ---------- UI: toast, sheets, confirm ---------- */
export function toast(msg, type = 'ok', ms = 2600) {
  let host = document.querySelector('.toasts');
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.append(host); }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `${type === 'err' ? ICONS.alert : ICONS.check}<span>${esc(msg)}</span>`;
  host.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, ms);
}

const openSheets = [];
export function openSheet(sheet) {
  sheet.hidden = false;
  sheet.style.zIndex = 60 + openSheets.length * 2;
  requestAnimationFrame(() => sheet.classList.add('open'));
  document.body.classList.add('no-scroll');
  openSheets.push(sheet);
  if (!sheet._bound) {
    sheet._bound = true;
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(sheet); });
  }
}
export function closeSheet(sheet) {
  sheet.classList.remove('open');
  const i = openSheets.indexOf(sheet); if (i > -1) openSheets.splice(i, 1);
  if (!openSheets.length) document.body.classList.remove('no-scroll');
  setTimeout(() => { if (!sheet.classList.contains('open')) sheet.hidden = true; }, 280);
  sheet.dispatchEvent(new Event('sheet:closed'));
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheets.length) closeSheet(openSheets[openSheets.length - 1]); });

export function confirmDialog(message, { okText, danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet sheet--center';
    wrap.innerHTML = `<div class="sheet__panel dialog">
      <p class="dialog__msg">${esc(message)}</p>
      <div class="dialog__actions">
        <button class="btn btn--ghost" data-v="0">${esc(t('cancel'))}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-v="1">${esc(okText || t('confirm'))}</button>
      </div></div>`;
    document.body.append(wrap);
    let done = false;
    const finish = (v) => { if (done) return; done = true; closeSheet(wrap); setTimeout(() => wrap.remove(), 320); resolve(v); };
    wrap.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) finish(b.dataset.v === '1'); else if (e.target === wrap) finish(false); });
    wrap.addEventListener('sheet:closed', () => finish(false));
    openSheet(wrap);
  });
}

/* ---------- icons (inline SVG, stroke = currentColor) ---------- */
const svg = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICONS = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  bag: svg('<path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>'),
  facebook: svg('<path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2Z"/>'),
  tiktok: svg('<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3a5 5 0 0 0 5 5"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  drag: svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  logout: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>'),
  note: svg('<path d="M5 4h14v12l-4 4H5Z"/><path d="M15 20v-4h4M9 9h6M9 13h4"/>'),
  print: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7Z"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  table: svg('<path d="M4 8h16M6 8v11M18 8v11M4 8l2-4h12l2 4"/>'),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  flame: svg('<path d="M12 21c4 0 7-3 7-7 0-5-5-7-5-11-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 4-2 7 0 4 3 7 7 7Z"/>'),
  leaf: svg('<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19 14 10"/>'),
  star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>'),
  chevron: svg('<path d="m9 6 6 6-6 6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  store: svg('<path d="M4 10v10h16V10M3 6l2-3h14l2 3v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M10 20v-5h4v5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  qr: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>'),
  send: svg('<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4Z"/>'),
  bell: svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  receipt: svg('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  chef: svg('<path d="M7 21h10M8 17h8v4H8z"/><path d="M8 17v-4.5A4 4 0 1 1 12 5a4 4 0 1 1 4 7.5V17"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16 9a3.5 3.5 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9Z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
  github: svg('<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-1-2.5c3 0 6-2 6-5.5a4.5 4.5 0 0 0-1.3-3.2 4 4 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4 4 0 0 0-.1 3.2A4.5 4.5 0 0 0 4.2 9.5c0 3.5 3 5.5 6 5.5a3 3 0 0 0-1 2.5V21"/>'),
};
export const TAGS = {
  popular: { icon: 'star', key: 'tag_popular' },
  new: { icon: 'sparkle', key: 'tag_new' },
  spicy: { icon: 'flame', key: 'tag_spicy' },
  veg: { icon: 'leaf', key: 'tag_veg' },
};
