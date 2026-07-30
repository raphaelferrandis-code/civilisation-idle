import { describe, it, expect } from "vitest";

import { rainAt, windAt, gustAt, weatherState } from "../weatherMode.js";

// MÉTÉO (A2). La règle de design tient dans la courbe : le temps dégagé est
// l'état normal, l'averse est un événement COURT. Un jeu qu'on laisse tourner
// des heures ne doit pas passer son temps sous la pluie.

describe("rainAt — l'averse reste un événement court", () => {
  it("le temps est dégagé sur la plus grande partie du cycle", () => {
    let sec = 0;
    for (let i = 0; i < 1000; i += 1) if (rainAt(i / 1000) > 0) sec += 1;
    expect(sec / 1000).toBeLessThan(0.25);
  });

  it("il pleut vraiment à un moment, et à pleine intensité", () => {
    const peak = Math.max(...Array.from({ length: 1000 }, (_, i) => rainAt(i / 1000)));
    expect(peak).toBe(1);
  });

  it("aucun saut : l'averse arrive et se retire en fondu", () => {
    let maxJump = 0;
    let prev = rainAt(0);
    for (let i = 1; i <= 1000; i += 1) {
      const v = rainAt(i / 1000);
      maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
    expect(maxJump).toBeLessThan(0.05);
  });

  it("boucle proprement : la fin du cycle rejoint le début", () => {
    expect(rainAt(0.9999)).toBeCloseTo(rainAt(0), 2);
  });
});

describe("windAt — le vent tient pendant une averse, change à la suivante", () => {
  it("constant pour un cycle donné", () => {
    expect(windAt(1234)).toBe(windAt(1234));
  });

  it("borné : la pluie penche, elle ne devient jamais horizontale", () => {
    for (let c = 0; c < 500; c += 1) {
      expect(Math.abs(windAt(c))).toBeLessThanOrEqual(0.7);
    }
  });

  it("deux averses de suite ne se ressemblent pas", () => {
    const a = Array.from({ length: 40 }, (_, c) => windAt(c));
    const uniques = new Set(a.map((v) => v.toFixed(3)));
    expect(uniques.size).toBeGreaterThan(30);
  });
});

// RAFALES. Ce qui fait une bourrasque, ce n'est pas qu'elle soit forte : c'est
// qu'elle FRAPPE puis s'apaise. Une enveloppe symétrique donne un soufflet qui
// respire, et une enveloppe qui ne redescend pas donne une averse plus dense,
// point. Les deux propriétés sont donc testées, et le témoin les fait mordre.
describe("gustAt — l'averse arrive par paquets", () => {
  // ⚠ HORLOGE MURALE, pas t = 0. La rafale est tirée d'un hash du numéro de
  // créneau, et en jeu ce numéro vaut ~2 × 10⁸ (Date.now / 9 s) : mesurer la
  // courbe à t = 0 s la mesurerait dans un régime qui n'existe pas.
  const T0 = 1785339000000;
  // 10 min d'averse échantillonnées à l'image (16 ms) : ~66 créneaux de rafale.
  const SERIE = (() => {
    const xs = [];
    for (let t = T0; t <= T0 + 600000; t += 16) xs.push(gustAt(t));
    return xs;
  })();
  // Nombre d'images qui MONTENT et nombre d'images qui DESCENDENT.
  const pentes = (xs) => {
    let up = 0, down = 0;
    for (let i = 1; i < xs.length; i += 1) {
      const d = xs[i] - xs[i - 1];
      if (d > 1e-12) up += 1; else if (d < -1e-12) down += 1;
    }
    return { up, down };
  };

  it("bornée : une bourrasque forcit l'averse, elle ne la remplace pas", () => {
    expect(Math.min(...SERIE)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...SERIE)).toBeLessThanOrEqual(1);
    expect(Math.max(...SERIE)).toBeGreaterThan(0.85);      // ...mais elle frappe vraiment
  });

  it("frappe VITE et retombe LENTEMENT", () => {
    const { up, down } = pentes(SERIE);
    expect(down).toBeGreaterThan(up * 4);                  // mesuré : ×9,8
  });

  it("la carte revient au calme entre deux bourrasques", () => {
    const part = (p) => SERIE.filter(p).length / SERIE.length;
    expect(part((v) => v < 0.05)).toBeGreaterThan(0.35);   // mesuré : 57 % du temps
    expect(part((v) => v > 0.5)).toBeLessThan(0.25);       // mesuré : 9 %
  });

  it("aucun saut : la bouffée monte en un dixième de seconde, pas en une image", () => {
    let maxJump = 0;
    for (let i = 1; i < SERIE.length; i += 1) maxJump = Math.max(maxJump, Math.abs(SERIE[i] - SERIE[i - 1]));
    expect(maxJump).toBeLessThan(0.07);                    // mesuré : 0,049 par image
  });

  it("deux bourrasques de suite ne se ressemblent pas", () => {
    const k0 = Math.floor(T0 / 9000);
    const pics = Array.from({ length: 40 }, (_, i) => {
      let m = 0;
      for (let t = (k0 + i) * 9000; t < (k0 + i + 1) * 9000; t += 20) m = Math.max(m, gustAt(t));
      return m.toFixed(3);
    });
    expect(new Set(pics).size).toBeGreaterThan(30);      // mesuré : 38 sur 40
  });

  it("TÉMOIN : une enveloppe symétrique (sinus) échouerait aux deux tests ci-dessus", () => {
    // Sans ce témoin, « frappe vite et retombe lentement » et « revient au
    // calme » passeraient sur n'importe quelle courbe qui monte et descend.
    const sin = [];
    for (let t = 0; t <= 600000; t += 16) sin.push(0.5 + 0.5 * Math.sin((t / 9000) * Math.PI * 2));
    const { up, down } = pentes(sin);
    expect(down).toBeLessThan(up * 4);                     // il descend autant qu'il monte
    expect(sin.filter((v) => v < 0.05).length / sin.length).toBeLessThan(0.35);
  });

  it("pas de bourrasque sans averse, et jamais plus forte qu'elle", () => {
    // Le signal publié à la carte est gustF = rafale × intensité de l'averse :
    // les premières gouttes ne claquent pas, et par temps dégagé rien ne bouge.
    for (let p = 0; p < 1; p += 0.01) {
      const t = Math.round(p * 1440000);                   // un cycle météo complet
      const w = weatherState(t);
      expect(w.gustF).toBeGreaterThanOrEqual(0);
      expect(w.gustF).toBeLessThanOrEqual(w.rainF);
    }
    expect(weatherState(0).gustF).toBe(0);                 // début de cycle : temps dégagé
  });
});
