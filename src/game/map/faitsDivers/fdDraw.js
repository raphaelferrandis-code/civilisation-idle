"use strict";

// LES FAITS DIVERS — poser un décor, poser un personnage (docs/PLAN-FAITS-DIVERS.md).
//
// Les décors sont les dessins de fdArt.js, cuits une fois puis posés au grain des
// maisons (vieK, comme la petite vie). Les personnages sont les HABITANTS de l'âge
// (même dessin, même taille, même ombre que les passants : drawNamedAgentIso) — une
// scène ne se distingue pas par son trait mais par ce qu'elle fait.
// Chaque personnage et chaque chose cliquable se signale (fdPick.noteFait) avec la
// boîte qu'il occupe à l'écran : c'est ce que vise le clic.
import { CM } from '../layout.js';
import { worldToScreen } from '../iso/projection.js';
import { vieK, vieBlit, vieRing } from '../iso/isoVie.js';
import { decodeRows } from '../iso/vieArt.js';
import { agentSetForBand, agentSpecFor, drawNamedAgentIso, AGENT_SCALE } from '../agents.js';
import { snapDev } from '../blitSnap.js';
import { FD_ART, FD_PAL } from './fdArt.js';
import { noteFait, fdMark } from './fdPick.js';

// ── LES DÉCORS ───────────────────────────────────────────────────────────────
const cache = new Map();
function toCanvas(sp) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = sp.w; cv.height = sp.h;
  const g = cv.getContext('2d');
  const im = g.createImageData(sp.w, sp.h);
  im.data.set(sp.data);
  g.putImageData(im, 0, 0);
  return cv;
}
// Image `fi` de la planche `name` ({ cv, w, h, foot }), regard à droite (flip : miroir).
export function fdSprite(name, fi = 0, flip = false) {
  const def = FD_ART[name];
  if (!def) return null;
  const n = def.frames.length;
  const f = ((fi % n) + n) % n;
  const key = name + '|' + f + '|' + (flip ? 1 : 0);
  let e = cache.get(key);
  if (e !== undefined) return e;
  const sp = decodeRows(def.frames[f], { flip, pal: FD_PAL });
  const cv = toCanvas(sp);
  e = cv ? { cv, w: sp.w, h: sp.h, foot: def.foot ?? sp.h - 1 } : null;
  cache.set(key, e);
  return e;
}
// Pose un décor, pied au point monde (wx, wy). Rend sa boîte écran (pour la visée),
// ou null s'il n'a pas été peint.
export function fdBlit(ctx, name, fi, wx, wy, alpha = 1, flip = false, lift = 0) {
  const spr = fdSprite(name, fi, flip);
  if (!spr) return null;
  const k = vieK();
  const p = worldToScreen(wx, wy);
  const y = p.y - lift * k;
  if (!vieBlit(ctx, spr, p.x, y, k, alpha)) return null;
  const W = spr.w * k, H = spr.h * k;
  const top = y - (spr.foot + 1) * k;
  return { x0: p.x - W / 2, x1: p.x + W / 2, y0: top, y1: top + H, cx: p.x, cy: y };
}
// Pose un décor à un point ÉCRAN (ce qu'un personnage tient à la main : le poulet,
// la lanterne). Rend sa boîte écran, ou null.
export function fdBlitScreen(ctx, name, fi, sx, sy, alpha = 1, flip = false) {
  const spr = fdSprite(name, fi, flip);
  if (!spr) return null;
  const k = vieK();
  if (!vieBlit(ctx, spr, sx, sy, k, alpha)) return null;
  const W = spr.w * k, H = spr.h * k, top = sy - (spr.foot + 1) * k;
  return { x0: sx - W / 2, x1: sx + W / 2, y0: top, y1: top + H };
}
// Un pixel d'art isolé, au grain des décors.
export function fdPixel(ctx, x, y, rgb, alpha = 1) {
  if (alpha <= 0.01) return;
  const d = CM.dpr || 1, K = Math.round(vieK() * d);
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
  ctx.fillRect(Math.round(x * d - K / 2) / d, Math.round(y * d - K / 2) / d, K / d, K / d);
}

