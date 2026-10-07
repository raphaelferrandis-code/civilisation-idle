// LES OISEAUX POSÉS QUI S'ENVOLENT (docs/PLAN-MAQUETTE-VIVANTE.md §9, lot V2).
//
// Réponse de Raph (2026-10-01) : « posés, puis envolés » — des pigeons sur les
// places, des mouettes sur les quais ; ils picorent, et s'envolent quand quelqu'un
// approche. PAS de volée qui traverse le ciel (celle d'isoSky.js s'efface).
//
// C'est la seule couche de la petite vie qui a un ÉTAT : un oiseau dérangé part au
// moment où le passant arrive, ce qu'aucune fonction du temps ne peut prévoir. L'état
// est minuscule (une volée = un poste, une heure de départ, un poste d'arrivée) et se
// jette au moindre recalcul de la ville. En CAPTURE il est gelé : les volées sont au
// sol (ou au point de vol forcé par `__vie({ envol: 0..1 })`), pour que deux captures
// du même instant restent identiques.
//
// Posés, ils passent par le tri du peintre (acteurs 'vie') ; en vol, par la passe
// aérienne (au-dessus des toits).
import { CM, cmHash } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { isoFrontOffset } from './isoGroundDetail.js';
import { isoPlazaCompositions, propFootprint, footClash, lampFootprint } from './isoPlaza.js';
import { figNear } from '../figures.js';
import { VIE, vieK, vieZoomFade, vieSprite, vieBlit, vieCount, registerVieActors, registerVieAir, vieOccupied, drawnBoxOf, inkTopAt } from './isoVie.js';
import { hash01Lowbias as h32 } from '../hash.js';
// Le guichet du paysage sonore : un module-FEUILLE (aucun import), sans risque de cycle.
import { noteSon, noteEmetteur } from '../../audio/paysage/evenements.js';

const bandOf = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);

// ── LES POSTES ──────────────────────────────────────────────────────────────
// Pigeons : sur chaque place, les cases LIBRES de mobilier (empreintes de
// isoPlaza, marge ×1,4) — jamais sur la fontaine ni sous un étal. Mouettes : sur la
// promenade des quais, un pas en retrait du bord, là où le mur est tracé.
function plazaSpots(L, band) {
  const out = [];
  for (const comp of isoPlazaCompositions(L, band) || []) {
    const b = comp.box;
    if (!b) continue;
    const taken = [];
    // ⚠ Le mobilier est en PIXELS MONDE (wx = tuiles × TILE), pas en tuiles : lu tel
    // quel, aucune empreinte ne tombait sur la place et les pigeons se posaient
    // dans la fontaine.
    const T = CM.TILE;
    for (const p of comp.props || []) if (p.prop !== 'person') taken.push(propFootprint(p.wx / T, p.wy / T, p.prop, p.hT || 0.5));
    for (const lp of comp.lamps || []) taken.push(lampFootprint(lp.gx + 0.5, lp.gy + 0.5));
    const spots = [];
    for (let gy = b.gy0; gy <= b.gy1; gy += 1) {
      for (let gx = b.gx0; gx <= b.gx1; gx += 1) {
        for (const [ox, oy] of [[0.3, 0.35], [0.7, 0.65]]) {
          const f = { ...propFootprint(gx + ox, gy + oy, 'bench', 0.5), hw: 0.45, hh: 0.18 };
          if (taken.some((t) => footClash(t, f, 1.4))) continue;
          spots.push({ x: gx + ox, y: gy + oy });
        }
      }
    }
    if (spots.length) out.push({ key: 'pl:' + b.gx0 + ':' + b.gy0, spots, kind: comp.kind });
  }
  return out;
}
function quaySpots(L, band) {
  const rv = L.river;
  if (band < 2 || !rv || !rv.present || !rv.samples) return [];
  const sm = rv.samples, g = CM.quayGate, N = L.gridN | 0;
  // Même filtre que le héron : ville seulement, loin des arbres (sinon la couronne
  // d'un arbre de la rive d'en deçà les cache).
  const treed = new Set();
  for (const tr of (L.trees || [])) for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) treed.add((tr.gx + dx) + ',' + (tr.gy + dy));
  const urban = L.urbanSet;
  const out = [];
  for (const side of [-1, 1]) {
    const draw = g ? (side > 0 ? g.drawPlus : g.drawMinus) : null;
    let run = [];
    const flush = () => { if (run.length >= 4) out.push({ key: 'q:' + side + ':' + run[0].i, spots: run, kind: 'quai' }); run = []; };
    for (let i = 1; i < sm.length - 1; i += 1) {
      const a = sm[i - 1], b = sm[i + 1];
      const inGrid = sm[i].x >= 1 && sm[i].y >= 1 && sm[i].x < N - 1 && sm[i].y < N - 1;
      if (!inGrid || (draw && !draw[i])) { flush(); continue; }
      let tx = b.x - a.x, ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const off = (sm[i].hw || 2) + 0.28;
      const qx = sm[i].x - ty * side * off, qy = sm[i].y + tx * side * off;
      const ck = Math.floor(qx) + ',' + Math.floor(qy);
      if (treed.has(ck) || (urban && urban.has && !urban.has(ck))) { flush(); continue; }
      run.push({ x: sm[i].x - ty * side * off, y: sm[i].y + tx * side * off, i, side, cx: sm[i].x, cy: sm[i].y });
    }
    flush();
  }
  return out;
}

