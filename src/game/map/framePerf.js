"use strict";

// ── Profileur de FRAME de la carte ───────────────────────────────────────────
// Opt-in : `globalThis.__isoFrameProfile = true` → chaque frame remplit
// `globalThis.__isoFrameProfileLast = { total, <phase>: ms }`. Éteint, le coût
// est un test de drapeau par phase.
//
// Pourquoi un module partagé plutôt qu'un helper local au renderer iso : la
// frame se joue à DEUX endroits. `cityMapRuntime.frame()` fait un préambule
// (layout, caméra, santé, météo, révélation per-achat) puis délègue le dessin à
// `isoRenderer.drawIsoWorld()`. Mesuré sur une mégapole, le préambule pesait
// 93 ms contre 32 ms pour tout le dessin — un profileur qui ne couvre que le
// renderer regarde donc le petit quart du problème. Les deux fichiers doivent
// écrire dans le MÊME relevé, d'où ce module.
//
// ⚠ NON gaté sur import.meta.env.DEV, contrairement aux harnais __cityShot /
// __demoCity : le lag a été constaté dans le build Electron, il faut pouvoir
// profiler là, sur une vraie fenêtre et une vraie sauvegarde.
//
// Le PROPRIÉTAIRE du relevé est l'appelant le plus externe (frame()) : lui seul
// appelle fpBegin/fpEnd. Le renderer se contente de jalonner avec fp().

let out = null;
let mark = 0;
let started = 0;

export function fpBegin() {
  out = (typeof globalThis !== "undefined" && globalThis.__isoFrameProfile) ? {} : null;
  if (out) { started = performance.now(); mark = started; }
}

// Clôt la phase courante et lui impute le temps écoulé depuis le dernier jalon.
// Cumulatif : rappeler fp('x') plus loin dans la frame ajoute au même poste.
export function fp(name) {
  if (!out) return;
  const t = performance.now();
  out[name] = (out[name] || 0) + (t - mark);
  mark = t;
}

export function fpEnd() {
  if (!out) return;
  out.total = performance.now() - started;
  globalThis.__isoFrameProfileLast = out;
  out = null;
}

// Vrai quand un relevé est en cours — permet à un appelant de sauter un calcul
// de diagnostic coûteux quand le profileur est éteint.
export function fpActive() { return out !== null; }
