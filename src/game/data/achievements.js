"use strict";

// LES SUCCÈS (audit 2026-10-05, STEAM-9, décision de Raph : « beaucoup de succès qui
// accompagnent la progression du joueur »). MODULE PUR, sans aucun import : la liste
// sert au jeu (src/game/core/achievements.js, qui évalue les conditions), à
// l'interface, et à l'export pour le site Steamworks (achievementsExport.js,
// scripts/exportSteamAchievements.mjs → docs/steam/succes.json et .csv).
//
// Une entrée :
//   id      le NOM D'API Steam (majuscules, chiffres, « _ ») — FIGÉ une fois publié :
//           le renommer ferait perdre le succès à ceux qui l'ont déjà
//   group   la famille (ACHIEVEMENT_GROUPS), pour ranger la liste
//   name    { fr, en } le titre, dans le ton du jeu
//   desc    { fr, en } la condition, dite simplement (c'est ce que Steam affiche)
//   secret  caché sur Steam et dans le jeu tant qu'il n'est pas débloqué
//   need    la condition des FAMILLES (ère, effondrements, sceau, Mythe) ; sans
//           `need`, la condition est écrite à la main dans core/achievements.js
//
// Les seuils des familles vivent ICI, à côté du texte qui les annonce : un seuil
// changé sans son texte se voit dans le même diff.

export const ACHIEVEMENT_GROUPS = [
  { id: "eres", label: { fr: "Les ères", en: "Eras" } },
  { id: "chutes", label: { fr: "Les chutes", en: "Falls" } },
  { id: "cite", label: { fr: "La cité", en: "The City" } },
  { id: "sceaux", label: { fr: "Les sceaux", en: "The Seals" } },
  { id: "mythes", label: { fr: "Les Mythes", en: "The Myths" } },
  { id: "maison", label: { fr: "La Maison des Plaisirs", en: "The House of Pleasures" } },
  { id: "faits-divers", label: { fr: "Faits divers", en: "Local Tales" } },
  { id: "chronique", label: { fr: "La Chronique", en: "The Chronicle" } }
];

// ── Les ères : `need.era` = palier d'ère (eraTier, data/world.js) — l'index pour
// les ères 0-34, 35+ pour les paliers majeurs transcendants (les ères « factices »
// intercalées ne comptent pas).
const ERES = [
  { id: "ERE_HAMEAU", era: 5,
    name: { fr: "Les premiers sentiers", en: "The First Trails" },
    desc: { fr: "Atteindre l'ère du Hameau.", en: "Reach the Hamlet era." } },
  { id: "ERE_VILLAGE", era: 7,
    name: { fr: "La terre partagée", en: "The Divided Land" },
    desc: { fr: "Atteindre l'ère du Village.", en: "Reach the Village era." } },
  { id: "ERE_BOURG_MARCHAND", era: 11,
    name: { fr: "L'or et l'étranger", en: "Gold and the Stranger" },
    desc: { fr: "Atteindre l'ère du Bourg marchand.", en: "Reach the Market Town era." } },
  { id: "ERE_CITE_FORTIFIEE", era: 15,
    name: { fr: "Inventer l'ennemi", en: "Inventing the Enemy" },
    desc: { fr: "Atteindre l'ère de la Cité fortifiée.", en: "Reach the Fortified City era." } },
  { id: "ERE_ROYAUME", era: 19,
    name: { fr: "Un sceptre pour les provinces", en: "One Scepter for the Provinces" },
    desc: { fr: "Atteindre l'ère du Royaume.", en: "Reach the Kingdom era." } },
  { id: "ERE_EMPIRE", era: 25,
    name: { fr: "Au bord de sa propre chute", en: "On the Brink of Its Own Fall" },
    desc: { fr: "Atteindre l'ère de l'Empire.", en: "Reach the Empire era." } },
  { id: "ERE_METROPOLE", era: 29,
    name: { fr: "Une mer humaine", en: "A Human Sea" },
    desc: { fr: "Atteindre l'ère de la Métropole.", en: "Reach the Metropolis era." } },
  { id: "ERE_SINGULARITE", era: 34,
    name: { fr: "Le titan de métal", en: "The Titan of Metal" },
    desc: { fr: "Atteindre l'ère de la Singularité.", en: "Reach the Singularity era." } },
  { id: "ERE_CONSCIENCE", era: 35,
    name: { fr: "La cité devenue monde", en: "The City Became the World" },
    desc: { fr: "Atteindre l'ère de la Conscience planétaire.", en: "Reach the Planetary Consciousness era." } },
  { id: "ERE_DYSON", era: 38,
    name: { fr: "Pas un photon perdu", en: "Not a Photon Wasted" },
    desc: { fr: "Atteindre l'ère de la Sphère de Dyson.", en: "Reach the Dyson Sphere era." } }
].map(({ era, ...a }) => ({ ...a, group: "eres", need: { era } }));

