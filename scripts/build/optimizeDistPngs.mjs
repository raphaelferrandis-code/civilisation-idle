// Passe de fin de build : recompresse sans perte tous les PNG d'un dossier de
// SORTIE (dist/), en parallèle. Appelée par le plugin `dist-finish` de
// vite.config.js — donc par `npm run build`, `npm run dist-win` (qui appelle
// `vite build` directement), Netlify et la CI d'un même geste (ASSET-1).
//
// ⚠ Jamais sur public/ : cf. l'en-tête de pngRecompress.mjs.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

function listPngs(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listPngs(p));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out;
}

// → { files, before, after, ms } (octets avant / après).
export async function optimizeDistPngs(dir, { workers = Math.max(1, Math.min(availableParallelism() - 1, 12)) } = {}) {
  const t0 = Date.now();
  const files = listPngs(dir);
  const totals = { files: files.length, before: 0, after: 0, ms: 0 };
  if (!files.length) return totals;
  const workerPath = fileURLToPath(new URL('./pngWorker.mjs', import.meta.url));
  const pool = Array.from({ length: Math.min(workers, files.length) }, () => new Worker(workerPath));
  let next = 0;
  try {
    await Promise.all(pool.map((w) => new Promise((resolve, reject) => {
      const feed = () => {
        if (next >= files.length) { resolve(); return; }
        const id = next++;
        w.postMessage({ id, file: files[id] });
      };
      w.on('message', ({ before, after }) => {
        totals.before += before;
        totals.after += after;
        feed();
      });
      w.on('error', reject);
      feed();
    })));
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
  totals.ms = Date.now() - t0;
  return totals;
}