// ── LES VOLÉES ──────────────────────────────────────────────────────────────
// Dose « calme » : une volée de pigeons par place, une volée de mouettes pour ~7
// samples de quai sur deux rives… soit, en pratique, 2 à 4 petits groupes à l'écran.
let _flocks = null, _flockKey = '';
function flocks() {
  const L = CM.layout;
  if (!L) return [];
  const band = bandOf();
  const key = (CM.layoutRecomputeAt || 0) + ':' + band + ':' + ((CM.quayGate && CM.quayGate.key) || '');
  if (_flocks && _flockKey === key) return _flocks;
  _flockKey = key;
  _flocks = [];
  if (band < 2 || band > 6) return _flocks;
  const seed = (L.mapSeed || 0) | 0;
  for (const area of plazaSpots(L, band)) {
    const g = cmHash('pig:' + area.key + ':' + seed) >>> 0;
    const n = 4 + (g % 4);
    _flocks.push(makeFlock('pigeon', area, g, n));
  }
  for (const area of quaySpots(L, band)) {
    // Une volée par tronçon de quai de 16 samples au plus, jamais deux sur le même.
    const per = 16;
    for (let s0 = 0; s0 + 4 <= area.spots.length; s0 += per) {
      const sub = { ...area, key: area.key + ':' + s0, spots: area.spots.slice(s0, s0 + per) };
      const g = cmHash('gull:' + sub.key + ':' + seed) >>> 0;
      if ((g % 100) < 30) continue;                      // deux tronçons sur trois, à peu près
      _flocks.push(makeFlock('gull', sub, g, 2 + (g % 3)));
    }
  }
  return _flocks;
}
function makeFlock(kind, area, g, n) {
  const home = Math.floor(h32(g + 1) * area.spots.length);
  const birds = [];
  for (let i = 0; i < n; i += 1) {
    const r = kind === 'pigeon' ? 0.55 : 0.9;
    birds.push({ ox: (h32(g + 10 + i) - 0.5) * r, oy: (h32(g + 30 + i) - 0.5) * r * (kind === 'pigeon' ? 1 : 0.35), g: (g + i * 7919) | 0 });
  }
  return { kind, area, g, birds, home, state: 'sol', t0: 0, dest: home, calmUntil: 0 };
}
function spotOf(f, idx) {
  const s = f.area.spots[Math.max(0, Math.min(f.area.spots.length - 1, idx))];
  return s;
}
// Poste d'arrivée : un autre coin de la même place (ou quelques samples plus loin
// sur le quai), assez loin pour que l'envol se voie, jamais le même.
function pickDest(f, now) {
  const n = f.area.spots.length;
  if (n < 2) return f.home;
  const r = h32((f.g + Math.floor(now / 997)) | 0);
  if (f.kind === 'gull') {
    const step = 3 + Math.floor(r * 6);
    let d = f.home + (r < 0.5 ? -step : step);
    if (d < 0 || d >= n) d = f.home - (d - f.home);
    return Math.max(0, Math.min(n - 1, d));
  }
  let d = Math.floor(r * n);
  if (d === f.home) d = (d + Math.max(1, Math.floor(n / 2))) % n;
  return d;
}

