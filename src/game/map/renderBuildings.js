// ⚠ CE FICHIER NE DESSINE PLUS QUE LES MERVEILLES. Étape 6 du plan de
// suppression du legacy (2026-08-23) : 1088 → 780 lignes. `drawTile` et tout le
// bloc LOD top-down sont partis ; il ne reste que le sprite de merveille, ses
// flammes, l'Œil et son gyroscope — tous consommés par le peintre iso.
// En partant, ce fichier retire les derniers lecteurs de `buildingShapes.js`
// (hors isoRenderer) et de `baseColor` dans `renderWorld.js`.
import { state } from '../core/state.js';
import { CM, CM_TINTS } from './layout.js';
import { wonderAnchor } from './iso/projection.js';
import { queueFlameGlow, flameAssetGlow, flameFlicker } from './flameGlow.js';

/* ---- legacy citymap rendering\buildings.js ---- */


/* ============================================================================
 * citymap-render-buildings.js - Rendu des tuiles, batiments, districts et merveilles.
 *   drawTile et helpers de forme (drawHouseShape, drawEngineSprite,
 *   drawTinyCamp). Depend de CM, citymap-camera et citymap-draw-utils.
 * ============================================================================ */

// ── Merveilles pixel-art ─────────────────────────────────────────────────────
// Sprites 5 rangs (public/pixelart/wonders/<id>-t<rang>.png) + flammes animées
// en overlay, positionnées par <id>-flames.json (ancres curées à la main).
// Manifeste : seules les merveilles listées ici sont migrées, les autres
// restent procédurales. Repli procédural tant que le sprite n'est pas chargé.
const WONDER_PX_IDS = new Set(["dynasty1", "pop1m", "era_kingdom", "era_empire", "era_mega", "era_singularity"]);
const wonderPxCache = new Map(); // "dynasty1-t3" -> { img, ready, nw, nh }
function wonderPixelSprite(id, tier) {
  if (!WONDER_PX_IDS.has(id)) return null;
  const key = id + "-t" + tier;
  let e = wonderPxCache.get(key);
  if (!e) {
    e = { img: new Image(), ready: false, nw: 0, nh: 0 };
    e.img.onload = () => { e.nw = e.img.naturalWidth; e.nh = e.img.naturalHeight; e.ready = true; };
    e.img.src = "/pixelart/wonders/" + key + ".png";
    wonderPxCache.set(key, e);
  }
  return e.ready ? e : null;
}
const wonderFlamesCfgs = new Map(); // id -> cfg (null = demandé, pas encore reçu)
const wonderFlameStrips = new Map(); // fichier -> { img, ready }
function wonderFlamesData(id) {
  if (!wonderFlamesCfgs.has(id)) {
    wonderFlamesCfgs.set(id, null);
    fetch("/pixelart/wonders/" + id + "-flames.json").then((r) => {
      // Un 404 servi en HTML passait r.json() → SyntaxError avalée, et le
      // sentinel null restait posé pour toujours : plus jamais de flammes.
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then((j) => {
      wonderFlamesCfgs.set(id, j);
      for (const a of Object.values(j.asset)) {
        if (wonderFlameStrips.has(a.file)) continue;
        const st = { img: new Image(), ready: false };
        st.img.onload = () => { st.ready = true; };
        st.img.src = "/pixelart/wonders/" + a.file;
        wonderFlameStrips.set(a.file, st);
      }
    }).catch((err) => {
      // Sentinel effacé : le prochain rendu retentera (réseau revenu, asset
      // redéployé) au lieu d'un échec définitif et silencieux.
      console.warn("flammes de merveille illisibles (" + id + ") :", err);
      wonderFlamesCfgs.delete(id);
    });
  }
  return wonderFlamesCfgs.get(id);
}
// Blit du sprite de merveille + overlays animés (flammes, bannières) à leurs
// ancres. Par défaut chaque foyer boucle en ping-pong (0..n-1..1) avec un
// déphasage propre pour ne pas battre à l'unisson ; un asset peut demander
// `loop:"forward"` (rotation continue — un ping-pong inverserait le sens de
// vrille), `anchor:"top"` (tissu suspendu : le point fixe est la traverse),
// `sc` (échelle overlay/élément cuit) et `ms` (durée d'une frame). Pendant
// l'érection (e<0.98) le sprite pousse écrasé, sans overlays (les éléments
// cuits du sprite assurent l'intérim).
// Poids d'UN halo de merveille : le Mausolée rang V porte 57 braseros et les
// lueurs s'ADDITIONNENT — à pleine intensité la façade virerait au blanc. C'est
// leur SOMME qui doit faire le monument incandescent, pas chaque flamme.
const WONDER_FLAME_MUL = 0.55;
// ── ANNEAUX TOURNANTS DE L'ŒIL ───────────────────────────────────────────────
// Raph 2026-07-28 : « les anneaux autour de l'œil fluides ». Le sprite de la
// Singularité est un MANDALA — un œil au centre, cerclé d'anneaux (runes au rang
// V, roue à rayons au III, bâti mécanique au II). Il était figé.
//
// On le fend en DEUX zones concentriques : le CŒUR reste fixe, tout ce qui
// l'entoure tourne. La coupure n'est pas cosmétique — le reflet spéculaire de
// l'œil (la tache blanche en haut de l'iris) doit rester en place : une lumière
// ne tourne pas avec l'objet qu'elle éclaire, et un œil dont le reflet orbite
// louche. Même raison pour la pupille, qui doit fixer la caméra.
//
// RAYON DE COUPURE mesuré sprite par sprite (profil radial de luminance des cinq
// PNG : l'iris est le plateau clair, l'anneau la chute qui suit). Il ne se déduit
// pas d'une règle — les cinq rangs sont des dessins différents, pas un même
// motif agrandi. Fraction de la DEMI-LARGEUR du sprite.
const SINGULARITY_EYE_R = [0.30, 0.42, 0.28, 0.36, 0.46];
// Tour complet en `periodSec`. Lent : à 34 s l'anneau avance d'un dixième de
// degré par frame — le mouvement se voit sans jamais attirer l'œil, et le
// scintillement du pixel tourné (blit NEAREST, même idiome que les ailes de
// moulin, cf. blitPropRot) reste sous le seuil.
export const singularityRings = { on: true, periodSec: 34, dir: 1 };
if (typeof window !== "undefined") {
  window.__eyeRings = (o) => {
    if (o === false) singularityRings.on = false;
    else if (o && typeof o === "object") { singularityRings.on = true; Object.assign(singularityRings, o); }
    else singularityRings.on = true;
    return { ...singularityRings };
  };
}
// Blit du sprite, cœur FIXE + pourtour TOURNÉ. Le pourtour est clippé au
// complément du disque de cœur (evenodd : dans le disque le compte est pair,
// donc exclu) — les deux zones ne se recouvrent jamais, aucun risque de double
// dessin ni de glyphe fantôme. Le rectangle de clip est élargi d'une largeur de
// part et d'autre : tourné, le sprite déborde de sa boîte droite.
function blitWonderSpin(ctx, img, left, top, W, H, rEyeF, ang) {
  const cx = left + W / 2, cy = top + H / 2, rEye = rEyeF * W / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, rEye, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(img, left, top, W, H);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(left - W, top - H, W * 3, H * 3);
  ctx.arc(cx, cy, rEye, 0, Math.PI * 2);
  ctx.clip("evenodd");
  ctx.translate(cx, cy); ctx.rotate(ang); ctx.translate(-cx, -cy);
  ctx.drawImage(img, left, top, W, H);
  ctx.restore();
}
// ── GYROSCOPE DE L'ŒIL — trois grands cercles pointillés sur une sphère ──────
// C'était une BANDE de 24 images à 200 ms, soit CINQ images par seconde : la
// rotation sautait (Raph 2026-07-28, « les anneaux autour de l'œil fluides »).
// Aucune bande ne peut y arriver — lisser une rotation demande ~25 images par
// seconde, donc 120 images pour le même cycle de 4,8 s, et un PNG de 11 520 px
// de large pour une figure qui tient en dix lignes de trigonométrie. Une
// rotation ne se cuit pas en images : elle se calcule à la frame.
//
// Le tracé reprend la bande de près : trois grands cercles (les trois plans du
// repère), les deux teintes relevées sur ses pixels, le même cycle de 4,8 s, le
// même fondu additif. Deux choses lui restent fidèles et comptent :
//   • les points sont des CARRÉS posés sur pixel ENTIER — le mouvement avance au
//     pas du pixel, comme tout le reste de la DA, pas en sous-pixel flou ;
//   • le NOMBRE de points est fixe (44 par cercle, compté sur la bande), pas
//     leur espacement : c'est ce qui garde la même densité à tous les zooms.
// La profondeur (z) module l'alpha — c'est elle, et rien d'autre, qui fait lire
// une sphère plutôt que trois ellipses.
export const eyeGyro = { on: true, cycleSec: 4.8, dots: 44, tilt: 0.42, precess: 0.31 };
if (typeof window !== "undefined") {
  window.__eyeGyro = (o) => {
    if (o === false) eyeGyro.on = false;
    else if (o && typeof o === "object") { eyeGyro.on = true; Object.assign(eyeGyro, o); }
    else eyeGyro.on = true;
    return { ...eyeGyro };
  };
}
const GYRO_GOLD = [255, 216, 120], GYRO_PALE = [210, 225, 255];
// Les trois grands cercles = les trois plans du repère, chacun donné par ses
// deux vecteurs directeurs. Une base ORTHOGONALE : trois cercles quelconques se
// recouperaient n'importe où et la figure ne lirait plus comme une sphère.
const GYRO_RINGS = [
  { u: [1, 0, 0], v: [0, 1, 0], c: GYRO_GOLD },
  { u: [0, 1, 0], v: [0, 0, 1], c: GYRO_GOLD },
  { u: [0, 0, 1], v: [1, 0, 0], c: GYRO_PALE },
];
function drawEyeGyro(ctx, cx, cy, R, now) {
  if (!(R > 2)) return;
  const G = eyeGyro;
  const t = (now / 1000) * (Math.PI * 2 / Math.max(0.2, G.cycleSec));
  // Bascule = rotation propre (a) + précession lente (c) autour d'un axe
  // incliné d'un angle FIXE (b). Sans la précession la figure repasserait deux
  // fois par tour par le même profil et l'œil y lirait un battement, pas une
  // rotation libre.
  const ca = Math.cos(t), sa = Math.sin(t);
  const cb = Math.cos(G.tilt), sb = Math.sin(G.tilt);
  const cc = Math.cos(t * G.precess), sc2 = Math.sin(t * G.precess);
  // p → Ry(a) → Rx(b) → Rz(c), développé (une seule passe, pas de matrices).
  const rot = (p) => {
    const x1 = p[0] * ca + p[2] * sa, y1 = p[1], z1 = -p[0] * sa + p[2] * ca;
    const x2 = x1, y2 = y1 * cb - z1 * sb, z2 = y1 * sb + z1 * cb;
    return [x2 * cc - y2 * sc2, x2 * sc2 + y2 * cc, z2];
  };
  const d = Math.max(1, Math.round(R * 0.031));   // côté du point, en px écran
  const N = Math.max(8, G.dots | 0);
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  for (const ring of GYRO_RINGS) {
    const U = rot(ring.u), V = rot(ring.v);
    for (let k = 0; k < N; k += 1) {
      const ph = (Math.PI * 2 * k) / N, cp = Math.cos(ph), sp = Math.sin(ph);
      const x = U[0] * cp + V[0] * sp, y = U[1] * cp + V[1] * sp, z = U[2] * cp + V[2] * sp;
      ctx.fillStyle = `rgba(${ring.c[0]},${ring.c[1]},${ring.c[2]},${(0.3 + 0.7 * (z + 1) / 2).toFixed(3)})`;
      ctx.fillRect(Math.round(cx + x * R - d / 2), Math.round(cy + y * R - d / 2), d, d);
    }
  }
  ctx.globalCompositeOperation = prevOp;
}
function drawWonderPixelSprite(wid, px, tier, cxs, baseY, W, H, e, now) {
  const ctx = CM.ctx;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // Anneaux tournants : réservé à l'Œil, et seulement une fois DRESSÉ (pendant
  // l'érection le sprite est écrasé en hauteur — le disque de clip, lui, resterait
  // rond, et le cœur fixe se décollerait de l'iris aplati).
  const spinR = (wid === "era_singularity" && singularityRings.on && e >= 0.98)
    ? SINGULARITY_EYE_R[Math.max(0, Math.min(4, tier - 1))] : 0;
  if (spinR > 0) {
    const ang = (now / 1000) * (Math.PI * 2 / Math.max(1, singularityRings.periodSec)) * singularityRings.dir;
    blitWonderSpin(ctx, px.img, cxs - W / 2, baseY - H, W, H, spinR, ang);
  } else {
    ctx.drawImage(px.img, cxs - W / 2, baseY - H, W, H);
  }
  const cfg = wonderFlamesData(wid);
  const tierCfg = cfg && cfg.tiers && cfg.tiers["t" + tier];
  if (tierCfg && e >= 0.98) {
    const sx = W / px.nw, sy = H / px.nh;
    const left = cxs - W / 2, top = baseY - H;
    for (let i = 0; i < tierCfg.flames.length; i += 1) {
      const f = tierCfg.flames[i];
      // GYROSCOPE : calculé, plus blitté (cf. drawEyeGyro). L'entrée reste dans
      // le JSON — c'est elle qui porte l'ancre et le diamètre.
      if (f.kind === "gyro" && eyeGyro.on) {
        drawEyeGyro(ctx, left + f.x * sx, top + f.y * sy, f.w * sx / 2, now);
        continue;
      }
      const a = cfg.asset[f.kind];
      const strip = a && wonderFlameStrips.get(a.file);
      if (!strip || !strip.ready) continue;
      // Cadence de la bande. Le défaut est un ALLER-RETOUR (0..n-1 puis n-2..1) :
      // il convient à ce qui respire — un éclat de gemme, une pulsation. ⚠ PAS À
      // UNE FLAMME : un feu monte, il ne se rembobine pas, et l'aller-retour se
      // voit comme un hoquet régulier. Les bandes de flamme (PixelLab) sont déjà
      // bouclées bord à bord : elles déclarent "loop": "forward", comme le rayon
      // de l'Aiguille et le gyroscope de l'Œil.
      const seq = a.loop === "forward" ? a.frames : a.frames * 2 - 2;
      const st = Math.floor(now / (a.ms || 90) + i * 2.63) % seq;
      const k = a.loop === "forward" || st < a.frames ? st : seq - st;
      let dx, dy, dw, dh;
      if (a.mode === "patch") {
        // Rustine : la frame a été générée DEPUIS le crop du sprite (custom
        // start frame PixelLab) et recouvre exactement sa zone, pixel pour
        // pixel — f.x/f.y = coin haut-gauche du crop, aucune échelle.
        dw = f.w * sx; dh = f.h * sy;
        dx = left + f.x * sx; dy = top + f.y * sy;
      } else {
        // Nettement plus grand que l'élément cuit : même dans les frames où la
        // flamme animée penche, sa silhouette recouvre celle du sprite (sinon
        // les deux se voient en double). Un `sc` par flamme prime (ex. torche du
        // t1 rapetissée dont la version cuite a été effacée du sprite).
        const sc = f.sc != null ? f.sc : a.sc != null ? a.sc : f.kind === "door" ? 1.15 : 1.7;
        dw = (f.w * sc + 2) * sx; dh = (f.h * sc + 2) * sy;
        dx = left + f.x * sx - dw / 2;
        dy = a.anchor === "top"
          ? top + f.y * sy - sy // tissu : accroché sous sa traverse, pend vers le bas
          : a.anchor === "center"
            ? top + f.y * sy - dh / 2 // éclat : centré sur sa gemme
            : top + f.y * sy - dh + sy; // flamme : posée sur son foyer, monte
      }
      if (a.blend) {
        // Halo lumineux : blending additif — le voile pousse la scène vers la
        // surexposition au lieu de se fondre dans un fond déjà clair.
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = a.blend;
        ctx.drawImage(strip.img, k * a.fw, 0, a.fw, a.fh, dx, dy, dw, dh);
        ctx.globalCompositeOperation = prevOp;
      } else {
        ctx.drawImage(strip.img, k * a.fw, 0, a.fw, a.fh, dx, dy, dw, dh);
      }
      // Chaque FEU éclaire (braseros du Mausolée, brasero de la Vigie…). Cœur du
      // halo au bas-milieu de l'overlay : l'ancre est au PIED de la flamme et
      // celle-ci monte, la lumière naît donc sous sa mi-hauteur. Déphasage `i`
      // repris de l'animation → un brasero scintille en phase avec ses propres
      // images. Les éclats de gemme, rayons et pulsations sont déjà de la
      // lumière : flameAssetGlow les écarte (règle par l'asset, pas par merveille).
      // La lueur elle-même est posée plus tard, par-dessus le voile de nuit.
      const gcol = flameAssetGlow(a);
      if (gcol) queueFlameGlow(dx + dw / 2, dy + dh * 0.62, (dw + dh) * 0.42, gcol, now, i * 2.63, WONDER_FLAME_MUL);
    }
  }
  ctx.imageSmoothingEnabled = prev;
}

function drawWonder(w, idx, now) {
  const L = CM.layout; if (!L) return;
  const z = CM.cam.zoom, s = CM.TILE * z;
  // Ancre PROJETÉE : en legacy le centre-bas de la tuile du slot (à l'identité) ;
  // en iso le coin SUD du socle du monument, pour qu'un sprite front-view se
  // dresse AU-DESSUS de son emprise au lieu d'être posé derrière — tout le
  // raisonnement est en tête de wonderAnchor. Le sprite reste DEBOUT : seul son
  // point d'ancrage bouge. SOURCE UNIQUE partagée avec le survol
  // (cityMapHitTest), qui projetait encore sa propre copie planaire et visait
  // donc à côté en iso.
  const anchor = wonderAnchor(idx, L.gridN, L.cx, L.cy);
  const cxs = anchor.x, baseY = anchor.y;
  let H_MAX = s * 7, W = s * 3.6;
  if (w.id === "pop1m")          { H_MAX = s * 5.5; W = s * 4.8; }
  if (w.id === "era_kingdom")    { H_MAX = s * 8;   W = s * 3.8; }
  if (w.id === "era_empire")     { H_MAX = s * 6;   W = s * 5.2; }
  if (w.id === "era_mega")       { H_MAX = s * 9;   W = s * 2.6; }
  if (w.id === "era_singularity"){ H_MAX = s * 8.5; W = s * 3.2; }
  // Palier d'évolution (1..5) : le monument grandit à chaque jalon franchi.
  // Aperçu dev (__showWonder) : force le rang demandé sans toucher au save.
  const tier = (CM.previewWonder && CM.previewWonder.id === w.id)
    ? CM.previewWonder.tier
    : Math.max(1, Math.min(5, (state && state.wonderTiers && state.wonderTiers[w.id]) || 1));
  // Sprite pixel-art dédié ? Dimensionné à densité constante (~34 px de sprite
  // par tuile) : la taille en jeu suit la taille native du rang (112→400 px).
  const px = wonderPixelSprite(w.id, tier);
  if (px) {
    const PPT = 34;
    W = s * (px.nw / PPT);
    H_MAX = s * (px.nh / PPT);
  } else {
    const tierMul = 0.78 + tier * 0.11; // rang I : ×0.89 → rang V : ×1.33
    H_MAX *= tierMul;
    W *= tierMul;
  }
  if (cxs < -W * 3 || cxs > CM.cw + W * 3 || baseY < -H_MAX * 1.5 || baseY > CM.ch + s * 3) return;

  const born = CM.born["wonder:" + w.id];
  const prog = born ? Math.max(0, Math.min(1, (now - born) / 1400)) : 1;
  const e = prog * prog * (3 - 2 * prog);
  const H = H_MAX * e;
  const topY = baseY - H;
  const ctx = CM.ctx;
  const glow = 0.5 + 0.25 * Math.sin(now / 700 + idx * 1.3);
  const tint = CM_TINTS[CM.dynastyIdx % CM_TINTS.length];

  // Merveille pixel-art : le sprite EST tout le monument. Aucun habillage
  // procédural (esplanade, aura, ombre de contact, écume, torches, stèles,
  // particules, couronne orbitale, faisceau nocturne, bannière) — seules les
  // flammes overlay animent la scène. L'érection (e<1) écrase le sprite qui pousse.
  if (px) {
    if (H < 3) return;
    ctx.globalAlpha = e;
    let drawBaseY = baseY;
    if (w.id === "era_singularity") {
      // Bâtiment VOLANT : l'Œil lévite au-dessus de sa case avec un léger bob,
      // et projette une ombre portée AU SOL en dessous — l'écart entre l'Œil et
      // son ombre prouve le vol (seule merveille où l'ombre SERT le design).
      const bob = Math.sin(now / 1300 + idx);
      const hoverH = H * 0.34 + bob * s * 0.35;
      const shr = 1 - bob * 0.10; // l'ombre rétrécit un peu quand l'Œil monte
      ctx.fillStyle = "rgba(10,8,20,0.26)";
      ctx.beginPath();
      ctx.ellipse(cxs + s * 0.08, baseY - s * 0.02, W * 0.26 * shr, W * 0.08 * shr, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBaseY = baseY - hoverH;
    }
    drawWonderPixelSprite(w.id, px, tier, cxs, drawBaseY, W, H, e, now);
    // BOÎTE RÉELLEMENT DESSINÉE, publiée pour le SURVOL — même idiome que
    // CM._houseBoxes. Le hit-test se contentait d'un disque de 2,5 tuiles autour
    // de l'ANCRE, c'est-à-dire au SOL : il ratait tout ce qui ne touche pas le
    // sol. L'Œil LÉVITE de H·0,34 (près de 3 tuiles) — le disque et le sprite ne
    // se recouvraient jamais et son infobulle ne sortait tout simplement pas
    // (Raph 2026-07-28). Les grandes merveilles n'étaient survolables que par le
    // bas. La boîte, elle, est par construction ce qu'on voit.
    if (CM._wonderBoxes) CM._wonderBoxes.push({ dx: cxs - W / 2, dy: drawBaseY - H, dw: W, dh: H, wi: idx });
    ctx.globalAlpha = 1;
    return;
  }

  // Esplanade pavée
  const plazaRx = W * 1.15, plazaRy = plazaRx * 0.36;
  const pg = ctx.createRadialGradient(cxs, baseY, 0, cxs, baseY, plazaRx);
  pg.addColorStop(0, "rgba(178,158,105,0.92)");
  pg.addColorStop(0.55, "rgba(148,130,88,0.6)");
  pg.addColorStop(1, "rgba(112,98,64,0)");
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(cxs, baseY, plazaRx, plazaRy, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(100,84,52,0.28)";
  ctx.lineWidth = Math.max(0.5, s * 0.016);
  for (let ri = 1; ri <= 3; ri++) {
    ctx.beginPath();
    ctx.ellipse(cxs, baseY, plazaRx * ri / 3.8, plazaRy * ri / 3.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Aura
  const auraR = Math.max(1, W * 1.55);
  const ag = ctx.createRadialGradient(cxs, topY + H * 0.3, 0, cxs, topY + H * 0.3, auraR);
  ag.addColorStop(0, `rgba(255,232,120,${(0.36 * glow * e).toFixed(2)})`);
  ag.addColorStop(0.5, `rgba(255,200,60,${(0.11 * glow * e).toFixed(2)})`);
  ag.addColorStop(1, "rgba(255,218,80,0)");
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.arc(cxs, topY + H * 0.3, auraR, 0, Math.PI * 2); ctx.fill();

  if (H < 3) return;
  ctx.globalAlpha = e;

  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.beginPath(); ctx.ellipse(cxs + s * 0.2, baseY + s * 0.07, W * 0.5, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();

  if (w.id === "dynasty1") {
    // ── LE PREMIER MAUSOLÉE — pyramide / mastaba / obélisque ──────────
    const nSt = 5, stH = H * 0.24;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.08 + (i / nSt) * 0.92), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#c8a040" : "#d8b050";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const chamberW = W * 0.52, chamberH = H * 0.28, chamberY = baseY - stH;
    ctx.fillStyle = "#b89030"; ctx.fillRect(cxs - chamberW / 2, chamberY - chamberH, chamberW, chamberH);
    ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.fillRect(cxs + chamberW * 0.28, chamberY - chamberH, chamberW * 0.22, chamberH);
    ctx.fillStyle = "#5a3808"; ctx.fillRect(cxs - W * 0.065, chamberY - chamberH * 0.72, W * 0.13, chamberH * 0.54);
    ctx.fillStyle = "#8a6030"; ctx.fillRect(cxs - W * 0.048, chamberY - chamberH * 0.68, W * 0.096, chamberH * 0.42);
    ctx.fillStyle = "#e8c840";
    ctx.beginPath(); ctx.ellipse(cxs, chamberY - chamberH * 0.82, W * 0.055, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a1a08"; ctx.beginPath(); ctx.arc(cxs, chamberY - chamberH * 0.82, W * 0.022, 0, Math.PI * 2); ctx.fill();
    const obBase = chamberY - chamberH, sw0 = W * 0.09, sw1 = W * 0.018;
    ctx.fillStyle = "#e0b840";
    ctx.beginPath(); ctx.moveTo(cxs - sw0 / 2, obBase); ctx.lineTo(cxs - sw1 / 2, topY + H * 0.07);
    ctx.lineTo(cxs + sw1 / 2, topY + H * 0.07); ctx.lineTo(cxs + sw0 / 2, obBase); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,230,130,0.22)";
    ctx.beginPath(); ctx.moveTo(cxs - sw0 / 2, obBase); ctx.lineTo(cxs - sw0 / 2 + W * 0.022, obBase);
    ctx.lineTo(cxs - sw1 / 2 + W * 0.022, topY + H * 0.07); ctx.lineTo(cxs - sw1 / 2, topY + H * 0.07); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140,100,10,0.45)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let li = 1; li < 8; li++) {
      const fy = obBase + (topY + H * 0.07 - obBase) * (li / 8);
      const fw = sw0 + (sw1 - sw0) * (li / 8);
      ctx.beginPath(); ctx.moveTo(cxs - fw / 2, fy); ctx.lineTo(cxs + fw / 2, fy); ctx.stroke();
    }
    ctx.fillStyle = "#ffe860";
    ctx.beginPath(); ctx.moveTo(cxs - sw1 * 1.2, topY + H * 0.07); ctx.lineTo(cxs, topY); ctx.lineTo(cxs + sw1 * 1.2, topY + H * 0.07); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,250,180,${(0.92 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.16), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "pop1m") {
    // ── LA COLONNE DU MILLION — colonne triomphale, frise spiralée,
    //    statue dorée au sommet, quatre lions de bronze au pied ─────────
    const nSt = 4, stH = H * 0.14;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.22 + (i / nSt) * 0.78), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#c8c0a0" : "#d8d0b0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH;
    // Lions de bronze aux quatre coins du socle
    ctx.fillStyle = "#8a6a28";
    for (const lx of [-0.38, 0.38]) {
      ctx.beginPath(); ctx.ellipse(cxs + W * lx, podY - H * 0.015, W * 0.06, H * 0.035, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cxs + W * lx + W * 0.04, podY - H * 0.05, W * 0.032, 0, Math.PI * 2); ctx.fill();
    }
    // Dé de la colonne (piédestal sculpté)
    const dieW = W * 0.26, dieH = H * 0.12;
    ctx.fillStyle = "#cfc4a0"; ctx.fillRect(cxs - dieW / 2, podY - dieH, dieW, dieH);
    ctx.strokeStyle = "rgba(120,95,40,0.5)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    ctx.strokeRect(cxs - dieW * 0.38, podY - dieH * 0.8, dieW * 0.76, dieH * 0.6);
    // Fût de la colonne
    const colW = W * 0.155, colTop = topY + H * 0.2, colBase = podY - dieH;
    const cGrad = ctx.createLinearGradient(cxs - colW / 2, 0, cxs + colW / 2, 0);
    cGrad.addColorStop(0, "#e6dcba"); cGrad.addColorStop(0.4, "#f2ead0"); cGrad.addColorStop(1, "#c8bc94");
    ctx.fillStyle = cGrad;
    ctx.fillRect(cxs - colW / 2, colTop, colW, colBase - colTop);
    // Frise spiralée (bandes diagonales sculptées qui montent)
    ctx.strokeStyle = "rgba(130,105,50,0.55)"; ctx.lineWidth = Math.max(0.8, s * 0.022);
    const spirals = 9;
    for (let li = 0; li <= spirals; li++) {
      const y0 = colBase - (colBase - colTop) * (li / (spirals + 1));
      const y1 = colBase - (colBase - colTop) * ((li + 0.85) / (spirals + 1));
      ctx.beginPath(); ctx.moveTo(cxs - colW / 2, y0); ctx.lineTo(cxs + colW / 2, y1); ctx.stroke();
    }
    // Reliefs : petits points de foule sculptée le long de la spirale
    ctx.fillStyle = "rgba(110,88,40,0.5)";
    for (let li = 0; li < spirals; li++) {
      const ym = colBase - (colBase - colTop) * ((li + 0.45) / (spirals + 1));
      for (let dx = -1; dx <= 1; dx++) {
        ctx.fillRect(cxs + dx * colW * 0.26 - s * 0.012, ym - s * 0.012, Math.max(1, s * 0.024), Math.max(1, s * 0.024));
      }
    }
    // Chapiteau
    ctx.fillStyle = "#d8cda8"; ctx.fillRect(cxs - colW * 0.85, colTop - H * 0.035, colW * 1.7, H * 0.035);
    ctx.fillStyle = "#c4b88e"; ctx.fillRect(cxs - colW * 0.65, colTop - H * 0.06, colW * 1.3, H * 0.028);
    // Statue dorée au sommet (figure ailée levant une couronne)
    const statY = colTop - H * 0.06;
    ctx.fillStyle = "#e8c645";
    ctx.fillRect(cxs - W * 0.022, statY - H * 0.1, W * 0.044, H * 0.1);             // corps
    ctx.beginPath(); ctx.arc(cxs, statY - H * 0.115, W * 0.026, 0, Math.PI * 2); ctx.fill(); // tête
    // Ailes
    ctx.fillStyle = "#f2d870";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.02, statY - H * 0.08); ctx.lineTo(cxs - W * 0.1, statY - H * 0.12); ctx.lineTo(cxs - W * 0.025, statY - H * 0.055); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cxs + W * 0.02, statY - H * 0.08); ctx.lineTo(cxs + W * 0.1, statY - H * 0.12); ctx.lineTo(cxs + W * 0.025, statY - H * 0.055); ctx.closePath(); ctx.fill();
    // Couronne brandie, scintillante
    ctx.strokeStyle = `rgba(255,235,140,${(0.8 + 0.2 * Math.sin(now / 400)).toFixed(2)})`;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath(); ctx.arc(cxs, statY - H * 0.16, W * 0.035, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(255,250,200,${(0.85 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, statY - H * 0.16, Math.max(2, s * 0.1), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_kingdom") {
    // ── LA COURONNE DE PIERRE — cathédrale gothique ───────────────────
    const nSt = 3, stH = H * 0.08;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.2 + (i / nSt) * 0.8), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#888098" : "#9890a8";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, naveW = W * 0.38, naveH = H * 0.54;
    ctx.fillStyle = "#7a7090"; ctx.fillRect(cxs - naveW / 2, podY - naveH, naveW, naveH);
    ctx.fillStyle = "#6a6080";
    ctx.fillRect(cxs - W * 0.46, podY - naveH * 0.58, W * 0.082, naveH * 0.44);
    ctx.fillRect(cxs + W * 0.378, podY - naveH * 0.58, W * 0.082, naveH * 0.44);
    ctx.fillStyle = "rgba(180,200,255,0.35)";
    for (let wi2 = 0; wi2 < 3; wi2++) {
      const wx2 = cxs - naveW * 0.3 + wi2 * naveW * 0.3;
      const wyTop = podY - naveH * 0.9, wh = naveH * 0.38;
      ctx.fillRect(wx2 - W * 0.04, wyTop, W * 0.08, wh * 0.75);
      ctx.beginPath(); ctx.arc(wx2, wyTop, W * 0.04, Math.PI, 0); ctx.fill();
    }
    const roseY = podY - naveH * 0.38;
    ctx.fillStyle = "rgba(160,180,255,0.45)"; ctx.beginPath(); ctx.arc(cxs, roseY, W * 0.095, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#9890b8"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let ri = 0; ri < 8; ri++) {
      const ra = ri * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(cxs, roseY); ctx.lineTo(cxs + Math.cos(ra) * W * 0.095, roseY + Math.sin(ra) * W * 0.095); ctx.stroke();
    }
    ctx.strokeStyle = "#a8a0c0"; ctx.lineWidth = Math.max(0.5, s * 0.022);
    ctx.beginPath(); ctx.arc(cxs, roseY, W * 0.095, 0, Math.PI * 2); ctx.stroke();
    const towerW = W * 0.2, towerH = H * 0.8;
    for (const tx of [-1, 1]) {
      const tcx = cxs + tx * (naveW / 2 + towerW / 2);
      ctx.fillStyle = "#7a7090"; ctx.fillRect(tcx - towerW / 2, podY - towerH, towerW, towerH);
      ctx.fillStyle = "rgba(160,180,255,0.35)";
      for (let ti = 1; ti <= 3; ti++) {
        const twy = podY - towerH * (0.2 + ti * 0.2);
        ctx.fillRect(tcx - W * 0.048, twy - H * 0.058, W * 0.096, H * 0.058 * 0.75);
        ctx.beginPath(); ctx.arc(tcx, twy - H * 0.058, W * 0.048, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = "#9890a8";
      ctx.beginPath(); ctx.moveTo(tcx - towerW / 2, podY - towerH); ctx.lineTo(tcx, podY - towerH - H * 0.16); ctx.lineTo(tcx + towerW / 2, podY - towerH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d4b840"; ctx.beginPath(); ctx.arc(tcx, podY - towerH - H * 0.16, Math.max(2, s * 0.07), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#888098";
    ctx.beginPath(); ctx.moveTo(cxs - naveW * 0.32, podY - naveH); ctx.lineTo(cxs, topY + H * 0.02); ctx.lineTo(cxs + naveW * 0.32, podY - naveH); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8c830"; ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffe860"; ctx.lineWidth = Math.max(1.5, s * 0.042); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cxs, topY - Math.max(3, s * 0.1)); ctx.lineTo(cxs, topY - H * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.054, topY - H * 0.084); ctx.lineTo(cxs + W * 0.054, topY - H * 0.084); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = `rgba(200,215,255,${(0.74 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY - H * 0.12, Math.max(2, s * 0.15), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_empire") {
    // ── LE FORUM IMPÉRIAL — arc de triomphe + ailes + quadrige ────────
    const nSt = 5, stH = H * 0.13;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.1 + (i / nSt) * 0.9), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#d0c090" : "#e0d0a0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, wingW = W * 0.28, wingH = H * 0.42;
    for (const side of [-1, 1]) {
      const wx = cxs + side * W * 0.22;
      ctx.fillStyle = "#c8b878"; ctx.fillRect(wx - wingW / 2, podY - wingH, wingW, wingH);
      const nWC = 5;
      for (let ci = 0; ci < nWC; ci++) {
        const cx2 = wx - wingW * 0.42 + ci * (wingW * 0.84 / (nWC - 1));
        ctx.fillStyle = "#dcd098"; ctx.fillRect(cx2 - s * 0.04, podY - wingH, s * 0.08, wingH);
        ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(cx2 + s * 0.014, podY - wingH, s * 0.018, wingH);
      }
      ctx.fillStyle = "#b0a060"; ctx.fillRect(wx - wingW / 2, podY - wingH - H * 0.028, wingW, H * 0.028);
    }
    const archW = W * 0.44, archH = H * 0.56;
    ctx.fillStyle = "#d4c080"; ctx.fillRect(cxs - archW / 2, podY - archH, archW, archH);
    const mainR = archW * 0.22;
    ctx.fillStyle = "#c0aa60";
    ctx.beginPath(); ctx.arc(cxs, podY - archH + archH * 0.48, mainR, Math.PI, 0);
    ctx.rect(cxs - mainR, podY - archH + archH * 0.48, mainR * 2, archH * 0.48); ctx.fill();
    ctx.fillStyle = "rgba(20,14,4,0.58)";
    ctx.beginPath(); ctx.arc(cxs, podY - archH + archH * 0.48, mainR * 0.84, Math.PI, 0);
    ctx.rect(cxs - mainR * 0.84, podY - archH + archH * 0.48, mainR * 1.68, archH * 0.48); ctx.fill();
    for (const side of [-1, 1]) {
      const ax = cxs + side * archW * 0.32, sR = archW * 0.1;
      ctx.fillStyle = "#b89050";
      ctx.beginPath(); ctx.arc(ax, podY - archH + archH * 0.38, sR, Math.PI, 0);
      ctx.rect(ax - sR, podY - archH + archH * 0.38, sR * 2, archH * 0.38); ctx.fill();
      ctx.fillStyle = "rgba(20,14,4,0.52)";
      ctx.beginPath(); ctx.arc(ax, podY - archH + archH * 0.38, sR * 0.82, Math.PI, 0);
      ctx.rect(ax - sR * 0.82, podY - archH + archH * 0.38, sR * 1.64, archH * 0.38); ctx.fill();
    }
    const atticY = podY - archH;
    ctx.fillStyle = "#c0a868"; ctx.fillRect(cxs - archW / 2, atticY - H * 0.14, archW, H * 0.14);
    ctx.strokeStyle = "rgba(150,120,40,0.6)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let li = 0; li < 3; li++) {
      const lx = cxs - archW * 0.35 + li * archW * 0.35;
      ctx.beginPath(); ctx.moveTo(lx, atticY - H * 0.04); ctx.lineTo(lx + archW * 0.28, atticY - H * 0.04); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, atticY - H * 0.09); ctx.lineTo(lx + archW * 0.22, atticY - H * 0.09); ctx.stroke();
    }
    const quadY = atticY - H * 0.14;
    ctx.fillStyle = "#d4b040"; ctx.fillRect(cxs - W * 0.1, quadY - H * 0.11, W * 0.2, H * 0.06);
    for (let hi = 0; hi < 4; hi++) {
      const hx = cxs - W * 0.15 + hi * W * 0.1;
      ctx.fillStyle = "#e0c040"; ctx.beginPath(); ctx.ellipse(hx, quadY - H * 0.14, W * 0.028, H * 0.034, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,240,140,${(0.72 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, quadY - H * 0.18, Math.max(2, s * 0.14), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_mega") {
    // ── LA SPIRE DES MONDES — gratte-ciel futuriste, Art déco ─────────
    const nSt = 3, stH = H * 0.07;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.3 + (i / nSt) * 0.7), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#b0b8c0" : "#c0c8d0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    let currY = baseY - stH;
    const setbacks = [
      { w: W * 0.86, h: H * 0.18, col: "#b8c0cc" },
      { w: W * 0.62, h: H * 0.15, col: "#c0c8d4" },
      { w: W * 0.44, h: H * 0.14, col: "#c8d0dc" },
      { w: W * 0.30, h: H * 0.16, col: "#d0d8e4" },
      { w: W * 0.18, h: H * 0.14, col: "#d8e0ec" }
    ];
    for (const sb of setbacks) {
      ctx.fillStyle = sb.col; ctx.fillRect(cxs - sb.w / 2, currY - sb.h, sb.w, sb.h);
      ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(cxs + sb.w * 0.28, currY - sb.h, sb.w * 0.22, sb.h);
      ctx.fillStyle = `rgba(120,200,255,${(0.55 * glow).toFixed(2)})`;
      ctx.fillRect(cxs - sb.w / 2, currY - sb.h, sb.w, Math.max(1.5, s * 0.024));
      ctx.fillStyle = `rgba(160,220,255,${(0.35 + 0.15 * glow).toFixed(2)})`;
      const nLines = Math.max(2, Math.round(sb.h / Math.max(1, s * 0.1)));
      for (let li = 1; li < nLines; li++) {
        const ly = currY - sb.h + sb.h * (li / nLines);
        ctx.fillRect(cxs - sb.w * 0.42, ly - Math.max(0.5, s * 0.012), sb.w * 0.84, Math.max(1, s * 0.018));
      }
      currY -= sb.h;
    }
    ctx.fillStyle = "#d0d8e8";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.04, currY); ctx.lineTo(cxs - W * 0.008, topY + H * 0.04);
    ctx.lineTo(cxs + W * 0.008, topY + H * 0.04); ctx.lineTo(cxs + W * 0.04, currY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8f0f8";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.006, topY + H * 0.04); ctx.lineTo(cxs, topY); ctx.lineTo(cxs + W * 0.006, topY + H * 0.04); ctx.closePath(); ctx.fill();
    const blinkA = 0.4 + 0.6 * Math.abs(Math.sin(now / 800));
    ctx.fillStyle = `rgba(255,60,60,${blinkA.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(120,200,255,${(0.88 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, currY + setbacks[setbacks.length - 1].h * 0.5, Math.max(1, s * 0.06), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_singularity") {
    // ── L'AXE CIVIQUE — monolithe cristallin, anneau flottant ─────────
    const nSt = 3, stH = H * 0.1;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.2 + (i / nSt) * 0.8), sh = stH / nSt;
      ctx.fillStyle = `rgba(200,230,255,${(0.7 + (i / nSt) * 0.3).toFixed(2)})`;
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, monoW = W * 0.3, monoH = H * 0.54;
    const mGrad = ctx.createLinearGradient(cxs - monoW / 2, 0, cxs + monoW / 2, 0);
    mGrad.addColorStop(0, "rgba(180,220,255,0.95)"); mGrad.addColorStop(0.35, "rgba(240,250,255,0.98)");
    mGrad.addColorStop(0.65, "rgba(200,235,255,0.92)"); mGrad.addColorStop(1, "rgba(160,200,240,0.88)");
    ctx.fillStyle = mGrad; ctx.fillRect(cxs - monoW / 2, podY - monoH, monoW, monoH);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(cxs - monoW * 0.42, podY - monoH, monoW * 0.08, monoH);
    ctx.fillStyle = "rgba(140,190,240,0.7)";
    ctx.beginPath(); ctx.moveTo(cxs - monoW / 2, podY - monoH); ctx.lineTo(cxs - monoW / 2 - W * 0.06, podY - monoH * 0.7);
    ctx.lineTo(cxs - monoW / 2 - W * 0.06, podY); ctx.lineTo(cxs - monoW / 2, podY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.5)";
    ctx.beginPath(); ctx.moveTo(cxs + monoW / 2, podY - monoH); ctx.lineTo(cxs + monoW / 2 + W * 0.06, podY - monoH * 0.7);
    ctx.lineTo(cxs + monoW / 2 + W * 0.06, podY); ctx.lineTo(cxs + monoW / 2, podY); ctx.closePath(); ctx.fill();
    const lineGlow = 0.3 + 0.5 * Math.abs(Math.sin(now / 600 + idx));
    ctx.strokeStyle = `rgba(100,200,255,${lineGlow.toFixed(2)})`; ctx.lineWidth = Math.max(0.5, s * 0.015);
    for (let li = 1; li < 6; li++) {
      const ly = podY - monoH * (li / 6);
      ctx.beginPath(); ctx.moveTo(cxs - monoW * 0.38, ly); ctx.lineTo(cxs + monoW * 0.38, ly); ctx.stroke();
    }
    const ringY = podY - monoH - H * 0.12, ringRx = W * 0.36, ringRy = W * 0.12;
    const ringG = 0.4 + 0.4 * Math.abs(Math.sin(now / 500));
    ctx.strokeStyle = `rgba(80,220,255,${(0.8 * ringG).toFixed(2)})`; ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, ringRx, ringRy, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(200,240,255,${(0.55 * ringG).toFixed(2)})`; ctx.lineWidth = Math.max(0.5, s * 0.015);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, ringRx * 0.8, ringRy * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    const bGrad = ctx.createLinearGradient(cxs, ringY, cxs, topY);
    bGrad.addColorStop(0, `rgba(80,220,255,${(0.7 * glow).toFixed(2)})`); bGrad.addColorStop(1, "rgba(80,220,255,0)");
    ctx.fillStyle = bGrad;
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.024, ringY); ctx.lineTo(cxs + W * 0.024, ringY);
    ctx.lineTo(cxs + W * 0.004, topY); ctx.lineTo(cxs - W * 0.004, topY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(220,245,255,0.95)";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.06, topY + H * 0.06); ctx.lineTo(cxs, topY);
    ctx.lineTo(cxs + W * 0.06, topY + H * 0.06); ctx.lineTo(cxs + W * 0.04, topY + H * 0.1); ctx.lineTo(cxs - W * 0.04, topY + H * 0.1); ctx.closePath(); ctx.fill();
    const prism = 0.6 + 0.4 * Math.sin(now / 300 + idx);
    ctx.fillStyle = `rgba(80,230,255,${(prism * 0.9).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.18), 0, Math.PI * 2); ctx.fill();
  }

  // ── Ornements de palier : chaque rang ajoute sa parure ────────────────────
  if (tier >= 2) {
    // Rang II+ : cercle de torches autour de l'esplanade.
    const nT = 4 + tier;
    for (let ti = 0; ti < nT; ti += 1) {
      const a = (ti / nT) * Math.PI * 2 + 0.4;
      const tx = cxs + Math.cos(a) * plazaRx * 0.82;
      const ty = baseY + Math.sin(a) * plazaRy * 0.82;
      ctx.strokeStyle = "#4a3a22"; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - s * 0.42); ctx.stroke();
      // Scintillement PARTAGÉ (flameFlicker) : `|sin|` donnait un rebond
      // parfaitement métronomique — un feu qui bat la mesure. La somme de sinus
      // déphasés est la recette de tous les autres feux de la carte.
      const fl = flameFlicker(now, ti * 1.9);
      // Rouge feu au corps, cœur d'or : mêmes encres que les braseros bakés des
      // merveilles, sinon le cercle de torches vire à l'ambre à côté d'eux.
      const tr = Math.max(1.5, s * 0.07) * (0.8 + fl * 0.3);
      ctx.fillStyle = `rgba(239,42,11,${(0.55 + fl * 0.45).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(tx, ty - s * 0.46, tr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,188,78,${(0.5 + fl * 0.5).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(tx, ty - s * 0.47, tr * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (tier >= 3) {
    // Rang III+ : stèles satellites encadrant le monument.
    for (const side of [-1, 1]) {
      const ox = cxs + side * W * 0.72;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.ellipse(ox + s * 0.05, baseY + s * 0.03, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#b9a878";
      ctx.beginPath();
      ctx.moveTo(ox - s * 0.1, baseY); ctx.lineTo(ox - s * 0.035, baseY - H * 0.22);
      ctx.lineTo(ox + s * 0.035, baseY - H * 0.22); ctx.lineTo(ox + s * 0.1, baseY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,240,180,0.3)";
      ctx.fillRect(ox - s * 0.08, baseY - H * 0.2, s * 0.04, H * 0.19);
      ctx.fillStyle = `rgba(255,235,140,${(0.6 * glow).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox, baseY - H * 0.24, Math.max(1.5, s * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (tier >= 4) {
    // Rang IV+ : particules dorées en ascension le long du monument.
    for (let pi = 0; pi < 7; pi += 1) {
      const ph = ((now / 2400) + pi / 7) % 1;
      const px = cxs + Math.sin(pi * 2.4 + now / 900) * W * 0.3;
      const py = baseY - ph * H * 1.05;
      ctx.fillStyle = `rgba(255,226,120,${((1 - ph) * 0.65).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(px, py, Math.max(1, s * 0.035) * (1 - ph * 0.5), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (tier >= 5) {
    // Rang V : couronne lumineuse en orbite au sommet.
    const ringY = topY - H * 0.05;
    const spin = now / 1100;
    ctx.strokeStyle = `rgba(255,235,150,${(0.5 + 0.3 * Math.sin(now / 500)).toFixed(2)})`;
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, W * 0.5, W * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    for (let oi = 0; oi < 6; oi += 1) {
      const oa = spin + oi * Math.PI / 3;
      ctx.fillStyle = `rgba(255,245,190,${(0.55 + 0.45 * Math.sin(oa * 2)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cxs + Math.cos(oa) * W * 0.5, ringY + Math.sin(oa) * W * 0.14, Math.max(1.5, s * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Faisceau de lumière nocturne : les merveilles dominent la ville la nuit.
  const nf = CM.nightF || 0;
  if (nf > 0.25) {
    const beamA = (nf - 0.25) * 0.5 * glow;
    const bg = ctx.createLinearGradient(cxs, baseY, cxs, topY - H * 0.6);
    bg.addColorStop(0, `rgba(255,235,150,${(beamA * 0.55).toFixed(3)})`);
    bg.addColorStop(0.6, `rgba(255,235,160,${(beamA * 0.25).toFixed(3)})`);
    bg.addColorStop(1, "rgba(255,235,170,0)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cxs - W * 0.2, baseY);
    ctx.lineTo(cxs - W * 0.42, topY - H * 0.6);
    ctx.lineTo(cxs + W * 0.42, topY - H * 0.6);
    ctx.lineTo(cxs + W * 0.2, baseY);
    ctx.closePath(); ctx.fill();
  }

  // Bannière de dynastie
  ctx.strokeStyle = "#3a2a12"; ctx.lineWidth = Math.max(1.5, s * 0.048);
  ctx.beginPath(); ctx.moveTo(cxs, topY); ctx.lineTo(cxs, topY - H * 0.13); ctx.stroke();
  ctx.fillStyle = tint;
  ctx.beginPath(); ctx.moveTo(cxs, topY - H * 0.13); ctx.lineTo(cxs + W * 0.36, topY - H * 0.075); ctx.lineTo(cxs, topY - H * 0.02); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,240,178,0.52)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
  ctx.beginPath(); ctx.moveTo(cxs, topY - H * 0.13); ctx.lineTo(cxs + W * 0.36, topY - H * 0.075); ctx.lineTo(cxs, topY - H * 0.02); ctx.stroke();

  ctx.globalAlpha = 1;
}

export { drawWonder };
