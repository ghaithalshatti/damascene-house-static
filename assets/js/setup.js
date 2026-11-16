// Developer setup: link a restaurant repo, brand it, set the owner password, print table QR codes.
import {
  loadSite, normalizeConfig, normalizeMenu, saveDraft, initLang, setLang, getLang, t, tx, esc, imgSrc,
  applyTheme, ICONS, toast,
} from './core.js';
import { GitHub, toJSONText } from './github.js';
import { encryptSecret, cryptoAvailable, isStrongPassword } from './crypto.js';
import { compressImage, blobToDataURL } from './image.js';
import { qrControlsHTML, bindQr } from './qr.js';
import { THEMES, getTheme, themeIdOf } from './themes.js';

const app = document.getElementById('app');
const S = { pending: {}, config: null, menu: null, gh: null, hasAuth: false, logo: { photo: null, removed: false }, cover: { photo: null, removed: false } };
const PRESETS = ['#B5532C', '#C0392B', '#8E3B46', '#D97706', '#1F7A4D', '#0F766E', '#1D4ED8', '#4338CA', '#7C3AED', '#1F2937'];

async function boot() {
  try { const s = await loadSite(); S.config = s.config; S.menu = s.menu; }
  catch (e) { app.innerHTML = `<p class="err-msg">${esc(e.message)}</p>`; return; }
  initLang({ languages: { default: 'ar', enabled: ['ar', 'en'] } });
  // Prefill GitHub details when the page itself is served from GitHub Pages.
  const g = S.config.github;
  if (!g.owner && location.hostname.endsWith('.github.io')) {
    g.owner = location.hostname.split('.')[0];
    const seg = location.pathname.split('/').filter(Boolean)[0];
    g.repo = seg && seg !== 'setup' ? seg : `${g.owner}.github.io`;
  }
  render();
}

