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
 * Module-feuille SANS import (utilisable depuis la couche données comme l'UI).
 * ==========================================================================*/

const LANG_KEY = "civ-opt-lang";
export const SUPPORTED_LANGS = ["fr", "en"];
export const DEFAULT_LANG = "fr";

export let lang = (() => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return SUPPORTED_LANGS.includes(saved) ? saved : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
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
  return lang;
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

// Dictionnaire d'interface : libellés courts codés en dur dans les composants
// (boutons, onglets, titres). Usage : t("close") → "Fermer" / "Close".
// On migre les chaînes JSX vers des clés au fur et à mesure ; une clé absente
// retombe sur la clé elle-même, donc rien ne plante si on en oublie une.
const UI = {
  // Options
  options:            { fr: "Options",                 en: "Options" },
  close:              { fr: "Fermer",                   en: "Close" },
  language:           { fr: "Langue",                   en: "Language" },
  languageHint:       { fr: "Langue de l'interface et des textes",
                        en: "Interface and text language" },
  tabDisplay:         { fr: "Affichage",                en: "Display" },
  tabSound:           { fr: "Son",                      en: "Sound" },
  tabOther:           { fr: "Autre",                    en: "Other" }
};

export function t(key) {
  const entry = UI[key];
  return entry ? tr(entry) : key;
}

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
      if (isTransUnit(v)) root[i] = resolveUnit(v);
      else localizeData(v, seen);
    }
    return root;
  }

  for (const key of Object.keys(root)) {
    const v = root[key];
    if (isTransUnit(v)) root[key] = resolveUnit(v);
    else localizeData(v, seen); // fonctions/primitives renvoyées telles quelles
  }
  return root;
}