// ── LES PERSONNAGES ──────────────────────────────────────────────────────────
// `f` = { wx, wy, ct, variant, dir, walk, phase, dist, sit } ; `band` = l'âge du
// costume. Rend { x, y, top, h } (pieds et tête à l'écran) ou null.
//   ct    0 homme, 1 femme, 2 enfant
//   dir   direction MONDE 0 est, 1 ouest, 2 sud, 3 nord (vue diagonale)
//   sit   assis par terre : le dessin descend et ses jambes passent sous le sol
//         (un découpage, pas un dessin de plus — les habitants n'ont que la marche)
export function fdFigure(ctx, f, band, now, alpha = 1) {
  const set = agentSetForBand(band);
  const spec = agentSpecFor(set, f.ct === 1 || f.ct === 2 ? f.ct : 0, f.variant | 0);
  if (!spec || !CM.cam) return null;
  const z = CM.cam.zoom;
  const p0 = worldToScreen(f.wx, f.wy);
  // `lift` (pixels d'art) : assis DANS quelque chose (la jarre de Diogène), il monte.
  const p = f.lift ? { x: p0.x, y: p0.y - f.lift * vieK() } : p0;
  const drawH = Math.max(1, snapDev(CM.TILE * z * spec.scale * AGENT_SCALE));
  const mark = fdMark(f);
  if (mark) vieRing(ctx, p.x, p.y, Math.max(3, Math.round(drawH * 0.3 / vieK())), vieK(), mark === 2 ? 0.95 : 0.55, mark === 2 ? [255, 227, 154] : [232, 181, 74]);
  const pa = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = pa * alpha;
  let d;
  if (f.sit) {
    // `sink` : la part du dessin qui passe sous le sol (0,3 = assis ; la sieste dans le
    // blé n'en laisse dépasser que la tête).
    const drop = Math.round(drawH * (f.sink || 0.3));
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x - drawH, p.y - drawH * 2, drawH * 2, drawH * 2 + Math.round(drawH * 0.04));
    ctx.clip();
    d = drawNamedAgentIso(ctx, p.x, p.y + drop, z, spec.name, spec.scale, f.dir | 0, false, now, f.phase || 0, 1, null, true);
    ctx.restore();
    if (d) d = { drawW: d.drawW, drawH: d.drawH * (1 - (f.sink || 0.3)), top: d.top };
  } else {
    d = drawNamedAgentIso(ctx, p.x, p.y, z, spec.name, spec.scale, f.dir | 0, !!f.walk, now, f.phase || 0, 1, f.walk && f.dist != null ? f.dist : null, true);
  }
  ctx.globalAlpha = pa;
  if (!d) return null;
  const box = { x0: p.x - d.drawW * 0.28, x1: p.x + d.drawW * 0.28, y0: d.top + d.drawH * 0.03, y1: f.sit ? p.y : d.top + d.drawH * 0.91 };
  // `mute` : un figurant (la foule du baptême, les ancêtres du musicien) — peint, pas cliquable.
  if (!f.mute) noteFait(f, box);
  return { x: p.x, y: p.y, top: d.top, h: d.drawH, w: d.drawW };
}

// Le ruban rouge de Nancy et William : deux pixels d'art à hauteur de poignet.
export function fdRibbon(ctx, fig, side = 1) {
  if (!fig) return;
  const k = vieK();
  // Collé au flanc (un pixel d'art plus loin, il flottait à côté d'elle).
  const x = fig.x + side * fig.w * 0.11;
  const y = fig.top + fig.h * 0.53;
  fdPixel(ctx, x, y, [206, 34, 40]);
  fdPixel(ctx, x, y + k, [150, 22, 30]);
}

// Une chose cliquable (le Feu, la tortue…) : sa boîte de décor, signalée.
export function fdNoteThing(t, box) {
  if (box) noteFait(t, box);
}
