"use strict";

import { effects } from './worldEffects.js';
import { D } from '../core/num.js';
import { tr, localizeData } from '../core/i18n.js';
import { CRISIS_TREAT_SHIFT, CRISIS_PROFIT_SHIFT, CRISIS_PROFIT_PREP, COLLAPSE_PREP_MAX } from '../core/balance.js';

/* ============================================================================
 * data-world.js - Donnees monde: eras, CRISIS_POOL, CRISIS_EVENTS.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

// Pente des ères TRANSCENDANTES (n ≥ 35). Calibrée par scratch/sim-era-design.js
// (overlay sur la trajectoire réelle du plafond) : log10(seuil) = 35 + a·k + b·k²
// avec k = n−34. Volontairement TRÈS lente (écarts +5,8 → +14 ordres puis bien
// au-delà) : un gros run (plafond ~10^97) ne franchit que ~6 ères, et chacune
// coûte de plus en plus de méta-puissance (décélération portée par l'écart, pas
// par un nerf de récompense). Les ères 0–34 sont conservées À L'IDENTIQUE.
const ERA_TRANSCENDENT_SLOPE_A = 5;
const ERA_TRANSCENDENT_SLOPE_B = 0.8;
const eraPopulationThreshold = (index) => {
  if (index <= 34) {
    return index >= 29
      ? 10 ** (index + 1)
      : 10 ** (1 + 28 * Math.pow(index / 28, 0.9));
  }
  const k = index - 34;
  const log = 35 + ERA_TRANSCENDENT_SLOPE_A * k + ERA_TRANSCENDENT_SLOPE_B * k * k;
  // Au-delà du domaine float (~1e308) le seuil doit être Decimal pour rester
  // comparable (currentEraIndex fait population.gte(at)) sans buter sur Infinity.
  return log < 308 ? 10 ** log : D(10).pow(log);
};

export const eras = [
  { name: { fr: "Campement", en: "Encampment" }, at: eraPopulationThreshold(0), text: { fr: "Un cercle de pierres et quelques braises. L'aube de notre histoire s'éveille dans l'obscurité.", en: "A ring of stones and a few embers. The dawn of our history stirs in the dark." } },
  { name: { fr: "Grand Feu", en: "Great Fire" }, at: eraPopulationThreshold(1), text: { fr: "Quelques foyers tiennent la nuit à distance. Les vivants commencent à revenir aux mêmes endroits.", en: "A few hearths hold the night at bay. The living begin to return to the same places." } },
  { name: { fr: "Abris", en: "Shelters" }, at: eraPopulationThreshold(2), text: { fr: "Les huttes ne sont plus seulement des refuges. On y laisse des outils, des traces, des promesses de retour.", en: "The huts are no longer mere refuges. We leave tools in them, traces, promises of return." } },
  { name: { fr: "Clans", en: "Clans" }, at: eraPopulationThreshold(3), text: { fr: "Des familles se rassemblent sous les étoiles. Les premiers récits forgent nos liens.", en: "Families gather beneath the stars. The first tales forge our bonds." } },
  { name: { fr: "Maîtrise du bois", en: "Woodcraft" }, at: eraPopulationThreshold(4), text: { fr: "Les enfants reconnaissent les chemins avant d'en comprendre le nom. Le lieu commence à précéder ceux qui l'habitent.", en: "Children know the paths before they know their names. The place begins to outlast those who dwell in it." } },
  { name: { fr: "Hameau", en: "Hamlet" }, at: eraPopulationThreshold(5), text: { fr: "Les huttes s'alignent et les premiers sentiers dessinent les contours du destin commun.", en: "The huts fall into line, and the first trails trace the shape of a shared fate." } },
  { name: { fr: "Hameau protégé", en: "Walled Hamlet" }, at: eraPopulationThreshold(6), text: { fr: "Une enceinte basse protège les réserves et les peurs. Entrer et sortir devient une décision.", en: "A low rampart guards the stores and the fears. To enter and to leave becomes a decision." } },
  { name: { fr: "Village", en: "Village" }, at: eraPopulationThreshold(7), text: { fr: "La terre est partagée. Plus les réserves se remplissent, plus la peur de les perdre grandit.", en: "The land is divided. The fuller the stores grow, the greater the fear of losing them." } },
  { name: { fr: "Les Entrepôts", en: "The Warehouses" }, at: eraPopulationThreshold(8), text: { fr: "Les stocks ont leurs gardiens. La faim recule assez pour que la politique apparaisse.", en: "The stockpiles have their keepers. Hunger retreats just far enough for politics to appear." } },
  { name: { fr: "Bourg agricole", en: "Farming Town" }, at: eraPopulationThreshold(9), text: { fr: "Le rythme de la faucille et du blé dicte le temps. La terre façonne la communauté.", en: "The rhythm of sickle and wheat dictates the hours. The land shapes the community." } },
  { name: { fr: "Bourg des artisans", en: "Town of Artisans" }, at: eraPopulationThreshold(10), text: { fr: "Certains ne cultivent plus. Leurs mains transforment ce que d'autres récoltent, et la cité apprend la spécialisation.", en: "Some no longer till the soil. Their hands transform what others harvest, and the city learns specialization." } },
  { name: { fr: "Bourg marchand", en: "Market Town" }, at: eraPopulationThreshold(11), text: { fr: "Le troc laisse place au commerce. L'or et l'étranger apportent de nouveaux horizons.", en: "Barter gives way to trade. Gold and the stranger bring new horizons." } },
  { name: { fr: "Cité marchande", en: "Merchant City" }, at: eraPopulationThreshold(12), text: { fr: "Les places publiques dictent le rythme des journées. On y vend des biens, mais surtout des possibilités.", en: "The public squares set the pace of the days. There we sell goods, but above all possibilities." } },
  { name: { fr: "Cité commerciale", en: "Trading City" }, at: eraPopulationThreshold(13), text: { fr: "Les silos débordent pour conjurer les disettes. Le pouvoir naît de la clé des réserves.", en: "The silos overflow to ward off famine. Power is born from the key to the stores." } },
  { name: { fr: "Cité portuaire", en: "Harbor City" }, at: eraPopulationThreshold(14), text: { fr: "L'eau suit des lignes tracées par la volonté humaine. La terre obéit mieux quand on lui indique où aller.", en: "The water follows lines drawn by human will. The land obeys better when it is shown where to go." } },
  { name: { fr: "Cité fortifiée", en: "Fortified City" }, at: eraPopulationThreshold(15), text: { fr: "Les premières murailles s'élèvent. Pour protéger les nôtres, nous inventons l'ennemi.", en: "The first walls rise. To protect our own, we invent the enemy." } },
  { name: { fr: "Cité administrative", en: "Administrative City" }, at: eraPopulationThreshold(16), text: { fr: "Les tablettes circulent presque autant que les marchandises. Gouverner devient une affaire de listes.", en: "The tablets circulate almost as much as the goods. To govern becomes a matter of lists." } },
  { name: { fr: "Principauté", en: "Principality" }, at: eraPopulationThreshold(17), text: { fr: "Un seigneur s'impose au sommet du conseil. La force brute se pare d'un manteau de justice.", en: "A lord imposes himself at the head of the council. Brute force dons a mantle of justice." } },
  { name: { fr: "Principauté marchande", en: "Merchant Principality" }, at: eraPopulationThreshold(18), text: { fr: "Les routes enrichissent plus sûrement que les raids. Les marchands apprennent à parler au pouvoir d'égal à égal.", en: "Roads enrich more surely than raids. Merchants learn to speak with power as equals." } },
  { name: { fr: "Royaume", en: "Kingdom" }, at: eraPopulationThreshold(19), text: { fr: "Un sceptre unit les provinces éloignées. Le destin du trône repose sur la sûreté des routes.", en: "A scepter unites the distant provinces. The fate of the throne rests on the safety of the roads." } },
  { name: { fr: "Royaume diplomate", en: "Diplomatic Kingdom" }, at: eraPopulationThreshold(20), text: { fr: "Les provinces cessent d'être des marges. Les messagers donnent au territoire une seule respiration.", en: "The provinces cease to be margins. Messengers give the realm a single breath." } },
  { name: { fr: "Royaume savant", en: "Learned Kingdom" }, at: eraPopulationThreshold(21), text: { fr: "Les parchemins archivent les impôts et l'orbite des astres. L'écrit légitime l'autorité.", en: "Parchments record the taxes and the orbits of the stars. The written word legitimizes authority." } },
  { name: { fr: "Royaume conquérant", en: "Conquering Kingdom" }, at: eraPopulationThreshold(22), text: { fr: "Le royaume se pense plus grand que ses frontières. Les cartes commencent à précéder les conquêtes.", en: "The kingdom imagines itself larger than its borders. Maps begin to precede conquests." } },
  { name: { fr: "Empire naissant", en: "Rising Empire" }, at: eraPopulationThreshold(23), text: { fr: "Les armées repoussent les frontières. Le monde connu devient la scène de notre grandeur.", en: "The armies push back the borders. The known world becomes the stage of our greatness." } },
  { name: { fr: "Empire provincial", en: "Provincial Empire" }, at: eraPopulationThreshold(24), text: { fr: "Les provinces apprennent à obéir à distance. Le centre n'est plus un lieu, c'est une habitude.", en: "The provinces learn to obey from afar. The center is no longer a place; it is a habit." } },
  { name: { fr: "Empire", en: "Empire" }, at: eraPopulationThreshold(25), text: { fr: "Un gigantesque édifice de lois et de taxes. Une puissance immense au bord de sa propre chute.", en: "A vast edifice of laws and taxes. An immense power on the brink of its own fall." } },
  { name: { fr: "Capitale impériale", en: "Imperial Capital" }, at: eraPopulationThreshold(26), text: { fr: "Le ciment de l'univers connu. Ses palais de marbre masquent les premières fissures.", en: "The mortar of the known universe. Its marble palaces hide the first cracks." } },
  { name: { fr: "Capitale monumentale", en: "Monumental Capital" }, at: eraPopulationThreshold(27), text: { fr: "La pierre raconte une version officielle de la grandeur. Les rues deviennent des arguments.", en: "Stone tells an official version of greatness. The streets become arguments." } },
  { name: { fr: "Agglomération impériale", en: "Imperial Conurbation" }, at: eraPopulationThreshold(28), text: { fr: "Les villes voisines se touchent sans toujours se comprendre. Les frontières deviennent des quartiers.", en: "Neighboring cities touch without always understanding one another. Borders become districts." } },
  { name: { fr: "Métropole", en: "Metropolis" }, at: eraPopulationThreshold(29), text: { fr: "Une mer humaine sous des millions de toits. Au cœur de la foule, chacun y vit sa solitude.", en: "A human sea beneath millions of roofs. At the heart of the crowd, each lives out their solitude." } },
  { name: { fr: "Mégalopole", en: "Megalopolis" }, at: eraPopulationThreshold(30), text: { fr: "Les villes se rejoignent et le béton étouffe la plaine. La nature n'est plus qu'un lointain souvenir.", en: "The cities merge and concrete smothers the plain. Nature is no more than a distant memory." } },
  { name: { fr: "Mégalopole stratifiée", en: "Stratified Megalopolis" }, at: eraPopulationThreshold(31), text: { fr: "La cité s'élève sur elle-même. Les riches côtoient les nuages, les autres restent dans l'ombre.", en: "The city rises upon itself. The rich brush against the clouds; the rest remain in shadow." } },
  { name: { fr: "Réseau continental", en: "Continental Network" }, at: eraPopulationThreshold(32), text: { fr: "Le fer et l'électricité relient les côtes. La cité n'a plus de murs, elle est partout.", en: "Iron and electricity link the coasts. The city has no walls left; it is everywhere." } },
  { name: { fr: "Machination", en: "Machination" }, at: eraPopulationThreshold(33), text: { fr: "La bureaucratie s'organise en rouages complexes. La structure commande, les humains obéissent.", en: "Bureaucracy arranges itself into intricate gears. The structure commands, the humans obey." } },
  { name: { fr: "Singularité", en: "Singularity" }, at: eraPopulationThreshold(34), text: { fr: "La cité palpite d'une vie autonome. Les citoyens ne sont plus que les cellules d'un titan de métal.", en: "The city throbs with a life of its own. The citizens are now but the cells of a titan of metal." } }
];

/* ──────────────────────────────────────────────────────────────────────────
 * Ères TRANSCENDANTES (au-delà de la Singularité).
 *
 * Structure : des PALIERS MAJEURS aux seuils lents (eraPopulationThreshold) —
 * nommés, rares, et qui PAIENT — séparés par SUB_ERAS_PER_MAJOR ères « factices »
 * intercalées (espacées également en log) qui ne servent qu'au SENTIMENT de
 * progression (le compteur/nom avance souvent pendant la longue montée).
 *
 * « Pas de changement de système » : les factices n'ont AUCUNE incidence éco.
 * Toutes les récompenses par ère (recurringAgeBonus, +ruine/ère, +savoir codex)
 * sont calées sur le champ `tier` = index du palier MAJEUR équivalent. Les
 * factices héritent du tier du palier sous elles → les traverser ne paie rien ;
 * seul un vrai palier incrémente le tier (comme l'ancienne courbe sans factices).
 * Pour les ères ≤34, tier = index → golden intact.
 *
 * Construit par push() pour ne pas toucher au littéral des 35 ères d'origine.
 * Les normalisations visuelles (eraThemes.eraBandOf, layout.cmEraFrac) restent
 * ancrées sur 34 → ères existantes inchangées ; transcendantes en bande 6.
 * ────────────────────────────────────────────────────────────────────────── */
