"use strict";

/* ============================================================================
 * i18n.js — Couche de langue minimale (FR / EN).
 *
 * Modèle « bilingue sur place » : les champs de texte des données de jeu
 * peuvent être SOIT une simple string (texte pas encore traduit → fallback FR),
 * SOIT un objet { fr: "...", en: "..." }. Un seul helper, tr(), lit le bon
 * texte selon la langue courante. Tant qu'un champ reste une string, le jeu
 * continue de l'afficher tel quel — la migration se fait fichier par fichier
 * sans rien casser.
 *
 * La langue est un réglage d'interface (comme numberFormatMode dans utils.js),
 * pas un champ de sauvegarde : stockée en localStorage, indépendante du save.
 * Module-feuille : seul import, saveKey.js, lui-même sans dépendance
 * (utilisable depuis la couche données comme l'UI).
 *
 * Une seule voie de traduction : tr() sur une unité { fr, en } écrite sur place
 * (ou localizeData() pour aplatir des données). Pour ajouter une langue : une
 * clé de plus dans SUPPORTED_LANGS et dans chaque unité. La langue courante se
 * lit par getLang() — `lang` reste interne au module.
 * ==========================================================================*/

import { SAVE_KEY } from "./saveKey.js";

const LANG_KEY = "civ-opt-lang";
const SUPPORTED_LANGS = ["fr", "en"];
const DEFAULT_LANG = "fr";

// ── LANGUE DE DÉPART (audit 2026-10-05, I18N-1) ─────────────────────────────
// Le français était imposé à tous : un joueur anglophone démarrait l'.exe dans
// une langue qu'il ne lit pas, et devait trouver Options › Affichage › Langue à
// l'aveugle. Sans choix enregistré, on suit donc la langue du système
// (navigator.languages ; dans Electron, elle suit celle de Windows) : la
// première langue proposée que le jeu parle, sinon l'anglais.
// SEULEMENT pour un joueur NEUF : les joueurs d'avant n'ont jamais écrit la clé
// (le français était le défaut) — une save déjà là sans clé de langue, c'est un
// joueur qui jouait en français, il y reste (sinon un Français sur un Windows
// anglais basculerait en anglais à la mise à jour).
// ⚠ Ce module s'évalue APRÈS cloudSave.js et fileSave.js (main.jsx) : une save
// que Drive ou Steam Cloud vient de rapporter sur un poste neuf est donc « déjà
// là » — ce joueur démarre en français, pas dans la langue du système.
// Le choix de départ est ÉCRIT tout de suite : au lancement suivant la save
// existe, et c'est la clé qui doit répondre — pas la règle « save sans clé ».
function systemLang() {
  const nav = globalThis.navigator;
  const list = nav && nav.languages && nav.languages.length ? nav.languages : [nav && nav.language];
  const codes = Array.from(list, (l) => String(l || "").toLowerCase().split(/[-_]/)[0]).filter(Boolean);
  if (codes.length === 0) return DEFAULT_LANG; // le système ne dit rien : le français d'avant
  return codes.find((c) => SUPPORTED_LANGS.includes(c)) || "en";
}

let lang = (() => {
  let storage;
  let saved = null;
  let hasSave = false;
  try {
    storage = globalThis.localStorage || null;
    saved = storage ? storage.getItem(LANG_KEY) : null;
    hasSave = storage ? storage.getItem(SAVE_KEY) !== null : false;
  } catch {
    storage = null; // stockage refusé (navigation privée) : rien de relu, rien d'écrit
  }
  if (SUPPORTED_LANGS.includes(saved)) return saved;
  // Hors page (tests sous Node, worker) : ni langue système à suivre ni choix à
  // écrire — le français d'avant, le même sur tous les postes et en CI.
  if (typeof document === "undefined") return DEFAULT_LANG;
  const start = hasSave ? DEFAULT_LANG : systemLang();
  try {
    if (storage) storage.setItem(LANG_KEY, start);
  } catch { /* écriture refusée : la langue reste active pour la session */ }
  return start;
})();

export function getLang() {
  return lang;
}

// Change la langue active et la persiste. Ne déclenche PAS de re-rendu lui-même
// (module-feuille sans dépendance au state) : l'appelant s'en charge — en
// pratique OptionsDialog recharge la page, ce qui garantit que TOUT le texte
// (y compris les composants mémoïsés) reprend la nouvelle langue.
export function setLang(next) {
  lang = SUPPORTED_LANGS.includes(next) ? next : DEFAULT_LANG;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Sauvegarde impossible (navigation privée) : le choix reste actif en mémoire.
  }
  applyDocumentLang();
  return lang;
}

