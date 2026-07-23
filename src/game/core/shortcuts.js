// TABLE UNIQUE DES RACCOURCIS (C11). Avant, les touches vivaient en dur dans le
// gestionnaire clavier d'App.jsx et la liste des Options les recopiait à la main :
// deux sources, donc une liste qui pouvait mentir, et aucun moyen de désactiver
// une touche gênante (le E d'achat de masse part au moindre appui).
//
// Cette table est la SEULE source. Le gestionnaire résout par elle, l'écran des
// Options se génère par elle : ajouter une touche ici la fait apparaître aux deux
// endroits, et il devient impossible qu'ils divergent.
//
// Personnalisation persistée en localStorage, HORS sauvegarde (comme dayNightMode
// et qualityMode) : c'est un réglage de confort, il survit au Grand Reset et ne
// voyage pas dans l'export. Rien à ajouter aux normalizers ni à GR_PERSISTENT_FIELDS.
const SHORTCUTS_KEY = "civ-opt-shortcuts";

// Touches qu'on REFUSE d'attribuer. Échap ouvre les Options et ferme les
// dialogues : la laisser réattribuer permettrait de rendre les Options
// inaccessibles depuis les Options. Les touches de saisie et de navigation
// n'ont rien à faire ici non plus.
const FORBIDDEN_KEYS = new Set([
  "escape", "tab", "enter", " ", "shift", "control", "alt", "meta",
  "arrowup", "arrowdown", "arrowleft", "arrowright", "backspace", "delete",
]);

// `key` = valeur par défaut, `id` = clé de personnalisation et de traduction.
// `digits` marque les raccourcis de vue 1..8, générés à part (leur cible dépend
// des onglets débloqués).
export const SHORTCUT_DEFS = [
  { id: "buy_all", key: "e", label: { fr: "Tout acheter", en: "Buy all" },
    hint: { fr: "Achète Moteurs + Savoir + Infrastructure, du plus cher au moins cher", en: "Buys Engines + Knowledge + Infrastructure, most expensive first" } },
  { id: "buy_city", key: "m", label: { fr: "Tout acheter : Moteurs", en: "Buy all: Engines" },
    hint: { fr: "Achète tous les Moteurs abordables", en: "Buys all affordable Engines" } },
  { id: "buy_knowledge", key: "s", label: { fr: "Tout acheter : Savoir", en: "Buy all: Knowledge" },
    hint: { fr: "Achète tout le Savoir abordable", en: "Buys all affordable Knowledge" } },
  { id: "buy_infra", key: "i", label: { fr: "Tout acheter : Infrastructure", en: "Buy all: Infrastructure" },
    hint: { fr: "Achète toute l'Infrastructure abordable", en: "Buys all affordable Infrastructure" } },
  { id: "contemplation", key: "f", label: { fr: "Mode contemplation", en: "Contemplation mode" },
    hint: { fr: "Efface toute l'interface, il ne reste que la ville. Échap en sort.", en: "Hides the whole interface, leaving only the city. Esc leaves it." } },
  { id: "recenter_map", key: "c", label: { fr: "Recentrer la carte", en: "Recenter map" },
    hint: { fr: "Ramène la caméra au centre de la ville, en vol amorti", en: "Glides the camera back to the city centre" } },
];

// { [id]: { key: string|null, off: boolean } } — `key` null = touche par défaut.
export let shortcutPrefs = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
})();

function persist() {
  try {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcutPrefs));
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}

export const shortcutKey = (def) => (shortcutPrefs[def.id]?.key || def.key);
export const shortcutOff = (def) => Boolean(shortcutPrefs[def.id]?.off);

// Libellé affichable d'une touche : « E », « Échap », « ² ».
export const shortcutLabel = (key) => (key ? key.toUpperCase() : "—");

