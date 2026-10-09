// ── LA VILLE PAR ÎLOTS : CE QUE CHAQUE ÂGE DESSINE (docs/PLAN-ILOTS.md) ─────────
// Le placement par îlots est le même à tous les âges (layout.js, ilotLayout.js) ;
// ce qui change d'un âge à l'autre, c'est l'ART qui le remplit. Tables pures, lues
// par layout.js (corps des boutiques, rangées) et par pixelHouses.js (vues tournées,
// unités de rangée). Un âge absent d'une table retombe sur les maisons d'origine :
// sprite de la variante, poussé vers la rue — jamais de trou.

// Bandes où la ville se bâtit par îlots. Le campement et le hameau (0, 1) gardent
// leur placement, validé par Raph : la ville s'y réorganise une fois en îlots à
// l'entrée du village (bande 2), puis grandit d'îlot en îlot jusqu'à la fin.
export const ILOT_BANDS = [2, 3, 4, 5, 6, 7, 8, 9];

// LES BOUTIQUES DE LA RUE (Raph 2026-10-04 : « avoir plein de fois le même bâtiment
// qui a l'air d'un grand bâtiment rend mal ») : une annexe de bâtiment-moteur prend
// un corps de maison de son âge, tiré dans cette liste (variantes d'une case).
export const ANNEX_BODIES = {
  // Village : l'atelier à colombages, la maison de ville, la petite maison à cour.
  2: ["crafthouse", "crafthouse", "townhouse", "courtyard"],
  // Bourg : l'atelier à colombages (maison artisane), la maison de pierre, la maison de ville.
  3: ["crafthouse", "crafthouse", "stonehouse", "townhouse"],
  4: ["taberna", "taberna", "domus", "courtyard"],
  // Fonte (XIXe) : l'immeuble haussmannien a sa boutique au rez ; la brique ouvrière.
  5: ["haussmann", "haussmann", "block", "terrace"],
  // Néon : la boutique moderne (béton, verre, enseigne), l'immeuble.
  6: ["neonshop", "neonshop", "block"],
  // Âges cosmiques : les petites maisons à skin d'âge (dôme, capsules, tour-jardin) —
  // le gratte-ciel d'une case reste au cœur, il ne fait pas une boutique.
  7: ["domehome", "podstack", "gardentower", "domehome"],
  8: ["domehome", "podstack", "gardentower", "domehome"],
  9: ["domehome", "podstack", "gardentower", "domehome"],
};
// Gardent leur dessin propre : les points d'eau (fontaines, puits) à tous les âges,
// les ateliers des guildes là où ils ont été dessinés pour être semés.
export function annexOwnArt(id, band) {
  return id === "aqueducts" || (id === "guilds" && band === 4);
}

// LES MAISONS TOURNÉES VERS LEUR RUE (reprise des sprites, 2026-10-09) : chaque clé de
// sprite listée ici a ses quatre vues, une par côté de rue. Le nom de vue de Codex est la
// direction où regarde l'ENTRÉE (art/batiments/regles.json, « rotationPhysique ») :
//   S (rue au sud, +gy)  = la clé nue, vue sud-ouest (façade à gauche)
//   E (rue à l'est, +gx) = « -fr », vue sud-est (façade à droite)
//   N (rue au nord)      = « -bl », vue nord-est (le dos tourné vers le spectateur)
//   W (rue à l'ouest)    = « -br », vue nord-ouest
// Les grandes maisons (manoir, villa 2×2 ; immeuble, tour 1×2) tournent aussi, sur leur
// empreinte d'origine. Absente = la clé garde son sprite unique (les gratte-ciel astraux
// skytower-cosmic-7/8, que Codex n'a pas finis). Les dos haussmannien et néon, aveugles
// dans les vues PixelLab d'avant, ont maintenant leurs fenêtres. Les unités de rangée
// haussmanniennes et néon, presque frontales chez Codex, sont redressées en iso 2:1 à
// l'installation (outil hors git : art/batiments/propositions/essai-claude/outils/).
export const ORIENTED = new Set([
  "tent", "hut", "longhouse", "courtyard", "townhouse", "stonehouse", "manor", "block",
  "tenement", "tower", "tower-cosmic-7", "tower-cosmic-8", "tower-cosmic-9",
  "megablock", "megablock-cosmic-7", "megablock-cosmic-8", "megablock-cosmic-9",
  "arcologyhome", "arcologyhome-cosmic-7", "arcologyhome-cosmic-8", "arcologyhome-cosmic-9",
  "crafthouse", "towerhouse", "insula", "terrace", "domus", "taberna", "villa", "insula2",
  "haussmann", "gardentower", "gardentower-cosmic-7", "gardentower-cosmic-8", "gardentower-cosmic-9",
  "domehome", "domehome-cosmic-7", "domehome-cosmic-8", "domehome-cosmic-9",
  "podstack", "podstack-cosmic-7", "podstack-cosmic-8", "podstack-cosmic-9",
  "skytower-cosmic-9", "skytower2-cosmic-7", "skytower2-cosmic-8", "skytower2-cosmic-9",
  "neonshop",
]);
export const ORIENT_SUFFIX = { E: "-fr", N: "-bl", W: "-br" };