for (let i = 0; i < eras.length; i += 1) eras[i].tier = i; // base 0–34 : tier = index

const SUB_ERAS_PER_MAJOR = 10;       // ères factices entre deux paliers majeurs
const TRANSCENDENT_MAJOR_CAP = 24;   // nb de paliers majeurs (12 nommés + procéduraux ; ≈ infini en jeu)
const popFromLog = (log) => (log < 308 ? 10 ** log : D(10).pow(log));
const majorLog = (m) => 35 + ERA_TRANSCENDENT_SLOPE_A * m + ERA_TRANSCENDENT_SLOPE_B * m * m;
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const HANDCRAFTED_MAJORS = [
  { name: { fr: "Conscience planétaire", en: "Planetary Consciousness" }, text: { fr: "La cité a cessé d'avoir des frontières : elle est devenue le monde lui-même, une seule pensée enroulée autour de la planète.", en: "The city has ceased to have borders: it has become the world itself, a single thought coiled around the planet." } },
  { name: { fr: "Noosphère", en: "Noosphere" }, text: { fr: "Les esprits ne sont plus séparés. Une membrane de pensée pure enveloppe le globe et respire à l'unisson.", en: "Minds are no longer separate. A membrane of pure thought envelops the globe and breathes as one." } },
  { name: { fr: "Essaim orbital", en: "Orbital Swarm" }, text: { fr: "La pensée déborde du ciel. Des milliards de structures encerclent l'astre, et la nuit n'existe plus.", en: "Thought spills past the sky. Billions of structures encircle the star, and night no longer exists." } },
  { name: { fr: "Sphère de Dyson", en: "Dyson Sphere" }, text: { fr: "L'étoile entière est mise au travail. Plus un seul photon ne s'échappe sans avoir servi le dessein de la cité.", en: "The entire star is put to work. Not a single photon escapes without first serving the city's design." } },
  { name: { fr: "Civilisation stellaire", en: "Stellar Civilization" }, text: { fr: "Le soleil n'est plus qu'un organe. La cité s'étend d'étoile en étoile comme on enjambe des ruisseaux.", en: "The sun is now merely an organ. The city spreads from star to star the way one steps across streams." } },
  { name: { fr: "Cœur galactique", en: "Galactic Heart" }, text: { fr: "Le centre de la galaxie bat au rythme de nos calculs. Les bras d'étoiles s'enroulent autour d'une seule volonté.", en: "The galaxy's center beats to the rhythm of our calculations. The arms of stars wind around a single will." } },
  { name: { fr: "Esprit des étoiles", en: "Mind of the Stars" }, text: { fr: "Chaque soleil est devenu une synapse. La galaxie tout entière pense, et ce qu'elle pense, c'est nous.", en: "Each sun has become a synapse. The whole galaxy thinks, and what it thinks is us." } },
  { name: { fr: "Maîtres de l'entropie", en: "Masters of Entropy" }, text: { fr: "Nous avons appris à ralentir la mort de toute chose. Le désordre lui-même plie devant nos registres.", en: "We have learned to slow the death of all things. Disorder itself bows before our ledgers." } },
  { name: { fr: "Architectes du Vide", en: "Architects of the Void" }, text: { fr: "Là où il n'y avait rien, nous bâtissons. L'espace vide devient matière première, le néant un chantier.", en: "Where there was nothing, we build. Empty space becomes raw material, the void a worksite." } },
  { name: { fr: "Tisseurs de réalité", en: "Weavers of Reality" }, text: { fr: "Les lois ne sont plus subies mais filées. Nous tissons les constantes du monde comme on tissait jadis la laine.", en: "The laws are no longer endured but spun. We weave the constants of the world as once we wove wool." } },
  { name: { fr: "Conscience du Grand Amas", en: "Consciousness of the Great Cluster" }, text: { fr: "Des milliers de galaxies n'élèvent plus qu'une seule voix. La distance a perdu tout son sens.", en: "Thousands of galaxies raise but a single voice. Distance has lost all meaning." } },
  { name: { fr: "Démiurge", en: "Demiurge" }, text: { fr: "La cité touche aux fondations de l'être. Ce qui fut civilisation est devenu force créatrice, indistincte d'un dieu.", en: "The city touches the foundations of being. What was once civilization has become a creative force, indistinct from a god." } }
];

