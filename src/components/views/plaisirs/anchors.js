"use strict";

// Les lieux cliquables de la Maison des Plaisirs.
//
// Même patron que l'Arbre des Ruines (views/ruinsTree/anchors.js) : les
// coordonnées sont en PIXELS SOURCE de l'illustration, jamais en pixels
// d'écran. La vue met l'image à l'échelle, les points suivent — sinon tout
// serait à recaler au premier changement de taille d'affichage.
//
// CALIBRAGE : `window.__plaisirsAnchors = true` en console, puis chaque clic
// sur l'illustration journalise ses coordonnées source. C'est la seule façon
// raisonnable de poser des points chauds ; à la main on vise à l'aveugle.

// Illustration de Raph (Midjourney, repixelisée par ses soins).
//
// Deux de mes planches ont été écartées avant elle, et la seconde pour une
// raison de FOND : je l'avais demandée « interior » avec un plafond à caissons,
// donc une salle CLOSE. Or le lieu est une tour à plateaux OUVERTS plantée dans
// l'eau — il ne peut pas y avoir de plafond. Le hub doit rester à ciel ouvert,
// sur la nuit et le fleuve.
//
// ⚠ Le fichier livré s'appelait « interieur polaisir.png » : renommé, un espace
// dans un chemin d'asset finit toujours par se payer en %20 quelque part.
export const PLAISIRS_ART = {
  src: "/pixelart/ui/plaisirs/salle.png",
  w: 397,   // dimensions SOURCE — la vue met à l'échelle, les ancres suivent
  h: 216
};

// Rayon PAR DÉFAUT de la zone cliquable, en pixels source ; chaque lieu peut le
// surcharger par son `r`. Généreux : un point chaud trop serré se rate à la
// souris et devient inatteignable au doigt sur mobile.
// ⚠ Le rayon suit la PROFONDEUR : la roue du fond est petite à l'écran, lui
// donner le rayon de la table du premier plan ferait déborder sa zone sur ses
// voisines, et le joueur cliquerait la roue en visant la loterie.
export const HOTSPOT_R = 46;
export const spotRadius = (spot) => (spot && spot.r) || HOTSPOT_R;

// `kind` est celui que templeGames.js attend déjà (RegulationStage/STAGES) :
// cliquer un lieu ouvre le jeu correspondant, aucun gameplay à réécrire.
//
// Positions relevées sur la planche. Les lieux sont ÉTAGÉS EN PROFONDEUR, pas
// alignés : d'où des rayons différents plus bas, un lieu du fond occupant moins
// de place à l'écran qu'un lieu du premier plan.
// ⚠ À affiner au calibrage en jeu (`window.__plaisirsAnchors`) : ces valeurs
// sont lues sur la planche, pas pointées à la souris.
// Coordonnées CALIBRÉES en jeu par Raph (2026-08-07), pas estimées.
//
// Icare est monté dans le CIEL, et c'est plus juste que la roue de fortune où je
// l'avais mis : on ne mise pas sur un vol en tournant une roue, on lève les yeux.
// La roue reparaîtra plus tard, avec son propre jeu.
export const PLAISIRS_SPOTS = [
  // Osselets et vingt et un ÉCHANGÉS (Raph, 2026-08-07).
  { id: "des",     kind: "augury",    label: "Les osselets",   x: 72,  y: 157, r: 30 }, // grande table, premier plan
  { id: "cartes",  kind: "blackjack", label: "Le vingt et un", x: 134, y: 143, r: 26 }, // table du fond
  { id: "icare",   kind: "icarus",    label: "Le vol d'Icare", x: 185, y: 29,  r: 26 }, // dans le CIEL
  // LA SCÈNE. Inerte pour l'instant : elle accueillera les instruments de
  // musique. ⚠ J'avais pris ce lieu pour l'échoppe — l'échoppe visible sur
  // l'illustration est celle des tickets, celle-ci est bien la scène.
  { id: "scene",   kind: null,        label: "La scène",       x: 300, y: 128, r: 30 },
  // L'ÉCHOPPE porte DEUX usages : on y achète (la boutique) et on y prend un
  // ticket. Les deux partagent donc la MÊME ancre (Raph, 2026-08-07).
  //
  // ⚠ Deux zones superposées, une seule peut recevoir le clic : c'est la
  // DERNIÈRE de cette liste qui est peinte par-dessus, donc elle qui gagne. Les
  // tickets passent en dernier volontairement — la boutique, elle, garde deux
  // autres chemins (son propre onglet et le menu volant), alors que les tickets
  // n'ont que ce lieu.
  { id: "boutique", view: "tech",     label: "L'échoppe",      x: 221, y: 123, r: 24 },
  { id: "tickets", kind: "scratch",   label: "Les tickets",    x: 221, y: 123, r: 24 }
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
  boutique: "Entrer"
};
export const spotVerbe = (spot) => (spot && SPOT_VERBES[spot.id]) || "Ouvrir";

// Un lieu est actif s'il ouvre QUELQUE CHOSE : un jeu (`kind`) ou une vue
// (`view`). Un lieu sans l'un ni l'autre reste dessiné et inerte — mieux vaut ça
// qu'un panneau vide qui s'ouvre sur rien. C'était le cas de la scène, faute de
// banque de sons (le vrai coût de la musique est le SON, pas l'art).
export function spotIsOpen(spot) {
  return !!(spot && (spot.kind || spot.view));
}

// Les lieux qui prennent le CADRE ENTIER au lieu de s'ouvrir en panneau posé sur
// l'illustration. Le menu volant, lui, survit dans les deux cas : c'est ce qui
// évite de sortir de la Maison des Plaisirs sans l'avoir voulu.
export function spotIsFullFrame(spot) {
  return !!(spot && spot.view);
}

// Un lieu sans ancre n'est PAS dessiné sur l'illustration : il n'existe que dans
// le menu. Sans ce filtre, `x: null` poserait une zone cliquable dans le coin
// haut gauche du cadre, invisible et pourtant active.
export function spotHasAnchor(spot) {
  return !!spot && Number.isFinite(spot.x) && Number.isFinite(spot.y);
}
