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

// LES MAISONS TOURNÉES VERS LEUR RUE : pour une variante, le dessin vu de chaque côté
// de rue autre que le sud (le sprite d'origine). E = « -fr » (façade à droite),
// N/W = « -bl »/« -br » (le dos). Absent = la variante garde son sprite.
export const ORIENT = {
  // Bourg : la maison artisane du jeu EST la vue sud-ouest d'un objet PixelLab à 8 vues
  // (« crafthouse v4 natif 64 ») — ses autres vues, à la même taille, sont gratuites.
  2: {
    crafthouse: { E: "crafthouse-fr", N: "crafthouse-bl", W: "crafthouse-br" },
  },
  3: {
    crafthouse: { E: "crafthouse-fr", N: "crafthouse-bl", W: "crafthouse-br" },
  },
  4: {
    domus: { E: "domus-fr", N: "domus-bl", W: "domus-br" },
    taberna: { E: "domus-fr", N: "taberna-bl", W: "taberna-br" },
    insula2: { E: "insula2-fr", N: "insula2-bl", W: "insula2-br" },
    courtyard: { E: "domus-fr", N: "domus-bl", W: "domus-br" },
    insula: { E: "insula2-fr", N: "insula2-bl", W: "insula2-br" },
  },
  // Fonte : l'immeuble haussmannien (objet PixelLab à 8 vues, house-haussmann-b5),
  // tourné à l'est seulement — ses dos sont des murs mitoyens presque aveugles, de grands
  // pans beiges à l'écran (vu en jeu) : au nord et à l'ouest il garde son dessin. La
  // brique (block, tenement) a des fenêtres sur ses deux faces : elle n'a pas de dos.
  5: {
    haussmann: { E: "haussmann-fr" },
  },
  // Néon : la boutique néon (objet neuf), tournée à l'est ; ses dos sont aveugles.
  6: {
    neonshop: { E: "neonshop-fr" },
  },
};

// LES RANGÉES MITOYENNES : `of` = modèle de rangée de chaque variante, `end` = le
// modèle des BOUTS de rangée et des DOS (mur latéral à découvert : il lui faut des
// fenêtres sur quatre faces), `selfEnd` = modèles dont le pignon a déjà ses fenêtres
// (ils font leur propre bout), `models` = vues disponibles de chaque modèle, `sides` = les
// modèles qu'un CÔTÉ d'îlot peut prendre (un seul par côté, tiré par côté). Fichiers
// `houses/row-<modèle>-<vue>.png` ; vues fl/fr = façade à gauche/droite, bl/br = dos.
export const ROWS = {
  // Village : la même rangée à colombages (la maison de ville et l'atelier s'y alignent).
  2: {
    sides: ["colombage"],
    of: { crafthouse: "colombage", townhouse: "colombage" },
    end: "colombage",
    selfEnd: ["colombage"],
    models: { colombage: ["fl", "fr", "bl", "br"] },
  },
  // Bourg : la rangée À COLOMBAGES (objet neuf house-colombage-rangee-b23, palette de la
  // maison artisane) : deux maisons sous un toit de tuiles, rez de pierre et volets
  // d'échoppe, pignons percés.
  3: {
    sides: ["colombage"],
    of: { crafthouse: "colombage", townhouse: "colombage", stonehouse: "colombage" },
    end: "colombage",
    selfEnd: ["colombage"],
    models: { colombage: ["fl", "fr", "bl", "br"] },
  },
  4: {
    sides: ["taberna", "domus", "popina", "insula"],
    of: { taberna: "taberna", domus: "domus", courtyard: "popina", insula: "insula", insula2: "insula" },
    end: "insula",
    models: { taberna: ["fl", "fr"], domus: ["fl", "fr"], popina: ["fl", "fr"], insula: ["fl", "fr", "bl", "br"] },
  },
  // Fonte : la rue haussmannienne (le même objet, converti à la taille d'une unité qui
  // remplit son lot ; ses flancs ont leurs fenêtres : il fait son propre bout).
  // Et la rangée de BRIQUE (objet neuf house-terrace-b5-rangee, palette de la rangée
  // ouvrière du jeu) : deux maisons sous un toit d'ardoise, pignons percés.
  5: {
    sides: ["haussmann", "terrace"],
    of: { haussmann: "haussmann", block: "terrace", terrace: "terrace" },
    // Les dos de la rangée haussmannienne (murs aveugles) cèdent la place à ceux de brique.
    end: "terrace",
    selfEnd: ["haussmann", "terrace"],
    models: { haussmann: ["fl", "fr"], terrace: ["fl", "fr", "bl", "br"] },
  },
  6: {
    // Néon : la rue commerçante — boutiques néon en façade, dos et bouts en brique (la
    // rangée de la Fonte, que la bande 6 tire encore ; les dos néon sont des murs aveugles).
    sides: ["neonshop", "terrace"],
    of: { neonshop: "neonshop", block: "neonshop", terrace: "terrace" },
    end: "terrace",
    selfEnd: ["neonshop", "terrace"],
    models: { neonshop: ["fl", "fr"], terrace: ["fl", "fr", "bl", "br"] },
  },
};
export const ROW_VIEW = { S: "fl", E: "fr", N: "bl", W: "br" };

// Toutes les clés de sprite d'une bande (préchargement).
export function ilotArtKeys(band) {
  const out = new Set();
  const o = ORIENT[band];
  if (o) for (const v of Object.values(o)) for (const k of Object.values(v)) out.add(k);
  const r = ROWS[band];
  if (r) for (const [m, views] of Object.entries(r.models)) for (const v of views) out.add("row-" + m + "-" + v);
  return [...out];
}
