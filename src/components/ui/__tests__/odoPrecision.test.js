import { describe, it, expect } from "vitest";

import {
  MAX_SLOTS, SETTLE_MS, COOLDOWN_MS, ROLL_MAX_FLIPS, ROLL_HYSTERESIS,
  staticDecimals, flipsPerSecond, idealDecimals, reconcilePrecision, lastDigitRolls, nextRollMode, rollPixel
} from "../odoPrecision.js";

// Promesse du cadran « précision lisible » (retour Raph : les chiffres qui
// tournent vite « ne rendent pas la bonne vision, on voit les chiffres aller
// de 1 à 10 mais ça n'est pas vrai » → frustration). Plus aucun chiffre
// inventé : c'est la précision qui s'adapte au débit pour que le dernier
// chiffre bascule à une allure que l'œil suit, quel que soit le rapport
// stock/production. Ce fichier vérifie la plage de rythme obtenue, le budget
// de largeur, et l'amortissement des recalages.

// Bande de lisibilité visée : un cran toutes les 2 s au plus lent, 5 par
// seconde au plus vif (la précision étant entière, le rythme ne peut pas
// être réglé plus finement qu'à une décade près).
const READABLE_LOW = 0.5;
const READABLE_HIGH = 5;

// Couples (stock, débit) représentatifs d'une partie : de la cabane de départ
// (12 nourriture, +0.4/s) au stock cosmique qui écrase sa production.
const CASES = [
  { value: 12, rate: 0.4 },
  { value: 250, rate: 3 },
  { value: 999, rate: 0.02 },
  { value: 4_800, rate: 12 },
  { value: 56_000, rate: 900 },
  { value: 999_000, rate: 4 },
  { value: 3.2e6, rate: 15_000 },
  { value: 8.7e9, rate: 3e4 },
  { value: 4.1e12, rate: 6e9 },
  { value: 2.5e21, rate: 3e17 }
];

// Décompose comme le cadran : mantisse < 1000, diviseur d'échelle, longueur
// de la partie entière.
function dial(value) {
  let m = value;
  let div = 1;
  while (m >= 1000) { m /= 1000; div *= 1000; }
  return { m, div, intLen: String(Math.floor(m)).length };
}

describe("odoPrecision — précision lisible", () => {
  it("garde le dernier chiffre dans la bande lisible sur toute la partie", () => {
    for (const { value, rate } of CASES) {
      const { div, intLen } = dial(value);
      const dec = idealDecimals(rate, div, intLen);
      const flips = flipsPerSecond(rate, div, dec);
      expect(flips, `stock ${value} @ ${rate}/s → ${dec} décimales`).toBeGreaterThanOrEqual(READABLE_LOW);
      expect(flips, `stock ${value} @ ${rate}/s → ${dec} décimales`).toBeLessThanOrEqual(READABLE_HIGH);
    }
  });

  it("contrôle négatif : la précision FIXE d'avant sort de la bande", () => {
    // L'ancien cadran ajoutait 2 décimales « live » à une mantisse à 2-3
    // chiffres significatifs, quel que soit le débit. Au moins un cas de la
    // partie devait donc être illisible ou mort — sinon ce test ne prouve rien.
    const bad = CASES.filter(({ value, rate }) => {
      const { m, div } = dial(value);
      const dec = div === 1 ? 1 : (m < 10 ? 2 : 1) + 2;
      const flips = flipsPerSecond(rate, div, dec);
      return flips < READABLE_LOW || flips > READABLE_HIGH;
    });
    expect(bad.length).toBeGreaterThan(0);
  });

  it("ne dépasse jamais le budget de largeur du cadran", () => {
    for (let intLen = 1; intLen <= 3; intLen += 1) {
      for (const rate of [0, 1e-6, 0.3, 7, 4000, 1e12]) {
        const dec = idealDecimals(rate, 1000, intLen);
        expect(dec).toBeGreaterThanOrEqual(0);
        expect(intLen + dec).toBeLessThanOrEqual(MAX_SLOTS);
      }
    }
  });

  it("tient tant que le stock vaut moins d'une cinquantaine d'heures de prod", () => {
    // Limite structurelle du budget de 6 chiffres : le dernier cran vaut
    // ~stock/1e5, donc il faut rate ≳ stock/2e5 pour qu'il bouge.
    for (const value of [4.8e3, 3.2e6, 8.7e9, 2.5e21]) {
      const { div, intLen } = dial(value);
      const rate = value / 1.8e5;
      const flips = flipsPerSecond(rate, div, idealDecimals(rate, div, intLen));
      expect(flips, `stock ${value} = 50 h de prod`).toBeGreaterThanOrEqual(READABLE_LOW);
    }
  });

  it("au-delà, cadran court et honnêtement immobile (pas de traîne de zéros)", () => {
    // Stock qui écrase la production (23 ans de prod ici) : aucune précision
    // ne le fera bouger. On affiche 8.70B, pas 8.70000B — cinq zéros figés
    // ne sont pas un mouvement, juste un nombre plus petit à l'écran.
    const { div, intLen } = dial(8.7e9);
    expect(idealDecimals(12, div, intLen)).toBe(staticDecimals(div, intLen));
  });

  it("sans débit, reprend la précision du format compact du jeu", () => {
    // fmtShort : 8.70K / 87.0K / 870K sous suffixe, 8.7 / 87 / 870 sans.
    // ⚠ La 3e assertion valait 1 jusqu'à B12, alors que le commentaire
    // ci-dessus annonçait déjà « 870K » : le cadran rendait « 870.0B » quand le
    // reste de l'écran écrivait « 870.0K ». Les deux disent enfin 3 chiffres.
    expect(idealDecimals(0, 1000, 1)).toBe(2);
    expect(idealDecimals(0, 1e6, 2)).toBe(1);
    expect(idealDecimals(0, 1e6, 3)).toBe(0);
    expect(idealDecimals(0, 1, 1)).toBe(1);
    expect(idealDecimals(-0, 1, 2)).toBe(0);
  });
});

