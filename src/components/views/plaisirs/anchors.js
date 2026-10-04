"use strict";

import { blackjackUnlocked } from "../../../game/core/actions/blackjack.js";
import { icarusUnlocked } from "../../../game/core/actions/icarus.js";
import { scratchUnlocked } from "../../../game/core/actions/scratch.js";
import { slotsUnlocked } from "../../../game/core/actions/slots.js";
import { rouletteUnlocked, rouletteVipUnlocked } from "../../../game/core/actions/roulette.js";
import { maisonRank } from "../../../game/core/actions/maisonTable.js";
import { BOUDOIR_UNLOCK_RANK, ROULETTE_UNLOCK_RANK } from "../../../game/core/balance.js";
import { regulationActionUnlocked } from "../../../game/core/mechanics/crisis-cost.js";
import { REGULATION_ACTIONS } from "../../../game/data/regulationActions.js";
import { state } from "../../../game/core/state.js";

// Les lieux de la Maison des Plaisirs : quel jeu (`kind`, celui qu'attend
// templeGames.js) ou quelle vue (`view`) chacun ouvre, son nom, son verrou.
//
// ⭐ Refonte du 2026-10-02 (docs/PLAN-MAISON-DES-PLAISIRS.md, phase 2) : la salle
// n'est plus une illustration fixe (`ui/plaisirs/salle.png`, retirée) mais la COUPE
// du bâtiment PEINTE PAR LE CODE (iso/plaisirsCoupeHD.js), un étage par jeu. Les
// coordonnées relevées à la main ont disparu avec elle : chaque lieu a sa SALLE dans
// la coupe cuite, du même `id`, et c'est la cuisson qui rend son ancre (centre, cadre,
// pixels) — on clique au pixel du lieu. Un lieu sans salle n'existe que dans le menu.
//
// L'ORDRE DU MENU n'est plus celui de ce tableau : depuis le « tableau d'étages »
// (2026-10-03, plaisirs/PlaisirsMenu.jsx), le menu range les lieux par ÉTAGE, tels
// que la coupe cuite les pose (le toit en haut, le rez en bas, de gauche à droite).
export const PLAISIRS_SPOTS = [
  { id: "des",     kind: "augury",    label: "Les osselets" },
  { id: "cartes",  kind: "blackjack", label: "Le vingt-et-un" },
  { id: "icare",   kind: "icarus",    label: "Le vol d'Icare" },
  { id: "tickets", kind: "scratch",   label: "Les tickets" },
  // La machine à sous (2026-10-03) : sa salle n'existe qu'à partir de la Fonte.
  { id: "machines", kind: "slots",    label: "Les machines" },
  // Le nom suit celui de l'ONGLET (« Boutique ») : c'est la même destination.
  { id: "boutique", view: "tech",     label: "La boutique" },
  // LES LIEUX QU'ON REGARDE : ni jeu ni vue, mais la coupe les dessine et ils
  // vivent (la troupe danse sur la scène, les ombres bougent derrière la tenture
  // du boudoir). Les choisir fait défiler la coupe jusqu'à eux, sans bouton
  // d'action (`spotIsVisit`).
  { id: "scene",   kind: null,        label: "La scène" },
  // LE BOUDOIR est le SALON PRIVÉ (Raph, 2026-10-04 : « salon privé sans limite ») : la
  // roulette sans plafond de mise, au titre de Mécène (spotRankLock). Même `id` que sa
  // salle dans la coupe.
  // Le menu garde le nom de la SALLE (« Le salon privé » est la plaque de la table) :
  // il tient sur sa ligne, cadenas compris.
  { id: "boudoir", kind: "rouletteVip", label: "Le boudoir" },
  // LE SALON est la salle de la ROULETTE (lot 3, Raph 2026-10-04) : il s'ouvre au titre
  // de Familier. Même `id` que sa salle dans la coupe.
  { id: "salon",   kind: "roulette",  label: "La roulette" }
];

// Le VERBE de chaque lieu — celui du bouton qui apparaît sur l'illustration une
// fois le lieu choisi. Repris mot pour mot des boutons existants du Temple
// (Jeter, Gratter, Jouer, Voler) : le joueur les connaît déjà, en inventer de
// nouveaux lui ferait réapprendre ce qu'il sait.
//
// Table à part plutôt qu'un champ de plus par lieu : les coordonnées se
// recalibrent souvent, et mêler du texte à des nombres qu'on édite à la main
// est le meilleur moyen d'en casser un.
export const SPOT_VERBES = {
  des: "Jeter",
  cartes: "Jouer",
  tickets: "Gratter",
  icare: "Voler",
  machines: "Tirer",
  boutique: "Entrer",
  scene: "Écouter",
  boudoir: "Miser",
  salon: "Miser"
};
export const spotVerbe = (spot) => (spot && SPOT_VERBES[spot.id]) || "Ouvrir";

