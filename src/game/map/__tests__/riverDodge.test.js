import { describe, it, expect } from "vitest";

import { riverDodge, riverIslandObstacles } from "../iso/isoRenderer.js";

// L'Aiguille Céleste est posée EN PLEIN FLEUVE — c'est un phare, et
// cmWetWonderSlot la cale volontairement sur le centre du courant. Les bateaux,
// eux, suivent le ruban : ils lui rentraient dedans (Raph, 2026-07-30).
//
// L'évitement se joue sur la seule voie TRANSVERSALE, jamais sur la position le
// long du fleuve : on ne dévie pas le cours d'eau, on se range d'un bord.
//
// `lateral` et `obs.lat` sont dans le même repère : des tuiles depuis l'axe du
// ruban, signées. `hw` est la demi-largeur d'eau à cet endroit.

const OBS = (lat, t = 0.5, r = 1.2) => [{ t, lat, r }];
const HW = 6;                     // fleuve large : la place de manœuvrer
const SIZE = 1.4;                 // coque moyenne

describe("évitement d'un obstacle planté dans l'eau", () => {
  it("écarte le bateau quand il arrive au droit du monument", () => {
    const avant = 0.2;
    const apres = riverDodge(avant, 0.5, SIZE, HW, OBS(0));
    expect(Math.abs(apres)).toBeGreaterThan(Math.abs(avant));
    // Et il passe VRAIMENT à côté : au moins le rayon plus la demi-coque.
    expect(Math.abs(apres - 0)).toBeGreaterThan(1.2 + SIZE * 0.5);
  });

  it("ne touche à rien loin de l'obstacle", () => {
    // À l'autre bout du fleuve, la voie doit être exactement celle demandée —
    // sinon tous les bateaux navigueraient de travers en permanence.
    expect(riverDodge(0.3, 0.05, SIZE, HW, OBS(0))).toBe(0.3);
    expect(riverDodge(-0.7, 0.9, SIZE, HW, OBS(0))).toBe(-0.7);
  });

  it("l'écart se creuse PROGRESSIVEMENT à l'approche", () => {
    // Un coup de barre sec se verrait ; la manœuvre doit s'annoncer.
    const suite = [0.5 - 0.04, 0.5 - 0.025, 0.5 - 0.012, 0.5]
      .map((t) => Math.abs(riverDodge(0.1, t, SIZE, HW, OBS(0))));
    for (let i = 1; i < suite.length; i += 1) {
      expect(suite[i]).toBeGreaterThanOrEqual(suite[i - 1]);
    }
    expect(suite[suite.length - 1]).toBeGreaterThan(suite[0] * 2);
  });

  it("se range du côté où il est DÉJÀ", () => {
    // Traverser le monument pour se ranger « du bon côté » serait pire que le
    // défaut qu'on corrige.
    expect(riverDodge(0.6, 0.5, SIZE, HW, OBS(0))).toBeGreaterThan(0);
    expect(riverDodge(-0.6, 0.5, SIZE, HW, OBS(0))).toBeLessThan(0);
  });

  it("passe de l'autre bord plutôt que d'échouer sur la berge", () => {
    // Obstacle collé à la rive droite : se ranger encore plus à droite mettrait
    // le bateau au sec. Il doit filer à gauche.
    const hwEtroit = 3;
    const obsPresDeLaRive = OBS(2.2);
    const apres = riverDodge(1.8, 0.5, SIZE, hwEtroit, obsPresDeLaRive);
    expect(apres).toBeLessThan(1.8);
    // Et il reste DANS l'eau.
    expect(Math.abs(apres)).toBeLessThanOrEqual(hwEtroit);
  });

  it("ne sort jamais du lit, même si le dégagement voulu n'y tient pas", () => {
    // Fleuve étroit + grosse coque : impossible de dégager complètement. Le
    // bateau doit se ranger AU MAXIMUM sans jamais franchir la berge — mieux
    // vaut frôler le monument que naviguer sur le quai.
    const hwEtroit = 2.5, grosse = 2.4;
    for (const depart of [-0.5, 0, 0.5]) {
      const apres = riverDodge(depart, 0.5, grosse, hwEtroit, OBS(0, 0.5, 1.6));
      expect(Math.abs(apres)).toBeLessThanOrEqual(hwEtroit * 0.86);
    }
  });

  it("un bateau LARGE se range plus loin qu'une barque", () => {
    const barque = Math.abs(riverDodge(0.2, 0.5, 0.7, HW, OBS(0)));
    const cargo = Math.abs(riverDodge(0.2, 0.5, 2.4, HW, OBS(0)));
    expect(cargo).toBeGreaterThan(barque);
  });

  it("sans obstacle publié, la voie est intacte", () => {
    expect(riverDodge(0.42, 0.5, SIZE, HW, [])).toBe(0.42);
  });
});

