// EMPLACEMENTS DE SAUVEGARDE MANUELS (C9). Une partie qui se joue sur des mois
// n'avait qu'UNE seule sauvegarde, écrasée en continu par l'autosave. Trois
// emplacements manuels donnent enfin un filet : un instantané avant un Grand
// Reset risqué, avant un Mythe, avant une expérience d'équilibrage.
//
// Clés DÉRIVÉES de SAVE_KEY et jamais la clé principale : un emplacement ne doit
// pas pouvoir écraser la partie en cours par accident.
import { SAVE_KEY } from './saveKey.js';
import { state, hydrateState, setState, invalidateRenderCache, render, save } from './state.js';

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
    // Quota dépassé : on retire ce qu'on vient peut-être d'écrire à moitié,
    // sinon un emplacement à demi rempli se lirait comme valide.
    try { localStorage.removeItem(slotKey(i)); localStorage.removeItem(metaKey(i)); } catch { /* rien à faire */ }
    return { ok: false, full: true, message: e?.message || String(e) };
  }
}

// Charge un emplacement. Passe par hydrateState + setState, EXACTEMENT le chemin
// d'importSave : contourner l'hydratation perdrait les Decimal et sauterait la
// migration de schéma, donc une vieille sauvegarde reviendrait à moitié valide.
export function loadSlot(i) {
  try {
    const raw = localStorage.getItem(slotKey(i));
    if (!raw) return false;
    setState(hydrateState(JSON.parse(raw)));
    invalidateRenderCache("all");
    save();
    render();
    return true;
  } catch {
    return false;
  }
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