const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${esc(label)}</span>${inner}</label>`;
const input = (name, val, attrs = '') => `<input class="input" name="${name}" value="${esc(val ?? '')}" ${attrs}>`;
const seg = (name, opts, val) => `<div class="seg">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${v === val ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
const photo = (id, path, cls) => `<div class="photo ${cls}" id="${id}" role="button" tabindex="0">${path ? `<img src="${esc(S.pending[path] || imgSrc(path))}" alt="">` : `<div class="photo__empty">${ICONS.image}<span>${esc(t('choose_photo'))}</span></div>`}</div>
  <input type="file" accept="image/*" id="${id}File" hidden>
  <div class="photo-actions"><button type="button" class="btn btn--danger-ghost btn--sm" data-rm="${id}" ${path ? '' : 'hidden'}>${ICONS.trash}${esc(t('remove_photo'))}</button></div>`;
function themeCard(th, on) {
  const rows = th.layout === 'tile' ? '<i class="tm-tile"></i><i class="tm-tile"></i><i class="tm-tile"></i><i class="tm-tile"></i>'
    : th.layout === 'list' ? '<i class="tm-line"></i><i class="tm-line"></i><i class="tm-line"></i><i class="tm-line"></i>'
      : '<i class="tm-row"></i><i class="tm-row"></i><i class="tm-row"></i>';
  return `<button type="button" class="theme-card ${on ? 'on' : ''}" data-theme="${th.id}" aria-pressed="${on}">
    <span class="theme-mini tml-${th.layout}" style="--b:${th.swatch[0]};--p:${th.primary};--t:${th.swatch[2]}"><i class="tm-hero"></i><span class="tm-items">${rows}</span></span>
    <b>${esc(tx(th.name))}</b><small>${esc(t(`layout_${th.layout}`))}</small></button>`;
}
function styleCard(id, on) {
  return `<button type="button" class="style-card ${on ? 'on' : ''}" data-style="${id}" aria-pressed="${on}">
    <span class="style-mini style-mini--${id}"><i></i><i></i><i></i></span>
    <b>${esc(t(`style_${id}`))}</b><small>${esc(t(`style_${id}_sub`))}</small></button>`;
}
const langMode = (c) => (c.languages.enabled.length > 1 ? 'ar_en' : c.languages.enabled[0] === 'en' ? 'en_only' : 'ar_only');

function render() {
  const c = S.config; const r = c.restaurant; const g = c.github;
  const curTheme = getTheme(themeIdOf(c.theme)).id;
  const primary = c.theme.primary || getTheme(curTheme).primary;
  c.theme = { id: curTheme, primary, style: c.theme.style === 'glass' ? 'glass' : 'classic' };
  applyTheme(c, { admin: true });
  document.title = t('setup_title');
  app.innerHTML = `
  <header class="adm-top"><div class="adm-wrap"><div class="adm-top__row">
    <div class="adm-brand"><div class="adm-brand__logo">${ICONS.settings}</div><div><b>${esc(t('setup_title'))}</b><small>QR Menu</small></div></div>
    <div class="adm-actions"><button class="icon-btn" id="langBtn" title="${esc(t('lang_switch'))}">${ICONS.globe}</button></div>
  </div></div></header>
  <main class="adm-wrap" style="padding-bottom:40px">
    <div class="hero-setup"><h1>${esc(t('setup_title'))}</h1><p>${esc(t('setup_sub'))}</p></div>
    <form id="f" novalidate class="stack" style="margin-top:16px">
      <section class="panel"><div class="panel__title"><span class="num-badge">1</span>${esc(t('s_github'))}</div><div class="stack">
        <div class="grid2">${field(t('owner'), input('owner', g.owner, 'dir="ltr" autocomplete="off" placeholder="username"'))}${field(t('repo'), input('repo', g.repo, 'dir="ltr" autocomplete="off" placeholder="restaurant-name"'))}</div>
        <div class="grid2">${field(t('branch'), input('branch', g.branch || 'main', 'dir="ltr"'))}
          ${field(t('token'), `<input class="input" type="password" name="token" dir="ltr" autocomplete="new-password" spellcheck="false" placeholder="github_pat_…">`)}</div>
        <p class="hint">${esc(t('token_hint'))}</p>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button type="button" class="btn btn--outline" id="testBtn">${ICONS.github}${esc(t('test_connection'))}</button><span class="status" id="ghStatus"></span></div>
      </div></section>

      <section class="panel"><div class="panel__title"><span class="num-badge">2</span>${esc(t('s_theme'))}</div>
        <div class="theme-wrap">
          <div class="stack">
            <div class="field"><span>${esc(t('design_style'))}</span><div class="styles" id="styles">${['classic', 'glass'].map((id) => styleCard(id, (c.theme.style || 'classic') === id)).join('')}</div></div>
            <div class="label">${esc(t('theme_label'))}</div>
            <div class="themes" id="themes">${THEMES.map((th) => themeCard(th, th.id === curTheme)).join('')}</div>
            <div class="field"><span>${esc(t('primary_color'))}</span><div class="swatches" id="swatches">
              ${PRESETS.map((p) => `<button type="button" data-color="${p}" style="background:${p}" class="${p.toLowerCase() === primary.toLowerCase() ? 'on' : ''}" aria-label="${p}"></button>`).join('')}
              <input type="color" name="primary" value="${esc(primary)}" aria-label="${esc(t('primary_color'))}"></div></div>
          </div>
          <div class="phone-col"><div class="label">${esc(t('live_preview'))}</div>
            <div class="phone"><iframe id="preview" title="preview" src="../?preview=1&t=4&skin=${encodeURIComponent(curTheme)}&primary=${encodeURIComponent(primary)}&style=${c.theme.style === 'glass' ? 'glass' : 'classic'}"></iframe></div></div>
        </div>
      </section>

      <section class="panel"><div class="panel__title"><span class="num-badge">3</span>${esc(t('s_identity'))}</div><div class="stack">
        <div class="grid2">${field(t('rest_name_ar'), input('name.ar', r.name.ar, 'dir="rtl"'))}${field(t('rest_name_en'), input('name.en', r.name.en, 'dir="ltr"'))}</div>
        <div class="grid2">${field(t('tagline_ar'), input('tagline.ar', r.tagline.ar, 'dir="rtl"'))}${field(t('tagline_en'), input('tagline.en', r.tagline.en, 'dir="ltr"'))}</div>
        <div class="grid2"><div class="field"><span>${esc(t('logo'))}</span>${photo('logo', r.logo, 'photo--square')}</div><div class="field"><span>${esc(t('cover'))}</span>${photo('cover', r.cover, 'photo--wide')}</div></div>
      </div></section>

      <section class="panel"><div class="panel__title"><span class="num-badge">4</span>${esc(t('s_details'))}</div><div class="stack">
        <div class="grid2"><div class="field"><span>${esc(t('langs'))}</span>${seg('langs', [['ar_en', t('ar_en')], ['ar_only', t('ar_only')], ['en_only', t('en_only')]], langMode(c))}</div>
          <div class="field"><span>${esc(t('default_lang'))}</span>${seg('defLang', [['ar', 'العربية'], ['en', 'English']], c.languages.default)}</div></div>
        <div class="grid2">${field(t('currency_ar'), input('cur.ar', c.currency.ar, 'dir="rtl"'))}${field(t('currency_en'), input('cur.en', c.currency.en, 'dir="ltr"'))}</div>
        ${field(t('phone'), input('phone', r.phone, 'dir="ltr" inputmode="tel"'))}
        <div class="grid2">${field(t('address_ar'), input('address.ar', r.address.ar, 'dir="rtl"'))}${field(t('address_en'), input('address.en', r.address.en, 'dir="ltr"'))}</div>
        <div class="grid2">${field(t('hours_ar'), input('hours.ar', r.hours.ar, 'dir="rtl"'))}${field(t('hours_en'), input('hours.en', r.hours.en, 'dir="ltr"'))}</div>
      </div></section>

      <section class="panel"><div class="panel__title"><span class="num-badge">5</span>${esc(t('s_password'))}</div><div class="stack">
        <div class="grid2">${field(t('new_password'), `<input class="input" type="password" name="pw1" autocomplete="new-password">`)}${field(t('confirm_password'), `<input class="input" type="password" name="pw2" autocomplete="new-password">`)}</div>
        <p class="hint">${esc(t('pw_rules'))} <span id="pwKeep" hidden>${esc(t('pw_keep'))}</span></p>
      </div></section>

      <section class="panel"><div class="panel__title"><span class="num-badge">6</span>${esc(t('s_menu'))}</div>
        <label class="check"><input type="checkbox" name="empty">${esc(t('start_empty'))}</label></section>

      <div class="publish-bar"><button type="button" class="btn btn--primary btn--block" id="publishBtn">${ICONS.check}<span>${esc(t('publish_local'))}</span></button></div>
      <section class="panel" id="linksPanel" hidden></section>

      <section class="panel" id="qrPanel"><div class="panel__title"><span class="num-badge">7</span>${esc(t('s_qr'))}</div>
        ${qrControlsHTML({ count: c.tables.count, base: defaultBase(), showBase: true })}
      </section>
    </form>
  </main>`;
  bind();
  fitPhone();
}
// Scales the 390px-wide preview iframe to the phone frame.
function fitPhone() {
  const ph = document.querySelector('.phone'); const fr = document.getElementById('preview');
  if (!ph || !fr) return;
  const sc = ph.clientWidth / 390;
  fr.style.transform = `scale(${sc})`;
  fr.style.height = `${ph.clientHeight / sc}px`;
}
addEventListener('resize', fitPhone);

function defaultBase() {
  const g = S.config.github;
  if (g.owner && g.repo) return g.repo.toLowerCase() === `${g.owner}.github.io`.toLowerCase() ? `https://${g.owner}.github.io/` : `https://${g.owner}.github.io/${g.repo}/`;
  return new URL('../', location.href).href;
}

function bind() {
  const f = document.getElementById('f');
  document.getElementById('langBtn').onclick = () => { readForm(); setLang(getLang() === 'ar' ? 'en' : 'ar'); render(); };
  // Live theme preview
  document.getElementById('swatches').onclick = (e) => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    f.primary.value = b.dataset.color; previewTheme();
  };
  f.primary.oninput = previewTheme;
  document.getElementById('styles').onclick = (e) => {
    const b = e.target.closest('[data-style]'); if (!b) return;
    S.config.theme.style = b.dataset.style;
    document.querySelectorAll('.style-card').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    previewTheme();
  };
  document.getElementById('themes').onclick = (e) => {
    const b = e.target.closest('[data-theme]'); if (!b) return;
    const th = getTheme(b.dataset.theme);
    S.config.theme.id = th.id;
    document.querySelectorAll('.theme-card').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    f.primary.value = th.primary; previewTheme();
  };
  f.addEventListener('change', (e) => { if (['owner', 'repo'].includes(e.target.name)) { readForm(); f.baseUrl.value = defaultBase(); } });
  // Show only the fields of the languages the restaurant uses.
  const syncLangFields = () => {
    const mode = f.langs.value;
    f.querySelectorAll('input[name$=".en"], input[name$=".ar"]').forEach((el) => {
      const isEn = el.name.endsWith('.en');
      el.closest('.field').hidden = (mode === 'ar_only' && isEn) || (mode === 'en_only' && !isEn);
    });
  };
  f.addEventListener('change', (e) => { if (e.target.name === 'langs') syncLangFields(); });
  syncLangFields();
  f.addEventListener('input', (e) => { if (!['token', 'pw1', 'pw2', 'baseUrl', 'owner', 'repo', 'branch'].includes(e.target.name)) postPreview(); });
  f.addEventListener('change', () => postPreview());
  for (const id of ['logo', 'cover']) bindPhoto(id, id === 'logo' ? { max: 512, quality: 0.9, alpha: true } : { max: 1600, quality: 0.8 });
  document.getElementById('testBtn').onclick = testConnection;
  f.token.oninput = () => { document.querySelector('#publishBtn span').textContent = t(f.token.value.trim() ? 'publish' : 'publish_local'); };
  document.getElementById('publishBtn').onclick = publish;
  bindQr(document.getElementById('qrPanel'), {
    getConfig: () => { readForm(); return S.config; },
    getBase: () => f.baseUrl.value || defaultBase(),
    pending: S.pending,
    onCount: (n) => { S.config.tables.count = n; },
  });
}
function previewTheme() {
  const f = document.getElementById('f');
  S.config.theme.primary = f.primary.value;
  document.querySelectorAll('#swatches [data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color.toLowerCase() === f.primary.value.toLowerCase()));
  applyTheme(S.config, { admin: true });
  postPreview();
}
// Sends the unsaved form state to the live preview iframe (same origin only).
let pvTimer;
function postPreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    const frame = document.getElementById('preview'); if (!frame?.contentWindow) return;
    readForm();
    const cfg = structuredClone(S.config);
    delete cfg.github;
    if (S.logo.photo) cfg.restaurant.logo = S.logo.photo.url; else if (S.logo.removed) cfg.restaurant.logo = '';
    if (S.cover.photo) cfg.restaurant.cover = S.cover.photo.url; else if (S.cover.removed) cfg.restaurant.cover = '';
    frame.contentWindow.postMessage({ type: 'rm:preview', config: cfg }, location.origin);
  }, 200);
}
addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.type === 'rm:preview-ready') postPreview(); });
function bindPhoto(id, opts) {
  const box = document.getElementById(id); const inputEl = document.getElementById(`${id}File`); const rm = document.querySelector(`[data-rm="${id}"]`);
  box.onclick = () => inputEl.click();
  rm.onclick = () => { S[id] = { photo: null, removed: true }; rm.hidden = true; box.innerHTML = `<div class="photo__empty">${ICONS.image}<span>${esc(t('choose_photo'))}</span></div>`; postPreview(); };
  inputEl.onchange = async () => {
    const file = inputEl.files?.[0]; inputEl.value = ''; if (!file) return;
    try { const p = await compressImage(file, opts); S[id] = { photo: p, removed: false }; box.innerHTML = `<img src="${p.url}" alt="">`; rm.hidden = false; postPreview(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

function readForm() {
  const f = document.getElementById('f'); if (!f) return;
  const c = S.config; const r = c.restaurant; const v = (n) => (f.elements[n]?.value ?? '').trim();
  c.github = { owner: v('owner'), repo: v('repo'), branch: v('branch') || 'main' };
  for (const k of ['name', 'tagline', 'address', 'hours']) r[k] = { ar: v(`${k}.ar`), en: v(`${k}.en`) };
  r.phone = v('phone');
  c.currency = { ar: v('cur.ar'), en: v('cur.en') };
  const lm = f.langs.value;
  c.languages.enabled = lm === 'ar_en' ? ['ar', 'en'] : lm === 'en_only' ? ['en'] : ['ar'];
  c.languages.default = c.languages.enabled.includes(f.defLang.value) ? f.defLang.value : c.languages.enabled[0];
  c.theme = { id: getTheme(themeIdOf(c.theme)).id, primary: f.primary.value, style: c.theme.style === 'glass' ? 'glass' : 'classic' };
  c.tables.count = Math.max(1, Math.min(300, parseInt(v('tables'), 10) || 1));
}

async function testConnection() {
  readForm();
  const f = document.getElementById('f'); const st = document.getElementById('ghStatus'); const btn = document.getElementById('testBtn');
  const token = f.token.value.trim();
  if (!S.config.github.owner || !S.config.github.repo) { st.className = 'status err'; st.textContent = t('fill_github'); return null; }
  if (!token) { st.className = 'status err'; st.textContent = t('token_required'); return null; }
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token)) { st.className = 'status err'; st.textContent = t('token_format'); return null; }
  btn.disabled = true; st.className = 'status'; st.innerHTML = `<span class="spinner"></span>`;
  try {
    const gh = await connectGH(token);
    const [cfg, menu, auth] = await Promise.all([gh.readJSON('data/config.json'), gh.readJSON('data/menu.json'), gh.readJSON('data/auth.json')]);
    S.gh = gh; S.hasAuth = !!auth?.data;
    if (cfg) { const keepGh = S.config.github; S.config = normalizeConfig(cfg); S.config.github = keepGh; }
    if (menu) S.menu = normalizeMenu(menu);
    render();
    const f2 = document.getElementById('f'); f2.token.value = token; f2.token.dispatchEvent(new Event('input'));
    document.getElementById('pwKeep').hidden = !S.hasAuth;
    const st2 = document.getElementById('ghStatus'); st2.className = 'status ok'; st2.innerHTML = `${ICONS.check}${esc(t('connected'))}`;
    return gh;
  } catch (e) {
    st.className = 'status err'; st.textContent = e.status === 401 ? t('token_bad') : e.status === 404 ? t('token_no_repo') : e.message;
    return null;
  } finally { btn.disabled = false; }
}

async function connectGH(token) {
  const gh = new GitHub({ ...S.config.github, token });
  await gh.verify();
  S.gh = gh;
  return gh;
}

async function publish() {
  readForm();
  const f = document.getElementById('f'); const btn = document.getElementById('publishBtn');
  const token = f.token.value.trim(); const pw1 = f.pw1.value; const pw2 = f.pw2.value;
  const c = S.config; const r = c.restaurant;
  if (!r.name.ar && !r.name.en) { toast(`${t('rest_name_ar')}: ${t('required')}`, 'err'); return; }
  if (pw1 || pw2) {
    if (!isStrongPassword(pw1)) { toast(t('pw_weak'), 'err', 4000); return; }
    if (pw1 !== pw2) { toast(t('pw_mismatch'), 'err'); return; }
  }
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${esc(t('saving'))}`;
  try {
    if (!token) { // local preview only
      const draft = structuredClone(c); draft.github = { owner: '', repo: '', branch: 'main' };
      draft.restaurant.logo = await localPhoto(S.logo, r.logo);
      draft.restaurant.cover = await localPhoto(S.cover, r.cover);
      if (!saveDraft.config(draft)) throw new Error('localStorage full');
      if (f.empty.checked) saveDraft.menu({ categories: [], items: [] });
      toast(t('saved_local'));
      showLinks(new URL('../', location.href).href);
      return;
    }
    if (!cryptoAvailable()) throw new Error(t('no_crypto'));
    if (!c.github.owner || !c.github.repo) throw new Error(t('fill_github'));
    const gh = S.gh && S.gh.token === token && S.gh.owner === c.github.owner && S.gh.repo === c.github.repo && S.gh.branch === c.github.branch ? S.gh : await connectGH(token);
    const files = [];
    const auth = await gh.readJSON('data/auth.json');
    if (!auth?.data && !pw1) throw new Error(t('pw_required_first'));
    if (pw1) files.push({ path: 'data/auth.json', text: toJSONText(await encryptSecret(token, pw1)) });
    r.logo = await ghPhoto(S.logo, r.logo, 'logo', files);
    r.cover = await ghPhoto(S.cover, r.cover, 'cover', files);
    files.push({ path: 'data/config.json', text: toJSONText(c) });
    if (f.empty.checked) files.push({ path: 'data/menu.json', text: toJSONText({ updatedAt: new Date().toISOString(), categories: [], items: [] }) });
    await gh.commit('Restaurant setup', files);
    S.logo = { photo: null, removed: false }; S.cover = { photo: null, removed: false };
    f.pw1.value = ''; f.pw2.value = '';
    toast(t('published'), 'ok', 4500);
    showLinks(defaultBase());
  } catch (e) {
    toast(e.message, 'err', 6000);
  } finally { btn.disabled = false; btn.innerHTML = label; }
}
async function localPhoto(st, old) { if (st.photo) return blobToDataURL(st.photo.blob); if (st.removed) return ''; return old; }
async function ghPhoto(st, old, name, files) {
  if (st.photo) {
    const path = `images/brand/${name}-${Date.now().toString(36)}.${st.photo.ext}`;
    files.push({ path, blob: st.photo.blob });
    S.pending[path] = st.photo.url;
    if (old?.startsWith('images/')) files.push({ path: old, delete: true });
    return path;
  }
  if (st.removed) { if (old?.startsWith('images/')) files.push({ path: old, delete: true }); return ''; }
  return old;
}
function showLinks(base) {
  const p = document.getElementById('linksPanel'); p.hidden = false;
  const row = (label, url) => `${`<div class="field"><span>${esc(label)}</span>`}<div class="copy-row"><input class="input" readonly value="${esc(url)}"><button type="button" class="btn btn--ghost" data-copy="${esc(url)}">${ICONS.copy}</button><a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">${ICONS.link}</a></div></div>`;
  p.innerHTML = `<div class="panel__title">${ICONS.link}${esc(t('links'))}</div><div class="stack">${row(t('link_menu'), base)}${row(t('link_admin'), `${base}admin/`)}</div>`;
  p.onclick = async (e) => { const b = e.target.closest('[data-copy]'); if (b) { try { await navigator.clipboard.writeText(b.dataset.copy); toast(t('copied')); } catch {} } };
  document.getElementById('f').baseUrl.value = base;
  p.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

boot();
