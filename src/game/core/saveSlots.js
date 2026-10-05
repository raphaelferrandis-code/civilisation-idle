// EMPLACEMENTS DE SAUVEGARDE MANUELS (C9). Une partie qui se joue sur des mois
// n'avait qu'UNE seule sauvegarde, écrasée en continu par l'autosave. Trois
// emplacements manuels donnent enfin un filet : un instantané avant un Grand
// Reset risqué, avant un Mythe, avant une expérience d'équilibrage.
//
// Clés DÉRIVÉES de SAVE_KEY et jamais la clé principale : un emplacement ne doit
// pas pouvoir écraser la partie en cours par accident.
import { SAVE_KEY, stripBom, clearLocalSaveUnreadable, newSaveEpoch, isFutureSave, markPendingLoad } from './saveKey.js';
import { state, hydrateState, hydrateSalvaging, render, save, collapseUnderway } from './state.js';
import { suspendCloudMirrorForReload } from './cloudSave.js';
import { readSaveBackup } from './saveBackups.js';

export const SLOT_COUNT = 3;
const slotKey = (i) => `${SAVE_KEY}-slot${i}`;
// Métadonnées à côté du payload : les lire ne doit PAS coûter le parse d'une
// sauvegarde de 270 ko juste pour afficher une date dans les Options.
const metaKey = (i) => `${SAVE_KEY}-slot${i}-meta`;

// { at, cycles, era } ou null si l'emplacement est vide.
export function readSlotMeta(i) {
  try {
    const raw = localStorage.getItem(metaKey(i));
    if (!raw) return null;
    const meta = JSON.parse(raw);
    return meta && typeof meta === "object" ? meta : null;
  } catch {
    return null;
  }
}

export function slotIsEmpty(i) {
  try {
    return !localStorage.getItem(slotKey(i));
  } catch {
    return true;
  }
}

// Écrit la partie EN COURS dans l'emplacement. Même sérialisation que save() :
// une divergence entre les deux ferait un emplacement illisible par le chemin
// d'import.
// Renvoie { ok } ou { ok: false, full: true } quand le stockage déborde — trois
// copies d'un état de 270 ko ne tiennent pas partout, et l'échec doit être DIT
// plutôt que d'être avalé comme le fait save().
export function writeSlot(i) {
  const payload = JSON.stringify(state);
  // Lus AVANT d'écrire : setItem est atomique par clé, donc un échec de quota
  // laisse l'ancienne valeur en place — l'instantané précédent doit SURVIVRE à
  // un « Écraser » qui échoue, pas être supprimé avec le brouillon.
  let prevPayload = null;
  let prevMeta = null;
  try {
    prevPayload = localStorage.getItem(slotKey(i));
    prevMeta = localStorage.getItem(metaKey(i));
  } catch { /* stockage indisponible : l'écriture ci-dessous échouera pareil */ }
  try {
    localStorage.setItem(slotKey(i), payload);
    localStorage.setItem(metaKey(i), JSON.stringify({
      at: Date.now(),
      cycles: state.cycles || 0,
      // Le nom de la cité situe l'emplacement mieux qu'une date seule.
      city: String(state.cityName || "").slice(0, 42),
    }));
    return { ok: true };
  } catch (e) {
    // Quota dépassé. Le seul vrai risque est la paire désynchronisée (payload
    // neuf écrit, méta refusée) : on RESTAURE l'ancien couple. L'ancien payload
    // tenait déjà dans le stockage, sa ré-écriture ne peut pas déborder plus
    // que celle qui vient d'échouer.
    try {
      if (prevPayload != null) {
        localStorage.setItem(slotKey(i), prevPayload);
        if (prevMeta != null) localStorage.setItem(metaKey(i), prevMeta);
        else localStorage.removeItem(metaKey(i));
      } else {
        localStorage.removeItem(slotKey(i));
        localStorage.removeItem(metaKey(i));
      }
    } catch { /* même le retour arrière déborde : on laisse l'existant tel quel */ }
    return { ok: false, full: true, message: e?.message || String(e) };
  }
}

// REMPLACER LA PARTIE, PAR UN RECHARGEMENT (audit 2026-10-05, SAV-8) — import
// (main.js), emplacement, copie de secours. `loaded` est la partie choisie, déjà
// hydratée et validée : elle est posée en attente (PENDING_LOAD_KEY, saveKey.js),
// la page recharge, et le démarrage la met en place avant state.js puis l'écrit
// de force dans le nuage (cloudSave.js) — un chargement VOLONTAIRE fait autorité,
// même moins avancé : sans ça, « la plus avancée gagne » ressusciterait au
// lancement suivant la partie qu'on vient d'abandonner.
// Avant, l'état était remplacé SUR PLACE et la partie quittée continuait d'agir
// dans la nouvelle : une main de vingt-et-un ou un vol d'Icare lancés avant le
// chargement (mise rendue par lui) se jouaient et payaient après, les tours
// différés tombaient dans la partie chargée, le deuil du Grand Reset la rasait
// avec les sceaux de l'ancienne, la caméra et les faits divers restaient ceux de
// l'autre ville. Le rechargement remet tout l'état de module à neuf d'un coup.
// `beforeReload` : un dernier geste une fois la partie posée (la copie d'avant
// l'import) — APRÈS, pour qu'un stockage presque plein serve d'abord la partie.
// false si le stockage refuse la partie en attente (plein) : rien ne change.
export function replaceGameByReload(loaded, { beforeReload } = {}) {
  // Aucune absence à créditer : un emplacement garde le lastTick du moment où il a
  // été écrit, et le rattrapage hors-ligne du démarrage paierait tout l'intervalle
  // — le chargement sur place n'en créditait aucun.
  loaded.lastTick = Date.now();
  if (!markPendingLoad(loaded)) return false;
  try { beforeReload?.(); } catch { /* un filet, pas un préalable */ }
  // La partie quittée ne part plus au nuage (autosave, fermeture) : la page
  // suivante y écrit la partie choisie.
  suspendCloudMirrorForReload();
  globalThis.location?.reload?.();
  return true;
}

