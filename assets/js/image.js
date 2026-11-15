// Resizes and compresses photos in the browser before upload (typically 4 MB → ~100 KB).
export async function compressImage(file, { max = 1200, quality = 0.82, alpha = false } = {}) {
  const img = await loadImage(file);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!alpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  let blob = await toBlob(canvas, 'image/webp', quality);
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { // Safari can't encode WebP
    blob = await toBlob(canvas, alpha ? 'image/png' : 'image/jpeg', quality);
    ext = alpha ? 'png' : 'jpg';
  }
  return { blob, ext, width: w, height: h, url: URL.createObjectURL(blob) };
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Invalid image')); };
    img.src = url;
  });
}
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));
export const blobToDataURL = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
