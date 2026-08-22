import { describe, it, expect, afterEach } from "vitest";

import { CM } from "../layout.js";
import { isoUnitDepth, isoUnitDepthEx } from "../iso/isoRenderer.js";

// PROFONDEUR PEINTRE des unités mobiles (habitants / véhicules / émeutiers) en
// iso (isoUnitDepth). drawIsoLive classe chaque bâtiment au coin SUD de son
// emprise (clé x1+y1) : une unité qui longe la face sud/est d'une emprise
// multi-tuiles a une somme wx+wy PLUS PETITE que cette clé → elle était
// dessinée AVANT, donc avalée par le mur qu'elle devance (retour Raph « pas de
// cohérence de profondeur »). isoUnitDepth remonte sa clé juste au-dessus de
// celle du bâtiment ; une unité DERRIÈRE (nord-ouest, colonne recouverte)
// plafonne au contraire toute remontée SOUS la clé de son occulteur (jamais
// dessinée sur son toit — l'occulteur gagne, comme la passe 1 du legacy).

const T = 32;
const house = (gx, gy, spanX, spanY, buildingId = "house") => ({ gx, gy, spanX, spanY, buildingId, type: "house" });
function setLayout(tiles) {
  CM.TILE = T;
  CM.layout = { tiles };
  // Invalide la mémo des fiches (clé = layoutRecomputeAt).
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
}
afterEach(() => { CM.layout = null; });

describe("isoUnitDepth — unités face aux emprises multi-tuiles", () => {
  it("unité sur la route SUD d'une tour 1×2, collée au mur : remontée juste devant la clé", () => {
    setLayout([house(95, 86, 1, 2)]);                 // coin sud (96,88) → clé 184·T
    const d = isoUnitDepth(95.3 * T, 88.2 * T);       // somme brute 183.5·T < 184·T
    expect(d).toBeGreaterThan(184 * T);               // passe devant le mur…
    expect(d - 184 * T).toBeLessThanOrEqual(T);       // …d'un cheveu seulement
  });

  it("unité sur le flanc EST d'une tour 2×2 (cas voiture vérifié in-game) : devant", () => {
    setLayout([house(98, 77, 2, 2)]);                 // coin sud (100,79) → clé 179·T
    const d = isoUnitDepth(100.5 * T, 78.2 * T);      // somme brute 178.7·T, wx ≥ x1 → devant
    expect(d).toBeGreaterThan(179 * T);
  });

  it("unité au NORD (vraiment derrière) : clé brute inchangée — elle reste occultée", () => {
    setLayout([house(10, 10, 2, 2)]);                 // clé 24·T
    expect(isoUnitDepth(11 * T, 9.5 * T)).toBe((11 + 9.5) * T);
  });

  it("unité hors de la colonne du sprite : clé brute (pas de recouvrement)", () => {
    setLayout([house(10, 10, 1, 1)]);                 // ax = 0, halfW ≈ 1.23·T
    // Voisine (fiche balayée) mais à l'ouest du rect : |sxScr − ax| = 2.2·T > halfW → intacte.
    expect(isoUnitDepth(9.2 * T, 11.4 * T)).toBe((9.2 + 11.4) * T);
  });

  it("conflit devant B1 / derrière B2 : la remontée PLAFONNE sous la clé de l'occulteur", () => {
    // B1 très large au nord (clé 27·T) ; B2 1×1 au sud de l'unité (clé 27·T − 1·T).
    setLayout([house(10, 10, 6, 1), house(13, 12, 1, 1)]);
    const raw = (13.5 + 11.3) * T;                    // 24.8·T
    const d = isoUnitDepth(13.5 * T, 11.3 * T);       // devant B1 (wy ≥ 11) mais derrière B2
    expect(d).toBeGreaterThan(raw);                   // remontée réelle…
    expect(d).toBeLessThan((14 + 13) * T);            // …mais jamais au-dessus de B2 (pas sur son toit)
  });

  it("empreinte À PLAT (champ) : ignorée — le sol ne peut pas avaler une unité", () => {
    setLayout([house(95, 86, 1, 2, "field-wheat")]);
    expect(isoUnitDepth(95.3 * T, 88.2 * T)).toBe((95.3 + 88.2) * T);
  });

  it("point d'eau : ignoré — c'est un PROP, pas une façade qui occulte", () => {
    // L'exclusion date de l'aqueduc-conduite (tranches par tuile, clippées à
    // leur colonne). Elle reste, pour une raison NEUVE : le puits qui l'a
    // remplacé est du mobilier de rue, et aucun prop de place (banc, fontaine)
    // ne figure dans les fiches d'unité. Emprise 1×1 depuis 2026-08-05.
    setLayout([house(90, 40, 1, 1, "aqueducts")]);
    expect(isoUnitDepth(90.4 * T, 40.6 * T)).toBe((90.4 + 40.6) * T);
  });

  it("sans layout : somme brute (repli sûr)", () => {
    CM.layout = null;
    expect(isoUnitDepth(5 * T, 7 * T)).toBe(12 * T);
  });

  // ── PORTAGE DU TRI PEINTRE LEGACY (Q7, décision Raph 2026-08-22) ───────────
  // Les 13 `it` de ysortPainter.test.js meurent avec `frontByPainter` quand le
  // rendu top-down sera retiré. 11 des 13 règles sont déjà couvertes plus haut,
  // sous une autre géométrie (flanc est, colonne non recouverte, empreinte à
  // plat, repli sans layout, base au rang sud…). Les deux qui suivent closent
  // le portage. Cartographie complète : docs/PLAN-SUPPRESSION-LEGACY.md, étape 3.
  //
  // Celle-ci rejoue le BUG FONDATEUR dans sa géométrie d'origine — deux tours,
  // l'unité dans la rue entre les deux (ysortPainter.test.js:48, « rue entre
  // deux rangs de tours → derrière (fini les piétons debout sur les toits) »,
  // rapport Raph 2026-07-10). Elle mérite son `it` littéral : le bug est DÉJÀ
  // REVENU une fois. Le contrat iso l'exprime autrement — pas un booléen de
  // passe, mais une clé qui doit rester SOUS celle de la tour sud.
  it("RUE ENTRE DEUX RANGS DE TOURS : l'unité reste sous la clé de la tour sud (jamais sur son toit)", () => {
    const nord = house(8, 7, 1, 1);                  // clé 17·T
    const sud = house(8, 9, 1, 1);                   // clé 19·T
    const wx = 8.5 * T, wy = 8.5 * T, raw = wx + wy; // pieds au milieu de la rue, clé brute 17·T

    // La tour NORD seule ne fait rien : sa clé vaut exactement la clé brute de
    // l'unité, qui est donc déjà dessinée après elle. Rien ne l'occulte.
    setLayout([nord]);
    const seul = isoUnitDepthEx(wx, wy);
    expect(seul.d).toBe(raw);
    expect(seul.hidden).toBe(false);

    // Les DEUX : la tour sud plafonne. L'unité garde sa clé brute — donc elle
    // passe AVANT la tour sud (clé 19·T), qui la recouvre. C'est exactement le
    // verdict « passe 1 » du legacy, et l'inverse du bug (où la tour nord
    // suffisait à la faire passer devant, donc par-dessus le toit du sud).
    setLayout([nord, sud]);
    const deux = isoUnitDepthEx(wx, wy);
    expect(deux.d).toBe(raw);
    expect(deux.d).toBeLessThan(19 * T);             // sous la clé de la tour sud
    expect(deux.hidden).toBe(true);                  // → passe silhouette fantôme
  });
});

