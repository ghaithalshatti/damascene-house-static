// Owner dashboard: sign in with a password, edit the menu, publish to GitHub in one click.
import {
  loadSite, fetchJSON, isRepoConfigured, normalizeConfig, normalizeMenu, saveDraft, initLang, setLang, getLang,
  t, tx, esc, imgSrc, applyTheme, formatPrice, uid, normalizeSearch, ICONS, TAGS, ls,
  toast, openSheet, closeSheet, confirmDialog,
} from './core.js';
import { GitHub, toJSONText } from './github.js';
import { decryptSecret, encryptSecret, cryptoAvailable, isStrongPassword } from './crypto.js';
import { compressImage, blobToDataURL } from './image.js';
import { qrControlsHTML, bindQr } from './qr.js';

const app = document.getElementById('app');
const A = { config: null, menu: null, mode: 'local', gh: null, token: '', tab: 'items', cat: 'all', q: '', pending: new Map() };
const EMOJIS = ['🍽️', '🥙', '🌯', '🍔', '🍕', '🍟', '🍗', '🍖', '🥩', '🍢', '🍤', '🐟', '🥗', '🥘', '🍲', '🍝', '🍜', '🍛', '🍚', '🥟', '🍳', '🥞', '🥐', '🥖', '🧀', '🥪', '🌮', '🫓', '🍰', '🎂', '🧁', '🍩', '🍪', '🍨', '🍮', '🍫', '🍉', '🍓', '🥤', '🧃', '☕', '🍵', '🧋', '🥛', '🍹', '🍋', '🌶️', '🥜', '🫒', '🍱'];
const TABS = [['items', 'list', 'tab_items'], ['categories', 'grid', 'tab_categories'], ['info', 'store', 'tab_info'], ['settings', 'settings', 'tab_settings']];

const tokenKey = () => `rm:tok:${A.config.github.owner}/${A.config.github.repo}`;
const contentLangs = () => (A.config.languages?.enabled?.length ? A.config.languages.enabled : ['ar', 'en']);
const multiLang = () => contentLangs().length > 1;
const toNum = (s) => Number(String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d.]/g, '')) || 0;
const fmt = (n) => formatPrice(n, A.config);
const catOf = (id) => A.menu.categories.find((c) => c.id === id);

/* ---------- boot ---------- */
async function boot() {
  try {
    const s = await loadSite();
    A.config = s.config; A.menu = s.menu;
  } catch (e) {
    app.innerHTML = `<div class="login"><div class="login__card"><p class="err-msg">${esc(e.message)}</p></div></div>`;
    return;
  }
  applyTheme(A.config, { admin: true });
  initLang(A.config); // single-language restaurants get no language switch
  A.mode = isRepoConfigured(A.config) ? 'github' : 'local';
  if (A.mode === 'local') return enterDashboard();
  let saved = ls.get(tokenKey());
  if (!saved) { try { saved = JSON.parse(sessionStorage.getItem(tokenKey()) || 'null'); } catch { saved = null; } }
  if (saved) {
    try { await connect(saved); return enterDashboard(); } catch (e) { if (e.status === 401 || e.status === 403) ls.del(tokenKey()); }
  }
  renderLogin();
}

// Latest auth.json straight from the repo (public read, no token) so a new password works immediately;
// falls back to the published copy.
async function freshAuth() {
  const g = A.config.github;
  try {
    const api = (localStorage.getItem('rm:apiBase') || 'https://api.github.com').replace(/\/$/, '');
    const r = await fetch(`${api}/repos/${g.owner}/${g.repo}/contents/data/auth.json?ref=${encodeURIComponent(g.branch || 'main')}&v=${Date.now()}`, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j?.data) return j; }
  } catch {}
  return fetchJSON('data/auth.json').catch(() => ({}));
}

async function connect(token) {
  const g = A.config.github;
  const gh = new GitHub({ owner: g.owner, repo: g.repo, branch: g.branch, token });
  await gh.verify();
  const [m, c] = await Promise.all([gh.readJSON('data/menu.json'), gh.readJSON('data/config.json')]);
  A.gh = gh; A.token = token;
  if (m) A.menu = normalizeMenu(m);
  if (c) A.config = normalizeConfig(c);
  applyTheme(A.config, { admin: true });
}

/* ---------- images ---------- */
function imgTag(path, alt = '') {
  if (!path) return '';
  const pending = A.pending.get(path);
  const raw = A.gh && !/^(data:|blob:|https?:)/.test(path) ? A.gh.rawUrl(path) : '';
  return `<img src="${esc(pending || imgSrc(path))}" alt="${esc(alt)}" loading="lazy" ${raw ? `onerror="this.onerror=null;this.src='${esc(raw)}'"` : ''}>`;
}
const logoHTML = () => (A.config.restaurant.logo ? imgTag(A.config.restaurant.logo) : esc((tx(A.config.restaurant.name) || '•').replace(/^ال/, '').charAt(0)));

