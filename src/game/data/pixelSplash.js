"use strict";
// Splash-arts des cartes d'achat (fond en filigrane discret derrière le texte).
// Pipeline : scène pleine générée via l'API Pixflux (no_background:false) PUIS
// correction couleur anti-sépia (rééquilibrage des blancs) → colorimétrie naturelle.
// Le splash ÉVOLUE par époque (calqué sur plazaEraForBand / les places) : une image
// par bâtiment × 5 époques. Fichiers : /pixelart/splash/<buildingId>-<epoch>.png
//   epochs : antique · classique · industrielle · moderne · futuriste

import { eraBandOf } from "./eraThemes.js";

const EPOCH_ORDER = ["antique", "classique", "industrielle", "moderne", "futuriste"];

// Bande d'ère (0-9) → époque d'art. Même découpe que plazaProps.plazaEraForBand :
// 0-3 antique · 4 classique · 5 industrielle · 6 moderne · 7-9 futuriste.
export function splashEpochForEra(eraIndex) {
  const b = eraBandOf(eraIndex);
  if (b <= 3) return "antique";
  if (b === 4) return "classique";
  if (b === 5) return "industrielle";
  if (b === 6) return "moderne";
  return "futuriste";
}

// Manifeste des splashs RÉELLEMENT présents ("<id>-<epoch>") : on n'affiche QUE
// ceux-là (zéro requête 404). À étendre au fil des générations.
// Bâtiments dont les 5 époques sont générées + installées dans /pixelart/splash/.
// Étendre cette liste au fil des lots ; le Set des clés en dérive.
const DONE_BUILDINGS = [
  "foragers",
  // Moteurs
  "granaries_city", "caravans", "markets", "guilds", "irrigated_fields",
  // Savoir
  "scribes", "storytellers", "schools", "academies", "observatories",
  "libraries", "ancestral_cult", "universities", "printing_houses", "think_tanks",
  // Infrastructure
  "aqueducts", "roads", "watch", "bureaucracy", "sewers", "courthouses",
  "public_works", "ministries", "archive_grids", "ruin_architects",
];
const AVAILABLE = new Set(
  DONE_BUILDINGS.flatMap((b) => EPOCH_ORDER.map((e) => `${b}-${e}`))
);

// URL du splash pour ce bâtiment à cette ère, avec REPLI : on prend l'époque
// disponible la plus proche ≤ cible (sinon la plus proche au-dessus). Ainsi les
// bâtiments/époques pas encore générés retombent gracieusement sur ce qui existe.
// null si aucun splash pour ce bâtiment.
export function splashSrcFor(buildingId, eraIndex) {
  if (!buildingId) return null;
  const target = splashEpochForEra(eraIndex | 0);
  const idx = EPOCH_ORDER.indexOf(target);
  for (let i = idx; i >= 0; i--) {
    const key = `${buildingId}-${EPOCH_ORDER[i]}`;
    if (AVAILABLE.has(key)) return `/pixelart/splash/${key}.png`;
  }
  for (let i = idx + 1; i < EPOCH_ORDER.length; i++) {
    const key = `${buildingId}-${EPOCH_ORDER[i]}`;
    if (AVAILABLE.has(key)) return `/pixelart/splash/${key}.png`;
  }
  return null;
}
