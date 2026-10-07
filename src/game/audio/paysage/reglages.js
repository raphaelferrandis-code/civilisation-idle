// LES RÉGLAGES DU PAYSAGE SONORE : Options › Son › Ambiance, et son volume.
//
// À part de la musique et des bruitages (docs/PLAN-AMBIANCE-SONORE.md § 3.8) : on
// peut couper l'une et garder les autres. Activée par défaut, à 40 % (Raph, après
// écoute, le 2026-10-07 : « avec le son ambiance à 40 % c'est mieux »).
//
// ⚠ Les clés ne disent PAS « ambiance » : `civ-opt-ambiance` est déjà celle du
// réglage « Mouvement » (map/ambianceMode.js), qui ne touche que l'image.
//
// Préférence persistée hors sauvegarde (localStorage), comme la musique. Module-
// FEUILLE (aucun import) : les Options et le directeur le lisent tous deux.
const CLE = 'civ-opt-paysage';
const CLE_VOLUME = 'civ-opt-paysage-volume';
export const PAYSAGE_VOLUME_DEFAUT = 0.4;

let actif = true;
let volume = PAYSAGE_VOLUME_DEFAUT;
try {
  const a = localStorage.getItem(CLE);
  if (a !== null) actif = a !== 'false';
  const v = localStorage.getItem(CLE_VOLUME);
  if (v !== null && Number.isFinite(Number(v))) volume = Math.max(0, Math.min(1, Number(v)));
} catch { /* stockage indisponible : les valeurs par défaut valent pour la session */ }

const abonnes = new Set();
function prevenir() {
  for (const fn of abonnes) {
    try { fn(); } catch (e) { console.error('Paysage sonore : abonné en échec', e); }
  }
}

export function getPaysageActif() {
  return actif;
}
export function getPaysageVolume() {
  return volume;
}
export function setPaysageActif(on) {
  actif = Boolean(on);
  try { localStorage.setItem(CLE, String(actif)); } catch { /* idem */ }
  prevenir();
}
export function setPaysageVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  try { localStorage.setItem(CLE_VOLUME, String(volume)); } catch { /* idem */ }
  prevenir();
}
// Prévenu à chaque changement. Rend la fonction de désabonnement.
export function onPaysageReglages(fn) {
  if (typeof fn !== 'function') return () => {};
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}
