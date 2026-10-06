// ── LA FENÊTRE DE L'.EXE : RÉDUITE OU NON (audit 2026-10-05, ELEC-6) ─────────
// Décision B de Raph : dans l'.exe, la cité VIT fenêtre réduite ou couverte.
// main.cjs coupe l'étranglement d'arrière-plan de Chromium (backgroundThrottling:
// false) : les minuteries battent à leur rythme et la page reste « visible » pour
// l'API de visibilité. Le tick de simulation (main.js) continue donc, en régime
// 'live' ; une fenêtre réduite n'est plus une absence — le crédit hors-ligne ne
// vaut plus que pour une vraie fermeture ou une veille (écart mural,
// offlineCredit.js). Seule la CARTE cesse de peindre fenêtre réduite
// (energySaver.js, mapFrameMs) : personne ne la regarde, et elle coûterait un cœur
// et le GPU pendant tout l'AFK. La musique « seulement en onglet actif » s'y met en
// pause, comme avant.
//
// Dans le navigateur, rien ne change : pas de pont (window.civWindow absent), un
// onglet caché reste une absence — le navigateur étrangle ses minuteries, le jeu
// ne peut pas faire mieux.
//
// Module-FEUILLE (aucun import) : la carte et la boucle de jeu le lisent toutes
// deux. Le pont est relu à chaque appel (les tests le posent après l'import).
const bridge = () => (typeof window !== 'undefined' && window.civWindow) ? window.civWindow : null;

// La page tourne-t-elle dans l'.exe, où la cité vit en arrière-plan ?
export function livesInBackground() {
  const b = bridge();
  return Boolean(b && b.livesInBackground === true);
}

// Le tick doit-il tenir la page pour CACHÉE (régime 'skip' de decideTickCredit,
// offlineCredit.js) ? Dans le navigateur : onglet caché. Dans l'.exe : jamais — ses
// minuteries ne sont plus étranglées, une fenêtre réduite ou couverte crédite en
// direct, et seule une vraie veille (écart mural, régime 'offline') ou une fermeture
// passe par le hors-ligne.
export function pageHiddenForTick() {
  if (livesInBackground()) return false;
  return typeof document !== 'undefined' && Boolean(document.hidden);
}

let minimized = false;
let subscribed = null;     // le pont auquel on s'est abonné (un seul abonnement)
const listeners = new Set();

function setMinimized(on) {
  const next = Boolean(on);
  if (next === minimized) return;
  minimized = next;
  for (const fn of listeners) {
    try { fn(minimized); } catch (e) { console.error('Fenêtre réduite : écouteur en échec', e); }
  }
}

// Abonnement paresseux au pont du préload (minimize / restore relayés par
// main.cjs), et état de départ lu une fois : la fenêtre peut être lancée réduite.
function ensureSubscribed() {
  const b = bridge();
  if (!b || subscribed === b) return;
  subscribed = b;
  if (typeof b.onMinimizedChange === 'function') b.onMinimizedChange(setMinimized);
  try {
    if (typeof b.isMinimized === 'function') setMinimized(b.isMinimized());
  } catch { /* canal indisponible : on la tient pour visible */ }
}

// La fenêtre de l'.exe est-elle réduite ? Toujours false dans le navigateur.
export function isWindowMinimized() {
  ensureSubscribed();
  return minimized;
}

// Prévenu à chaque passage réduite ↔ rendue. Rend la fonction de désabonnement.
export function onWindowMinimizedChange(fn) {
  if (typeof fn !== 'function') return () => {};
  ensureSubscribed();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Tests seulement : oublie l'abonnement et l'état (un nouveau pont sera relu).
export function resetDesktopWindowForTests() {
  minimized = false;
  subscribed = null;
  listeners.clear();
}