// ── LE DÉRANGEMENT ──────────────────────────────────────────────────────────
// Quelqu'un qui MARCHE (passant, flâneur de place, promeneur du quai, porteur, émeutier —
// le registre des figures, figures.js) ou une charrette à moins de ~0,7 tuile d'un oiseau fait partir TOUTE
// la volée — c'est ce qui rend la scène vraie : les pigeons ne s'envolent pas au
// hasard, ils s'envolent devant quelqu'un.
const FLY_S = { pigeon: 3.6, gull: 5.5 };
function disturbed(f, T) {
  const s = spotOf(f, f.home);
  const R = T * (f.kind === 'pigeon' ? 0.75 : 0.9), R2 = R * R;
  const cx = s.x * T, cy = s.y * T;
  if (figNear(cx, cy, R)) return true;
  for (const pool of [CM.vehicles]) {
    if (!pool) continue;
    for (const a of pool) {
      const dx = a.x - cx, dy = a.y - cy;
      if (dx * dx + dy * dy < R2) return true;
    }
  }
  return false;
}
let _lastNow = -1;
function publishOccupied(list) {
  vieOccupied.length = 0;
  for (const f of list) {
    const s = spotOf(f, f.state === 'vol' ? f.dest : f.home);
    if (s) vieOccupied.push({ x: s.x, y: s.y });
  }
}
function step(now) {
  const list = flocks();
  publishOccupied(list);
  if (CM.capture) return list;                         // captures : état gelé
  if (now === _lastNow) return list;
  _lastNow = now;
  const T = CM.TILE, t = now / 1000;
  for (const f of list) {
    if (f.state === 'sol') {
      if (t >= f.calmUntil && disturbed(f, T)) {
        f.state = 'vol'; f.t0 = t; f.dest = pickDest(f, now);
      }
    } else if (t - f.t0 >= FLY_S[f.kind]) {
      f.state = 'sol'; f.home = f.dest; f.calmUntil = t + 4;
    }
  }
  return list;
}

