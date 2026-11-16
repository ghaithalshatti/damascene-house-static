// Customer menu (view only): browse, search, item details and restaurant info.
import {
  loadSite, normalizeConfig, deepMerge, initLang, setLang, getLang, t, tx, formatPrice, esc, imgSrc, applyTheme,
  ICONS, TAGS, normalizeSearch, openSheet,
} from './core.js';

const params = new URLSearchParams(location.search);
const PREVIEW = params.get('preview') === '1'; // used by the setup page's live preview

const app = document.getElementById('app');
const S = { config: null, menu: null, draft: false, langs: [], lockSpy: 0 };
let itemSheet, infoSheet;

/* ---------- boot ---------- */
async function boot() {
  try {
    const d = await loadSite();
    Object.assign(S, { config: d.config, menu: d.menu, draft: d.draft });
  } catch (e) {
    console.error(e);
    initLang({});
    app.innerHTML = `<div class="empty" style="min-height:80vh;align-content:center">${ICONS.alert}<p>${esc(t('error_load'))}</p>
      <button class="btn btn--primary" onclick="location.reload()">${esc(t('retry'))}</button></div>`;
    return;
  }
  if (PREVIEW && params.get('skin')) S.config.theme = { id: params.get('skin'), primary: params.get('primary') || '', style: params.get('style') || 'classic' };
  applyTheme(S.config);
  S.langs = initLang(S.config);
  [itemSheet, infoSheet] = ['itemSheet', 'infoSheet'].map((id) => {
    const el = document.createElement('div'); el.className = 'sheet'; el.id = id; el.hidden = true; document.body.append(el); return el;
  });
  render();
  bindGlobal();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(setupObservers, 200); });
  if (PREVIEW) {
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'rm:preview') return;
      S.config = normalizeConfig(deepMerge(S.config, e.data.config));
      applyTheme(S.config); S.langs = initLang(S.config); render();
    });
    parent.postMessage({ type: 'rm:preview-ready' }, location.origin);
  }
}

/* ---------- helpers ---------- */
const fmt = (n) => formatPrice(n, S.config);
const findItem = (id) => S.menu.items.find((i) => i.id === id);
const findCat = (id) => S.menu.categories.find((c) => c.id === id);
const visibleItems = () => S.menu.items.filter((i) => i.available && findCat(i.categoryId));
function catsWithItems() {
  const items = visibleItems();
  return S.menu.categories.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) })).filter((c) => c.items.length);
}
const minPrice = (it) => (it.sizes.length ? Math.min(...it.sizes.map((s) => s.price)) : it.price);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const initial = (r) => { const n = (tx(r.name) || '•').trim().replace(/^ال/, ''); return esc(n.charAt(0)); };
const logoInner = (r) => (r.logo ? `<img src="${esc(imgSrc(r.logo))}" alt="">` : initial(r));
const mediaHTML = (it, icon) => (it.image ? `<img src="${esc(imgSrc(it.image))}" alt="${esc(tx(it.name))}" loading="lazy" decoding="async">` : `<div class="ph">${esc(icon || '🍽️')}</div>`);
const tagsHTML = (tags, cls = 'card__tags') => (tags?.length ? `<div class="${cls}">${tags.filter((k) => TAGS[k]).map((k) => `<span class="chip chip--${k}">${ICONS[TAGS[k].icon]}${esc(t(TAGS[k].key))}</span>`).join('')}</div>` : '');
function priceLabel(it) {
  return it.sizes.length
    ? `<small>${esc(t('from'))}</small><span class="num">${esc(fmt(minPrice(it)))}</span>`
    : `<span class="num">${esc(fmt(it.price))}</span>`;
}

