// ============================================================================
// IDENTITÉ D'UN PASSANT : qui il est, accordé à ce qu'on VOIT.
// ----------------------------------------------------------------------------
// Raph (2026-10-07), sur une fiche « Garin l'Ancien · Homme · 25 ans » : le
// surnom, l'âge, le métier, le nom de famille et le caractère se tiraient chacun
// de leur côté, sans se regarder. Ici ils se tirent ENSEMBLE, à partir du dessin
// que la carte montre :
//   · le métier vient du dessin quand il en porte un (le moine, la boulangère,
//     le légionnaire…), sinon de son lieu de travail ;
//   · l'âge suit le dessin (cheveux blancs = âgé) et le surnom (« l'Ancien » est
//     vieux, « le Cadet » jeune) ;
//   · le caractère n'est jamais contradictoire (ni bavard ET taciturne) et le
//     surnom l'impose (« le Taciturne » est taciturne) ;
//   · le nom de famille est celui du FOYER : deux passants nés au même seuil le
//     partagent (lieu-dit des villages, nom de maison des villes).
// Données pures et tirages déterministes (graine du passant, graine du foyer) :
// rien n'est sauvegardé, la même graine redonne la même personne.
// ============================================================================
import {
  CM_GIVEN_M, CM_GIVEN_F, CM_HOUSES, CM_LIEUX, CM_EPITHETS_M, CM_EPITHETS_F,
} from './cityNaming.js';