/* ---------- persistence ---------- */
async function persist(message, { menu = false, config = false, add = [], remove = [], auth = null } = {}) {
  if (A.mode === 'local') {
    let ok = true;
    if (menu) ok = saveDraft.menu(A.menu) && ok;
    if (config) ok = saveDraft.config(A.config) && ok;
    if (!ok) { toast(t('save_failed', { e: 'localStorage full' }), 'err', 5000); throw new Error('quota'); }
    toast(t('saved_local'));
    return;
  }
  const files = [...add];
  remove.filter((p) => p && p.startsWith('images/')).forEach((p) => files.push({ path: p, delete: true }));
  if (menu) { A.menu.updatedAt = new Date().toISOString(); files.push({ path: 'data/menu.json', text: toJSONText(A.menu) }); }
  if (config) files.push({ path: 'data/config.json', text: toJSONText(A.config) });
  if (auth) files.push({ path: 'data/auth.json', text: toJSONText(auth) });
  setSaving(true);
  try {
    await A.gh.commit(message, files);
    toast(t('saved_live'));
  } catch (e) {
    toast(t('save_failed', { e: e.message }), 'err', 6000);
    throw e;
  } finally { setSaving(false); }
}
let savingCount = 0;
function setSaving(on) {
  savingCount += on ? 1 : -1;
  document.getElementById('saving')?.classList.toggle('show', savingCount > 0);
}
let saveTimer = null; let saveMsgs = [];
function scheduleSave(msg) {
  saveMsgs.push(msg);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const m = saveMsgs.length > 1 ? `Update menu (${saveMsgs.length} changes)` : saveMsgs[0];
    saveMsgs = [];
    persist(m, { menu: true }).catch(() => {});
  }, 900);
}

