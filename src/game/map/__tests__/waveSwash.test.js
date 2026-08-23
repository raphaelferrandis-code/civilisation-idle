// LE RESSAC du fleuve (waveReach / waveReachLoop, isoRenderer).
//
// Deux invariants tiennent tout l'effet, et les deux cassent EN SILENCE — d'où ce
// fichier. Une onde mal bornée ne jette pas : elle découvre un liseré d'herbe bakée
// au ras de l'eau, une fois par seconde, et on met une semaine à comprendre d'où
// vient « le bord du fleuve qui clignote ». Une onde mal bouclée ne jette pas non
// plus : elle pose une encoche FIXE dans le rivage d'une île, là où la polyligne se
// referme, et ça se lit comme une île mal dessinée.
import { describe, it, expect } from "vitest";
import {
  waveReach, waveReachLoop, waveWetReach, waveWetReachLoop, islandWakeK, waveTune,
} from "../iso/isoRenderer.js";
// `BEACH` est parti dans isoGroundTiles.js le 2026-08-23 (la MATIÈRE du rivage), le
// ressac est resté avec l'eau. Les deux se lisent ensemble : la portée de l'onde est
// bornée par la largeur de grève.
import { BEACH } from "../iso/isoGroundTiles.js";

// ⚠ LUS DEPUIS LES RÉGLAGES, jamais recopiés. Ce sont des valeurs d'oreille : les
// figer ici ferait passer les tests en décrivant une houle morte (la leçon de
// waterPhase.test.js, où le fps a bougé trois fois).
const G = waveTune;

// Balayage dense d'un bout de fleuve sur plusieurs périodes, les deux rives.
function sweep(fn, { sMax = 60, tMax = 12, ds = 0.25, dt = 1 / 60 } = {}) {
  for (let t = 0; t <= tMax; t += dt) {
    for (let s = 0; s <= sMax; s += ds) {
      for (const side of [1, -1]) fn(waveReach(s, t, side), s, t, side);
    }
  }
}

