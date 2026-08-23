// LA PASSE AÉRIENNE — oiseaux et drones. Extraite d'isoRenderer.js le 2026-08-23
// (Q10, découpage).
//
// Les deux partagent la même situation : ils volent AU-DESSUS du tri peintre, donc
// ils ne participent pas à la profondeur des unités au sol et se dessinent en fin
// de frame. C'est ce qui en fait une tranche extractible d'un bloc.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Le bloc est déplacé tel quel ; la
// couture a été mesurée avant la coupe (2 sortants, 2 entrants — `_frac`/`_rnd`,
// partis dans isoMath.js pour éviter un import circulaire). Vérifié par comparaison
// ligne à ligne avec la version commitée.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { ensureDrone, drawDroneRotors, VEH_SCALE } from '../agents.js';
import { _frac, _rnd } from './isoMath.js';

// ── OISEAUX : nuée qui traverse le ciel ─────────────────────────────────────
// Passe AÉRIENNE sur le modèle des drones : position monde → worldToScreen pour
// l'ombre au sol, puis l'oiseau dessiné en altitude au-dessus. Sans cette ombre,
// il flotte hors du monde.
// Sans état : la nuée est une fonction PURE de (now, graine de nuée). Le numéro
// de nuée vient du temps, sa trajectoire d'un hachage de ce numéro → deux
// traversées ne se ressemblent pas, et une capture reste reproductible.
// Trajectoire ancrée sur le CENTRE DE LA VILLE (monde) et non sur l'écran : une
// nuée calée sur le viewport glisserait avec la caméra.
// Molette : __birds({ on, period, cross, size }).
const BIRD_TUNE = { on: true, period: 82000, cross: 15000, size: 1 };
if (typeof window !== 'undefined') {
  window.__birds = (o) => { if (o) Object.assign(BIRD_TUNE, o); return { ...BIRD_TUNE }; };
}
// Ancre de la traversée en cours (cf. drawIsoBirds) : le SEUL état de la couche.
let _birdAnchor = { idx: -1, ax: 0, ay: 0 };