// ── Les effondrements, à VIE (chronicleStats.collapses : ni le Grand Reset ni le
// cycle ne les remettent à zéro).
const CHUTES = [
  { id: "CHUTE_PREMIERE", collapses: 1,
    name: { fr: "Tout ce qui s'élève", en: "All That Rises" },
    desc: { fr: "Traverser un premier effondrement.", en: "Live through a first collapse." } },
  { id: "CHUTE_10", collapses: 10,
    name: { fr: "Le pli de l'histoire", en: "The Fold of History" },
    desc: { fr: "Traverser 10 effondrements.", en: "Live through 10 collapses." } },
  { id: "CHUTE_50", collapses: 50,
    name: { fr: "Mémoire des cendres", en: "Memory of Ashes" },
    desc: { fr: "Traverser 50 effondrements.", en: "Live through 50 collapses." } },
  { id: "CHUTE_100", collapses: 100,
    name: { fr: "Cent fois sur le métier", en: "A Hundred Times Over" },
    desc: { fr: "Traverser 100 effondrements.", en: "Live through 100 collapses." } },
  { id: "CHUTE_250", collapses: 250,
    name: { fr: "L'éternel retour", en: "The Eternal Return" },
    desc: { fr: "Traverser 250 effondrements.", en: "Live through 250 collapses." } }
].map(({ collapses, ...a }) => ({ ...a, group: "chutes", need: { collapses } }));

const CHUTES_AUTRES = [
  { id: "CYCLE_UNE_HEURE", group: "chutes",
    name: { fr: "Tenir debout", en: "Still Standing" },
    desc: { fr: "Faire tenir une civilisation une heure avant sa chute.", en: "Keep a civilization standing for an hour before it falls." } },
  { id: "CRISES_TROIS", group: "chutes",
    name: { fr: "Trois fois sauvée", en: "Saved Three Times" },
    desc: { fr: "Stabiliser les trois crises d'un même cycle.", en: "Stabilize all three crises of a single cycle." } },
  { id: "VOEU_TENU", group: "chutes",
    name: { fr: "Parole tenue", en: "A Promise Kept" },
    desc: { fr: "Accomplir le vœu d'un cycle.", en: "Fulfill a cycle's vow." } },
  { id: "TESTAMENT", group: "chutes",
    name: { fr: "Les dernières volontés", en: "Last Wishes" },
    desc: { fr: "Graver un testament pour les cités à venir.", en: "Engrave a testament for the cities to come." } }
];

