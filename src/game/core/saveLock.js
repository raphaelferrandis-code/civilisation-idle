// UNE SEULE PARTIE OUVERTE PAR NAVIGATEUR (audit 2026-10-05, SAV-9).
//
// Le navigateur PC est une cible de sortie : deux onglets (ou la PWA et un
// onglet) jouaient chacun leur copie de la partie et sauvegardaient la même clé
// toutes les 10 s — le dernier à écrire effaçait la progression de l'autre,
// typiquement l'onglet oublié au repos qui écrasait une heure de jeu.
//
// Un verrou Web Locks (`civ-save`) désigne l'onglet qui joue. Les autres
// n'affichent qu'un écran « partie ouverte dans un autre onglet » : App n'est
// pas monté, donc ni boucle de jeu, ni musique, ni sauvegarde. « Jouer ici »
// demande à l'onglet qui joue de sauver et de céder (BroadcastChannel), puis
// recharge pour relire la partie à jour.
//
// Navigateur sans Web Locks (http hors localhost, très vieux navigateurs) :
// comportement d'avant, sans verrou. Le .exe (app://) n'en prend AUCUN : une
// seule fenêtre y est garantie par le verrou d'instance de main.cjs, et une page
// figée que main.cjs recharge pourrait encore tenir le verrou — le jeu se serait
// rouvert sur l'écran « autre onglet ».
import { tr } from "./i18n.js";
import { SAVE_KEY } from "./saveKey.js";

const LOCK_NAME = "civ-save";
const CHANNEL_NAME = "civ-save";
// sessionStorage (propre à l'onglet, survit au rechargement) : l'onglet qui
// vient de céder sa partie redémarre en spectateur SANS redemander le verrou —
// sinon il pouvait le reprendre pendant que l'autre onglet rechargeait.
const YIELDED_KEY = "civ-save-yielded";
// Un F5 relâche le verrou de l'ancienne page un peu APRÈS que la nouvelle l'a
// demandé : on l'attend un instant avant de conclure à un autre onglet.
const CLAIM_WAIT_MS = 1500;
// « Jouer ici » : délai laissé à l'onglet qui joue pour sauver et céder ; passé
// ce délai (onglet gelé, sans BroadcastChannel), le verrou est pris de force.
const TAKEOVER_STEAL_MS = 4000;

let suspended = false;

// Vrai quand cet onglet a perdu (ou cédé) la partie : save() n'écrit plus rien.
export const isSaveSuspendedForOtherTab = () => suspended;

function defaultReload() {
  globalThis.location?.reload();
}

function readYielded(storage) {
  try {
    if (storage?.getItem(YIELDED_KEY) !== "1") return false;
    storage.removeItem(YIELDED_KEY);
    return true;
  } catch {
    return false;
  }
}

function markYielded(storage) {
  try { storage?.setItem(YIELDED_KEY, "1"); } catch { /* stockage refusé : le verrou reste le garde-fou */ }
}

function readSaveRaw() {
  try { return globalThis.localStorage?.getItem(SAVE_KEY) ?? null; } catch { return null; }
}

// Prend le verrou de la partie. → Promise<boolean> : vrai si CET onglet joue.
// À appeler APRÈS le chargement de state.js (state = load()), avant de monter App.
// beforeYield : appelé quand un autre onglet réclame la partie (on sauve).
export function claimSaveLock({
  locks = globalThis.navigator?.locks,
  storage = globalThis.sessionStorage,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
  beforeYield = () => {},
  reload = defaultReload,
  readSave = readSaveRaw,
  waitMs = CLAIM_WAIT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  protocol = globalThis.location?.protocol,
} = {}) {
  if (protocol === "app:") return Promise.resolve(true);
  if (readYielded(storage)) {
    suspended = true;
    return Promise.resolve(false);
  }
  if (!locks || typeof locks.request !== "function") return Promise.resolve(true);
  // La save telle que load() vient de la lire. Si elle a bougé quand le verrou
  // arrive, un autre onglet l'a écrite en partant (fermé pendant l'attente) :
  // notre partie en mémoire est périmée, on recharge pour relire la sienne.
  const loadedSave = readSave();

  return new Promise((resolve) => {
    let settled = false;
    const settle = (owner) => {
      if (settled) return;
      settled = true;
      if (!owner) suspended = true;
      resolve(owner);
    };
    const abort = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimer(() => {
      if (abort) abort.abort();
      settle(false);
    }, waitMs);

    // Céder la partie : sauver, ne plus rien écrire, relâcher, recharger en
    // spectateur. Appelé sur demande (« Jouer ici » ailleurs) ou si le verrou
    // nous a été pris de force.
    let release = () => {};
    let channel = null;
    const yieldGame = (saveFirst) => {
      if (suspended) return;
      if (saveFirst) {
        try { beforeYield(); } catch { /* la save tient son propre journal */ }
      }
      suspended = true;
      markYielded(storage);
      try { channel?.close(); } catch { /* déjà fermé */ }
      release();
      reload();
    };

    let request;
    try {
      request = locks.request(LOCK_NAME, abort ? { signal: abort.signal } : {}, () => {
        clearTimer(timer);
        if (settled) return undefined; // délai dépassé entre-temps : on ne joue pas
        if (readSave() !== loadedSave) {
          // Partie en mémoire périmée : ni App ni sauvegarde, on relit la save.
          settled = true;
          suspended = true;
          reload();
          return new Promise(() => {});
        }
        settle(true);
        if (typeof BroadcastChannelImpl === "function") {
          try {
            channel = new BroadcastChannelImpl(CHANNEL_NAME);
            channel.onmessage = (e) => { if (e?.data?.type === "yield") yieldGame(true); };
          } catch { channel = null; }
        }
        // Le verrou est tenu tant que cette promesse n'est pas résolue.
        return new Promise((r) => { release = r; });
      });
    } catch {
      clearTimer(timer);
      settle(true); // API présente mais refusée (contexte opaque) : comportement d'avant
      return;
    }
    // Rejet : demande abandonnée au délai (déjà réglé), ou verrou PRIS DE FORCE
    // par un « Jouer ici » resté sans réponse — la partie est alors à l'autre.
    Promise.resolve(request).catch(() => {
      if (!settled) { clearTimer(timer); settle(false); return; }
      if (!suspended) yieldGame(false);
    });
  });
}