// ── DESSIN ──────────────────────────────────────────────────────────────────
// Au sol : chaque oiseau picore à son rythme (image 0 debout, 1 tête baissée) et
// fait un petit pas de temps en temps (décalage d'un pixel d'art). Nuit : ils
// dorment ailleurs (rien à l'écran au-delà de nightF 0,6).
function nightK() { const n = CM.nightF || 0; return n < 0.4 ? 1 : n > 0.6 ? 0 : (0.6 - n) / 0.2; }
function flightU(f, now) {
  if (CM.capture && VIE.envol != null) return Math.max(0, Math.min(1, +VIE.envol));
  if (f.state !== 'vol') return -1;
  return Math.max(0, Math.min(1, (now / 1000 - f.t0) / FLY_S[f.kind]));
}
registerVieActors((now, out) => {
  if (!VIE.on || CM.lodActive) return;
  const nk = nightK();
  if (nk <= 0) return;
  const T = CM.TILE;
  for (const f of step(now)) {
    if (f.kind === 'pigeon' ? VIE.pigeons <= 0 : VIE.mouettes <= 0) continue;
    if (flightU(f, now) >= 0) continue;
    const s = spotOf(f, f.home);
    for (const b of f.birds) {
      const wx = (s.x + b.ox) * T, wy = (s.y + b.oy) * T;
      out.push({
        wx, wy,
        draw(ctx) {
          const k = vieK(), fz = vieZoomFade() * nk;
          if (fz <= 0) return;
          const p = worldToScreen(wx, wy);
          const tt = now / 1000;
          // Cadence propre : 0,5 à 1,2 s par geste, tête baissée un geste sur trois.
          const beat = Math.floor(tt / (0.5 + h32(b.g) * 0.7) + h32(b.g + 1) * 10);
          const peck = f.kind === 'pigeon' && h32(b.g + beat) < 0.36;
          // Un pas d'un pixel toutes les 2-4 s, dans un sens tiré du battement.
          const walk = Math.floor(tt / (2 + h32(b.g + 2) * 2));
          const wxp = Math.round((h32(b.g + walk * 3) - 0.5) * 4) * k;
          // Regard : tourné vers l'eau pour les mouettes, au hasard du pas pour les pigeons.
          let left;
          if (f.kind === 'gull') { const c = worldToScreen(s.cx * T, s.cy * T); left = c.x < p.x; } else left = h32(b.g + walk) < 0.5;
          const spr = vieSprite(f.kind === 'gull' ? 'gull' : 'pigeon', peck ? 1 : 0, left);
          if (vieBlit(ctx, spr, p.x + wxp, p.y, k, fz)) {
            vieCount(f.kind === 'gull' ? 'mouettes' : 'pigeons');
            // LE SON (docs/PLAN-AMBIANCE-SONORE.md, lot 3) : un pigeon posé qu'on voit
            // peut roucouler.
            if (f.kind === 'pigeon') noteEmetteur('pigeons', wx, wy, 1, now);
          }
        },
      });
    }
  }
});
// En vol : chaque oiseau décolle en éventail, monte, décrit un arc et redescend sur
// le poste d'arrivée. Ailes battues (pigeon) ou planées en M (mouette).
registerVieAir((ctx, now) => {
  const nk = nightK();
  if (nk <= 0) return;
  const T = CM.TILE, z = CM.cam.zoom, k = vieK(), fz = vieZoomFade() * nk;
  if (fz <= 0) return;
  for (const f of flocks()) {
    const u = flightU(f, now);
    if (u < 0) continue;
    const A = spotOf(f, f.home), B = spotOf(f, f.state === 'vol' ? f.dest : pickDest(f, 0));
    for (const b of f.birds) {
      // Chacun son départ (un léger décalage) et sa courbe (écart latéral).
      const ub = Math.max(0, Math.min(1, (u - h32(b.g + 5) * 0.12) / 0.88));
      const e = ub * ub * (3 - 2 * ub);
      const side = (h32(b.g + 6) - 0.5) * 2.2;
      const wx = A.x + b.ox + (B.x - A.x) * e - (B.y - A.y) * side * Math.sin(Math.PI * ub) * 0.25;
      const wy = A.y + b.oy + (B.y - A.y) * e + (B.x - A.x) * side * Math.sin(Math.PI * ub) * 0.25;
      const p = worldToScreen(wx * T, wy * T);
      const lift = Math.sin(Math.PI * ub) * T * z * (f.kind === 'gull' ? 1.9 : 1.3) * (0.8 + h32(b.g + 7) * 0.4);
      const pa = worldToScreen(A.x * T, A.y * T), pb = worldToScreen(B.x * T, B.y * T);
      let spr;
      if (f.kind === 'gull') {
        const fr = Math.floor(now / 260 + h32(b.g) * 3) % 3;
        spr = vieSprite('gullFly', fr);
      } else {
        const fr = Math.floor(now / 90 + h32(b.g) * 2) % 2;
        spr = vieSprite('pigeonFly', fr, pb.x < pa.x);
      }
      if (vieBlit(ctx, spr, p.x, p.y - lift, k, fz)) {
        vieCount(f.kind === 'gull' ? 'mouettesVol' : 'pigeonsVol');
        // LE SON (lot 3) : l'envol claque une fois par vol, au premier oiseau dessiné —
        // et seulement au départ (une volée entrée dans le champ en plein vol se tait).
        if (f.kind === 'pigeon' && f.state === 'vol' && f._sonVol !== f.t0 && u < 0.25) {
          f._sonVol = f.t0;
          noteSon('envol', A.x * T, A.y * T, f.birds.length);
        }
      }
    }
  }
});

