// FILETS D'ERREUR DE L'INTERFACE (audit 2026-10-05, BUG-18).
// Sous React 19, une erreur de rendu que rien ne rattrape démonte TOUTE la
// racine : écran blanc, et le nettoyage de l'effet d'App arrête avec elle le
// tick, l'autosave et la sauvegarde de fermeture. Les vues sont donc entourées
// d'une frontière d'erreur (ViewErrorBoundary.jsx) qui garde App — et la boucle
// de jeu — montés ; ce module porte ce qu'elle partage avec main.jsx.
import { tr } from "./i18n.js";

const CHUNK_RELOAD_KEY = "civ-chunk-reload-at";
// Un rechargement au plus par fenêtre de 5 min : assez pour réparer un onglet
// ouvert avant un redéploiement, jamais une boucle si le fichier manque vraiment.
const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000;

// Échec de chargement d'un morceau découpé (vue, dialogue). Les libellés varient
// selon le moteur : Chromium, Firefox, Safari, Vite.
export function isChunkLoadError(error) {
  const text = `${error?.name || ""} ${error?.message || error || ""}`;
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i.test(text);
}

// Après un redéploiement, un onglet resté ouvert demande un morceau qui n'existe
// plus ; React.lazy garde cet échec en mémoire, seul un rechargement le purge.
// Le drapeau (sessionStorage) empêche de boucler : sans lui, pas de rechargement.
export function reloadOnceForChunkError({
  storage = globalThis.sessionStorage,
  now = Date.now(),
  reload = () => globalThis.location?.reload()
} = {}) {
  let last = 0;
  try { last = Number(storage?.getItem(CHUNK_RELOAD_KEY)) || 0; } catch { /* stockage refusé */ }
  if (now - last >= 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
  try {
    if (!storage) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

// Dernier recours, quand l'erreur a échappé à toutes les frontières et que React
// a vidé la racine : un écran en DOM brut plutôt qu'une page blanche muette.
export function showCrashScreen(container) {
  if (!container || typeof document === "undefined") return;
  const box = document.createElement("section");
  box.className = "panel view-error app-crash";
  box.setAttribute("role", "alert");
  const title = document.createElement("h2");
  title.textContent = tr({ fr: "Le jeu a rencontré un problème", en: "The game ran into a problem" });
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn-primary";
  reload.textContent = tr({ fr: "Recharger", en: "Reload" });
  reload.addEventListener("click", () => location.reload());
  box.append(title, reload);
  container.replaceChildren(box);
}
