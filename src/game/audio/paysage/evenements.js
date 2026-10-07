// LE GUICHET DU PAYSAGE SONORE (docs/PLAN-AMBIANCE-SONORE.md § 2 et § 3.3-3.4).
//
// La carte y DÉPOSE ce qu'elle dessine et qui sonne, au moment où elle le dessine :
// on n'entend que ce qu'on voit, et rien de ce que le peintre a écarté (hors champ,
// dézoom, vie coupée par l'option « Mouvement »). Le directeur (paysage.js) vient
// relever le guichet dix fois par seconde.
//   · les PONCTUELS : un événement daté (le plouf d'un poisson qui retombe) ;
//   · les ÉMETTEURS : ce qui sonne tant qu'il est là (la libellule qui vibre), noté à
//     chaque image avec sa position — le directeur lit la dernière image complète.
//
// Module-FEUILLE (aucun import) : la vie du fleuve l'importe sans risquer de cycle
// (cf. l'en-tête d'iso/isoRiverLife.js). Positions en px MONDE, comme le registre des
// figures. Rien n'est alloué par dépôt (tableaux typés), et tant que le paysage
// n'écoute pas — coupé, fenêtre cachée, carte démontée — déposer ne coûte qu'un test.
//
// ⛔ Les Faits divers n'y déposent RIEN (PLAN-FAITS-DIVERS.md § 2.7 : une scène est
// muette tant qu'elle n'est pas désignée). Un plouf trahirait l'homme-volant.

let ecoute = false;
const horloge = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ── Les ponctuels : une file circulaire ──────────────────────────────────────
const NEV = 64;
const evNom = new Array(NEV).fill('');
const evX = new Float32Array(NEV), evY = new Float32Array(NEV), evF = new Float32Array(NEV);
const evT = new Float64Array(NEV);
let evTete = 0, evN = 0;

// ── Les émetteurs : par famille, la dernière image ───────────────────────────
const CAP_EM = 16;
const familles = new Map();
function famille(nom) {
  let f = familles.get(nom);
  if (!f) {
    f = { image: NaN, vu: -Infinity, n: 0, x: new Float32Array(CAP_EM), y: new Float32Array(CAP_EM), k: new Float32Array(CAP_EM) };
    familles.set(nom, f);
  }
  return f;
}

// Le directeur ouvre et ferme le guichet. Fermer le vide : un plouf déposé avant
// une sortie ne doit pas sonner au retour.
export function paysageEcoute(on) {
  ecoute = Boolean(on);
  if (!ecoute) {
    evN = 0;
    for (const f of familles.values()) { f.n = 0; f.vu = -Infinity; f.image = NaN; }
  }
}
export function paysageEcouteActive() {
  return ecoute;
}

// Un événement ponctuel `nom` à (x, y) px monde ; `force` : sa taille (le calibre du
// poisson), 1 par défaut.
export function noteSon(nom, x, y, force = 1) {
  if (!ecoute) return;
  const i = (evTete + evN) % NEV;
  evNom[i] = nom; evX[i] = x; evY[i] = y; evF[i] = force; evT[i] = horloge();
  if (evN < NEV) evN += 1;
  else evTete = (evTete + 1) % NEV;            // file pleine : le plus ancien s'oublie
}

// Relève les ponctuels déposés depuis la dernière fois : fn(nom, x, y, force, âge en
// ms). Ceux de plus de `ageMax` ms sont jetés (une file restée pleine pendant un gel).
export function releverSons(fn, ageMax = 400) {
  const t = horloge();
  for (let j = 0; j < evN; j += 1) {
    const i = (evTete + j) % NEV;
    const age = t - evT[i];
    if (age <= ageMax) fn(evNom[i], evX[i], evY[i], evF[i], age);
  }
  evTete = 0; evN = 0;
}

// Un émetteur `fam` à (x, y) px monde, d'intensité `k` (0..1), dans l'image `image`
// (le `now` du peintre : toutes les notes d'une même image le partagent).
export function noteEmetteur(fam, x, y, k, image) {
  if (!ecoute) return;
  const f = famille(fam);
  if (image !== f.image) { f.image = image; f.n = 0; f.vu = horloge(); }
  if (f.n >= CAP_EM) return;
  const i = f.n++;
  f.x[i] = x; f.y[i] = y; f.k[i] = k;
}

// La dernière image notée de la famille `fam`, ou null si elle date de plus de
// `fraicheur` ms (plus rien de cette famille n'est dessiné). Lecture seule.
export function emetteursDe(fam, fraicheur = 350) {
  const f = familles.get(fam);
  if (!f || !f.n || horloge() - f.vu > fraicheur) return null;
  return f;
}