// ── PIGEONS DES TOITS ───────────────────────────────────────────────────────
// Réponse de Raph : « pigeons sur les places ET les toits ». Une maison sur ~40 en
// porte deux ou trois, perchés au FAÎTE : le haut de la boîte d'encre réellement
// dessinée à cette frame (CM._houseBoxes, publiée par le peintre) — le pigeon suit
// le dessin de la maison, quelle qu'elle soit. Personne ne passe sur un toit pour
// les déranger : ils s'envolent d'eux-mêmes, un petit tour toutes les minutes ou
// deux, et reviennent se poser (sans état : une horloge par maison).
const ROOF_FLY = 5;                                  // s de vol
let _roofs = null, _roofKey = '';
function roofHouses() {
  const L = CM.layout, band = bandOf();
  const key = (CM.layoutRecomputeAt || 0) + ':' + band;
  if (_roofs && _roofKey === key) return _roofs;
  _roofKey = key; _roofs = [];
  if (!L || band < 2 || band > 6) return _roofs;
  const seed = (L.mapSeed || 0) | 0, T = CM.TILE;
  for (const t of (L.tiles || [])) {
    if (t.type !== 'house' && t.type !== 'enginehome') continue;
    const g = cmHash('roof:' + t.gx + ':' + t.gy + ':' + seed) >>> 0;
    if ((g % 40) !== 0) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    const fo = isoFrontOffset(t, L.roadMap);
    const ax = (t.gx + sx + (fo ? fo.ox : 0)) * T, ay = (t.gy + sy + (fo ? fo.oy : 0)) * T;
    _roofs.push({ t, g, n: 2 + (g >>> 6) % 2, ax, ay, P: 60 + h32(g) * 50, off: h32(g + 1) * 60 });
  }
  return _roofs;
}
// Phase de vol 0..1, ou −1 posé. En capture, `__vie({ envol })` la force.
function roofFlight(r, now) {
  if (CM.capture && VIE.envol != null) return Math.max(0, Math.min(1, +VIE.envol));
  const u = ((now / 1000 + r.off) % r.P);
  return u < ROOF_FLY ? u / ROOF_FLY : -1;
}
// Sur la LIGNE DU TOIT : chaque pigeon lit le haut de l'encre à SA colonne (masque
// de la maison), si bien qu'une rangée suit la pente au lieu de flotter à plat.
function roofPerch(b, k, i, n) {
  const x = b.dx + b.dw * 0.5 + (i - (n - 1) / 2) * 3 * k;
  const y = inkTopAt(b, (x - b.dx) / b.dw);
  return { x, y: (y == null ? b.dy : y) + k };
}
registerVieActors((now, out) => {
  if (!VIE.on || !(VIE.toits > 0) || CM.lodActive) return;
  const nk = nightK();
  if (nk <= 0) return;
  for (const r of roofHouses()) {
    if (roofFlight(r, now) >= 0) continue;
    out.push({
      wx: r.ax, wy: r.ay, d: depthOf(r.ax, r.ay) + 0.003,
      draw(ctx) {
        const b = drawnBoxOf(r.t);
        if (!b || b.dh < 10) return;
        const k = vieK(), fz = vieZoomFade() * nk;
        if (fz <= 0) return;
        const tt = now / 1000;
        for (let i = 0; i < r.n; i += 1) {
          const gi = (r.g + i * 7919) | 0;
          const beat = Math.floor(tt / (0.8 + h32(gi) * 0.9) + h32(gi + 1) * 10);
          const peck = h32(gi + beat) < 0.25;
          const pp = roofPerch(b, k, i, r.n);
          if (vieBlit(ctx, vieSprite('pigeon', peck ? 1 : 0, h32(gi + 2) < 0.5), pp.x, pp.y, k, fz)) vieCount('pigeonsToits');
        }
      },
    });
  }
});
registerVieAir((ctx, now) => {
  if (!(VIE.toits > 0)) return;
  const nk = nightK();
  if (nk <= 0) return;
  const T = CM.TILE, z = CM.cam.zoom, k = vieK(), fz = vieZoomFade() * nk;
  if (fz <= 0) return;
  for (const r of roofHouses()) {
    const u = roofFlight(r, now);
    if (u < 0) continue;
    const b = drawnBoxOf(r.t);
    if (!b) continue;
    for (let i = 0; i < r.n; i += 1) {
      const gi = (r.g + i * 7919) | 0;
      const pp = roofPerch(b, k, i, r.n);
      // Un tour au-dessus du quartier : boucle de ~1,5 tuile, montée et descente.
      const a = 6.2832 * u + h32(gi) * 0.6, R = T * z * (1.1 + h32(gi + 3) * 0.6);
      const x = pp.x + Math.sin(a) * R, y = pp.y - Math.sin(Math.PI * u) * T * z * 1.4 - (1 - Math.cos(a)) * R * 0.25;
      const fr = Math.floor(now / 90 + h32(gi) * 2) % 2;
      if (vieBlit(ctx, vieSprite('pigeonFly', fr, Math.cos(a) < 0), x, y, k, fz)) vieCount('pigeonsToitsVol');
    }
  }
});

// Vérification : où sont les volées (monde, tuiles) et dans quel état.
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__vieFlocks = () => flocks().map((f) => { const s = spotOf(f, f.home); return { kind: f.kind, state: f.state, x: s.x, y: s.y, n: f.birds.length, area: f.area.kind }; });
  window.__vieRoofs = () => roofHouses().map((r) => [r.t.gx + 0.5, r.t.gy + 0.5]);
}