// ── La cité : Ruines, arbre des Ruines, Rayonnement, merveilles, nom.
const CITE = [
  { id: "RUINES_CENT",
    name: { fr: "Bonne moisson", en: "A Fine Harvest" },
    desc: { fr: "Récolter 100 Ruines en un seul effondrement.", en: "Harvest 100 Ruins in a single collapse." } },
  { id: "RUINES_MILLION",
    name: { fr: "Un champ de ruines", en: "A Field of Ruins" },
    desc: { fr: "Récolter un million de Ruines en un seul effondrement.", en: "Harvest a million Ruins in a single collapse." } },
  { id: "RUINES_BILLIARD",
    name: { fr: "Des décombres à perte de vue", en: "Rubble as Far as the Eye Can See" },
    desc: { fr: "Récolter un million de milliards de Ruines en un seul effondrement.", en: "Harvest a quadrillion Ruins in a single collapse." } },
  { id: "ARBRE_RACINE",
    name: { fr: "Une première racine", en: "A First Root" },
    desc: { fr: "Acquérir un premier nœud de l'arbre des Ruines.", en: "Acquire a first node of the Tree of Ruins." } },
  { id: "ARBRE_COURONNE",
    name: { fr: "Couronner une branche", en: "Crowning a Branch" },
    desc: { fr: "Acquérir la couronne d'une branche de l'arbre des Ruines.", en: "Acquire the crown of a branch of the Tree of Ruins." } },
  { id: "RAYONNEMENT_GOGOL",
    name: { fr: "Un gogol", en: "A Googol" },
    desc: { fr: "Porter le Rayonnement à un gogol (10^100).", en: "Raise Radiance to a googol (10^100)." } },
  { id: "MERVEILLE_PREMIERE",
    name: { fr: "La pierre se souvient", en: "Stone Remembers" },
    desc: { fr: "Ériger une première merveille.", en: "Erect a first wonder." } },
  { id: "MERVEILLES_TOUTES",
    name: { fr: "Les six merveilles", en: "The Six Wonders" },
    desc: { fr: "Ériger les six merveilles.", en: "Erect all six wonders." } },
  { id: "MERVEILLE_RANG_V",
    name: { fr: "Le faîte de la pierre", en: "The Summit of Stone" },
    desc: { fr: "Élever une merveille à son cinquième rang.", en: "Raise a wonder to its fifth rank." } },
  { id: "CITE_BAPTISEE",
    name: { fr: "Un nom pour la cité", en: "A Name for the City" },
    desc: { fr: "Donner soi-même son nom à la cité.", en: "Name the city yourself." } }
].map((a) => ({ ...a, group: "cite" }));

// ── Les sceaux du Grand Reset, RÉCLAMÉS (grClaimed). Noms = ceux des sceaux
// (mechanics/grandResetMilestones.js ; un test les tient égaux). Cachés : le jeu
// masque un sceau (« ??? ») tant qu'il n'est pas découvert.
const SCEAUX = [
  { gr: 1, name: { fr: "Le Premier Crépuscule", en: "The First Dusk" },
    desc: { fr: "Réclamer le sceau I : traverser 10 effondrements.", en: "Claim Seal I: live through 10 collapses." } },
  { gr: 2, name: { fr: "La Première Merveille", en: "The First Wonder" },
    desc: { fr: "Réclamer le sceau II : ériger 3 merveilles.", en: "Claim Seal II: erect 3 wonders." } },
  { gr: 3, name: { fr: "Premier Pacte Mythique", en: "First Mythic Pact" },
    desc: { fr: "Réclamer le sceau III : accomplir un premier Mythe.", en: "Claim Seal III: complete a first Myth." } },
  { gr: 4, name: { fr: "La Colonne du Million", en: "The Column of the Million" },
    desc: { fr: "Réclamer le sceau IV : porter le Rayonnement au seuil du sceau.", en: "Claim Seal IV: raise Radiance to the seal's threshold." } },
  { gr: 5, name: { fr: "L'Olympe se prononce", en: "Olympus Speaks" },
    desc: { fr: "Réclamer le sceau V : obtenir le verdict de l'Olympe.", en: "Claim Seal V: receive the verdict of Olympus." } },
  { gr: 6, name: { fr: "Acte I : La Fondation Scellée", en: "Act I: The Foundation Sealed" },
    desc: { fr: "Réclamer le sceau VI : accomplir 5 Mythes.", en: "Claim Seal VI: complete 5 Myths." } },
  { gr: 7, name: { fr: "Le Jackpot d'Icare", en: "Icarus's Jackpot" },
    desc: { fr: "Réclamer le sceau VII : se poser à ×25 ou plus au vol d'Icare, sur une grosse mise.", en: "Claim Seal VII: land at ×25 or more on Icarus's flight, on a big stake." } },
  { gr: 8, name: { fr: "Acte II : La Domination Scellée", en: "Act II: Dominion Sealed" },
    desc: { fr: "Réclamer le sceau VIII : accomplir 8 Mythes.", en: "Claim Seal VIII: complete 8 Myths." } },
  { gr: 9, name: { fr: "Les Couronnes Jumelles", en: "The Twin Crowns" },
    desc: { fr: "Réclamer le sceau IX : acquérir les 4 couronnes de l'arbre des Ruines.", en: "Claim Seal IX: acquire the 4 crowns of the Tree of Ruins." } },
  { gr: 10, name: { fr: "Au-delà de la Singularité", en: "Beyond the Singularity" },
    desc: { fr: "Réclamer le sceau X : franchir l'ère du sceau, au-delà de la Singularité.", en: "Claim Seal X: cross the seal's era, beyond the Singularity." } },
  { gr: 11, name: { fr: "Sous le Regard du Ragnarök", en: "Under Ragnarök's Gaze" },
    desc: { fr: "Réclamer le sceau XI : accomplir les 14 Mythes, Ragnarök compris.", en: "Claim Seal XI: complete all 14 Myths, Ragnarök included." } }
].map(({ gr, name, desc }) => ({ id: `SCEAU_${["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"][gr - 1]}`, group: "sceaux", name, desc, secret: true, need: { seal: gr } }));

