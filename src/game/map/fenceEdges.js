/* ---------------------------------------------------------------------------
 * CLÔTURES : quelles ARÊTES de cellule en portent une (lot L9).
 * docs/PLAN-TISSU-URBAIN.md.
 *
 * La règle, arrêtée avec Raph et suffisante à elle seule :
 *
 *   > Une clôture ne se pose que sur un bord qui SÉPARE DEUX MATIÈRES
 *   > DIFFÉRENTES. Jamais entre deux cellules de même matière.
 *
 * Ce n'est pas une précaution parmi d'autres, c'est ce qui écarte le seul vrai
 * risque du lot. À l'intérieur d'un quartier homogène, aucune arête ne qualifie,
 * donc rien n'apparaît : on ne peut pas fabriquer par accident le treillis qu'on
 * vient de passer une séance à retirer. Un plafond serait un pansement ; la règle,
 * elle, rend le débordement structurellement impossible.
 *
 * Deuxième garde-fou, celui-là contre l'accident inverse : une clôture ne part
 * que d'une SOURCE explicitement autorisée (le parvis d'une merveille, la berge
 * bâtie). Sans liste blanche, « deux matières différentes » désignerait aussi
 * chaque couture cour/pavé de la ville — des milliers d'arêtes.
 *
 * Module PUR : il ne connaît ni Canvas, ni CM, ni le renderer. Il reçoit des
 * ensembles et une fonction de matière, il rend une liste d'arêtes. C'est ce qui
 * le rend testable sans monter une carte.
 * ------------------------------------------------------------------------- */

// Voisin par côté. Le nom du côté est celui du MONDE, comme les sprites
// (fence-n/s/e/w-<ère>.png) et comme les allées de seuil.
const SIDES = [['n', 0, -1], ['s', 0, 1], ['e', 1, 0], ['w', -1, 0]];

// ⚠ `wonders` À FAUX depuis le 2026-08-06, sur capture. Le parvis d'une merveille est
// entouré de pavé ouvert : ses arêtes qualifient (deux matières) mais le résultat se
// lit comme des blocs de pierre abandonnés en plein sol, sans rien à border. Le quai
// et la berge bâtie, eux, longent l'eau — la clôture y est une LIGNE qui ferme quelque
// chose, et c'est exactement l'étape 2 de l'ordre de pose du plan. Rallumer les parvis
// demande d'abord un art de bornage (des bornes aux angles, pas un grillage), cf. la
// note « 🚫 Écarté » du lot L9.
export const FENCE = {
  on: true,
  wonders: false,    // parvis des merveilles — ÉCARTÉ sur capture, cf. la note ci-dessus
  quays: true,       // berge bâtie — une LIGNE le long de l'eau, aucun bruit de grille
  cap: 4000,         // garde-fou de dernier recours, cf. plus bas
};

/**
 * Arêtes à clôturer.
 *
 * @param {object} o
 * @param {Set<string>}  o.urbanSet   sol de ville ("gx,gy")
 * @param {(k:string)=>string} o.matOf matière d'une cellule (urban/dirt/grass…)
 * @param {Set<string>}  [o.wonderSet] emprise des parvis de merveille
 * @param {Set<string>}  [o.waterSet]  cellules d'eau
 * @param {object}       [cfg]        FENCE par défaut
 * @returns {Array<{gx:number,gy:number,side:string}>} arêtes, ordre déterministe
 */