// Charge un emplacement. Passe par hydrateState, EXACTEMENT le chemin d'importSave :
// contourner l'hydratation perdrait les Decimal et sauterait la migration de
// schéma, donc une vieille sauvegarde reviendrait à moitié valide.
// Refusé pendant une chute (collapseUnderway) : on la laisse aller à la stèle, le
// rechargement la couperait net (avant SAV-8, la séquence reprenait même après ses
// `await` sur la partie chargée, qui tombait avec le gain de l'ancienne).
// Pourquoi le dernier chargement d'emplacement a été refusé ("" = accepté) :
// 'newer' se dit autrement que « illisible » — il faut mettre le jeu à jour ;
// 'storage' : plus de place pour la partie en attente.
let lastSlotRefusal = "";
export const getLastSlotRefusal = () => lastSlotRefusal;

export function loadSlot(i) {
  lastSlotRefusal = "";
  if (collapseUnderway()) return false;
  try {
    const raw = localStorage.getItem(slotKey(i));
    if (!raw) return false;
    const parsed = JSON.parse(stripBom(raw));
    // Emplacement écrit par une version PLUS RÉCENTE du jeu (branche bêta) : le
    // charger le rétrograderait, puis l'écrirait de force dans le nuage (SAV-6).
    if (isFutureSave(parsed)) { lastSlotRefusal = "newer"; return false; }
    const loaded = hydrateState(parsed);
    // Époque fraîche (saveKey.js, SAV-4) : l'emplacement REMPLACE la partie — sans
    // elle, un autre poste resté sur la partie abandonnée (plus avancée) la
    // remettait dans Drive au lancement, et elle ressuscitait ici.
    loaded.saveEpoch = newSaveEpoch();
    if (!replaceGameByReload(loaded)) { lastSlotRefusal = "storage"; return false; }
    return true;
  } catch {
    return false;
  }
}

// Charge une COPIE DE SECOURS (saveBackups.js : save illisible archivée, ou save
// locale évincée par le nuage). Même chemin que loadSlot, avec le repli champ par
// champ de load() : une copie archivée parce qu'elle faisait lever l'hydratation
// se relit après une mise à jour corrective, ou amputée du seul champ fautif.
// Rend { ok, dropped } — dropped = champs remis à neuf, pour que l'interface le dise
// (et le Journal de la partie chargée, qui survit au rechargement) ; storage = plus
// de place pour la partie en attente.
export function loadBackup(key) {
  if (collapseUnderway()) return { ok: false };
  try {
    const raw = readSaveBackup(key);
    if (!raw) return { ok: false };
    const parsed = JSON.parse(stripBom(raw));
    // Copie d'une version plus récente (SAV-6) : à recharger une fois le jeu à jour.
    if (isFutureSave(parsed)) return { ok: false, newer: true };
    const { state: loaded, dropped } = hydrateSalvaging(parsed);
    loaded.saveEpoch = newSaveEpoch(); // remplace la partie, comme un emplacement (SAV-4)
    if (dropped.length) {
      // Bornée à 48 comme log() : normalizeHistory garde les 48 PREMIÈRES lignes au
      // rechargement, une 49e — celle-ci, la seule qui dit ce qui manque — sautait.
      loaded.history = [
        ...(loaded.history || []),
        `La copie n'a pas pu être relue en entier : ${dropped.join(", ")} remis à neuf. La copie complète reste dans les Options, onglet Autres.`
      ].slice(-48);
    }
    if (!replaceGameByReload(loaded)) return { ok: false, storage: true };
    return { ok: true, dropped };
  } catch {
    return { ok: false };
  }
}

// « Garder cette partie » : la save du démarrage était illisible (copie gardée),
// et le joueur choisit de continuer la partie neuve de repli. L'écriture reprend
// — la clé principale reçoit la partie neuve ; le nuage, lui, reste sous la garde
// ordinaire et n'acceptera pas une partie moins avancée que la sienne.
export function keepFallbackGame() {
  clearLocalSaveUnreadable();
  save();
  render();
}

export function clearSlot(i) {
  try {
    localStorage.removeItem(slotKey(i));
    localStorage.removeItem(metaKey(i));
  } catch { /* stockage indisponible */ }
}

// Écrit la partie en cours dans un FICHIER. Dans le .exe on passe par le pont
// Electron (dialogue d'enregistrement natif) ; au navigateur, par un Blob et un
// lien de téléchargement. Renvoie { ok, path? } ou { ok: false }.
export async function saveToFile(encoded, filename) {
  const bridge = typeof window !== "undefined" ? window.civCloud : null;
  if (bridge && typeof bridge.saveAs === "function") {
    try {
      const res = await bridge.saveAs(encoded, filename);
      return res && res.ok ? res : { ok: false };
    } catch {
      return { ok: false };
    }
  }
  try {
    const blob = new Blob([encoded], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    // Révocation différée : révoquer tout de suite annule le téléchargement sur
    // certains navigateurs, qui lisent l'URL après le retour du clic.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