const SCEAUX_TOUS = {
  id: "SCEAUX_TOUS", group: "sceaux", need: { seals: 11 },
  name: { fr: "Le livre scellé", en: "The Sealed Book" },
  desc: { fr: "Réclamer les onze sceaux du Grand Reset.", en: "Claim all eleven Grand Reset seals." }
};

// ── Les Mythes accomplis (mythsCompleted), à vie. Ids = data/myths.js (un test
// les tient égaux). Le Ragnarök est caché tant que son pacte ne s'est pas ouvert.
const MYTHES = [
  { myth: "mythe_du_chaos", id: "MYTHE_CHAOS",
    name: { fr: "Né du néant", en: "Born of the Void" },
    desc: { fr: "Accomplir le Mythe du Chaos.", en: "Complete the Myth of Chaos." } },
  { myth: "mythe_de_promethee", id: "MYTHE_PROMETHEE",
    name: { fr: "Le feu volé", en: "The Stolen Fire" },
    desc: { fr: "Accomplir le Mythe de Prométhée.", en: "Complete the Myth of Prometheus." } },
  { myth: "mythe_d_enee", id: "MYTHE_ENEE",
    name: { fr: "La migration fondatrice", en: "The Founding Migration" },
    desc: { fr: "Accomplir le Mythe d'Énée.", en: "Complete the Myth of Aeneas." } },
  { myth: "mythe_de_cadmos", id: "MYTHE_CADMOS",
    name: { fr: "Les noms de pouvoir", en: "Names of Power" },
    desc: { fr: "Accomplir le Mythe de Cadmos.", en: "Complete the Myth of Cadmus." } },
  { myth: "mythe_d_hephaistos", id: "MYTHE_HEPHAISTOS",
    name: { fr: "La forge des automates", en: "The Forge of Automatons" },
    desc: { fr: "Accomplir le Mythe d'Héphaïstos.", en: "Complete the Myth of Hephaestus." } },
  { myth: "mythe_de_sisyphe", id: "MYTHE_SISYPHE",
    name: { fr: "Le rocher au sommet", en: "The Boulder at the Summit" },
    desc: { fr: "Accomplir le Mythe de Sisyphe.", en: "Complete the Myth of Sisyphus." } },
  { myth: "mythe_de_babel", id: "MYTHE_BABEL",
    name: { fr: "La langue commune", en: "The Common Tongue" },
    desc: { fr: "Accomplir le Mythe de Babel.", en: "Complete the Myth of Babel." } },
  { myth: "mythe_age_or", id: "MYTHE_AGE_OR",
    name: { fr: "Les caravanes", en: "The Caravans" },
    desc: { fr: "Accomplir le Mythe de l'Âge d'Or.", en: "Complete the Myth of the Golden Age." } },
  { myth: "mythe_d_atlas", id: "MYTHE_ATLAS",
    name: { fr: "Porter le ciel", en: "Bearing the Sky" },
    desc: { fr: "Accomplir le Mythe d'Atlas.", en: "Complete the Myth of Atlas." } },
  { myth: "mythe_d_icare", id: "MYTHE_ICARE",
    name: { fr: "Les ailes de cire", en: "Wings of Wax" },
    desc: { fr: "Accomplir le Mythe d'Icare.", en: "Complete the Myth of Icarus." } },
  { myth: "mythe_du_phenix", id: "MYTHE_PHENIX",
    name: { fr: "Trois fois renaître", en: "Reborn Three Times" },
    desc: { fr: "Accomplir le Mythe du Phénix.", en: "Complete the Myth of the Phoenix." } },
  { myth: "mythe_atrides", id: "MYTHE_ATRIDES",
    name: { fr: "La dette payée", en: "The Debt Repaid" },
    desc: { fr: "Accomplir le Mythe des Atrides.", en: "Complete the Myth of the Atreides." } },
  { myth: "mythe_d_antee", id: "MYTHE_ANTEE",
    name: { fr: "Le géant et la terre", en: "The Giant and the Earth" },
    desc: { fr: "Accomplir le Mythe d'Antée.", en: "Complete the Myth of Antaeus." } },
  { myth: "mythe_du_ragnarok", id: "MYTHE_RAGNAROK", secret: true,
    name: { fr: "Le crépuscule des dieux", en: "Twilight of the Gods" },
    desc: { fr: "Achever l'Arche et conjurer le Ragnarök.", en: "Complete the Ark and ward off Ragnarök." } }
].map(({ myth, ...a }) => ({ ...a, group: "mythes", need: { myth } }));

