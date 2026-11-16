// Menu QR codes, shared by the setup page and the owner dashboard.
// Every card encodes the same menu link; the table number is only printed on the card.
import qrcode from '../vendor/qrcode.mjs';
import { t, esc, imgSrc, ICONS } from './core.js';
import { getTheme, themeIdOf } from './themes.js';

const field = (label, inner) => `<label class="field"><span>${esc(label)}</span>${inner}</label>`;

export function qrControlsHTML({ count = 10, base = '', showBase = false } = {}) {
  return `<div class="stack">
    ${showBase ? field(t('base_url'), `<input class="input" name="baseUrl" dir="ltr" value="${esc(base)}">`) : ''}
    <div class="qr-range">
      ${field(t('tables_count'), `<input class="input num" name="tables" type="number" min="1" max="300" dir="ltr" inputmode="numeric" value="${count}">`)}
      ${field(t('qr_from'), `<input class="input num" name="qrFrom" type="number" min="1" dir="ltr" inputmode="numeric" value="1">`)}
      ${field(t('qr_to'), `<input class="input num" name="qrTo" type="number" min="1" dir="ltr" inputmode="numeric" value="${count}">`)}
    </div>
    <p class="hint">${esc(t('tables_hint'))}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <label class="check"><input type="checkbox" name="general" checked>${esc(t('qr_general'))}</label>
      <span style="flex:1"></span>
      <button type="button" class="btn btn--outline" data-qr="gen">${ICONS.qr}${esc(t('qr_generate'))}</button>
      <button type="button" class="btn btn--primary" data-qr="print" hidden>${ICONS.print}${esc(t('print'))}</button>
    </div>
    <div class="qr-grid" data-qr="grid"></div>
  </div>`;
}

/**
 * root: element containing the controls. opts.getConfig() → current config,
 * opts.getBase() → site URL, opts.pending → map of not-yet-published image paths to blob URLs,
 * opts.onCount(n) → called when the cards count changes.
 */
export function bindQr(root, { getConfig, getBase, pending = {}, onCount } = {}) {
  const el = (n) => root.querySelector(`[name="${n}"]`);
  const grid = root.querySelector('[data-qr="grid"]');
  const printBtn = root.querySelector('[data-qr="print"]');
  let lastCount = +el('tables').value;
  el('tables').addEventListener('input', () => {
    const n = Math.max(1, Math.min(300, parseInt(el('tables').value, 10) || 1));
    if (+el('qrTo').value === lastCount || +el('qrTo').value > n) el('qrTo').value = n;
    lastCount = n;
  });
  const targets = () => {
    let base = (getBase() || '').trim();
    if (!/^https?:\/\//.test(base)) base = `https://${base}`;
    if (!base.endsWith('/') && !/\.html?$/.test(base)) base += '/';
    const count = Math.max(1, Math.min(300, parseInt(el('tables').value, 10) || 1));
    const from = Math.max(1, Math.min(count, parseInt(el('qrFrom').value, 10) || 1));
    const to = Math.max(from, Math.min(count, parseInt(el('qrTo').value, 10) || count));
    const list = [];
    if (el('general').checked) list.push({ key: 'general', url: base, label: '' });
    for (let i = from; i <= to; i++) list.push({ key: String(i), url: base, label: String(i) });
    return { list, count, from, to };
  };
  root.querySelector('[data-qr="gen"]').onclick = () => {
    const { list, count } = targets();
    grid.innerHTML = list.map((tg) => cardHTML(tg, getConfig(), pending)).join('');
    printBtn.hidden = !list.length;
    onCount?.(count);
  };
  printBtn.onclick = () => printCards(grid);
  grid.onclick = (e) => {
    const b = e.target.closest('[data-dl]'); if (!b) return;
    const tg = targets().list.find((x) => x.key === b.dataset.dl);
    if (tg) downloadPNG(tg, getConfig());
  };
}

function qrFor(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q; }
function qrSVG(q) {
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
const words = (L) => ({
  scan: L.enabled.length > 1 ? ['امسح الرمز لعرض القائمة', 'Scan to view the menu'] : [L.enabled[0] === 'en' ? 'Scan to view the menu' : 'امسح الرمز لعرض القائمة'],
  table: L.enabled.length > 1 ? 'طاولة · Table' : (L.enabled[0] === 'en' ? 'Table' : 'طاولة'),
});
const nameOf = (cfg) => { const r = cfg.restaurant; const L = cfg.languages; return r.name[L.default] || r.name.ar || r.name.en; };

function cardHTML(tg, cfg, pending) {
  const w = words(cfg.languages); const logo = cfg.restaurant.logo || '';
  return `<div class="qr-card" data-key="${tg.key}">
    <button type="button" class="qr-card__dl" data-dl="${tg.key}" title="${esc(t('download_png'))}">${ICONS.download}</button>
    <a class="qr-card__open" href="${esc(tg.url)}" target="_blank" rel="noopener" title="${esc(t('qr_open'))}" aria-label="${esc(t('qr_open'))}">${ICONS.link}</a>
    <div class="qr-card__brand">${logo ? `<span class="mini"><img src="${esc(pending[logo] || imgSrc(logo))}" alt=""></span>` : ''}${esc(nameOf(cfg))}</div>
    <div class="qr-card__qr">${qrSVG(qrFor(tg.url))}</div>
    <div class="qr-card__scan">${w.scan.join('<br>')}</div>
    ${tg.label ? `<div class="qr-card__table"><small>${esc(w.table)}</small><b class="num">${esc(tg.label)}</b></div>` : ''}
  </div>`;
}

function printCards(grid) {
  document.getElementById('printArea')?.remove();
  const area = document.createElement('div'); area.id = 'printArea';
  area.innerHTML = grid.innerHTML;
  document.body.append(area);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); area.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 150);
}

async function downloadPNG(tg, cfg) {
  await document.fonts.ready;
  const W = 1000; const H = 1300; const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'); const primary = cfg.theme.primary || getTheme(themeIdOf(cfg.theme)).primary;
  const w = words(cfg.languages);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = primary; ctx.fillRect(0, 0, W, 24);
  ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.fillStyle = '#1d1a16'; ctx.font = '700 64px Readex, sans-serif'; ctx.fillText(nameOf(cfg), W / 2, 150);
  const q = qrFor(tg.url); const n = q.getModuleCount(); const size = 680; const cell = size / n; const ox = (W - size) / 2; const oy = 200;
  ctx.fillStyle = '#111';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (q.isDark(i, j)) ctx.fillRect(Math.floor(ox + j * cell), Math.floor(oy + i * cell), Math.ceil(cell), Math.ceil(cell));
  ctx.fillStyle = '#6f675e'; ctx.font = '500 38px Readex, sans-serif';
  w.scan.forEach((ln, i) => ctx.fillText(ln, W / 2, oy + size + 64 + i * 48));
  if (tg.label) {
    ctx.fillStyle = '#6f675e'; ctx.font = '600 34px Readex, sans-serif'; ctx.fillText(w.table, W / 2, H - 150);
    ctx.fillStyle = primary; ctx.font = '700 110px Readex, sans-serif';
    ctx.direction = 'ltr'; ctx.fillText(tg.label, W / 2, H - 40);
  }
  const a = document.createElement('a');
  a.download = tg.label ? `table-${tg.label}.png` : 'menu-qr.png';
  a.href = cv.toDataURL('image/png'); a.click();
}
