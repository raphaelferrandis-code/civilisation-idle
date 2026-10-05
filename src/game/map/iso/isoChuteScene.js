// LA CHUTE — le peintre d'un bâtiment qui tombe (docs/PLAN-CHUTE.md).
//
// Appelé par les peintres du jeu quand chuteTileState(t) n'est pas nul :
//   - habitations : isoLivePaint (branche maisons) → paintHouseFall ;
//   - scènes moteur : isoEngineScene → paintEngineFall.
// Trois états : SECOUÉE (le sprite debout décalé d'un pixel de sprite, quelques
// images), RUINE (la ruine dessinée, cadrée et teinte comme le sprite debout), et par-
// dessus, la POUSSIÈRE (iso/chuteDust.js), qui part pendant la secousse et couvre la
// bascule. Une ruine n'a ni fenêtres allumées, ni ombre portée, ni lueur de feu.
//
// Module à part (et non dans isoChute.js) : les peintres l'importent, le metteur en
// scène aussi — aucun cycle.
import { CM } from '../layout.js';
import { pixelHouseSprite, pixelHouseRuin } from '../pixelHouses.js';
import { drawEngineSprite } from '../engineSprites.js';
import { ENGINE_RUIN } from '../cityEngineSprites.js';
import { suspendFlameGlow } from '../flameGlow.js';
import { suspendLightLayer } from '../lightLayer.js';
import { muteSunShadow } from './isoSunShadow.js';
import { CHUTE, chuteHash } from './chuteState.js';
import { dustFrame } from './chuteDust.js';

const bandNow = () => (CM.layout && CM.layout.counts ? CM.layout.counts.eraBand | 0 : 0);
// Le noir de la chute est OPAQUE (paintChuteFade, « par-dessus tout ») : sous lui,
// rien de ce qui suit ne se voit — on ne le peint pas (et la poussière ne remplit
// plus son cache pendant que la carte attend la stèle).
const underBlack = () => CHUTE.fade >= 1;

// Le nuage d'un bâtiment : pied au centre du pied (cx, by), emprise wSpr×hSpr en px
// de sprite, posé à l'échelle k (px écran par px de sprite) — le grain du bâtiment.
function drawDust(ctx, t, cx, by, wSpr, hSpr, k, f) {
  if (f < 0) return;
  const fr = dustFrame(wSpr, hSpr, chuteHash('poussiere:' + t.gx + ':' + t.gy), bandNow(), f);
  if (!fr || !fr.c) return;
  // Le nuage est rangé recadré sur son encre : sa part se pose dans le cadre de
  // l'image PLEINE (W×H) arrondi comme avant, à la même échelle — chaque pixel
  // écran reprend le pixel du nuage qu'il prenait dans l'image pleine.
  const X = Math.round(cx - fr.ax * k), Y = Math.round(by - fr.ay * k);
  const sx = Math.round(fr.W * k) / fr.W, sy = Math.round(fr.H * k) / fr.H;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fr.c, X + fr.x0 * sx, Y + fr.y0 * sy, fr.c.width * sx, fr.c.height * sy);
  ctx.imageSmoothingEnabled = prev;
}