// Pourquoi cette touche est refusée, ou null si elle est acceptable. Renvoyer la
// RAISON et pas un simple booléen : « déjà prise par Tout acheter » se corrige,
// « invalide » laisse le joueur deviner.
export function shortcutRejection(def, rawKey) {
  const key = String(rawKey || "").toLowerCase();
  if (!key || key.length !== 1) {
    if (FORBIDDEN_KEYS.has(key)) return { reason: "forbidden", key };
    return { reason: "invalid", key };
  }
  if (FORBIDDEN_KEYS.has(key)) return { reason: "forbidden", key };
  // Les chiffres sont réservés aux vues 1 à 8.
  if (key >= "0" && key <= "9") return { reason: "digit", key };
  const taken = SHORTCUT_DEFS.find((d) => d.id !== def.id && shortcutKey(d) === key);
  if (taken) return { reason: "taken", key, by: taken };
  return null;
}

export function setShortcutKey(id, rawKey) {
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  if (!def) return false;
  const key = String(rawKey || "").toLowerCase();
  if (shortcutRejection(def, key)) return false;
  shortcutPrefs = { ...shortcutPrefs, [id]: { ...shortcutPrefs[id], key } };
  persist();
  return true;
}

export function resetShortcutKey(id) {
  if (!shortcutPrefs[id]) return;
  shortcutPrefs = { ...shortcutPrefs, [id]: { ...shortcutPrefs[id], key: null } };
  persist();
}

export function setShortcutOff(id, off) {
  shortcutPrefs = { ...shortcutPrefs, [id]: { ...shortcutPrefs[id], off: Boolean(off) } };
  persist();
}

// Le contexte interdit-il tout raccourci ? Gardes reprises telles quelles de
// l'ancien gestionnaire : jamais pendant une saisie, jamais par-dessus un
// dialogue, jamais avec un modificateur (Ctrl+S reste « enregistrer »).
export function shortcutsBlocked(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  // Ce module vit dans le cœur du jeu : il est importé en Node par les tests,
  // où il n'y a pas de DOM. Sans cette garde, la seule lecture du contexte de
  // saisie ferait tomber toute résolution de touche.
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
  return Boolean(document.querySelector("dialog[open]"));
}

// Résout un évènement clavier en entrée de table, ou null. NE consomme PAS
// l'évènement : l'appelant décide, notamment parce que la séquence secrète
// « debug » doit continuer d'accumuler les lettres derrière.
export function resolveShortcut(event) {
  if (shortcutsBlocked(event)) return null;
  const key = String(event.key || "").toLowerCase();
  if (key.length !== 1) return null;
  for (const def of SHORTCUT_DEFS) {
    if (shortcutOff(def)) continue;
    if (shortcutKey(def) === key) return def;
  }
  return null;
}

// Touches de CAMÉRA (A9) : flèches = panoramique amorti, +/- = zoom. Ce sont des
// touches de NAVIGATION, refusées à la table personnalisable (FORBIDDEN_KEYS) :
// elles ne peuvent donc pas entrer en conflit avec un raccourci d'achat, et n'ont
// pas à être réattribuables. Le recentrage, lui, est une touche simple : il vit
// dans SHORTCUT_DEFS (id `recenter_map`) et se résout par `resolveShortcut`.
// Renvoie une action normalisée { pan: [sdx, sdy] } | { zoom: ±1 }, ou null.
// Même garde que le reste (`shortcutsBlocked`) : rien pendant une saisie ou un
// dialogue ouvert.
export function resolveCameraKey(event) {
  if (shortcutsBlocked(event)) return null;
  switch (event.key) {
    case "ArrowLeft": return { pan: [-1, 0] };
    case "ArrowRight": return { pan: [1, 0] };
    case "ArrowUp": return { pan: [0, -1] };
    case "ArrowDown": return { pan: [0, 1] };
    case "+": case "=": return { zoom: 1 };
    case "-": case "_": return { zoom: -1 };
    default: return null;
  }
}

// Index de vue pour les touches 1 à 8, ou -1. Les chiffres restent hors table :
// leur cible dépend des onglets DÉBLOQUÉS, que seul App.jsx connaît.
export function resolveViewDigit(event) {
  if (shortcutsBlocked(event)) return -1;
  const key = String(event.key || "");
  if (key.length !== 1 || key < "1" || key > "8") return -1;
  return Number(key) - 1;
}
