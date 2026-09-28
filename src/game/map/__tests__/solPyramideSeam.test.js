// LE TRAIT D'UN PIXEL ENTRE DEUX TUILES DU SOL — garde du correctif du 2026-09-28.
//
// Raph voyait « souvent » une ligne verticale d'un pixel traverser tout le sol :
// une colonne où aucune tuile de la pyramide n'était posée (le fond hors-monde
// transparaissait). Chaque tuile arrondissait SA position écran ; avec un canevas
// de largeur IMPAIRE (le sien : 1 765 px) la caméra quantifiée pose toutes les
// tuiles pile sur un demi-pixel, et le bruit flottant du zoom (non dyadique à
// 1,25 / 1,375 / 1,5…) faisait arrondir deux voisines en sens contraires.
//
// Ce test rejoue EXACTEMENT la chaîne de la frame : caméra quantifiée comme
// drawIsoWorld, camSpace, tileSideCss, puis la position de drawPart — et exige
// que deux tuiles voisines se touchent au pixel device près, sans trou ni
// recouvrement, sur des milliers de caméras. Vérifié : il tombe si l'on
// revient à l'arrondi tuile par tuile (cf. le témoin en fin de fichier).
import { describe, it, expect } from 'vitest';
import { camSpace, tileSideCss } from '../iso/solPyramide.js';
import { screenOrigin } from '../iso/solPyramideFrame.js';

// La caméra de RENDU, comme drawIsoWorld la pose (quantifiée au pixel device).
function camRendu(camX, camY, z, dpr) {
  const ku = z * dpr, kv = 0.5 * z * dpr;
  const u = Math.round((camX - camY) * ku) / ku, v = Math.round((camX + camY) * kv) / kv;
  return { x: (u + v) / 2, y: (v - u) / 2 };
}
// Écarts (en pixels device) entre la fin d'une tuile et le début de sa voisine,
// pour les deux façons de poser : l'origine arrondie une fois (le correctif) ou
// chaque tuile arrondie à part (l'ancien calcul).
function ecarts(cw, ch, dpr, z, n, parTuile) {
  const S = tileSideCss(dpr, z);
  const snap = (v) => Math.round(v * dpr) / dpr;
  let graine = 7;
  const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let trous = 0, recouvrements = 0;
  for (let i = 0; i < n; i += 1) {
    const cam = camRendu(alea() * 4000, alea() * 4000, z, dpr);
    const c = camSpace(cam.x, cam.y, z);
    const org = screenOrigin(c, cw, ch, dpr);
    const posX = (x) => (parTuile ? snap(x - c.x + cw / 2) : snap(x + org.x));
    const posY = (y) => (parTuile ? snap(y - c.y + ch / 2) : snap(y + org.y));
    const tx0 = Math.floor((c.x - cw / 2) / S), ty0 = Math.floor((c.y - ch / 2) / S);
    for (let k = 0; k < 8; k += 1) {
      for (const [a, b] of [[posX((tx0 + k) * S), posX((tx0 + k + 1) * S)], [posY((ty0 + k) * S), posY((ty0 + k + 1) * S)]]) {
        const d = Math.round((b - (a + S)) * dpr);
        if (d > 0) trous += 1; else if (d < 0) recouvrements += 1;
      }
    }
  }
  return { trous, recouvrements };
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.375, 1.5, 1.625, 2, 2.5, 3];

describe('sol en tuiles — deux tuiles voisines se touchent toujours', () => {
  it('canevas impair (celui de Raph, 1 765 × 1 162, dpr 1) : aucun trou, aucun recouvrement', () => {
    for (const z of ZOOMS) expect(ecarts(1765, 1162, 1, z, 1500, false)).toEqual({ trous: 0, recouvrements: 0 });
  });

  it('dpr fractionnaire et hauteur impaire en device (1 600 × 900 à dpr 1,25) : idem', () => {
    for (const z of ZOOMS) expect(ecarts(1600, 900, 1.25, z, 1500, false)).toEqual({ trous: 0, recouvrements: 0 });
  });

  it('témoin : l’ancien arrondi tuile par tuile ouvrait bien des trous (sinon ce test ne prouve rien)', () => {
    let trous = 0;
    for (const z of ZOOMS) trous += ecarts(1765, 1162, 1, z, 1500, true).trous;
    expect(trous).toBeGreaterThan(0);
  });
});
