import { describe, it, expect } from "vitest";

import { muleRestFrame, MULE_REST_NF } from "../cityEngineSprites.js";

// Halte de caravane (stade 0 des caravanes) : le mulet est COUCHÉ et lève la tête.
// Ce qu'on garde ici, ce n'est pas « la fonction rend un nombre » mais les deux
// propriétés qui ont motivé son écriture — sans elles, un simple
//   Math.floor(now / ms) % NF
// passerait, et c'est exactement l'animation cassée qu'on remplace : arrivée à la
// dernière image, la tête CLAQUE de haut en bas d'une frame à l'autre.
const T = 5200;

// Échantillonnage dense d'une période complète (pas de 5 ms ≈ 3 frames à 60 fps).
function cycle(t0 = 0) {
  const out = [];
  for (let t = t0; t < t0 + T; t += 5) out.push(muleRestFrame(t, T));
  return out;
}

describe("muleRestFrame — cycle de tête du mulet couché", () => {
  it("reste dans la bande d'images", () => {
    for (const f of cycle()) {
      expect(Number.isInteger(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(MULE_REST_NF - 1);
    }
  });

  it("ne saute jamais plus d'une image, y compris au bouclage", () => {
    // La garde qui mord : un modulo brut ferait ici un saut de MULE_REST_NF-1.
    const f = cycle();
    for (let i = 1; i < f.length; i += 1) {
      expect(Math.abs(f[i] - f[i - 1])).toBeLessThanOrEqual(1);
    }
    // Raccord fin de période → début de la suivante.
    expect(Math.abs(muleRestFrame(T - 1, T) - muleRestFrame(0, T))).toBeLessThanOrEqual(1);
  });

  it("va vraiment jusqu'au bout du geste puis revient au repos", () => {
    const f = cycle();
    expect(Math.max(...f)).toBe(MULE_REST_NF - 1); // la tête se lève complètement
    expect(Math.min(...f)).toBe(0);                // et redescend
  });

  it("marque une pause tête basse (l'animal se repose, il ne pompe pas)", () => {
    const f = cycle();
    const atRest = f.filter((v) => v === 0).length / f.length;
    expect(atRest).toBeGreaterThan(0.3);
  });

  it("est invariant par période (phase seulement, pas de dérive)", () => {
    for (const t of [0, 137, 2600, 5199]) {
      expect(muleRestFrame(t, T)).toBe(muleRestFrame(t + 4 * T, T));
    }
  });

  it("tolère un temps négatif (horloge remise à zéro / captures)", () => {
    expect(() => cycle(-3 * T)).not.toThrow();
    for (const f of cycle(-3 * T)) expect(f).toBeGreaterThanOrEqual(0);
  });
});
