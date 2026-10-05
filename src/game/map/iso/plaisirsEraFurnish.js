"use strict";
// Le mobilier de chaque âge (plaisirsEraRooms.js : outils et Feu ; plaisirsEraAncient.js :
// Bois, Pierre, Couronne, Marbre ; plaisirsEraModern.js : Néon, âges cosmiques). Le Fonte
// garde le sien, dans plaisirsCoupeHD.js.
import { FEU } from './plaisirsEraRooms.js';
import { BOIS, PIERRE, COURONNE, MARBRE } from './plaisirsEraAncient.js';
import { NEON, COSMIC } from './plaisirsEraModern.js';

const KITS = { feu: FEU, bois: BOIS, pierre: PIERRE, couronne: COURONNE, marbre: MARBRE, neon: NEON, cosmic: COSMIC };

// Meuble un lieu avec le mobilier de l'âge ; false : l'âge n'en a pas (le Fonte, ou un
// lieu que l'âge laisse à la coupe). `crew` pose les figures d'un JEU (croupier,
// joueurs) : elles portent son `gate`, la vue ne les montre que jeu ouvert
// (plaisirsCoupeHD.figuresOuvertes ; la coupe se cuit tout ouvert, PERF-30).
export function furnishEra(ctx, id, x, y, w, x0r, x1r, y0, seed) {
  const kit = KITS[ctx.S.kit];
  if (!kit || !kit[id]) return false;
  kit[id](ctx, { x, y, w, x0r, x1r, y0, crew: ctx.crew(id), seed, v: (k) => seed * 3 + k });
  return true;
}
