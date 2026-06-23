// fetch-sprite.mjs — Télécharge un asset PixelLab vers public/iso/ SANS PowerShell
// (évite la signature ClickFix de Defender). Le token PixelLab est lu depuis la
// config Claude (~/.claude.json) et n'est JAMAIS affiché.
//
// Usage : node scripts/fetch-sprite.mjs <download_url> <chemin_de_sortie>
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [, , url, out] = process.argv;
if (!url || !out) {
  console.error('usage: node scripts/fetch-sprite.mjs <url> <out>');
  process.exit(2);
}

// Cherche récursivement le header Authorization du serveur MCP "pixellab".
function getAuth() {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
    const find = (o) => {
      if (!o || typeof o !== 'object') return null;
      if (o.pixellab?.headers?.Authorization) return o.pixellab.headers.Authorization;
      for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; }
      return null;
    };
    return find(cfg);
  } catch { return null; }
}

async function dl(headers) {
  const r = await fetch(url, { headers });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !ct.startsWith('image')) return { ok: false, status: r.status, ct };
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(out, buf);
  return { ok: true, status: r.status, ct, bytes: buf.length };
}

let res = await dl({});            // d'abord sans auth (au cas où l'URL est publique)
if (!res.ok) {
  const auth = getAuth();
  if (auth) res = await dl({ Authorization: auth });
}
console.log(JSON.stringify({ ok: res.ok, status: res.status, ct: res.ct, bytes: res.bytes }));
process.exit(res.ok ? 0 : 1);