// Les palées d'un pont tombaient tous les 1,15 à 1,6 tuiles d'une berge à
// l'autre, alors qu'un porte-conteneurs en fait 2,24 de large : il ne pouvait
// passer NULLE PART et traversait la pierre. isoBridge ouvre maintenant la
// travée du milieu ; encore faut-il que les bateaux s'y présentent.
const GATE = (t = 0.5) => [{ t }];

describe("passe navigable sous un pont", () => {
  it("recentre le bateau au droit de l'ouvrage", () => {
    const aBord = 2.4;
    const auPont = riverDodge(aBord, 0.5, SIZE, HW, [], GATE());
    expect(Math.abs(auPont)).toBeLessThan(Math.abs(aBord) * 0.2);
  });

  it("le recentrage s'annonce de LOIN", () => {
    // On se présente à une passe bien avant d'y être — l'inverse d'un obstacle,
    // qu'on ne serre qu'au dernier moment.
    const suite = [0.5 - 0.065, 0.5 - 0.04, 0.5 - 0.02, 0.5]
      .map((t) => Math.abs(riverDodge(2.4, t, SIZE, HW, [], GATE())));
    for (let i = 1; i < suite.length; i += 1) {
      expect(suite[i]).toBeLessThanOrEqual(suite[i - 1]);
    }
    expect(suite[0]).toBeLessThan(2.4);          // déjà amorcé au plus loin
  });

  it("ne touche à rien loin du pont", () => {
    expect(riverDodge(2.1, 0.1, SIZE, HW, [], GATE())).toBe(2.1);
  });

  it("le bord choisi NE BASCULE PAS quand la coque louvoie", () => {
    // LE bug : `out >= o.lat` était recalculé à chaque frame. Le louvoiement
    // fait passer la coque d'un côté à l'autre de l'axe plusieurs fois par
    // seconde ; le côté basculait avec lui et le bateau se TÉLÉPORTAIT d'un bras
    // de l'île à l'autre au lieu de la contourner (Raph).
    //
    // On rejoue une île (chaîne de points de même id) et un bateau qui louvoie
    // autour de l'axe, comme en jeu.
    const ile = [-2, -1, 0, 1, 2].map((d) => ({ t: 0.5 + d * 0.004, lat: 0, r: 2, id: "island" }));
    const memo = {};
    const cotes = new Set();
    for (let k = 0; k < 40; k += 1) {
      const wave = Math.sin(k * 0.7) * 0.5;          // louvoiement, change de signe
      const r = riverDodge(wave, 0.5, SIZE, HW, ile, [], memo);
      cotes.add(Math.sign(r));
    }
    // Un seul bord sur toute la traversée.
    expect(cotes.size).toBe(1);
  });

  it("SANS mémoire, la bascule se produit — c'est le bug d'origine", () => {
    // Contrôle négatif : le même scénario sans objet mémoire doit bel et bien
    // montrer le défaut, sinon le test précédent ne prouverait rien.
    const ile = [-2, -1, 0, 1, 2].map((d) => ({ t: 0.5 + d * 0.004, lat: 0, r: 2, id: "island" }));
    const cotes = new Set();
    for (let k = 0; k < 40; k += 1) {
      const wave = Math.sin(k * 0.7) * 0.5;
      cotes.add(Math.sign(riverDodge(wave, 0.5, SIZE, HW, ile, [])));
    }
    expect(cotes.size).toBeGreaterThan(1);
  });

  it("oublie le bord une fois l'île doublée", () => {
    // Sinon un marchand qui a serré à gauche une fois serrerait à gauche pour le
    // restant de sa vie, même en revenant par l'autre bout du fleuve.
    const ile = [{ t: 0.5, lat: 0, r: 2, id: "island" }];
    const memo = {};
    riverDodge(0.4, 0.5, SIZE, HW, ile, [], memo);
    expect(memo._dodgeSide.island).toBe(1);
    riverDodge(-0.4, 0.9, SIZE, HW, ile, [], memo);   // loin : plus dans la zone
    expect(memo._dodgeSide.island).toBeUndefined();
  });

  it("l'obstacle l'emporte sur la passe s'ils se superposent", () => {
    // Un monument planté juste sous un pont : mieux vaut sortir de l'axe que
    // rentrer dans la pierre. L'évitement s'applique APRÈS le recentrage.
    const r = riverDodge(0.8, 0.5, SIZE, HW, OBS(0), GATE());
    expect(Math.abs(r)).toBeGreaterThan(1);
  });

  it("un obstacle ÉCARTE, il n'attire jamais", () => {
    // Un bateau déjà plus au large que le dégagement demandé ne doit pas être
    // RAMENÉ vers l'obstacle. Sans cette borne, `out += (cible − out) · force`
    // le tire vers l'intérieur — inoffensif tant qu'il n'y a qu'un obstacle
    // ponctuel, fatal dès qu'une île en publie une chaîne (les points étroits
    // des pointes défont alors l'écart obtenu au milieu).
    const auLarge = 4.5;                       // bien au-delà de clear ≈ 2,4
    expect(riverDodge(auLarge, 0.5, SIZE, HW, OBS(0))).toBeGreaterThanOrEqual(auLarge);
    expect(riverDodge(-auLarge, 0.5, SIZE, HW, OBS(0))).toBeLessThanOrEqual(-auLarge);
  });
});