/* ---------- render ---------- */
function render() {
  const r = S.config.restaurant;
  const cats = catsWithItems();
  document.title = `${tx(r.name)} · ${t('menu_word')}`;
  const social = socialLinks(r);
  app.innerHTML = `
    <header class="hero ${r.cover ? 'hero--cover' : ''}" id="hero" ${r.cover ? `style="--cover:url('${esc(imgSrc(r.cover))}')"` : ''}>
      <div class="hero__bg"></div>
      <div class="hero__top wrap" style="width:100%">
        <span class="spacer"></span>
        ${S.langs.length > 1 ? `<button class="glass-btn" id="langBtn">${ICONS.globe}<span>${esc(t('lang_switch'))}</span></button>` : ''}
        <button class="glass-btn" id="infoBtn" aria-label="${esc(t('info'))}">${ICONS.info}</button>
      </div>
      <div class="hero__brand wrap" style="width:100%">
        ${r.logo ? `<div class="logo">${logoInner(r)}</div>` : ''}
        <div style="min-width:0">
          <h1 class="hero__name">${esc(tx(r.name))}</h1>
          ${tx(r.tagline) ? `<p class="hero__tag">${esc(tx(r.tagline))}</p>` : ''}
          ${tx(r.hours) ? `<div class="hero__meta"><span class="glass-btn">${ICONS.clock}${esc(tx(r.hours))}</span></div>` : ''}
        </div>
      </div>
    </header>
    <div class="shell wrap">
    <div class="bar" id="bar">
      <div class="search">
        ${r.logo ? `<span class="bar__logo mini-logo">${logoInner(r)}</span>` : ''}
        <label class="search__box">${ICONS.search}
          <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(t('search_ph'))}" aria-label="${esc(t('search'))}">
          <button class="search__clear" id="qClear" hidden aria-label="${esc(t('close'))}">${ICONS.close}</button>
        </label>
      </div>
      <nav class="cats" id="cats">${cats.map((c, i) => `<button class="cat ${i === 0 ? 'active' : ''}" data-cat="${c.id}"><span class="cat__icon">${esc(c.icon)}</span>${esc(tx(c.name))}<span class="cat__n num">${c.items.length}</span></button>`).join('')}</nav>
    </div>
    <main id="main">
      ${cats.map((c) => `
        <section class="sec" id="sec-${c.id}" data-cat="${c.id}">
          <h2 class="sec__title"><span class="sec__icon">${esc(c.icon)}</span>${esc(tx(c.name))}<span class="sec__count">${esc(t('items_count', { n: c.items.length }))}</span></h2>
          <div class="items">${c.items.map((it, ix) => cardHTML(it, c, ix)).join('')}</div>
        </section>`).join('')}
      <div class="empty" id="noResults" hidden>${ICONS.search}<p>${esc(t('no_results'))}</p></div>
    </main>
    </div>
    <footer class="foot wrap">
      ${social ? `<div class="socials">${social}</div>` : ''}
      <div>© ${new Date().getFullYear()} ${esc(tx(r.name))}</div>
      ${S.config.poweredBy?.name ? `<a class="credit" href="${esc(safeUrl(S.config.poweredBy.url) || '#')}" target="_blank" rel="noopener">${esc(t('powered_by'))} · ${esc(S.config.poweredBy.name)}</a>` : ''}
    </footer>
  `;
  setupObservers();
}

function cardHTML(it, c, ix) {
  const hay = normalizeSearch([it.name.ar, it.name.en, it.description.ar, it.description.en].join(' '));
  return `<article class="card" data-id="${esc(it.id)}" data-search="${esc(hay)}" style="animation-delay:${Math.min(ix, 8) * 45}ms">
    <div class="card__body">
      <h3 class="card__name">${esc(tx(it.name))}</h3>
      ${tx(it.description) ? `<p class="card__desc">${esc(tx(it.description))}</p>` : ''}
      ${tagsHTML(it.tags)}
      <div class="card__price">${priceLabel(it)}</div>
    </div>
    <div class="card__media">
      <div class="media">${mediaHTML(it, c.icon)}</div>
    </div>
  </article>`;
}

function socialLinks(r) {
  const s = r.social || {};
  return [['instagram', s.instagram], ['facebook', s.facebook], ['tiktok', s.tiktok], ['link', s.website]]
    .filter(([, u]) => safeUrl(u))
    .map(([ic, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${ic}">${ICONS[ic]}</a>`).join('');
}

/* ---------- events ---------- */
function bindGlobal() {
  app.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) { openItem(card.dataset.id); return; }
    const cat = e.target.closest('.cat');
    if (cat) { scrollToCat(cat.dataset.cat); return; }
    if (e.target.closest('#langBtn')) { switchLang(); return; }
    if (e.target.closest('#infoBtn')) { openInfo(); return; }
    if (e.target.closest('#qClear')) { e.preventDefault(); const q = document.getElementById('q'); q.value = ''; filter(''); q.focus(); }
  });
  app.addEventListener('input', (e) => { if (e.target.id === 'q') filter(e.target.value); });
}

function switchLang() {
  const i = S.langs.indexOf(getLang());
  setLang(S.langs[(i + 1) % S.langs.length]);
  render();
}

/* ---------- sticky bar + scroll spy ---------- */
let spyObs, heroObs;
function setupObservers() {
  spyObs?.disconnect(); heroObs?.disconnect();
  const bar = document.getElementById('bar');
  const hero = document.getElementById('hero');
  heroObs = new IntersectionObserver(([en]) => bar.classList.toggle('stuck', !en.isIntersecting), { rootMargin: '-60px 0px 0px 0px' });
  heroObs.observe(hero);
  const barH = () => stickyOffset();
  spyObs = new IntersectionObserver((entries) => {
    if (Date.now() < S.lockSpy) return;
    const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (vis) setActiveCat(vis.target.dataset.cat);
  }, { rootMargin: `-${barH()}px 0px -55% 0px` });
  document.querySelectorAll('.sec').forEach((s) => { s.style.scrollMarginTop = `${barH()}px`; spyObs.observe(s); });
}
const isDesktop = () => matchMedia('(min-width: 1024px)').matches;
const stickyOffset = () => (isDesktop() ? 24 : document.getElementById('bar').offsetHeight + 12);
function setActiveCat(id) {
  const nav = document.getElementById('cats');
  nav?.querySelectorAll('.cat').forEach((b) => {
    const on = b.dataset.cat === id;
    b.classList.toggle('active', on);
    if (on) {
      if (isDesktop()) { b.scrollIntoView({ block: 'nearest' }); return; }
      const nr = nav.getBoundingClientRect(); const br = b.getBoundingClientRect();
      nav.scrollBy({ left: br.left - nr.left - (nr.width - br.width) / 2, behavior: 'smooth' });
    }
  });
}
function scrollToCat(id) {
  const sec = document.getElementById(`sec-${id}`); const bar = document.getElementById('bar');
  if (!sec) return;
  S.lockSpy = Date.now() + 900;
  setActiveCat(id);
  window.scrollTo({ top: sec.getBoundingClientRect().top + scrollY - (isDesktop() ? 24 : bar.offsetHeight - 2), behavior: 'smooth' });
}

