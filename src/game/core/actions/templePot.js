"use strict";

// LA CAGNOTTE DU TEMPLE — règles PARTAGÉES du pot (state.icarusPotFaveur).
// Module FEUILLE volontaire, comme templeArtifacts.js : n'importe QUE balance
// (et state quand feedPot arrivera) → aucun cycle avec les 4 moteurs de jeu qui
// l'importent (augures/icarus/scratch/blackjack).
//
// POURQUOI CE MODULE EXISTE. Le pot n'est pas un puits : en solo, tout ce qui y
// entre revient au MÊME joueur. C'est un PAIEMENT DIFFÉRÉ, donc il compte dans le
// RTP réel : rtp_total = rtp_base + part_versée + consolations (cf. le garde-fou
// A9 de bench-temple.js, qui est le seul à le mesurer — A1..A8 ne regardent que
// auguryPaytable, donc un jeu sur quatre, cagnotte exclue).

import { state } from '../state.js';
import { RAFLE_MISE_PLEINE, SERRES_RAKE_MULT, TEMPLE_POT_RECYCLE, TEMPLE_POT_RECYCLE_CAP, ICARUS_POT_CAP_FAVEUR, NOYE_POT_MULT, COFFRE_MAX_LEVEL } from '../balance.js';
import { hasTempleArtifact } from './templeArtifacts.js';

// Recycle EFFECTIF : la part de l'edge qui repart à la cagnotte. L'osselet du noyé
// le multiplie, mais le clamp est ce qui garantit TOUT le reste : recycle < 1 ⟹
// rtp_total < 1, quels que soient le jeu, le niveau, la mise et les artefacts.
// C'est le point de défaillance UNIQUE du temple, et A10 le verrouille.
export function potRecycle() {
  const mult = hasTempleArtifact("noye") ? NOYE_POT_MULT : 1;
  return Math.min(TEMPLE_POT_RECYCLE_CAP, TEMPLE_POT_RECYCLE * mult);
}

// Verse à la cagnotte la part de l'EDGE, et RIEN d'autre.
//
//     feed = mise × recycle × (1 − rtp_base)
//
// d'où, le pot revenant intégralement au joueur (paiement différé) :
//
//     rtp_total = rtp_base + recycle × (1 − rtp_base) < 1   ⟺   recycle < 1
//
// Appelé à CHAQUE résolution, gagnée comme perdue — pas seulement sur la perte.
// C'est délibéré et c'est ce qui rend l'espérance EXACTE et déterministe : le
// versement ne dépend plus de l'issue, donc la preuve tient en une ligne au lieu de
// dépendre d'une pondération par tier. On y perd la lecture « le Chien nourrit
// double » ; on y gagne un invariant vrai par algèbre. C'est le bon échange : la
// valeur de cette règle EST sa preuve.
//
// `rtpBase` doit être le RTP RÉEL de la ligne de jeu (arrondi du payout compris) :
// le sous-estimer gonflerait le versement et rongerait la marge.
export function feedPot(stakePaid, rtpBase) {
  const stake = Math.max(0, Number(stakePaid) || 0);
  const rtp = Math.max(0, Math.min(1, Number(rtpBase) || 0));
  const feed = stake * potRecycle() * (1 - rtp);
  state.icarusPotFaveur = Math.min(ICARUS_POT_CAP_FAVEUR, Math.max(0, state.icarusPotFaveur || 0) + feed);
  return feed;
}

// Arrondi NON BIAISÉ d'un payout calculé. E[payRound(x)] = x EXACTEMENT.
//
// Math.round() a un biais POSITIF non borné sur les petites mises, et il suffit à
// faire passer un RTP au-dessus de 1 tout seul : round(4 × 1,4) = 6 au lieu de 5,6,
// soit +7,1 %, quand l'edge aux ailes 6 n'est que de 4,2 %. Résultat mesuré, cible
// ×1,4 sur une Plume : rtp_base = 102,6 %. Et feedPot ne peut RIEN y faire — quand
// rtp_base dépasse 1, il n'y a plus d'edge à recycler, l'invariant est déjà mort.
//
// ⚠ Ce correctif ne valait RIEN tant que la cagnotte imprimait (elle pesait 10× plus
// lourd, et l'exploit ×1,4 était de toute façon dominé par ×10 à 118,7 %). Il ne
// devient LE dernier trou qu'une fois le pot financé par l'edge. L'ordre comptait.
//
// La Faveur reste entière, l'état ne change pas, aucune migration de save. Prix
// assumé : à issue égale, deux ×1,4 sur une Plume peuvent rendre 5 puis 6. Invisible
// en pratique (la mise et le multiplicateur sont déjà aléatoires), mais ça consomme
// un Math.random() de plus — attention aux tests qui stubbent une SÉQUENCE
// (mockReturnValueOnce) plutôt qu'une valeur constante.
export function payRound(exact) {
  const x = Math.max(0, Number(exact) || 0);
  const base = Math.floor(x);
  return base + (Math.random() < x - base ? 1 : 0);
}