export function fenceEdges(o, cfg = FENCE) {
  const out = [];
  if (!cfg.on) return out;
  const urbanSet = o.urbanSet || new Set();
  const wonderSet = o.wonderSet || new Set();
  const waterSet = o.waterSet || new Set();
  const matOf = o.matOf || (() => 'urban');

  // SOURCES : les seules cellules qui ont le droit de porter une clôture.
  // Triées, pour que deux calculs du même layout rendent la même liste — un
  // décor qui se réordonne d'un recompute à l'autre scintille au tri peintre.
  // ⚠ LE CÔTÉ COMPTE, PAS SEULEMENT LA CELLULE. Première version : un `Set` de
  // cellules, et ensuite TOUTES les arêtes qui séparaient deux matières recevaient un
  // panneau. Une cellule de berge qui touche l'eau au sud posait donc aussi une
  // clôture au NORD, côté ville — d'où des garde-corps en pleine herbe, loin de toute
  // eau (Raph sur capture, 2026-08-06 : « il faut que ça longe le quai s'il y en a
  // là »). On mémorise donc POURQUOI une cellule est source.
  //
  // `null` = tous les côtés (un parvis se ceint sur tout son pourtour).
  // Un `Set` de côtés = seulement ceux-là (un quai ne se borde que face à l'eau).
  const sources = new Map();
  if (cfg.wonders) for (const k of wonderSet) if (urbanSet.has(k)) sources.set(k, null);
  if (cfg.quays) {
    // Berge BÂTIE seulement : une cellule de sol de ville qui touche l'eau. La
    // rive sauvage n'a pas de garde-corps, elle a de l'herbe.
    for (const k of urbanSet) {
      const c = k.indexOf(',');
      const gx = +k.slice(0, c), gy = +k.slice(c + 1);
      let cotes = null;
      for (const [side, dx, dy] of SIDES) {
        if (!waterSet.has((gx + dx) + ',' + (gy + dy))) continue;
        (cotes || (cotes = new Set())).add(side);
      }
      // Déjà source par le parvis : elle garde son pourtour complet.
      if (cotes && !sources.has(k)) sources.set(k, cotes);
    }
  }

  for (const k of [...sources.keys()].sort()) {
    const c = k.indexOf(',');
    const gx = +k.slice(0, c), gy = +k.slice(c + 1);
    const mine = waterSet.has(k) ? 'water' : matOf(k);
    const permis = sources.get(k);
    for (const [side, dx, dy] of SIDES) {
      // Quai : seulement le côté qui donne sur l'eau. Sans ce filtre la cellule
      // clôturait aussi sa face ville, à l'opposé du fleuve.
      if (permis && !permis.has(side)) continue;
      const nk = (gx + dx) + ',' + (gy + dy);
      // Hors sol de ville et hors eau : c'est la campagne, pas une couture à
      // souligner — la lisière a déjà sa frange d'herbe.
      const isWater = waterSet.has(nk);
      if (!isWater && !urbanSet.has(nk)) continue;
      const theirs = isWater ? 'water' : matOf(nk);
      if (theirs === mine) continue;               // LA règle
      // Une arête est partagée : sans ce départage, le parvis et la rue d'en
      // face poseraient chacun leur panneau au même endroit, en double.
      // On la donne à la cellule SOURCE ; si les deux sont sources, à la
      // première dans l'ordre de tri, qui est stable.
      if (sources.has(nk) && nk < k) continue;
      out.push({ gx, gy, side });
      if (out.length >= cfg.cap) return out;       // plafond : voir ci-dessous
    }
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * LES ENTRÉES, DÉRIVÉES D'UN LAYOUT — une seule définition pour deux appelants.
 *
 * Le compteur (`tissuMetrics`) et la pose (`isoRenderer`) doivent voir EXACTEMENT
 * la même carte de matières, sinon le nombre annoncé par `__tissu()` ne serait pas
 * celui des panneaux dessinés. La règle maison vaut ici comme ailleurs : une
 * deuxième copie dérive en silence.
 *
 * La matière vient du CHAMP DE L2 (`L._courField` : urban / dirt / grass), que le
 * plan désigne comme l'arbitre (« le champ de matières de L2 sait déjà trancher »).
 * Par-dessus se superposent les matières que ce champ ne connaît pas — eau, parvis
 * de merveille, place, chaussée, bâti — sans quoi une arête quai↔eau ne se verrait
 * pas. L'ordre du test EST la priorité.
 *
 * Reste PUR : ne lit qu'un layout, ne connaît ni Canvas ni CM.
 * ──────────────────────────────────────────────────────────────────────────── */
export function fenceInputs(L) {
  const urbanSet = (L && L.urbanSet) || new Set();
  const roadSet = (L && L.roadSet) || new Set();
  const roadMap = (L && L.roadMap) || new Map();
  const waterSet = new Set((L && L.river && L.river.cells) || []);
  const wonderSet = (L && L.wonderGround) || new Set();
  const cour = (L && L._courField) || new Map();
  // Empreintes bâties : même formule que le sol de ville et le trim (spanX × spanY,
  // `size` pour les moteurs carrés qui ne portent pas spanX).
  const builtSet = new Set();
  for (const t of (L && L.tiles) || []) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) {
      for (let ay = 0; ay < sy; ay += 1) builtSet.add((t.gx + ax) + ',' + (t.gy + ay));
    }
  }
  const matOf = (a, b) => {
    const k = b === undefined ? a : a + ',' + b;
    if (waterSet.has(k)) return 'water';
    if (wonderSet.has(k)) return 'wonder';
    if (roadSet.has(k)) {
      const c = roadMap.get(k);
      return ((c && c.rank) === 'plaza') ? 'plaza' : 'road';
    }
    if (builtSet.has(k)) return 'built';
    return cour.get(k) || (urbanSet.has(k) ? 'urban' : 'grass');
  };
  return { urbanSet, wonderSet, waterSet, matOf };
}

/* Le PLAFOND n'est pas un réglage de dosage, c'est un fusible. La règle des deux
 * matières borne déjà le résultat au périmètre des sources ; si ce nombre
 * explose un jour, c'est qu'une source a été ouverte trop large ou qu'une ère
 * nouvelle a changé la donne — et on veut que ça s'arrête net et se voie dans le
 * compteur, plutôt que de découvrir dix mille panneaux à la capture. */