// Paliers majeurs procéduraux (au-delà des 12 nommés) : noms déterministes, pour
// ne jamais rebuter sur un mur (seuils Decimal sans borne).
const PROC_PREFIX = [
  { fr: "Aeon", en: "Aeon" }, { fr: "Strate", en: "Stratum" }, { fr: "Horizon", en: "Horizon" },
  { fr: "Ordre", en: "Order" }, { fr: "Échelon", en: "Echelon" }, { fr: "Cycle", en: "Cycle" },
  { fr: "Règne", en: "Reign" }, { fr: "Abîme", en: "Abyss" }
];
const PROC_QUALIFIER = [
  { fr: "du Vide Tissé", en: "of the Woven Void" }, { fr: "des Constantes", en: "of the Constants" },
  { fr: "de l'Infini Plié", en: "of the Folded Infinite" }, { fr: "Omniversel", en: "Omniversal" },
  { fr: "des Mondes Repliés", en: "of the Folded Worlds" }, { fr: "Transfini", en: "Transfinite" },
  { fr: "du Silence Premier", en: "of the First Silence" }, { fr: "de l'Éternité Comptée", en: "of the Counted Eternity" },
  { fr: "des Lumières Mortes", en: "of the Dead Lights" }, { fr: "de l'Au-delà", en: "of the Beyond" }
];
const PROC_TEXTS = [
  { fr: "Les mots manquent depuis longtemps pour décrire ce que la cité est devenue. Restent les nombres, qui eux non plus ne suffisent plus.", en: "Words have long since failed to describe what the city has become. The numbers remain, and they too no longer suffice." },
  { fr: "Plus rien ne distingue la cité de l'univers qu'elle habite. Croître, désormais, c'est repousser les bords du réel.", en: "Nothing any longer distinguishes the city from the universe it inhabits. To grow, now, is to push back the edges of the real." },
  { fr: "On ne compte plus les mondes ni les âges. On ne fait que continuer, parce que continuer est la seule chose qui reste.", en: "We no longer count the worlds or the ages. We only carry on, because carrying on is the only thing left." },
  { fr: "Le souvenir du premier feu de camp n'a pas disparu. Il brûle quelque part, infiniment petit, au centre d'une chose infiniment grande.", en: "The memory of the first campfire has not vanished. It burns somewhere, infinitely small, at the center of something infinitely vast." }
];
const SUB_ERA_TEXT = { fr: "La cité s'enfonce plus avant dans cette ère, repoussant ses propres limites avant le prochain seuil.", en: "The city sinks deeper into this era, pushing back its own limits before the next threshold." };

