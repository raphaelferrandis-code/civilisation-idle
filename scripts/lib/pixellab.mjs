/**
 * L'ATELIER PIXELLAB — ce que les scripts du pipeline des personnages refaisaient
 * chacun à sa façon (audit 2026-10-05, SCRIPT-11) : aller chercher les images
 * d'une animation, les coller en bande, mesurer le personnage, retirer l'ombre
 * cuite du gabarit de marche.
 *
 * Utilisé par assembleAgentClip, assembleAgentUrls, assembleAgentDance,
 * fetchAgentFlat, fetchAgentIdle et stripBakedShadow. Rien ici n'écrit sur le
 * disque : chaque script garde la main sur ses sorties.
 */
import { PNG } from 'pngjs';

// Fichiers des personnages du compte PixelLab du projet :
//   <CHARACTER_FILES>/<charId>/animations/<animId>/<direction>/<n>.png
// (`animId` = segment lisible dans les URLs de get_character).
export const CHARACTER_FILES = 'https://backblaze.pixellab.ai/file/pixellab-characters/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';

export async function fetchPng(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return PNG.sync.read(Buffer.from(await r.arrayBuffer()));
}

// Les images `from` … `from + count - 1` d'une animation, une direction.
export async function fetchAnimFrames(charId, animId, dir, count, from = 0) {
  const imgs = [];
  for (let n = from; n < from + count; n += 1) imgs.push(await fetchPng(`${CHARACTER_FILES}/${charId}/animations/${animId}/${dir}/${n}.png`));
  return imgs;
}

// Le zip /download d'un personnage (toutes ses animations). HTTP 423 tant qu'UN
// job de fond du personnage pend (2e génération v3, direction re-queuée…) :
// `tries` essais espacés de `waitMs`.
export async function downloadCharacterZip(charId, { tries = 20, waitMs = 15000 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const r = await fetch(`https://api.pixellab.ai/mcp/characters/${charId}/download`);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status !== 423) throw new Error('download HTTP ' + r.status);
    if (i + 1 < tries) await new Promise((res) => setTimeout(res, waitMs));
  }
  throw new Error(tries > 1 ? 'download : 423 trop longtemps (un job pend)'
    : 'download HTTP 423 — un job du personnage pend : réessayer plus tard, ou scripts/assembleAgentUrls.mjs');
}

// Bande HORIZONTALE : les images côte à côte, à la taille de la première.
export function assembleStrip(imgs) {
  const fw = imgs[0].width, fh = imgs[0].height;
  const strip = new PNG({ width: fw * imgs.length, height: fh });
  imgs.forEach((im, i) => PNG.bitblt(im, strip, 0, 0, fw, fh, i * fw, 0));
  return strip;
}

// Rangées extrêmes du personnage dans une image (alpha > 16), pour les journaux
// « perso Npx / canvas » : { top, bot, h }.
export function inkRows(img) {
  let top = -1, bot = -1;
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    if (img.data[(y * img.width + x) * 4 + 3] > 16) { if (top < 0) top = y; bot = y; break; }
  }
  return { top, bot, h: bot - top + 1 };
}

// L'OMBRE CUITE que le gabarit de marche PixelLab colle sous les pieds (gris
// neutre opaque, sur une partie des images seulement). La charte du vivant
// (docs/PLAN-VIVANT.md §3) interdit toute ombre cuite : c'est le jeu qui pose
// l'ombre solaire. Critère : pixel opaque dans les 6 rangées du bas, gris neutre
// (écart max-min des canaux ≤ 24) de luminance moyenne (60-200), ET qui touche le
// VIDE (voisin transparent, par contagion d'un gris à l'autre). L'ombre est posée
// HORS du contour noir ; une basket blanche ombrée de gris est DANS le contour,
// elle ne touche jamais le vide et reste intacte (leçon du 2026-10-02, modernman2).
// Sur place ; rend le nombre de pixels retirés. Une bande de frames carrées H×H
// se traite d'un bloc : ses 6 rangées du bas sont celles de chaque frame.
export function stripShadow(img) {
  const W = img.width, H = img.height, ROWS = 6, d = img.data;
  const at = (x, y) => (y * W + x) * 4;
  const grey = (i) => {
    if (d[i + 3] < 128) return false;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = (r + g + b) / 3;
    return mx - mn <= 24 && lum >= 60 && lum <= 200;
  };
  const empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || d[at(x, y) + 3] < 128;
  let n = 0, changed = true;
  while (changed) {
    changed = false;
    for (let y = Math.max(0, H - ROWS); y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = at(x, y);
      if (!grey(i)) continue;
      if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) {
        d[i + 3] = 0; n += 1; changed = true;
      }
    }
  }
  return n;
}
