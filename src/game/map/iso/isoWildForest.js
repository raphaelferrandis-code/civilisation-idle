// LA FORÊT SAUVAGE — la ceinture d'arbres autour de la ville.
//
// Extraite d'isoRenderer.js le 2026-08-23 (Q10). Elle décide OÙ l'herbe est
// sauvage : ni sol urbain, ni route, ni eau, ni berge, ni emprise de bâtiment, ni
// parvis de merveille — et y sème des arbres par blocs mémoïsés, pour qu'un pan de
// caméra ne reconstruise pas la ceinture entière.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// 5 sortants, 2 entrants (`WONDER_GROUND`/`wonderGroundSet`, sortis dans
// isoWonderGround.js pour éviter un cycle). Vérifié par comparaison ligne à ligne
// avec la version commitée.
import { CM, cmHash, cmCellNoise } from '../layout.js';
import { WONDER_GROUND, wonderGroundSet } from './isoWonderGround.js';

// ── Forêt sauvage : ceinture d'arbres autour de la ville ─────────────────────
// Le legacy (cityMapDrawTrees) peignait une forêt sur TOUTE l'herbe hors « sol
// urbain » ; en iso ce pipeline est SAUTÉ et drawIsoGround ne pose que l'herbe →
// la ville se retrouvait nue dans une plaine. On replante donc les arbres sur
// l'herbe sauvage (hors urbanSet / route / eau / berge), poussés dans `items` :
// mêmes sprites tree-N et même tri de profondeur que les arbres décoratifs
// (L.trees, tous ⊂ urbanSet → aucun doublon). La liste est STATIQUE dans le
// monde : on la mémoïse par (layout, région visible élargie de WILD_PAD) et on
// ne rebalaie le bruit de placement que si le layout change ou si la caméra sort
// de la région couverte — même idiome que les bakes à marge.
export const WILD_PAD = 12;                    // cellules de marge : pan sans reconstruire
// Emprises des BÂTIMENTS (tuiles du layout) : la forêt sauvage ne pousse PAS
// dessus. La plupart des emprises sont déjà dans urbanSet, mais le CHAMP (posé
// sur l'herbe par la voie « ceinture agricole », hors urbanSet/occupiedFoot) y
// échappait → des arbres sauvages le traversaient, révélés depuis que les
// empreintes à plat se trient SOUS les objets. On couvre toutes les emprises.
//
// ⚠ MÉMOÏSÉ SUR LE LAYOUT, pas sur la vue : ce Set ne dépend que des tuiles,
// alors qu'il était reconstruit à CHAQUE régénération de la forêt — c'est-à-dire
// à chaque franchissement des bornes cachées, donc en plein pan. Mesuré sur une
// ville de 1 151 tuiles : la régénération coûtait 16 ms de surcoût médian
// (pics à 33 ms), les pics de `vif-collecte` relevés sur la machine de jeu.
function isoBuildFootSet(L) {
  const at = CM.layoutRecomputeAt || 0;
  const n = (L.tiles && L.tiles.length) | 0;
  const c = CM._isoBuildFoot;
  if (c && c.at === at && c.n === n) return c.set;
  const set = new Set();
  for (const t of (L.tiles || [])) {
    const tsx = t.spanX || t.size || 1, tsy = t.spanY || t.size || 1;
    for (let ax = 0; ax < tsx; ax += 1) for (let ay = 0; ay < tsy; ay += 1) set.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  CM._isoBuildFoot = { at, n, set };
  return set;
}

// ── FORÊT SAUVAGE PAR BLOCS ──────────────────────────────────────────────────
// La dispersion était mémoïsée sur la ZONE VISIBLE : dès que la vue sortait des
// bornes cachées (donc en plein pan), TOUTE la zone était rebalayée — mesuré
// 14-16 ms de surcoût médian, pics à 33 ms : les pics de `vif-collecte` relevés
// sur la machine de jeu. Le balayage se fait désormais par BLOCS alignés sur la
// grille (invariants par pan, comme les tuiles d'une carte) : franchir une
// frontière ne coûte que le ou les blocs nouvellement entrés, jamais la zone
// entière. La liste concaténée est elle-même mémoïsée tant que l'ensemble des
// blocs visibles ne change pas.
// Longueur minimale d'une série de sprites pour valoir une bascule GL : sous ce
// seuil, la composition (un blit plein écran) coûterait plus que les
// `drawImage` économisés. 120 capture les ceintures forestières et laisse la
// poussière de séries courtes au chemin 2D.
export const GL_RUN_MIN = 120;

// Pesée fine de la passe vivante (opt-in : globalThis.__isoProfParts = true) :
// isole les postes procéduraux candidats à la cuisson en texture. Le drapeau se
// lit UNE fois par frame (constante d'import : la molette n'aurait aucun effet
// après chargement).

// Seuil d'éclaircie de la forêt : taille de tuile écran sous laquelle les
// arbres se chevauchent au point qu'en retirer devient invisible (à 11 px, un
// arbre en couvre ~21 et ses voisins mordent dessus).
export const WILD_THIN_UNIT = 14;

export const WILD_BLOCK = 32;                  // cellules par côté de bloc
const WILD_BLOCK_CAP = 512;             // blocs gardés (au-delà : on repart à neuf)

function isoWildForestBlock(L, bx, by, ctx) {
  const gx0 = bx * WILD_BLOCK, gy0 = by * WILD_BLOCK;
  const gx1 = gx0 + WILD_BLOCK - 1, gy1 = gy0 + WILD_BLOCK - 1;
  const { isWild, nearCity, cellNoise } = ctx;
  const arr = [];
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      if (!isWild(gx, gy)) continue;
      let thr = cellNoise(gx, gy) * 1.25 - 0.08;       // fourrés (haut) / trouées (bas)
      if (nearCity(gx, gy)) thr -= 0.35;               // aère la lisière
      if ((cmHash(gx + 'f' + gy) % 1000) / 1000 >= thr) continue;
      // Décalage sous-cellule + taille par arbre (hash riche) : casse la grille et
      // l'uniformité — mêmes plages que les arbres décoratifs (r ≈ 0.62..0.96).
      const h = cmHash('wf:' + gx + ':' + gy);
      const jx = ((h % 100) / 100 - 0.5) * 0.6;
      const jy = (((h >> 7) % 100) / 100 - 0.5) * 0.6;
      const r = 0.62 + (h % 30) / 80;
      arr.push({ gx, gy, jx, jy, r });
    }
  }
  return arr;
}

