// Retrouve la clé de prop (agents/buildings/<clé>.png) de chaque ruine moteur du manifeste.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');
const DIR = 'public/pixelart/agents/buildings';
const man = JSON.parse(fs.readFileSync('maquettes/chute/art/ruines/manifest.json', 'utf8'));
const fnv = (d) => { let h = 2166136261 >>> 0; for (let i = 0; i < d.length; i += 1) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
const bySize = new Map();
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.png')) continue;
  let p; try { p = PNG.sync.read(fs.readFileSync(path.join(DIR, f))); } catch { continue; }
  const k = p.width + 'x' + p.height;
  if (!bySize.has(k)) bySize.set(k, []);
  bySize.get(k).push({ key: f.slice(0, -4), p, h: fnv(p.data) });
}
const out = {};
for (const [hash, e] of Object.entries(man.engines)) {
  const src = PNG.sync.read(fs.readFileSync('maquettes/chute/art/' + (e.file.startsWith('b4/') ? 'src4/' : 'src5/') + path.basename(e.file)));
  const cands = bySize.get(src.width + 'x' + src.height) || [];
  let best = null, bd = Infinity;
  for (const c of cands) {
    if (c.h === hash) { best = c; bd = 0; break; }
    let d = 0;
    for (let i = 0; i < src.data.length; i += 16) d += Math.abs(src.data[i] - c.p.data[i]) + Math.abs(src.data[i + 3] - c.p.data[i + 3]);
    if (d < bd) { bd = d; best = c; }
  }
  out[hash] = { id: e.id, file: e.file, key: best && best.key, dist: bd, exact: bd === 0 };
}
console.log(JSON.stringify(out, null, 1));
