/* ============================================================================
 * buildingGenerator.js — BuildingGenerator
 *   Place les bâtiments décoratifs par catégorie en respectant le plan :
 *     - chaque catégorie a son propre classement des cellules (les maisons
 *       cherchent les quartiers d'habitat ET le bord des rues, les fermes la
 *       périphérie et la rive, les temples les places...) ;
 *     - les variantes visuelles dépendent de l'âge ET de la personnalité de
 *       la ville (une cité fastueuse n'aligne pas les mêmes façades qu'une
 *       cité modeste du même âge).
 *   Pour ajouter une variante : l'inscrire dans VARIANTS_* ci-dessous (elle
 *   doit exister dans renderBuildings/buildingShapes) — aucun autre fichier
 *   à modifier.
 * ============================================================================ */

import { hashString, mixSeed } from "./seedManager.js";

// ── Tables de variantes par bande d'ère ─────────────────────────────────────
// Chaque entrée : { base: [variantes neutres], <variantBias>: [variantes biaisées] }
// Exportée pour la garde de contraste bâti/sol (isoBuildingGroundContrast.test.js) :
// elle doit savoir QUELS archétypes une bande pose réellement, et le lire ici plutôt
// que d'en tenir une copie — une garde déduite d'une copie dérive en silence.
// ⚠ CE QUI FAIT LA VARIÉTÉ D'UNE RUE, C'EST LE NOMBRE D'ARCHÉTYPES, PAS LA RÈGLE DE
// TIRAGE. Raph, 2026-08-05 : « les îlots sont trop denses, surtout car il n'y a qu'un
// type de bâtiments ». Mesuré alors : 53,8 % des voisines d'une habitation portaient la
// même identité en b4, pour un mélange parfait à 33 % — parce que la bande n'offrait que
// TROIS archétypes. Aucun mélange ne peut créer une variété qui n'existe pas ; le remède
// est de l'ART. Quatre archétypes ajoutés le 2026-08-06 : `crafthouse` (b2-b3),
// `towerhouse` (b2-b3), `insula` (b4), `terrace` (b5-b6). Bandes 2 à 5 : 2-3 → 4 types.
export const VARIANTS_HOUSE = [
  { base: ["tent"], poor: ["tent"], rich: ["hut"] },
  { base: ["hut", "hut", "longhouse"], poor: ["tent", "hut", "hut"], rich: ["longhouse", "hut"] },
  { base: ["townhouse", "crafthouse", "courtyard", "townhouse"], poor: ["hut", "townhouse", "crafthouse"], rich: ["courtyard", "towerhouse", "townhouse", "manor"] },
  // ⚠ LA TOUR EST UN ACCENT, PAS UN TYPE COURANT. Mesuré en jeu à la bande 3 le
  // 2026-08-06, sur la liste `base` à 5 entrées : stonehouse 48,4 %, crafthouse 28,8 %,
  // towerhouse 22,8 % — soit une tour toutes les 4,4 maisons. À l'écran ça remplace une
  // monotonie par une autre : une forêt de pointes régulières. `towerhouse` fait 76 px
  // d'encre contre 49 pour `stonehouse` ; c'est justement ce qui en fait un REPÈRE, et
  // un repère qui se répète n'en est plus un. Reporté à 1 entrée sur 8 (~14 % de ce qui
  // se pose réellement), les deux types courants se partageant le reste à parts égales.
  { base: ["stonehouse", "crafthouse", "stonehouse", "towerhouse", "crafthouse", "stonehouse", "crafthouse", "manor"], poor: ["townhouse", "crafthouse", "stonehouse"], rich: ["manor", "towerhouse", "stonehouse"] },
  // b4 = Marbre / antiquité classique (habitants en toge) : pierre, cours et villas.
  // PAS d'immeuble XIXe ici — `block`/`tenement` (façades d'appartements) démarrent en
  // b5 = Fonte (époque industrielle), sinon on obtient « immeubles + toges ». `insula`
  // est l'immeuble de rapport ROMAIN (brique, balcons de bois, arcades au rez) : c'est
  // la hauteur d'habitation que cette bande pouvait avoir, et elle lui manquait.
  { base: ["courtyard", "insula", "stonehouse", "insula", "courtyard", "manor"], poor: ["stonehouse", "insula", "townhouse", "courtyard"], rich: ["manor", "courtyard", "insula", "manor"] },
  // ⚠ `terrace` ne compte QU'UNE FOIS dans chaque liste. Doublée, elle sortait à 525
  // exemplaires sur 988 en b5 et 481 sur 1261 en b6 : la rangée ouvrière est LARGE
  // (54 px de contenu, ~1,3 tuile) et la plus sombre de la série — à ce nombre elle
  // remplaçait le monotype qu'on voulait casser au lieu de le rompre.
  { base: ["block", "terrace", "tenement", "tower"], poor: ["terrace", "tenement", "tenement", "block"], rich: ["tower", "block", "terrace"] },
  { base: ["tower", "block", "megablock", "terrace", "arcologyhome"], poor: ["megablock", "tenement", "terrace", "tower"], rich: ["arcologyhome", "tower"] }
];