// Céder la partie (« Jouer ici » ailleurs) = la QUITTER, comme un F5 : les gardes
// de sortie de la page (save de sortie de main.js, gains en vol des jeux du
// Temple — leurs flushOnExit) passent ICI, tant que save() écrit encore. Le vrai
// beforeunload du rechargement qui suit n'écrit plus rien (yieldGame) : une
// course lancée dans l'onglet caché (rAF gelé, mise déjà prélevée) y perdait
// son gain. Aucun de ces gardes ne retient la page : l'événement simulé est sûr.
export function leaveGame(save, target = globalThis.window) {
  try { target?.dispatchEvent?.(new Event("beforeunload")); } catch { /* chaque garde tient son journal */ }
  save();
}

// « Jouer ici » depuis l'écran spectateur : l'onglet qui joue sauve et cède,
// puis on recharge pour relire SA dernière sauvegarde.
export function takeOverSave({
  locks = globalThis.navigator?.locks,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
  reload = defaultReload,
  stealAfterMs = TAKEOVER_STEAL_MS,
  setTimer = setTimeout,
} = {}) {
  if (!locks || typeof locks.request !== "function") { reload(); return; }
  let done = false;
  const onGranted = () => {
    if (done) return undefined;
    done = true;
    reload();
    return new Promise(() => {}); // tenu jusqu'au rechargement
  };
  let asked = false;
  if (typeof BroadcastChannelImpl === "function") {
    try {
      const ch = new BroadcastChannelImpl(CHANNEL_NAME);
      ch.postMessage({ type: "yield" });
      ch.close();
      asked = true;
    } catch { /* pas de canal : on prendra le verrou de force */ }
  }
  Promise.resolve(locks.request(LOCK_NAME, onGranted)).catch(() => {});
  setTimer(() => {
    if (!done) Promise.resolve(locks.request(LOCK_NAME, { steal: true }, onGranted)).catch(() => {});
  }, asked ? stealAfterMs : 0);
}

// Écran de l'onglet spectateur, en DOM brut (App n'est pas monté) : même
// habillage que l'écran de plantage (crashGuard.js).
export function showOtherTabScreen(container, { onPlayHere = () => takeOverSave() } = {}) {
  if (!container || typeof document === "undefined") return;
  const box = document.createElement("section");
  box.className = "panel view-error app-crash";
  box.setAttribute("role", "alert");
  const title = document.createElement("h2");
  title.textContent = tr({ fr: "Partie ouverte dans un autre onglet", en: "Game open in another tab" });
  const play = document.createElement("button");
  play.type = "button";
  play.className = "btn-primary";
  play.textContent = tr({ fr: "Jouer ici", en: "Play here" });
  play.addEventListener("click", () => {
    play.disabled = true;
    onPlayHere();
  });
  box.append(title, play);
  container.replaceChildren(box);
}

// Stockage « persistant » (hors .exe) : sans lui, Firefox range le localStorage
// en « au mieux », évinçable quand le disque manque. Demandé au premier geste
// du joueur — Firefox pose la question, autant qu'elle arrive en contexte.
export function askPersistentStorage({
  storageManager = globalThis.navigator?.storage,
  protocol = globalThis.location?.protocol,
  target = globalThis.window,
} = {}) {
  if (protocol === "app:" || typeof storageManager?.persist !== "function" || !target?.addEventListener) return;
  const ask = () => {
    target.removeEventListener("pointerdown", ask);
    target.removeEventListener("keydown", ask);
    Promise.resolve(typeof storageManager.persisted === "function" ? storageManager.persisted() : false)
      .then((ok) => (ok ? true : storageManager.persist()))
      .catch(() => { /* refus ou API absente : le jeu continue */ });
  };
  target.addEventListener("pointerdown", ask, { passive: true });
  target.addEventListener("keydown", ask);
}

// Tests uniquement.
export function __resetSaveLockForTests() {
  suspended = false;
}
