// ── LE PLAN DE LA MAISON DES PLAISIRS ────────────────────────────────────────
// (2026-10-03, « un plan, deux vues » — docs/PLAN-MAISON-DES-PLAISIRS.md § ⭐)
//
// Pour chaque âge, UNE description du bâtiment : ses NIVEAUX (les lieux qu'on y
// trouve, du bas vers le haut, et la largeur de chacun en pixels de coupe), et ce
// qui le distingue (ascenseur, moulin, cage au centre). La coupe de l'onglet
// (iso/plaisirsCoupeHD.js) et le bâtiment de la carte (iso/plaisirsBake.js) sortent
// de cette même description : dehors on compte les mêmes étages qu'en coupe.
//
// Les lieux : les jeux (des, cartes, tickets, boutique), la scène, le SALON (bar,
// piano) des tours, et le BOUDOIR (salons particuliers, alcôves) — toujours en
// HAUT : on y MONTE. Icare n'est pas un étage : c'est le toit.
//
// Pur : aucune dépendance.
const P = (levels, widths, extra = {}) => ({ levels, widths, ...extra });
const TOUR5 = [['des', 'boutique'], ['cartes'], ['tickets'], ['scene'], ['salon', 'boudoir']];
const PLAN = [
  // 0 Feu : le radeau sous la grande tente, tout de plain-pied.
  P([['des', 'cartes', 'tickets', 'boutique', 'scene', 'boudoir']], [288]),
  // 1 Bois, 2 Pierre : la maison à étage.
  P([['des', 'boutique', 'scene'], ['cartes', 'tickets', 'boudoir']], [230, 186]),
  P([['des', 'boutique', 'scene'], ['cartes', 'tickets', 'boudoir']], [236, 192]),
  // 3 Couronne, 4 Marbre : trois niveaux.
  P([['des', 'boutique'], ['cartes', 'scene'], ['tickets', 'boudoir']], [206, 176, 140]),
  P([['des', 'boutique'], ['cartes', 'scene'], ['tickets', 'boudoir']], [212, 180, 144]),
  // 5 Fonte : la maison close Belle Époque — salle de jeux au rez, CABARET au premier,
  // salons particuliers sous la verrière ; ascenseur à grille, moulin rouge.
  P([['des', 'tickets', 'boutique'], ['scene', 'cartes'], ['boudoir']], [240, 210, 150], { lift: true, windmill: true }),
  // 6 Néon et âges cosmiques : la tour, ses plateaux autour du fût (cage AU CENTRE).
  P(TOUR5, [200, 188, 178, 168, 158], { lift: true, center: true }),
  P([['des', 'boutique'], ['cartes', 'tickets'], ['scene'], ['salon', 'boudoir']], [200, 186, 174, 162], { center: true }),
  P(TOUR5, [200, 188, 178, 168, 158], { center: true }),
  P(TOUR5, [200, 188, 178, 168, 158], { center: true }),
];

export function plaisirsPlan(band) {
  return PLAN[Math.max(0, Math.min(9, band | 0))];
}
// Les lieux de chaque niveau, du bas vers le haut (copie : l'appelant peut la ranger).
export function plaisirsProgramme(band) {
  return plaisirsPlan(band).levels.map((rooms) => rooms.slice());
}
