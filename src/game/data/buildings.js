"use strict";

/* ============================================================================
 * data-buildings.js - Donnees statiques: buildings, buildingDisplayOrder, dynastyNames, dynastyMottos.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

export const buildings = [
  {
    id: "foragers",
    category: "city",
    name: "Cueilleurs",
    desc: "Ils marchent avant le jour et savent ce que la foret cede sans qu'on le lui demande.",
    base: 10,
    scale: 1.18,
    currency: "food",
    pop: 0.18,
    food: 2.4,
    gold: 0,
    knowledge: 0,
    infra: 0,
    instability: 0.0009
  },
  {
    id: "granaries_city",
    category: "city",
    name: "Greniers",
    desc: "La premiere victoire contre la famine, c'est d'avoir quelque chose a perdre.",
    unlockBuilding: { id: "foragers", count: 3 },
    base: 100,
    scale: 1.19,
    currency: "food",
    pop: 0.07,
    food: 11,
    gold: 0,
    knowledge: 0,
    infra: 0.015,
    instability: 0.0007
  },
  {
    id: "caravans",
    category: "city",
    name: "Caravanes",
    desc: "Ils partent avec du surplus et rentrent avec des habitudes etrangeres.",
    unlockBuilding: { id: "granaries_city", count: 3 },
    base: 1000,
    scale: 1.2,
    currency: "food",
    pop: 0.06,
    food: 0,
    gold: 1.8,
    knowledge: 0,
    infra: 0,
    instability: 0.0018
  },
  {
    id: "scribes",
    category: "knowledge",
    name: "Scribes",
    desc: "Chaque tablette copiee est un mort qui continue de parler.",
    unlockBuilding: { id: "storytellers", count: 3 },
    base: 10000,
    scale: 1.29,
    currency: "gold",
    pop: 0.03,
    food: 0,
    gold: 0,
    knowledge: 8,
    infra: 0,
    instability: 0.0024
  },
  {
    id: "storytellers",
    category: "knowledge",
    name: "Conteurs",
    desc: "Ils sont la memoire de ceux qui ne lisent pas. Leur silence efface des generations.",
    base: 1000,
    scale: 1.28,
    currency: "gold",
    pop: 0.01,
    food: 0,
    gold: 0,
    knowledge: 1,
    infra: 0,
    instability: 0.0008
  },
  {
    id: "schools",
    category: "knowledge",
    name: "Ecoles",
    desc: "Pour la premiere fois, le savoir peut traverser une vie sans se perdre dans la suivante.",
    unlockBuilding: { id: "scribes", count: 3 },
    base: 100000,
    scale: 1.31,
    currency: "gold",
    extraCost: { knowledge: 100 },
    pop: 0.08,
    food: 0,
    gold: 0,
    knowledge: 60,
    infra: 0,
    instability: 0.0035
  },
  {
    id: "aqueducts",
    category: "infra",
    name: "Aqueducs",
    desc: "L'eau est arrivee en ville. Les maladies des bas quartiers ont mis du temps a l'apprendre.",
    unlockBuilding: { id: "roads", count: 3 },
    base: 1000,
    scale: 1.34,
    currency: "knowledge",
    pop: 0.18,
    food: 0.02,
    gold: 0,
    knowledge: 0,
    infra: 1.8,
    instability: 0.0032
  },
  {
    id: "roads",
    category: "infra",
    name: "Routes",
    desc: "La distance n'a pas change. Le temps qu'elle prend, si.",
    base: 100,
    scale: 1.33,
    currency: "knowledge",
    pop: 0.06,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 0.45,
    instability: 0.0015
  },
  {
    id: "watch",
    category: "infra",
    name: "Veilleurs",
    desc: "Ils rendent la nuit un peu moins dangereuse pour ceux qui dorment.",
    unlockBuilding: { id: "aqueducts", count: 3 },
    base: 10000,
    scale: 1.35,
    currency: "knowledge",
    pop: 0.02,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 2.5,
    instability: -0.002
  },
  {
    id: "markets",
    category: "city",
    name: "Marches",
    desc: "La ou les gens se retrouvent librement, le prix des choses revele ce qu'ils veulent vraiment.",
    unlockBuilding: { id: "caravans", count: 5 },
    base: 10000,
    scale: 1.21,
    currency: "food",
    pop: 0.28,
    food: 0,
    gold: 18,
    knowledge: 0,
    infra: 0,
    instability: 0.0042
  },
  {
    id: "guilds",
    category: "city",
    name: "Guildes",
    desc: "Des freres de metier, des secrets partages, et des mains qui savent ce que les autres ignorent.",
    unlockBuilding: { id: "markets", count: 5 },
    base: 100000,
    scale: 1.22,
    currency: "food",
    pop: 0.22,
    food: 0,
    gold: 140,
    knowledge: 0,
    infra: 0,
    instability: 0.0048
  },
  {
    id: "irrigated_fields",
    category: "city",
    name: "Champs irrigues",
    desc: "Quand l'eau obeit, la terre peut enfin tenir ses promesses.",
    unlockBuilding: { id: "guilds", count: 5 },
    base: 1000000,
    scale: 1.23,
    currency: "food",
    pop: 0.35,
    food: 1250,
    gold: 0,
    knowledge: 0,
    infra: 0,
    instability: 0.0055
  },
  {
    id: "river_ports",
    category: "city",
    name: "Ports fluviaux",
    desc: "Le fleuve est devenu une route. Ce qui part d'ici revient en or et en nouvelles.",
    unlockBuilding: { id: "irrigated_fields", count: 3 },
    unlockCycles: 1,
    base: 10000000,
    scale: 1.24,
    currency: "food",
    pop: 0.42,
    food: 0,
    gold: 1800,
    knowledge: 0,
    infra: 0,
    instability: 0.0065
  },
  {
    id: "water_mills",
    category: "city",
    name: "Moulins hydrauliques",
    desc: "La riviere travaille aussi la nuit. C'est une idee qui change tout.",
    unlockBuilding: { id: "river_ports", count: 3 },
    unlockCycles: 2,
    base: 100000000,
    scale: 1.25,
    currency: "food",
    pop: 0.52,
    food: 15000,
    gold: 0,
    knowledge: 0,
    infra: 0,
    instability: 0.0075
  },
  {
    id: "mint_houses",
    category: "city",
    name: "Hotels des monnaies",
    desc: "L'or circulait deja. Maintenant il porte un nom, un sceau, une autorite.",
    unlockBuilding: { id: "water_mills", count: 3 },
    unlockCycles: 3,
    base: 1000000000,
    scale: 1.26,
    currency: "food",
    pop: 0.65,
    food: 0,
    gold: 21000,
    knowledge: 0,
    infra: 0,
    instability: 0.009
  },
  {
    id: "imperial_exchanges",
    category: "city",
    name: "Bourses imperiales",
    desc: "Ici les chiffres ont remplace les visages. Les fortunes bougent plus vite que les armees.",
    unlockBuilding: { id: "mint_houses", count: 3 },
    unlockCycles: 5,
    base: 10000000000,
    scale: 1.27,
    currency: "food",
    pop: 0.8,
    food: 0,
    gold: 260000,
    knowledge: 0,
    infra: 0,
    instability: 0.011
  },
  {
    id: "academies",
    category: "knowledge",
    name: "Academies",
    desc: "On n'y apprend pas a avoir raison. On y apprend a douter proprement.",
    unlockBuilding: { id: "schools", count: 3 },
    base: 1000000,
    scale: 1.33,
    currency: "gold",
    extraCost: { knowledge: 1000 },
    pop: 0.42,
    food: 0,
    gold: 0,
    knowledge: 450,
    infra: 0,
    instability: 0.009
  },
  {
    id: "observatories",
    category: "knowledge",
    name: "Observatoires",
    desc: "La nuit est devenue lisible. Ce qui semblait arbitraire obeissait a des regles.",
    unlockBuilding: { id: "ancestral_cult", count: 3 },
    unlockCycles: 2,
    base: 100000000,
    scale: 1.35,
    currency: "gold",
    extraCost: { knowledge: 100000 },
    pop: 0.18,
    food: 0,
    gold: 0,
    knowledge: 24000,
    infra: 0,
    instability: 0.007
  },
  {
    id: "libraries",
    category: "knowledge",
    name: "Bibliotheques",
    desc: "Toutes les erreurs passees sont ici, archivees et consultables. Rarement lues.",
    unlockBuilding: { id: "observatories", count: 3 },
    unlockCycles: 3,
    base: 1000000000,
    scale: 1.37,
    currency: "gold",
    extraCost: { knowledge: 1000000 },
    pop: 0.22,
    food: 0,
    gold: 0,
    knowledge: 180000,
    infra: 0,
    instability: 0.01
  },
  {
    id: "bureaucracy",
    category: "infra",
    name: "Bureaucratie",
    desc: "L'Etat a maintenant une memoire. Lente, parfois absurde, mais indispensable.",
    unlockBuilding: { id: "sewers", count: 3 },
    base: 1000000,
    scale: 1.41,
    currency: "knowledge",
    pop: 1.8,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 24,
    instability: 0.015
  },
  {
    id: "sewers",
    category: "infra",
    name: "Egouts",
    desc: "La civilisation, c'est peut-etre surtout ca : s'organiser pour faire partir les mauvaises choses.",
    unlockBuilding: { id: "watch", count: 3 },
    base: 100000,
    scale: 1.39,
    currency: "knowledge",
    pop: 0.38,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 8,
    instability: -0.003
  },
  {
    id: "courthouses",
    category: "infra",
    name: "Tribunaux",
    desc: "La vengeance est toujours la, mais avec un formulaire et un delai raisonnable.",
    unlockBuilding: { id: "bureaucracy", count: 3 },
    unlockCycles: 1,
    base: 10000000,
    scale: 1.42,
    currency: "knowledge",
    pop: 0.12,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 75,
    instability: -0.006
  },
  {
    id: "public_works",
    category: "infra",
    name: "Grands travaux",
    desc: "Des milliers de mains pour transformer ce que personne n'oserait imaginer seul.",
    unlockBuilding: { id: "courthouses", count: 3 },
    unlockCycles: 2,
    base: 100000000,
    scale: 1.43,
    currency: "knowledge",
    pop: 0.7,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 225,
    instability: 0.006
  },
  {
    id: "ministries",
    category: "infra",
    name: "Ministeres",
    desc: "L'empire est devenu trop grand pour une seule tete. Il en faut une pour chaque probleme.",
    unlockBuilding: { id: "public_works", count: 3 },
    unlockCycles: 3,
    base: 1000000000,
    scale: 1.44,
    currency: "knowledge",
    pop: 0.9,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 680,
    instability: -0.008
  },
  {
    id: "archive_grids",
    category: "infra",
    name: "Reseaux d'archives",
    desc: "Gouverner sans memoire, c'est commettre les memes erreurs avec plus d'efficacite.",
    unlockBuilding: { id: "ministries", count: 3 },
    unlockCycles: 5,
    base: 10000000000,
    scale: 1.45,
    currency: "knowledge",
    pop: 1.1,
    food: 0,
    gold: 0,
    knowledge: 0,
    infra: 2050,
    instability: -0.01
  },
  {
    id: "ruin_architects",
    category: "infra",
    name: "Architectes des ruines",
    desc: "Ils construisent sur les cendres avec la precision de ceux qui savent ce qui revient toujours.",
    unlockBuilding: { id: "archive_grids", count: 3 },
    unlockCycles: 8,
    base: 100000000000,
    scale: 1.46,
    currency: "knowledge",
    extraCost: { ruins: 85 },
    pop: 0.18,
    food: 0,
    gold: 0.04,
    knowledge: 0,
    infra: 6200,
    instability: -0.004
  },
  {
    id: "ancestral_cult",
    category: "knowledge",
    name: "Culte des ancetres",
    desc: "Les ancetres siegent encore dans cette cite. Leur opinion pese lourd.",
    unlockBuilding: { id: "academies", count: 3 },
    unlockCycles: 1,
    base: 10000000,
    scale: 1.34,
    currency: "gold",
    extraCost: { knowledge: 10000 },
    pop: 0.08,
    food: 0,
    gold: 0,
    knowledge: 3200,
    infra: 0.1,
    instability: -0.0035
  },
  {
    id: "universities",
    category: "knowledge",
    name: "Universites",
    desc: "Les idees y fermentent plus vite que les civilisations ne s'effondrent. Parfois.",
    unlockBuilding: { id: "libraries", count: 3 },
    unlockCycles: 5,
    base: 10000000000,
    scale: 1.39,
    currency: "gold",
    extraCost: { knowledge: 10000000 },
    pop: 0.55,
    food: 0,
    gold: 0,
    knowledge: 1400000,
    infra: 0,
    instability: 0.012
  },
  {
    id: "printing_houses",
    category: "knowledge",
    name: "Maisons d'impression",
    desc: "Une idee dangereuse peut desormais traverser un empire avant que le roi en entende parler.",
    unlockBuilding: { id: "universities", count: 3 },
    unlockCycles: 7,
    base: 100000000000,
    scale: 1.4,
    currency: "gold",
    extraCost: { knowledge: 100000000 },
    pop: 0.75,
    food: 0,
    gold: 0,
    knowledge: 11000000,
    infra: 0,
    instability: 0.014
  },
  {
    id: "think_tanks",
    category: "knowledge",
    name: "Instituts strategiques",
    desc: "Ils ne savent pas ce qui va arriver. Mais ils ont des modeles pour tout.",
    unlockBuilding: { id: "printing_houses", count: 3 },
    unlockCycles: 10,
    base: 1000000000000,
    scale: 1.41,
    currency: "gold",
    extraCost: { knowledge: 1000000000 },
    pop: 0.95,
    food: 0,
    gold: 0,
    knowledge: 90000000,
    infra: 0,
    instability: 0.017
  }
];

export const dynastyNames = [
  "Maison des Premiers Feux",
  "Lignee des Greniers",
  "Dynastie des Sept Routes",
  "Maison de la Couronne Claire",
  "Empire des Archives",
  "Lignee du Fleuve Double",
  "Dynastie des Tours Longues",
  "Maison de la Derniere Aube"
];

export const dynastyMottos = [
  "Tenir assez longtemps pour que quelqu'un d'autre s'en souvienne.",
  "Le ventre avant le trone.",
  "Ce qu'on construit apres soi est la seule eternite qui existe.",
  "Les mots durent plus longtemps que les empires qui les ont commandes.",
  "La dette d'hier devient la regle d'aujourd'hui.",
  "Relier, c'est toujours conquerir quelque chose sans arme.",
  "La patience construit ce que l'ambition seule ne peut pas terminer.",
  "Tomber n'est pas mourir si quelqu'un ramasse ce que tu as pose."
];

export const buildingDisplayOrder = {
  city: ["foragers", "granaries_city", "caravans", "markets", "guilds", "irrigated_fields", "river_ports", "water_mills", "mint_houses", "imperial_exchanges"],
  knowledge: ["storytellers", "scribes", "schools", "academies", "ancestral_cult", "observatories", "libraries", "universities", "printing_houses", "think_tanks"],
  infra: ["roads", "aqueducts", "watch", "sewers", "bureaucracy", "courthouses", "public_works", "ministries", "archive_grids", "ruin_architects"]
};


// ── Lore des bâtiments et merveilles (utilisé par renderElementArchive) ──────
const bDesc = (id, suffix = "") => {
  const building = buildings.find(b => b.id === id);
  if (!building) return suffix;
  const desc = building.desc;
  if (!suffix) return desc;
  if (suffix.startsWith(",") || suffix.startsWith(" ;") || suffix.startsWith(" —")) {
    return desc.replace(/\.$/, "") + suffix;
  }
  return desc + " " + suffix;
};

export const BUILDING_LORE = {
  // ── MOTEUR ────────────────────────────────────────────────────────────────
  foragers: [
    { at: 1,  label: "Découverte", text: bDesc("foragers", "La survie commence là, dans cette connaissance silencieuse.") },
    { at: 10, label: "Palier ×10", text: "Ils sont assez nombreux pour couvrir toute la frange boisée en une journée. On a commencé à cartographier ce qu'ils trouvent — la forêt est devenue une ressource." },
    { at: 25, label: "Palier ×25", text: "Les cueilleurs ont leurs propres routes, leurs propres saisons intérieures. Certains parlent des chemins forestiers comme d'une langue que les autres ont oublié de parler." },
    { at: 64, label: "Palier ×64", text: "La forêt n'a plus de secrets pour eux. Ils savent où chercher avant même d'y aller. Ce savoir s'est transmis de père en fils jusqu'à ressembler à de l'instinct." }
  ],
  granaries_city: [
    { at: 1,  label: "Découverte", text: bDesc("granaries_city", "Un grenier, c'est un aveu que demain existe.") },
    { at: 10, label: "Palier ×10", text: "Un réseau de greniers se dessine autour du centre. La disette n'est plus une certitude — juste une possibilité. C'est une révolution dans les têtes autant que dans les ventres." },
    { at: 25, label: "Palier ×25", text: "Les archives alimentaires existent maintenant — des tablettes qui comptent chaque boisseau stocké. La faim s'est transformée en statistique, ce qui ne la supprime pas mais change qui en est responsable." },
    { at: 64, label: "Palier ×64", text: "Les greniers sont si nombreux que des quartiers entiers se définissent par leur proximité. L'abondance est devenue une géographie, et la pénurie une anomalie que l'on peut maintenant blâmer." }
  ],
  caravans: [
    { at: 1,  label: "Découverte", text: bDesc("caravans", "Le commerce n'a jamais transporté que des marchandises.") },
    { at: 10, label: "Palier ×10", text: "Les routes commerciales se stabilisent. Des auberges apparaissent aux carrefours. Le commerce a créé ses propres lieux, sa propre géographie du possible." },
    { at: 25, label: "Palier ×25", text: "Certaines caravanes ne reviennent jamais vraiment — leurs membres ont fondé des comptoirs, des familles, des habitudes ailleurs. La ville essaime sans le savoir." },
    { at: 64, label: "Palier ×64", text: "Le réseau caravanier est si dense que les nouvelles voyagent plus vite que les marchands. L'information est devenue une marchandise à part entière, et parfois la plus précieuse." }
  ],
  markets: [
    { at: 1,  label: "Découverte", text: bDesc("markets", "Le marché est un miroir que personne n'a commandé.") },
    { at: 10, label: "Palier ×10", text: "Le marché a ses habitués, ses rumeurs, ses heures. Une économie informelle s'est développée à l'ombre des étals — plus rapide et plus honnête que celle qu'on a voulu bâtir." },
    { at: 25, label: "Palier ×25", text: "Les prix fluctuent selon des logiques que personne ne comprend tout à fait. Le marché a commencé à vivre sa propre vie, indifférent aux intentions de ceux qui l'ont fondé." },
    { at: 64, label: "Palier ×64", text: "Les marchés couvrent toute la ville. Ce qu'on cherche, on le trouve — à condition de savoir dans quel marché. La spécialisation a engendré une nouvelle forme d'ignorance." }
  ],
  guilds: [
    { at: 1,  label: "Découverte", text: bDesc("guilds", "La guilde est la première forme d'oligarchie que les pauvres aient eux-mêmes construite.") },
    { at: 10, label: "Palier ×10", text: "Les guildes ont leurs propres tribunaux, leurs propres fêtes. Un parallèle à l'autorité officielle s'est constitué — plus discret, souvent plus efficace." },
    { at: 25, label: "Palier ×25", text: "Certaines guildes sont plus vieilles que les familles dirigeantes. Elles ont vu des dynasties naître et mourir sans changer d'emblème ni de pratiques." },
    { at: 64, label: "Palier ×64", text: "Les guildes contrôlent maintenant des pans entiers de l'économie. Gouverner sans leur accord est devenu théoriquement possible et pratiquement absurde." }
  ],
  irrigated_fields: [
    { at: 1,  label: "Découverte", text: bDesc("irrigated_fields", "L'irrigation est une déclaration d'intention sur ce que la civilisation croit mériter.") },
    { at: 10, label: "Palier ×10", text: "Les canaux ont leur propre administration. Des ingénieurs de l'eau forment une caste respectée — ils connaissent quelque chose que les dieux seuls maîtrisaient avant eux." },
    { at: 25, label: "Palier ×25", text: "La sécheresse n'est plus une catastrophe — juste un problème technique. La nature n'a pas changé ; notre rapport à elle a décidé de la précéder." },
    { at: 64, label: "Palier ×64", text: "L'irrigation couvre des territoires entiers. La carte agricole et la carte politique sont devenues presque identiques. Contrôler l'eau, c'est contrôler la faim des autres." }
  ],
  river_ports: [
    { at: 1,  label: "Découverte", text: bDesc("river_ports", " — et parfois en idées que personne n'avait commandées.") },
    { at: 10, label: "Palier ×10", text: "Des quartiers de dockers, de marchands et de navigateurs ont poussé autour des ports. Le fleuve génère sa propre société, plus mobile et moins obéissante." },
    { at: 25, label: "Palier ×25", text: "Les ports fluviaux ont leur propre justice, leurs propres dieux. Ce qui arrive par l'eau suit d'autres règles — celles de ceux qui ne s'arrêtent jamais longtemps." },
    { at: 64, label: "Palier ×64", text: "Le réseau portuaire s'étend jusqu'aux sources et jusqu'à la mer. Contrôler le fleuve, c'est contrôler tout ce qui y passe — et tout ce qu'on peut décider de retenir." }
  ],
  water_mills: [
    { at: 1,  label: "Découverte", text: bDesc("water_mills", " — pour la première fois, la production ne dépend pas de la présence humaine.") },
    { at: 10, label: "Palier ×10", text: "Les moulins tournent sans s'arrêter. Une économie de l'énergie s'est installée sans que personne n'ait prévu d'en faire une politique." },
    { at: 25, label: "Palier ×25", text: "Certains moulins accomplissent maintenant des tâches que personne n'avait pensé à leur confier. La machine a commencé à dépasser ses créateurs dans les usages." },
    { at: 64, label: "Palier ×64", text: "L'énergie hydraulique irrigue des pans entiers de l'industrie locale. Le fleuve ne sait pas qu'il fait fonctionner un empire. C'est peut-être sa seule vertu." }
  ],
  mint_houses: [
    { at: 1,  label: "Découverte", text: bDesc("mint_houses", "La monnaie est une forme de confiance qu'on a rendue obligatoire.") },
    { at: 10, label: "Palier ×10", text: "La monnaie porte un portrait. L'autorité s'imprime dans le métal et circule partout où l'autorité elle-même ne va pas — et parfois plus loin." },
    { at: 25, label: "Palier ×25", text: "Des économistes débattent maintenant des effets de la masse monétaire. L'argent est devenu une science, ce qui ne l'a pas rendu plus prévisible." },
    { at: 64, label: "Palier ×64", text: "Les hôtels des monnaies produisent des titres, des obligations, des instruments abstraits. L'or physique est presque devenu une métaphore de lui-même." }
  ],
  imperial_exchanges: [
    { at: 1,  label: "Découverte", text: bDesc("imperial_exchanges", ", et souvent avec plus d'efficacité.") },
    { at: 10, label: "Palier ×10", text: "Les transactions se font sur des livres de comptes plutôt qu'en main propre. La confiance est devenue une infrastructure — fragile et indispensable." },
    { at: 25, label: "Palier ×25", text: "Les bourses communiquent entre elles. Un krach dans une ville peut ruiner des marchands à trois semaines de distance. L'économie a acquis des propriétés contagieuses." },
    { at: 64, label: "Palier ×64", text: "Le système financier est devenu si complexe que même ses architectes n'en comprennent que des fragments. Il fonctionne parce que tout le monde fait comme s'il fonctionnait." }
  ],
  // ── SAVOIR ────────────────────────────────────────────────────────────────
  storytellers: [
    { at: 1,  label: "Découverte", text: bDesc("storytellers", " ; leur parole en sauve d'autres que l'écriture n'a jamais touchées.") },
    { at: 10, label: "Palier ×10", text: "Les conteurs se spécialisent. Certains ne racontent que les victoires, d'autres que les désastres. La mémoire collective a commencé à se diviser en récits concurrents." },
    { at: 25, label: "Palier ×25", text: "Des écoles de narration se sont formées. Les histoires ont maintenant des auteurs, des styles, des adversaires. La tradition is devenue une institution avec ses orthodoxies." },
    { at: 64, label: "Palier ×64", text: "La tradition orale est si riche qu'elle concurrence les archives écrites. Certains événements existent en deux versions contradictoires, toutes deux vraies selon qui les raconte." }
  ],
  scribes: [
    { at: 1,  label: "Découverte", text: bDesc("scribes", "L'écriture a inventé une forme d'immortalité que la chair ne peut pas offrir.") },
    { at: 10, label: "Palier ×10", text: "Les scribes ont leurs codes, leurs abréviations, leurs conventions. Lire un document de dix ans exige maintenant un interprète — la mémoire s'opacifie à mesure qu'elle s'accumule." },
    { at: 25, label: "Palier ×25", text: "Les archives débordent. On a commencé à archiver les archives — des répertoires de répertoires. La bureaucratie de la mémoire est née." },
    { at: 64, label: "Palier ×64", text: "Les scribes constituent une classe à part entière. Savoir écrire n'est plus rare ; savoir ce qu'il faut écrire — et surtout omettre — est la véritable compétence." }
  ],
  schools: [
    { at: 1,  label: "Découverte", text: bDesc("schools", "L'école a rendu la transmission moins aléatoire — et moins personnelle.") },
    { at: 10, label: "Palier ×10", text: "L'école a ses traditions, ses rituels, ses injustices propres. Elle reproduit la société en prétendant la dépasser." },
    { at: 25, label: "Palier ×25", text: "On commence à mesurer l'efficacité des écoles, à comparer les méthodes. L'éducation est devenue une politique, ce qui signifie qu'elle est maintenant un objet de conflit." },
    { at: 64, label: "Palier ×64", text: "Presque tout le monde est passé par une école. Ce qu'on y enseigne définit ce qu'on pense être vrai. L'éducation est devenue la première forme de pouvoir — et la moins visible." }
  ],
  academies: [
    { at: 1,  label: "Découverte", text: bDesc("academies", " — ce qui est plus long, plus difficile, et infiniment plus utile.") },
    { at: 10, label: "Palier ×10", text: "Les académies ont leurs rivalités, leurs batailles de priorité, leurs clans. La production du savoir ressemble à une politique — avec les mêmes alliances et les mêmes trahisons." },
    { at: 25, label: "Palier ×25", text: "Certaines découvertes académiques n'ont pas encore trouvé leur usage. On les archive en attendant que le monde rattrape la théorie." },
    { at: 64, label: "Palier ×64", text: "Les académies sont si nombreuses que leur production dépasse ce que quiconque peut lire. Le savoir s'accumule plus vite qu'il ne se comprend." }
  ],
  ancestral_cult: [
    { at: 1,  label: "Découverte", text: "Les ancêtres ont commencé à jouer un rôle dans les décisions des vivants. On consulte les morts avant d'agir — c'est une façon de ne jamais être seul à décider." },
    { at: 10, label: "Palier ×10", text: "Les généalogies s'allongent. Plus les ancêtres sont anciens, plus leur autorité grandit — et plus leur mémoire se déforme pour convenir à ceux qui s'en réclament." },
    { at: 25, label: "Palier ×25", text: "Le culte a ses prêtres, ses liturgies, ses conflits d'interprétation. Deux familles peuvent vénérer le même ancêtre de façons incompatibles. Toutes deux ont raison selon leur propre archive." },
    { at: 64, label: "Palier ×64", text: "La frontière entre histoire et mythe est devenue imperceptible. Les ancêtres ont accompli des choses qu'aucun vivant ne pourrait faire — et c'est précisément pourquoi ils gouvernent encore." }
  ],
  observatories: [
    { at: 1,  label: "Découverte", text: "Pour la première fois, on observe le ciel avec méthode. Ce qu'on y voit n'est plus seulement des présages — c'est de la géométrie." },
    { at: 10, label: "Palier ×10", text: "Les observatoires partagent leurs relevés. Une astronomie collective émerge, plus précise que ce que l'on pourrait faire seul — le ciel devient un projet commun." },
    { at: 25, label: "Palier ×25", text: "Les cartes célestes permettent de prédire les éclipses. La surprise divine est devenue un calcul humain. Les temples n'ont pas encore décidé ce qu'ils en pensent." },
    { at: 64, label: "Palier ×64", text: "L'astronomie remet en question la cosmologie officielle. Le ciel dit une chose ; les temples en disent une autre. Pour l'instant, les temples ont encore le dernier mot — mais pour l'instant seulement." }
  ],
  libraries: [
    { at: 1,  label: "Découverte", text: "Les textes ne mourront plus avec leurs porteurs. Pour la première fois, un livre peut survivre à tous ceux qui le connaissent." },
    { at: 10, label: "Palier ×10", text: "La bibliothèque a ses gardiens, ses règles d'accès, ses zones interdites. Le savoir est protégé — ce qui signifie aussi qu'il est contrôlé." },
    { at: 25, label: "Palier ×25", text: "Des catalogues de catalogues. Personne ne sait ce que contient la bibliothèque dans son entier. Elle est devenue plus grande que n'importe quel lecteur possible." },
    { at: 64, label: "Palier ×64", text: "Les bibliothèques communiquent entre elles. Un réseau de copistes assure la circulation des textes rares. La civilisation a sa propre mémoire distribuée — et personne n'en détient les clés." }
  ],
  universities: [
    { at: 1,  label: "Découverte", text: "Pour la première fois, apprendre est une occupation à plein temps. Des gens passent des années à ne faire que penser. La société a décidé que ça valait la peine de les nourrir." },
    { at: 10, label: "Palier ×10", text: "Les universités ont leurs disputes formelles, leurs grades, leurs chapelles. Le savoir a maintenant une hiérarchie officielle — et comme toute hiérarchie, elle protège ceux qui sont en haut." },
    { at: 25, label: "Palier ×25", text: "Des étudiants viennent de loin pour étudier ici. Les idées qui naissent dans ces salles voyagent plus vite que les armées, et durent plus longtemps que les guerres." },
    { at: 64, label: "Palier ×64", text: "Les universités forment les administrateurs, les médecins, les ingénieurs, les théologiens. Gouverner sans leurs diplômés est devenu impraticable — et c'est exactement ce qu'elles avaient prévu." }
  ],
  printing_houses: [
    { at: 1,  label: "Découverte", text: "Le même texte, identique, entre mille mains à la fois. C'est une révolution que personne n'a encore nommée — et que personne n'a demandée." },
    { at: 10, label: "Palier ×10", text: "Des pamphlets, des journaux, des almanachs circulent dans la ville. L'opinion publique est née — instable, contradictoire, et maintenant impossible à ignorer." },
    { at: 25, label: "Palier ×25", text: "L'imprimerie a ses censeurs officiels et ses contrebandiers officieux. Contrôler ce qui s'imprime est devenu aussi important que de le produire — et aussi impossible." },
    { at: 64, label: "Palier ×64", text: "L'alphabétisation s'est étendue parce que les textes se sont multipliés. Le monde lettré et le monde illettré se regardent à travers une frontière que l'imprimerie a rendue visible." }
  ],
  think_tanks: [
    { at: 1,  label: "Découverte", text: "Pour la première fois, on réfléchit à l'avenir de manière organisée. La planification est devenue une discipline — avec ses méthodes, ses erreurs, et sa confiance en elle-même." },
    { at: 10, label: "Palier ×10", text: "Les rapports des instituts circulent dans les cercles du pouvoir. Les décisions sont précédées d'analyses — ce qui ne garantit pas qu'elles sont meilleures, mais donne une bonne conscience." },
    { at: 25, label: "Palier ×25", text: "Des scénarios du futur s'accumulent dans les archives. La plupart seront faux, mais l'habitude de les produire a changé la manière dont le pouvoir se justifie à lui-même." },
    { at: 64, label: "Palier ×64", text: "Les instituts sont devenus indispensables au pouvoir — et indépendants de lui. Ils conseillent toutes les factions. Leur seule loyauté est à la complexité du réel." }
  ],
  // ── INFRASTRUCTURE ────────────────────────────────────────────────────────
  roads: [
    { at: 1,  label: "Découverte", text: bDesc("roads", "Et c'est suffisant pour tout changer au reste.") },
    { at: 10, label: "Palier ×10", text: "Les routes ont leurs étapes, leurs auberges, leurs brigands réguliers. Voyager est devenu un métier — et une industrie." },
    { at: 25, label: "Palier ×25", text: "La qualité des routes varie selon qui les emprunte. Les marchands ont les meilleures, les paysans les pires. L'infrastructure reproduit fidèlement la hiérarchie." },
    { at: 64, label: "Palier ×64", text: "Le réseau routier est si dense qu'un message peut traverser tout l'empire en quelques semaines. Le temps a changé de dimension, et l'espace avec lui." }
  ],
  aqueducts: [
    { at: 1,  label: "Découverte", text: bDesc("aqueducts", " — mais elles ont appris.") },
    { at: 10, label: "Palier ×10", text: "Des quartiers entiers ont maintenant de l'eau courante. La santé publique s'améliore par des mécanismes que personne ne comprend encore, ce qui ne les empêche pas de fonctionner." },
    { at: 25, label: "Palier ×25", text: "Les aqueducs ont leurs ingénieurs dédiés, leurs corporations d'entretien. L'eau est devenue une infrastructure politique autant que physique." },
    { at: 64, label: "Palier ×64", text: "Sans les aqueducs, la ville serait inhabitable à cette échelle. La dépendance à l'infrastructure est devenue totale — et personne ne s'en inquiète, ce qui est en soi inquiétant." }
  ],
  watch: [
    { at: 1,  label: "Découverte", text: bDesc("watch", "Leur simple présence a changé ce que la ville croit lui devoir.") },
    { at: 10, label: "Palier ×10", text: "Les veilleurs patrouillent selon des plans établis, des rotations fixes. La sécurité est devenue une administration — avec ses formulaires et ses responsables." },
    { at: 25, label: "Palier ×25", text: "Un réseau de tours de guet permet d'alerter toute la ville en quelques minutes. La menace est devenue calculable, ce qui ne l'a pas supprimée mais l'a rendue moins surprenante." },
    { at: 64, label: "Palier ×64", text: "Les veilleurs ont leurs propres archives, leurs propres enquêteurs. Ils savent ce qui se passe avant même que ça se produise — parfois. C'est leur seule limite avouée." }
  ],
  sewers: [
    { at: 1,  label: "Découverte", text: "Ce qu'on ne voit pas fonctionne aussi. La ville a appris à cacher ses nécessités — et à les rendre imperceptibles par ceux qu'elles protègent." },
    { at: 10, label: "Palier ×10", text: "Les maladies des bas quartiers ont reculé sans qu'on sache exactement pourquoi. L'hygiène a précédé sa propre théorie, comme souvent les vraies améliorations." },
    { at: 25, label: "Palier ×25", text: "Les égouts ont leurs ingénieurs, leurs codes techniques. Une profession invisible maintient la ville en vie — sans que personne ne pense à les remercier." },
    { at: 64, label: "Palier ×64", text: "Le réseau souterrain est aussi complexe que la ville au-dessus. Certains y vivent. La civilisation a son revers invisible, aussi vaste et aussi nécessaire que sa face présentable." }
  ],
  bureaucracy: [
    { at: 1,  label: "Découverte", text: "Pour la première fois, l'État peut se souvenir de lui-même d'une année sur l'autre. La mémoire institutionnelle est née — lente, redondante, et indispensable." },
    { at: 10, label: "Palier ×10", text: "Les formulaires se multiplient. Chaque acte nécessite un document, chaque document une autorisation. L'administration a commencé à s'administrer elle-même." },
    { at: 25, label: "Palier ×25", text: "La bureaucratie a créé ses propres règles de survie — des procédures pour contourner les procédures. Elle est devenue un écosystème autonome avec ses propres lois d'évolution." },
    { at: 64, label: "Palier ×64", text: "Nul ne comprend l'ensemble du système. Chaque fonctionnaire connaît sa partie. L'État fonctionne parce personne n'essaie de le voir en entier — et que c'est exactement ce qu'il faut." }
  ],
  courthouses: [
    { at: 1,  label: "Découverte", text: "La loi existe depuis longtemps. Les tribunaux ont décidé qu'elle s'appliquait à tout le monde — en théorie. C'est un progrès considérable pour une théorie." },
    { at: 10, label: "Palier ×10", text: "Des corps de droit spécialisés émergent : droit commercial, foncier, familial. La justice s'est fragmentée en expertises, ce qui l'a rendue plus précise et moins accessible." },
    { at: 25, label: "Palier ×25", text: "Les jugements anciens font autorité sur les nouveaux. Le passé légal gouverne autant que le présent politique — et il est beaucoup plus difficile à contredire." },
    { at: 64, label: "Palier ×64", text: "Les tribunaux sont si nombreux que naviguer entre eux est devenu un art. Des avocats font carrière à trouver le bon tribunal pour la bonne cause — ce n'est pas tout à fait de la justice, mais ça y ressemble." }
  ],
  public_works: [
    { at: 1,  label: "Découverte", text: "L'État a décidé de transformer le paysage. Pour la première fois, la volonté collective prend une forme physique durable — et visible de loin." },
    { at: 10, label: "Palier ×10", text: "Les grands travaux génèrent leurs scandales, leurs héros, leurs martyrs. Construire est une politique — avec ses promesses, ses retards, et ses coûts qu'on découvre trop tard." },
    { at: 25, label: "Palier ×25", text: "Des générations de travailleurs ont passé leur vie sur les mêmes chantiers. Certains bâtiments ont enterré leurs constructeurs deux fois — une fois à mi-projet, une fois à la fin." },
    { at: 64, label: "Palier ×64", text: "Les grands travaux ont restructuré la géographie. Routes, canaux, murs : ils ont reconfiguré ce qui est possible, et rendu impossible ce qui existait avant." }
  ],
  ministries: [
    { at: 1,  label: "Découverte", text: "Le gouvernement s'est divisé en domaines. Chaque domaine a sa logique, son vocabulaire, sa vision du bien commun — souvent incompatible avec celle du voisin." },
    { at: 10, label: "Palier ×10", text: "Les ministères se disputent les ressources et les compétences. La coordination est devenue un problème structurel — résolu à chaque réunion et revenu le lendemain." },
    { at: 25, label: "Palier ×25", text: "Des carrières entières se font dans les couloirs des ministères. Le pouvoir s'est institutionnalisé — et bureaucratisé. Il y gagne en durabilité ce qu'il perd en personnalité." },
    { at: 64, label: "Palier ×64", text: "Les ministères ont survécu à plusieurs dynasties. L'État est devenu plus durable que ses souverains — ce qui est soit rassurant soit inquiétant, selon qu'on est ministre ou roi." }
  ],
  archive_grids: [
    { at: 1,  label: "Découverte", text: "Pour la première fois, les informations de l'empire peuvent être consultées en un seul endroit. La centralisation du savoir a changé la nature du pouvoir — subtilement, définitivement." },
    { at: 10, label: "Palier ×10", text: "Des archivistes spécialisés gèrent des domaines entiers — fiscalité, démographie, cartographie. Le savoir est devenu une administration à part entière." },
    { at: 25, label: "Palier ×25", text: "Les réseaux d'archives communiquent entre eux. Une décision locale peut être vérifiée par le centre. La transparence s'est transformée en surveillance — personne n'a fait la différence officiellement." },
    { at: 64, label: "Palier ×64", text: "L'empire connaît chaque province mieux qu'elle ne se connaît elle-même. L'information est devenue le premier instrument de gouvernement — avant les armées, avant l'argent." }
  ],
  ruin_architects: [
    { at: 1,  label: "Découverte", text: "Quelqu'un a décidé que les ruines méritent d'être comprises, pas seulement pillées. La mémoire des effondrements est devenue une discipline — et un avertissement." },
    { at: 10, label: "Palier ×10", text: "Les architectes des ruines ont cartographié les cycles précédents. Leurs conclusions sont troublantes : tout cela s'est déjà produit, différemment mais avec la même logique." },
    { at: 25, label: "Palier ×25", text: "On construit maintenant en pensant à ce que les ruines diront. L'architecture a intégré sa propre fin dans ses calculs — ce qui n'est pas la même chose qu'y renoncer." },
    { at: 64, label: "Palier ×64", text: "Les architectes des ruines sont devenus des conseillers politiques. Leur question est toujours la même : qu'est-ce qui résistera ? La réponse est rarement ce qu'on espère." }
  ]
};

export const WONDER_LORE = [
  { id: "dynasty1", name: "Le Premier Mausolée",
    text: "Il n'avait pas demandé à être immortalisé. Mais ceux qui restaient avaient besoin d'un point fixe autour duquel organiser le deuil et la continuité. Le mausolée n'est pas pour lui — il est pour eux." },
  { id: "pop1m", name: "La Grande Halle",
    text: "Un million d'habitants. La ville a dépassé la taille où l'on peut se connaître par son nom. La Grande Halle est le symbole d'un nouveau contrat : l'anonymat collectif contre la protection collective. Personne ne se souvient de l'inauguration. C'est le signe que ça a marché." },
  { id: "era_kingdom", name: "La Couronne de Pierre",
    text: "Le royaume n'est plus une collection de territoires tenus par la force — c'est une idée que les gens ont commencé à croire. La Couronne de Pierre en est la preuve matérielle : quelque chose ici mérite d'être traité comme éternel." },
  { id: "era_empire", name: "Le Forum Impérial",
    text: "L'empire ne se gouverne pas, il se négocie. Le Forum Impérial est l'endroit où les factions, les provinces et les intérêts contraires trouvent un langage commun. Ce n'est pas de la paix — c'est quelque chose de plus durable que la paix." },
  { id: "era_mega", name: "La Spire des Mondes",
    text: "Elle est visible de partout. C'est le sens. Pas un monument à une personne ou à un événement, mais à l'idée que cette civilisation a atteint quelque chose qu'aucune autre n'avait atteint. Pour l'instant, personne ne sait exactement ce que c'est. La Spire dit simplement : nous sommes allés jusque-là." },
  { id: "era_singularity", name: "L'Axe Civique",
    text: "À ce stade, la civilisation est son propre phénomène. L'Axe Civique ne commémore rien — il enregistre. La singularité n'est pas une fin. C'est la découverte que la fin n'était pas là où on la cherchait." }
];
