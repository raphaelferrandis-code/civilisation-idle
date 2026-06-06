"use strict";

/* ============================================================================
 * data-world.js - Donnees monde: eras, DOCTRINES, CRISIS_POOL, CRISIS_EVENTS.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

const eras = [
  { name: "Campement", at: 0, text: "Le feu brule encore. C'est un debut." },
  { name: "Clan des foyers", at: 700, text: "Quelques familles restent pres des braises. On reconnait les voix dans la nuit." },
  { name: "Hameau", at: 2000, text: "Les abris se rapprochent. Les premiers chemins apparaissent entre les portes." },
  { name: "Village", at: 6500, text: "Quand on commence a stocker, on commence aussi a craindre." },
  { name: "Bourg agricole", at: 20000, text: "Les champs entourent les maisons. La saison devient une affaire commune." },
  { name: "Bourg marchand", at: 80000, text: "Les routes attirent les etrangers. Les prix voyagent plus vite que les nouvelles." },
  { name: "Cite des greniers", at: 250000, text: "Les reserves promettent demain. Elles donnent aussi un pouvoir a ceux qui les gardent." },
  { name: "Cite fortifiee", at: 800000, text: "Les murs promettent la securite. Ils inventent aussi l'ennemi." },
  { name: "Principaute", at: 3000000, text: "Quelqu'un a decide de mettre de l'ordre. Les autres ont paye pour voir." },
  { name: "Royaume", at: 9000000, text: "Les routes obeissent a la couronne, et la couronne depend des routes." },
  { name: "Royaume savant", at: 25000000, text: "Les scribes donnent une memoire aux lois. Les lois donnent une forme au pouvoir." },
  { name: "Empire naissant", at: 80000000, text: "La carte s'agrandit. Les consequences aussi." },
  { name: "Empire", at: 220000000, text: "Tout est connecte. C'est sa force et sa fragilite." },
  { name: "Capitale imperiale", at: 650000000, text: "La ville n'est plus seulement habitee. Elle commande l'horizon." },
  { name: "Metropole", at: 2000000000, text: "Les quartiers ont leurs propres rythmes. On nait dans une ville qu'on ne verra jamais entiere." },
  { name: "Megalopole", at: 5000000000, text: "Personne ne comprend entierement comment ca marche. Tout le monde en depend." },
  { name: "Megalopole stratifiée", at: 10000000000, text: "Les anciennes rues dorment sous les nouvelles avenues." },
  { name: "Reseau continental", at: 25000000000, text: "La cite deborde de sa carte. Ses faubourgs deviennent des provinces." },
  { name: "Machine civique", at: 60000000000, text: "Les decisions se prennent dans des salles que personne ne peut toutes nommer." },
  { name: "Singularite civique", at: 150000000000, text: "Les decisions se prennent plus vite que les consequences ne peuvent etre imaginees." }
];

const DOCTRINES = [
  {
    id: "acier",
    name: "Doctrine de l'Acier",
    desc: "Cette lignee a choisi la conquete. Chaque cycle laisse des survivants qui se souviennent d'avoir vaincu.",
    detail: "Ruines +40%, 8% de la population survit au cycle. Mais la Rupture monte 25% plus vite.",
    bonus: "Ruines +40% | pop survit",
    penalty: "Rupture +25%"
  },
  {
    id: "parchemin",
    name: "Doctrine du Parchemin",
    desc: "Cette lignee preserve ce qu'elle a appris. Les bibliotheques s'effondrent — les idees, elles, continuent.",
    detail: "Savoir +30%, 12% du pic de Savoir perdure apres chaque cycle. Mais Tresor -15%.",
    bonus: "Savoir +30% | savoir survit",
    penalty: "Tresor -15%"
  },
  {
    id: "sillon",
    name: "Doctrine du Sillon",
    desc: "Cette lignee construit avant de gouverner. Les routes survivent aux rois qui les ont commandees.",
    detail: "Infrastructure +25%, Usure -30%, 6% de l'infra perdure. Mais Ruines -20%.",
    bonus: "Infra +25% | Usure -30%",
    penalty: "Ruines -20%"
  }
];

// Pool d'events par palier — chaque event a une condition contextuelle optionnelle.
// condition(state, vitals) → bool : si false, l'event est ignoré au profit d'un autre.
const CRISIS_POOL = [

  // ─── PALIER 25% ────────────────────────────────────────────────────────────
  {
    id: "grain_panic",
    threshold: 0.25,
    condition: (s, v) => v.foodScore < 0.65,
    title: "Les greniers font parler d'eux",
    body: "On commence a compter les sacs. Les voisins se regardent differemment. Le mot 'famine' n'est pas encore prononce, mais il flotte.",
    options: [
      {
        label: "Ouvrir les reserves",
        detail: "Nourriture -12% ce cycle, Rupture -8%.",
        apply: () => { addProductionPenalty("food", 0.12); state.instability *= 0.92; chronicle("Les reserves sont ouvertes. La peur redescend d'un cran."); }
      },
      {
        label: "Nier le probleme",
        detail: "Production globale -5% ce cycle, Rupture +8%.",
        apply: () => { addProductionPenalty("global", 0.05); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.08)); chronicle("Le pouvoir dit que tout va bien. La tension monte."); }
      }
    ]
  },
  {
    id: "market_hoarding",
    threshold: 0.25,
    condition: (s, v) => v.goldScore > 0.75,
    title: "Les marchands bloquent les prix",
    body: "Dans les etals, les prix grimpent sans raison visible. On murmure que quelques maisons controlent les stocks et attendent que la faim les enrichisse.",
    options: [
      {
        label: "Plafonner les prix",
        detail: "Tresor -18% ce cycle, Rupture -9%.",
        apply: () => { addProductionPenalty("gold", 0.18); state.instability *= 0.91; chronicle("Les prix sont plafonnes par decret. Les marchands grincent des dents, la rue respire."); }
      },
      {
        label: "Laisser le marche faire",
        detail: "Tresor +6% ce cycle, Rupture +11%.",
        apply: () => { addProductionPenalty("gold", -0.06); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.11)); chronicle("Le marche s'emballe. Quelques-uns s'enrichissent, beaucoup serrent la ceinture."); }
      }
    ]
  },
  {
    id: "rapid_expansion",
    threshold: 0.25,
    condition: (s) => Object.values(s.buildings).reduce((a, b) => a + b, 0) > 15,
    title: "La cite s'est construite trop vite",
    body: "Des quartiers entiers existent sans que personne n'ait pense a les relier. Les habitants ne savent plus a qui s'adresser pour une plainte, une fuite d'eau, ou un titre de propriete.",
    options: [
      {
        label: "Reorganiser les quartiers",
        detail: "Savoir -14% ce cycle, Infrastructure +5%, Rupture -9%.",
        apply: () => { addProductionPenalty("knowledge", 0.14); state.infrastructure *= 1.05; state.instability *= 0.91; chronicle("Des scribes cartographient la cite. L'administration devient lisible. C'est deja ca."); }
      },
      {
        label: "Continuer a construire",
        detail: "Production globale +4% ce cycle, Rupture +10%.",
        apply: () => { addProductionPenalty("global", -0.04); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.10)); chronicle("On continue. La cite grandit plus vite que sa propre comprehension d'elle-meme."); }
      }
    ]
  },
  {
    id: "youth_unrest",
    threshold: 0.25,
    condition: (s) => s.cycles >= 1,
    title: "La jeunesse ne reconnait plus la cite",
    body: "Ceux qui sont nes ici n'ont pas vu les fondations. Ils veulent autre chose sans savoir quoi. Leurs ainees appellent ca de l'ingratitude. Eux appellent ca une vision.",
    options: [
      {
        label: "Organiser une assemblee",
        detail: "Savoir -10% ce cycle, Rupture -10%.",
        apply: () => { addProductionPenalty("knowledge", 0.10); state.instability *= 0.90; chronicle("L'assemblee crie, debat, et finit par se disperser. La tension baisse un peu."); }
      },
      {
        label: "Imposer le calme",
        detail: "Nourriture -8% ce cycle, Rupture +9%.",
        apply: () => { addProductionPenalty("food", 0.08); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.09)); chronicle("Le calme est impose. La jeunesse se tait en surface. En dessous, ca bout."); }
      }
    ]
  },
  {
    id: "whisper_campaign",
    threshold: 0.25,
    condition: () => true,
    title: "Des rumeurs circulent dans les rues",
    body: "Quelqu'un diffuse des histoires. Personne ne sait d'ou elles viennent, mais tout le monde les repete. Les versions changent selon les quartiers.",
    options: [
      {
        label: "Enqueter sur la source",
        detail: "Savoir -12% ce cycle, Rupture -8%.",
        apply: () => { addProductionPenalty("knowledge", 0.12); state.instability *= 0.92; chronicle("L'enquete remonte une piste. La rumeur s'etouffe, pour l'instant."); }
      },
      {
        label: "Diffuser un contre-recit",
        detail: "Tresor -10% ce cycle, Rupture +7% ou -4% (alea).",
        apply: () => { addProductionPenalty("gold", 0.10); const effect = Math.random() > 0.45 ? 0.96 : 1.07; state.instability = clamp01(state.instability * effect); chronicle(effect < 1 ? "Le contre-recit prend. Les esprits se calment." : "Le contre-recit est tourne en derision. La rumeur gagne en credibilite."); }
      }
    ]
  },

  // ─── PALIER 50% ────────────────────────────────────────────────────────────
  {
    id: "merchant_league",
    threshold: 0.5,
    condition: (s, v) => v.goldScore > 0.5,
    title: "Les riches proposent de l'aide",
    body: "Quelques grandes maisons offrent d'investir dans la stabilite — en echange de leur nom grave quelque part de visible.",
    options: [
      {
        label: "Taxer les elites",
        detail: "Tresor -18% ce cycle, Infrastructure +4%, Rupture -9%.",
        apply: () => { addProductionPenalty("gold", 0.18); state.infrastructure *= 1.04; state.instability *= 0.91; chronicle("Les elites financent des travaux publics. Le commerce ralentit, les murs tiennent."); }
      },
      {
        label: "Acheter leur paix",
        detail: "Infrastructure -15% ce cycle, Tresor +6%, Rupture +12%.",
        apply: () => { addProductionPenalty("infrastructure", 0.15); addProductionPenalty("gold", -0.06); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.12)); chronicle("La paix est achetee, brillante et fragile."); }
      }
    ]
  },
  {
    id: "power_consolidation",
    threshold: 0.5,
    condition: (s) => s.cycles >= 2,
    title: "Quelqu'un accapare le pouvoir",
    body: "Une faction monte. Pas encore assez forte pour gouverner seule, mais assez pour bloquer les autres. Elle attend que la cite soit suffisamment fragilisee.",
    options: [
      {
        label: "Partager les institutions",
        detail: "Legitimite -0.4, Rupture -12%.",
        apply: () => { state.legitimacy = Math.max(0, state.legitimacy - 0.4); state.instability *= 0.88; chronicle("Les institutions sont ouvertes. La faction accepte un role moindre. Pour l'instant."); }
      },
      {
        label: "Tenir les renes",
        detail: "Savoir -15% ce cycle, Rupture +14%.",
        apply: () => { addProductionPenalty("knowledge", 0.15); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.14)); chronicle("Le pouvoir central tient. La faction se tait. Sa colere, non."); }
      }
    ]
  },
  {
    id: "knowledge_schism",
    threshold: 0.5,
    condition: (s) => s.knowledge > 300,
    title: "Les savants se querellent",
    body: "Deux ecoles d'idees s'affrontent dans les academies. L'une veut codifier, l'autre experimenter. Chacune demande que l'autre soit interdite. Les etudiants prennent parti dans les rues.",
    options: [
      {
        label: "Imposer une doctrine",
        detail: "Savoir -22% ce cycle, Rupture -10%.",
        apply: () => { addProductionPenalty("knowledge", 0.22); state.instability *= 0.90; chronicle("Une doctrine s'impose. L'autre ecole continue en secret, plus soudee que jamais."); }
      },
      {
        label: "Laisser le debat ouvert",
        detail: "Savoir +12% ce cycle, Rupture +13%.",
        apply: () => { addProductionPenalty("knowledge", -0.12); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.13)); chronicle("Le debat s'envenime. Les idees prospèrent, les tensions aussi."); }
      }
    ]
  },
  {
    id: "militia_demand",
    threshold: 0.5,
    condition: (s) => s.cycles >= 1 || Object.values(s.buildings).reduce((a, b) => a + b, 0) > 10,
    title: "Des hommes armes demandent a parler",
    body: "Une milice de quartier pense qu'elle peut mieux proteger la cite que ceux qui gouvernent. Peut-etre. Ses representants frappent a la porte du conseil, armés.",
    options: [
      {
        label: "Integrer la milice",
        detail: "Tresor -18% ce cycle, Infrastructure +6%, Rupture -10%.",
        apply: () => { addProductionPenalty("gold", 0.18); state.infrastructure *= 1.06; state.instability *= 0.90; chronicle("La milice est integree. Elle protege les rues. Le tresor paye l'uniforme."); }
      },
      {
        label: "Les repousser",
        detail: "Population -12% ce cycle, Rupture +16%.",
        apply: () => { addProductionPenalty("population", 0.12); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.16)); chronicle("La milice est refusee. Elle ne part pas. Elle attend."); }
      }
    ]
  },
  {
    id: "infrastructure_debt",
    threshold: 0.5,
    condition: (s) => s.infrastructure > 40,
    title: "Les fondations fissurent",
    body: "Les aqueducs perdent leurs joints. Les routes s'effondrent entre les pierres. On a construit vite, mais personne n'a prevenu les budgets d'entretien.",
    options: [
      {
        label: "Investir dans les reparations",
        detail: "Tresor -20% ce cycle, Infrastructure +8%, Rupture -9%.",
        apply: () => { addProductionPenalty("gold", 0.20); state.infrastructure *= 1.08; state.instability *= 0.91; chronicle("Les ouvriers reparent. La cite tient encore. Le tresor aussi, tout juste."); }
      },
      {
        label: "Reporter aux prochains",
        detail: "Infrastructure -10%, Rupture +13%.",
        apply: () => { state.infrastructure *= 0.90; state.instability = clamp01(state.instability * amplifyRuptureFactor(1.13)); chronicle("On reporte. Les fissures s'elargissent. Quelqu'un d'autre paiera."); }
      }
    ]
  },

  // ─── PALIER 75% ────────────────────────────────────────────────────────────
  {
    id: "low_district_famine",
    threshold: 0.75,
    condition: (s, v) => v.foodScore < 0.7,
    title: "Les bas quartiers ne repondent plus",
    body: "Dans les bas quartiers, les decrets n'arrivent plus. Seuls les ventres vides parlent encore.",
    options: [
      {
        label: "Importer du grain",
        detail: "Tresor -25% ce cycle, Rupture -12%.",
        apply: () => { addProductionPenalty("gold", 0.25); state.instability *= 0.88; chronicle("Le grain arrive. Les bas quartiers respirent. Le tresor s'essouffle."); }
      },
      {
        label: "Laisser faire",
        detail: "Population -20% ce cycle, Rupture +20%.",
        apply: () => { addProductionPenalty("population", 0.2); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.2)); chronicle("Les bas quartiers sont laisses a eux-memes. La rupture approche."); }
      }
    ]
  },
  {
    id: "elite_flight",
    threshold: 0.75,
    condition: (s, v) => v.goldScore > 0.55,
    title: "Les riches font leurs bagages",
    body: "Les maisons aisees ont des plans depuis longtemps. Des caisses chargees quittent la cite par des chemins discrets. Ils savent quelque chose que les autres ne savent pas encore.",
    options: [
      {
        label: "Bloquer les sorties",
        detail: "Tresor conserve +10%, Population -8% ce cycle, Rupture -11%.",
        apply: () => { addProductionPenalty("gold", -0.10); addProductionPenalty("population", 0.08); state.instability *= 0.89; chronicle("Les routes sont fermees. Le tresor reste. La colere aussi."); }
      },
      {
        label: "Laisser partir",
        detail: "Tresor -28% ce cycle, Rupture +17%.",
        apply: () => { addProductionPenalty("gold", 0.28); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.17)); chronicle("Ils partent avec leurs richesses. La cite se retrouve seule avec ses dettes."); }
      }
    ]
  },
  {
    id: "palace_coup",
    threshold: 0.75,
    condition: (s) => s.cycles >= 1,
    title: "Le palais est divise",
    body: "Deux pretendants au conseil superieur. L'un soutenu par les marchands, l'autre par les soldats. La rue n'attend plus qu'un signal pour choisir son camp.",
    options: [
      {
        label: "Laisser les quartiers voter",
        detail: "Savoir -18% ce cycle, Legitimite -0.3, Rupture -14%.",
        apply: () => { addProductionPenalty("knowledge", 0.18); state.legitimacy = Math.max(0, state.legitimacy - 0.3); state.instability *= 0.86; chronicle("Le vote est houleux. Un nom sort. La cite se retrouve derriere lui, du moins officiellement."); }
      },
      {
        label: "Trancher par decret",
        detail: "Tresor -18% ce cycle, Rupture +18%.",
        apply: () => { addProductionPenalty("gold", 0.18); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.18)); chronicle("Le decret est signe. L'un des deux prétendants disparait. Avec ses partisans."); }
      }
    ]
  },
  {
    id: "plague_scare",
    threshold: 0.75,
    condition: (s) => s.population > 3000,
    title: "Une maladie s'installe dans les bas-fonds",
    body: "Personne ne sait encore ce que c'est. Les medecins disent quarantaine. Les marchands disent non. Les gens toussent.",
    options: [
      {
        label: "Decréter la quarantaine",
        detail: "Population -15% ce cycle, Tresor -12%, Rupture -13%.",
        apply: () => { addProductionPenalty("population", 0.15); addProductionPenalty("gold", 0.12); state.instability *= 0.87; chronicle("La quarantaine est imposee. L'epidemie ralentit. L'economie aussi."); }
      },
      {
        label: "Laisser circuler",
        detail: "Production globale +3% ce cycle, Rupture +20%.",
        apply: () => { addProductionPenalty("global", -0.03); state.instability = clamp01(state.instability * amplifyRuptureFactor(1.20)); chronicle("On laisse circuler. La maladie se repand dans les rues et les ateliers."); }
      }
    ]
  },
  {
    id: "debt_spiral",
    threshold: 0.75,
    condition: (s) => s.cycles >= 2,
    title: "Les dettes de la cite arrivent a echeance",
    body: "Quelqu'un a promis plus qu'il ne pouvait tenir. Des creanciers attendaient patiemment. Ils n'attendent plus.",
    options: [
      {
        label: "Honorer les dettes",
        detail: "Tresor -32% ce cycle, Rupture -14%.",
        apply: () => { addProductionPenalty("gold", 0.32); state.instability *= 0.86; chronicle("Les dettes sont payees. La cite survit, lesive. Le credit reste intact."); }
      },
      {
        label: "Renégocier de force",
        detail: "Tresor -10% ce cycle, Infrastructure -8%, Rupture +14%.",
        apply: () => { addProductionPenalty("gold", 0.10); state.infrastructure *= 0.92; state.instability = clamp01(state.instability * amplifyRuptureFactor(1.14)); chronicle("La renegociation tourne mal. Les creanciers se retirent. L'infrastructure en paye le prix."); }
      }
    ]
  }
];

// Conserve la compatibilite avec le systeme existant (checkCrisisThresholds utilise CRISIS_EVENTS)
const CRISIS_EVENTS = [
  { id: "_25", threshold: 0.25 },
  { id: "_50", threshold: 0.5 },
  { id: "_75", threshold: 0.75 }
];