// Un lieu qu'on REGARDE (la scène) : il n'ouvre rien, on s'y rend.
export function spotIsVisit(spot) {
  return !!spot && !spot.kind && !spot.view;
}

// Un lieu est-il DÉVERROUILLÉ dans la partie en cours ? (Raph, 2026-08-07 :
// « les jeux inaccessibles au début doivent être grisés comme la scène ».)
//
// ⚠ CE N'EST PAS LA MÊME QUESTION QUE `spotIsOpen`, et les confondre était le
// défaut : la scène est grise parce qu'elle n'ouvre RIEN (aucun jeu écrit), les
// autres l'étaient à tort parce qu'on ne regardait que l'existence du jeu, pas
// le droit d'y jouer. Un lieu affiché comme actif qui refuse le clic est pire
// qu'un lieu grisé — le joueur croit à une panne.
//
// Chaque verrou est lu à SA source (les fonctions du jeu), jamais recopié : le
// jour où le vingt-et-un change d'ère d'ouverture, ce fichier suit sans qu'on y
// pense. Un seuil recopié ici se serait tu.
function spotUnlocked(spot) {
  if (!spot) return false;
  if (spot.kind === "blackjack") return blackjackUnlocked();
  if (spot.kind === "icarus") return icarusUnlocked();
  if (spot.kind === "scratch") return scratchUnlocked();
  if (spot.kind === "slots") return slotsUnlocked();
  if (spot.kind === "roulette") return rouletteUnlocked();
  if (spot.kind === "rouletteVip") return rouletteVipUnlocked();
  if (spot.kind === "augury") {
    // Les osselets sont une ACTION de régulation : leur verrou vit là-bas, et
    // l'identifiant se lit dans les données plutôt qu'écrit en dur (même
    // précaution que PlaisirsView pour l'ouverture du jeu).
    const gamble = REGULATION_ACTIONS.find((a) => a.kind === "gamble");
    return !!gamble && regulationActionUnlocked(gamble.id);
  }
  // LA BOUTIQUE suit exactement la règle de son onglet (App.jsx) : elle s'ouvre
  // au 1er effondrement, ou dès qu'on détient de la Faveur — sinon la Faveur
  // gagnée aux jeux du cycle 0 serait indépensable.
  if (spot.view === "tech") {
    return (state.cycles || 0) >= 1 || (state.grandResetCount || 0) > 0 || (state.faveur || 0) > 0;
  }
  return true;
}

// Un lieu est actif s'il ouvre QUELQUE CHOSE — un jeu (`kind`) ou une vue
// (`view`) — ET si la partie y donne accès. Un lieu sans l'un ni l'autre reste
// dessiné et inerte : mieux vaut ça qu'un panneau vide qui s'ouvre sur rien.
// C'était le cas de la scène, faute de banque de sons (le vrai coût de la
// musique est le SON, pas l'art).
export function spotIsOpen(spot) {
  return !!(spot && (spot.kind || spot.view)) && spotUnlocked(spot);
}

// LE TITRE QU'UN LIEU ATTEND (lot 3) : l'index du titre (MAISON_RANKS) qui l'ouvre, ou
// null s'il est ouvert. Le salon (la roulette) attend Familier ; le boudoir, Mécène.
export function spotRankLock(spot) {
  if (!spot) return null;
  if (spot.kind === "roulette" && !rouletteUnlocked()) return ROULETTE_UNLOCK_RANK;
  if (spot.id === "boudoir" && maisonRank() < BOUDOIR_UNLOCK_RANK) return BOUDOIR_UNLOCK_RANK;
  return null;
}

// Un lieu qu'on regarde ET dont on a le titre : on peut s'y rendre.
export function spotCanVisit(spot) {
  return spotIsVisit(spot) && spotRankLock(spot) == null;
}

// Les lieux qui prennent le CADRE ENTIER au lieu de s'ouvrir en panneau posé sur
// l'illustration. Le menu volant, lui, survit dans les deux cas : c'est ce qui
// évite de sortir de la Maison des Plaisirs sans l'avoir voulu.
export function spotIsFullFrame(spot) {
  return !!(spot && spot.view);
}