describe("ressac : l'eau monte sur la berge et redescend", () => {
  it("⚠ NE PASSE JAMAIS SOUS LE LIT PEINT (sinon l'herbe bakée se découvre)", () => {
    // L'invariant de sûreté du ressac : le lit peint EST la marée basse. Avancer ne
    // peut que recouvrir du sol baké ; reculer le découvrirait, et le sol sous les
    // berges douces est de l'HERBE.
    let lo = Infinity, hi = -Infinity;
    sweep((u) => { if (u < lo) lo = u; if (u > hi) hi = u; });
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    // Et l'onde utilise VRAIMENT sa course : bornée sans être écrasée au milieu.
    expect(lo).toBeLessThan(0.08);
    expect(hi).toBeGreaterThan(0.92);
  });

  it("TÉMOIN : une houle centrée (le premier réflexe) passait bien en négatif", () => {
    // Sans ce témoin le test ci-dessus serait vacant — il passerait aussi sur une
    // formule qui n'a jamais eu le défaut. On rejoue donc l'écriture naturelle,
    // `sin` brut, et on exige qu'elle sorte par le bas.
    let vu = false;
    for (let t = 0; t <= 12 && !vu; t += 1 / 60) {
      for (let s = 0; s <= 60; s += 0.25) {
        if (Math.sin(2 * Math.PI * (s / G.len - t / G.period)) < -1e-9) { vu = true; break; }
      }
    }
    expect(vu).toBe(true);
  });

  it("reste DANS la bande de sable : la vague mouille la grève, jamais l'herbe", () => {
    // C'est ce rapport-là qui rend l'avancée sûre partout : la grève (fixe) est plus
    // large que la course de l'eau, donc l'onde n'atteint jamais son bord extérieur
    // — mesuré en jeu, le bord herbe/sable ne bouge pas d'un pixel pendant que le
    // bord de l'eau, lui, monte de 9. Si un réglage d'oreille inverse le rapport,
    // ça doit sauter ici et pas en jeu, sur une capture de berge à l'ère 3.
    //
    // ⚠ C'est l'amplitude SOUS L'AVERSE qu'il faut comparer, pas celle du beau
    // fixe : `rainAmp` la majore (×1,7 aujourd'hui), et c'est donc elle le pire
    // cas. La première version de ce test lisait `amp` seul et aurait laissé
    // passer un `rainAmp` monté à 2 — soit une vague dans l'herbe, mais seulement
    // quand il pleut, c'est-à-dire le genre de bug qu'on ne reproduit pas.
    expect(G.amp * (1 + G.rainAmp)).toBeLessThan(BEACH.bankBand);
  });

  it("VOYAGE le long du fleuve (c'est une vague, pas une marée)", () => {
    // À un instant donné, deux points distants d'une DEMI-longueur d'onde ne
    // peuvent pas être à la même hauteur.
    const t = 3.7;
    const ecarts = [];
    for (let s = 0; s <= 40; s += 1) ecarts.push(Math.abs(waveReach(s, t, 1) - waveReach(s + G.len / 2, t, 1)));
    expect(Math.max(...ecarts)).toBeGreaterThan(0.3);
  });

  it("la crête descend le courant à `len / period` tuiles par seconde", () => {
    // Une crête vue en (s, t) se retrouve en (s + len·dt/period, t + dt) : c'est la
    // définition d'une onde progressive, et c'est ce qui donne le SENS du courant à
    // l'œil. ⚠ Mesuré sur la houle PRINCIPALE SEULE (`mix2 = 0`) : les deux houles
    // n'ont pas la même vitesse de phase (9/3,4 contre 4,3/2,1 tuiles/s), donc le
    // maximum du profil composite avance à une vitesse INTERMÉDIAIRE qui bat au
    // rythme de leur écart. Vouloir y lire `len/period` était une erreur de test,
    // pas de houle — le sens du courant sur l'onde complète est vérifié juste après.
    const S = { ...G, mix2: 0 };
    const crete = (t) => {
      let best = -1, bs = 0;
      for (let s = 0; s <= G.len; s += 0.005) { const u = waveReach(s, t, 1, S); if (u > best) { best = u; bs = s; } }
      return bs;
    };
    const dt = G.period / 8;
    const avance = ((crete(dt) - crete(0)) % G.len + G.len) % G.len;
    expect(avance).toBeCloseTo(G.len * dt / G.period, 1);
  });

  it("l'onde COMPLÈTE va vers l'aval, jamais vers l'amont", () => {
    // Sans mesurer une vitesse : le profil d'après ressemble-t-il davantage au
    // profil d'avant DÉCALÉ VERS L'AVAL, ou vers l'amont ? Une onde progressive
    // vérifie u(s + v·dt, t + dt) = u(s, t). Robuste au battement des deux houles,
    // qui déforme le profil mais ne peut pas en inverser le sens.
    const ecart = (shift, t, dt) => {
      let som = 0, n = 0;
      for (let s = 0; s <= 40; s += 0.25) { som += Math.abs(waveReach(s + shift, t + dt, 1) - waveReach(s, t, 1)); n += 1; }
      return som / n;
    };
    const v = (G.len / G.period + G.len2 / G.period2) / 2;      // vitesse moyenne des deux houles
    for (const t of [0, 1.3, 4.8]) {
      const dt = 0.2;
      expect(ecart(v * dt, t, dt)).toBeLessThan(ecart(-v * dt, t, dt) * 0.5);
    }
  });

  it("les deux rives ne battent pas ensemble (sinon le fleuve « gonfle »)", () => {
    let maxEcart = 0;
    sweep((u, s, t, side) => { if (side === 1) maxEcart = Math.max(maxEcart, Math.abs(u - waveReach(s, t, -1))); });
    expect(maxEcart).toBeGreaterThan(0.3);
  });

  it("`len = 0` redonne la MARÉE : toute la berge monte en même temps", () => {
    // Le premier jet demandé par Raph, gardé comme A/B — un cas mort se serait
    // périmé sans que rien ne le dise.
    const M = { ...G, len: 0, len2: 0 };
    for (const t of [0, 0.7, 2.3, 5.9]) {
      const ref = waveReach(0, t, 1, M);
      for (const s of [1, 7, 19, 55]) expect(waveReach(s, t, 1, M)).toBeCloseTo(ref, 12);
    }
    // …mais elle monte et descend quand même : une marée figée serait un bug muet.
    const suite = [];
    for (let t = 0; t <= 8; t += 0.1) suite.push(waveReach(0, t, 1, M));
    expect(Math.max(...suite) - Math.min(...suite)).toBeGreaterThan(0.8);
  });

  it("ne saute jamais d'une frame à l'autre (f(now) pure, vitesse CONSTANTE)", () => {
    // L'inverse exact de stepWaterPhase, et à dessein : ici la météo ne touche que
    // l'AMPLITUDE, donc un temps absolu × une vitesse constante ne peut pas sauter.
    // Ce test est le garde-fou du jour où quelqu'un voudra brancher `period` sur la
    // pluie — il faudra alors intégrer la phase, comme la nappe.
    let prev = waveReach(12, 0, 1), maxPas = 0;
    for (let t = 1 / 60; t <= 20; t += 1 / 60) {
      const u = waveReach(12, t, 1);
      maxPas = Math.max(maxPas, Math.abs(u - prev));
      prev = u;
    }
    // Vitesse angulaire max = celle de la houle la plus rapide, sur 1/60 s.
    const borne = Math.PI * (1 / Math.min(G.period, G.period2)) / 60 * 1.2;
    expect(maxPas).toBeLessThan(borne);
  });

  it("est reproductible (une capture au même `now` redonne la même onde)", () => {
    expect(waveReach(17.3, 4.25, 1)).toBe(waveReach(17.3, 4.25, 1));
    expect(waveReach(17.3, 4.25, -1)).toBe(waveReach(17.3, 4.25, -1));
  });
});