describe("odoPrecision — amortissement des recalages", () => {
  const base = { dec: 3, div: 1000, since: 0, changedAt: 0 };

  it("ne retouche rien tant que le rythme reste dans la bande morte", () => {
    // 3 décimales, échelle K, 2/s : le cadran est bon, et une fluctuation du
    // débit (×2, ÷2) ne doit pas re-monter le cadran.
    for (const rate of [1, 2, 4]) {
      const next = reconcilePrecision(base, { rate, div: 1000, intLen: 1, now: 60_000 });
      expect(next.dec).toBe(3);
    }
  });

  it("exige une sortie de bande DURABLE avant de recaler", () => {
    // Débit ×1000 (une lignée qui décuple) : le cadran devient illisible…
    const hot = { rate: 4000, div: 1000, intLen: 1 };
    const t0 = 100_000;
    let st = { ...base, changedAt: 0 };
    st = reconcilePrecision(st, { ...hot, now: t0 });
    expect(st.dec, "pas de recalage immédiat").toBe(3);
    expect(st.since).toBe(t0);
    // …toujours pas juste avant le délai de confirmation…
    st = reconcilePrecision(st, { ...hot, now: t0 + SETTLE_MS - 1 });
    expect(st.dec).toBe(3);
    // …puis le recalage tombe.
    st = reconcilePrecision(st, { ...hot, now: t0 + SETTLE_MS + 1 });
    expect(st.dec).toBe(0);
    expect(st.since).toBe(0);
  });

  it("respecte le repos entre deux recalages", () => {
    const hot = { rate: 4000, div: 1000, intLen: 1 };
    const t0 = 200_000;
    // Cadran qui vient tout juste de se recaler : sortie de bande confirmée,
    // mais le cooldown n'est pas écoulé.
    let st = { dec: 3, div: 1000, since: t0 - SETTLE_MS - 1, changedAt: t0 - 1 };
    st = reconcilePrecision(st, { ...hot, now: t0 });
    expect(st.dec).toBe(3);
    st = reconcilePrecision(st, { ...hot, now: t0 + COOLDOWN_MS + 1 });
    expect(st.dec).toBe(0);
  });

  it("recale sur-le-champ au franchissement de palier et au chiffre en plus", () => {
    // 999.9K → 1.000M : la forme du cadran change de toute façon (suffixe),
    // autant reprendre la bonne précision dans le même re-mount.
    const jump = reconcilePrecision(base, { rate: 4, div: 1e6, intLen: 1, now: 300_000 });
    expect(jump.dec).toBe(idealDecimals(4, 1e6, 1));
    expect(jump.div).toBe(1e6);
    // 9.99K → 10.0K : un chiffre entier de plus, les décimales doivent tenir
    // dans le budget restant sans attendre.
    const wide = reconcilePrecision({ dec: 5, div: 1000, since: 0, changedAt: 0 },
      { rate: 3, div: 1000, intLen: 2, now: 300_000 });
    expect(wide.dec).toBeLessThanOrEqual(MAX_SLOTS - 2);
  });

  it("fige la forme quand la production s'arrête (crise terminale)", () => {
    const frozen = reconcilePrecision(base, { rate: 0, div: 1000, intLen: 1, now: 400_000 });
    expect(frozen.dec).toBe(3);
  });
});

