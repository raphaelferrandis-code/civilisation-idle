// ÉCONOMIE D'ÉNERGIE DE LA CARTE (audit du 2026-10-05, PERF-5).
//
// Un idle reste ouvert des heures sans qu'on le regarde : fenêtre sur un second
// écran, autre application devant, joueur parti. La boucle de la carte, elle, ne
// freinait que par le préréglage Qualité (60 i/s en « Élevée ») et sous une
// modale : ~70 % d'un cœur dans l'.exe pendant tout l'AFK — ventilateurs,
// batterie des portables, et l'interface React qui se partage les miettes.
//
// Deux paliers, qui ne font que RELEVER le cap de frame (jamais l'abaisser) :
//   - fenêtre SANS FOCUS, sans entrée depuis 5 s   → 12 i/s ;
//   - aucune entrée depuis 3 min et caméra POSÉE   → 20 i/s.
// Le premier évènement (souris, clavier, molette, doigt, retour du focus) rend le
// cap normal à la vsync suivante : la rAF continue de battre à la cadence de
// l'écran, elle saute seulement plus de frames. Une souris qui SURVOLE la fenêtre
// sans focus compte comme une entrée : on regarde la carte, elle reste fluide.
// « Caméra posée » se lit sur la caméra elle-même (x, y, zoom), pas sur ses
// moteurs : un habitant suivi, un recentrage, une inertie, un zoom qui glisse
// — tout ce qui la bouge la garde à pleine cadence, sans liste à tenir.
//
// Ce qui n'est PAS touché : le tick de simulation (core/main.js, minuterie à
// part) ; la capture (CM.capture court-circuite le cap) ; la chute jouée sur la
// carte (iso/isoChute.js) — une séquence d'une quinzaine de secondes par cycle,
// faite pour être regardée.
//
// ⚠ Le pas d'animation reste borné à 1/30 s (frameBody, cityMapRuntime) : à
// 12 i/s les passants marchent donc à 40 % de leur allure, comme sur toute
// machine sous 30 i/s. Relever la borne ferait dépasser leur cible aux véhicules
// (seuil d'arrivée de 2,4 px, updateVehicles) : à ne pas faire pour un mode
// d'économie.
//
// Préférence d'AFFICHAGE persistée hors save (localStorage, comme la qualité) :
// ACTIVÉE par défaut, interrupteur dans les Options. Un banc de mesure qui
// laisse la caméra posée plus de 3 min doit l'éteindre (`civ-opt-energy-saver`
// = "false"), sinon il mesure le palier de 20 i/s. Module-FEUILLE (aucun import).
const ENERGY_KEY = "civ-opt-energy-saver";

export const ENERGY_TUNE = {
  blurFps: 12,        // fenêtre sans focus
  idleFps: 20,        // joueur absent, caméra posée
  idleMs: 180000,     // 3 min sans aucune entrée
  recentMs: 5000,     // une entrée plus récente vaut le focus (survol d'une fenêtre sans focus)
  stillMs: 1000,      // caméra immobile depuis au moins ce temps
};

export let energySaver = (() => {
  try {
    return localStorage.getItem(ENERGY_KEY) !== "false";
  } catch {
    return true;
  }
})();

export function setEnergySaver(on) {
  energySaver = !!on;
  try {
    localStorage.setItem(ENERGY_KEY, energySaver ? "true" : "false");
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}

// Cap de frame effectif (ms). PUR : tout l'état arrive en paramètre.
//   baseMs        : cap du préréglage Qualité (cmFrameMs)
//   o.saver       : interrupteur des Options
//   o.focused     : la fenêtre a le focus
//   o.sinceInput  : ms depuis la dernière entrée du joueur
//   o.sinceCam    : ms depuis le dernier mouvement de caméra
//   o.show        : séquence qu'on ne bride jamais (la chute)
export function energyFrameMs(baseMs, o) {
  if (!o.saver || o.show) return baseMs;
  const T = ENERGY_TUNE;
  if (!o.focused && o.sinceInput >= T.recentMs) return Math.max(baseMs, 1000 / T.blurFps);
  if (o.sinceInput >= T.idleMs && o.sinceCam >= T.stillMs) return Math.max(baseMs, 1000 / T.idleFps);
  return baseMs;
}

// ── Veille, alimentée par la carte ────────────────────────────────────────────
// Horodatages dans la base de temps de la rAF (performance.now) : l'entrée est
// posée par les écouteurs montés avec la carte (bindCityMapInput), la caméra
// relevée par la frame après son clamp.
const watch = { inputAt: 0, camAt: 0, cx: NaN, cy: NaN, cz: NaN };

export function noteMapInput(now) {
  watch.inputAt = now;
}

export function noteMapCamera(cam, now) {
  if (!cam) return;
  if (cam.x !== watch.cx || cam.y !== watch.cy || cam.zoom !== watch.cz) {
    watch.cx = cam.x; watch.cy = cam.y; watch.cz = cam.zoom;
    watch.camAt = now;
  }
}

export function mapFrameMs(baseMs, now, show = false) {
  let focused = true;
  try {
    if (typeof document !== "undefined" && typeof document.hasFocus === "function") focused = document.hasFocus();
  } catch { /* document indisponible : on ne bride pas sur le focus */ }
  return energyFrameMs(baseMs, {
    saver: energySaver, focused, show,
    sinceInput: now - watch.inputAt,
    sinceCam: now - watch.camAt,
  });
}