/* ── LA LAISSE ─────────────────────────────────────────────────────────────────
 * Raph, 2026-07-30 : « laisser un liseré sombre quand les vagues reviennent dans
 * l'eau ». La frange humide était collée à la ligne d'eau : elle montait et
 * redescendait AVEC la vague, donc elle ne marquait jamais son passage.
 * ------------------------------------------------------------------------- */
describe("la laisse : le sable garde la trace de l'eau", () => {
  it("⚠ NE PASSE JAMAIS SOUS LA LIGNE D'EAU", () => {
    // L'invariant de la laisse : elle est toujours DU CÔTÉ TERRE de l'eau du
    // moment. En dessous, elle serait noyée — un liseré qui disparaît par le
    // mauvais côté, et l'effet se retourne en clignotement au ras de l'onde.
    let pire = Infinity;
    for (let t = 0; t <= 14; t += 1 / 60) {
      for (let s = 0; s <= 40; s += 0.5) {
        for (const side of [1, -1]) pire = Math.min(pire, waveWetReach(s, t, side) - waveReach(s, t, side));
      }
    }
    expect(pire).toBeGreaterThanOrEqual(0);
  });

  it("SE DÉCROCHE vraiment quand la vague se retire", () => {
    // Sans ce test, une laisse qui collerait à l'eau passerait le précédent en
    // ne faisant rigoureusement rien — c'est exactement le défaut qu'on corrige.
    let mieux = 0;
    for (let t = 0; t <= 14; t += 1 / 60) {
      for (let s = 0; s <= 40; s += 0.5) mieux = Math.max(mieux, waveWetReach(s, t) - waveReach(s, t));
    }
    expect(mieux).toBeGreaterThan(0.4);      // au moins 40 % de la course de l'onde
  });

  it("SÈCHE : la trace ne reste pas gravée", () => {
    // Une laisse qui garderait le maximum absolu finirait par border la plage en
    // permanence, et il n'y aurait plus de marée du tout. On vérifie qu'elle
    // redescend jusqu'à toucher l'eau au moins une fois par cycle.
    const s = 12;
    let colleAuMoinsUneFois = false;
    for (let t = 0; t <= 20; t += 1 / 60) {
      if (waveWetReach(s, t) - waveReach(s, t) < 0.02) { colleAuMoinsUneFois = true; break; }
    }
    expect(colleAuMoinsUneFois).toBe(true);
  });

  it("reste dans la course de l'onde (donc dans la bande de sable)", () => {
    // La laisse est un `max` de valeurs déjà bornées : elle ne peut pas dépasser
    // la crête. Si ça cassait, le liseré sortirait de la grève et irait dans l'herbe.
    for (let t = 0; t <= 14; t += 0.05) {
      for (let s = 0; s <= 40; s += 0.5) expect(waveWetReach(s, t)).toBeLessThanOrEqual(1);
    }
  });

  it("ne saute pas d'une frame à l'autre", () => {
    // Le séchage est ce qui rend la descente continue : sans lui, la laisse
    // resterait accrochée à la dernière crête puis tomberait D'UN COUP quand
    // celle-ci sort de la fenêtre de mémoire.
    let prev = waveWetReach(12, 0), maxPas = 0;
    for (let t = 1 / 60; t <= 20; t += 1 / 60) {
      const v = waveWetReach(12, t);
      maxPas = Math.max(maxPas, Math.abs(v - prev));
      prev = v;
    }
    expect(maxPas).toBeLessThan(0.05);
  });

  it("`wetMem = 0` recolle la frange à l'eau (l'état d'avant, en A/B)", () => {
    const G = { ...waveTune, wetMem: 0 };
    for (const t of [0, 1.7, 5.3]) {
      for (const s of [0, 9, 23]) expect(waveWetReach(s, t, 1, G)).toBe(waveReach(s, t, 1, G));
    }
  });

  it("BOUCLE sur une île, comme le contour qu'elle borde", () => {
    for (const perim of [15.7, 31.4]) {
      for (const t of [0, 2.4, 7.1]) {
        expect(waveWetReachLoop(1, perim, t, 1.3)).toBeCloseTo(waveWetReachLoop(0, perim, t, 1.3), 9);
      }
      // …et elle ne noie jamais le contour non plus.
      for (let u = 0; u <= 1; u += 0.02) {
        expect(waveWetReachLoop(u, perim, 3.3, 1.3)).toBeGreaterThanOrEqual(waveReachLoop(u, perim, 3.3, 1.3));
      }
    }
  });
});

