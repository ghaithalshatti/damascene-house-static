// Minimal GitHub REST client. Writes go through the Git Data API so each save is ONE atomic commit
// (menu.json + new images + removed images together).
export class GitHub {
  constructor({ owner, repo, branch = 'main', token, apiBase }) {
    this.owner = owner; this.repo = repo; this.branch = branch || 'main'; this.token = token;
    this.api = (apiBase || localStorage.getItem('rm:apiBase') || 'https://api.github.com').replace(/\/$/, '');
    this.queue = Promise.resolve();
  }
  async req(path, { method = 'GET', body, raw = false } = {}) {
    const url = path.startsWith('http') ? path : `${this.api}/repos/${this.owner}/${this.repo}${path ? '/' + path : ''}`;
    const r = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      let msg = `${r.status}`;
      try { const j = await r.json(); msg = `${r.status} ${j.message || ''}`.trim(); } catch {}
      const err = new Error(msg); err.status = r.status; throw err;
    }
    if (r.status === 204) return null;
    return raw ? r.text() : r.json();
  }
  // Checks the token can write to the repo.
  async verify() {
    const info = await this.req('');
    if (info.permissions && !info.permissions.push) { const e = new Error('Token has no write access'); e.status = 403; throw e; }
    // The repo answer shows the USER's rights; a tiny blob write proves the TOKEN itself can write (Contents: Read and write).
    await this.req('git/blobs', { method: 'POST', body: { content: '', encoding: 'utf-8' } });
    if (!this.branch) this.branch = info.default_branch;
    return info;
  }
  async readText(path) {
    try { return await this.req(`contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`, { raw: true }); }
    catch (e) { if (e.status === 404) return null; throw e; }
  }
  async readJSON(path) { const s = await this.readText(path); return s == null ? null : JSON.parse(s); }
  rawUrl(path) { return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`; }

  /**
   * files: [{ path, text }] | [{ path, blob }] | [{ path, delete: true }]
   * Commits are serialized so rapid saves never conflict with each other.
   */
  commit(message, files) {
    const run = () => this._commit(message, files);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
  async _commit(message, files, attempt = 0) {
    const ref = await this.req(`git/ref/heads/${encodeURIComponent(this.branch)}`);
    const baseSha = ref.object.sha;
    const base = await this.req(`git/commits/${baseSha}`);
    const tree = [];
    for (const f of files) {
      if (f.delete) { tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const body = f.blob
        ? { content: await blobToBase64(f.blob), encoding: 'base64' }
        : { content: f.text, encoding: 'utf-8' };
      const b = await this.req('git/blobs', { method: 'POST', body });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
    }
    let newTree;
    try {
      newTree = await this.req('git/trees', { method: 'POST', body: { base_tree: base.tree.sha, tree } });
    } catch (e) {
      // Deleting a path that no longer exists fails; retry without deletions.
      const keep = tree.filter((x) => x.sha !== null);
      if (keep.length === tree.length || !keep.length) throw e;
      newTree = await this.req('git/trees', { method: 'POST', body: { base_tree: base.tree.sha, tree: keep } });
    }
    const c = await this.req('git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [baseSha] } });
    try {
      await this.req(`git/refs/heads/${encodeURIComponent(this.branch)}`, { method: 'PATCH', body: { sha: c.sha } });
    } catch (e) {
      if (e.status === 422 && attempt < 2) return this._commit(message, files, attempt + 1); // branch moved: rebase on latest
      throw e;
    }
    return c.sha;
  }
}
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}
export const toJSONText = (o) => `${JSON.stringify(o, null, 2)}\n`;