function variantList(table, band, bias) {
  const row = table[Math.max(0, Math.min(table.length - 1, band))];
  return (bias && row[bias]) || row.base;
}

// Empreinte au sol [largeur, profondeur] (en tuiles) par variante. Les grands
// bâtiments de late game réservent plus qu'une tuile : leur sprite est bien plus
// grand, donc la « tuile » grandit avec lui → plus de chevauchement des voisins.
//  - tours/immeubles FINS mais HAUTS : 1 large × 2 profond (denses côte à côte,
//    espacés en profondeur pour ne pas se recouvrir de face) ;
//  - mega-complexes LARGES : 2×2. Défaut 1×1.
const HOUSE_FOOTPRINT = {
  manor: [2, 2],                  // grande demeure (sprite ~1,3 tuile de large) : réserve son lot pour garder sa masse sans déborder
  tenement: [1, 2], tower: [1, 2],
  megablock: [2, 2], arcologyhome: [2, 2]
};
// EMPREINTES ÉLARGIES aux bandes cosmiques (reprise mégalopole, Raph 2026-08-03 :
// « les tours âge cosmique de plusieurs tuiles de large ») : la tour cesse d'être
// une aiguille d'une tuile pour devenir un monolithe 2×2. ⚠ L'ART DOIT SUIVRE :
// l'échelle de dessin dépend de l'empreinte (pixelHouseGeom : unit = w/spanX) —
// un sprite cousu pour 1×2 dessiné sur 2×2 RAPETISSE d'un tiers. Les sprites
// tower-cosmic sont générés pour CETTE empreinte (contenu ≤ 95 px). Avant la
// bande 7, rien ne bouge. (La « Tour-monde » 3×3 a été RETIRÉE — Raph
// 2026-08-03, « le rendu n'est pas pertinent » : noyée parmi les monolithes.)
const HOUSE_FOOTPRINT_COSMIC = { tower: [2, 2] };
export const houseFootprint = (variant, eraBand = 0) =>
  (eraBand >= 7 && HOUSE_FOOTPRINT_COSMIC[variant]) || HOUSE_FOOTPRINT[variant] || [1, 1];

// Affinité catégorie ↔ type de quartier : un bonus de placement quand la
// cellule est dans le rayon d'une ancre du bon kind.
const CATEGORY_AFFINITY = {
  house: { habitat: 1.4, marchand: 0.6, agricole: 0.5, prestige: 0.4 }
};