const MYTHES_AUTRES = [
  { id: "CIEL_TOMBE", group: "mythes", secret: true,
    name: { fr: "Le ciel est tombé", en: "The Sky Fell" },
    desc: { fr: "Laisser le ciel d'Atlas écraser la cité.", en: "Let Atlas's sky crush the city." } }
];

// ── La Maison des Plaisirs (registre de la Chronique, chronicleStats.games ; rang
// de la Maison ; Nuits du Grand Jeu).
const MAISON = [
  { id: "OSSELETS_VENUS",
    name: { fr: "Coup de Vénus", en: "Venus Throw" },
    desc: { fr: "Tirer un coup de Vénus aux osselets.", en: "Roll a Venus throw at knucklebones." } },
  { id: "OSSELETS_CHIEN", secret: true,
    name: { fr: "Le coup du Chien", en: "The Dog Throw" },
    desc: { fr: "Tirer le coup du Chien aux osselets.", en: "Roll the Dog throw at knucklebones." } },
  { id: "ICARE_X10",
    name: { fr: "Plus près du soleil", en: "Closer to the Sun" },
    desc: { fr: "Se poser à ×10 ou plus au vol d'Icare.", en: "Land at ×10 or more on Icarus's flight." } },
  { id: "GRATTEUX_SOLEIL",
    name: { fr: "Un soleil sous la cire", en: "A Sun Beneath the Wax" },
    desc: { fr: "Gratter un soleil sur un ticket.", en: "Scratch a sun on a ticket." } },
  { id: "VINGTETUN_NATUREL",
    name: { fr: "Vingt-et-un d'entrée", en: "A Natural Twenty-One" },
    desc: { fr: "Être servi d'un vingt-et-un naturel.", en: "Be dealt a natural twenty-one." } },
  { id: "VINGTETUN_SERIE",
    name: { fr: "La voix de l'oracle", en: "The Oracle's Voice" },
    desc: { fr: "Gagner 5 mains de suite au vingt-et-un.", en: "Win 5 hands in a row at twenty-one." } },
  { id: "VIDEUR", secret: true,
    name: { fr: "Raccompagné à la porte", en: "Shown the Door" },
    desc: { fr: "Se faire sortir du vingt-et-un par le videur.", en: "Get thrown out of twenty-one by the bouncer." } },
  { id: "MACHINE_HOLD",
    name: { fr: "Tenir et gagner", en: "Hold and Win" },
    desc: { fr: "Déclencher le Hold & Win à la machine à sous.", en: "Trigger the Hold & Win on the slot machine." } },
  { id: "MACHINE_JACKPOT",
    name: { fr: "Le gros lot", en: "The Big One" },
    desc: { fr: "Rafler un jackpot à la machine à sous.", en: "Rake in a jackpot on the slot machine." } },
  { id: "DUEL_GAGNE",
    name: { fr: "Le flambeur à terre", en: "The High Roller Falls" },
    desc: { fr: "Gagner un duel contre le grand flambeur.", en: "Win a duel against the high roller." } },
  { id: "COURSE_OUTSIDER",
    name: { fr: "Le tocard", en: "The Long Shot" },
    desc: { fr: "Gagner une course sur un outsider coté à 10 contre 1 ou plus.", en: "Win a race on an outsider at odds of 10 to 1 or longer." } },
  { id: "ROUE_MAISON",
    name: { fr: "La roue tourne", en: "The Wheel Turns" },
    desc: { fr: "Prendre un tour de la roue de la Maison.", en: "Take a spin of the House wheel." } },
  { id: "NUIT_GRAND_JEU",
    name: { fr: "La Nuit du Grand Jeu", en: "The Night of High Play" },
    desc: { fr: "Vivre une Nuit du Grand Jeu.", en: "Live through a Night of High Play." } },
  { id: "MAISON_FAMILIER",
    name: { fr: "Un visage familier", en: "A Familiar Face" },
    desc: { fr: "Devenir Familier de la Maison.", en: "Become a Familiar face of the House." } },
  { id: "MAISON_MECENE",
    name: { fr: "Mécène", en: "Patron" },
    desc: { fr: "Devenir Mécène de la Maison.", en: "Become a Patron of the House." } },
  { id: "MAISON_PRINCE",
    name: { fr: "Prince de la Maison", en: "Prince of the House" },
    desc: { fr: "Atteindre le plus haut titre de la Maison.", en: "Reach the highest title of the House." } }
].map((a) => ({ ...a, group: "maison" }));

