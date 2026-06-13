/* ============================================================================
 * waterModel.js — Relation spatiale unique à l'eau (rivière + berges).
 *
 *   Source de vérité du vocabulaire « sur l'eau / hors de l'eau ». Au lieu de
 *   semer des `riverSet.has("gx,gy")` / `bankSet.has(...)` dans la pose, le
 *   rendu et les agents, tout le monde consulte les MÊMES prédicats ici. Le
 *   format de clé entière "gx,gy" (cf. le piège « Math.floor obligatoire » de
 *   layout.js) n'est défini qu'une fois.
 *
 *   Vocabulaire (du plus humide au plus sec) :
 *     - WATER : la cellule EST le cours d'eau            (ponts, pontons, coques)
 *     - BANK  : la berge immédiate                       (quais, moulins, ports)
 *     - NEAR  : sol sec proche de la rive                (bâtiments « de rivière »)
 *     - DRY   : tout le reste                            (défaut)
 *
 *   L'objet renvoyé est un SUR-ENSEMBLE du contrat `river` historique
 *   ({ present, samples, cells, banks, bridge }) : aucun consommateur existant
 *   ne casse, les prédicats viennent en plus.
 *
 *   Lookups Set entiers : sûr à appeler en fonction chaude. Dans une boucle qui
 *   tient déjà la clé "gx,gy", préférer interroger les Set directement plutôt
 *   que de reconcaténer la clé via ces prédicats.
 * ============================================================================ */

export const WATER = "water";
export const BANK  = "bank";
export const NEAR  = "near";
export const DRY   = "dry";

const EMPTY = new Set();

export function createWaterModel({
  cells, banks, near, samples, bridge, riverYAt, present = true
} = {}) {
  const cellSet = cells || EMPTY;
  const bankSet = banks || EMPTY;
  const nearSet = near  || EMPTY;
  const key = (gx, gy) => gx + "," + gy;

  const isWater = (gx, gy) => cellSet.has(key(gx, gy));
  const isBank  = (gx, gy) => bankSet.has(key(gx, gy));
  const isNear  = (gx, gy) => nearSet.has(key(gx, gy));
  const isDry   = (gx, gy) => {
    const k = key(gx, gy);
    return !cellSet.has(k) && !bankSet.has(k);
  };

  // Relation d'une cellule (la plus humide qui s'applique).
  const relationAt = (gx, gy) => {
    const k = key(gx, gy);
    if (cellSet.has(k)) return WATER;
    if (bankSet.has(k)) return BANK;
    if (nearSet.has(k)) return NEAR;
    return DRY;
  };

  // Relation dominante d'une emprise sizeX×sizeY : la cellule la plus humide
  // l'emporte (une emprise qui touche l'eau « est sur l'eau »). Utile pour
  // valider « tout le bâtiment sur l'eau » ou « rien sur la berge ».
  const footprintRelation = (gx, gy, sizeX, sizeY = sizeX) => {
    let rel = DRY, sawNear = false;
    for (let ax = 0; ax < sizeX; ax += 1) {
      for (let ay = 0; ay < sizeY; ay += 1) {
        const k = key(gx + ax, gy + ay);
        if (cellSet.has(k)) return WATER;
        if (bankSet.has(k)) rel = BANK;
        else if (nearSet.has(k)) sawNear = true;
      }
    }
    if (rel === BANK) return BANK;
    return sawNear ? NEAR : DRY;
  };

  return {
    // Contrat historique (conservé tel quel) :
    present,
    samples: samples || [],
    cells: cellSet,
    banks: bankSet,
    bridge: bridge || null,
    // Ajouts :
    near: nearSet,
    riverYAt: riverYAt || (() => -999),
    key,
    isWater, isBank, isNear, isDry,
    relationAt, footprintRelation
  };
}