// HABITATION. (x, y, w, h) = la boîte-lot du peintre (cf. isoLivePaint). Renvoie la
// boîte écran pour le survol, ou null si le sprite n'est pas prêt.
export function paintHouseFall(ctx, t, x, y, w, h, st) {
  const g = pixelHouseSprite(t, x, y, w, h);
  if (!g) return null;
  if (underBlack()) return { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh };
  const k = g.dw / g.bb.w;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (st.ph === 'shake') {
    ctx.drawImage(g.img, g.bb.x0, g.bb.y0, g.bb.w, g.bb.h,
      g.dx + Math.round(st.ox * k), g.dy + Math.round(st.oy * k), g.dw, g.dh);
  } else {
    const r = pixelHouseRuin(t, x, y, w, h);
    if (r) ctx.drawImage(r.img, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
  }
  ctx.imageSmoothingEnabled = prev;
  drawDust(ctx, t, g.dx + g.dw / 2, g.dy + g.dh, g.bb.w, g.bb.h, k, st.dust);
  return { dx: g.dx, dy: g.dy, dw: g.dw, dh: g.dh };
}

// Contexte MUET : la scène s'y dessine en entier sans que rien n'en sorte (un
// canvas d'un pixel) ; seules les ruines de ses bâtiments vont sur le vrai contexte.
let muteCanvas = null;
function muteCtx() {
  if (!muteCanvas && typeof document !== 'undefined') {
    muteCanvas = document.createElement('canvas');
    muteCanvas.width = 1; muteCanvas.height = 1;
  }
  return muteCanvas ? muteCanvas.getContext('2d') : null;
}

// Dessine la scène `t` en RUINE dans la boîte (bx, by, bw) : chaque bâtiment qu'elle
// blitte devient sa ruine sur `ctx` (null = nulle part : on ne fait que relever).
// `rec` (facultatif) reçoit les ruines dessinées. Renvoie true si la scène s'est
// dessinée en entier (aucune image de ruine en route, aucune exception).
export function drawEngineRuin(ctx, t, bx, by, bw, aNow, rec = null) {
  const mute = muteCtx();
  if (!mute) return false;
  const prevCtx = CM.ctx;
  CM.ctx = mute;
  ENGINE_RUIN.on = true; ENGINE_RUIN.ctx = ctx || mute; ENGINE_RUIN.rec = rec; ENGINE_RUIN.miss = false;
  suspendFlameGlow(true); suspendLightLayer(true);
  let whole = true;
  try { muteSunShadow(() => drawEngineSprite(t, bx, by, bw, bw, aNow)); } catch { whole = false; /* scène capricieuse : rien */ }
  finally {
    CM.ctx = prevCtx;
    if (ENGINE_RUIN.miss) whole = false;
    ENGINE_RUIN.on = false; ENGINE_RUIN.ctx = null; ENGINE_RUIN.rec = null; ENGINE_RUIN.miss = false;
    suspendFlameGlow(false); suspendLightLayer(false);
  }
  return whole;
}

// Les ruines relevées d'une scène, redessinées telles que blitRuin les a posées
// (cityEngineSprites.js) : même toile, même rectangle arrondi, même ordre.
function replayRuins(ctx, list) {
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const r of list) ctx.drawImage(r.src, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
  ctx.imageSmoothingEnabled = prev;
}
// Deux relevés donnent-ils les mêmes pixels ?
function sameRuins(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i], q = b[i];
    if (p.src !== q.src || Math.round(p.x) !== Math.round(q.x) || Math.round(p.y) !== Math.round(q.y)
      || Math.round(p.w) !== Math.round(q.w) || Math.round(p.h) !== Math.round(q.h)) return false;
  }
  return true;
}

// SCÈNE MOTEUR. Renvoie la boîte de survol.
// En ruine, une scène ne bouge plus : ses ruines sont relevées au dessin puis
// REJOUÉES tant que sa boîte ne bouge pas, au lieu de redessiner toute la scène
// (logique, gens, feux) dans le contexte muet à chaque frame. Un relevé n'est
// rejoué qu'une fois VÉRIFIÉ — deux dessins de suite à la même boîte ont donné les
// mêmes ruines, sans image manquante ; une caméra qui bouge (recentrage, recul de
// fin de vague) redessine et revérifie. Mémo sur la tuile, valable pour CETTE chute.
export function paintEngineFall(ctx, t, bx, by, bw, aNow, st) {
  if (underBlack()) return { dx: bx, dy: by, dw: bw, dh: bw };
  if (st.ph === 'shake') {
    // Debout, secouée : la scène telle quelle, décalée — le grain d'une scène
    // n'est pas connu ici, un pixel de sprite y vaut ~bw/112.
    const k = Math.max(1, Math.round(bw / 112));
    drawEngineSprite(t, bx + st.ox * k, by + st.oy * k, bw, bw, aNow);
    // Le pied du nuage : mesuré sur la ruine (dessin muet), une seule fois par tuile.
    if (!t._chuteFoot) {
      const probe = [];
      drawEngineRuin(null, t, bx, by, bw, aNow, probe);
      t._chuteFoot = footOf(probe, bx, by, bw);
    }
  } else {
    const m = t._chuteRuin;
    const sameBox = !!m && m.fall === CHUTE.fall && m.bx === bx && m.by === by && m.bw === bw;
    if (sameBox && m.ok) replayRuins(ctx, m.list);
    else {
      const rec = [];
      const whole = drawEngineRuin(ctx, t, bx, by, bw, aNow, rec);
      if (rec.length) t._chuteFoot = footOf(rec, bx, by, bw);
      t._chuteRuin = whole ? { fall: CHUTE.fall, bx, by, bw, list: rec, ok: sameBox && sameRuins(m.list, rec) } : null;
    }
  }
  const f = t._chuteFoot;
  if (f) drawDust(ctx, t, bx + f.cx * bw, by + f.by * bw, f.w, f.h, f.k * bw, st.dust);
  return { dx: bx, dy: by, dw: bw, dh: bw };
}

// Le pied et l'emprise (px de sprite) du plus gros bâtiment de la scène, en
// fractions de la boîte — la poussière s'y pose.
function footOf(rec, bx, by, bw) {
  let best = null;
  for (const r of rec) if (!best || r.w * r.h > best.w * best.h) best = r;
  if (!best || !best.im) return null;
  const sw = best.im.naturalWidth || best.im.width, sh = best.im.naturalHeight || best.im.height;
  return {
    cx: (best.x + best.w / 2 - bx) / bw,
    by: (best.y + best.h - by) / bw,
    w: sw * 0.8, h: sh * 0.6,
    k: best.kx / bw,                 // px écran par px de sprite, rapporté à la boîte
  };
}