/* ---------- login ---------- */
function renderLogin(err = '') {
  const r = A.config.restaurant;
  app.innerHTML = `<div class="login"><form class="login__card" id="loginForm" autocomplete="on">
    <div class="login__logo">${logoHTML()}</div>
    <h1>${esc(tx(r.name))}</h1>
    <p class="sub">${esc(t('login_sub'))}</p>
    <input type="text" name="username" value="${esc(A.config.github.repo)}" autocomplete="username" hidden>
    <div class="pw"><input class="input" type="password" id="pw" autocomplete="current-password" placeholder="${esc(t('password'))}" required>
      <button type="button" id="pwEye" aria-label="show">${ICONS.eye}</button></div>
    <label class="check"><input type="checkbox" id="remember" checked>${esc(t('remember'))}</label>
    <div class="err-msg" id="err">${esc(err)}</div>
    <button class="btn btn--primary btn--block" id="loginBtn">${ICONS.lock}<span>${esc(t('login'))}</span></button>
    ${multiLang() ? `<button type="button" class="btn btn--ghost btn--sm lang-mini" id="langBtn">${ICONS.globe}${esc(t('lang_switch'))}</button>` : ''}
  </form></div>`;
  const f = document.getElementById('loginForm');
  document.getElementById('pwEye').onclick = () => { const p = document.getElementById('pw'); p.type = p.type === 'password' ? 'text' : 'password'; };
  document.getElementById('langBtn')?.addEventListener('click', () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); renderLogin(); });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn'); const errEl = document.getElementById('err');
    const pw = document.getElementById('pw').value;
    if (!pw) return;
    if (!cryptoAvailable()) { errEl.textContent = t('no_crypto'); return; }
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span><span>${esc(t('checking'))}</span>`;
    errEl.textContent = '';
    try {
      const auth = await freshAuth();
      if (!auth?.data) throw new Error(t('not_setup'));
      let token;
      try { token = await decryptSecret(auth, pw); } catch { throw new Error(t('wrong_password')); }
      await connect(token);
      if (document.getElementById('remember').checked) ls.set(tokenKey(), token);
      else sessionStorage.setItem(tokenKey(), JSON.stringify(token));
      enterDashboard();
    } catch (ex) {
      errEl.textContent = ex.message;
      btn.disabled = false; btn.innerHTML = `${ICONS.lock}<span>${esc(t('login'))}</span>`;
    }
  };
}

/* ---------- shell ---------- */
function enterDashboard() {
  document.title = `${t('admin_title')} · ${tx(A.config.restaurant.name)}`;
  app.innerHTML = `
    <header class="adm-top"><div class="adm-wrap">
      <div class="adm-top__row">
        <div class="adm-brand"><div class="adm-brand__logo" id="brandLogo">${logoHTML()}</div>
          <div style="min-width:0"><b id="brandName">${esc(tx(A.config.restaurant.name))}</b><small>${esc(t('admin_title'))}</small></div></div>
        <div class="adm-actions">
          <a class="icon-btn" href="../" target="_blank" rel="noopener" title="${esc(t('view_menu'))}" aria-label="${esc(t('view_menu'))}">${ICONS.eye}</a>
          ${multiLang() ? `<button class="icon-btn" id="langBtn" title="${esc(t('lang_switch'))}">${ICONS.globe}</button>` : ''}
          ${A.mode === 'github' ? `<button class="icon-btn" id="logoutBtn" title="${esc(t('logout'))}" aria-label="${esc(t('logout'))}">${ICONS.logout}</button>` : ''}
        </div>
      </div>
      <nav class="tabs">${TABS.map(([id, ic, key]) => `<button class="tab ${A.tab === id ? 'active' : ''}" data-tab="${id}">${ICONS[ic]}${esc(t(key))}</button>`).join('')}</nav>
    </div></header>
    <main class="adm-wrap adm-main" id="main"></main>
    <button class="fab" id="fab" hidden></button>
    <div class="saving" id="saving"><span class="spinner"></span>${esc(t('saving'))}</div>`;
  app.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { A.tab = b.dataset.tab; enterDashboard(); scrollTo(0, 0); } };
  document.getElementById('langBtn')?.addEventListener('click', () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); enterDashboard(); });
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    if (!(await confirmDialog(`${t('logout')}?`, { okText: t('logout') }))) return;
    ls.del(tokenKey()); sessionStorage.removeItem(tokenKey()); A.gh = null; A.token = ''; renderLogin();
  });
  const fab = document.getElementById('fab');
  if (A.tab === 'items') { fab.hidden = false; fab.innerHTML = `${ICONS.plus}${esc(t('add_item'))}`; fab.onclick = () => openItemEditor(); }
  if (A.tab === 'categories') { fab.hidden = false; fab.innerHTML = `${ICONS.plus}${esc(t('add_category'))}`; fab.onclick = () => openCategoryEditor(); }
  ({ items: renderItems, categories: renderCategories, info: renderInfo, settings: renderSettings })[A.tab]();
}
const refreshBrand = () => {
  const l = document.getElementById('brandLogo'); if (l) l.innerHTML = logoHTML();
  const n = document.getElementById('brandName'); if (n) n.textContent = tx(A.config.restaurant.name);
};

/* ---------- items tab ---------- */
function renderItems() {
  const main = document.getElementById('main');
  const cats = A.menu.categories;
  if (A.cat !== 'all' && !catOf(A.cat)) A.cat = 'all';
  main.innerHTML = `<div class="stats" id="stats">${statsHTML()}</div><div class="toolbar">
      <label class="search__box">${ICONS.search}<input id="q" type="search" autocomplete="off" value="${esc(A.q)}" placeholder="${esc(t('search_ph'))}"></label>
      <div class="filter" id="filter">${[['all', t('all')], ...cats.map((c) => [c.id, `${c.icon} ${tx(c.name)}`])].map(([id, l]) => `<button data-cat="${esc(id)}" class="${A.cat === id ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
    </div><div id="groups"></div>`;
  renderGroups();
  main.oninput = (e) => { if (e.target.id === 'q') { A.q = e.target.value; renderGroups(); } };
  main.onclick = (e) => {
    const c = e.target.closest('[data-cat]');
    if (c && c.closest('#filter')) { A.cat = c.dataset.cat; main.querySelectorAll('#filter button').forEach((b) => b.classList.toggle('active', b === c)); renderGroups(); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openItemEditor(ed.dataset.edit); return; }
    if (e.target.closest('#goCats')) { A.tab = 'categories'; enterDashboard(); }
  };
  main.onchange = (e) => {
    const av = e.target.closest('[data-avail]'); if (!av) return;
    const it = A.menu.items.find((i) => i.id === av.dataset.avail); if (!it) return;
    it.available = av.checked;
    const row = av.closest('.row'); row.classList.toggle('off', !it.available);
    row.querySelector('.badge-off').hidden = it.available;
    document.getElementById('stats').innerHTML = statsHTML();
    scheduleSave(`${it.available ? 'Show' : 'Hide'}: ${tx(it.name)}`);
  };
}
function statsHTML() {
  const total = A.menu.items.length; const on = A.menu.items.filter((i) => i.available).length;
  const card = (cls, ic, n, key) => `<div class="stat stat--${cls}"><span class="stat__ic">${ICONS[ic]}</span><div><b class="num">${n}</b><small>${esc(t(key))}</small></div></div>`;
  return card('total', 'list', total, 'stat_total') + card('on', 'check', on, 'stat_avail') + card('off', 'eye', total - on, 'stat_hidden') + card('cats', 'grid', A.menu.categories.length, 'stat_cats');
}
function itemPriceText(it) { return it.sizes.length ? it.sizes.map((s) => Number(s.price).toLocaleString('en-US')).join(' / ') : fmt(it.price); }
function rowHTML(it) {
  const c = catOf(it.categoryId);
  return `<div class="row ${it.available ? '' : 'off'}" data-id="${esc(it.id)}">
    <span class="row__drag" title="${esc(t('drag_hint'))}">${ICONS.drag}</span>
    <div class="row__thumb">${it.image ? imgTag(it.image) : esc(c?.icon || '🍽️')}</div>
    <div class="row__main" data-edit="${esc(it.id)}"><div class="row__name">${esc(tx(it.name))}</div>
      <div class="row__sub"><span class="price num">${esc(itemPriceText(it))}</span><span class="badge-off" ${it.available ? 'hidden' : ''}>${esc(t('hidden_note'))}</span></div></div>
    <label class="switch" title="${esc(t('available'))}"><input type="checkbox" data-avail="${esc(it.id)}" ${it.available ? 'checked' : ''} aria-label="${esc(t('available'))}"><span class="switch__track"></span></label>
    <button class="icon-btn" data-edit="${esc(it.id)}" aria-label="${esc(t('edit'))}">${ICONS.edit}</button>
  </div>`;
}
function renderGroups() {
  const box = document.getElementById('groups'); if (!box) return;
  const cats = A.menu.categories;
  if (!cats.length) {
    box.innerHTML = `<div class="empty">${ICONS.grid}<p>${esc(t('need_category'))}</p><button class="btn btn--primary" id="goCats">${ICONS.plus}${esc(t('add_category'))}</button></div>`;
    return;
  }
  const terms = normalizeSearch(A.q).split(/\s+/).filter(Boolean);
  const match = (it) => { const h = normalizeSearch(`${it.name.ar} ${it.name.en}`); return terms.every((x) => h.includes(x)); };
  const shown = A.cat === 'all' ? cats : cats.filter((c) => c.id === A.cat);
  let html = shown.map((c) => {
    let items = A.menu.items.filter((i) => i.categoryId === c.id);
    if (terms.length) { items = items.filter(match); if (!items.length) return ''; }
    return `<section class="group"><div class="group__head">${esc(c.icon)} ${esc(tx(c.name))}<small>${esc(t('items_total', { n: items.length }))}</small></div>
      <div class="rows" data-cat="${esc(c.id)}">${items.length ? items.map(rowHTML).join('') : `<p class="hint" style="padding:6px 4px">${esc(t('empty_items'))}</p>`}</div></section>`;
  }).join('');
  if (!html.trim()) html = `<div class="empty">${ICONS.search}<p>${esc(t('no_results'))}</p></div>`;
  box.innerHTML = html;
  if (!terms.length && window.Sortable) {
    box.querySelectorAll('.rows').forEach((el) => window.Sortable.create(el, {
      handle: '.row__drag', animation: 180, draggable: '.row',
      onEnd: () => {
        const catId = el.dataset.cat;
        const ids = [...el.querySelectorAll('.row')].map((r) => r.dataset.id);
        const others = A.menu.items.filter((i) => i.categoryId !== catId);
        const mine = ids.map((id) => A.menu.items.find((i) => i.id === id)).filter(Boolean);
        A.menu.items = [...others, ...mine];
        scheduleSave('Reorder items');
      },
    }));
  }
}

/* ---------- item editor ---------- */
function makeSheet() { const s = document.createElement('div'); s.className = 'sheet'; s.hidden = true; document.body.append(s); s.addEventListener('sheet:closed', () => setTimeout(() => s.remove(), 350)); return s; }
const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${esc(label)}</span>${inner}</label>`;

function photoBlock(id, path, { cls = '', label } = {}) {
  return `<div class="photo ${cls}" id="${id}" role="button" tabindex="0">${path ? imgTag(path) : `<div class="photo__empty">${ICONS.image}<span>${esc(label || t('choose_photo'))}</span></div>`}</div>
    <input type="file" accept="image/*" id="${id}File" hidden>
    <div class="photo-actions" id="${id}Actions" ${path ? '' : 'hidden'}>
      <button type="button" class="btn btn--ghost btn--sm" data-photo-change="${id}">${ICONS.image}${esc(t('change_photo'))}</button>
      <button type="button" class="btn btn--danger-ghost btn--sm" data-photo-remove="${id}">${ICONS.trash}${esc(t('remove_photo'))}</button></div>`;
}
// Wires a photo picker; returns state { photo, removed }.
function bindPhoto(root, id, opts) {
  const st = { photo: null, removed: false };
  const box = root.querySelector(`#${id}`); const input = root.querySelector(`#${id}File`); const actions = root.querySelector(`#${id}Actions`);
  const pick = () => input.click();
  box.onclick = pick; box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
  root.querySelector(`[data-photo-change="${id}"]`).onclick = pick;
  root.querySelector(`[data-photo-remove="${id}"]`).onclick = () => {
    st.photo = null; st.removed = true; actions.hidden = true;
    box.innerHTML = `<div class="photo__empty">${ICONS.image}<span>${esc(t('choose_photo'))}</span></div>`;
  };
  input.onchange = async () => {
    const file = input.files?.[0]; input.value = ''; if (!file) return;
    box.insertAdjacentHTML('beforeend', `<div class="photo__busy"><span class="spinner"></span>${esc(t('processing_photo'))}</div>`);
    try {
      st.photo = await compressImage(file, opts);
      st.removed = false;
      box.innerHTML = `<img src="${st.photo.url}" alt="">`;
      actions.hidden = false;
    } catch (e) { box.querySelector('.photo__busy')?.remove(); toast(e.message, 'err'); }
  };
  return st;
}
// Turns a picked photo into a stored path (GitHub) or data URL (local preview).
async function storePhoto(st, oldPath, dir, baseName, add, remove) {
  if (st.photo) {
    if (A.mode === 'local') return blobToDataURL(st.photo.blob);
    const path = `${dir}/${baseName}-${Date.now().toString(36)}.${st.photo.ext}`;
    add.push({ path, blob: st.photo.blob });
    A.pending.set(path, st.photo.url);
    if (oldPath) remove.push(oldPath);
    return path;
  }
  if (st.removed) { if (oldPath) remove.push(oldPath); return ''; }
  return oldPath;
}

