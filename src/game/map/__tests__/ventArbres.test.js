// LE VENT DANS LES ARBRES, SANS SACCADE ET AU RYTHME DU SON (Raph, 2026-10-07 :
// « entendre le vent sans voir les arbres bouger est problématique »).
//   · la pose avance au huitième de texel, jamais d'un texel d'un coup ;
//   · l'enveloppe relue par la carte est bien celle que la boucle du souffle fait
//     entendre ;
//   · quand le paysage sonore publie ses boucles, l'arbre du centre se penche sur la
//     rafale qu'on entend.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { VIE, vieTreeSway } from '../iso/isoVie.js';
import { tableForce, SOUFFLE, forceSouffle } from '../../audio/paysage/ventEnveloppes.js';
import { rendrePaysage, PAYSAGE_SR } from '../../audio/paysage/paysageSynth.js';

let prev;
beforeEach(() => {
  prev = { vie: { ...VIE }, cam: { ...CM.cam }, windX: CM.windX, gustF: CM.gustF, son: CM.ventSon, lod: CM.lodActive, capture: CM.capture };
  Object.assign(VIE, { on: true, vent: 1, ventForce: null, reflet: 0.6 });
  CM.windX = 0.3; CM.gustF = 0; CM.lodActive = false; CM.capture = null; CM.ventSon = null;
  CM.cam.x = 0; CM.cam.y = 0;
});
afterEach(() => {
  for (const k of Object.keys(VIE)) delete VIE[k];
  Object.assign(VIE, prev.vie);
  Object.assign(CM.cam, prev.cam);
  CM.windX = prev.windX; CM.gustF = prev.gustF; CM.ventSon = prev.son; CM.lodActive = prev.lod; CM.capture = prev.capture;
});

const pose = (tr, now) => {
  const p = vieTreeSway(tr, now, 96, 96, 288);
  return p ? { top: p.s, reflet: p.reflet } : { top: 0, reflet: 0 };
};

describe('le vent dans les arbres', () => {
  it('la couronne glisse : jamais plus d\'un huitième de texel d\'une image à la suivante', () => {
    const tr = { gx: 12, gy: 7 };
    let max = 0, saut = 0, calme = 0, prevP = null;
    for (let i = 0; i < 60 * 60; i += 1) {
      const p = pose(tr, 1e6 + i * (1000 / 60));
      if (prevP) saut = Math.max(saut, Math.abs(p.top - prevP.top));
      max = Math.max(max, Math.abs(p.top));
      if (!p.top) calme += 1;
      prevP = p;
    }
    expect(saut).toBeLessThanOrEqual(1 / 8 + 1e-9);
    // Les rafales le penchent de deux texels au moins (Raph, 2026-10-08 : à 0,7 texel,
    // « je ne vois pas de mouvement en jeu »), et il se tient droit au calme.
    expect(max).toBeGreaterThanOrEqual(2);
    expect(calme).toBeGreaterThan(60 * 3);
  });

  it('l\'enveloppe de la carte est celle qu\'on entend dans la boucle du souffle', () => {
    const buf = rendrePaysage('souffle', PAYSAGE_SR);
    const T = tableForce(SOUFFLE, forceSouffle, 46);         // une valeur par demi-seconde
    const win = PAYSAGE_SR / 2, rms = [];
    for (let w = 0; w < 46; w += 1) {
      let e = 0;
      for (let i = w * win; i < (w + 1) * win; i += 1) e += buf[i] * buf[i];
      rms.push(Math.sqrt(e / win));
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const a = Array.from(T), ma = mean(a), mb = mean(rms);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i += 1) { num += (a[i] - ma) * (rms[i] - mb); da += (a[i] - ma) ** 2; db += (rms[i] - mb) ** 2; }
    expect(num / Math.sqrt(da * db)).toBeGreaterThan(0.8);
  });

  it('avec le son, l\'arbre du centre se penche sur la rafale qu\'on entend', () => {
    const T = tableForce(SOUFFLE, forceSouffle);
    const L = SOUFFLE.L, n = T.length;
    const at = (ph) => T[Math.floor(((ph % L) / L) * n) % n];
    // Le son démarre à une phase quelconque, ses deux têtes à 0,47 boucle d'écart.
    const p0 = [5.3, 5.3 + 0.47 * L];
    const tr = { gx: 0, gy: 0 };                             // au centre de l'écran (cam en 0, 0)
    const realNow = performance.now;
    let clock = 0;
    performance.now = () => clock;
    try {
      let ecart = 0, vus = 0;
      for (let i = 0; i < 60 * 40; i += 1) {
        clock = 1000 + i * (1000 / 60);
        const el = (clock - 1000) / 1000;
        CM.ventSon = { perf: clock, souffle: [(p0[0] + el) % L, (p0[1] + el) % L], feuillage: null, k: 1 };
        const p = pose(tr, clock);
        if (i < 60 * 30) continue;                           // le temps de se recaler
        const g = (at(p0[0] + el) + at(p0[1] + el)) / 2;
        // L'arbre ne sera jamais pile sur la courbe (±0,25 s de jitter par arbre) :
        // on vérifie qu'il est penché pendant les rafales entendues et droit au calme.
        if (g > 0.62) { vus += 1; if (p.top < 0.25) ecart += 1; }
        if (g < 0.22 && p.top > 0.25) ecart += 1;
      }
      expect(vus).toBeGreaterThan(0);
      expect(ecart).toBe(0);
    } finally {
      performance.now = realNow;
    }
  });
});
