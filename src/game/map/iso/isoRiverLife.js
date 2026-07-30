/* ---- La vie de la SURFACE de l'eau ---- */
//
// Le fleuve avait déjà ses poissons en ombre, ses roseaux, son bas-fond et ses
// bateaux. Il lui manquait ce qui se passe SUR l'eau, à la seconde près : la
// pluie qui la crible, ce qui dérive au fil du courant, ce que les riverains y
// ont laissé, et le poisson qui saute.
//
// ⚠ MODULE À PART, ET C'EST DÉLIBÉRÉ. isoRenderer.js fait 7000 lignes et
// plusieurs sessions y travaillent en même temps — la texture d'eau y est en
// chantier au moment où ceci est écrit. Tout tenir ici réduit le contact à un
// import et une ligne d'appel. Même geste que isoPlaza.js et isoBridge.js.
//
// ⚠ AUCUN ÉTAT ENTRE LES FRAMES : tout est fonction de (now, hash). C'est ce qui
// rend les captures reproductibles et évite une file d'objets à faire vivre. La
// contrepartie est qu'on ne peut pas « lancer » un événement : on lit une
// horloge et on en déduit ce qui doit être visible.
//
// ⚠ Ce module n'importe RIEN d'isoRenderer : il l'importe déjà (cycle ES = zone
// morte, piège payé deux fois sur ce chantier). isoRenderer POUSSE sa config.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';

const CFG = { ribbonPath: null, precipKind: () => 'rain' };
export function configureRiverLife(o) { Object.assign(CFG, o); }

// Molette : __riverLife({ on, rain, leaves, props, jumps }).
export const riverLifeTune = { on: true, rain: 1, leaves: 1, props: 1, jumps: 1 };
// Diagnostic (__riverLifeStats) : ce qui a VRAIMENT été peint à la dernière
// frame. Une couche qui ne dessine rien et une couche qui dessine hors champ
// donnent la même image ; seuls ces compteurs les séparent.
const stats = { rings: 0, ringsSkipped: 0, leaves: 0, floats: 0, jump: 0, why: '' };
if (typeof window !== 'undefined') {
  window.__riverLife = (o) => { if (o) Object.assign(riverLifeTune, o); return { ...riverLifeTune }; };
  window.__riverLifeStats = () => ({ ...stats });
}

