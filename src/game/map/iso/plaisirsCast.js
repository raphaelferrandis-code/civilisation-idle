// ── LES FILLES DE LA MAISON ──────────────────────────────────────────────────
// (2026-10-03 — Raph : « ajouter le côté luxure qu'on n'avait plus, des femmes qui
// se déplacent en tenue révélatrice. On est sur la maison des plaisirs, il faut que
// ça se voie. »)
//
// Danseuses, hôtesses, courtisanes, en tenue de scène de leur époque — suggestif,
// jamais de nudité. Chaque âge a les siennes ; un âge pas encore dessiné retombe sur
// les femmes de son jeu d'habitants.
//
// DESSINÉES À LA MAIN (scripts/plaisirsGirls.mjs, sources art/plaisirs/*.aseprite) :
// après deux passes PixelLab, Raph — « les yeux ne sont pas beaux, la courtisane est
// illisible ; reprends-les sur Aseprite : les yeux, les animations, et les seins encore
// plus gros, type push-up ». Un même corps en sablier au buste en push-up, des yeux
// nets (cils, blanc, iris), trois tenues bien distinctes, et un gréement : le pas
// soulève le corps, les hanches balancent, le BUSTE REBONDIT. Toile 32, semelles à
// y = 28 : même échelle que les habitants (0,71).
//
// `girls` : celles qui circulent (hôtesses, courtisanes) ; `dancers` : la troupe de
// la scène, avec sa bande de DANSE (`danse`, même découpage que la marche, jouée en
// boucle sur place ; seules les faces sud-est et sud-ouest sont animées, le dos recopie
// la face).
const S = 0.71;
// Une troupe par jeu d'habitants (mêmes bandes que agentSetForBand) : trois filles
// qui circulent (la danseuse de la troupe d'abord, puis l'hôtesse et la courtisane).
// `alanguie` : la COURTISANE ALANGUIE de l'âge (2026-10-04, Raph : « la luxure, pousse
// au max » puis « dessine sur PixelLab ») — allongée sur le meuble de son époque, un
// sprite à part (48 × 32, scripts/plaisirsAlanguies.mjs), posé dans les antichambres.
// `gigolos` : les GIGOLOS de l'âge (2026-10-04, Raph : « il faut un peu de gigolos
// aussi, moins, plus dans le service ») — dessinés dans le même gréement que les filles
// (scripts/plaisirsGirls.mjs --gigolos). Le premier sert, le second tient le bar ou la
// table des dés ; chacun a sa marche au plateau (`plateau`).
const troupe = (k, girls, dancer, gigolos) => ({
  girls: girls.map((g) => ({ name: `plaisirs-${k}-${g}`, scale: S })),
  dancers: [{ name: `plaisirs-${k}-${dancer}`, scale: S, danse: `plaisirs-${k}-${dancer}-danse`, danseScale: S }],
  alanguie: `plaisirs-${k}-alanguie`,
  gigolos: gigolos.map((g) => ({ name: `plaisirs-${k}-${g}`, scale: S, plateau: `plaisirs-${k}-${g}-plateau` })),
});
const FEU = troupe('feu', ['chasseresse', 'sauvage', 'flamme'], 'flamme', ['pagne', 'colosse']);          // fourrures et os
const MOYEN = troupe('moyen', ['courtisane', 'dame', 'gigue'], 'gigue', ['tavernier', 'ecuyer']);         // chemises et corselets
const CAST = {
  0: FEU, 1: FEU, 2: MOYEN, 3: MOYEN,
  4: troupe('antique', ['hetaire', 'danseuse', 'bacchante'], 'bacchante', ['echanson', 'athlete']),      // voiles, or, laurier
  5: troupe('fonte', ['courtisane', 'chanteuse', 'cancan'], 'cancan', ['garcon', 'apache']),              // la maison close Belle Époque
  6: troupe('neon', ['cocktail', 'or', 'revue'], 'revue', ['chippendale', 'crooner']),                   // la revue : plumes, paillettes
  7: troupe('jade', ['voile', 'eclat', 'lumiere'], 'lumiere', ['servant', 'ange']),                      // la cité de jade
  8: troupe('astral', ['voile', 'eclat', 'lumiere'], 'lumiere', ['servant', 'ange']),                    // nacre et or
  9: troupe('cristal', ['voile', 'eclat', 'lumiere'], 'lumiere', ['servant', 'ange']),                   // cristal
};
export function plaisirsCast(band) {
  return CAST[Math.max(0, Math.min(9, band | 0))] || null;
}