// ── LA LANGUE DÉCLARÉE À LA MACHINE (E8) ────────────────────────────────────
// `index.html` déclare `lang="fr"` EN DUR et rien ne le corrigeait : un joueur
// qui bascule en anglais recevait tout le jeu annoncé en français par la
// synthèse vocale, avec la prononciation française appliquée à des mots
// anglais. C'est illisible à l'oreille, et invisible à l'œil — donc jamais
// remonté.
//
// Appelé au démarrage ET à chaque changement de langue. Le changement recharge
// la page en pratique, mais s'appuyer là-dessus ferait dépendre une propriété
// d'accessibilité d'un effet de bord d'un autre module.
//
// Le TITRE suit aussi la langue (audit 2026-10-05, STEAM-10 et I18N-11, décision de
// Raph) : l'onglet du navigateur, et la fenêtre de l'.exe — Electron reprend le
// titre de la page (main.cjs ne pose pas de `title`). index.html porte le nom
// français pour le premier affichage.
export const GAME_TITLE = { fr: "Effondrement Idle", en: "Collapse Idle" };

export function applyDocumentLang() {
  try {
    document.documentElement.lang = lang;
    document.title = tr(GAME_TITLE);
  } catch { /* pas de DOM (tests, worker) : rien à poser */ }
}

// Cœur du système. Accepte :
//   - une string          → renvoyée telle quelle (texte non encore traduit)
//   - un objet { fr, en }  → la variante de la langue courante, avec repli FR
//   - null/undefined       → "" (jamais de plantage de rendu)
// Tout le reste est coercé en string pour ne jamais afficher [object Object].
export function tr(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return value[lang] ?? value[DEFAULT_LANG] ?? value.en ?? "";
  }
  return String(value);
}

// (Le dictionnaire de clés UI et son t() ont été retirés — audit 2026-10-05,
// I18N-12 : deux de ses sept clés seulement étaient lues, tout le reste de
// l'interface passait déjà par tr({ fr, en }) en ligne. Une seule voie.)

// ────────────────────────── Résolution des données ──────────────────────────
// La langue est figée pour la durée d'une session (OptionsDialog recharge la
// page au changement). On peut donc « aplatir » les données de jeu UNE fois au
// chargement : localizeData() parcourt une structure et remplace, EN PLACE,
// chaque feuille de traduction { fr, en } par la chaîne de la langue courante.
//
// Avantage décisif : les consommateurs lisent ensuite `building.name`,
// `upgrade.desc`, etc. comme de simples strings — AUCUN besoin d'envelopper les
// centaines de points de lecture dans tr(). On migre un fichier de données en
// passant ses textes au format { fr, en }, puis on appelle localizeData() sur
// ses exports en bas du fichier. tr() reste utile pour le texte construit
// dynamiquement (JSX, messages) ; les deux mécanismes coexistent.
//
// Sûreté : ne touche QUE les objets simples (prototype Object) ; les fonctions
// (effets de mythes/crises) et les instances de classe (Decimal) sont laissées
// telles quelles, par référence — donc rien n'est cloné ni cassé.

function isPlainObject(v) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// Une « unité de traduction » est un objet simple dont les seules clés sont
// fr et/ou en, avec au moins fr en string. (en optionnel → repli FR.)
function isTransUnit(v) {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  if (keys.length === 0 || keys.length > 2) return false;
  if (typeof v.fr !== "string") return false;
  return keys.every((k) => k === "fr" || k === "en");
}

function resolveUnit(v) {
  return v[lang] ?? v[DEFAULT_LANG] ?? v.en ?? "";
}

// Diagnostic de migration : unités { fr } rencontrées SANS leur en (→ repli FR
// silencieux en mode EN). Alimenté par localizeData au chargement des données ;
// une porte de test (i18n.coverage.test.js) asserte qu'il reste vide. Coût nul en
// prod (le parcours a déjà lieu ; l'array ne retient que les oublis, normalement 0).
export const i18nMissingEn = [];

function flattenUnit(v) {
  if (typeof v.en !== "string") i18nMissingEn.push(v.fr);
  return resolveUnit(v);
}

// Parcourt et résout EN PLACE. Renvoie la même référence (commodité pour
// `export const x = localizeData([...])`). Idempotent et protégé contre les
// cycles via `seen`.
export function localizeData(root, seen = new Set()) {
  if (root === null || typeof root !== "object" || seen.has(root)) return root;
  // Instance de classe (Decimal…) : opaque, on n'y entre pas.
  if (!isPlainObject(root) && !Array.isArray(root)) return root;
  seen.add(root);

  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i++) {
      const v = root[i];
      if (isTransUnit(v)) root[i] = flattenUnit(v);
      else localizeData(v, seen);
    }
    return root;
  }

  for (const key of Object.keys(root)) {
    const v = root[key];
    if (isTransUnit(v)) root[key] = flattenUnit(v);
    else localizeData(v, seen); // fonctions/primitives renvoyées telles quelles
  }
  return root;
}