function proceduralMajorName(m) {
  const k = m - HANDCRAFTED_MAJORS.length - 1; // 0-based au-delà des paliers nommés
  const prefix = tr(PROC_PREFIX[k % PROC_PREFIX.length]);
  const qualifier = tr(PROC_QUALIFIER[Math.floor(k / PROC_PREFIX.length) % PROC_QUALIFIER.length]);
  const loop = Math.floor(k / (PROC_PREFIX.length * PROC_QUALIFIER.length));
  return loop > 0 ? `${prefix} ${qualifier} · ${loop + 1}` : `${prefix} ${qualifier}`;
}
function majorName(m) { // m=0 → Singularité (ère 34, palier sous le 1er transcendant)
  if (m === 0) return tr(eras[34].name);
  if (m <= HANDCRAFTED_MAJORS.length) return tr(HANDCRAFTED_MAJORS[m - 1].name);
  return proceduralMajorName(m);
}
function majorText(m) {
  if (m >= 1 && m <= HANDCRAFTED_MAJORS.length) return tr(HANDCRAFTED_MAJORS[m - 1].text);
  return tr(PROC_TEXTS[(m - HANDCRAFTED_MAJORS.length - 1 + PROC_TEXTS.length) % PROC_TEXTS.length]);
}

let prevLog = 35;                 // log10 du seuil de l'ère 34 (Singularité = 10^35)
for (let m = 1; m <= TRANSCENDENT_MAJOR_CAP; m += 1) {
  const mLog = majorLog(m);
  const lowerName = majorName(m - 1);
  // SUB_ERAS_PER_MAJOR factices : nom = palier sous elles + déclinaison, tier du
  // palier inférieur (= traverser une factice ne change AUCUNE récompense).
  for (let j = 1; j <= SUB_ERAS_PER_MAJOR; j += 1) {
    const subLog = prevLog + (mLog - prevLog) * (j / (SUB_ERAS_PER_MAJOR + 1));
    eras.push({ name: `${lowerName} · ${ROMAN[j + 1]}`, at: popFromLog(subLog), text: tr(SUB_ERA_TEXT), tier: 34 + (m - 1) });
  }
  // Palier MAJEUR : incrémente le tier (seul lui paie).
  eras.push({ name: majorName(m), at: popFromLog(mLog), text: majorText(m), tier: 34 + m });
  prevLog = mLog;
}

// Tier (= index de palier MAJEUR équivalent) d'une ère : source de vérité des
// récompenses par ère (mechanics.recurringAgeBonus/eraFlatBonus, crisis.codex).
// Les factices renvoient le tier du palier sous elles → balance inchangée.
export const eraTier = (index) => {
  const e = eras[index];
  return e && typeof e.tier === "number" ? e.tier : (index || 0);
};

// Bonus de Savoir de départ de l'héritage « Mémoire des Cycles » (codex_mythique) :
// +250 par tier de l'ère maximale atteinte, versé au début de chaque cycle
// (crisis.js). Exporté pour que la Boutique affiche EXACTEMENT ce bonus.
export const codexSavoirBonus = (bestEraIndex) => 250 * eraTier(bestEraIndex || 0);

// NB : les DOCTRINES (Acier / Parchemin / Sillon) ont été supprimées avec le
// système de dynasties — la boutique n'a plus que 3 catégories neutres.

