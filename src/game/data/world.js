"use strict";

import { effects } from './worldEffects.js';
import { D } from '../core/num.js';

/* ============================================================================
 * data-world.js - Donnees monde: eras, DOCTRINES, CRISIS_POOL, CRISIS_EVENTS.
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
  { name: "Campement", at: eraPopulationThreshold(0), text: "Un cercle de pierres et quelques braises. L'aube de notre histoire s'éveille dans l'obscurité." },
  { name: "Grand Feu", at: eraPopulationThreshold(1), text: "Quelques foyers tiennent la nuit à distance. Les vivants commencent à revenir aux mêmes endroits." },
  { name: "Abris", at: eraPopulationThreshold(2), text: "Les huttes ne sont plus seulement des refuges. On y laisse des outils, des traces, des promesses de retour." },
  { name: "Clans", at: eraPopulationThreshold(3), text: "Des familles se rassemblent sous les étoiles. Les premiers récits forgent nos liens." },
  { name: "Maîtrise du bois", at: eraPopulationThreshold(4), text: "Les enfants reconnaissent les chemins avant d'en comprendre le nom. Le lieu commence à précéder ceux qui l'habitent." },
  { name: "Hameau", at: eraPopulationThreshold(5), text: "Les huttes s'alignent et les premiers sentiers dessinent les contours du destin commun." },
  { name: "Hameau protégé", at: eraPopulationThreshold(6), text: "Une enceinte basse protège les réserves et les peurs. Entrer et sortir devient une décision." },
  { name: "Village", at: eraPopulationThreshold(7), text: "La terre est partagée. Plus les réserves se remplissent, plus la peur de les perdre grandit." },
  { name: "Les Entrepôts", at: eraPopulationThreshold(8), text: "Les stocks ont leurs gardiens. La faim recule assez pour que la politique apparaisse." },
  { name: "Bourg agricole", at: eraPopulationThreshold(9), text: "Le rythme de la faucille et du blé dicte le temps. La terre façonne la communauté." },
  { name: "Bourg des artisans", at: eraPopulationThreshold(10), text: "Certains ne cultivent plus. Leurs mains transforment ce que d'autres récoltent, et la cité apprend la spécialisation." },
  { name: "Bourg marchand", at: eraPopulationThreshold(11), text: "Le troc laisse place au commerce. L'or et l'étranger apportent de nouveaux horizons." },
  { name: "Cité marchande", at: eraPopulationThreshold(12), text: "Les places publiques dictent le rythme des journées. On y vend des biens, mais surtout des possibilités." },
  { name: "Cité commerciale", at: eraPopulationThreshold(13), text: "Les silos débordent pour conjurer les disettes. Le pouvoir naît de la clé des réserves." },
  { name: "Cité portuaire", at: eraPopulationThreshold(14), text: "L'eau suit des lignes tracées par la volonté humaine. La terre obéit mieux quand on lui indique où aller." },
  { name: "Cité fortifiée", at: eraPopulationThreshold(15), text: "Les premières murailles s'élèvent. Pour protéger les nôtres, nous inventons l'ennemi." },
  { name: "Cité administrative", at: eraPopulationThreshold(16), text: "Les tablettes circulent presque autant que les marchandises. Gouverner devient une affaire de listes." },
  { name: "Principauté", at: eraPopulationThreshold(17), text: "Un seigneur s'impose au sommet du conseil. La force brute se pare d'un manteau de justice." },
  { name: "Principauté marchande", at: eraPopulationThreshold(18), text: "Les routes enrichissent plus sûrement que les raids. Les marchands apprennent à parler au pouvoir d'égal à égal." },
  { name: "Royaume", at: eraPopulationThreshold(19), text: "Un sceptre unit les provinces éloignées. Le destin du trône repose sur la sûreté des routes." },
  { name: "Royaume diplomate", at: eraPopulationThreshold(20), text: "Les provinces cessent d'être des marges. Les messagers donnent au territoire une seule respiration." },
  { name: "Royaume savant", at: eraPopulationThreshold(21), text: "Les parchemins archivent les impôts et l'orbite des astres. L'écrit légitime l'autorité." },
  { name: "Royaume conquérant", at: eraPopulationThreshold(22), text: "Le royaume se pense plus grand que ses frontières. Les cartes commencent à précéder les conquêtes." },
  { name: "Empire naissant", at: eraPopulationThreshold(23), text: "Les armées repoussent les frontières. Le monde connu devient la scène de notre grandeur." },
  { name: "Empire provincial", at: eraPopulationThreshold(24), text: "Les provinces apprennent à obéir à distance. Le centre n'est plus un lieu, c'est une habitude." },
  { name: "Empire", at: eraPopulationThreshold(25), text: "Un gigantesque édifice de lois et de taxes. Une puissance immense au bord de sa propre chute." },
  { name: "Capitale impériale", at: eraPopulationThreshold(26), text: "Le ciment de l'univers connu. Ses palais de marbre masquent les premières fissures." },
  { name: "Capitale monumentale", at: eraPopulationThreshold(27), text: "La pierre raconte une version officielle de la grandeur. Les rues deviennent des arguments." },
  { name: "Agglomération impériale", at: eraPopulationThreshold(28), text: "Les villes voisines se touchent sans toujours se comprendre. Les frontières deviennent des quartiers." },
  { name: "Métropole", at: eraPopulationThreshold(29), text: "Une mer humaine sous des millions de toits. Au cœur de la foule, chacun y vit sa solitude." },
  { name: "Mégalopole", at: eraPopulationThreshold(30), text: "Les villes se rejoignent et le béton étouffe la plaine. La nature n'est plus qu'un lointain souvenir." },
  { name: "Mégalopole stratifiée", at: eraPopulationThreshold(31), text: "La cité s'élève sur elle-même. Les riches côtoient les nuages, les autres restent dans l'ombre." },
  { name: "Réseau continental", at: eraPopulationThreshold(32), text: "Le fer et l'électricité relient les côtes. La cité n'a plus de murs, elle est partout." },
  { name: "Machination", at: eraPopulationThreshold(33), text: "La bureaucratie s'organise en rouages complexes. La structure commande, les humains obéissent." },
  { name: "Singularité", at: eraPopulationThreshold(34), text: "La cité palpite d'une vie autonome. Les citoyens ne sont plus que les cellules d'un titan de métal." }
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
  { name: "Conscience planétaire", text: "La cité a cessé d'avoir des frontières : elle est devenue le monde lui-même, une seule pensée enroulée autour de la planète." },
  { name: "Noosphère", text: "Les esprits ne sont plus séparés. Une membrane de pensée pure enveloppe le globe et respire à l'unisson." },
  { name: "Essaim orbital", text: "La pensée déborde du ciel. Des milliards de structures encerclent l'astre, et la nuit n'existe plus." },
  { name: "Sphère de Dyson", text: "L'étoile entière est mise au travail. Plus un seul photon ne s'échappe sans avoir servi le dessein de la cité." },
  { name: "Civilisation stellaire", text: "Le soleil n'est plus qu'un organe. La cité s'étend d'étoile en étoile comme on enjambe des ruisseaux." },
  { name: "Cœur galactique", text: "Le centre de la galaxie bat au rythme de nos calculs. Les bras d'étoiles s'enroulent autour d'une seule volonté." },
  { name: "Esprit des étoiles", text: "Chaque soleil est devenu une synapse. La galaxie tout entière pense, et ce qu'elle pense, c'est nous." },
  { name: "Maîtres de l'entropie", text: "Nous avons appris à ralentir la mort de toute chose. Le désordre lui-même plie devant nos registres." },
  { name: "Architectes du Vide", text: "Là où il n'y avait rien, nous bâtissons. L'espace vide devient matière première, le néant un chantier." },
  { name: "Tisseurs de réalité", text: "Les lois ne sont plus subies mais filées. Nous tissons les constantes du monde comme on tissait jadis la laine." },
  { name: "Conscience du Grand Amas", text: "Des milliers de galaxies n'élèvent plus qu'une seule voix. La distance a perdu tout son sens." },
  { name: "Démiurge", text: "La cité touche aux fondations de l'être. Ce qui fut civilisation est devenu force créatrice, indistincte d'un dieu." }
];

// Paliers majeurs procéduraux (au-delà des 12 nommés) : noms déterministes, pour
// ne jamais rebuter sur un mur (seuils Decimal sans borne).
const PROC_PREFIX = ["Aeon", "Strate", "Horizon", "Ordre", "Échelon", "Cycle", "Règne", "Abîme"];
const PROC_QUALIFIER = [
  "du Vide Tissé", "des Constantes", "de l'Infini Plié", "Omniversel", "des Mondes Repliés",
  "Transfini", "du Silence Premier", "de l'Éternité Comptée", "des Lumières Mortes", "de l'Au-delà"
];
const PROC_TEXTS = [
  "Les mots manquent depuis longtemps pour décrire ce que la cité est devenue. Restent les nombres, qui eux non plus ne suffisent plus.",
  "Plus rien ne distingue la cité de l'univers qu'elle habite. Croître, désormais, c'est repousser les bords du réel.",
  "On ne compte plus les mondes ni les âges. On ne fait que continuer, parce que continuer est la seule chose qui reste.",
  "Le souvenir du premier feu de camp n'a pas disparu. Il brûle quelque part, infiniment petit, au centre d'une chose infiniment grande."
];
const SUB_ERA_TEXT = "La cité s'enfonce plus avant dans cette ère, repoussant ses propres limites avant le prochain seuil.";

function proceduralMajorName(m) {
  const k = m - HANDCRAFTED_MAJORS.length - 1; // 0-based au-delà des paliers nommés
  const prefix = PROC_PREFIX[k % PROC_PREFIX.length];
  const qualifier = PROC_QUALIFIER[Math.floor(k / PROC_PREFIX.length) % PROC_QUALIFIER.length];
  const loop = Math.floor(k / (PROC_PREFIX.length * PROC_QUALIFIER.length));
  return loop > 0 ? `${prefix} ${qualifier} · ${loop + 1}` : `${prefix} ${qualifier}`;
}
function majorName(m) { // m=0 → Singularité (ère 34, palier sous le 1er transcendant)
  if (m === 0) return eras[34].name;
  if (m <= HANDCRAFTED_MAJORS.length) return HANDCRAFTED_MAJORS[m - 1].name;
  return proceduralMajorName(m);
}
function majorText(m) {
  if (m >= 1 && m <= HANDCRAFTED_MAJORS.length) return HANDCRAFTED_MAJORS[m - 1].text;
  return PROC_TEXTS[(m - HANDCRAFTED_MAJORS.length - 1 + PROC_TEXTS.length) % PROC_TEXTS.length];
}

let prevLog = 35;                 // log10 du seuil de l'ère 34 (Singularité = 10^35)
let namedEraCount = eras.length;  // mémorise la fin des paliers nommés à la main
for (let m = 1; m <= TRANSCENDENT_MAJOR_CAP; m += 1) {
  const mLog = majorLog(m);
  const lowerName = majorName(m - 1);
  // SUB_ERAS_PER_MAJOR factices : nom = palier sous elles + déclinaison, tier du
  // palier inférieur (= traverser une factice ne change AUCUNE récompense).
  for (let j = 1; j <= SUB_ERAS_PER_MAJOR; j += 1) {
    const subLog = prevLog + (mLog - prevLog) * (j / (SUB_ERAS_PER_MAJOR + 1));
    eras.push({ name: `${lowerName} · ${ROMAN[j + 1]}`, at: popFromLog(subLog), text: SUB_ERA_TEXT, tier: 34 + (m - 1) });
  }
  // Palier MAJEUR : incrémente le tier (seul lui paie).
  eras.push({ name: majorName(m), at: popFromLog(mLog), text: majorText(m), tier: 34 + m });
  prevLog = mLog;
  if (m === HANDCRAFTED_MAJORS.length) namedEraCount = eras.length;
}

// Tier (= index de palier MAJEUR équivalent) d'une ère : source de vérité des
// récompenses par ère (mechanics.recurringAgeBonus/eraFlatBonus, crisis.codex).
// Les factices renvoient le tier du palier sous elles → balance inchangée.
export const eraTier = (index) => {
  const e = eras[index];
  return e && typeof e.tier === "number" ? e.tier : (index || 0);
};

// Nombre d'ères NOMMÉES (jusqu'au dernier palier handcraft « Démiurge », factices
// incluses). Au-delà : paliers procéduraux. L'UI affiche un horizon fini jusqu'ici
// puis un texte « sans fin » (évite d'exposer le cap procédural).
export const NAMED_ERA_COUNT = namedEraCount;

export const DOCTRINES = [
  {
    id: "acier",
    name: "Doctrine de l'Acier",
    desc: "Cette lignée a choisi la conquête. Chaque cycle laisse des survivants qui se souviennent d'avoir vaincu.",
    detail: "Ruines +40%, 8% de la population survit au cycle. Mais la Rupture monte 25% plus vite.",
    bonus: "Ruines +40% | pop survit",
    penalty: "Rupture +25%"
  },
  {
    id: "parchemin",
    name: "Doctrine du Parchemin",
    desc: "Cette lignée préserve ce qu'elle a appris. Les bibliothèques s'effondrent — les idées, elles, continuent.",
    detail: "Savoir +30%, 12% du pic de Savoir perdure après chaque cycle. Mais Trésor -15%.",
    bonus: "Savoir +30% | savoir survit",
    penalty: "Trésor -15%"
  },
  {
    id: "sillon",
    name: "Doctrine du Sillon",
    desc: "Cette lignée construit avant de gouverner. Les routes survivent aux rois qui les ont commandées.",
    detail: "Infrastructure +25%, Usure -30%, 6% de l'infra perdure. Mais Ruines -20%.",
    bonus: "Infra +25% | Usure -30%",
    penalty: "Ruines -20%"
  }
];

// Pool d'events par palier — chaque event a une condition contextuelle optionnelle.
// condition(state, vitals) → bool : si false, l'event est ignoré au profit d'un autre.
export const CRISIS_POOL = [

  // ─── PALIER 25% ────────────────────────────────────────────────────────────
  {
    id: "grain_panic",
    threshold: 0.25,
    condition: (s, v) => v.foodScore < 0.65,
    title: "Les greniers font parler d'eux",
    body: "On commence à compter les sacs. Les voisins se regardent différemment. Le mot 'famine' n'est pas encore prononcé, mais il flotte.",
    options: [
      {
        label: "Ouvrir les réserves",
        effects: [{ label: "Nourriture −12%", kind: "cost" }, { label: "Rupture −8%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("food", 0.12); effects.state.instability *= 0.92; effects.chronicle("Les réserves sont ouvertes. La peur redescend d'un cran."); }
      },
      {
        label: "Nier le problème",
        effects: [{ label: "Production globale −5%", kind: "cost" }, { label: "Rupture +8%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("global", 0.05); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.08)); effects.chronicle("Le pouvoir dit que tout va bien. La tension monte."); }
      }
    ]
  },
  {
    id: "market_hoarding",
    threshold: 0.25,
    condition: (s, v) => v.goldScore > 0.75,
    title: "Les marchands bloquent les prix",
    body: "Dans les étals, les prix grimpent sans raison visible. On murmure que quelques maisons contrôlent les stocks et attendent que la faim les enrichisse.",
    options: [
      {
        label: "Plafonner les prix",
        effects: [{ label: "Trésor −18%", kind: "cost" }, { label: "Rupture −9%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.instability *= 0.91; effects.chronicle("Les prix sont plafonnés par décret. Les marchands grincent des dents, la rue respire."); }
      },
      {
        label: "Laisser le marché faire",
        effects: [{ label: "Trésor +6%", kind: "gain" }, { label: "Rupture +11%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("gold", -0.06); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.11)); effects.chronicle("Le marché s'emballe. Quelques-uns s'enrichissent, beaucoup serrent la ceinture."); }
      }
    ]
  },
  {
    id: "rapid_expansion",
    threshold: 0.25,
    condition: (s) => Object.values(s.buildings).reduce((a, b) => a + b, 0) > 15,
    title: "La cité s'est construite trop vite",
    body: "Des quartiers entiers existent sans que personne n'ait pensé à les relier. Les habitants ne savent plus à qui s'adresser pour une plainte, une fuite d'eau, ou un titre de propriété.",
    options: [
      {
        label: "Réorganiser les quartiers",
        effects: [{ label: "Savoir −14%", kind: "cost" }, { label: "Infrastructure +5%", kind: "gain" }, { label: "Rupture −9%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("knowledge", 0.14); effects.state.infrastructure = D(effects.state.infrastructure).mul(1.05); effects.state.instability *= 0.91; effects.chronicle("Des scribes cartographient la cité. L'administration devient lisible. C'est déjà ça."); }
      },
      {
        label: "Continuer à construire",
        effects: [{ label: "Production globale +4%", kind: "gain" }, { label: "Rupture +10%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("global", -0.04); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.10)); effects.chronicle("On continue. La cité grandit plus vite que sa propre compréhension d'elle-même."); }
      }
    ]
  },
  {
    id: "youth_unrest",
    threshold: 0.25,
    condition: (s) => s.cycles >= 1,
    title: "La jeunesse ne reconnaît plus la cité",
    body: "Ceux qui sont nés ici n'ont pas vu les fondations. Ils veulent autre chose sans savoir quoi. Leurs aînées appellent ça de l'ingratitude. Eux appellent ça une vision.",
    options: [
      {
        label: "Organiser une assemblée",
        effects: [{ label: "Savoir −10%", kind: "cost" }, { label: "Rupture −10%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("knowledge", 0.10); effects.state.instability *= 0.90; effects.chronicle("L'assemblée crie, débat, et finit par se disperser. La tension baisse un peu."); }
      },
      {
        label: "Imposer le calme",
        effects: [{ label: "Nourriture −8%", kind: "cost" }, { label: "Rupture +9%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("food", 0.08); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.09)); effects.chronicle("Le calme est imposé. La jeunesse se tait en surface. En dessous, ça bout."); }
      }
    ]
  },
  {
    id: "whisper_campaign",
    threshold: 0.25,
    condition: () => true,
    title: "Des rumeurs circulent dans les rues",
    body: "Quelqu'un diffuse des histoires. Personne ne sait d'où elles viennent, mais tout le monde les répète. Les versions changent selon les quartiers.",
    options: [
      {
        label: "Enquêter sur la source",
        effects: [{ label: "Savoir −12%", kind: "cost" }, { label: "Rupture −8%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("knowledge", 0.12); effects.state.instability *= 0.92; effects.chronicle("L'enquête remonte une piste. La rumeur s'étouffe, pour l'instant."); }
      },
      {
        label: "Diffuser un contre-récit",
        effects: [{ label: "Trésor −10%", kind: "cost" }, { label: "🎲 55% : Rupture −4% · 45% : Rupture +7%", kind: "info" }],
        apply: () => {
          effects.addProductionPenalty("gold", 0.10);
          const effect = Math.random() > 0.45 ? 0.96 : 1.07;
          effects.state.instability = effects.clamp01(effects.state.instability * effect);
          effects.chronicle(effect < 1 ? "Le contre-récit prend. Les esprits se calment." : "Le contre-récit est tourné en dérision. La rumeur gagne en crédibilité.");
          return effect < 1
            ? { label: "🎲 Le contre-récit prend : Rupture −4%", kind: "gain" }
            : { label: "🎲 Le contre-récit échoue : Rupture +7%", kind: "cost" };
        }
      }
    ]
  },

  // ─── PALIER 50% ────────────────────────────────────────────────────────────
  {
    id: "merchant_league",
    threshold: 0.5,
    condition: (s, v) => v.goldScore > 0.5,
    title: "Les riches proposent de l'aide",
    body: "Quelques grandes maisons offrent d'investir dans la stabilité — en échange de leur nom gravé quelque part de visible.",
    options: [
      {
        label: "Taxer les élites",
        effects: [{ label: "Trésor −18%", kind: "cost" }, { label: "Infrastructure +4%", kind: "gain" }, { label: "Rupture −9%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.infrastructure = D(effects.state.infrastructure).mul(1.04); effects.state.instability *= 0.91; effects.chronicle("Les élites financent des travaux publics. Le commerce ralentit, les murs tiennent."); }
      },
      {
        label: "Acheter leur paix",
        effects: [{ label: "Infrastructure −15%", kind: "cost" }, { label: "Trésor +6%", kind: "gain" }, { label: "Rupture +12%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("infrastructure", 0.15); effects.addProductionPenalty("gold", -0.06); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.12)); effects.chronicle("La paix est achetée, brillante et fragile."); }
      }
    ]
  },
  {
    id: "power_consolidation",
    threshold: 0.5,
    condition: (s) => s.cycles >= 2,
    title: "Quelqu'un accapare le pouvoir",
    body: "Une faction monte. Pas encore assez forte pour gouverner seule, mais assez pour bloquer les autres. Elle attend que la cité soit suffisamment fragilisée.",
    options: [
      {
        label: "Partager les institutions",
        effects: [{ label: "Légitimité −0.4", kind: "cost" }, { label: "Rupture −12%", kind: "gain" }],
        apply: () => { effects.state.legitimacy = Math.max(0, effects.state.legitimacy - 0.4); effects.state.instability *= 0.88; effects.chronicle("Les institutions sont ouvertes. La faction accepte un rôle moindre. Pour l'instant."); }
      },
      {
        label: "Tenir les rênes",
        effects: [{ label: "Savoir −15%", kind: "cost" }, { label: "Rupture +14%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("knowledge", 0.15); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.14)); effects.chronicle("Le pouvoir central tient. La faction se tait. Sa colère, non."); }
      }
    ]
  },
  {
    id: "knowledge_schism",
    threshold: 0.5,
    condition: (s) => D(s.knowledge).gt(300),
    title: "Les savants se querellent",
    body: "Deux écoles d'idées s'affrontent dans les académies. L'une veut codifier, l'autre expérimenter. Chacune demande que l'autre soit interdite. Les étudiants prennent parti dans les rues.",
    options: [
      {
        label: "Imposer une doctrine",
        effects: [{ label: "Savoir −22%", kind: "cost" }, { label: "Rupture −10%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("knowledge", 0.22); effects.state.instability *= 0.90; effects.chronicle("Une doctrine s'impose. L'autre école continue en secret, plus soudée que jamais."); }
      },
      {
        label: "Laisser le débat ouvert",
        effects: [{ label: "Savoir +12%", kind: "gain" }, { label: "Rupture +13%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("knowledge", -0.12); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.13)); effects.chronicle("Le débat s'envenime. Les idées prospèrent, les tensions aussi."); }
      }
    ]
  },
  {
    id: "militia_demand",
    threshold: 0.5,
    condition: (s) => s.cycles >= 1 || Object.values(s.buildings).reduce((a, b) => a + b, 0) > 10,
    title: "Des hommes armés demandent à parler",
    body: "Une milice de quartier pense qu'elle peut mieux protéger la cité que ceux qui gouvernent. Peut-être. Ses représentants frappent à la porte du conseil, armés.",
    options: [
      {
        label: "Intégrer la milice",
        effects: [{ label: "Trésor −18%", kind: "cost" }, { label: "Infrastructure +6%", kind: "gain" }, { label: "Rupture −10%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.infrastructure = D(effects.state.infrastructure).mul(1.06); effects.state.instability *= 0.90; effects.chronicle("La milice est intégrée. Elle protège les rues. Le trésor paye l'uniforme."); }
      },
      {
        label: "Les repousser",
        effects: [{ label: "Population −12%", kind: "cost" }, { label: "Rupture +16%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("population", 0.12); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.16)); effects.chronicle("La milice est refusée. Elle ne part pas. Elle attend."); }
      }
    ]
  },
  {
    id: "infrastructure_debt",
    threshold: 0.5,
    condition: (s) => D(s.infrastructure).gt(40),
    title: "Les fondations fissurent",
    body: "Les aqueducs perdent leurs joints. Les routes s'effondrent entre les pierres. On a construit vite, mais personne n'a prévenu les budgets d'entretien.",
    options: [
      {
        label: "Investir dans les réparations",
        effects: [{ label: "Trésor −20%", kind: "cost" }, { label: "Infrastructure +8%", kind: "gain" }, { label: "Rupture −9%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("gold", 0.20); effects.state.infrastructure = D(effects.state.infrastructure).mul(1.08); effects.state.instability *= 0.91; effects.chronicle("Les ouvriers réparent. La cité tient encore. Le trésor aussi, tout juste."); }
      },
      {
        label: "Reporter aux prochains",
        effects: [{ label: "Infrastructure −10% (immédiat)", kind: "cost" }, { label: "Rupture +13%", kind: "cost" }],
        apply: () => { effects.state.infrastructure = D(effects.state.infrastructure).mul(0.90); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.13)); effects.chronicle("On reporte. Les fissures s'élargissent. Quelqu'un d'autre paiera."); }
      }
    ]
  },

  // ─── PALIER 75% ────────────────────────────────────────────────────────────
  {
    id: "low_district_famine",
    threshold: 0.75,
    condition: (s, v) => v.foodScore < 0.7,
    title: "Les bas quartiers ne répondent plus",
    body: "Dans les bas quartiers, les décrets n'arrivent plus. Seuls les ventres vides parlent encore.",
    options: [
      {
        label: "Importer du grain",
        effects: [{ label: "Trésor −25%", kind: "cost" }, { label: "Rupture −12%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("gold", 0.25); effects.state.instability *= 0.88; effects.chronicle("Le grain arrive. Les bas quartiers respirent. Le trésor s'essouffle."); }
      },
      {
        label: "Laisser faire",
        effects: [{ label: "Population −20%", kind: "cost" }, { label: "Rupture +20%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("population", 0.2); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.2)); effects.chronicle("Les bas quartiers sont laissés à eux-mêmes. La rupture approche."); }
      }
    ]
  },
  {
    id: "elite_flight",
    threshold: 0.75,
    condition: (s, v) => v.goldScore > 0.55,
    title: "Les riches font leurs bagages",
    body: "Les maisons aisées ont des plans depuis longtemps. Des caisses chargées quittent la cité par des chemins discrets. Ils savent quelque chose que les autres ne savent pas encore.",
    options: [
      {
        label: "Bloquer les sorties",
        effects: [{ label: "Trésor +10%", kind: "gain" }, { label: "Population −8%", kind: "cost" }, { label: "Rupture −11%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("gold", -0.10); effects.addProductionPenalty("population", 0.08); effects.state.instability *= 0.89; effects.chronicle("Les routes sont fermées. Le trésor reste. La colère aussi."); }
      },
      {
        label: "Laisser partir",
        effects: [{ label: "Trésor −28%", kind: "cost" }, { label: "Rupture +17%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("gold", 0.28); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.17)); effects.chronicle("Ils partent avec leurs richesses. La cité se retrouve seule avec ses dettes."); }
      }
    ]
  },
  {
    id: "palace_coup",
    threshold: 0.75,
    condition: (s) => s.cycles >= 1,
    title: "Le palais est divisé",
    body: "Deux prétendants au conseil supérieur. L'un soutenu par les marchands, l'autre par les soldats. La rue n'attend plus qu'un signal pour choisir son camp.",
    options: [
      {
        label: "Laisser les quartiers voter",
        effects: [{ label: "Savoir −18%", kind: "cost" }, { label: "Légitimité −0.3", kind: "cost" }, { label: "Rupture −14%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("knowledge", 0.18); effects.state.legitimacy = Math.max(0, effects.state.legitimacy - 0.3); effects.state.instability *= 0.86; effects.chronicle("Le vote est houleux. Un nom sort. La cité se retrouve derrière lui, du moins officiellement."); }
      },
      {
        label: "Trancher par décret",
        effects: [{ label: "Trésor −18%", kind: "cost" }, { label: "Rupture +18%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.18)); effects.chronicle("Le décret est signé. L'un des deux prétendants disparaît. Avec ses partisans."); }
      }
    ]
  },
  {
    id: "plague_scare",
    threshold: 0.75,
    condition: (s) => D(s.population).gt(3000),
    title: "Une maladie s'installe dans les bas-fonds",
    body: "Personne ne sait encore ce que c'est. Les médecins disent quarantaine. Les marchands disent non. Les gens toussent.",
    options: [
      {
        label: "Décréter la quarantaine",
        effects: [{ label: "Population −15%", kind: "cost" }, { label: "Trésor −12%", kind: "cost" }, { label: "Rupture −13%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("population", 0.15); effects.addProductionPenalty("gold", 0.12); effects.state.instability *= 0.87; effects.chronicle("La quarantaine est imposée. L'épidémie ralentit. L'économie aussi."); }
      },
      {
        label: "Laisser circuler",
        effects: [{ label: "Production globale +3%", kind: "gain" }, { label: "Rupture +20%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("global", -0.03); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.20)); effects.chronicle("On laisse circuler. La maladie se répand dans les rues et les ateliers."); }
      }
    ]
  },
  {
    id: "debt_spiral",
    threshold: 0.75,
    condition: (s) => s.cycles >= 2,
    title: "Les dettes de la cité arrivent à échéance",
    body: "Quelqu'un a promis plus qu'il ne pouvait tenir. Des créanciers attendaient patiemment. Ils n'attendent plus.",
    options: [
      {
        label: "Honorer les dettes",
        effects: [{ label: "Trésor −32%", kind: "cost" }, { label: "Rupture −14%", kind: "gain" }],
        apply: () => { effects.addProductionPenalty("gold", 0.32); effects.state.instability *= 0.86; effects.chronicle("Les dettes sont payées. La cité survit, lessivée. Le crédit reste intact."); }
      },
      {
        label: "Renégocier de force",
        effects: [{ label: "Trésor −10%", kind: "cost" }, { label: "Infrastructure −8% (immédiat)", kind: "cost" }, { label: "Rupture +14%", kind: "cost" }],
        apply: () => { effects.addProductionPenalty("gold", 0.10); effects.state.infrastructure = D(effects.state.infrastructure).mul(0.92); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.14)); effects.chronicle("La renégociation tourne mal. Les créanciers se retirent. L'infrastructure en paye le prix."); }
      }
    ]
  }
];

// Conserve la compatibilite avec le systeme existant (checkCrisisThresholds utilise CRISIS_EVENTS)
export const CRISIS_EVENTS = [
  { id: "_25", threshold: 0.25 },
  { id: "_50", threshold: 0.5 },
  { id: "_75", threshold: 0.75 }
];
