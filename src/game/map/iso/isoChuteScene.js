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
import { chuteHash } from './chuteState.js';
import { dustFrame } from './chuteDust.js';

const bandNow = () => (CM.layout && CM.layout.counts ? CM.layout.counts.eraBand | 0 : 0);

// Le nuage d'un bâtiment : pied au centre du pied (cx, by), emprise wSpr×hSpr en px
// de sprite, posé à l'échelle k (px écran par px de sprite) — le grain du bâtiment.
function drawDust(ctx, t, cx, by, wSpr, hSpr, k, f) {
  if (f < 0) return;
  const fr = dustFrame(wSpr, hSpr, chuteHash('poussiere:' + t.gx + ':' + t.gy), bandNow(), f);
  if (!fr) return;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fr.c, Math.round(cx - fr.ax * k), Math.round(by - fr.ay * k), Math.round(fr.c.width * k), Math.round(fr.c.height * k));
  ctx.imageSmoothingEnabled = prev;
}

// HABITATION. (x, y, w, h) = la boîte-lot du peintre (cf. isoLivePaint). Renvoie la
// boîte écran pour le survol, ou null si le sprite n'est pas prêt.
export function paintHouseFall(ctx, t, x, y, w, h, st) {
  const g = pixelHouseSprite(t, x, y, w, h);
  if (!g) return null;
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
// `rec` (facultatif) reçoit les ruines dessinées.
export function drawEngineRuin(ctx, t, bx, by, bw, aNow, rec = null) {
  const mute = muteCtx();
  if (!mute) return;
  const prevCtx = CM.ctx;
  CM.ctx = mute;
  ENGINE_RUIN.on = true; ENGINE_RUIN.ctx = ctx || mute; ENGINE_RUIN.rec = rec;
  suspendFlameGlow(true); suspendLightLayer(true);
  try { muteSunShadow(() => drawEngineSprite(t, bx, by, bw, bw, aNow)); } catch { /* scène capricieuse : rien */ }
  finally {
    CM.ctx = prevCtx;
    ENGINE_RUIN.on = false; ENGINE_RUIN.ctx = null; ENGINE_RUIN.rec = null;
    suspendFlameGlow(false); suspendLightLayer(false);
  }
}

// SCÈNE MOTEUR. Renvoie la boîte de survol.
export function paintEngineFall(ctx, t, bx, by, bw, aNow, st) {
  const rec = [];
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
    drawEngineRuin(ctx, t, bx, by, bw, aNow, rec);
    if (rec.length) t._chuteFoot = footOf(rec, bx, by, bw);
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