// Brassage de graine (même recette que citizenFocus.mixHash) : graine, sel → uint32.
export function idHash(seed, k) {
  let x = ((seed >>> 0) ^ Math.imul(k + 1, 0x9E3779B1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7FEB352D) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846CA68B) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

// ── LES MÉTIERS ──────────────────────────────────────────────────────────────
// { m, f } en français, { en, enF } en anglais. `pious` : le métier impose le
// trait Pieux ; `celibate` : ni conjoint ni enfants ; `works` : les bâtiments où
// il travaille (ids de buildings.js) — vide, il n'a pas d'atelier sur la carte.
export const JOBS = {
  // Ceux que les dessins portent.
  fisher: { m: 'Pêcheur', f: 'Pêcheuse', en: 'Fisher', works: ['river_ports'] },
  shaman: { m: 'Chaman', f: 'Chamane', en: 'Shaman', pious: true, works: ['ancestral_cult', 'storytellers'] },
  gatherer: { m: 'Cueilleur', f: 'Cueilleuse', en: 'Gatherer', works: ['foragers'] },
  monk: { m: 'Moine', f: 'Moniale', en: 'Monk', enF: 'Nun', pious: true, celibate: true, works: ['ancestral_cult', 'libraries', 'scribes'] },
  guard: { m: 'Garde', f: 'Garde', en: 'Guard', works: ['watch', 'courthouses'] },
  baker: { m: 'Boulanger', f: 'Boulangère', en: 'Baker', works: ['markets', 'granaries_city'] },
  magistrate: { m: 'Magistrat', f: 'Magistrate', en: 'Magistrate', works: ['courthouses', 'bureaucracy', 'ministries'] },
  merchant: { m: 'Marchand', f: 'Marchande', en: 'Merchant', works: ['markets', 'caravans', 'imperial_exchanges'] },
  legionary: { m: 'Légionnaire', f: 'Légionnaire', en: 'Legionary', works: ['watch', 'public_works'] },
  porter: { m: 'Porteur', f: 'Porteuse', en: 'Porter', works: ['river_ports', 'caravans', 'granaries_city'] },
  matron: { m: 'Matrone', f: 'Matrone', en: 'Matron', works: [] },
  priest: { m: 'Prêtre', f: 'Prêtresse', en: 'Priest', enF: 'Priestess', pious: true, works: ['ancestral_cult'] },
  waterCarrier: { m: "Porteur d'eau", f: "Porteuse d'eau", en: 'Water carrier', works: ['aqueducts'] },
  constable: { m: 'Sergent de ville', f: 'Sergente de ville', en: 'Constable', works: ['watch', 'courthouses'] },
  factory: { m: 'Ouvrier', f: 'Ouvrière', en: 'Factory worker', works: ['guilds', 'public_works', 'mint_houses', 'printing_houses'] },
  florist: { m: 'Marchand de fleurs', f: 'Marchande de fleurs', en: 'Flower seller', works: ['markets'] },
  clerk: { m: 'Employé de bureau', f: 'Employée de bureau', en: 'Office worker', works: ['bureaucracy', 'ministries', 'imperial_exchanges', 'archive_grids', 'think_tanks'] },
  courier: { m: 'Coursier', f: 'Coursière', en: 'Courier', works: ['caravans', 'river_ports'] },
  nurse: { m: 'Infirmier', f: 'Infirmière', en: 'Nurse', works: [] },
  gardener: { m: 'Jardinier', f: 'Jardinière', en: 'Gardener', works: ['foragers', 'irrigated_fields'] },
  engineer: { m: 'Ingénieur', f: 'Ingénieure', en: 'Engineer', works: ['public_works', 'sewers', 'archive_grids', 'ruin_architects'] },
  scholar: { m: 'Savant', f: 'Savante', en: 'Scholar', works: ['academies', 'universities', 'libraries', 'think_tanks', 'observatories'] },
  botanist: { m: 'Botaniste', f: 'Botaniste', en: 'Botanist', works: ['foragers', 'universities'] },
  pilot: { m: 'Pilote', f: 'Pilote', en: 'Pilot', works: ['caravans', 'river_ports'] },
  astronomer: { m: 'Astronome', f: 'Astronome', en: 'Astronomer', works: ['observatories'] },
  noble: { m: 'Noble', f: 'Noble', en: 'Noble', works: [] },
  starSailor: { m: 'Marin des étoiles', f: 'Marin des étoiles', en: 'Star sailor', works: ['river_ports', 'caravans'] },
  singer: { m: 'Chanteur', f: 'Chanteuse', en: 'Singer', works: ['storytellers'] },
  navigator: { m: 'Navigateur', f: 'Navigatrice', en: 'Navigator', works: ['river_ports', 'caravans', 'observatories'] },
  mage: { m: 'Mage', f: 'Mage', en: 'Mage', works: ['academies', 'think_tanks', 'ancestral_cult', 'observatories'] },
  sculptor: { m: 'Sculpteur', f: 'Sculptrice', en: 'Sculptor', works: ['guilds', 'ruin_architects'] },
  miner: { m: 'Mineur de cristal', f: 'Mineuse de cristal', en: 'Crystal miner', works: ['public_works', 'mint_houses'] },
  weaver: { m: 'Tisserand', f: 'Tisserande', en: 'Weaver', works: ['guilds'] },
  dancer: { m: 'Danseur', f: 'Danseuse', en: 'Dancer', works: ['storytellers'] },
  basket: { m: 'Porteur de panier', f: 'Porteuse de panier', en: 'Basket carrier', works: [] },
  // Ceux que donne une scène (le champ du laboureur ; la veillée, paroles/veillee.js :
  // Claude, le gardien du feu de la Chronique, sans atelier sur la carte).
  farmer: { m: 'Paysan', f: 'Paysanne', en: 'Farmer', works: ['irrigated_fields'] },
  firekeeper: { m: 'Gardien du feu', f: 'Gardienne du feu', en: 'Fire keeper', works: [] },
  // Ceux que donne un ATELIER à qui n'a pas de métier dessiné (WORK_JOBS).
  marketGardener: { m: 'Maraîcher', f: 'Maraîchère', en: 'Market gardener', works: ['foragers'] },
  storekeeper: { m: 'Magasinier', f: 'Magasinière', en: 'Storekeeper', works: ['granaries_city'] },
  caravaneer: { m: 'Caravanier', f: 'Caravanière', en: 'Caravaneer', works: ['caravans'] },
  hauler: { m: 'Transporteur', f: 'Transporteuse', en: 'Hauler', works: ['caravans'] },
  artisan: { m: 'Artisan', f: 'Artisane', en: 'Artisan', works: ['guilds'] },
  agronomist: { m: 'Agriculteur', f: 'Agricultrice', en: 'Farmer', works: ['irrigated_fields'] },
  boatman: { m: 'Batelier', f: 'Batelière', en: 'Boatman', enF: 'Boatwoman', works: ['river_ports'] },
  docker: { m: 'Docker', f: 'Docker', en: 'Docker', works: ['river_ports'] },
  miller: { m: 'Meunier', f: 'Meunière', en: 'Miller', works: ['water_mills'] },
  minter: { m: 'Monnayeur', f: 'Monnayeuse', en: 'Minter', works: ['mint_houses'] },
  changer: { m: 'Changeur', f: 'Changeuse', en: 'Money changer', works: ['imperial_exchanges'] },
  banker: { m: 'Banquier', f: 'Banquière', en: 'Banker', works: ['imperial_exchanges'] },
  storyteller: { m: 'Conteur', f: 'Conteuse', en: 'Storyteller', works: ['storytellers'] },
  actor: { m: 'Comédien', f: 'Comédienne', en: 'Actor', enF: 'Actress', works: ['storytellers'] },
  journalist: { m: 'Journaliste', f: 'Journaliste', en: 'Journalist', works: ['storytellers'] },
  scribe: { m: 'Scribe', f: 'Scribe', en: 'Scribe', works: ['scribes'] },
  schoolmaster: { m: "Maître d'école", f: "Maîtresse d'école", en: 'Schoolteacher', works: ['schools'] },
  teacher: { m: 'Enseignant', f: 'Enseignante', en: 'Teacher', works: ['schools'] },
  lettered: { m: 'Lettré', f: 'Lettrée', en: 'Scholar', works: ['academies'] },
  librarian: { m: 'Bibliothécaire', f: 'Bibliothécaire', en: 'Librarian', works: ['libraries'] },
  professor: { m: 'Professeur', f: 'Professeure', en: 'Professor', works: ['universities'] },
  printer: { m: 'Imprimeur', f: 'Imprimeuse', en: 'Printer', works: ['printing_houses'] },
  strategist: { m: 'Stratège', f: 'Stratège', en: 'Strategist', works: ['think_tanks'] },
  fountaineer: { m: 'Fontainier', f: 'Fontainière', en: 'Water keeper', works: ['aqueducts'] },
  watchman: { m: 'Veilleur', f: 'Veilleuse', en: 'Watchman', enF: 'Watchwoman', works: ['watch'] },
  sewerman: { m: 'Égoutier', f: 'Égoutière', en: 'Sewer worker', works: ['sewers'] },
  official: { m: 'Fonctionnaire', f: 'Fonctionnaire', en: 'Civil servant', works: ['bureaucracy'] },
  courtClerk: { m: 'Greffier', f: 'Greffière', en: 'Court clerk', works: ['courthouses'] },
  builder: { m: 'Bâtisseur', f: 'Bâtisseuse', en: 'Builder', works: ['public_works'] },
  stateClerk: { m: "Commis de l'État", f: "Commis de l'État", en: 'State official', works: ['ministries'] },
  archivist: { m: 'Archiviste', f: 'Archiviste', en: 'Archivist', works: ['archive_grids'] },
  architect: { m: 'Architecte', f: 'Architecte', en: 'Architect', works: ['ruin_architects'] },
};
// Le métier qu'un ATELIER donne à qui n'en porte pas sur son dessin, selon l'âge
// de la cité : [bande maximale, métier], dans l'ordre. Le cueilleur des camps
// devient maraîcher au bourg, le batelier docker à la Fonte.
export const WORK_JOBS = {
  foragers: [[1, 'gatherer'], [9, 'marketGardener']],
  granaries_city: [[9, 'storekeeper']],
  caravans: [[4, 'caravaneer'], [9, 'hauler']],
  markets: [[9, 'merchant']],
  guilds: [[9, 'artisan']],
  irrigated_fields: [[5, 'farmer'], [9, 'agronomist']],
  river_ports: [[4, 'boatman'], [9, 'docker']],
  water_mills: [[9, 'miller']],
  mint_houses: [[9, 'minter']],
  imperial_exchanges: [[4, 'changer'], [9, 'banker']],
  storytellers: [[3, 'storyteller'], [5, 'actor'], [9, 'journalist']],
  scribes: [[9, 'scribe']],
  schools: [[5, 'schoolmaster'], [9, 'teacher']],
  academies: [[9, 'lettered']],
  ancestral_cult: [[9, 'priest']],
  observatories: [[9, 'astronomer']],
  libraries: [[9, 'librarian']],
  universities: [[9, 'professor']],
  printing_houses: [[9, 'printer']],
  think_tanks: [[9, 'strategist']],
  aqueducts: [[9, 'fountaineer']],
  watch: [[9, 'watchman']],
  sewers: [[9, 'sewerman']],
  bureaucracy: [[9, 'official']],
  courthouses: [[9, 'courtClerk']],
  public_works: [[9, 'builder']],
  ministries: [[9, 'stateClerk']],
  archive_grids: [[9, 'archivist']],
  ruin_architects: [[9, 'architect']],
};
export function jobOfBuilding(buildingId, band = 0) {
  const steps = WORK_JOBS[buildingId];
  if (!steps) return null;
  for (const [max, key] of steps) if (band <= max) return key;
  return steps[steps.length - 1][1];
}
// Les bâtiments où peut travailler celui qui exerce ce métier (vide : aucun).
export function jobWorks(key) {
  const j = JOBS[key];
  return j ? j.works : null;
}
// Les enfants vont à l'école, s'il y en a une.
export const SCHOOLS = ['schools'];
export function jobLabel(key, fem) {
  const j = JOBS[key];
  if (!j) return null;
  return { fr: fem ? j.f : j.m, en: fem && j.enF ? j.enF : j.en };
}
// Ce que les villages (bandes 2-3) font du métier dans le NOM, à la place du
// lieu-dit : un titre devant le prénom (« Frère Garin »). Comme les lieux-dits, un
// nom propre resté français dans les deux langues (cityNaming.js). (« Oda du Four »
// pour la boulangère a été essayé : une femme sur six de la rue s'appelait « du
// Four » ; elle porte le nom de son foyer, comme les autres.)
const NAME_PARTS = {
  monk: { title: ['Frère', 'Sœur'] },
};

// ── LES DESSINS ──────────────────────────────────────────────────────────────
// Ce que chaque dessin d'habitant MONTRE (relevé à l'œil le 2026-10-07, sur les
// bandes installées) : `job` = le métier qu'il porte ; `age` = 'old' (cheveux
// blancs ou gris), 'mature' (dans la force de l'âge), 'young' ; `kid` = le genre
// d'un enfant quand le dessin le dit (un garçon à casquette ne s'appelle pas Oda).
// Les dessins absents d'ici n'imposent rien : métier tiré du lieu de travail.
export const SPRITE_PROFILE = {
  // Feu et Bois
  caveman3: { job: 'fisher' },
  caveman4: { job: 'shaman', age: 'old' },        // coiffe en bois de cerf, barbe blanche
  cavewoman3: { job: 'gatherer' },
  cavechild: { kid: 'm' },
  // Pierre taillée et Couronne
  villager3: { job: 'monk', age: 'old' },          // cheveux et barbe gris
  villager4: { job: 'guard' },
  villagerwoman3: { job: 'baker' },
  villagerchild: { kid: 'm' },                     // bonnet à plume
  // Marbre
  romanman: { job: 'magistrate' },                 // toge à bande pourpre
  romanman2: { job: 'merchant' },
  romanman3: { job: 'legionary' },
  romanman4: { job: 'porter' },
  romanwoman: { job: 'matron', age: 'mature' },
  romanwoman2: { job: 'priest' },
  romanwoman3: { job: 'waterCarrier' },
  romanchild: { kid: 'm' },
  // Fonte
  industrialman3: { job: 'constable' },
  industrialman4: { job: 'factory' },
  industrialwoman3: { job: 'florist' },
  industrialchild: { kid: 'm' },                   // casquette de gavroche
  // Néon
  modernman: { job: 'clerk' },
  modernman2: { age: 'young' },                    // sweat et jean
  modernman3: { job: 'courier', age: 'young' },
  modernwoman2: { job: 'nurse' },
  // Noosphère
  jademan: { age: 'mature' },                      // cheveux gris
  jademan2: { job: 'gardener' },
  jademan3: { job: 'engineer' },
  jademan4: { job: 'scholar', age: 'mature' },
  jadewoman2: { job: 'botanist', age: 'young' },
  jadewoman3: { job: 'pilot' },
  // Stellaire
  stellarman: { job: 'astronomer', age: 'old' },   // crâne chauve, barbe blanche
  stellarman2: { job: 'courier', age: 'young' },
  stellarman3: { job: 'noble', age: 'mature' },
  stellarman4: { job: 'starSailor' },
  stellarwoman: { job: 'singer', age: 'young' },
  stellarwoman2: { job: 'navigator' },
  stellarwoman3: { job: 'gardener' },
  // Démiurge
  crystalman: { job: 'mage', age: 'old' },         // cheveux et barbe blancs
  crystalman2: { job: 'sculptor' },
  crystalman3: { job: 'monk', age: 'mature' },
  crystalman4: { job: 'miner' },
  crystalwoman: { job: 'priest' },
  crystalwoman2: { job: 'weaver' },
  crystalwoman3: { job: 'dancer', age: 'young' },
  // Les porteurs de panier (un « véhicule » côté moteur, un passant à l'écran)
  'basket-man': { job: 'basket' },
  'basket-woman': { job: 'basket' },
};

// ── LE CARACTÈRE ─────────────────────────────────────────────────────────────
// `not` : le trait qu'il exclut (jamais « Bavard · Taciturne »). L'ordre est
// celui de la fiche d'avant : les clés servent aux comportements (agents.js).
export const TRAITS = [
  { key: 'chatty', m: 'Bavard', f: 'Bavarde', en: 'Chatty', not: 'quiet' },
  { key: 'quiet', m: 'Taciturne', f: 'Taciturne', en: 'Quiet', not: 'chatty' },
  { key: 'pious', m: 'Pieux', f: 'Pieuse', en: 'Pious' },
  { key: 'dreamy', m: 'Rêveur', f: 'Rêveuse', en: 'Dreamy', not: 'hardworking' },
  { key: 'greedy', m: 'Gourmand', f: 'Gourmande', en: 'Greedy' },
  { key: 'curious', m: 'Curieux', f: 'Curieuse', en: 'Curious' },
  { key: 'thrifty', m: 'Économe', f: 'Économe', en: 'Thrifty', not: 'generous' },
  { key: 'generous', m: 'Généreux', f: 'Généreuse', en: 'Generous', not: 'thrifty' },
  { key: 'spiteful', m: 'Rancunier', f: 'Rancunière', en: 'Spiteful' },
  { key: 'cheerful', m: 'Joyeux', f: 'Joyeuse', en: 'Cheerful', not: 'grumpy' },
  { key: 'superstitious', m: 'Superstitieux', f: 'Superstitieuse', en: 'Superstitious' },
  { key: 'early', m: 'Lève-tôt', f: 'Lève-tôt', en: 'Early riser' },
  { key: 'stubborn', m: 'Têtu', f: 'Têtue', en: 'Stubborn' },
  { key: 'brave', m: 'Courageux', f: 'Courageuse', en: 'Brave', not: 'cautious' },
  { key: 'cautious', m: 'Prudent', f: 'Prudente', en: 'Cautious', not: 'brave' },
  { key: 'proud', m: 'Fier', f: 'Fière', en: 'Proud' },
  { key: 'absent', m: 'Distrait', f: 'Distraite', en: 'Absent-minded' },
  { key: 'hardworking', m: 'Travailleur', f: 'Travailleuse', en: 'Hard-working', not: 'dreamy' },
  { key: 'chilly', m: 'Frileux', f: 'Frileuse', en: 'Feels the cold' },
  { key: 'grumpy', m: 'Râleur', f: 'Râleuse', en: 'Grumpy', not: 'cheerful' },
];
const TRAIT_AT = Object.fromEntries(TRAITS.map((t, i) => [t.key, i]));
export const traitWord = (key, fem) => {
  const t = TRAITS[TRAIT_AT[key]];
  return t ? { fr: fem ? t.f : t.m, en: t.en } : null;
};

// ── LES SURNOMS DES CAMPS (bandes 0-1) ───────────────────────────────────────
// Rangés avec ce qu'ils imposent. « la Rousse » et « le Boiteux » sont partis :
// aucune femme des premiers âges n'est rousse, et le boiteux marchait droit.
// Leurs remplaçants (« le Rieur », « la Rieuse ») imposent un trait, comme
// « le Taciturne ».
export const EPITHET_RULES = {
  "l'Ancien": { age: 'old' },
  "l'Aïeule": { age: 'old' },
  'le Cadet': { age: 'young' },
  'la Vive': { age: 'notOld' },
  'la Sage': { age: 'mature' },
  'le Taciturne': { trait: 'quiet' },
  'le Rieur': { trait: 'cheerful' },
  'la Rieuse': { trait: 'cheerful' },
};

// ── L'ÂGE ────────────────────────────────────────────────────────────────────
// Âge adulte par âge de la cité (bande 0 → 9) : la vie s'allonge avec elle.
export const ADULT_AGE = [[15, 42], [16, 48], [16, 56], [17, 60], [18, 66], [18, 74], [20, 82], [22, 104], [24, 130], [30, 160]];
// La plage d'une classe d'âge, dans la vie d'une bande. Un ancien des camps a
// 33 à 47 ans : la vie est courte au temps du feu.
export function ageRange(band, cls) {
  const [a, b] = ADULT_AGE[Math.max(0, Math.min(ADULT_AGE.length - 1, band | 0))];
  const w = b - a;
  switch (cls) {
    case 'old': return [Math.round(a + w * 0.65), Math.round(b + w * 0.2)];
    case 'mature': return [Math.round(a + w * 0.4), b];
    case 'young': return [a, Math.round(a + w * 0.3)];
    case 'notOld': return [a, Math.round(a + w * 0.6)];
    default: return [a, b];
  }
}
// Deux contraintes d'âge qui se croisent (le dessin, le surnom) : leur
// intersection, ou null si elles se contredisent.
function meetRanges(r1, r2) {
  const lo = Math.max(r1[0], r2[0]), hi = Math.min(r1[1], r2[1]);
  return lo <= hi ? [lo, hi] : null;
}
const pick = (list, s) => list[(s >>> 0) % list.length];
const within = (age, r) => !r || (age >= r[0] && age <= r[1]);

// ── LE FOYER ─────────────────────────────────────────────────────────────────
// Un foyer est tiré de sa graine : un couple (huit fois sur dix) ou un adulte
// seul, de 0 à 3 enfants, parfois un aïeul, leurs prénoms et leurs âges, et le
// nom de famille de l'âge. Un passant né à ce logis PREND une place libre du
// foyer : il en reçoit le prénom et l'âge. Ainsi la femme dont la fiche dit
// « Mariée à Garin » a un mari qui s'appelle vraiment Garin quand il passe dans
// la rue, leurs enfants portent le même nom, et la maison est « Cabane d'Oda »
// parce qu'Oda est la tête de ce foyer (cityMapRuntime, infobulle).
// Places : 'm' et 'f' (le couple, ou l'adulte seul), 'g' (l'aïeul), 'k0'..'k2'.
// Les logements où vivent plusieurs familles (immeubles, tours…) : un foyer par
// appartement (CM_COLLECTIVE_HOMES, cityNaming.js).
export const APARTMENTS = 12;
// FNV-1a, la même recette que cmHash (layout.js) : la graine d'une maison est
// celle avec laquelle l'infobulle la nomme (même clé de tuile, même cycle).
export function fnv1a(text) {
  const str = String(text);
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function householdSeedOf(tileKey, cycles = 0, apartment = null) {
  const h = fnv1a(`${tileKey}:${cycles}`);
  return apartment == null ? h : idHash(h, 200 + apartment);
}
// Des prénoms distincts dans un même foyer (pas deux Garin sous un toit).
function freshGiven(list, s, used) {
  for (let k = 0; k < list.length; k += 1) {
    const g = list[(s + k) % list.length];
    if (!used.has(g)) { used.add(g); return g; }
  }
  return list[s % list.length];
}
export function householdOf(hs, band = 0) {
  const s = hs >>> 0;
  const used = new Set();
  const couple = idHash(s, 1) % 10 < 8;
  const headFem = (idHash(s, 2) & 1) === 1;
  // Les parents : entre le début de la vie adulte et les deux tiers de la vie de
  // l'âge (au-delà, ce sont les aïeuls). Les époux à quelques années près.
  const [a, b] = ADULT_AGE[Math.max(0, Math.min(ADULT_AGE.length - 1, band | 0))];
  const top = Math.max(a + 3, Math.round(b - (b - a) * 0.35));
  const base = a + 2 + (idHash(s, 3) % Math.max(1, top - a - 2));
  const m = couple || !headFem
    ? { fem: false, given: freshGiven(CM_GIVEN_M, idHash(s, 7), used), age: base + (idHash(s, 4) % 5) } : null;
  const f = couple || headFem
    ? { fem: true, given: freshGiven(CM_GIVEN_F, idHash(s, 8), used), age: Math.max(a, base - 2 + (idHash(s, 5) % 5)) } : null;
  const youngest = Math.min(m ? m.age : Infinity, f ? f.age : Infinity);
  // Les enfants : jamais plus vieux que leurs parents moins seize ans.
  const kidMax = Math.min(13, youngest - 16);
  const nKids = kidMax >= 4 ? idHash(s, 6) % 4 : 0;
  const kids = [];
  for (let i = 0; i < nKids; i += 1) {
    const fem = (idHash(s, 20 + i) & 1) === 1;
    kids.push({ fem, given: freshGiven(fem ? CM_GIVEN_F : CM_GIVEN_M, idHash(s, 30 + i), used), age: 4 + (idHash(s, 40 + i) % (kidMax - 3)) });
  }
  // L'aïeul : chez un couple sur trois, le père ou la mère de l'un des deux.
  let g = null;
  if (couple && idHash(s, 9) % 3 === 0) {
    const gf = (idHash(s, 10) & 1) === 1;
    const of = (idHash(s, 13) & 1) === 1 ? 'f' : 'm';
    const [lo, hi] = ageRange(band, 'old');
    const age = Math.min(hi, Math.max(lo, (of === 'f' ? f.age : m.age) + 18 + (idHash(s, 12) % 10)));
    g = { fem: gf, given: freshGiven(gf ? CM_GIVEN_F : CM_GIVEN_M, idHash(s, 11), used), age, of };
  }
  return { seed: s, band, couple, head: headFem ? 'f' : 'm', m, f, g, kids };
}
// Le membre d'une place ('m', 'f', 'g', 'k1'…).
export function memberOf(hh, slot) {
  if (!hh || !slot) return null;
  return slot[0] === 'k' ? hh.kids[+slot.slice(1)] || null : hh[slot] || null;
}
// La place qu'un nouveau venu prend dans ce foyer, ou null s'il n'y en a pas
// (le foyer est complet, ou il n'est pas de cette famille : il y est hébergé).
// `taken` : les places tenues par un passant vivant. Le dessin compte : un vieux
// dessin prend la place de l'aïeul plutôt que celle d'un jeune époux, un garçon
// une place de garçon, et un métier sans famille (le moine) aucune.
export function householdSlot(hh, { child = false, fem = false, sprite = null, band = 0 } = {}, taken = new Set()) {
  if (!hh) return null;
  const prof = (sprite && SPRITE_PROFILE[sprite]) || {};
  if (!child && prof.job && JOBS[prof.job].celibate) return null;
  if (child) {
    const want = prof.kid ? prof.kid === 'f' : !!fem;
    for (let i = 0; i < hh.kids.length; i += 1) {
      if (hh.kids[i].fem === want && !taken.has('k' + i)) return 'k' + i;
    }
    return null;
  }
  const r = prof.age ? ageRange(band, prof.age) : null;
  const order = prof.age === 'old' ? ['g', fem ? 'f' : 'm'] : [fem ? 'f' : 'm', 'g'];
  for (const slot of order) {
    const who = hh[slot];
    if (!who || who.fem !== !!fem || taken.has(slot)) continue;
    if (slot === 'g' && prof.age !== 'old') continue;   // l'aïeul a un dessin d'aïeul
    if (!within(who.age, r)) continue;
    return slot;
  }
  return null;
}
// Ce que la fiche dit de la famille, vue depuis une place (les prénoms viennent du
// foyer ; citizenFocus en fait la phrase et les liens) :
//   { kind: 'married', other, kids } · { kind: 'single', kids } ·
//   { kind: 'child', parents } · { kind: 'elder', of } ·
//   { kind: 'lodger', host } (hébergé chez la tête du foyer) ·
//   { kind: 'nephew', host } (l'enfant hébergé) · null (le moine, sans famille).
export function familyLine(hh, slot, { child = false, celibate = false } = {}) {
  if (!hh || celibate) return null;
  if (!slot) return { kind: child ? 'nephew' : 'lodger', host: hh.head };
  if (slot[0] === 'k') return { kind: 'child', parents: ['m', 'f'].filter((k) => hh[k]) };
  if (slot === 'g') return { kind: 'elder', of: hh.g.of };
  const other = slot === 'm' ? 'f' : 'm';
  return hh[other] ? { kind: 'married', other, kids: hh.kids.length } : { kind: 'single', kids: hh.kids.length };
}

// ── TIRER UNE PERSONNE ───────────────────────────────────────────────────────
// `seed` : la graine du passant. `band` : l'âge de la cité. `child`, `fem` : son
// type (le genre d'un enfant suit son dessin s'il le dit). `sprite` : le nom du
// dessin qui le représente (SPRITE_PROFILE). `job` : la clé de métier quand le
// dessin n'en porte pas (déduite du lieu de travail par l'appelant). `household`
// et `slot` : son foyer (householdOf) et la place qu'il y tient (householdSlot) ;
// sans place, il est hébergé et garde ses propres prénom, âge et nom.
export function buildIdentity({
  seed, band = 0, child = false, fem = false, sprite = null, job = null, household = null, slot = null,
}) {
  const s = seed >>> 0;
  const prof = (sprite && SPRITE_PROFILE[sprite]) || {};
  const member = memberOf(household, slot);
  const isFem = member ? member.fem : (child && prof.kid ? prof.kid === 'f' : !!fem);
  const jobKey = child ? null : (prof.job || job || null);
  const given = member ? member.given : pick(isFem ? CM_GIVEN_F : CM_GIVEN_M, s);
  const fam = member ? household.seed : s;
  const spriteAge = child ? null : ageRange(band, prof.age);

  // Le surnom des camps, puis l'âge : celui de sa place au foyer, sinon le dessin
  // et le surnom, qui se resserrent l'un sur l'autre.
  let epithet = null;
  if (band <= 1 && !child && s % 3 === 0) {
    const list = (isFem ? CM_EPITHETS_F : CM_EPITHETS_M).filter((e) => {
      const r = EPITHET_RULES[e];
      if (!r || !r.age) return true;
      return member ? within(member.age, ageRange(band, r.age)) : !!meetRanges(spriteAge, ageRange(band, r.age));
    });
    if (list.length) epithet = pick(list, Math.floor(s / 5));
  }
  const rule = (epithet && EPITHET_RULES[epithet]) || {};
  let age;
  if (member) age = member.age;
  else if (child) age = 4 + (idHash(s, 1) % 10);
  else {
    const r = (rule.age && meetRanges(spriteAge, ageRange(band, rule.age))) || spriteAge;
    age = r[0] + (idHash(s, 1) % (r[1] - r[0] + 1));
  }

  // Le caractère : le surnom ou le métier en impose un, le second ne le contredit pas.
  const job0 = jobKey && JOBS[jobKey];
  const forced = rule.trait || (job0 && job0.pious ? 'pious' : null);
  const t1 = TRAITS[forced ? TRAIT_AT[forced] : idHash(s, 2) % TRAITS.length];
  const allowed = TRAITS.filter((t) => t.key !== t1.key && t.key !== t1.not && t.not !== t1.key);
  const t2 = allowed[idHash(s, 3) % allowed.length];

  return {
    seed: s, band, sprite, child, fem: isFem, age,
    job: jobKey,
    traits: [t1.key, t2.key],
    epithet,
    given,
    name: personName({ given, band, child, fem: isFem, epithet, job: jobKey, fam }),
    family: familyName(band, fam),
    household: household ? household.seed : null,
    slot,
    line: familyLine(household, slot, { child, celibate: !!(job0 && job0.celibate) }),
  };
}

// Le nom de famille d'un foyer à cet âge : rien aux camps, un lieu-dit aux
// villages, un nom de maison ensuite. Le même pour tout le foyer.
export function familyName(band, fam) {
  if (band <= 1) return null;
  return pick(band <= 3 ? CM_LIEUX : CM_HOUSES, Math.floor((fam >>> 0) / 7));
}
// Le nom entier : prénom + surnom (camps), prénom + métier ou lieu-dit
// (villages), prénom + maison (villes). Un moine des villages est « Frère Garin ».
function personName({ given, band, child, fem, epithet, job, fam }) {
  if (band <= 1) return epithet ? `${given} ${epithet}` : given;
  const parts = job && NAME_PARTS[job];
  if (band <= 3 && !child && parts) {
    if (parts.title) return `${parts.title[fem ? 1 : 0]} ${given}`;
    if (parts.trade) return `${given} ${parts.trade[fem ? 1 : 0]}`;
  }
  return `${given} ${familyName(band, fam)}`;
}
// Le nom de la tête d'un foyer, tel que l'infobulle le donne à sa maison
// (« Cabane d'Oda », « Maison de ville de Garin Valmoren »).
export function householdHeadName(hh) {
  const who = hh && hh[hh.head];
  if (!who) return null;
  return personName({ given: who.given, band: hh.band, child: false, fem: who.fem, epithet: null, job: null, fam: hh.seed });
}