// ── DIVERGENCE ASSUMÉE : AUCUNE HAUTEUR DANS LES FICHES (Q9 / P23) ──────────
// Le legacy pesait `topY` : une tour au sud TROP BASSE pour recouvrir la rue
// n'occultait pas (ysortPainter.test.js:56). Les fiches iso ne portent aucune
// hauteur — la règle n'est pas portable, et la mesure du 2026-08-22 dit qu'elle
// n'a pas besoin de l'être : en jeu (sonde __depthProbe, ères 11/23/161),
// 3 468 évaluations et 773 conflits remontée+plafond ont donné ZÉRO remontée
// écrasée. La hauteur d'un bâtiment n'entre jamais dans le verdict.
//
// ⚠⚠ MAIS UN PLAFOND PEUT ÉCRASER UNE REMONTÉE — pour une autre raison, et le
// balayage ci-dessous l'attrape. Quand le lifteur et le plafonneur ont EXACTEMENT
// LA MÊME CLÉ PEINTRE, isoUnitDepthEx calcule lift = clé + T·0.02 et
// cap = clé − T·0.02 : le plafond gagne de 2·epsilon et l'unité bascule de
// « juste après les deux bâtiments » à « juste avant les deux ». Elle se fait
// alors avaler par le mur qu'elle longeait. Rien à voir avec la hauteur : c'est
// un départage d'ÉGALITÉ. Mesuré : 2 cas sur 19 557 géométries légales (0,01 %),
// tous à clé égale, tous d'exactement 2·epsilon — et 0 occurrence en jeu.
//
// Ce test FIGE cette frontière : une perte est tolérée UNIQUEMENT à clé égale et
// UNIQUEMENT jusqu'à 2·epsilon. Toute perte plus grande, ou à clés différentes,
// serait une régression franche du tri.
//
// ⚠ Une suppression dans une ville à N bâtiments est toujours TÉMOIGNÉE PAR UNE
// PAIRE (la classification d'un bâtiment ne dépend que de lui et de l'unité,
// jamais des autres) : le balayage à deux bâtiments couvre donc le cas général.
// ⚠⚠ Les emprises qui SE CHEVAUCHENT sont rejetées. Sans cette contrainte le
// balayage remonte des centaines de faux positifs : géométrie qui n'existe pas
// en ville, et dans isoUnitFiches la seconde fiche ÉCRASE la première dans la
// Map — la géométrie testée n'est même pas celle qu'on croit.
// ⚠⚠ ÉCHANTILLONNER PRÈS DES FACES. Un tirage aléatoire à position continue
// RATE ce cas (866 418 tirages, zéro trouvaille) : la remontée ne se déclenche
// qu'en longeant une face, bande étroite que le hasard visite peu. C'est la
// grille régulière ci-dessous, calée à 0,35 tuile des faces, qui l'a levé.
describe("isoUnitDepth — un plafond ne coûte qu'un départage d'égalité, jamais un rang", () => {
  const EPS = T * 0.02;
  const overlap = (a, b) => a.gx < b.gx + b.spanX && b.gx < a.gx + a.spanX
                         && a.gy < b.gy + b.spanY && b.gy < a.gy + a.spanY;
  const inside = (b, cx, cy) => cx >= b.gx && cx < b.gx + b.spanX && cy >= b.gy && cy < b.gy + b.spanY;
  const cle = (b) => (b.gx + b.spanX) * T + (b.gy + b.spanY) * T;

  it("balayage déterministe de géométries légales à deux bâtiments", () => {
    let cas = 0, remontees = 0, egalites = 0, pertes = 0;
    const graves = [];
    for (let s1x = 1; s1x <= 3; s1x += 1) for (let s1y = 1; s1y <= 3; s1y += 1) {
      for (let s2x = 1; s2x <= 2; s2x += 1) for (let s2y = 1; s2y <= 2; s2y += 1) {
        const b1 = house(10, 10, s1x, s1y);
        for (let dx = -3; dx <= 3; dx += 1) for (let dy = -3; dy <= 3; dy += 1) {
          const b2 = house(10 + dx, 10 + dy, s2x, s2y);
          if (overlap(b1, b2)) continue;                       // emprises disjointes
          for (let ux = 0; ux < 4; ux += 1) for (let uy = 0; uy < 4; uy += 1) {
            const wx = (9 + ux * 1.3 + 0.35) * T, wy = (9 + uy * 1.3 + 0.35) * T;
            const cx = Math.floor(wx / T), cy = Math.floor(wy / T);
            if (inside(b1, cx, cy) || inside(b2, cx, cy)) continue;   // l'unité est dehors
            setLayout([b1]); const seul1 = isoUnitDepth(wx, wy);
            setLayout([b2]); const seul2 = isoUnitDepth(wx, wy);
            setLayout([b1, b2]); const deux = isoUnitDepth(wx, wy);
            cas += 1;
            if (cle(b1) === cle(b2)) egalites += 1;
            const meilleur = Math.max(seul1, seul2);
            if (meilleur > wx + wy) remontees += 1;
            const perte = meilleur - deux;
            if (perte <= 1e-9) continue;                       // rien perdu
            pertes += 1;
            // Tolérance UNIQUE : clés égales, et pas plus de 2·epsilon.
            const tolere = cle(b1) === cle(b2) && perte <= 2 * EPS + 1e-9;
            if (!tolere && graves.length < 4) {
              graves.push({ b1: [b1.gx, b1.gy, s1x, s1y], k1: cle(b1) / T,
                b2: [b2.gx, b2.gy, s2x, s2y], k2: cle(b2) / T,
                u: [wx / T, wy / T], seul1, seul2, deux, perteTuiles: perte / T });
            }
          }
        }
      }
    }
    // Le balayage doit être NON VIDE et exercer réellement des remontées et des
    // égalités de clé, sinon l'invariant serait vrai par vacuité — garde-fou
    // contre un futur resserrage de la fenêtre qui viderait le test en silence.
    expect(cas).toBeGreaterThan(5000);
    expect(remontees).toBeGreaterThan(200);
    expect(egalites).toBeGreaterThan(200);
    expect(graves).toEqual([]);
    // Le cas toléré EXISTE : si ce compte tombe à zéro, c'est que le départage a
    // été corrigé (tant mieux) — relire Q9 dans le plan et retirer la tolérance.
    expect(pertes).toBeGreaterThan(0);
  });
});