/* ── L'ÎLE : un obstacle LONG ─────────────────────────────────────────────────
 * L'Aiguille est désormais posée sur une ÎLE de 7,6 × 2,4 tuiles de demi-axes.
 * Son disque de 1,6 ne couvre plus qu'un dixième de ce qu'il faut contourner :
 * les bateaux évitaient le monument et labouraient l'île (Raph, 2026-07-30 :
 * « ils passent encore dessus »). Mesuré en jeu AVANT le correctif, sur une
 * carte gridN 136 : un bateau au fil de l'eau traversait l'île sur 9 samples
 * sur 11, jusqu'à 0,63 tuile à l'intérieur.
 * ------------------------------------------------------------------------- */

// Fleuve DROIT échantillonné comme le vrai (~1,5 tuile par pas, cf. layout), avec
// le lit évasé autour de l'île — sans cet évasement les deux bras n'existent pas
// et le test dirait seulement que le fleuve est trop étroit.
function fleuveAvecIle(nSamples) {
  const PAS = 1.5, HW0 = 3.1;
  const ile = { x: (nSamples - 1) * PAS * 0.5, y: 0, rx: 7.6, ry: 2.4, tx: 1, ty: 0 };
  const sm = [];
  const etale = ile.rx * 1.9;
  for (let i = 0; i < nSamples; i += 1) {
    const x = i * PAS;
    let hw = HW0;
    const d = Math.abs(x - ile.x);
    if (d <= etale) { const u = 1 - d / etale; hw += (ile.ry + 0.8) * u * u * (3 - 2 * u); }
    sm.push({ x, y: 0, hw });
  }
  return { sm, ile };
}

// Marge du bateau au droit de l'île, en tuiles. > 0 = il passe à côté.
// Fleuve droit → la normale du ruban vaut (0,1) et l'île est centrée sur l'axe,
// donc la distance à l'île se lit directement sur `lat`.
function margesLeLongDeLIle({ sm, ile }, obstacles, lane, effSize = 1.2) {
  const len = sm.length, out = [];
  for (let i = 0; i < len; i += 1) {
    const s = sm[i], al = s.x - ile.x;
    if (Math.abs(al) > ile.rx) continue;                    // pas au droit de l'île
    const rLoc = ile.ry * Math.sqrt(Math.max(0, 1 - (al / ile.rx) ** 2));
    const laneRoom = Math.max(0, s.hw * 0.78 - effSize * 0.3 - 0.25);   // cf. drawIsoShips
    const lat = riverDodge(lane * laneRoom, i / (len - 1), effSize, s.hw, obstacles, []);
    out.push({ marge: Math.abs(lat) - rLoc - effSize * 0.5, lat, berge: s.hw * 0.86 });
  }
  return out;
}

const VOIES = [-0.6, -0.2, 0, 0.2, 0.6];

