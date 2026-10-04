// L'équipage des planches de bateaux (boatVitrine, boatPlanche) : le même calcul que
// boatKit.drawCrew, sur un PNG au lieu d'un canvas — le sprite de l'habitant de l'ère
// (bande pleine ou -half, frame 0, plus proche voisin) à la taille du jeu au zoom Z,
// puis effacé là où le masque de la cuisson dit que le bateau passe devant.
import { PNG } from 'pngjs';
import fs from 'node:fs';
import { crewSpec, crewDir } from '../src/game/map/iso/boatCrew.js';
import { agentSetForBand } from '../src/game/map/agents.js';

const ISO_DIAG = ['southeast', 'northwest', 'southwest', 'northeast'];
const SCALE = new Map();
for (let b = 0; b <= 9; b += 1) {
  const set = agentSetForBand(b);
  for (const s of [...set.men, ...set.women, set.child]) SCALE.set(s.name, s.scale);
}
const _png = new Map();
function strip(name, dir, half) {
  const f = `public/pixelart/agents/inhabitants/${name}-${ISO_DIAG[dir]}${half ? '-half' : ''}.png`;
  if (!_png.has(f)) _png.set(f, fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null);
  return _png.get(f);
}
// Ligne de pieds mesurée (agents.agentFootF) : dernière rangée opaque / hauteur.
function footF(p) {
  for (let y = p.height - 1; y >= 0; y -= 1) for (let x = 0; x < p.width; x += 1) if (p.data[(y * p.width + x) * 4 + 3] > 16) return (y + 1) / p.height;
  return 0.88;
}

// out = PNG de la planche (W×H), (cx, cy) = origine du bateau dans la planche, b = la
// cuisson (bakeBoat), M = le modèle, Z = zoom entier de la planche.
export function compositeCrew(out, b, M, band, cx, cy, Z) {
  const W = out.width, H = out.height;
  for (const cr of b.crew || []) {
    const sp = crewSpec(band, M, cr), name = sp.name, dir = crewDir(cr.phi);
    const full = strip(name, dir, false);
    if (!full) continue;
    const drawH = Math.max(1, Math.round(32 * Z * (sp.scale || SCALE.get(name) || 0.7) * 0.5));
    const half = strip(name, dir, true);
    const p = half && drawH <= full.height * 0.7 ? half : full;
    const fh = p.height;
    const fF = footF(full);
    const fx = cx + cr.X * Z, fy = cy + cr.Y * Z;
    const left = Math.round(fx - drawH / 2), top = Math.round(fy - fF * drawH);
    for (let v = 0; v < drawH; v += 1) for (let u = 0; u < drawH; u += 1) {
      const sx = Math.floor(((u + 0.5) * fh) / drawH), sy = Math.floor(((v + 0.5) * fh) / drawH);
      const s = (sy * p.width + sx) * 4;
      if (p.data[s + 3] < 128) continue;
      const X = left + u, Y = top + v;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      // Masque : pixel d'art de la cuisson sous ce pixel de planche.
      const mi = Math.floor((X - cx) / Z) - cr.x0, mj = Math.floor((Y - cy) / Z) - cr.y0;
      if (mi >= 0 && mj >= 0 && mi < cr.w && mj < cr.h && cr.mask[mj * cr.w + mi]) continue;
      const o = (Y * W + X) * 4;
      out.data[o] = p.data[s]; out.data[o + 1] = p.data[s + 1]; out.data[o + 2] = p.data[s + 2];
    }
  }
}
