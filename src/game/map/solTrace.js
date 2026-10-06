"use strict";
// ── TRACE DU SOL — « pourquoi cette frame a-t-elle recuit ? » ────────────────
//
// Née le 2026-09-14 : la sonde de geste (scripts/sondeGeste.js) montrait chez
// Raph six frames de suite à 67-101 ms de poste `sol`, à blits CONSTANTS — donc
// des recuissons répétées du MÊME contenu en plein geste, ce que le lot 3
// anti-clignotement interdit. Les compteurs agrégés de l'époque (le cache de crans,
// parti avec la pyramide ; aujourd'hui `__solPyramideStats`) ne disaient pas QUELLE
// branche avait pris la main ni ce qui avait changé dans la clé.
// Cette trace le dit, frame par frame, et elle vit en PROD (comme framePerf) :
// le défaut n'existe que sur la vraie machine, la vraie save, le vrai geste.
//
// Coût ÉTEINTE : un test de booléen par site. Armée : un objet par événement
// dans un tampon circulaire de 900 entrées (~15 s de geste).
//
//   __solTrace(true)      arme et vide          __solTrace(false)   éteint
//   __solTraceDump()      les entrées, dans l'ordre
//
// Une sorte d'entrée aujourd'hui :
//   { k: 'layout', … }  un recompute du plan (cityMapRuntime) : durée, phases,
//                       et les segments de la signature qui ont changé
// Parties avec leur producteur : 'sol' et 'restore' (paintIsoGroundCached et
// son cache de crans, pyramide lot 4, 2026-09-14), 'bake' (cityMapBakeMargin,
// la cuisson avec marge de pan, retirée avec l'ancien quai le 2026-10-01).

const CAP = 900;
let on = false;
let buf = [];

export const solTrace = {
  get on() { return on; },
};

export function solRec(e) {
  if (!on) return;
  e.t = Math.round(performance.now() * 10) / 10;
  if (buf.length >= CAP) buf.shift();
  buf.push(e);
}

// Segments (séparés par ':') qui diffèrent entre deux clés — indices et valeurs.
// Une clé de sol vaut ~12 segments : « seg 1 a changé » désigne le timestamp de
// layout, « seg 2 » le zoom, etc. Le lecteur n'a pas à comparer deux chaînes de
// 200 caractères à l'œil.
export function keyDiff(a, b, sep = ':') {
  if (a == null || b == null) return null;
  const A = String(a).split(sep), B = String(b).split(sep);
  const out = [];
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i += 1) if (A[i] !== B[i]) out.push(i + ':' + (A[i] ?? '∅') + '→' + (B[i] ?? '∅'));
  return out;
}

if (typeof globalThis !== 'undefined') {
  globalThis.__solTrace = (v) => { on = v !== false; if (on) buf = []; return on; };
  globalThis.__solTraceDump = () => buf.slice();
}