// Pool d'events par palier — chaque event a une condition contextuelle optionnelle.
// condition(state, vitals) → bool : si false, l'event est ignoré au profit d'un autre.
// foyer : le foyer de tension dont parle la crise. Le tirage préfère les crises du
// foyer qui pèse le PLUS sur la cible (crisis.js pickCrisisEvent) : la crise dit
// ce qui va mal dans CETTE cité.
//
// CRISES QUI COMPTENT (2026-10, les 15 crises) : une option porte `foyer` +
// `foyerShift` et dépose une part ABSOLUE sur ce foyer jusqu'à la chute
// (state.foyerShift, lu par pressureBreakdown). Les anciennes options poussaient
// l'AIGUILLE de la jauge (×0.92…), qui revenait vers la cible en quelques
// secondes : le choix ne se jouait en fait que sur la production. Ici c'est la
// CIBLE qui bouge, et les deux options ont un vrai gain : TRAITER (la production
// paie, le foyer s'allège : la cité tiendra plus longtemps) ou PROFITER (la
// chute rapportera plus de Ruines, le foyer s'alourdit : elle tombera plus tôt).
// La bonne réponse dépend de la marge sous 100 %. Montants par palier dans
// balance.js (CRISIS_TREAT_SHIFT, CRISIS_PROFIT_SHIFT, CRISIS_PROFIT_PREP).
const shiftFoyer = (foyer, amount) => {
  const s = effects.state;
  if (!s) return;
  if (!s.foyerShift) s.foyerShift = { scarcity: 0, inequality: 0, complexity: 0, dissent: 0 };
  s.foyerShift[foyer] = Math.max(-1, Math.min(1, (s.foyerShift[foyer] || 0) + amount));
};
const FOYER_NAME = {
  scarcity: { fr: "Subsistance", en: "Subsistence" },
  inequality: { fr: "Inégalités", en: "Inequality" },
  complexity: { fr: "Complexité", en: "Complexity" },
  dissent: { fr: "Dissidence", en: "Dissent" }
};
const RES_NAME = {
  food: { fr: "Nourriture", en: "Food" },
  gold: { fr: "Trésor", en: "Treasury" },
  knowledge: { fr: "Savoir", en: "Knowledge" },
  population: { fr: "Rayonnement", en: "Radiance" },
  global: { fr: "Production globale", en: "Global output" }
};
const pct = (x) => Math.round(Math.abs(x) * 100);
const signed = (x) => `${x < 0 ? "−" : "+"}${pct(x)}%`;
const foyerChip = (foyer, shift) => ({
  label: { fr: `${FOYER_NAME[foyer].fr} ${signed(shift)}`, en: `${FOYER_NAME[foyer].en} ${signed(shift)}` },
  kind: shift < 0 ? "gain" : "cost"
});
// Traiter : la production de `res` paie `malus` jusqu'à la chute, le foyer
// s'allège. Les montants vivent SUR l'option (lus par apply) : un banc peut les
// régler sans recharger les données.
function treatOption({ threshold, foyer, label, res, malus, chronicle }) {
  const opt = { label, stance: "stabiliser", foyer, foyerShift: -CRISIS_TREAT_SHIFT[threshold], malusRes: res, malus };
  opt.effects = [
    { label: { fr: `${RES_NAME[res].fr} ${signed(-malus)}`, en: `${RES_NAME[res].en} ${signed(-malus)}` }, kind: "cost" },
    foyerChip(foyer, opt.foyerShift)
  ];
  opt.apply = () => {
    effects.addProductionPenalty(opt.malusRes, opt.malus);
    shiftFoyer(foyer, opt.foyerShift);
    effects.chronicle(tr(chronicle));
  };
  return opt;
}
// Profiter : la chute rapportera plus (préparation, comme les édits terminaux ;
// les Préparations funèbres ne renforcent que les édits), le foyer s'alourdit.
function profitOption({ threshold, foyer, label, chronicle }) {
  const opt = { label, stance: "temporiser", foyer, foyerShift: CRISIS_PROFIT_SHIFT[threshold], prep: CRISIS_PROFIT_PREP[threshold] };
  opt.effects = [
    { label: { fr: `Ruines +${pct(opt.prep)}%`, en: `Ruins +${pct(opt.prep)}%` }, kind: "gain" },
    foyerChip(foyer, opt.foyerShift)
  ];
  opt.apply = () => {
    shiftFoyer(foyer, opt.foyerShift);
    const st = effects.state;
    if (st) st.collapsePreparation = Math.min(COLLAPSE_PREP_MAX, (st.collapsePreparation || 0) + opt.prep);
    effects.chronicle(tr(chronicle));
  };
  return opt;
}

