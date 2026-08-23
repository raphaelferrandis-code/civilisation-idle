// LA VOIRIE — la GÉOMÉTRIE et la MATIÈRE de la rue, sans une ligne de dessin.
//
// Extraite d'isoRenderer.js le 2026-08-23 (Q10). Les tons de chaussée par ère, la
// hiérarchie des largeurs (sentier → avenue), les tuiles de route, le réglage fin du
// ruban (épaulement, gorge, ourlet), le VOILE DE LECTURE de l'ère, et la géométrie
// du trottoir. Que des valeurs et deux fonctions pures.
//
// ⚠ ELLE ÉTAIT ÉPARPILLÉE EN QUATRE ENDROITS du fichier, à mille lignes d'écart :
// les tons près de la palette, les largeurs avant le bake, les tuiles et le voile
// au milieu de la passe route, le trottoir encore plus loin. Rien ne les tenait
// ensemble sauf le sujet — c'est la mesure de couture qui les a réunies, pas les
// bandeaux.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, ZÉRO import, dix sortantes. Une feuille du graphe.
// Vérifiée ligne à ligne contre la version commitée.
//
// ⚠ ELLE DÉBLOQUE L'ÉCLAIRAGE ET LE PONT — ~770 lignes qui ne tenaient au peintre
// que par `isoRoadHalfW`, `ROAD_DETAIL`, `SIDEWALK_ISO`, `roadTone` et `ROAD_BAND`.
//
// ⚠ L'ORDRE DES MORCEAUX EST CELUI D'ORIGINE : `roadTone` appelle `roadVeilFor`,
// déclaré près de mille lignes PLUS BAS. Les deux sont des `function` — hoistées,
// donc l'appel tient. En `const`, ce serait une zone morte.

// Matière de chaussée par ère (calée sur la progression du jeu) :
// terre battue → pavé de pierre → asphalte industriel → voie sombre futuriste.
// Depuis la regénération des chaussées (2026-07-28), le ruban est REMPLI par la
// tuile road-* de l'ère (ROAD_DETAIL.tiles) : ces tons sont le TON MOYEN MESURÉ
// des tuiles (imprimé par scripts/fetchGroundTiles.mjs) — ils servent d'aplat de
// repli tant que le PNG décode, de teinte LOD, et de base à l'ÉPAULEMENT
// (shoulderMix) : s'ils divergeaient des tuiles, l'accotement jurerait avec sa
// chaussée.
export function roadToneRaw(band) {
  return band >= 7 ? [73, 86, 102]     // tech — voie bleu-gris sombre
    : band >= 6 ? [65, 62, 64]         // asphalte
      : band >= 4 ? [128, 116, 100]    // pierre — voie dallée claire
        : band >= 2 ? [108, 104, 92]   // pavé — rue grise
          : [116, 79, 55];             // terre — sentier
}
// Ton EFFECTIF de la chaussée = tuile + VOILE DE LECTURE de l'ère (ROAD_VEIL,
// plus bas). Une seule vérité : l'épaulement, l'aplat de repli et la teinte de
// dézoom suivent ce que la rue montre VRAIMENT — sinon l'accotement d'une rue
// voilée jurerait avec sa propre chaussée, et le réseau se rebrouillerait au
// premier cran de dézoom (là où le ruban n'est plus qu'un aplat).
export function roadTone(band) {
  const t = roadToneRaw(band), v = roadVeilFor(band);
  return v ? [0, 1, 2].map((i) => Math.round(t[i] + (v[i] - t[i]) * v[3])) : t;
}

// 0.30 → 0.25 le 2026-07-16 (retour Raph « trottoirs plus larges, les voitures
// roulent au milieu ») : chaussée un peu plus étroite → deux VOIES lisibles à
// ±ROAD_BAND/2 du centre (publié aux agents via CM.isoVehLane) et de la place
// pour de vrais trottoirs (SIDEWALK_ISO.w remonté en face).
export const ROAD_BAND = 0.25;   // demi-largeur du ruban (fraction de tuile) — rang « secondary »