function openItemEditor(id = null) {
  if (!A.menu.categories.length) { toast(t('need_category'), 'err'); return; }
  const src = id ? A.menu.items.find((i) => i.id === id) : null;
  const it = structuredClone(src || { id: uid('i'), categoryId: A.cat !== 'all' ? A.cat : A.menu.categories[0].id, name: { ar: '', en: '' }, description: { ar: '', en: '' }, price: 0, sizes: [], image: '', available: true, tags: [] });
  const L = contentLangs();
  const sheet = makeSheet();
  sheet.innerHTML = `<div class="sheet__panel" role="dialog" aria-modal="true">
    <div class="sheet__grip"></div>
    <div class="sheet__head"><h2>${esc(t(id ? 'item_edit' : 'item_new'))}</h2><button class="icon-btn" data-close aria-label="${esc(t('close'))}">${ICONS.close}</button></div>
    <form class="sheet__body stack" id="f" novalidate>
      <div>${photoBlock('ph', it.image)}</div>
      ${L.includes('ar') ? field(t('name_ar'), `<input class="input" name="name_ar" dir="rtl" value="${esc(it.name.ar)}" maxlength="80">`, 'need') : ''}
      ${L.includes('en') ? field(t('name_en'), `<input class="input" name="name_en" dir="ltr" value="${esc(it.name.en)}" maxlength="80">`, L.includes('ar') ? '' : 'need') : ''}
      <div class="grid2">
        ${field(t('category'), `<select class="select" name="cat">${A.menu.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === it.categoryId ? 'selected' : ''}>${esc(c.icon)} ${esc(tx(c.name))}</option>`).join('')}</select>`)}
        ${field(`${t('price')} (${tx(A.config.currency)})`, `<input class="input num" name="price" inputmode="decimal" dir="ltr" value="${it.price || ''}" placeholder="0">`, 'priceField')}
      </div>
      ${L.includes('ar') ? field(t('desc_ar'), `<textarea class="textarea" name="desc_ar" dir="rtl" rows="2" maxlength="300">${esc(it.description.ar)}</textarea>`) : ''}
      ${L.includes('en') ? field(t('desc_en'), `<textarea class="textarea" name="desc_en" dir="ltr" rows="2" maxlength="300">${esc(it.description.en)}</textarea>`) : ''}
      <div class="stack" style="gap:8px"><span class="label">${esc(t('sizes'))}</span><p class="hint">${esc(t('sizes_hint'))}</p>
        <div id="sizes" class="stack" style="gap:8px"></div>
        <button type="button" class="btn btn--outline btn--sm" id="addSize" style="justify-self:start">${ICONS.plus}${esc(t('add_size'))}</button></div>
      <div class="stack" style="gap:8px"><span class="label">${esc(t('tags'))}</span><div class="tag-toggles">
        ${Object.entries(TAGS).map(([k, v]) => `<label class="tag-toggle"><input type="checkbox" name="tag" value="${k}" ${it.tags.includes(k) ? 'checked' : ''}><span>${ICONS[v.icon]}${esc(t(v.key))}</span></label>`).join('')}</div></div>
      <label class="switch" style="justify-content:space-between;padding:12px 14px;border:1.5px solid var(--line);border-radius:14px">
        <span style="font-weight:600">${esc(t('available'))}<br><small class="hint">${esc(t('unavailable'))} = ${esc(t('hidden_note'))}</small></span>
        <input type="checkbox" name="available" ${it.available ? 'checked' : ''}><span class="switch__track"></span></label>
    </form>
    <div class="sheet__foot form-foot">
      ${id ? `<button class="btn btn--danger-ghost" id="del" aria-label="${esc(t('delete'))}">${ICONS.trash}</button>` : ''}
      <button class="btn btn--primary" id="save">${ICONS.check}${esc(t('save'))}</button></div>
  </div>`;
  const f = sheet.querySelector('#f');
  const photo = bindPhoto(sheet, 'ph', { max: 1200, quality: 0.8 });
  const sizesBox = sheet.querySelector('#sizes');
  const renderSizes = () => {
    sizesBox.innerHTML = it.sizes.map((s, i) => `<div class="size-row ${L.length < 2 ? 'one-lang' : ''}" data-i="${i}">
      ${L.includes('ar') ? `<input class="input" data-k="ar" dir="rtl" placeholder="${esc(t('size_name_ar'))}" value="${esc(s.name.ar)}">` : ''}
      ${L.includes('en') ? `<input class="input" data-k="en" dir="ltr" placeholder="${esc(t('size_name_en'))}" value="${esc(s.name.en)}">` : ''}
      <input class="input num" data-k="price" inputmode="decimal" dir="ltr" placeholder="${esc(t('price'))}" value="${s.price || ''}">
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="${esc(t('delete'))}">${ICONS.trash}</button></div>`).join('');
    const pf = f.querySelector('[name="price"]');
    pf.disabled = it.sizes.length > 0;
    if (it.sizes.length) pf.value = '';
  };
  renderSizes();
  sizesBox.oninput = (e) => {
    const row = e.target.closest('.size-row'); if (!row) return;
    const s = it.sizes[+row.dataset.i]; const k = e.target.dataset.k;
    if (k === 'price') s.price = toNum(e.target.value); else s.name[k] = e.target.value;
  };
  sizesBox.onclick = (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { it.sizes.splice(+rm.dataset.rm, 1); renderSizes(); } };
  sheet.querySelector('#addSize').onclick = () => { it.sizes.push({ name: { ar: '', en: '' }, price: 0 }); renderSizes(); sizesBox.querySelector('.size-row:last-child input')?.focus(); };

  sheet.querySelector('#save').onclick = async () => {
    const fd = new FormData(f);
    it.name = { ar: (fd.get('name_ar') ?? it.name.ar).trim(), en: (fd.get('name_en') ?? it.name.en).trim() };
    it.description = { ar: (fd.get('desc_ar') ?? it.description.ar).trim(), en: (fd.get('desc_en') ?? it.description.en).trim() };
    it.categoryId = fd.get('cat');
    it.sizes = it.sizes.filter((s) => (s.name.ar || s.name.en).trim() && s.price > 0);
    it.price = it.sizes.length ? Math.min(...it.sizes.map((s) => s.price)) : toNum(fd.get('price'));
    it.tags = fd.getAll('tag');
    it.available = f.querySelector('[name="available"]').checked;
    f.querySelectorAll('.field').forEach((x) => x.classList.remove('invalid'));
    if (!it.name.ar && !it.name.en) { f.querySelector('.need')?.classList.add('invalid'); toast(t('required'), 'err'); return; }
    if (!it.price) { f.querySelector('.priceField')?.classList.add('invalid'); toast(`${t('price')}: ${t('required')}`, 'err'); return; }
    const btn = sheet.querySelector('#save'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${esc(t('saving'))}`;
    const snapshot = structuredClone(A.menu);
    try {
      const add = []; const remove = [];
      it.image = await storePhoto(photo, src?.image || '', 'images/items', it.id, add, remove);
      if (src) A.menu.items[A.menu.items.indexOf(src)] = it; else A.menu.items.push(it);
      await persist(`${src ? 'Update' : 'Add'} item: ${it.name.ar || it.name.en}`, { menu: true, add, remove });
      closeSheet(sheet);
      if (!src && A.cat !== 'all' && A.cat !== it.categoryId) A.cat = it.categoryId;
      renderItems();
    } catch {
      A.menu = snapshot;
      btn.disabled = false; btn.innerHTML = `${ICONS.check}${esc(t('save'))}`;
    }
  };
  sheet.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmDialog(t('delete_item_q'), { danger: true, okText: t('delete') }))) return;
    const snapshot = structuredClone(A.menu);
    A.menu.items = A.menu.items.filter((i) => i.id !== src.id);
    try { await persist(`Delete item: ${tx(src.name)}`, { menu: true, remove: [src.image] }); closeSheet(sheet); renderItems(); } catch { A.menu = snapshot; }
  });
  openSheet(sheet);
}