export function drawIsoBirds(now) {
  CM._birdsOn = false;
  const L = CM.layout;
  if (!BIRD_TUNE.on || !L || CM.lodActive) return;
  const k = CM.ambianceK ?? 1;
  if (k <= 0) return;
  // Les oiseaux rentrent au crépuscule et ne volent pas en pleine nuit.
  const n = CM.nightF || 0;
  const dayK = n < 0.1 ? 0.75 : n < 0.45 ? 1 : n < 0.7 ? (0.7 - n) / 0.25 : 0;
  if (dayK <= 0.02) return;
  const t = now || 0;
  const T = CM.TILE, z = CM.cam.zoom, ctx = CM.ctx;
  const idx = Math.floor(t / BIRD_TUNE.period);
  const ph = (t % BIRD_TUNE.period) / BIRD_TUNE.cross;   // > 1 = ciel vide, l'essentiel du temps
  if (ph > 1) return;
  const sd = _rnd(idx, 1), sd2 = _rnd(idx, 2), sd3 = _rnd(idx, 3);
  // Ancre de la traversée : la position monde de la CAMÉRA au moment où la nuée
  // décolle, figée pour toute la traversée. Ancrée sur le centre de la ville, la
  // nuée passait presque toujours hors champ (la caméra n'en voit qu'un bout) ;
  // recalculée à chaque frame, elle glisserait avec la caméra. On la fige donc
  // une fois par numéro de nuée.
  if (_birdAnchor.idx !== idx) _birdAnchor = { idx, ax: CM.cam.x, ay: CM.cam.y };
  // Portée = un peu plus large que le champ visible : la nuée entre par un bord
  // et sort par l'autre, quel que soit le zoom.
  const span = (CM.cw / Math.max(0.2, z)) * 1.5;
  const dir = sd2 < 0.5 ? 1 : -1;
  // Décalage latéral MODÉRÉ : trop large, la traversée passe hors du champ et le
  // joueur ne voit jamais rien, ce qui est le défaut par défaut de cette couche.
  const off = (sd3 - 0.5) * span * 0.12;
  const wx = _birdAnchor.ax + dir * (ph - 0.5) * span;
  const wy = _birdAnchor.ay - dir * (ph - 0.5) * span * 0.5 + off;
  const alt = T * z * (2.6 + sd * 1.6);                  // altitude apparente, en px écran
  const count = 5 + Math.floor(sd * 5);                  // nuée de 5 à 9
  // Taille d'un bloc d'oiseau (l'oiseau en fait 3 de large). Plancher à 3 px :
  // au-dessous, la silhouette se perd dans le grain des toits — l'oiseau vole
  // au-dessus d'une ville en pixel art, jamais sur un ciel vide. C'est la même
  // erreur d'échelle que les fenêtres allumées et les premières bouffées de fumée.
  const px = Math.max(3, Math.round(T * z * 0.16 * BIRD_TUNE.size));
  // Fondu aux deux bouts : la nuée entre et sort du champ sans apparaître d'un coup.
  const edge = Math.min(1, Math.min(ph, 1 - ph) / 0.12);
  const a = 0.8 * dayK * k * edge;
  if (a < 0.03) return;
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    // Formation en V : rang i de part et d'autre du chef.
    const rank = Math.ceil(i / 2), side = i % 2 === 0 ? 1 : -1;
    const bwx = wx - dir * rank * T * 0.75;
    const bwy = wy + side * rank * T * 0.62;
    const g = worldToScreen(bwx, bwy);
    if (g.x < -40 || g.x > CM.cw + 40 || g.y < -40 || g.y > CM.ch + alt + 40) continue;
    drawn += 1;
    // Ombre au sol : elle file sur les toits et l'herbe, c'est elle qui pose
    // l'oiseau DANS le monde plutôt qu'au-dessus de l'image.
    ctx.fillStyle = `rgba(0,0,0,${(0.10 * a * 2).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, px * 1.6, px * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Battement : 2 poses alternées, déphasées par individu → la nuée ne bat pas
    // d'un seul homme. Ailes hautes = deux pixels en V, ailes basses = un trait.
    const up = _frac(t / 220 + i * 0.37) < 0.5;
    const by = g.y - alt + Math.sin(t / 700 + i) * T * z * 0.08;
    ctx.fillStyle = `rgba(38,36,42,${a.toFixed(3)})`;
    if (up) {
      ctx.fillRect(Math.round(g.x - px * 1.5), Math.round(by - px), px, px);
      ctx.fillRect(Math.round(g.x + px * 0.5), Math.round(by - px), px, px);
      ctx.fillRect(Math.round(g.x - px * 0.5), Math.round(by), px, px);
    } else {
      ctx.fillRect(Math.round(g.x - px * 1.5), Math.round(by), px * 3, px);
    }
  }
  CM._birdsOn = drawn > 0;
}

// ── DRONES : passe aérienne (sprite top-down pivoté au cap projeté) ──────────
export function drawIsoDrones(now) {
  if (CM.lodActive) return;
  const T = CM.TILE, z = CM.cam.zoom, s = T * z, ctx = CM.ctx;
  let dchr = null;
  for (const v of CM.vehicles) {
    if (v.type !== 'drone') continue;
    if (!dchr) dchr = ensureDrone();
    const p = worldToScreen(v.x, v.y);
    if (p.x < -s || p.y < -s * 2 || p.x > CM.cw + s || p.y > CM.ch + s) continue;
    const t2 = now || 0;
    const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
    const dScale = (CM.droneSize || 0.58) * VEH_SCALE;   // le drone est un véhicule : même échelle
    // Ombre AU SOL (à la position projetée), drone en altitude au-dessus.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s * dScale * 0.2, s * dScale * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (!(dchr && dchr.ready && dchr.img)) continue;
    const q = worldToScreen(v.tx, v.ty);
    let hx = q.x - p.x, hy = q.y - p.y;
    const hd = Math.hypot(hx, hy);
    if (hd > 0.5) { hx /= hd; hy /= hd; } else { hx = 1; hy = 0; }
    const dsz = s * dScale;
    const prevSm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(p.x, p.y - s * 0.55 + hover);
    ctx.rotate(Math.atan2(hy, hx) + Math.PI / 2);
    ctx.drawImage(dchr.img, -dsz / 2, -dsz / 2, dsz, dsz);
    drawDroneRotors(ctx, dsz, t2, v.x * 0.1);
    ctx.restore();
    ctx.imageSmoothingEnabled = prevSm;
  }
}