export function isoWildForest(L, b) {
  // ':pv…' : le parvis d'une merveille en APERÇU (hors urbanSet, contrairement aux
  // actives) doit chasser les arbres sauvages → la dispersion se refait à l'aller-retour.
  const sig = (CM.layoutRecomputeAt || 0) + ':' + (L.gridN | 0) + ':' + (L.mapSeed || 0)
    + (CM.previewWonder ? ':pv' + CM.previewWonder.id : '');
  let st = CM._isoWildForest;
  if (!st || st.sig !== sig || st.blocks.size > WILD_BLOCK_CAP) {
    st = CM._isoWildForest = { sig, blocks: new Map(), list: [], key: '' };
  }
  const bx0 = Math.floor((b.gx0 - WILD_PAD) / WILD_BLOCK);
  const bx1 = Math.floor((b.gx1 + WILD_PAD) / WILD_BLOCK);
  const by0 = Math.floor((b.gy0 - WILD_PAD) / WILD_BLOCK);
  const by1 = Math.floor((b.gy1 + WILD_PAD) / WILD_BLOCK);
  const key = bx0 + ':' + bx1 + ':' + by0 + ':' + by1;
  if (key === st.key) return st.list;   // mêmes blocs visibles → rien à refaire
  const urbanSet = L.urbanSet, roadSet = L.roadSet;
  const riverCells = (L.river && L.river.present && L.river.cells) || null;
  const banks = (L.river && L.river.banks) || null;
  const has = (s, gx, gy) => !!s && s.has(gx + ',' + gy);
  const buildFoot = isoBuildFootSet(L);
  // Herbe sauvage = ni sol urbain, ni route (les routes de campagne restent nues),
  // ni eau, ni berge (roseaux/quais y vivent déjà), ni emprise de bâtiment, ni
  // PARVIS de merveille (les emprises actives sont déjà urbaines ; celle d'un
  // APERÇU __showWonder ne l'est pas — sans ce garde, des arbres poussaient dessus).
  const wg = WONDER_GROUND.on ? wonderGroundSet(L) : null;
  const isWild = (gx, gy) =>
    !has(urbanSet, gx, gy) && !has(roadSet, gx, gy)
    && !has(riverCells, gx, gy) && !has(banks, gx, gy)
    && !buildFoot.has(gx + ',' + gy) && !has(wg, gx, gy);
  // Aération de lisière : une cellule au contact du bâti reçoit moins d'arbres →
  // clairière douce au bord de la ville (au lieu d'un mur d'arbres), comme le legacy.
  const nearCity = (gx, gy) =>
    has(urbanSet, gx - 1, gy) || has(urbanSet, gx + 1, gy) || has(urbanSet, gx, gy - 1) || has(urbanSet, gx, gy + 1)
    || has(roadSet, gx - 1, gy) || has(roadSet, gx + 1, gy) || has(roadSet, gx, gy - 1) || has(roadSet, gx, gy + 1);
  // Bruit basse fréquence → agglutine les arbres en fourrés et ménage des trouées
  // (repris de cityMapDrawTrees : mêmes fréquences /5 et /11).
  // S5 : la définition a migré dans layout.js (`cmCellNoise`) pour que les arbres de
  // VILLE s'en servent aussi — ils étaient tirés au hash par cellule, donc en
  // confettis, alors que la forêt lisait déjà en fourrés grâce à ce même bruit.
  // Une seule définition, un seul grain ; la copie locale a été retirée.
  const cellNoise = cmCellNoise;
  const ctx = { isWild, nearCity, cellNoise };
  // Liste RÉUTILISÉE (vidée, jamais réallouée) : elle ne se reconstruit qu'au
  // changement d'ensemble de blocs, et seuls les blocs neufs sont dispersés.
  const list = st.list;
  list.length = 0;
  for (let by = by0; by <= by1; by += 1) {
    for (let bx = bx0; bx <= bx1; bx += 1) {
      const bk = bx + ',' + by;
      let arr = st.blocks.get(bk);
      if (!arr) { arr = isoWildForestBlock(L, bx, by, ctx); st.blocks.set(bk, arr); }
      for (let i = 0; i < arr.length; i += 1) list.push(arr[i]);
    }
  }
  st.key = key;
  return list;
}