/* ---------- categories tab ---------- */
function renderCategories() {
  const main = document.getElementById('main');
  const cats = A.menu.categories;
  main.innerHTML = cats.length ? `<div class="rows" id="catRows">${cats.map((c) => {
    const n = A.menu.items.filter((i) => i.categoryId === c.id).length;
    return `<div class="row" data-id="${esc(c.id)}"><span class="row__drag" title="${esc(t('drag_hint'))}">${ICONS.drag}</span>
      <div class="row__thumb">${esc(c.icon)}</div>
      <div class="row__main" data-edit-cat="${esc(c.id)}"><div class="row__name">${esc(tx(c.name))}</div><div class="row__sub">${esc(t('items_total', { n }))}${contentLangs().length > 1 ? ` · ${esc(getLang() === 'ar' ? c.name.en : c.name.ar)}` : ''}</div></div>
      <button class="icon-btn" data-edit-cat="${esc(c.id)}" aria-label="${esc(t('edit'))}">${ICONS.edit}</button>
      <button class="icon-btn" data-del-cat="${esc(c.id)}" aria-label="${esc(t('delete'))}" style="color:var(--danger)">${ICONS.trash}</button></div>`;
  }).join('')}</div>` : `<div class="empty">${ICONS.grid}<p>${esc(t('need_category'))}</p></div>`;
  main.onclick = async (e) => {
    const ed = e.target.closest('[data-edit-cat]'); if (ed) { openCategoryEditor(ed.dataset.editCat); return; }
    const del = e.target.closest('[data-del-cat]'); if (!del) return;
    const id = del.dataset.delCat;
    if (A.menu.items.some((i) => i.categoryId === id)) { toast(t('cat_not_empty'), 'err', 4000); return; }
    if (!(await confirmDialog(t('delete_cat_q'), { danger: true, okText: t('delete') }))) return;
    const snapshot = structuredClone(A.menu);
    A.menu.categories = A.menu.categories.filter((c) => c.id !== id);
    try { await persist('Delete category', { menu: true }); renderCategories(); } catch { A.menu = snapshot; }
  };
  const rows = document.getElementById('catRows');
  if (rows && window.Sortable) window.Sortable.create(rows, {
    handle: '.row__drag', animation: 180,
    onEnd: () => {
      const ids = [...rows.querySelectorAll('.row')].map((r) => r.dataset.id);
      A.menu.categories = ids.map((id) => catOf(id)).filter(Boolean);
      scheduleSave('Reorder categories');
    },
  });
}

