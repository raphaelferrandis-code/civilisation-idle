// LA PALETTE DU SOL ISO — les tons de référence, et rien d'autre.
//
// Extraite d'isoRenderer.js le 2026-08-23 (Q10). Sept valeurs plates : l'herbe
// (référence d'ÉTÉ), l'eau, le dallage de place et son ton par ère, le réglage du
// bas-fond de rive, et le formateur `rgb`.
//
// Ce module N'IMPORTE RIEN — c'est une FEUILLE du graphe, et c'est exactement ce
// qu'on lui demande : l'eau, les tuiles et le peintre peuvent le lire sans qu'aucun
// cycle soit seulement possible.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, ZÉRO import. Vérifiée ligne à ligne contre la version
// commitée.
//
// ⚠ LA PALETTE DE SAISON N'EST PAS ICI, ET NE PEUT PAS Y ÊTRE. `SEASON_GRASS` et
// ses trois sœurs sont RÉASSIGNÉES à chaque frame par isoRenderer, et une liaison
// importée est en LECTURE SEULE en ESM — les déplacer jetterait un TypeError à la
// première frame. Elles restent donc chez leur seul écrivain, et lisent `GRASS` /
// `GRASS_WILD` d'ici comme référence d'été.
//
// ⚠ LE TON DE CHAUSSÉE (`roadTone`) n'est pas ici non plus : il dépend du voile de
// lecture de l'ère, donc de `ROAD_DETAIL` — 34 usages de réglage de VOIRIE, qui
// n'ont rien à faire dans une palette.

// ── Palette Phase 1 (flat, calée sur les teintes du rendu actuel) ────────────
export const GRASS = [116, 138, 84];        // herbe / nature (référence = été)
export const GRASS_WILD = [98, 120, 76];    // hors ville (léger contraste)

