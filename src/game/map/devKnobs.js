"use strict";

// ── MOLETTES DE DEV : LA RÈGLE (audit 2026-10-05, DEV-3) ────────────────────
// Une « molette », c'est tout ce qu'un module pose sur `window.__x` ou
// `globalThis.__x` pour la console : réglage, interrupteur d'A/B, sonde,
// harnais de capture, relevé de diagnostic.
//
// RÈGLE UNIQUE : une molette vit derrière `import.meta.env?.DEV`, sa
// DÉFINITION comme chacune de ses LECTURES :
//
//   if (import.meta.env?.DEV && typeof window !== 'undefined') {
//     window.__x = (o) => { if (o) Object.assign(X_TUNE, o); return { ...X_TUNE }; };
//   }
//   const k = (import.meta.env?.DEV && typeof window !== 'undefined' && window.__k != null) ? window.__k : 0.72;
//
// Au build de production, Vite remplace `import.meta.env.DEV` par `false` et
// Rolldown retire le code mort : la molette n'existe ni dans dist/ ni dans
// l'.exe, le jeu y suit toujours la valeur par défaut, et rien de ce qu'on
// tape dans la console n'y change le rendu ni la sauvegarde. Sous `npm run dev`
// et sous Vitest (mode « test » : DEV vrai), tout reste disponible.
//
// · `?.` et pas `.` : plusieurs modules de la carte sont aussi importés sous
//   Node par les scripts et les bancs, où `import.meta.env` n'existe pas.
// · `DEV` EN TÊTE de la condition : `false && …` se replie à coup sûr.
// · Une lecture se garde en position BOOLÉENNE (test d'un if ou d'un ternaire,
//   opérande de && / ||). Jamais `DEV && window.__k` devant un `??` ou un
//   `!== false` : en prod, `false ?? 0.72` vaut false. Dans ce cas, écrire le
//   ternaire complet (`DEV && … != null ? window.__k : défaut`).
// · Un outil de dev qui a besoin d'une fonction (recalcul du plan, caméra…)
//   l'appelle depuis du code de dev : `window.__cityRecompute` n'existe que
//   sous DEV, ses appelants aussi.
//
// SEULE EXCEPTION : les profileurs bon marché de la sonde de perf
// (scripts/sondeGeste.js, docs/PERF-CARTE-REPRISE.md). Le lag a été constaté
// dans l'.exe : il faut pouvoir mesurer LÀ, sur une vraie fenêtre et une vraie
// sauvegarde. Éteints, ils coûtent un test de drapeau ; ils ne touchent ni au
// rendu ni à la partie. Liste FERMÉE : en ajouter une se justifie ici.
//
// Garde-fou : src/game/map/__tests__/devKnobs.test.js relit tout src/ et refuse
// une molette hors de cette règle, ainsi qu'une garde qui changerait la valeur
// par défaut en prod (`?? défaut` après la garde, lecture vraie par défaut).
export const PROD_KNOBS = Object.freeze([
  "__isoFrameProfile",       // framePerf.js : relevé de la frame entière, préambule compris
  "__isoFrameProfileLast",
  "__isoProfParts",          // iso/isoLivePaint.js : pesée fine de vif-peinture, dans ce même relevé
  "__layoutProfile",         // layout.js : les phases du calcul du plan
  "__layoutProfileLast",
  "__isoGroundProfile",      // iso/isoGroundResolve.js + isoGroundBake.js : la recuisson du sol
  "__isoGroundProfileLast",
  "__solTrace",              // solTrace.js : journal des décisions et recuissons du sol
  "__solTraceDump",
  "__solPyramideStats",      // iso/solPyramide.js : compteurs du cache de crans du sol
]);
