// Phase de chute de l'averse (stepRainPhase / drawIsoRain), ajoutée avec les
// RAFALES : sous bourrasque la pluie tombe plus vite, donc la vitesse de chute
// VARIE. C'est mot pour mot le piège qui avait mis l'eau à l'envers en juillet
// (cf. waterPhase.test.js) — un temps ABSOLU × une vitesse VARIABLE saute quand
// elle monte et RECULE quand elle retombe. Le rideau de pluie ne peut pas se
// permettre de remonter : on intègre la descente image par image.
import { describe, it, expect } from "vitest";
import { stepRainPhase } from "../iso/isoWeather.js";

const H = 611;                       // hauteur d'écran de référence (cf. fiche neige)
const BASE = 900 / H;                // écrans/s de la goutte la plus lente
const GUST_SPEED = 0.5;              // + 50 % de vitesse à pleine rafale (isoRenderer)
// ⚠ L'HORLOGE EST ABSOLUE (rAF, temps depuis le chargement) : une rafale ne
// frappe jamais à t = 0 s mais après des minutes de partie. C'est PRÉCISÉMENT ce
// qui rend le produit temps × vitesse explosif — mesuré à t = 0 s le témoin
// ci-dessous passerait pour sain.
const T0 = 1200;                     // 20 min de partie

// Avance la phase sur une rampe de rafale, en pas de 1/60 s.
function run(gustAtT, seconds = 8, dtStep = 1 / 60) {
  let st = { at: -1, phase: 0 };
  const xs = [];
  for (let t = 0; t <= seconds; t += dtStep) {
    st = stepRainPhase(st, T0 + t, BASE * (1 + GUST_SPEED * gustAtT(t)));
    xs.push(st.phase);
  }
  return xs;
}

const biggestStep = (xs) => xs.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - xs[i])), 0);

describe("phase de chute de la pluie sous rafale", () => {
  it("n'avance JAMAIS à reculons quand la bourrasque retombe", () => {
    const xs = run((t) => (t < 4 ? Math.min(1, t / 0.5) : Math.max(0, 1 - (t - 4) / 4)));
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
  });

  it("reste continue quand la bouffée frappe d'un coup", () => {
    const xs = run((t) => (t < 4 ? 0 : 1));
    // Un pas légitime vaut au plus 1,5 × BASE / 60 ≈ 0,037 écran.
    expect(biggestStep(xs)).toBeLessThan(0.05);
  });

  it("chaque goutte garde sa vitesse : le rideau reste dispersé, jamais en bloc", () => {
    // La phase est commune, le facteur par goutte est CONSTANT — donc deux
    // gouttes de vitesses différentes ne se rattrapent pas au fil du temps.
    const xs = run(() => 0.6, 6);
    const frac = (v) => v - Math.floor(v);
    const ecarts = new Set(xs.filter((_, i) => i % 90 === 0)
      .map((p) => (frac(p * 1.0) - frac(p * 1.7)).toFixed(2)));
    expect(ecarts.size).toBeGreaterThan(3);
  });

  it("borne un retour d'onglet : un trou de 30 s ne téléporte pas l'averse", () => {
    let st = { at: -1, phase: 0 };
    st = stepRainPhase(st, 0, BASE);
    const avant = st.phase;
    st = stepRainPhase(st, 30, BASE);                 // onglet caché 30 s
    // dt plafonné à 0,25 s → au plus 0,37 écran de chute, pas 44.
    expect(st.phase - avant).toBeLessThanOrEqual(BASE * 0.25 + 1e-9);
  });

  it("TÉMOIN : l'ancienne formule `t × vitesse` reculait ET sautait sur la même rafale", () => {
    // Sans ce témoin, les deux premiers tests passeraient aussi bien sur du code
    // qui n'a jamais eu le bug. On rejoue l'ancien calcul sur la même bourrasque.
    const avant = (gustAtT, dtStep = 1 / 60) => {
      const xs = [];
      for (let t = 0; t <= 8; t += dtStep) xs.push((T0 + t) * BASE * (1 + GUST_SPEED * gustAtT(t)));
      return xs;
    };
    // 1) LA RAFALE RETOMBE : la phase RECULE → le rideau remonte.
    const douce = avant((t) => (t < 4 ? Math.min(1, t / 0.5) : Math.max(0, 1 - (t - 4) / 4)));
    expect(douce.slice(1).some((v, i) => v < douce[i] - 1e-9)).toBe(true);
    // 2) LA BOUFFÉE FRAPPE : marche de plusieurs écrans d'un coup → ça saute.
    expect(biggestStep(avant((t) => (t < 4 ? 0 : 1)))).toBeGreaterThan(1);
  });
});
