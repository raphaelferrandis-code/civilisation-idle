"use strict";

import { effects } from './worldEffects.js';

/* ============================================================================
 * data-world.js - Donnees monde: eras, DOCTRINES, CRISIS_POOL, CRISIS_EVENTS.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

export const eras = [
  { name: "Campement", at: 10, text: "Un cercle de pierres et quelques braises. L'aube de notre histoire s'éveille dans l'obscurité." },
  { name: "Feux dispersés", at: 120, text: "Quelques foyers tiennent la nuit à distance. Les vivants commencent à revenir aux mêmes endroits." },
  { name: "Abris saisonniers", at: 300, text: "Les huttes ne sont plus seulement des refuges. On y laisse des outils, des traces, des promesses de retour." },
  { name: "Clan des foyers", at: 700, text: "Des familles se rassemblent sous les étoiles. Les premiers récits forgent nos liens." },
  { name: "Lignée des huttes", at: 1200, text: "Les enfants reconnaissent les chemins avant d'en comprendre le nom. Le lieu commence à précéder ceux qui l'habitent." },
  { name: "Hameau", at: 2000, text: "Les huttes s'alignent et les premiers sentiers dessinent les contours du destin commun." },
  { name: "Hameau palissadé", at: 3800, text: "Une enceinte basse protège les réserves et les peurs. Entrer et sortir devient une décision." },
  { name: "Village", at: 6500, text: "La terre est partagée. Plus les réserves se remplissent, plus la peur de les perdre grandit." },
  { name: "Village des greniers", at: 11000, text: "Les stocks ont leurs gardiens. La faim recule assez pour que la politique apparaisse." },
  { name: "Bourg agricole", at: 20000, text: "Le rythme de la faucille et du blé dicte le temps. La terre façonne la communauté." },
  { name: "Bourg des artisans", at: 40000, text: "Certains ne cultivent plus. Leurs mains transforment ce que d'autres récoltent, et la cité apprend la spécialisation." },
  { name: "Bourg marchand", at: 80000, text: "Le troc laisse place au commerce. L'or et l'étranger apportent de nouveaux horizons." },
  { name: "Cité des marchés", at: 140000, text: "Les places publiques dictent le rythme des journées. On y vend des biens, mais surtout des possibilités." },
  { name: "Cité des greniers", at: 250000, text: "Les silos débordent pour conjurer les disettes. Le pouvoir naît de la clé des réserves." },
  { name: "Cité des canaux", at: 450000, text: "L'eau suit des lignes tracées par la volonté humaine. La terre obéit mieux quand on lui indique où aller." },
  { name: "Cité fortifiée", at: 800000, text: "Les premières murailles s'élèvent. Pour protéger les nôtres, nous inventons l'ennemi." },
  { name: "Cité administrative", at: 1500000, text: "Les tablettes circulent presque autant que les marchandises. Gouverner devient une affaire de listes." },
  { name: "Principauté", at: 3000000, text: "Un seigneur s'impose au sommet du conseil. La force brute se pare d'un manteau de justice." },
  { name: "Principauté marchande", at: 5500000, text: "Les routes enrichissent plus sûrement que les raids. Les marchands apprennent à parler au pouvoir d'égal à égal." },
  { name: "Royaume", at: 9000000, text: "Un sceptre unit les provinces éloignées. Le destin du trône repose sur la sûreté des routes." },
  { name: "Royaume des routes", at: 15000000, text: "Les provinces cessent d'être des marges. Les messagers donnent au territoire une seule respiration." },
  { name: "Royaume savant", at: 25000000, text: "Les parchemins archivent les impôts et l'orbite des astres. L'écrit légitime l'autorité." },
  { name: "Couronne impériale", at: 45000000, text: "Le royaume se pense plus grand que ses frontières. Les cartes commencent à précéder les conquêtes." },
  { name: "Empire naissant", at: 80000000, text: "Les armées repoussent les frontières. Le monde connu devient la scène de notre grandeur." },
  { name: "Empire provincial", at: 140000000, text: "Les provinces apprennent à obéir à distance. Le centre n'est plus un lieu, c'est une habitude." },
  { name: "Empire", at: 220000000, text: "Un gigantesque édifice de lois et de taxes. Une puissance immense au bord de sa propre chute." },
  { name: "Capitale monumentale", at: 400000000, text: "La pierre raconte une version officielle de la grandeur. Les rues deviennent des arguments." },
  { name: "Capitale impériale", at: 650000000, text: "Le ciment de l'univers connu. Ses palais de marbre masquent les premières fissures." },
  { name: "Conurbation", at: 1200000000, text: "Les villes voisines se touchent sans toujours se comprendre. Les frontières deviennent des quartiers." },
  { name: "Métropole", at: 2000000000, text: "Une mer humaine sous des millions de toits. Au cœur de la foule, chacun y vit sa solitude." },
  { name: "Mégalopole", at: 5000000000, text: "Les villes se rejoignent et le béton étouffe la plaine. La nature n'est plus qu'un lointain souvenir." },
  { name: "Mégalopole stratifiée", at: 10000000000, text: "La cité s'élève sur elle-même. Les riches côtoient les nuages, les autres restent dans l'ombre." },
  { name: "Réseau continental", at: 25000000000, text: "Le fer et l'électricité relient les côtes. La cité n'a plus de murs, elle est partout." },
  { name: "Machine civique", at: 60000000000, text: "La bureaucratie s'organise en rouages complexes. La structure commande, les humains obéissent." },
  { name: "Singularité civique", at: 150000000000, text: "La cité palpite d'une vie autonome. Les citoyens ne sont plus que les cellules d'un titan de métal." }
];
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
        detail: "Nourriture -12% ce cycle, Rupture -8%.",
        apply: () => { effects.addProductionPenalty("food", 0.12); effects.state.instability *= 0.92; effects.chronicle("Les réserves sont ouvertes. La peur redescend d'un cran."); }
      },
      {
        label: "Nier le problème",
        detail: "Production globale -5% ce cycle, Rupture +8%.",
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
        detail: "Trésor -18% ce cycle, Rupture -9%.",
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.instability *= 0.91; effects.chronicle("Les prix sont plafonnés par décret. Les marchands grincent des dents, la rue respire."); }
      },
      {
        label: "Laisser le marché faire",
        detail: "Trésor +6% ce cycle, Rupture +11%.",
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
        detail: "Savoir -14% ce cycle, Infrastructure +5%, Rupture -9%.",
        apply: () => { effects.addProductionPenalty("knowledge", 0.14); effects.state.infrastructure *= 1.05; effects.state.instability *= 0.91; effects.chronicle("Des scribes cartographient la cité. L'administration devient lisible. C'est déjà ça."); }
      },
      {
        label: "Continuer à construire",
        detail: "Production globale +4% ce cycle, Rupture +10%.",
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
        detail: "Savoir -10% ce cycle, Rupture -10%.",
        apply: () => { effects.addProductionPenalty("knowledge", 0.10); effects.state.instability *= 0.90; effects.chronicle("L'assemblée crie, débat, et finit par se disperser. La tension baisse un peu."); }
      },
      {
        label: "Imposer le calme",
        detail: "Nourriture -8% ce cycle, Rupture +9%.",
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
        detail: "Savoir -12% ce cycle, Rupture -8%.",
        apply: () => { effects.addProductionPenalty("knowledge", 0.12); effects.state.instability *= 0.92; effects.chronicle("L'enquête remonte une piste. La rumeur s'étouffe, pour l'instant."); }
      },
      {
        label: "Diffuser un contre-récit",
        detail: "Trésor -10% ce cycle, Rupture +7% ou -4% (aléa).",
        apply: () => { effects.addProductionPenalty("gold", 0.10); const effect = Math.random() > 0.45 ? 0.96 : 1.07; effects.state.instability = effects.clamp01(effects.state.instability * effect); effects.chronicle(effect < 1 ? "Le contre-récit prend. Les esprits se calment." : "Le contre-récit est tourné en dérision. La rumeur gagne en crédibilité."); }
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
        detail: "Trésor -18% ce cycle, Infrastructure +4%, Rupture -9%.",
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.infrastructure *= 1.04; effects.state.instability *= 0.91; effects.chronicle("Les élites financent des travaux publics. Le commerce ralentit, les murs tiennent."); }
      },
      {
        label: "Acheter leur paix",
        detail: "Infrastructure -15% ce cycle, Trésor +6%, Rupture +12%.",
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
        detail: "Légitimité -0.4, Rupture -12%.",
        apply: () => { effects.state.legitimacy = Math.max(0, effects.state.legitimacy - 0.4); effects.state.instability *= 0.88; effects.chronicle("Les institutions sont ouvertes. La faction accepte un rôle moindre. Pour l'instant."); }
      },
      {
        label: "Tenir les rênes",
        detail: "Savoir -15% ce cycle, Rupture +14%.",
        apply: () => { effects.addProductionPenalty("knowledge", 0.15); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.14)); effects.chronicle("Le pouvoir central tient. La faction se tait. Sa colère, non."); }
      }
    ]
  },
  {
    id: "knowledge_schism",
    threshold: 0.5,
    condition: (s) => s.knowledge > 300,
    title: "Les savants se querellent",
    body: "Deux écoles d'idées s'affrontent dans les académies. L'une veut codifier, l'autre expérimenter. Chacune demande que l'autre soit interdite. Les étudiants prennent parti dans les rues.",
    options: [
      {
        label: "Imposer une doctrine",
        detail: "Savoir -22% ce cycle, Rupture -10%.",
        apply: () => { effects.addProductionPenalty("knowledge", 0.22); effects.state.instability *= 0.90; effects.chronicle("Une doctrine s'impose. L'autre école continue en secret, plus soudée que jamais."); }
      },
      {
        label: "Laisser le débat ouvert",
        detail: "Savoir +12% ce cycle, Rupture +13%.",
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
        detail: "Trésor -18% ce cycle, Infrastructure +6%, Rupture -10%.",
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.infrastructure *= 1.06; effects.state.instability *= 0.90; effects.chronicle("La milice est intégrée. Elle protège les rues. Le trésor paye l'uniforme."); }
      },
      {
        label: "Les repousser",
        detail: "Population -12% ce cycle, Rupture +16%.",
        apply: () => { effects.addProductionPenalty("population", 0.12); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.16)); effects.chronicle("La milice est refusée. Elle ne part pas. Elle attend."); }
      }
    ]
  },
  {
    id: "infrastructure_debt",
    threshold: 0.5,
    condition: (s) => s.infrastructure > 40,
    title: "Les fondations fissurent",
    body: "Les aqueducs perdent leurs joints. Les routes s'effondrent entre les pierres. On a construit vite, mais personne n'a prévenu les budgets d'entretien.",
    options: [
      {
        label: "Investir dans les réparations",
        detail: "Trésor -20% ce cycle, Infrastructure +8%, Rupture -9%.",
        apply: () => { effects.addProductionPenalty("gold", 0.20); effects.state.infrastructure *= 1.08; effects.state.instability *= 0.91; effects.chronicle("Les ouvriers réparent. La cité tient encore. Le trésor aussi, tout juste."); }
      },
      {
        label: "Reporter aux prochains",
        detail: "Infrastructure -10%, Rupture +13%.",
        apply: () => { effects.state.infrastructure *= 0.90; effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.13)); effects.chronicle("On reporte. Les fissures s'élargissent. Quelqu'un d'autre paiera."); }
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
        detail: "Trésor -25% ce cycle, Rupture -12%.",
        apply: () => { effects.addProductionPenalty("gold", 0.25); effects.state.instability *= 0.88; effects.chronicle("Le grain arrive. Les bas quartiers respirent. Le trésor s'essouffle."); }
      },
      {
        label: "Laisser faire",
        detail: "Population -20% ce cycle, Rupture +20%.",
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
        detail: "Trésor conservé +10%, Population -8% ce cycle, Rupture -11%.",
        apply: () => { effects.addProductionPenalty("gold", -0.10); effects.addProductionPenalty("population", 0.08); effects.state.instability *= 0.89; effects.chronicle("Les routes sont fermées. Le trésor reste. La colère aussi."); }
      },
      {
        label: "Laisser partir",
        detail: "Trésor -28% ce cycle, Rupture +17%.",
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
        detail: "Savoir -18% ce cycle, Légitimité -0.3, Rupture -14%.",
        apply: () => { effects.addProductionPenalty("knowledge", 0.18); effects.state.legitimacy = Math.max(0, effects.state.legitimacy - 0.3); effects.state.instability *= 0.86; effects.chronicle("Le vote est houleux. Un nom sort. La cité se retrouve derrière lui, du moins officiellement."); }
      },
      {
        label: "Trancher par décret",
        detail: "Trésor -18% ce cycle, Rupture +18%.",
        apply: () => { effects.addProductionPenalty("gold", 0.18); effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.18)); effects.chronicle("Le décret est signé. L'un des deux prétendants disparaît. Avec ses partisans."); }
      }
    ]
  },
  {
    id: "plague_scare",
    threshold: 0.75,
    condition: (s) => s.population > 3000,
    title: "Une maladie s'installe dans les bas-fonds",
    body: "Personne ne sait encore ce que c'est. Les médecins disent quarantaine. Les marchands disent non. Les gens toussent.",
    options: [
      {
        label: "Décréter la quarantaine",
        detail: "Population -15% ce cycle, Trésor -12%, Rupture -13%.",
        apply: () => { effects.addProductionPenalty("population", 0.15); effects.addProductionPenalty("gold", 0.12); effects.state.instability *= 0.87; effects.chronicle("La quarantaine est imposée. L'épidémie ralentit. L'économie aussi."); }
      },
      {
        label: "Laisser circuler",
        detail: "Production globale +3% ce cycle, Rupture +20%.",
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
        detail: "Trésor -32% ce cycle, Rupture -14%.",
        apply: () => { effects.addProductionPenalty("gold", 0.32); effects.state.instability *= 0.86; effects.chronicle("Les dettes sont payées. La cité survit, lessivée. Le crédit reste intact."); }
      },
      {
        label: "Renégocier de force",
        detail: "Trésor -10% ce cycle, Infrastructure -8%, Rupture +14%.",
        apply: () => { effects.addProductionPenalty("gold", 0.10); effects.state.infrastructure *= 0.92; effects.state.instability = effects.clamp01(effects.state.instability * effects.amplifyRuptureFactor(1.14)); effects.chronicle("La renégociation tourne mal. Les créanciers se retirent. L'infrastructure en paye le prix."); }
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
