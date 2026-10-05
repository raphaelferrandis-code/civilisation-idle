"use strict";

import { blackjackUnlocked } from "../../../game/core/actions/blackjack.js";
import { icarusUnlocked } from "../../../game/core/actions/icarus.js";
import { scratchUnlocked } from "../../../game/core/actions/scratch.js";
import { slotsUnlocked } from "../../../game/core/actions/slots.js";
import { rouletteUnlocked, rouletteVipUnlocked } from "../../../game/core/actions/roulette.js";
import { coursesUnlocked } from "../../../game/core/actions/courses.js";
import { duelOuvert } from "../../../game/core/actions/duel.js";
import { maisonRank } from "../../../game/core/actions/maisonTable.js";
import { videurBarre } from "../../../game/core/actions/videur.js";
import { BOUDOIR_UNLOCK_RANK, ROULETTE_UNLOCK_RANK, COURSES_UNLOCK_RANK } from "../../../game/core/balance.js";
import { regulationActionUnlocked } from "../../../game/core/mechanics/crisis-cost.js";
import { REGULATION_ACTIONS } from "../../../game/data/regulationActions.js";
import { state } from "../../../game/core/state.js";
import { tr } from "../../../game/core/i18n.js";

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
//
// Les noms sont BILINGUES (audit du 05/10, I18N-5) et se lisent par spotNom() : le
// menu entier restait en français dans la version anglaise. Les `id` restent les
// clés — aucune logique ne lit un nom.
export const PLAISIRS_SPOTS = [
  { id: "des",     kind: "augury",    label: { fr: "Les osselets", en: "Knucklebones" } },
  { id: "cartes",  kind: "blackjack", label: { fr: "Le vingt-et-un", en: "Twenty-one" } },
  { id: "icare",   kind: "icarus",    label: { fr: "Le vol d'Icare", en: "Icarus's flight" } },
  { id: "tickets", kind: "scratch",   label: { fr: "Les tickets", en: "Scratch tickets" } },
  // La machine à sous (2026-10-03) : sa salle n'existe qu'à partir de la Fonte.
  { id: "machines", kind: "slots",    label: { fr: "Les machines", en: "Slot machines" } },
  // Le nom suit celui de l'ONGLET (« Boutique » / « Shop ») : c'est la même destination.
  { id: "boutique", view: "tech",     label: { fr: "La boutique", en: "The shop" } },
  // LES LIEUX QU'ON REGARDE : ni jeu ni vue, mais la coupe les dessine et ils
  // vivent (la troupe danse sur la scène, les ombres bougent derrière la tenture
  // du boudoir). Les choisir fait défiler la coupe jusqu'à eux, sans bouton
  // d'action (`spotIsVisit`).
  { id: "scene",   kind: null,        label: { fr: "La scène", en: "The stage" } },
  // LE BOUDOIR est le SALON PRIVÉ (Raph, 2026-10-04 : « salon privé sans limite ») : la
  // roulette sans plafond de mise, au titre de Mécène (spotRankLock). Même `id` que sa
  // salle dans la coupe.
  // Le menu garde le nom de la SALLE (« Le salon privé » est la plaque de la table) :
  // il tient sur sa ligne, cadenas compris.
  { id: "boudoir", kind: "rouletteVip", label: { fr: "Le boudoir", en: "The boudoir" } },
  // LE SALON est la salle de la ROULETTE (lot 3, Raph 2026-10-04) : il s'ouvre au titre
  // de Familier. Même `id` que sa salle dans la coupe.
  { id: "salon",   kind: "roulette",  label: { fr: "La roulette", en: "Roulette" } },
  // LES COURSES et LE GRAND FLAMBEUR (2026-10-04, docs/PLAN-NUIT-DES-PLAISIRS.md) : pas
  // de salle à eux dans la coupe — le menu les range au rez-de-chaussée. Les courses
  // s'ouvrent au Notable ; le flambeur pendant la Nuit du Grand Jeu (ou pour un Prince).
  { id: "courses", kind: "courses",   label: { fr: "Les courses", en: "The races" } },
  { id: "flambeur", kind: "duel",     label: { fr: "Le grand flambeur", en: "The high roller" } }
];

// Le nom d'un lieu dans la langue du joueur.
export const spotNom = (spot) => (spot ? tr(spot.label) : "");

// Le VERBE de chaque lieu — celui du bouton qui apparaît sur l'illustration une
// fois le lieu choisi. Repris mot pour mot des boutons existants du Temple
// (Jeter, Gratter, Jouer, Voler) : le joueur les connaît déjà, en inventer de
// nouveaux lui ferait réapprendre ce qu'il sait.
//
// Table à part plutôt qu'un champ de plus par lieu : les coordonnées se
// recalibrent souvent, et mêler du texte à des nombres qu'on édite à la main
// est le meilleur moyen d'en casser un.
// Bilingue comme les noms (I18N-5) : l'anglais reprend les boutons des tables
// (« Cast », « Pull », « Challenge »…).
export const SPOT_VERBES = {
  des: { fr: "Jeter", en: "Cast" },
  cartes: { fr: "Jouer", en: "Play" },
  tickets: { fr: "Gratter", en: "Scratch" },
  icare: { fr: "Voler", en: "Fly" },
  machines: { fr: "Tirer", en: "Pull" },
  boutique: { fr: "Entrer", en: "Enter" },
  scene: { fr: "Écouter", en: "Listen" },
  boudoir: { fr: "Miser", en: "Bet" },
  salon: { fr: "Miser", en: "Bet" },
  courses: { fr: "Parier", en: "Wager" },
  flambeur: { fr: "Défier", en: "Challenge" }
};
export const spotVerbe = (spot) => tr((spot && SPOT_VERBES[spot.id]) || { fr: "Ouvrir", en: "Open" });

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
  if (spot.kind === "courses") return coursesUnlocked();
  if (spot.kind === "duel") return duelOuvert();
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
  if (spot.id === "boudoir" && !rouletteVipUnlocked()) return BOUDOIR_UNLOCK_RANK;
  if (spot.kind === "courses" && !coursesUnlocked()) return COURSES_UNLOCK_RANK;
  return null;
}

// Le lieu qui attend LA NUIT (le grand flambeur) : fermé hors de la Nuit du Grand Jeu,
// sauf pour un Prince de la Maison.
export function spotNightLock(spot) {
  return !!spot && spot.kind === "duel" && !duelOuvert();
}

// CE QUE LA COUPE MONTRE OUVERT (2026-10-04) : les lieux ACQUIS, sans ce que la Nuit
// du Grand Jeu ouvre pour vingt minutes. La coupe se recuit à chaque changement de
// cette liste, et une cuisson fige la page plusieurs secondes : la Nuit n'en
// déclenche aucune (le menu, lui, suit spotIsOpen et ouvre bien ses portes). Les
// courses et le flambeur n'ont pas de salle : jamais dans la liste.
export function spotOuvertSalle(spot) {
  if (!spot) return false;
  if (spot.kind === "courses" || spot.kind === "duel") return false;
  if (spot.kind === "roulette") return maisonRank() >= ROULETTE_UNLOCK_RANK;
  if (spot.kind === "rouletteVip") return maisonRank() >= BOUDOIR_UNLOCK_RANK;
  return spotIsOpen(spot);
}

// La table que le VIDEUR a fermée au joueur (le vingt-et-un, lot 4) : les
// automatisations y jouent toujours, la coupe ne change pas.
export function spotVideurLock(spot) {
  return !!spot && spot.kind === "blackjack" && videurBarre();
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