// Hash → [0,1). ⚠ Toujours >>> 0 : le cmHash maison rend du SIGNÉ et les modulos
// sortiraient négatifs (rayons négatifs = ellipse() qui jette, alphas écrasés).
// On garde ici une version locale pour ne dépendre de rien.
function h32(n) {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

// Point du ruban à la position t ∈ [0,1] et au décalage transversal lat ∈ [-1,1].
function ribbonPoint(sm, t, lat) {
  const fi = Math.max(0, Math.min(1, t)) * (sm.length - 1);
  const i0 = Math.max(0, Math.min(sm.length - 2, Math.floor(fi)));
  const f = fi - i0;
  const a = sm[i0], b = sm[i0 + 1];
  const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
  let nx = -(b.y - a.y), ny = b.x - a.x;
  const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
  const hw = (a.hw || 2) * 0.82;                 // marge : rien ne mord la berge
  return { x: x + nx * lat * hw, y: y + ny * lat * hw };
}

const S = (p, T) => worldToScreen(p.x * T, p.y * T);

// ── Portion du ruban RÉELLEMENT à l'écran ───────────────────────────────────
// ⚠ Sans ça, rien ne se voit. Le ruban traverse toute la carte : semer 46
// impacts de pluie sur [0,1] au zoom de jeu en met 45 hors champ et un seul
// devant les yeux — mesuré exactement, compteur à l'appui, avant de comprendre.
// On calcule donc la plage de t visible et on sème DEDANS. La densité devient
// celle de ce qu'on regarde, plus celle d'un fleuve dont on ne voit qu'un
// vingtième.
//
// Ne concerne QUE les éléments sans mémoire (pluie, feuilles, saut) : les
// bouées, elles, sont des points de repère ancrés au layout et doivent rester
// où elles sont quand la caméra bouge, quitte à en croiser peu.
export function visibleT(sm, T) {
  const M = 60;                                  // marge écran, en px
  let t0 = 1, t1 = 0, seen = false;
  // Un échantillon sur trois suffit à cadrer la plage, et coûte trois fois moins.
  for (let i = 0; i < sm.length; i += 3) {
    const p = worldToScreen(sm[i].x * T, sm[i].y * T);
    if (p.x < -M || p.x > CM.cw + M || p.y < -M || p.y > CM.ch + M) continue;
    const t = i / (sm.length - 1);
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
    seen = true;
  }
  if (!seen) return null;                        // le fleuve est hors champ
  const pad = 0.02;
  return { t0: Math.max(0, t0 - pad), t1: Math.min(1, t1 + pad) };
}

// ── 1. RONDS DE PLUIE ───────────────────────────────────────────────────────
// L'averse existait déjà, mais elle ne TOUCHAIT pas l'eau : le rideau tombait
// devant un fleuve parfaitement lisse. Ce sont les impacts, plus que les
// gouttes, qui disent qu'il pleut.
// Chaque impact a son horloge propre ; l'anneau naît net et petit, s'élargit et
// s'efface. En NEIGE il n'y en a aucun — un flocon ne crible pas l'eau.
function drawRainRings(ctx, sm, T, z, now, rainF, vis) {
  const k = riverLifeTune.rain;
  stats.rings = 0; stats.ringsSkipped = 0; stats.why = '';
  if (k <= 0 || rainF <= 0.02) { stats.why = 'rainF=' + rainF + ' k=' + k; return; }
  const kind = CFG.precipKind(CM.season, rainF);
  if (kind !== 'rain') { stats.why = 'precip=' + kind; return; }
  const n = Math.round(46 * rainF * k);
  const s = T * z;
  const t = now || 0;
  ctx.lineWidth = Math.max(1, s * 0.012);
  for (let i = 0; i < n; i += 1) {
    const P = 620 + h32(i * 7 + 1) * 520;              // durée de vie de l'anneau
    const ph = ((t + h32(i * 13 + 2) * P) % P) / P;    // 0 → 1
    // Position RETIRÉE À CHAQUE CYCLE : sans le numéro de cycle dans le hash,
    // les impacts retomberaient éternellement aux mêmes 46 points et l'œil
    // verrait un motif clignoter au lieu d'une averse.
    const cyc = Math.floor((t + h32(i * 13 + 2) * P) / P);
    const g = i * 977 + cyc * 31;
    const p = ribbonPoint(sm, vis.t0 + h32(g + 3) * (vis.t1 - vis.t0), h32(g + 4) * 2 - 1);
    const sc = S(p, T);
    if (sc.x < -20 || sc.x > CM.cw + 20 || sc.y < -20 || sc.y > CM.ch + 20) { stats.ringsSkipped += 1; continue; }
    const r = s * (0.03 + ph * 0.20);
    const a = (1 - ph) * (1 - ph) * 0.42 * rainF;
    if (a < 0.01) { stats.ringsSkipped += 1; continue; }
    stats.rings += 1;
    ctx.strokeStyle = `rgba(214,232,240,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(sc.x, sc.y, r, r * 0.5, 0, 0, Math.PI * 2);   // au SOL : écrasé de moitié
    ctx.stroke();
  }
}

// ── 2. FEUILLES À LA DÉRIVE ─────────────────────────────────────────────────
// Seulement des feuilles (Raph) : pas de détritus, quelle que soit l'ère. Deux
// ou trois pixels qui descendent le courant — c'est le seul élément qui rend le
// SENS du fleuve lisible quand aucun bateau ne passe.
const LEAF_COL = ['170,120,58', '150,96,44', '124,110,52', '178,142,72'];
function drawLeaves(ctx, sm, T, z, now, vis) {
  const k = riverLifeTune.leaves;
  if (k <= 0) return;
  // 14 dans la PORTION VISIBLE, pas sur le ruban entier. La dérive se fait donc
  // à l'intérieur de la fenêtre : une feuille sort par un bord et une autre
  // entre par l'opposé, ce qui donne la même lecture qu'un vrai flux sans en
  // simuler des centaines dont on ne verrait jamais aucune.
  const n = Math.round(14 * k);
  const s = T * z;
  const t = (now || 0) / 1000;
  const span = vis.t1 - vis.t0;
  for (let i = 0; i < n; i += 1) {
    const speed = 0.010 + h32(i * 5 + 11) * 0.012;    // fraction de ruban / s
    let u = (h32(i * 3 + 7) + t * speed / Math.max(0.02, span)) % 1;
    if (u < 0) u += 1;
    const tt = vis.t0 + u * span;
    // Voie transversale qui ONDULE : une feuille ne descend pas au cordeau.
    const lat = (h32(i * 9 + 13) * 2 - 1) * 0.8 + Math.sin(t * 0.5 + h32(i) * 6.28) * 0.08;
    const p = ribbonPoint(sm, tt, lat);
    const sc = S(p, T);
    if (sc.x < -10 || sc.x > CM.cw + 10 || sc.y < -10 || sc.y > CM.ch + 10) continue;
    stats.leaves += 1;
    const px = Math.max(1, Math.round(s * 0.035));
    ctx.fillStyle = `rgba(${LEAF_COL[i % LEAF_COL.length]},0.72)`;
    ctx.fillRect(Math.round(sc.x - px / 2), Math.round(sc.y - px / 2), px, Math.max(1, Math.round(px * 0.6)));
  }
}

// ── 3. CE QUE LES RIVERAINS ONT LAISSÉ ──────────────────────────────────────
// Bouées et nasses, ancrées près d'une berge et immobiles à part le clapot.
// Contrairement à tout le reste ici, leur position ne dépend PAS du temps mais
// du layout : ce sont des points de repère, ils doivent être au même endroit
// d'une frame à l'autre et d'une session à l'autre.
function drawFloats(ctx, sm, T, z, now) {
  const k = riverLifeTune.props;
  if (k <= 0 || z < 0.55) return;                    // sous ce zoom, 2 px illisibles
  const seed = (CM.layoutRecomputeAt || 0) % 100000;
  const n = Math.round(12 * k);
  const s = T * z;
  const t = now || 0;
  for (let i = 0; i < n; i += 1) {
    const g = i * 613 + seed;
    const side = h32(g + 1) < 0.5 ? -1 : 1;
    const p = ribbonPoint(sm, 0.06 + h32(g + 2) * 0.88, side * (0.62 + h32(g + 3) * 0.3));
    const sc = S(p, T);
    if (sc.x < -14 || sc.x > CM.cw + 14 || sc.y < -14 || sc.y > CM.ch + 14) continue;
    stats.floats += 1;
    const bob = Math.sin(t / 900 + h32(g + 4) * 6.28) * s * 0.018;
    const y = sc.y + bob;
    const r = Math.max(1, s * 0.05);
    const nasse = h32(g + 5) < 0.4;
    // Ombre portée sur l'eau : sans elle, le prop a l'air collé au ruban.
    ctx.fillStyle = 'rgba(10,25,35,0.22)';
    ctx.beginPath();
    ctx.ellipse(sc.x, sc.y + r * 0.5, r * 1.2, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (nasse) {
      ctx.fillStyle = '#6b5a3a';                     // casier d'osier, à peine émergé
      ctx.fillRect(Math.round(sc.x - r), Math.round(y - r * 0.5), Math.max(1, Math.round(r * 2)), Math.max(1, Math.round(r)));
      ctx.fillStyle = 'rgba(212,200,170,0.5)';
      ctx.fillRect(Math.round(sc.x - r), Math.round(y - r * 0.5), Math.max(1, Math.round(r * 2)), 1);
    } else {
      ctx.fillStyle = h32(g + 6) < 0.5 ? '#b6483a' : '#c8983a';   // bouée
      ctx.beginPath();
      ctx.ellipse(sc.x, y, r, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(240,236,224,0.75)';      // liseré clair, lisible de loin
      ctx.fillRect(Math.round(sc.x - r), Math.round(y - 1), Math.max(1, Math.round(r * 2)), 1);
    }
  }
}

// ── 4. LE POISSON QUI SAUTE ─────────────────────────────────────────────────
// Rare et bref : un saut toutes les ~34 s, moins d'une demi-seconde en l'air.
// C'est l'événement qu'on n'attend pas et qu'on est content d'avoir vu — donc il
// ne doit surtout PAS revenir souvent. Le numéro de saut vient de l'horloge, sa
// place d'un hash de ce numéro : deux sauts de suite ne sont jamais au même
// endroit, et une capture reste reproductible.
const JUMP_PERIOD = 34000, JUMP_MS = 460;
function drawFishJump(ctx, sm, T, z, now, vis) {
  const k = riverLifeTune.jumps;
  if (k <= 0 || z < 0.5) return;
  const t = now || 0;
  const idx = Math.floor(t / JUMP_PERIOD);
  const ph = (t % JUMP_PERIOD) / JUMP_MS;
  if (ph > 1) return;                                 // l'essentiel du temps : rien
  // DANS le champ, et c'est essentiel : un saut toutes les 34 secondes tiré sur
  // tout le ruban se produirait presque toujours hors de l'écran, et le joueur
  // n'en verrait jamais un seul de sa partie.
  const p = ribbonPoint(sm, vis.t0 + h32(idx * 17 + 1) * (vis.t1 - vis.t0), (h32(idx * 17 + 2) * 2 - 1) * 0.7);
  const sc = S(p, T);
  if (sc.x < -30 || sc.x > CM.cw + 30 || sc.y < -30 || sc.y > CM.ch + 30) return;
  stats.jump += 1;
  const s = T * z;
  // Cloche : sort de l'eau, culmine, y retombe.
  const lift = Math.sin(ph * Math.PI) * s * 0.30;
  const dir = h32(idx * 17 + 3) < 0.5 ? -1 : 1;
  const x = sc.x + dir * (ph - 0.5) * s * 0.34;
  const y = sc.y - lift;
  // Anneaux au départ ET à l'arrivée : c'est l'eau qui raconte le saut.
  for (const [when, at] of [[0, 0], [1, 1]]) {
    const d = ph - when;
    if (d < 0 || d > 0.55) continue;
    const q = d / 0.55;
    const rx = sc.x + at * dir * s * 0.17;
    const r = s * (0.04 + q * 0.16);
    ctx.strokeStyle = `rgba(214,232,240,${((1 - q) * 0.5).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, s * 0.014);
    ctx.beginPath();
    ctx.ellipse(rx, sc.y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const px = Math.max(1, Math.round(s * 0.05));
  ctx.fillStyle = 'rgba(196,206,196,0.92)';           // le poisson, de flanc
  ctx.fillRect(Math.round(x - px), Math.round(y - px / 2), px * 2, px);
  ctx.fillStyle = 'rgba(232,240,236,0.75)';           // éclat sur le dos
  ctx.fillRect(Math.round(x - px), Math.round(y - px / 2), px * 2, 1);
}

/**
 * Vie de surface, appelée juste après le fleuve et AVANT les bateaux : la pluie
 * crible l'eau, pas les coques.
 */
export function drawIsoRiverLife(now) {
  if (!riverLifeTune.on) return;
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || rv.samples.length < 2) return;
  if (CM.lodActive) return;                           // dézoomé : que du bruit de 1 px
  const k = CM.ambianceK ?? 1;
  if (k <= 0) return;
  const ctx = CM.ctx, T = CM.TILE, z = CM.cam.zoom, sm = rv.samples;
  const vis = visibleT(sm, T);
  if (!vis) return;                                   // fleuve hors champ
  stats.leaves = 0; stats.floats = 0; stats.jump = 0;
  ctx.save();
  if (CFG.ribbonPath) { CFG.ribbonPath(ctx, sm, T); ctx.clip(); }   // tout reste SUR l'eau
  const prevA = ctx.globalAlpha;
  if (k < 1) ctx.globalAlpha = prevA * k;
  drawFloats(ctx, sm, T, z, now);
  drawLeaves(ctx, sm, T, z, now, vis);
  drawFishJump(ctx, sm, T, z, now, vis);
  drawRainRings(ctx, sm, T, z, now, CM.rainF || 0, vis);
  ctx.globalAlpha = prevA;
  ctx.restore();
}