export const WATER = [74, 98, 109];         // eau ardoise (cf. fleuve)
export const PLAZA = [214, 206, 182];       // dallage d'esplanade (repli, toutes ères)
// DALLAGE PAR ÈRE — ton d'APLAT de chaque matière, mesuré par fetchGroundTiles.
// Il sert au repli (tuile pas encore décodée) et au LOD lointain, où la tuile
// n'est plus blittée : sans lui, une place changeait de couleur en dézoomant.
// Clé absente : on garde PLAZA.
// DOSE DE LA TUILE DE PLACE (2026-09-30, docs/PLAN-MAQUETTE-VIVANTE.md, lot 2) : posée
// pleine, elle faisait de chaque place une grande tache claire de gros pavés, plus
// chargée que tout ce qui l'entoure — on lisait « vide » au milieu de la ville.
// Comme le dallage des rues (URBAN_TILE_A), le motif descend et le ton porte la place.
export const PLAZA_GROUND = { tileAlpha: 0.45 };
export const PLAZA_ERA_TONE = {
  // antique : (219,204,185) mesuré sur la tuile ; rabattu vers le sol des rues
  // (~190,181,154) avec la tuile dosée — la place reste plus claire, sans éblouir.
  // BIBLE DES SURFACES (2026-10-01) : la place est la version CLAIRE de la matière du
  // quartier, de 10 à 30 de luminance au-dessus de son sol — jamais une autre pierre.
  // Les quatre autres ères y sont passées avec leurs tuiles (décalées par
  // scripts/solsCoherents.mjs, dessin intact) : médiéval bleu-gris L117 → calcaire
  // chaud L168 (il était PLUS SOMBRE que la rue) ; industriel L91 → granit clair L190
  // (un trou noir dans une ville à L176 — Raph avait déjà demandé de l'éclaircir) ;
  // moderne L196 → L175 ; cosmique L225 → L186 (blanc cru sur le sol tech noir), et NEUTRE :
  // une seule place sert trois nacres (jade, ivoire, lavande), une teinte chaude jurait sur le jade.
  antique: [208, 195, 174], medieval: [174, 166, 148], industrial: [190, 188, 182],
  modern: [172, 174, 174], cosmic: [184, 185, 184],
};
// L'HIVER DES PLACES (même nuit) : aucun dallage de place n'a de tuile d'hiver. Le sol du
// quartier blanchit (URBAN_WINTER, isoGroundDetail), la place restait en pierre sèche — un
// carré d'été au milieu de la neige. Son aplat tire vers la neige ; la tuile dosée dessus
// garde le dessin des pierres, qui lit alors comme un dallage saupoudré.
export const PLAZA_WINTER = { snow: [228, 233, 238], mix: 0.5 };
export function plazaToneFor(era, winter) {
  const t = PLAZA_ERA_TONE[era] || PLAZA;
  if (!winter || !(PLAZA_WINTER.mix > 0)) return t;
  return t.map((v, i) => Math.round(v + (PLAZA_WINTER.snow[i] - v) * PLAZA_WINTER.mix));
}
// Bas-fond CLAIR le long des rives (drawIsoRiver) : 3 bandes CLAIR (bord) → profond
// (centre), « l'eau est moins profonde au bord » (retour Raph 2026-07-16 :
// « remets un liseré bleu clair sur les bords du fleuve »). Teintes = bleus gris
// CLAIRS de la famille de l'eau ardoise (pas de cyan). Réglable live via
// window.__waterShore({ on, maxBand, w1,w2,w3, a1,a2,a3, c1,c2,c3, lodMerge,lodW,lodA,lodC }).
//
// ⚠ EXCLUSION MUTUELLE AVEC LE QUAI, ET SON TROU. Dès la bande 2 la berge
// maçonnée porte SON propre bas-fond au pied du mur (shoreLine de drawRun) : les
// deux ensemble faisaient deux lignes claires parallèles, d'où `maxBand`. Mais ce
// relais du quai est sous `if (wallOn && !lod)` — il DISPARAÎT au dézoom. Mesuré
// sur les pixels de bord du ruban : bande 1 → 25,3 % de bord clair au repos comme
// en LOD, bande 4 → 12,5 % au repos mais 10,0 % en LOD. Raph veut le liseré
// « tout le temps » (2026-07-22), donc on reprend la main quand le quai lâche :
// `lodFallback` rallume le bas-fond en LOD à toutes les ères. L'exclusion reste
// entière au repos — jamais les deux à la fois, jamais deux lignes parallèles.
export const waterShoreTune = {
  on: true,
  // SUIT LE CORPS D'EAU (Raph, 2026-07-30). Depuis les coloris pilotés par l'état
  // (cf. WATER_SHEETS), un liseré figé en bleu-gris ardoise jurait franchement sur
  // un fleuve azur ou turquoise : c'est la MÊME eau, en moins profond, donc sa
  // teinte doit venir du même endroit. `follow: false` rend la main aux c1/c2/c3
  // ci-dessous, qui restent le jeu ardoise d'origine (et le repli si la table des
  // coloris ne dit rien).
  follow: true,
  // ÎLES : liseré clair OUI — et l'aller-retour vaut d'être raconté, pour que
  // personne ne le « corrige » en croyant rétablir un choix.
  //   · le matin du 2026-07-30, Raph le fait RETIRER : à ce moment-là le sable et
  //     le bleu tombaient au même endroit, et deux franges concentriques sur un
  //     fuseau étroit faisaient une cible plutôt qu'une berge ;
  //   · le soir, il le redemande — « il faut le liseré clair tout autour de
  //     l'île ». Entre les deux, le rivage de sable s'est posé pour de bon CÔTÉ
  //     TERRE (cf. le drapeau `withIslands` de buildEdges). Les deux ne se
  //     doublent donc plus : le sable dit la grève, le bleu dit le bas-fond, de
  //     part et d'autre de la ligne d'eau — exactement comme sur les berges du
  //     fleuve.
  // Ce n'est pas un avis qui a changé, c'est la scène.
  islands: true,
  maxBand: 1,                                              // bande d'ère max (au-delà : bas-fond du quai)
  lodFallback: true,                                       // en LOD le quai ne trace rien → on reprend la main
  w1: 18, w2: 10, w3: 4.5,                                 // largeurs (× zoom)
  a1: 0.45, a2: 0.58, a3: 0.75,                            // alphas (bord = plus opaque)
  c1: '120,160,175', c2: '150,192,205', c3: '190,224,232', // bleus clairs, du doux au liseré
  // FUSION AU DÉZOOM (LOD) : les trois bandes tombent alors à 6,3 / 3,5 / 1,6 px
  // et se confondent en une seule lisière à l'œil, tout en coûtant six traits
  // pleine longueur dans un clip. On les remplace par UN trait.
  //
  // ⚠ RÉGLAGE CALÉ À L'ŒIL SUR CAPTURE, pas déduit. Le premier essai prenait la
  // teinte MÉDIANE c2 à 0,62 — comparaison à ×4 sans appel : le liseré clair
  // disparaissait presque. Ce qui porte la lecture du bord, c'est la teinte VIVE
  // c3, pas la moyenne des trois : empilées, les trois bandes culminent à ~0,94
  // d'opacité sur c3 au ras de la rive. Trois essais capturés au même instant
  // figé (10/0,80 · 12/0,70 · 8/0,90), c'est 12/0,70 qui recolle à la référence.
  lodMerge: true,
  lodW: 12,                                                // largeur du trait fusionné (× zoom)
  lodA: 0.70,                                              // opacité
  lodC: '190,224,232'                                      // = c3, la teinte VIVE du liseré
};

export const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

// L'OR DU SURVOL : le liseré qui répond à « qu'est-ce que l'infobulle décrit ? ».
// Monté ici le 2026-08-23 parce que TROIS passes le tracent — les scènes moteur,
// les habitations, les sprites simples — et que la première est partie dans son
// propre module. Une teinte partagée par trois peintres est une teinte de palette.
// ⚠ Son jumeau `HOVER_CELL` (le trait sur le losange au sol) est resté avec le
// survol : lui n'a qu'un seul lecteur, et rien ne gagnerait à l'éloigner.
export const HOVER_GOLD = 'rgba(232,198,110,0.95)';

