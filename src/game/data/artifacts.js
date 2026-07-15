"use strict";

// L'ARBRE D'ARTEFACTS du Temple (Phase 4) — DEUX LIGNÉES en ÉCHELLE : on achète
// les rangs dans l'ordre (le rang N exige le rang N-1 acquis). Tout reste
// DÉCOUPLÉ (aucun lien à la Rupture — arbitrage Raph). Chaque lignée enchaîne :
// un booster existant → des refontes de RISQUE (profils, pas des sticks de stats)
// → son AUTOMATISATION en capstone. La Bénédiction reste HORS lignées (consommable).
//
// kinds :
//   'level'      — booster à niveaux (state.diceLevel / state.wingLevel), coût géométrique
//   'artifact'   — refonte booléenne (state.templeArtifacts[id]), coût fixe
//   'automation' — capstone : débloque templeAuto[game] (moteur Phase 3)

import {
  DICE_BOOST_MAX_LEVEL, WING_MAX_LEVEL,
  DICE_COST_BASE, DICE_COST_GROWTH, WING_COST_BASE, WING_COST_GROWTH,
  ARTIFACT_IVOIRE_COST, ARTIFACT_NOYE_COST, ARTIFACT_PLUMES_COST, ARTIFACT_SOLAIRES_COST,
  AUTO_OSSELETS_UNLOCK_COST, AUTO_ICARUS_UNLOCK_COST,
  NOYE_POT_MULT, ICARUS_CAP_SOLAR
} from '../core/balance.js';

export const ARTIFACT_LINEAGES = [
  {
    id: "osselets",
    icon: "🎲",
    label: { fr: "Osselets", en: "Knucklebones" },
    subtitle: { fr: "la chance des dés · Ère II", en: "the luck of the dice · Era II" },
    nodes: [
      {
        id: "dice", kind: "level", levelField: "diceLevel", maxLevel: DICE_BOOST_MAX_LEVEL, costBase: DICE_COST_BASE, costGrowth: DICE_COST_GROWTH,
        label: { fr: "Dés pipés", en: "Loaded dice" },
        desc: { fr: "Chaque niveau relève tes chances aux osselets.", en: "Each level raises your knucklebones odds." }
      },
      {
        id: "ivoire", kind: "artifact", cost: ARTIFACT_IVOIRE_COST,
        label: { fr: "Dé d'ivoire", en: "Ivory die" },
        desc: { fr: "Coupe la queue du Chien (moitié moins de catastrophes) et plus de Coups de Vénus — à taux de victoire ÉGAL. Un profil plus sage.", en: "Halves the Dog tail (fewer catastrophes) and more Venus throws — at EQUAL win rate. A calmer profile." }
      },
      {
        id: "noye", kind: "artifact", cost: ARTIFACT_NOYE_COST,
        label: { fr: "Osselet du noyé", en: "Drowned bone" },
        desc: { fr: `Tes revers nourrissent ×${NOYE_POT_MULT} la cagnotte d'Icare — le plancher nourrit le plafond.`, en: `Your setbacks feed the Icarus pot ×${NOYE_POT_MULT} — the floor feeds the ceiling.` }
      },
      {
        id: "autoOsselets", kind: "automation", game: "osselets", cost: AUTO_OSSELETS_UNLOCK_COST,
        label: { fr: "Osselets sacrés", en: "Sacred knucklebones" },
        desc: { fr: "Débloque l'auto-lancé : le temple joue les osselets tout seul, à tes cadrans.", en: "Unlocks auto-cast: the temple plays the knucklebones on its own, at your dials." }
      }
    ]
  },
  {
    id: "icarus",
    icon: "🪽",
    label: { fr: "Icare", en: "Icarus" },
    subtitle: { fr: "le vol · Ère III", en: "the flight · Era III" },
    nodes: [
      {
        id: "wing", kind: "level", levelField: "wingLevel", maxLevel: WING_MAX_LEVEL, costBase: WING_COST_BASE, costGrowth: WING_COST_GROWTH,
        label: { fr: "Ailes cirées", en: "Waxed wings" },
        desc: { fr: "Chaque niveau abaisse l'edge du Vol d'Icare (meilleures odds).", en: "Each level lowers the Flight of Icarus edge (better odds)." }
      },
      {
        id: "plumes", kind: "artifact", cost: ARTIFACT_PLUMES_COST,
        label: { fr: "Plumes de secours", en: "Rescue feathers" },
        desc: { fr: "Un filet : chaque crash te rend une part de la mise en Faveur — les gros revers piquent moins.", en: "A safety net: every crash refunds part of the stake in Favor — big losses sting less." }
      },
      {
        id: "solaires", kind: "artifact", cost: ARTIFACT_SOLAIRES_COST,
        label: { fr: "Ailes solaires", en: "Solar wings" },
        desc: { fr: `Plafond du multiplicateur relevé ×100 → ×${ICARUS_CAP_SOLAR} : les très gros coups deviennent atteignables.`, en: `Multiplier cap raised ×100 → ×${ICARUS_CAP_SOLAR}: the biggest wins become reachable.` }
      },
      {
        id: "autoIcare", kind: "automation", game: "icarus", cost: AUTO_ICARUS_UNLOCK_COST,
        label: { fr: "Ailes d'aigle", en: "Eagle wings" },
        desc: { fr: "Débloque l'autopush : le temple fait voler Icare tout seul, au multiplicateur cible que tu fixes.", en: "Unlocks autopush: the temple flies Icarus on its own, at the target multiplier you set." }
      }
    ]
  }
];

// Index id → node (avec sa lignée). Utilisé par le dispatcher d'achat.
export const ARTIFACT_NODES = {};
for (const lin of ARTIFACT_LINEAGES) {
  for (const n of lin.nodes) ARTIFACT_NODES[n.id] = { ...n, lineage: lin.id };
}
