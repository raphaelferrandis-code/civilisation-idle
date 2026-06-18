/* ============================================================================
 * featureFlag.js — Interrupteur du nouveau rendu isométrique (Phase 1).
 *
 *   Tant que la refonte n'est pas finie, l'ancienne carte reste le défaut et
 *   reste pleinement jouable. Le moteur iso ne s'affiche que si le flag est posé.
 *
 *   Activation (au choix) :
 *     • URL    : ?iso=1   (et ?iso=0 pour forcer l'ancien)
 *     • Console: localStorage.setItem('ce:iso','1')   puis recharger
 * ========================================================================== */

export function isoRenderEnabled() {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("iso")) return params.get("iso") !== "0";
    return window.localStorage?.getItem("ce:iso") === "1";
  } catch {
    return false;
  }
}