// LES RANGÉES MITOYENNES : `of` = modèle de rangée de chaque variante, `end` = le
// modèle des BOUTS de rangée et des DOS (mur latéral à découvert : il lui faut des
// fenêtres sur quatre faces), `selfEnd` = modèles dont le pignon a déjà ses fenêtres
// (ils font leur propre bout), `models` = vues disponibles de chaque modèle, `sides` = les
// modèles qu'un CÔTÉ d'îlot peut prendre (un seul par côté, tiré par côté). Fichiers
// `houses/row-<modèle>-<vue>.png` ; vues fl/fr = façade à gauche/droite, bl/br = dos.
// Toutes les rangées ont leurs quatre vues depuis la reprise des sprites (2026-10-09).
const V4 = ["fl", "fr", "bl", "br"];
export const ROWS = {
  // Village : la même rangée à colombages (la maison de ville et l'atelier s'y alignent).
  2: {
    sides: ["colombage"],
    of: { crafthouse: "colombage", townhouse: "colombage" },
    end: "colombage",
    selfEnd: ["colombage"],
    models: { colombage: V4 },
  },
  // Bourg : la rangée À COLOMBAGES (objet neuf house-colombage-rangee-b23, palette de la
  // maison artisane) : deux maisons sous un toit de tuiles, rez de pierre et volets
  // d'échoppe, pignons percés.
  3: {
    sides: ["colombage"],
    of: { crafthouse: "colombage", townhouse: "colombage", stonehouse: "colombage" },
    end: "colombage",
    selfEnd: ["colombage"],
    models: { colombage: V4 },
  },
  4: {
    sides: ["taberna", "domus", "popina", "insula"],
    of: { taberna: "taberna", domus: "domus", courtyard: "popina", insula: "insula", insula2: "insula" },
    end: "insula",
    models: { taberna: V4, domus: V4, popina: V4, insula: V4 },
  },
  // Fonte : la rue haussmannienne (le même objet, converti à la taille d'une unité qui
  // remplit son lot ; ses flancs ont leurs fenêtres : il fait son propre bout).
  // Et la rangée de BRIQUE (objet neuf house-terrace-b5-rangee, palette de la rangée
  // ouvrière du jeu) : deux maisons sous un toit d'ardoise, pignons percés.
  5: {
    sides: ["haussmann", "terrace"],
    of: { haussmann: "haussmann", block: "terrace", terrace: "terrace" },
    end: "terrace",
    selfEnd: ["haussmann", "terrace"],
    models: { haussmann: V4, terrace: V4 },
  },
  6: {
    // Néon : la rue commerçante — boutiques néon en façade, bouts en brique (la rangée de
    // la Fonte, que la bande 6 tire encore).
    sides: ["neonshop", "terrace"],
    of: { neonshop: "neonshop", block: "neonshop", terrace: "terrace" },
    end: "terrace",
    selfEnd: ["neonshop", "terrace"],
    models: { neonshop: V4, terrace: V4 },
  },
};
export const ROW_VIEW = { S: "fl", E: "fr", N: "bl", W: "br" };

// Les clés des rangées d'une bande (préchargement) ; les vues tournées des maisons se
// préchargent avec leur clé (pixelHouses.preloadHouseSprites).
export function ilotArtKeys(band) {
  const out = new Set();
  const r = ROWS[band];
  if (r) for (const [m, views] of Object.entries(r.models)) for (const v of views) out.add("row-" + m + "-" + v);
  return [...out];
}