// ── Les faits divers de la carte (state.faitsDivers).
const FAITS_DIVERS = [
  { id: "FD_PREMIER",
    name: { fr: "Ça s'est passé près de chez vous", en: "It Happened Around the Corner" },
    desc: { fr: "Surprendre un premier fait divers dans les rues.", en: "Witness a first local tale in the streets." } },
  { id: "FD_HISTOIRE",
    name: { fr: "Le fin mot de l'histoire", en: "The End of the Story" },
    desc: { fr: "Suivre un feuilleton des rues jusqu'à son dernier chapitre.", en: "Follow a street serial to its last chapter." } },
  { id: "FD_TOUTES",
    name: { fr: "La gazette des rues", en: "The Street Gazette" },
    desc: { fr: "Suivre tous les feuilletons des rues jusqu'au bout.", en: "Follow every street serial to the end." } },
  { id: "FD_CURIOSITES",
    name: { fr: "Le badaud", en: "The Onlooker" },
    desc: { fr: "Remarquer toutes les curiosités de la ville.", en: "Notice every curiosity in town." } },
  { id: "FD_AMOUREUX", secret: true,
    name: { fr: "Le ruban recousu", en: "The Ribbon Mended" },
    desc: { fr: "Mener Nancy et William jusqu'à leur mariage.", en: "See Nancy and William through to their wedding." } }
].map((a) => ({ ...a, group: "faits-divers" }));

// ── La Chronique : le temps de jeu à vie (chronicleStats.lifetimePlaySec).
const CHRONIQUE = [
  { id: "TEMPS_UNE_HEURE",
    name: { fr: "Une heure d'histoire", en: "An Hour of History" },
    desc: { fr: "Jouer une heure.", en: "Play for an hour." } },
  { id: "TEMPS_DIX_HEURES",
    name: { fr: "Le chroniqueur", en: "The Chronicler" },
    desc: { fr: "Jouer dix heures.", en: "Play for ten hours." } },
  { id: "TEMPS_CENT_HEURES",
    name: { fr: "La mémoire des âges", en: "The Memory of the Ages" },
    desc: { fr: "Jouer cent heures.", en: "Play for a hundred hours." } }
].map((a) => ({ ...a, group: "chronique" }));

// L'ORDRE de la liste est celui de l'affichage (par famille, du plus tôt au plus
// tard dans une partie) et celui de l'export Steamworks.
export const ACHIEVEMENTS = [
  ...ERES,
  ...CHUTES,
  ...CHUTES_AUTRES,
  ...CITE,
  ...SCEAUX,
  SCEAUX_TOUS,
  ...MYTHES,
  ...MYTHES_AUTRES,
  ...MAISON,
  ...FAITS_DIVERS,
  ...CHRONIQUE
].map((a) => Object.freeze({ secret: false, ...a }));

export const ACHIEVEMENT_BY_ID = Object.freeze(Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])));

// Forme d'un nom d'API accepté (Steam : lettres, chiffres, « _ ») — partagée avec
// la normalisation de la sauvegarde (state.js) et le pont Steam (desktopFiles.cjs).
export const ACHIEVEMENT_ID_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