export function createBuildingPlacer({
  cells, plan, roadKey, counts, personality, seed, N, requireRoad = false
}) {
  const bias = personality.variantBias;
  const core = plan.core;
  const maxDist = Math.max(1, Math.hypot(N / 2, N / 2));

  // Adjacence aux rues : un bâtiment "tient" sa rue. Bonus fort à 1 cellule,
  // léger à 2 — au-delà, malus (évite les bâtiments orphelins au milieu de rien).
  const roadAdj = (gx, gy) => {
    for (let d = 1; d <= 2; d += 1) {
      if (roadKey.has((gx + d) + "," + gy) || roadKey.has((gx - d) + "," + gy)
        || roadKey.has(gx + "," + (gy + d)) || roadKey.has(gx + "," + (gy - d))
        || (d === 1 && (roadKey.has((gx + 1) + "," + (gy + 1)) || roadKey.has((gx - 1) + "," + (gy - 1))
          || roadKey.has((gx + 1) + "," + (gy - 1)) || roadKey.has((gx - 1) + "," + (gy + 1))))) {
        return d === 1 ? 1 : 0.45;
      }
    }
    return 0;
  };

  // Route dans un rayon de HOUSE_ROAD_RADIUS cellules (Chebyshev). Sert de FILTRE
  // de pose (requireRoad) : les maisons remplissent l'INTÉRIEUR des blocs (pas
  // seulement le liseré de rue → on VEUT des bâtiments au milieu), tout en bornant
  // la distance à une voie (pas d'orphelin perdu au milieu de nulle part, à relier).
  const HOUSE_ROAD_RADIUS = 4;
  const nearRoad = (gx, gy) => {
    for (let dx = -HOUSE_ROAD_RADIUS; dx <= HOUSE_ROAD_RADIUS; dx += 1) {
      for (let dy = -HOUSE_ROAD_RADIUS; dy <= HOUSE_ROAD_RADIUS; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        if (roadKey.has((gx + dx) + "," + (gy + dy))) return true;
      }
    }
    return false;
  };

  const anchorAffinity = (gx, gy, category) => {
    const weights = CATEGORY_AFFINITY[category] || {};
    let best = 0;
    for (const a of plan.anchors || []) {
      const w = weights[a.kind] || 0;
      if (!w) continue;
      const d = Math.hypot(gx + 0.5 - a.gx, gy + 0.5 - a.gy);
      const prox = Math.max(0, a.r * 1.4 - d) / Math.max(1, a.r);
      if (prox * w > best) best = prox * w;
    }
    return best;
  };

  // Désordre contrôlé : plus la ville est organique (order bas) ou en chaos,
  // plus le tirage cellule par cellule est bruité. Hash entier (fonction
  // chaude : une évaluation par cellule et par catégorie).
  const noiseAmp = 14 * (1 - plan.order) + plan.chaos * 22;
  const labelSeeds = {};
  const jitter = (gx, gy, label) => {
    const lh = labelSeeds[label] || (labelSeeds[label] = mixSeed(seed, label));
    const h = (Math.imul(gx | 0, 73856093) ^ Math.imul(gy | 0, 19349663) ^ lh) >>> 0;
    return ((h % 1000) / 1000 - 0.5) * noiseAmp;
  };

  const coreDist = (c) => Math.hypot(c.gx + 0.5 - core.x, c.gy + 0.5 - core.y) / maxDist * 100;

  // Classements par catégorie — plus le score est bas, plus la cellule est
  // attribuée tôt (donc présente dès que la ville est petite).
  const sorters = {
    house: (c) => coreDist(c) * 0.9
      - roadAdj(c.gx, c.gy) * 26
      - anchorAffinity(c.gx, c.gy, "house") * 18
      + jitter(c.gx, c.gy, "house")
  };

  const orderedFor = {};
  const orderedList = (category) => {
    if (!orderedFor[category]) {
      // Décore-trie-retire : le score (boucle sur les ancres) n'est calculé
      // qu'une fois par cellule, pas à chaque comparaison du tri.
      const scorer = sorters[category] || sorters.house;
      orderedFor[category] = cells
        .map((cell) => ({ cell, s: scorer(cell) }))
        .sort((a, b) => a.s - b.s)
        .map((e) => e.cell);
    }
    return orderedFor[category];
  };

  // (La promotion « supertower » des slots 0/12 vivait ici — RETIRÉE le
  // 2026-08-03, décision Raph : « le rendu n'est pas pertinent ». Depuis que
  // les tours ordinaires sont des monolithes 2×2 de 11 t, un colosse de 14 t
  // ne crevait plus la skyline. Ne pas re-proposer ; l'historique complet est
  // dans docs/PLAN-ECHELLE.md §B3 et docs/PLAN-TISSU-URBAIN.md §10.)
  //
  // ÎLOTS UNIFORMES aux bandes cosmiques (Raph 2026-08-03 : « de grosses
  // mégalopoles d'immeubles tel cyberpunk, ou ce qu'on voit en Chine ») : le
  // tirage est quantifié par pâté de BLOCK_Q×BLOCK_Q cellules — tout un îlot
  // porte le MÊME variant et se lit en rangées d'immeubles identiques, pas en
  // bric-à-brac. Les teintes suivent déjà : les skins cosmiques n'en ont pas
  // (houseTintOf les exclut). Avant la bande 7, tirage historique inchangé.
  const BLOCK_Q = 3;

  // ⚠ LE TIRAGE NE DOIT PAS DÉPENDRE DE LA CELLULE (lot S4, 2026-08-06).
  // Il en dépendait, et ça CONFISQUAIT les grandes empreintes. Quand `finalize`
  // refusait un 2×2 qui ne tenait pas, le slot passait à la cellule suivante — donc
  // à un AUTRE tirage. Le grand bâtiment n'était jamais réessayé, il était remplacé.
  // Mesuré en jeu avant correctif, part posée contre part attendue :
  //
  //   1×1 (block, b5)            20 %  →  36,8 %   (absorbe la part des autres)
  //   1×2 (tenement, tower, b5)  20 %  →  13,9 / 12,5 %
  //   2×2 (manor, b4)          16,7 %  →   2,7 %
  //   2×2 (manor, b3)          12,5 %  →   0 %     (jamais posé, archétype invisible)
  //
  // La pénalité croissait avec la taille, c'est-à-dire à l'inverse de ce qui fait
  // lire une ville : les grandes masses sont les repères.
  //
  // Le tirage se fait donc sur l'INDEX DE SLOT seul. ⚠ Pas `(n + h)` avec un h
  // constant : l'index suit l'ordre de tri (donc la distance au cœur), et une somme
  // ferait défiler la liste en anneaux concentriques. Un hash DE l'index n'a pas
  // cette corrélation spatiale.
  //
  // ⚠ Les bandes cosmiques gardent leur tirage par BLOC : là on VEUT des îlots
  // uniformes (Raph 2026-08-03), et leurs empreintes sont posées par un autre chemin.
  const chooseVariant = (category, n, cell) => {
    const list = variantList(VARIANTS_HOUSE, counts.eraBand, bias);
    if (counts.eraBand >= 7) {
      const hq = hashString(seed + ":" + category + ":q" + Math.floor(cell.gx / BLOCK_Q) + ":" + Math.floor(cell.gy / BLOCK_Q));
      return list[hq % list.length];
    }
    return list[hashString(seed + ":" + category + ":v" + n) % list.length];
  };

  // Quartier d'appartenance d'une cellule : l'ancre la plus proche dont le
  // rayon d'influence la couvre. Sert aux teintes de quartier du rendu.
  const quarterKindAt = (gx, gy) => {
    let best = null, bestD = Infinity;
    for (const a of plan.anchors || []) {
      const d = Math.hypot(gx + 0.5 - a.gx, gy + 0.5 - a.gy);
      if (d <= a.r * 1.5 && d < bestD) { bestD = d; best = a.kind; }
    }
    return best;
  };

  const quarterIdAt = (gx, gy) => {
    let best = "outskirts", bestD = Infinity;
    const anchors = plan.anchors || [];
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      const d = Math.hypot(gx + 0.5 - a.gx, gy + 0.5 - a.gy);
      if (d <= a.r * 1.5 && d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  // Place `count` bâtiments d'une catégorie ; `usedKeys` est partagé avec le
  // placement moteur pour éviter tout chevauchement.
  const placeCategory = (category, count, usedKeys, pushTile) => {
    const list = orderedList(category);
    let placed = 0;
    for (let i = 0; i < list.length && placed < count; i += 1) {
      const cell = list[i];
      const k = cell.gx + "," + cell.gy;
      if (usedKeys.has(k)) continue;
      // PR2 — placement par lots : tout bâtiment décoratif doit être PROCHE d'une
      // rue (rayon HOUSE_ROAD_RADIUS). Assez large pour remplir l'intérieur des
      // blocs (bâtiments au milieu), assez borné pour éviter les orphelins isolés.
      if (requireRoad && !nearRoad(cell.gx, cell.gy)) continue;
      const variant = chooseVariant(category, placed, cell);
      pushTile({
        gx: cell.gx, gy: cell.gy, type: category,
        variant,
        qkind: quarterKindAt(cell.gx, cell.gy),
        key: k, d2: cell.d2
      });
      usedKeys.add(k);
      placed += 1;
    }
    return placed;
  };

  return { placeCategory, chooseVariant, orderedList, quarterKindAt, quarterIdAt, roadAdj, nearRoad, requireRoad };
}

// ── Placement décoratif PERSISTANT (slots) ──────────────────────────────────
// Étend aux décoratifs le mécanisme de slots déjà utilisé par les moteurs : chaque
// index reçoit une position sauvée UNE FOIS (offset core-relatif dans `store`) et
// réutilisée tant qu'elle tient. Le bâtiment ne bouge plus jamais ; seul son design
// (variant, piloté par eraBand) évolue. Pur/testable : toutes les dépendances au
// monde (cellFree, pushTile, store, chooseVariant…) sont injectées. Renvoie le
// nombre de bâtiments posés.
//
// Deux passes :
//   1. réutilise les positions sauvées (épingle l'existant) ;
//   2. comble les index manquants depuis le tri `ordered` (nouveaux à la frange).
// Sur une partie fraîche (aucun slot), la passe 1 ne fait rien et la passe 2
// reproduit à l'identique le placement positionnel d'origine.
export function placeCategorySlotted(category, count, ctx) {
  const {
    ordered, store, live, cx, cy, N, cycle,
    cellFree, chooseVariant, quarterKindAt, pushTile, clamp,
    eraBand = 0
  } = ctx;
  const slotKey = (i) => cycle + ":dec_" + category + ":" + i;
  let placed = 0;

  const finalize = (i, cell, forced) => {
    // L'index PERSISTANT `i` (pas le rang d'attribution) pilote chooseVariant :
    // le design reste stable à position fixe et n'évolue que par eraBand.
    // `forced` : variant déjà tiré par la passe 2 pour sonder une emprise — le
    // retirer ici donnerait le même résultat (le tirage ne dépend plus de la
    // cellule sous la bande 7), mais l'expliciter évite de le faire deux fois.
    const variant = forced || chooseVariant(category, i, cell);
    // Empreinte multi-tuiles des grands bâtiments : refuse la pose si le rectangle
    // complet ne tient pas (cellFree est span-aware côté runtime) → refit ailleurs.
    const [spanX, spanY] = houseFootprint(variant, eraBand);
    if ((spanX > 1 || spanY > 1) && !cellFree(cell.gx, cell.gy, spanX, spanY)) return false;
    const dx = cell.gx - cx, dy = cell.gy - cy;
    pushTile({
      gx: cell.gx, gy: cell.gy, type: category, variant, spanX, spanY,
      qkind: quarterKindAt(cell.gx, cell.gy),
      key: cell.gx + "," + cell.gy,
      revealIdx: i,   // index de slot persistant → ordre de révélation per-buy (catégorie enginehome)
      d2: cell.d2 != null ? cell.d2 : dx * dx + dy * dy
    });
    store[slotKey(i)] = { dx, dy, zone: "dec", id: category };
    live.add(slotKey(i));
    placed += 1;
    return true;
  };

  // Passe 1 — réutiliser les positions sauvées.
  const reused = new Set();
  for (let i = 0; i < count; i += 1) {
    const slot = store[slotKey(i)];
    if (!slot) continue;
    const gx = clamp(cx + (Number(slot.dx) || 0), 0, N - 1);
    const gy = clamp(cy + (Number(slot.dy) || 0), 0, N - 1);
    if (!cellFree(gx, gy)) continue; // devenue route/eau/occupée → refit en passe 2
    if (finalize(i, { gx, gy })) reused.add(i);
  }

  // Passe 2 — combler les index manquants depuis le tri.
  //
  // ⚠ SONDE SANS CONSOMMER LE CURSEUR pour les grandes empreintes (lot S4). Depuis
  // que le variant est STABLE pour un slot donné, laisser la boucle avancer le
  // curseur à chaque refus serait pire qu'avant : un seul 2×2 sans place mangerait
  // toute la file et les slots suivants ne recevraient rien. On sonde donc en avant,
  // borné, et on ne consomme le curseur que si la cellule retenue est la courante.
  //
  // ⚠ Les bandes cosmiques gardent la boucle D'ORIGINE : leur tirage est quantifié
  // par bloc de cellules (îlots uniformes voulus), donc il dépend légitimement de la
  // cellule et une sonde changerait le variant en route.
  const LOOKAHEAD = 96;
  let cursor = 0;
  if (eraBand >= 7) {
    for (let i = 0; i < count; i += 1) {
      if (reused.has(i)) continue;
      while (cursor < ordered.length) {
        const cell = ordered[cursor++];
        if (!cellFree(cell.gx, cell.gy)) continue;
        if (finalize(i, cell)) break;
      }
    }
    return placed;
  }
  for (let i = 0; i < count; i += 1) {
    if (reused.has(i)) continue;
    while (cursor < ordered.length && !cellFree(ordered[cursor].gx, ordered[cursor].gy)) cursor += 1;
    if (cursor >= ordered.length) break;
    const variant = chooseVariant(category, i, ordered[cursor]);
    const [sx, sy] = houseFootprint(variant, eraBand);
    if (sx > 1 || sy > 1) {
      let found = -1;
      for (let k = cursor; k < Math.min(ordered.length, cursor + LOOKAHEAD); k += 1) {
        const c = ordered[k];
        if (cellFree(c.gx, c.gy, sx, sy)) { found = k; break; }
      }
      // Aucune place pour cette emprise dans la fenêtre : on RABAT sur un variant
      // 1×1. Première version écrite : sauter le slot, pour ne pas reproduire le
      // défaut corrigé (la grande masse remplacée en silence). Mesuré, c'est pire —
      // les emplacements 2×2 sont réellement rares dans le résidu entre les rues, et
      // sauter coûtait 54 bâtiments sur 522 à la bande 4, soit 10 % de la ville. La
      // masse bâtie compte plus que la pureté du tirage ; le repli est donc assumé,
      // mais EXPLICITE et déterministe (on refait tourner le tirage sur un index
      // décalé jusqu'à tomber sur une empreinte simple).
      if (found < 0) {
        let repli = null;
        for (let k = 1; k <= 8 && !repli; k += 1) {
          const v = chooseVariant(category, i + k * 7919, ordered[cursor]);
          const [fx, fy] = houseFootprint(v, eraBand);
          if (fx === 1 && fy === 1) repli = v;
        }
        if (!repli) continue;                       // liste sans aucun 1×1 : on saute
        finalize(i, ordered[cursor], repli);
        cursor += 1;
        continue;
      }
      finalize(i, ordered[found], variant);
      if (found === cursor) cursor += 1;
      continue;
    }
    finalize(i, ordered[cursor], variant);
    cursor += 1;
  }
  return placed;
}
