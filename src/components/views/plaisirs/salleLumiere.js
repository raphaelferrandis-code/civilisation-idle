"use strict";
// ── LA LUMIÈRE DE LA SALLE DE NUIT (2026-10-04) ──────────────────────────────────
// Raph : « s'il fait tout le temps nuit, il faut faire un gros travail de lumière
// dedans ». La salle est toujours de nuit (salleBake.salleNightF) : la lumière ne peut
// plus être un voile bleu uniforme semé de halos. Elle se CALCULE, au pixel de la
// coupe, une fois par cuisson :
//   - la NUIT DEHORS : un bleu de lune, froid, sur le ciel, la rive et l'eau ;
//   - la PÉNOMBRE DEDANS : un fond chaud et bas dans chaque étage — l'intérieur se lit
//     même loin des lampes ;
//   - chaque LAMPE éclaire SA salle (jamais à travers un mur : la carte des lieux de
//     la cuisson dit où elle est) : son halo, puis la flaque au sol sous elle ;
//   - chaque TABLE DE JEU a son cône, du plafond au tapis — la lumière tombe là où se
//     joue l'argent, le reste de la salle reste dans l'ombre.
// La carte est tramée (Bayer, sept crans) : une lumière de pixel art, pas un dégradé.
// Elle se pose en MULTIPLY sur la coupe (personnages compris) : ce qui est dans la
// lumière garde ses couleurs, le reste plonge dans la nuit. Les RAIS des cônes, eux, se
// posent en ajout (une poussière lumineuse dans l'air).
//
// Pur calcul de pixels ; les toiles se fabriquent ici (dans le navigateur seulement).

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16;
const rgb = (c) => {
  const n = parseInt(String(c || '#ffd08a').slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// La nuit dehors, la pénombre dedans (facteurs de multiply, 0-1).
const DEHORS = [0.17, 0.19, 0.34];
const DEDANS = [0.34, 0.27, 0.29];
// Les crans de la trame.
const CRANS = 7;
// Les âges de LUMIÈRE (7-9 : jade, nacre et or, cristal) sont déjà clairs : leurs lampes
// éclairent moins fort, leur pénombre est plus froide (sinon tout blanchit).
const DEDANS_LUMIERE = [0.27, 0.25, 0.34];
const LAMPES = (band) => (band >= 7 ? 0.62 : 1);
// Les salles où l'on JOUE : leur table a son cône de lumière.
const TABLES = new Set(['des', 'cartes', 'salon', 'machines', 'tickets', 'icare', 'boutique']);
const LUMIERE_TABLE = '#ffe6b0';
// LA SCÈNE (Raph, 2026-10-04 : « la scène doit être mieux illuminée ») : pas de lustre
// devant la toile, mais la RAMPE qui éclaire la troupe d'en bas et la HERSE qui lave
// toute la cage de scène — les planches et les danseuses en pleine lumière, le fond de
// scène dans un demi-jour chaud.
const LUMIERE_SCENE = '#ffe2b0';

// Le plancher d'une salle (la ligne où posent les pieds), depuis sa boîte.
const solDe = (box) => box.y1 - 7;

export function bakeLumiere(bake) {
  if (typeof document === 'undefined' || !bake) return null;
  const { W, H } = bake;
  const ids = bake.ids || [];
  // Le dehors (ciel, horizon, eau) : la lumière n'y tombe pas.
  const fond = bake.fond || new Uint8Array(W * H);
  const I0 = LAMPES(bake.band | 0), dedansAmb = (bake.band | 0) >= 7 ? DEDANS_LUMIERE : DEDANS;
  const LH = (bake.hd && bake.hd.floorH) || 81;
  const L = new Float32Array(W * H * 3);
  const touche = new Uint8Array(W * H);                        // une lumière s'y ajoute
  // Les étages : l'intérieur de chaque niveau (sa largeur, sa hauteur sans la charpente).
  const etages = (bake.levels || []).map((lv) => ({ x0: Math.round(lv.cx - lv.w / 2), x1: Math.round(lv.cx + lv.w / 2), y0: lv.yT, y1: lv.yT + LH - 9 }));
  const etageDe = (x, y) => etages.findIndex((e) => x >= e.x0 && x < e.x1 && y >= e.y0 && y < e.y1);
  const dedans = (k, x, y) => !fond[k] && (ids[k] != null || etageDe(x, y) >= 0);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const k = y * W + x, a = dedans(k, x, y) ? dedansAmb : DEHORS;
      L[k * 3] = a[0]; L[k * 3 + 1] = a[1]; L[k * 3 + 2] = a[2];
    }
  }
  // Ajoute une lumière elliptique (centre, rayons, couleur, intensité), limitée aux
  // pixels que `ok(k, x, y)` accepte (la salle de la lampe).
  const ajoute = (cx, cy, rx, ry, col, I, ok) => {
    for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x += 1) {
        const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (q >= 1) continue;
        const k = y * W + x;
        if (fond[k] || (ok && !ok(k, x, y))) continue;
        touche[k] = 1;
        const f = I * I0 * (1 - q) ** 1.6;
        L[k * 3] += col[0] * f; L[k * 3 + 1] += col[1] * f; L[k * 3 + 2] += col[2] * f;
      }
    }
  };
  // Le lieu d'un point : sa salle (id), sinon son étage (le hall, les couloirs).
  const memeLieu = (x, y) => {
    const id = ids[Math.round(y) * W + Math.round(x)];
    if (id != null) return (k) => ids[k] === id;
    const e = etageDe(x, y);
    if (e < 0) return null;                                   // la verrière, le dehors : libre
    const E = etages[e];
    return (k, px, py) => ids[k] == null && px >= E.x0 && px < E.x1 && py >= E.y0 && py < E.y1;
  };
  // Les LAMPES : le halo autour de la flamme, la flaque sous elle. Hors des étages (la
  // verrière, le toit), une lumière douce et courte, sans flaque : plus forte, elle
  // délavait le verre, qui doit rester la nuit.
  for (const p of bake.lights || []) {
    const col = rgb(p.c), ok = memeLieu(p.x, p.y);
    const id = ids[Math.round(p.y) * W + Math.round(p.x)];
    const libre = id == null && etageDe(p.x, p.y) < 0;
    if (libre) { ajoute(p.x, p.y, 26, 22, col, 0.5, null); continue; }
    ajoute(p.x, p.y, 38, 30, col, 0.95, ok);
    const box = id && bake.spots[id] ? bake.spots[id].box : null;
    const sol = box ? solDe(box) : p.y + 40;
    ajoute(p.x, sol, 52, 16, col, 0.55, ok);
  }
  // La CLARTÉ de la scène peinte (sa luminance moyenne) dose les effets de la vue : une
  // scène sombre (le fond de nuit du Fonte) prend les poursuites et leur halo en plein,
  // une scène déjà vive (les ampoules du néon) les prend légers, sinon la troupe délave.
  let scene = null;
  const sc = bake.spots && bake.spots.scene;
  if (sc) {
    const b = sc.box, ok = (k) => ids[k] === 'scene', sol = solDe(b), large = b.x1 - b.x0, col = rgb(LUMIERE_SCENE);
    // (Pleine intensité à tous les âges : la baisse des âges de lumière vaut pour leurs
    // lampes, pas pour la troupe.)
    ajoute(sc.x, sol, large * 0.62, 46, col, 1.15 / I0, ok);
    ajoute(sc.x, (b.y0 + sol) / 2, large * 0.72, (sol - b.y0) * 0.95, col, 0.6 / I0, ok);
    const R = bake.R && bake.R.data;
    let somme = 0, n = 0;
    if (R) {
      for (let y = b.y0 + 10; y < sol; y += 1) {
        for (let x = b.x0 + 10; x < b.x1 - 10; x += 1) {
          const q = (y * W + x) * 4;
          somme += (0.299 * R[q] + 0.587 * R[q + 1] + 0.114 * R[q + 2]) / 255;
          n += 1;
        }
      }
    }
    const clarte = n ? somme / n : 0.3;
    scene = { clarte, effets: Math.max(0.25, Math.min(1, (0.5 - clarte) / 0.18)) };
  }
  // Les CÔNES des tables : du plafond au tapis, plus large en bas ; le tapis lui-même
  // brille. Les rais (la lumière vue dans l'air) se cuisent à part.
  const cones = [];
  const lt = rgb(LUMIERE_TABLE);
  for (const [id, s] of Object.entries(bake.spots || {})) {
    if (!TABLES.has(id)) continue;
    const box = s.box, haut = box.y0 + 10, sol = solDe(box), ok = (k) => ids[k] === id;
    const demi = (y) => 5 + ((y - haut) / Math.max(1, sol - haut)) * 34;
    for (let y = haut; y <= sol; y += 1) {
      const hw = demi(y);
      for (let x = Math.max(box.x0, Math.floor(s.x - hw)); x <= Math.min(box.x1 - 1, Math.ceil(s.x + hw)); x += 1) {
        const k = y * W + x;
        if (fond[k] || !ok(k)) continue;
        const u = Math.abs(x - s.x) / hw, f = 0.42 * I0 * (1 - u * u);
        touche[k] = 1;
        L[k * 3] += lt[0] * f; L[k * 3 + 1] += lt[1] * f; L[k * 3 + 2] += lt[2] * f;
      }
    }
    ajoute(s.x, sol - 10, 40, 12, lt, 0.5, ok);
    cones.push({ x: s.x, haut, sol, demiHaut: 5, demiBas: 39 });
  }
  // La carte, tramée en sept crans.
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const k = y * W + x, b = bayer(x, y);
      for (let c = 0; c < 3; c += 1) {
        const v = Math.min(1, L[k * 3 + c]);
        d[k * 4 + c] = touche[k] ? Math.round(Math.min(1, Math.floor(v * CRANS + b) / CRANS) * 255) : Math.round(v * 255);
      }
      d[k * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Les RAIS des cônes : une poussière de lumière dans l'air, tramée elle aussi.
  const rais = document.createElement('canvas');
  rais.width = W; rais.height = H;
  const gr = rais.getContext('2d');
  const ri = gr.createImageData(W, H), rd = ri.data;
  for (const c of cones) {
    for (let y = c.haut; y <= c.sol; y += 1) {
      const t = (y - c.haut) / Math.max(1, c.sol - c.haut), hw = c.demiHaut + (c.demiBas - c.demiHaut) * t;
      for (let x = Math.floor(c.x - hw); x <= Math.ceil(c.x + hw); x += 1) {
        if (x < 0 || x >= W) continue;
        const u = Math.abs(x - c.x) / hw;
        // Plus dense au cœur et vers le haut (la source), effiloché sur les bords.
        const dens = (1 - u) * (1 - t * 0.6);
        if (bayer(x, y) > dens * 0.5) continue;
        const k = (y * W + x) * 4;
        rd[k] = 255; rd[k + 1] = 226; rd[k + 2] = 170; rd[k + 3] = Math.round(40 + 55 * dens);
      }
    }
  }
  gr.putImageData(ri, 0, 0);
  return { cv, rais, dehors: DEHORS, cones, scene, lueur: (bake.band | 0) >= 7 ? 0.5 : 1 };
}

// La couleur de la nuit dehors, pour les bandes hors de la coupe (CSS rgb()).
export const dehorsCss = () => `rgb(${DEHORS.map((v) => Math.round(v * 255)).join(',')})`;
