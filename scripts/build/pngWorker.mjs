// Ouvrier de optimizeDistPngs.mjs : reçoit un chemin de PNG (dans dist/),
// le remplace par sa version recompressée sans perte, rend les deux tailles.
// Écriture par fichier temporaire + rename : un ouvrier tué en pleine écriture
// laisse l'ancien PNG intact, jamais un fichier tronqué.
import { parentPort } from 'node:worker_threads';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { recompressPng } from './pngRecompress.mjs';

parentPort.on('message', ({ id, file }) => {
  let before = 0, after = 0;
  try {
    const buf = readFileSync(file);
    before = after = buf.length;
    const out = recompressPng(buf);
    if (out) {
      writeFileSync(file + '.tmp', out);
      renameSync(file + '.tmp', file);
      after = out.length;
    }
  } catch {
    // Illisible ou disque refusé : l'original reste, le build continue.
  }
  parentPort.postMessage({ id, before, after });
});