// HIÉRARCHIE des largeurs (Raph 2026-07-28 : « des petits chemins et des
// grandes routes — là tout fait la même largeur ») : demi-largeur de chaussée
// PAR RANG, en fraction de tuile. `secondary` = l'ancienne largeur unique
// (ROAD_BAND), qui reste la référence des publications scalaires aux agents.
// Budget géométrique : halfW + trottoir (0.22) doit rester ≈ ½ tuile — avenue
// et main débordent un peu sur la cellule voisine (assumé : recouvert par la
// chaussée jumelle côté boulevard, marge d'herbe côté extérieur) ; le mât de
// lampadaire (LAMP_TUNE.curb = 0.05 du bord) reste hors chaussée jusqu'à 0.45.
export const ISO_ROAD_HALFW = { path: 0.16, secondary: ROAD_BAND, avenue: 0.33, main: 0.36 };
export function isoRoadHalfW(rank) {
  const w = ISO_ROAD_HALFW[rank];
  return w != null ? w : ROAD_BAND;
}


// ── Chaussée : TUILE de route dédiée par âge (clippée au ruban) ──────────────
// Demande Raph : « tuiles de routes dédiées ». Même pipeline que le sol urbain,
// mais la tuile est CLIPPÉE à la forme du ruban (pavé central + bras) → garde les
// rues étroites + trottoirs. Repli = aplat roadTone. PNG /pixelart/iso/<tile>.png.
export const ROAD_MATS = [
  { tile: 'road-dirt' },      // 0 primitif — sentier de terre
  { tile: 'road-dirt' },      // 1 agricole
  { tile: 'road-cobble' },    // 2 bourg — rue pavée
  { tile: 'road-cobble' },    // 3 fortifié
  { tile: 'road-stone' },     // 4 impérial — voie dallée
  { tile: 'road-stone' },     // 5 monumental
  { tile: 'road-asphalt' },   // 6 mégalopole — asphalte
  { tile: 'road-tech' },      // 7 noosphère — voie tech
  { tile: 'road-tech' },      // 8 stellaire
  { tile: 'road-tech' },      // 9 démiurge
];
// tiles=true depuis la REGÉNÉRATION des chaussées (Raph 2026-07-28 : « des
// chemins/routes plutôt que cette route à toutes les ères ») : les road-* sont
// désormais des textures PLATES 64×32 × 4 variantes (fetchGroundTiles.mjs), même
// recette que les sols — le « gros motif » qui avait fait couper les tuiles
// venait des anciennes dalles 48×48 rééchantillonnées. Le ruban reste le MÊME
// (géométrie, épaulement, frange) : seul son remplissage change, clippé au tracé.
// shoulderMix/shoulderV : ÉPAULEMENT (le liseré qui cerne la chaussée) = mélange
// sol↔route un peu assombri, au lieu de la route en sombre — la rue s'assoit dans
// le sol de l'ère au lieu d'avoir l'air tamponnée dessus. mix = part de route
// dans le mélange (0..1), v = assombrissement du résultat.
// edgeFringe : FRANGE DE CHAUSSÉE (jonction route↔sol) — multiplicateur global
// du crantage des bords du ruban. ESSAYÉ à 1 puis COUPÉ le 2026-07-16 (retour
// Raph immédiat : « oula non ça ne va pas du tout » — les bords rongés + les
// gravillons salissaient la route). 0 = bords géométriques nets ; reste un knob.
// groove/grooveA : GORGE — fine ombre de contact qui cerne la dalle (largeur en
// fraction de tuile, alpha) → la rue s'assoit DANS le sol (grammaire « route en
// creux » des rues top-down), sans toucher au bord net de la dalle.
// feather/featherA : OURLET — bande de fondu au-delà de l'épaulement (même teinte
// en alpha) → la jonction épaulement→sol n'a plus de 2e arête dure.
// veilK : multiplicateur global du VOILE DE LECTURE (0 = éteint, cf. ROAD_VEIL).
export const ROAD_DETAIL = {
  on: true, tiles: true, band: null, shoulderMix: 0.55, shoulderV: 0.92, edgeFringe: 0,
  groove: 0.03, grooveA: 0.28, feather: 0.05, featherA: 0.4, veilK: 1,
  // TOUTE la voirie (ourlet, épaulement, trottoir, caniveau, rubans, frange,
  // allées de seuil) est peinte dans le calque à l'échelle de l'ART puis agrandie
  // en NEAREST : plus un seul bord à la résolution de l'écran. false = ancien
  // tracé vectoriel, pour l'A/B.
  pixel: true,
};   // band≠null = force ère (preview)
// ── VOILE DE LECTURE de la chaussée (Raph 2026-07-29 : « les routes de cette ère
// ne se distinguent pas assez du sol des maisons ») ───────────────────────────
// Rien ne garantit qu'une ère tire son sol de lot et sa chaussée de deux familles
// différentes, et au BOURG les deux sortent du même gris : `ground-cobble`
// (gravier fin) et `road-cobble` (pavés moussus) ne sont séparés que par 32 de
// distance RGB mesurée sur les PNG — moitié moins que n'importe quel autre
// couple d'ère (80 à 111). À l'échelle du jeu la rue disparaît dans le sol et
// c'est le TROTTOIR, plus clair, qui dessine seul le réseau : la ville lit comme
// une nappe de pavé rayée de liserés crème.
// Le voile est un ton posé sur la chaussée SEULE, en alpha : chaque pierre de la
// tuile reste lisible, mais la rue devient un pavé usé plus sombre et plus chaud
// — exactement la lecture de l'ère impériale (voie brune sur dalles pâles), la
// seule que personne n'a jamais eu de mal à suivre.
// ⚠ Il ne s'applique QUE là où le couple MESURÉ se confond : les bandes 0-1 (80),
// 4-5 (84), 6 (111) et 7-9 (43) lisent déjà — les voiler n'assombrirait qu'une
// ville qui va bien. Garde sur les PNG : __tests__/isoRoadGroundContrast.test.js.
// Cuit DANS la face de tuile (isoFaceVeiled), jamais posé en aplat par cellule :
// un alpha par cellule marquerait les coutures que les passes-union évitent.
export const ROAD_VEIL = [
  null, null,
  [58, 42, 30, 0.30],   // 2 bourg — pavé usé, chaud, contre le gravier gris des lots
  [58, 42, 30, 0.30],   // 3 fortifié
  null, null, null, null, null, null,
];
export function roadVeilFor(band) {
  if (!(ROAD_DETAIL.veilK > 0)) return null;
  const v = ROAD_VEIL[Math.max(0, Math.min(ROAD_VEIL.length - 1, band | 0))];
  if (!v) return null;
  return ROAD_DETAIL.veilK === 1 ? v : [v[0], v[1], v[2], Math.min(1, v[3] * ROAD_DETAIL.veilK)];
}