describe("les bateaux contournent l'île", () => {
  // gridN 136 (331 samples) et gridN 46 (116) : la portée de l'évitement est une
  // fraction du fleuve ENTIER, donc elle CHANGE avec la taille de la carte (22
  // tuiles contre 7,5, mesuré). C'est toute la raison d'être de la chaîne.
  for (const [nom, n] of [["grande carte", 331], ["petite carte", 116]]) {
    it(`ne pose jamais une coque sur l'île — ${nom}`, () => {
      const f = fleuveAvecIle(n);
      const obs = riverIslandObstacles([f.ile], f.sm);
      for (const lane of VOIES) {
        const m = margesLeLongDeLIle(f, obs, lane);
        expect(m.length).toBeGreaterThan(4);               // on teste bien la traversée
        for (const p of m) expect(p.marge).toBeGreaterThan(0);
      }
    });

    it(`et ne l'évite pas en s'échouant sur la berge — ${nom}`, () => {
      // Contourner en montant sur le quai serait pire que le défaut corrigé.
      const f = fleuveAvecIle(n);
      const obs = riverIslandObstacles([f.ile], f.sm);
      for (const lane of VOIES) {
        for (const p of margesLeLongDeLIle(f, obs, lane)) {
          expect(Math.abs(p.lat)).toBeLessThanOrEqual(p.berge);
        }
      }
    });
  }

  it("TÉMOIN : le disque seul de l'Aiguille (r = 1,6) laissait passer dessus", () => {
    // Sans ce témoin, les tests ci-dessus passeraient aussi sur du code qui n'a
    // jamais eu le défaut. On rejoue l'état d'AVANT — un unique obstacle au centre
    // au rayon de la merveille — et on exige qu'il échoue.
    const f = fleuveAvecIle(331);
    const tCentre = 0.5;
    const avant = [{ t: tCentre, lat: 0, r: 1.6 }];
    const dedans = VOIES.flatMap((lane) => margesLeLongDeLIle(f, avant, lane))
      .filter((p) => p.marge <= 0);
    expect(dedans.length).toBeGreaterThan(0);
  });

  it("TÉMOIN : un point unique au bon rayon échoue encore sur une PETITE carte", () => {
    // Le réflexe suivant — un seul obstacle, mais au rayon de l'île — tient sur
    // une grande carte et lâche sur une petite : la portée de l'évitement y tombe
    // à ~7,5 tuiles pour une île qui en fait 7,6 de demi-longueur, donc la force
    // s'annule pile aux deux pointes. C'est ce qui interdit de simplifier la
    // chaîne en un point.
    const f = fleuveAvecIle(116);
    const unSeul = [{ t: 0.5, lat: 0, r: f.ile.ry }];
    const dedans = VOIES.flatMap((lane) => margesLeLongDeLIle(f, unSeul, lane))
      .filter((p) => p.marge <= 0);
    expect(dedans.length).toBeGreaterThan(0);
  });

  it("ne publie JAMAIS un rayon nul (le piège du `o.r || 1.4`)", () => {
    // Aux pointes le fuseau a une demi-largeur qui tend vers 0. Publié tel quel,
    // `riverDodge` lirait `o.r || 1.4` et retomberait EN SILENCE sur un rayon
    // PLUS GRAND que l'île n'y est — un zéro qui se change en gros nombre.
    const f = fleuveAvecIle(331);
    for (const o of riverIslandObstacles([f.ile], f.sm)) {
      expect(o.r).toBeGreaterThan(0);
      expect(o.r).toBeLessThanOrEqual(f.ile.ry);
    }
  });

  it("couvre toute la longueur de l'île, pointe à pointe", () => {
    const f = fleuveAvecIle(331);
    const obs = riverIslandObstacles([f.ile], f.sm);
    const ts = obs.map((o) => o.t);
    const len = f.sm.length;
    // Les deux pointes de l'île, en `t`.
    const tAt = (x) => Math.round(x / 1.5) / (len - 1);
    expect(Math.min(...ts)).toBeLessThanOrEqual(tAt(f.ile.x - f.ile.rx) + 1e-9);
    expect(Math.max(...ts)).toBeGreaterThanOrEqual(tAt(f.ile.x + f.ile.rx) - 1e-9);
  });

  it("sans île, rien n'est publié", () => {
    const f = fleuveAvecIle(331);
    expect(riverIslandObstacles([], f.sm)).toEqual([]);
    expect(riverIslandObstacles(null, f.sm)).toEqual([]);
    expect(riverIslandObstacles([f.ile], null)).toEqual([]);
  });
});