describe("ressac sur une île : le contour doit se REFERMER", () => {
  // L'île est un TROU dans le ruban, tracé en polyligne fermée. Si l'onde ne
  // retombe pas sur sa valeur de départ après un tour, le contour se referme sur
  // une MARCHE : une encoche fixe dans le rivage, qu'aucun réglage ne rattrape.
  const PERIMS = [8, 15.7, 24, 31.4, 48];

  it("boucle au pixel près, à tout instant et sur toutes les tailles d'île", () => {
    for (const perim of PERIMS) {
      for (const t of [0, 0.4, 1.9, 5.5, 13.2]) {
        for (const ph of [0, 1.1, 4.7]) {
          expect(waveReachLoop(1, perim, t, ph)).toBeCloseTo(waveReachLoop(0, perim, t, ph), 9);
        }
      }
    }
  });

  it("TÉMOIN : la même onde évaluée sur l'abscisse curviligne, elle, NE boucle pas", () => {
    // La version « berges » appliquée telle quelle à un contour fermé — c'est
    // exactement ce qu'on aurait écrit sans y penser.
    let pire = 0;
    for (const perim of PERIMS) pire = Math.max(pire, Math.abs(waveReach(perim, 3, 1) - waveReach(0, 3, 1)));
    expect(pire).toBeGreaterThan(0.2);
  });

  it("garde ses bornes 0..1 (même invariant que les berges : on ne découvre rien)", () => {
    let lo = Infinity, hi = -Infinity;
    for (const perim of PERIMS) {
      for (let t = 0; t <= 10; t += 0.05) {
        for (let u = 0; u <= 1; u += 0.01) {
          const v = waveReachLoop(u, perim, t, 2.2);
          if (v < lo) lo = v; if (v > hi) hi = v;
        }
      }
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
  });

  it("le SILLAGE amplifie l'amont et éteint l'aval", () => {
    // Une île divise le courant : l'eau s'empile sur la pointe qu'elle présente au
    // flot, l'autre est à l'abri. ⚠ `il.tx/ty` pointe vers l'AVAL, donc a = π est
    // la pointe AMONT et a = 0 l'aval. Inverser les deux ferait un fleuve qui
    // remonte — et RIEN à l'écran ne le dirait franchement, d'où ce test.
    expect(islandWakeK(Math.PI)).toBeGreaterThan(islandWakeK(0));
    expect(islandWakeK(Math.PI)).toBeGreaterThan(1);      // amont : amplifié
    expect(islandWakeK(0)).toBeLessThan(1);               // aval : à l'abri
    // Les deux FLANCS sont au régime de la berge : ni creusés, ni gonflés.
    expect(islandWakeK(Math.PI / 2)).toBeCloseTo(1, 9);
    expect(islandWakeK(-Math.PI / 2)).toBeCloseTo(1, 9);
  });

  it("le sillage reste POSITIF : jamais d'amplitude retournée", () => {
    // `wake` monté à 1 mettrait le facteur aval à 0 — l'onde s'éteint, elle ne
    // s'inverse pas. Au-delà, une île « aspirerait » l'eau au lieu de l'abriter.
    for (const w of [0, 0.3, 0.75, 1]) {
      const G = { ...waveTune, wake: w };
      for (let a = 0; a < Math.PI * 2; a += 0.05) expect(islandWakeK(a, G)).toBeGreaterThanOrEqual(0);
    }
  });

  it("le sillage BOUCLE, comme tout ce qui fait le tour d'une île", () => {
    // Même exigence que waveReachLoop : un facteur non périodique remettrait une
    // marche dans le contour, cette fois par l'amplitude au lieu de la phase.
    for (const a of [0, 0.9, 2.7, 5.1]) {
      expect(islandWakeK(a + Math.PI * 2)).toBeCloseTo(islandWakeK(a), 9);
    }
  });

  it("garde l'ÉCHELLE de la houle : l'arrondi ne change pas la taille des vagues", () => {
    // On arrondit au nombre entier de périodes pour fermer la boucle. Le prix, c'est
    // une longueur d'onde légèrement différente sur une île — acceptable tant que le
    // motif reste celui du fleuve. Sur une île de moins d'une longueur d'onde de
    // tour, l'arrondi force une période entière : c'est voulu (une île minuscule
    // respire d'un bloc), et c'est pourquoi le contrôle démarre au-delà.
    for (const perim of PERIMS.filter((p) => p >= G.len * 1.5)) {
      const k = Math.round(perim / G.len);
      expect(Math.abs(perim / k - G.len) / G.len).toBeLessThan(0.35);
    }
  });
});