function openCategoryEditor(id = null) {
  const src = id ? catOf(id) : null;
  const c = structuredClone(src || { id: uid('c'), name: { ar: '', en: '' }, icon: '🍽️' });
  const L = contentLangs();
  const sheet = makeSheet();
  sheet.innerHTML = `<div class="sheet__panel" role="dialog" aria-modal="true"><div class="sheet__grip"></div>
    <div class="sheet__head"><h2>${esc(t(id ? 'category_edit' : 'category_new'))}</h2><button class="icon-btn" data-close aria-label="${esc(t('close'))}">${ICONS.close}</button></div>
    <form class="sheet__body stack" id="f" novalidate>
      ${L.includes('ar') ? field(t('name_ar'), `<input class="input" name="ar" dir="rtl" maxlength="40" value="${esc(c.name.ar)}">`, 'need') : ''}
      ${L.includes('en') ? field(t('name_en'), `<input class="input" name="en" dir="ltr" maxlength="40" value="${esc(c.name.en)}">`, L.includes('ar') ? '' : 'need') : ''}
      <div class="stack" style="gap:8px"><span class="label">${esc(t('icon'))}</span>
        <div class="emojis">${EMOJIS.map((e) => `<button type="button" class="${e === c.icon ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div></div>
    </form>
    <div class="sheet__foot form-foot"><button class="btn btn--primary" id="save">${ICONS.check}${esc(t('save'))}</button></div></div>`;
  sheet.querySelector('.emojis').onclick = (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    c.icon = b.dataset.e; sheet.querySelectorAll('.emojis button').forEach((x) => x.classList.toggle('on', x === b));
  };
  sheet.querySelector('#save').onclick = async () => {
    const f = sheet.querySelector('#f');
    c.name = { ar: (f.ar?.value ?? c.name.ar).trim(), en: (f.en?.value ?? c.name.en).trim() };
    if (!c.name.ar && !c.name.en) { f.querySelector('.need')?.classList.add('invalid'); toast(t('required'), 'err'); return; }
    const btn = sheet.querySelector('#save'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${esc(t('saving'))}`;
    const snapshot = structuredClone(A.menu);
    if (src) Object.assign(src, c); else A.menu.categories.push(c);
    try { await persist(`${src ? 'Update' : 'Add'} category: ${c.name.ar || c.name.en}`, { menu: true }); closeSheet(sheet); if (A.tab === 'categories') renderCategories(); }
    catch { A.menu = snapshot; btn.disabled = false; btn.innerHTML = `${ICONS.check}${esc(t('save'))}`; }
  };
  openSheet(sheet);
}