/* ---------- search ---------- */
function filter(raw) {
  const q = normalizeSearch(raw);
  const terms = q.split(/\s+/).filter(Boolean);
  document.getElementById('qClear').hidden = !q;
  document.getElementById('cats').hidden = !!q;
  let any = false;
  document.querySelectorAll('.sec').forEach((sec) => {
    let n = 0;
    sec.querySelectorAll('.card').forEach((c) => {
      const ok = !terms.length || terms.every((tm) => c.dataset.search.includes(tm));
      c.hidden = !ok; if (ok) n++;
    });
    sec.hidden = !n; if (n) any = true;
  });
  document.getElementById('noResults').hidden = any;
  if (q) window.scrollTo({ top: document.getElementById('main').getBoundingClientRect().top + scrollY - stickyOffset() });
}

/* ---------- item sheet ---------- */
function openItem(id) {
  const it = findItem(id); if (!it) return;
  const cat = findCat(it.categoryId);
  itemSheet.innerHTML = `<div class="sheet__panel item-sheet" role="dialog" aria-modal="true" aria-label="${esc(tx(it.name))}">
    <div class="item-media"><div class="media" style="height:100%">${mediaHTML(it, cat?.icon)}</div>
      <button class="icon-btn close-fab" data-close aria-label="${esc(t('close'))}">${ICONS.close}</button></div>
    <div class="sheet__body">
      ${cat ? `<div class="item__cat">${esc(cat.icon)} ${esc(tx(cat.name))}</div>` : ''}
      <h2 class="item__name">${esc(tx(it.name))}</h2>
      ${it.sizes.length ? '' : `<div class="item__price">${priceLabel(it)}</div>`}
      ${tagsHTML(it.tags, 'item__tags')}
      ${tx(it.description) ? `<p class="item__desc">${esc(tx(it.description))}</p>` : ''}
      ${it.sizes.length ? `<div class="block"><div class="block__title">${esc(t('sizes_prices'))}</div><div class="sizes">
        ${it.sizes.map((s) => `<div class="size size--view"><span>${esc(tx(s.name))}</span><b class="num">${esc(fmt(s.price))}</b></div>`).join('')}
      </div></div>` : ''}
    </div>
  </div>`;
  openSheet(itemSheet);
}

/* ---------- info sheet ---------- */
function openInfo() {
  const r = S.config.restaurant;
  const map = safeUrl(r.mapUrl);
  const social = socialLinks(r);
  infoSheet.innerHTML = `<div class="sheet__panel" role="dialog" aria-modal="true">
    <div class="sheet__grip"></div>
    <div class="sheet__head"><div class="info-head">${r.logo ? `<div class="logo">${logoInner(r)}</div>` : ''}<div><h2>${esc(tx(r.name))}</h2>${tx(r.tagline) ? `<p class="hint">${esc(tx(r.tagline))}</p>` : ''}</div></div>
      <button class="icon-btn" data-close aria-label="${esc(t('close'))}">${ICONS.close}</button></div>
    <div class="sheet__body">
      ${tx(r.hours) ? `<div class="info-row"><span class="info-row__icon">${ICONS.clock}</span><div><small>${esc(t('hours'))}</small><b>${esc(tx(r.hours))}</b></div></div>` : ''}
      ${r.phone ? `<a class="info-row" href="tel:${esc(r.phone.replace(/[^\d+]/g, ''))}"><span class="info-row__icon">${ICONS.phone}</span><div><small>${esc(t('phone'))}</small><b class="num">${esc(r.phone)}</b></div></a>` : ''}
      ${tx(r.address) ? `<${map ? `a href="${esc(map)}" target="_blank" rel="noopener"` : 'div'} class="info-row"><span class="info-row__icon">${ICONS.pin}</span><div><small>${esc(t('address'))}</small><b>${esc(tx(r.address))}</b>${map ? `<small style="color:var(--primary);margin-top:2px">${esc(t('open_map'))}</small>` : ''}</div></${map ? 'a' : 'div'}>` : ''}
      ${social ? `<div style="margin-top:18px"><div class="label" style="margin-bottom:10px">${esc(t('follow_us'))}</div><div class="socials" style="justify-content:flex-start">${social}</div></div>` : ''}
    </div></div>`;
  openSheet(infoSheet);
}

boot();