describe("odoPrecision — roulis continu ou crans", () => {
  // Retour du 2026-09-29 : en fin de partie, quatre captures prises coup sur coup
  // ne montraient AUCUNE valeur lisible dans la barre du haut — le dernier
  // chiffre roulait en continu à plus de trois crans par seconde, donc n'était
  // jamais au repos. Au-delà de ROLL_MAX_FLIPS il bascule par crans secs.

  it("le cas relevé en jeu (213B à +3,16B/s) bascule par crans", () => {
    const { div, intLen } = dial(213e9);
    const dec = idealDecimals(3.16e9, div, intLen);
    expect(flipsPerSecond(3.16e9, div, dec)).toBeGreaterThan(ROLL_MAX_FLIPS);
    expect(lastDigitRolls(3.16e9, div, dec)).toBe(false);
  });

  it("un cadran lent garde son roulis continu", () => {
    // La nourriture du départ : 13 à +7,4/min — une décimale, 1,2 cran/s.
    const { div, intLen } = dial(13);
    const rate = 7.4 / 60;
    const dec = idealDecimals(rate, div, intLen);
    expect(flipsPerSecond(rate, div, dec)).toBeLessThanOrEqual(ROLL_MAX_FLIPS);
    expect(lastDigitRolls(rate, div, dec)).toBe(true);
  });

  it("le Rayonnement du départ (+2,1/min) bascule déjà par crans", () => {
    // Deux décimales à 3,5 crans/s : rapide dès la première minute. C'est
    // voulu (la précision vise un chiffre qui bouge), et c'est justement ce
    // rythme qu'un rouleau continu ne laisse jamais lire.
    const { div, intLen } = dial(10.3);
    const rate = 2.1 / 60;
    const dec = idealDecimals(rate, div, intLen);
    expect(lastDigitRolls(rate, div, dec)).toBe(false);
  });

  it("la frontière est le rythme, sur toute la partie", () => {
    for (const { value, rate } of CASES) {
      const { div, intLen } = dial(value);
      const dec = idealDecimals(rate, div, intLen);
      const flips = flipsPerSecond(rate, div, dec);
      expect(lastDigitRolls(rate, div, dec), `stock ${value} @ ${rate}/s → ${flips.toFixed(2)} crans/s`)
        .toBe(flips <= ROLL_MAX_FLIPS);
    }
  });

  it("les deux régimes existent dans une vraie partie (sinon la règle ne sert à rien)", () => {
    const regimes = new Set(CASES.map(({ value, rate }) => {
      const { div, intLen } = dial(value);
      return lastDigitRolls(rate, div, idealDecimals(rate, div, intLen));
    }));
    expect([...regimes].sort()).toEqual([false, true]);
  });

  it("sans débit, rien ne bascule : le cadran est au repos", () => {
    expect(lastDigitRolls(0, 1000, 2)).toBe(true);
  });

  it("marge : un débit qui frôle le seuil ne fait pas alterner les régimes", () => {
    const div = 1, dec = 0;
    const high = ROLL_MAX_FLIPS * (1 + ROLL_HYSTERESIS / 2);
    const low = ROLL_MAX_FLIPS * (1 - ROLL_HYSTERESIS / 2);
    // Dans la marge, chacun garde son régime…
    expect(nextRollMode(true, high, div, dec)).toBe(true);
    expect(nextRollMode(false, low, div, dec)).toBe(false);
    // …et on n'en change qu'une fois la marge franchie.
    expect(nextRollMode(true, ROLL_MAX_FLIPS * (1 + ROLL_HYSTERESIS) * 1.01, div, dec)).toBe(false);
    expect(nextRollMode(false, ROLL_MAX_FLIPS * (1 - ROLL_HYSTERESIS) * 0.99, div, dec)).toBe(true);
  });
});

// Clé de rendu du roulis (PERF-39) : le cadran ne se re-rend que quand le pixel
// du dernier chiffre change. Elle doit donner EXACTEMENT le pixel que le CSS
// peint — `translateY(round(<décalage à 4 décimales>em, 1px))`, round() du CSS
// = au plus proche, égalité vers +∞ — sinon une image visible serait sautée.
describe("rollPixel — le pixel que peint le roulis", () => {
  const cssPixel = (D, emPx) => {
    const em = Number((-(D - Math.floor(D))).toFixed(4));
    const x = em * emPx;
    const lo = Math.floor(x);
    return x - lo >= 0.5 ? lo + 1 : lo; // round(x, 1px) du CSS
  };

  it("même pixel que le CSS, à toutes les tailles de cadran (20 à 30 px)", () => {
    for (const emPx of [20, 24, 28, 30]) {
      for (let D = 1234; D < 1236; D += 0.0037) {
        expect(rollPixel(D, emPx) + 0).toBe(cssPixel(D, emPx) + 0);
      }
    }
  });

  it("au repos sur un cran entier : décalage nul", () => {
    expect(rollPixel(561, 24) + 0).toBe(0);
  });

  it("taille inconnue (pas de DOM) : le décalage brut, qui change à chaque image", () => {
    expect(rollPixel(10.25, 0)).toBe(-0.25);
    expect(rollPixel(10.26, 0)).not.toBe(rollPixel(10.25, 0));
  });
});