/* ---------- info tab ---------- */
function renderInfo() {
  const main = document.getElementById('main');
  const r = A.config.restaurant; const L = contentLangs();
  const both = (key, lbl, multi = false) => L.map((l) => field(t(`${lbl}_${l}`),
    multi ? `<textarea class="textarea" name="${key}.${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}" rows="2">${esc(getPath(r, `${key}.${l}`))}</textarea>`
      : `<input class="input" name="${key}.${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}" value="${esc(getPath(r, `${key}.${l}`))}">`)).join('');
  main.innerHTML = `<form id="infoForm" novalidate>
    <div class="panel"><div class="panel__title">${ICONS.store}${esc(t('info_identity'))}</div><div class="stack">
      <div class="grid2">${both('name', 'rest_name')}</div>
      <div class="grid2">${both('tagline', 'tagline')}</div>
      <div class="grid2"><div class="field"><span>${esc(t('logo'))}</span>${photoBlock('logo', r.logo, { cls: 'photo--square' })}</div>
        <div class="field"><span>${esc(t('cover'))}</span>${photoBlock('cover', r.cover, { cls: 'photo--wide' })}</div></div>
    </div></div>
    <div class="panel"><div class="panel__title">${ICONS.phone}${esc(t('info_contact'))}</div><div class="stack">
      ${field(t('phone'), `<input class="input num" name="phone" dir="ltr" inputmode="tel" value="${esc(r.phone)}">`)}
      <div class="grid2">${both('address', 'address')}</div>
      <div class="grid2">${both('hours', 'hours')}</div>
      ${field(t('map_url'), `<input class="input" name="mapUrl" dir="ltr" inputmode="url" placeholder="https://maps.google.com/…" value="${esc(r.mapUrl)}">`)}
    </div></div>
    <div class="panel"><div class="panel__title">${ICONS.instagram}${esc(t('info_social'))}</div><div class="grid2">
      ${[['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['website', t('website')]].map(([k, l]) => field(l, `<input class="input" name="social.${k}" dir="ltr" inputmode="url" placeholder="https://" value="${esc(r.social[k] || '')}">`)).join('')}
    </div></div>
    <div class="publish-bar"><button class="btn btn--primary btn--block" id="saveInfo">${ICONS.check}${esc(t('save_info'))}</button></div>
  </form>`;
  const form = document.getElementById('infoForm');
  const logo = bindPhoto(form, 'logo', { max: 512, quality: 0.9, alpha: true });
  const cover = bindPhoto(form, 'cover', { max: 1600, quality: 0.8 });
  form.onsubmit = (e) => e.preventDefault();
  document.getElementById('saveInfo').onclick = async () => {
    const btn = document.getElementById('saveInfo');
    const before = structuredClone(A.config);
    form.querySelectorAll('input[name], textarea[name]').forEach((el) => {
      if (el.type === 'file') return;
      let v = el.value.trim();
      if (/^(mapUrl|social\.)/.test(el.name) && v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
      setPath(A.config.restaurant, el.name, v);
    });
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${esc(t('saving'))}`;
    try {
      const add = []; const remove = [];
      A.config.restaurant.logo = await storePhoto(logo, before.restaurant.logo, 'images/brand', 'logo', add, remove);
      A.config.restaurant.cover = await storePhoto(cover, before.restaurant.cover, 'images/brand', 'cover', add, remove);
      await persist('Update restaurant info', { config: true, add, remove });
      refreshBrand(); renderInfo();
    } catch { A.config = before; btn.disabled = false; btn.innerHTML = `${ICONS.check}${esc(t('save_info'))}`; }
  };
}
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? '' : a[k]), o) ?? '';
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const tgt = ks.reduce((a, k) => (a[k] ??= {}), o); tgt[last] = v; }

/* ---------- settings tab ---------- */
function renderSettings() {
  const main = document.getElementById('main');
  const menuUrl = new URL('../', location.href).href;
  const updated = A.menu.updatedAt ? new Date(A.menu.updatedAt).toLocaleString(getLang() === 'ar' ? 'ar-SY' : 'en-GB') : '—';
  main.innerHTML = `
    ${A.mode === 'github' ? `<form class="panel" id="pwForm" novalidate><div class="panel__title">${ICONS.lock}${esc(t('change_password'))}</div><div class="stack">
      ${field(t('current_password'), `<input class="input" type="password" name="cur" autocomplete="current-password">`)}
      ${field(t('new_password'), `<input class="input" type="password" name="n1" autocomplete="new-password">`)}
      ${field(t('confirm_password'), `<input class="input" type="password" name="n2" autocomplete="new-password">`)}
      <p class="hint">${esc(t('pw_rules'))}</p>
      <button class="btn btn--primary" id="pwBtn">${ICONS.check}${esc(t('change_password'))}</button></div></form>`
    : ''}
    <div class="panel"><div class="panel__title">${ICONS.link}${esc(t('share_title'))}</div>
      <p class="hint" style="margin:-4px 0 12px">${esc(t('share_hint'))}</p>
      <div class="copy-row"><input class="input" readonly value="${esc(menuUrl)}">
        <button type="button" class="btn btn--ghost" id="copyLink" title="${esc(t('copied'))}">${ICONS.copy}</button>
        <a class="btn btn--ghost" href="../" target="_blank" rel="noopener" title="${esc(t('view_menu'))}">${ICONS.eye}</a></div>
      <p class="hint" style="margin-top:10px">${esc(t('last_update'))}: <span class="num">${esc(updated)}</span></p></div>
    <div class="panel" id="qrPanel"><div class="panel__title">${ICONS.qr}${esc(t('s_qr'))}</div>
      ${qrControlsHTML({ count: A.config.tables.count })}</div>`;
  document.getElementById('copyLink').onclick = async () => { try { await navigator.clipboard.writeText(menuUrl); toast(t('copied')); } catch {} };
  bindQr(document.getElementById('qrPanel'), {
    getConfig: () => A.config,
    getBase: () => menuUrl,
    pending: Object.fromEntries(A.pending),
    onCount: (n) => { if (n !== A.config.tables.count) { A.config.tables.count = n; persist('Update tables count', { config: true }).catch(() => {}); } },
  });
  document.getElementById('resetLocal')?.addEventListener('click', async () => {
    if (!(await confirmDialog(t('reset_local_q'), { danger: true }))) return;
    saveDraft.clear(); location.reload();
  });
  const pwForm = document.getElementById('pwForm');
  if (pwForm) pwForm.onsubmit = async (e) => {
    e.preventDefault();
    const { cur, n1, n2 } = Object.fromEntries(new FormData(pwForm));
    if (!isStrongPassword(n1)) { toast(t('pw_weak'), 'err', 4000); return; }
    if (n1 !== n2) { toast(t('pw_mismatch'), 'err'); return; }
    const btn = document.getElementById('pwBtn'); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${esc(t('checking'))}`;
    try {
      const auth = await A.gh.readJSON('data/auth.json');
      let tok; try { tok = await decryptSecret(auth, cur); } catch { throw new Error(t('wrong_password')); }
      const blob = await encryptSecret(tok, n1);
      await persist('Change dashboard password', { auth: blob });
      toast(t('pw_changed')); pwForm.reset();
    } catch (ex) { if (ex.message === t('wrong_password')) toast(ex.message, 'err'); }
    btn.disabled = false; btn.innerHTML = `${ICONS.check}${esc(t('change_password'))}`;
  };
}

boot();
