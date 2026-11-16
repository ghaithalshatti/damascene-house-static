// Encrypts the GitHub token with the owner's password (PBKDF2-SHA256 → AES-256-GCM).
// The encrypted blob is safe to keep in the public repo; a slow KDF makes password guessing expensive.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const ITERATIONS = 1_000_000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const cryptoAvailable = () => !!(globalThis.crypto && crypto.subtle);

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(secret, password, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: b64(salt), iv: b64(iv), data: b64(ct), th: await tokenHash(secret) };
}

// Short fingerprint of the token (not reversible) so setup can tell when the token changed without the password.
export async function tokenHash(token) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`rm-token:${token}`)));
  return [...h.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Throws on a wrong password (AES-GCM authentication fails).
export async function decryptSecret(blob, password) {
  const key = await deriveKey(password, unb64(blob.salt), blob.iterations || ITERATIONS);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.data));
  return dec.decode(pt);
}

export const isStrongPassword = (p) => typeof p === 'string' && p.length >= 10 && /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p);