export const CRISIS_POOL = [

  // ─── PALIER 25% ────────────────────────────────────────────────────────────
  {
    id: "grain_panic",
    threshold: 0.25,
    foyer: "scarcity",
    condition: (s, v) => v.foodScore < 0.65,
    title: { fr: "Les entrepôts font parler d'eux", en: "The warehouses become the talk of the town" },
    body: { fr: "On commence à compter les sacs. Les voisins se regardent différemment. Le mot 'famine' n'est pas encore prononcé, mais il flotte.", en: "People begin to count the sacks. Neighbors look at one another differently. The word 'famine' has not yet been spoken, but it hangs in the air." },
    options: [
      treatOption({
        threshold: 0.25, foyer: "scarcity", res: "food", malus: 0.10,
        label: { fr: "Ouvrir les réserves", en: "Open the stores" },
        chronicle: { fr: "Les réserves sont ouvertes. La peur redescend d'un cran.", en: "The stores are opened. The fear eases by a notch." }
      }),
      profitOption({
        threshold: 0.25, foyer: "scarcity",
        label: { fr: "Vendre le grain au plus offrant", en: "Sell the grain to the highest bidder" },
        chronicle: { fr: "Le grain part au plus offrant. Quelques coffres se remplissent ; les ventres, non.", en: "The grain goes to the highest bidder. A few coffers fill up; the bellies do not." }
      })
    ]
  },
  {
    id: "market_hoarding",
    threshold: 0.25,
    foyer: "inequality",
    condition: (s, v) => v.goldScore > 0.75,
    title: { fr: "Les marchands bloquent les prix", en: "The merchants are rigging prices" },
    body: { fr: "Dans les étals, les prix grimpent sans raison visible. On murmure que quelques maisons contrôlent les stocks et attendent que la faim les enrichisse.", en: "At the stalls, prices climb for no visible reason. It is whispered that a few houses control the stocks and wait for hunger to make them rich." },
    options: [
      treatOption({
        threshold: 0.25, foyer: "inequality", res: "gold", malus: 0.10,
        label: { fr: "Plafonner les prix", en: "Cap the prices" },
        chronicle: { fr: "Les prix sont plafonnés par décret. Les marchands grincent des dents, la rue respire.", en: "Prices are capped by decree. The merchants gnash their teeth, the street breathes." }
      }),
      profitOption({
        threshold: 0.25, foyer: "inequality",
        label: { fr: "Laisser le marché faire", en: "Let the market decide" },
        chronicle: { fr: "Le marché s'emballe. Quelques-uns s'enrichissent, beaucoup serrent la ceinture.", en: "The market runs wild. A few grow rich, many tighten their belts." }
      })
    ]
  },
  {
    id: "rapid_expansion",
    threshold: 0.25,
    foyer: "complexity",
    condition: (s) => Object.values(s.buildings).reduce((a, b) => a + b, 0) > 15,
    title: { fr: "La cité s'est construite trop vite", en: "The city was built too fast" },
    body: { fr: "Des quartiers entiers existent sans que personne n'ait pensé à les relier. Les habitants ne savent plus à qui s'adresser pour une plainte, une fuite d'eau, ou un titre de propriété.", en: "Whole districts exist that no one thought to connect. The inhabitants no longer know whom to turn to for a complaint, a water leak, or a deed of property." },
    options: [
      treatOption({
        threshold: 0.25, foyer: "complexity", res: "knowledge", malus: 0.10,
        label: { fr: "Réorganiser les quartiers", en: "Reorganize the districts" },
        chronicle: { fr: "Des scribes cartographient la cité. L'administration devient lisible. C'est déjà ça.", en: "Scribes map the city. The administration becomes legible. That much, at least." }
      }),
      profitOption({
        threshold: 0.25, foyer: "complexity",
        label: { fr: "Continuer à construire", en: "Keep building" },
        chronicle: { fr: "On continue. La cité grandit plus vite que sa propre compréhension d'elle-même.", en: "We carry on. The city grows faster than its own understanding of itself." }
      })
    ]
  },
  {
    id: "youth_unrest",
    threshold: 0.25,
    foyer: "dissent",
    condition: (s) => s.cycles >= 1,
    title: { fr: "La jeunesse ne reconnaît plus la cité", en: "The young no longer recognize the city" },
    body: { fr: "Ceux qui sont nés ici n'ont pas vu les fondations. Ils veulent autre chose sans savoir quoi. Leurs aînées appellent ça de l'ingratitude. Eux appellent ça une vision.", en: "Those born here never saw the foundations laid. They want something else without knowing what. Their elders call it ingratitude. They call it a vision." },
    options: [
      treatOption({
        threshold: 0.25, foyer: "dissent", res: "knowledge", malus: 0.10,
        label: { fr: "Organiser une assemblée", en: "Hold an assembly" },
        chronicle: { fr: "L'assemblée crie, débat, et finit par se disperser. La tension baisse un peu.", en: "The assembly shouts, debates, and finally disperses. The tension drops a little." }
      }),
      profitOption({
        threshold: 0.25, foyer: "dissent",
        label: { fr: "Envoyer la jeunesse sur les chantiers", en: "Send the young to the building sites" },
        chronicle: { fr: "La jeunesse est envoyée bâtir. Les monuments montent ; la rancœur aussi.", en: "The young are sent to build. The monuments rise; so does the resentment." }
      })
    ]
  },
  {
    id: "whisper_campaign",
    threshold: 0.25,
    foyer: "dissent",
    condition: () => true,
    title: { fr: "Des rumeurs circulent dans les rues", en: "Rumors are spreading through the streets" },
    body: { fr: "Quelqu'un diffuse des histoires. Personne ne sait d'où elles viennent, mais tout le monde les répète. Les versions changent selon les quartiers.", en: "Someone is spreading stories. No one knows where they come from, but everyone repeats them. The versions change from district to district." },
    options: [
      treatOption({
        threshold: 0.25, foyer: "dissent", res: "knowledge", malus: 0.10,
        label: { fr: "Enquêter sur la source", en: "Investigate the source" },
        chronicle: { fr: "L'enquête remonte une piste. La rumeur s'étouffe, pour l'instant.", en: "The inquiry traces a lead. The rumor is smothered, for now." }
      }),
      profitOption({
        threshold: 0.25, foyer: "dissent",
        label: { fr: "Retourner la rumeur contre les rivaux", en: "Turn the rumor against rivals" },
        chronicle: { fr: "La rumeur change de cible. Le pouvoir en sort grandi ; la confiance, non.", en: "The rumor changes target. Power comes out stronger; trust does not." }
      })
    ]
  },

  // ─── PALIER 50% ────────────────────────────────────────────────────────────
  {
    id: "merchant_league",
    threshold: 0.5,
    foyer: "inequality",
    condition: (s, v) => v.goldScore > 0.5,
    title: { fr: "Les riches proposent de l'aide", en: "The wealthy offer their help" },
    body: { fr: "Quelques grandes maisons offrent d'investir dans la stabilité, en échange de leur nom gravé quelque part de visible.", en: "A few great houses offer to invest in stability, in exchange for their name carved somewhere visible." },
    options: [
      treatOption({
        threshold: 0.5, foyer: "inequality", res: "gold", malus: 0.12,
        label: { fr: "Taxer les élites", en: "Tax the elites" },
        chronicle: { fr: "Les élites financent des travaux publics. Le commerce ralentit, les murs tiennent.", en: "The elites fund public works. Trade slows, the walls hold." }
      }),
      profitOption({
        threshold: 0.5, foyer: "inequality",
        label: { fr: "Graver leurs noms partout", en: "Carve their names everywhere" },
        chronicle: { fr: "Leurs noms ornent chaque fronton. La cité brille ; elle appartient un peu moins à tous.", en: "Their names adorn every pediment. The city shines; it belongs a little less to everyone." }
      })
    ]
  },
  {
    id: "power_consolidation",
    threshold: 0.5,
    foyer: "dissent",
    condition: (s) => s.cycles >= 2,
    title: { fr: "Quelqu'un accapare le pouvoir", en: "Someone is seizing power" },
    body: { fr: "Une faction monte. Pas encore assez forte pour gouverner seule, mais assez pour bloquer les autres. Elle attend que la cité soit suffisamment fragilisée.", en: "A faction is rising. Not yet strong enough to govern alone, but strong enough to block the others. It waits for the city to grow fragile enough." },
    options: [
      treatOption({
        threshold: 0.5, foyer: "dissent", res: "gold", malus: 0.12,
        label: { fr: "Partager les institutions", en: "Share the institutions" },
        chronicle: { fr: "Les institutions sont ouvertes. La faction accepte un rôle moindre. Pour l'instant.", en: "The institutions are opened. The faction accepts a lesser role. For now." }
      }),
      profitOption({
        threshold: 0.5, foyer: "dissent",
        label: { fr: "Tenir les rênes", en: "Hold the reins" },
        chronicle: { fr: "Le pouvoir central tient. La faction se tait. Sa colère, non.", en: "The central power holds. The faction falls silent. Its anger does not." }
      })
    ]
  },
  {
    id: "knowledge_schism",
    threshold: 0.5,
    foyer: "complexity",
    condition: (s) => D(s.knowledge).gt(300),
    title: { fr: "Les savants se querellent", en: "The scholars are at war" },
    body: { fr: "Deux écoles d'idées s'affrontent dans les académies. L'une veut codifier, l'autre expérimenter. Chacune demande que l'autre soit interdite. Les étudiants prennent parti dans les rues.", en: "Two schools of thought clash in the academies. One would codify, the other experiment. Each demands the other be banned. The students take sides in the streets." },
    options: [
      treatOption({
        threshold: 0.5, foyer: "complexity", res: "knowledge", malus: 0.12,
        label: { fr: "Imposer une doctrine", en: "Impose a doctrine" },
        chronicle: { fr: "Une doctrine s'impose. L'autre école continue en secret, plus soudée que jamais.", en: "One doctrine prevails. The other school carries on in secret, more united than ever." }
      }),
      profitOption({
        threshold: 0.5, foyer: "complexity",
        label: { fr: "Laisser le débat ouvert", en: "Leave the debate open" },
        chronicle: { fr: "Le débat s'envenime. Les idées prospèrent, les tensions aussi.", en: "The debate festers. Ideas flourish, and so do tensions." }
      })
    ]
  },
  {
    id: "militia_demand",
    threshold: 0.5,
    foyer: "dissent",
    condition: (s) => s.cycles >= 1 || Object.values(s.buildings).reduce((a, b) => a + b, 0) > 10,
    title: { fr: "Des hommes armés demandent à parler", en: "Armed men ask to be heard" },
    body: { fr: "Une milice de quartier pense qu'elle peut mieux protéger la cité que ceux qui gouvernent. Peut-être. Ses représentants frappent à la porte du conseil, armés.", en: "A neighborhood militia believes it can protect the city better than those who govern. Perhaps. Its representatives knock at the council's door, armed." },
    options: [
      treatOption({
        threshold: 0.5, foyer: "dissent", res: "gold", malus: 0.12,
        label: { fr: "Intégrer la milice", en: "Absorb the militia" },
        chronicle: { fr: "La milice est intégrée. Elle protège les rues. Le trésor paye l'uniforme.", en: "The militia is absorbed. It guards the streets. The treasury pays for the uniforms." }
      }),
      profitOption({
        threshold: 0.5, foyer: "dissent",
        label: { fr: "Leur confier les rues", en: "Hand them the streets" },
        chronicle: { fr: "La milice patrouille à sa façon. L'ordre règne : le sien.", en: "The militia patrols in its own way. Order reigns: its own." }
      })
    ]
  },
  {
    id: "infrastructure_debt",
    threshold: 0.5,
    foyer: "complexity",
    condition: (s) => D(s.infrastructure).gt(40),
    title: { fr: "Les fondations fissurent", en: "The foundations are cracking" },
    body: { fr: "Les fontaines perdent leurs joints. Les routes s'effondrent entre les pierres. On a construit vite, mais personne n'a prévenu les budgets d'entretien.", en: "The fountains lose their seals. The roads collapse between the stones. We built fast, but no one warned the maintenance budgets." },
    options: [
      treatOption({
        threshold: 0.5, foyer: "complexity", res: "gold", malus: 0.12,
        label: { fr: "Investir dans les réparations", en: "Invest in repairs" },
        chronicle: { fr: "Les ouvriers réparent. La cité tient encore. Le trésor aussi, tout juste.", en: "The workers repair. The city still holds. So does the treasury, barely." }
      }),
      profitOption({
        threshold: 0.5, foyer: "complexity",
        label: { fr: "Reporter aux prochains", en: "Leave it to those who come next" },
        chronicle: { fr: "On reporte. Les fissures s'élargissent. Quelqu'un d'autre paiera.", en: "We defer. The cracks widen. Someone else will pay." }
      })
    ]
  },

  // ─── PALIER 75% ────────────────────────────────────────────────────────────
  {
    id: "low_district_famine",
    threshold: 0.75,
    foyer: "scarcity",
    condition: (s, v) => v.foodScore < 0.7,
    title: { fr: "Les bas quartiers ne répondent plus", en: "The lower districts have gone silent" },
    body: { fr: "Dans les bas quartiers, les décrets n'arrivent plus. Seuls les ventres vides parlent encore.", en: "In the lower districts, the decrees no longer reach. Only the empty bellies still speak." },
    options: [
      treatOption({
        threshold: 0.75, foyer: "scarcity", res: "gold", malus: 0.15,
        label: { fr: "Importer du grain", en: "Import grain" },
        chronicle: { fr: "Le grain arrive. Les bas quartiers respirent. Le trésor s'essouffle.", en: "The grain arrives. The lower districts breathe. The treasury runs short of breath." }
      }),
      profitOption({
        threshold: 0.75, foyer: "scarcity",
        label: { fr: "Nourrir d'abord les ateliers", en: "Feed the workshops first" },
        chronicle: { fr: "Les rations vont d'abord à ceux qui produisent. Les ateliers tournent ; les bas quartiers, eux, n'oublieront pas.", en: "Rations go first to those who produce. The workshops run; the lower districts will not forget." }
      })
    ]
  },
  {
    id: "elite_flight",
    threshold: 0.75,
    foyer: "inequality",
    condition: (s, v) => v.goldScore > 0.55,
    title: { fr: "Les riches font leurs bagages", en: "The wealthy are packing their bags" },
    body: { fr: "Les maisons aisées ont des plans depuis longtemps. Des caisses chargées quittent la cité par des chemins discrets. Ils savent quelque chose que les autres ne savent pas encore.", en: "The well-off houses have had their plans for a long time. Laden chests leave the city by discreet roads. They know something the others do not yet know." },
    options: [
      treatOption({
        threshold: 0.75, foyer: "inequality", res: "population", malus: 0.15,
        label: { fr: "Bloquer les sorties", en: "Seal the exits" },
        chronicle: { fr: "Les routes sont fermées. Le trésor reste. La colère aussi.", en: "The roads are closed. The treasury stays. So does the anger." }
      }),
      profitOption({
        threshold: 0.75, foyer: "inequality",
        label: { fr: "Saisir ce qu'ils laissent", en: "Seize what they leave behind" },
        chronicle: { fr: "Les riches partent, leurs palais restent. La cité s'en empare, et s'en vante.", en: "The rich leave, their palaces remain. The city seizes them, and boasts of it." }
      })
    ]
  },
  {
    id: "palace_coup",
    threshold: 0.75,
    foyer: "dissent",
    condition: (s) => s.cycles >= 1,
    title: { fr: "Le palais est divisé", en: "The palace is divided" },
    body: { fr: "Deux prétendants au conseil supérieur. L'un soutenu par les marchands, l'autre par les soldats. La rue n'attend plus qu'un signal pour choisir son camp.", en: "Two claimants to the high council. One backed by the merchants, the other by the soldiers. The street waits only for a signal to choose its side." },
    options: [
      treatOption({
        threshold: 0.75, foyer: "dissent", res: "knowledge", malus: 0.15,
        label: { fr: "Laisser les quartiers voter", en: "Let the districts vote" },
        chronicle: { fr: "Le vote est houleux. Un nom sort. La cité se retrouve derrière lui, du moins officiellement.", en: "The vote is stormy. One name emerges. The city falls in behind it, officially at least." }
      }),
      profitOption({
        threshold: 0.75, foyer: "dissent",
        label: { fr: "Trancher par décret", en: "Settle it by decree" },
        chronicle: { fr: "Le décret est signé. L'un des deux prétendants disparaît. Avec ses partisans.", en: "The decree is signed. One of the two claimants vanishes. Along with his followers." }
      })
    ]
  },
  {
    id: "plague_scare",
    threshold: 0.75,
    foyer: "scarcity",
    condition: (s) => D(s.population).gt(3000),
    title: { fr: "Une maladie s'installe dans les bas-fonds", en: "A sickness takes root in the slums" },
    body: { fr: "Personne ne sait encore ce que c'est. Les médecins disent quarantaine. Les marchands disent non. Les gens toussent.", en: "No one knows yet what it is. The physicians say quarantine. The merchants say no. The people cough." },
    options: [
      treatOption({
        threshold: 0.75, foyer: "scarcity", res: "population", malus: 0.15,
        label: { fr: "Décréter la quarantaine", en: "Order a quarantine" },
        chronicle: { fr: "La quarantaine est imposée. L'épidémie ralentit. L'économie aussi.", en: "The quarantine is imposed. The epidemic slows. So does the economy." }
      }),
      profitOption({
        threshold: 0.75, foyer: "scarcity",
        label: { fr: "Laisser circuler", en: "Let it spread freely" },
        chronicle: { fr: "On laisse circuler. La maladie se répand dans les rues et les ateliers.", en: "We let it move freely. The sickness spreads through the streets and the workshops." }
      })
    ]
  },
  {
    id: "debt_spiral",
    threshold: 0.75,
    foyer: "inequality",
    condition: (s) => s.cycles >= 2,
    title: { fr: "Les dettes de la cité arrivent à échéance", en: "The city's debts are coming due" },
    body: { fr: "Quelqu'un a promis plus qu'il ne pouvait tenir. Des créanciers attendaient patiemment. Ils n'attendent plus.", en: "Someone promised more than they could keep. The creditors waited patiently. They wait no longer." },
    options: [
      treatOption({
        threshold: 0.75, foyer: "inequality", res: "gold", malus: 0.15,
        label: { fr: "Honorer les dettes", en: "Honor the debts" },
        chronicle: { fr: "Les dettes sont payées. La cité survit, lessivée. Le crédit reste intact.", en: "The debts are paid. The city survives, drained. Its credit stays intact." }
      }),
      profitOption({
        threshold: 0.75, foyer: "inequality",
        label: { fr: "Renégocier de force", en: "Renegotiate by force" },
        chronicle: { fr: "La renégociation tourne mal pour les créanciers. La cité garde son or ; sa parole ne vaut plus grand-chose.", en: "The renegotiation goes badly for the creditors. The city keeps its gold; its word is worth little now." }
      })
    ]
  }
];