// LES COFFRES DU TEMPLE : le multiplicateur de mise autorisé. Chaque rang de
// coffre (state.coffreLevel) autorise ×10 de plus ; tout ce qui est demandé
// au-delà est CLAMPÉ au rang possédé, et seules les puissances de 10 existent
// (le cadran de l'UI et les autos ne proposent que ça — le clamp protège les
// saves trafiquées et les appels programmatiques).
export function clampStakeMult(mult) {
  const lvl = Math.max(0, Math.min(COFFRE_MAX_LEVEL, state.coffreLevel || 0));
  const m = Number(mult) || 1;
  if (m <= 1) return 1;
  const pow = Math.max(0, Math.min(lvl, Math.round(Math.log10(m))));
  return 10 ** pow;
}

// Prélève sur la cagnotte (consolations des plumes) : ce qui sort du pot n'est
// JAMAIS créé, il vient de ce que les revers y ont versé. Rend ce qui a pu être
// prélevé (0 si la cella est vide) — c'est la contrepartie assumée du filet.
export function drawFromPot(amount) {
  const want = Math.max(0, Math.round(Number(amount) || 0));
  const pot = Math.max(0, state.icarusPotFaveur || 0);
  const got = Math.min(want, Math.floor(pot));
  if (got > 0) state.icarusPotFaveur = pot - got;
  return got;
}

// Part du pot qu'une rafle emporte, au PRORATA DE LA MISE.
//
// Avant, la rafle était INDÉPENDANTE de la mise : une Plume à 4 Faveur emportait
// la cagnotte ENTIÈRE, exactement comme une Hécatombe à 25. Trois conséquences,
// toutes mesurées :
//   1. Icare ciblé ×10 rendait 118,7 % dès le premier jour, sans aucun artefact
//      (0,82 de base + 0,367 de part versée qui revenait intégralement).
//   2. La mise n'était pas une décision : le seul terme non linéaire du temple
//      (la rafle) ignorait la mise, donc la petite mise dominait strictement.
//   3. La stratégie dominante était de gonfler le pot ailleurs, puis de le vider
//      en vols à 4 Faveur.
// Au prorata, la Plume emporte 16 % et l'Hécatombe 100 % : le magot se paie à la
// hauteur du risque pris, et ce qui reste dans la cella continue d'exister après
// la rafle (le pot devient un objet économique lisible au lieu d'un tout ou rien).
//
// La borne à 1 est ce qui garantit qu'on ne peut jamais emporter plus que le pot.
// Les serres (artefact) montent la part de moitié : Plume 16 → 24 %, Aile 40 →
// 60 %. C'est de la SORTIE de pot uniquement — démontré plus haut : la sortie ne
// change pas le RTP long terme, donc les serres vendent du TEMPO, pas du
// rendement. Le magot se prend plus vite, il ne grossit pas plus.
export function potRakeShare(stakeFaveur) {
  const stake = Math.max(0, Number(stakeFaveur) || 0);
  const mult = hasTempleArtifact("serres") ? SERRES_RAKE_MULT : 1;
  return Math.min(1, (stake * mult) / RAFLE_MISE_PLEINE);
}

// Montant réellement emporté (Faveur ENTIÈRE) et solde restant, à partir du pot
// courant et de la mise. Retourne { rake, left } — `left` garde la fraction, comme
// le tronc (offeringTrunk.js) : rien n'est perdu à l'arrondi.
// Le plafond est floor(pot) et non pot : quand la part vaut 1 (Hécatombe, serres)
// et que le pot est fractionnaire, round() arrondissait AU-DESSUS du pot et le
// min() retombait sur le pot fractionnaire — seule brèche du contrat « Faveur
// ENTIÈRE » (le solde du joueur devenait fractionnaire). La fraction reste en pot.
export function potRake(potFaveur, stakeFaveur) {
  const pot = Math.max(0, Number(potFaveur) || 0);
  const rake = Math.min(Math.floor(pot), Math.round(pot * potRakeShare(stakeFaveur)));
  return { rake, left: Math.max(0, pot - rake) };
}