// ── TROTTOIRS ISO — LA MARCHE, PAS UNE BANDE ─────────────────────────────────
//历 Historique court, parce qu'il explique la forme actuelle : ce trottoir a
// d'abord été une BANDE construite (bordure claire, dalles au ton de l'ère,
// joints transversaux, liseré de rive), puis une bande TEXTURÉE par un art
// dédié. Raph a tranché autrement le 2026-08-05 : « techniquement il n'y a pas
// de sol mais trottoir et maison, donc pas de sens que le trottoir ait une
// apparence différente du sol. Il faut effectivement la marche mais après bam,
// du sol ». LE SOL DE VILLE *EST* LE TROTTOIR — il n'y a donc rien à peindre
// entre le caniveau et les maisons, seulement une MARCHE à la limite de la rue.
//
// Ce qui reste ici sert à trois choses, et trois seulement :
//   • la GÉOMÉTRIE de rue publiée aux agents et au mobilier (`w`, `curb`) — où
//     marchent les piétons, où se posent bancs et bacs ;
//   • la MARCHE côté rue (`step*`) ;
//   • la continuité du trottoir devant les venelles (`alleyThrough`).
// Les routes de campagne (hors tissu urbain) gardent épaulement + ourlet.
// Réglage live : __sidewalkIso(false | { minBand, w, curb, alleyThrough,
// stepA, stepLight, stepShade }).
export const SIDEWALK_ISO = {
  on: true, minBand: 2,
  alleyThrough: true,   // le trottoir passe DEVANT l'entrée des venelles (cf. § plus bas)
  w: 0.22,        // largeur de la bande de marche, depuis la dalle : ne peint plus rien,
                  // mais publie aux agents où marcher et où poser le mobilier
  curb: 0.03,     // recul du nez de bordure au-delà du caniveau
  // LA MARCHE (cf. § dans la passe route) : tranche sombre + nez éclairé, sur le
  // SEUL bord dont la face est tournée vers la caméra. stepA 0 = pas de marche,
  // stepH = hauteur de la tranche en pixels d'art.
  stepA: 0.5, stepH: 2, stepLight: [255, 252, 244], stepShade: [38, 30, 20],
};