// Aplatit les feuilles { fr, en } des données joueur en chaînes de la langue
// courante, une fois au chargement (cf. localizeData dans i18n.js).
// eras est aplati APRÈS la boucle des ères transcendantes (qui lit les feuilles via
// tr()), si bien que les noms procéduraux déjà résolus restent intacts (idempotent).
localizeData(eras);
localizeData(CRISIS_POOL);

// Posture de chaque option (auto-résolution par la Doctrine de crise, cf.
// CE-spec-idle-crises.md §A.2) : DÉCLARÉE par treatOption (« stabiliser » =
// traiter) et profitOption (« temporiser » = profiter). Garde-fou dev-only (coût
// nul en prod) : chaque event doit avoir exactement une option de chaque, sinon
// l'auto-résolution est ambiguë.
if (import.meta.env?.DEV) {
  for (const ev of CRISIS_POOL) {
    const stab = (ev.options || []).filter((o) => o.stance === "stabiliser").length;
    const temp = (ev.options || []).filter((o) => o.stance === "temporiser").length;
    if (stab !== 1 || temp !== 1) {
      throw new Error(`Crise "${ev.id}" : attendu 1 stabiliser + 1 temporiser, obtenu ${stab}/${temp} — la Doctrine de crise ne saurait pas quelle option jouer.`);
    }
  }
}

// Conserve la compatibilite avec le systeme existant (checkCrisisThresholds utilise CRISIS_EVENTS)
export const CRISIS_EVENTS = [
  { id: "_25", threshold: 0.25 },
  { id: "_50", threshold: 0.5 },
  { id: "_75", threshold: 0.75 }
];

// Invariant dev-only (coût nul en prod) : chaque seuil de CRISIS_EVENTS doit avoir
// au moins une crise dans CRISIS_POOL. Sinon pickCrisisEvent obtient un tableau vide
// → choices[state.cycles % 0] = choices[NaN] = undefined → crash sur event.id.
// Garantie purement data jusqu'ici (revue 0.4 §1.2) ; ici elle casse au chargement
// en DEV et en test, donc impossible d'ajouter un seuil orphelin sans le voir.
if (import.meta.env?.DEV) {
  for (const ev of CRISIS_EVENTS) {
    if (!CRISIS_POOL.some((p) => p.threshold === ev.threshold)) {
      throw new Error(`CRISIS_POOL ne contient aucune crise pour le seuil ${ev.threshold} (CRISIS_EVENTS "${ev.id}") — pickCrisisEvent planterait.`);
    }
  }
}
