"use strict";
// ── LA GRILLE DE BLIT — un seul arrondi pour tout ce qui bouge ───────────────
//
// Le blit est en PLUS PROCHE VOISIN (imageSmoothingEnabled = false). À position
// fractionnaire, la coupe des lignes source se DÉPLACE d'une image à l'autre
// pendant que le sprite avance : il fourmille. Rabattre la position (et la
// taille) sur un pixel ENTIER fige la coupe : le sprite avance alors par pas
// d'un pixel, la norme du pixel-art.
//
// ⚠ RABATTU SUR LA GRILLE **DEVICE**, PAS SUR LA GRILLE CSS. Le contexte de la
// carte est scalé par dpr (setTransform(dpr, …), cityMapRuntime.js) : un
// Math.round en px CSS tombe sur dpr px device — entier à dpr 1 et 2, mais sur
// un QUART de pixel à 1,25 et une DEMIE à 1,5, les deux échelles Windows les
// plus répandues, où l'arrondi CSS ne sert donc à rien. Leçon S6 de
// PLAN-RENDU-VILLE, payée pour les bâtiments, puis pour les véhicules (G0),
// puis pour les habitants et les bateaux (2026-09-14) — d'où ce module : le
// même arrondi partout, écrit une fois.
//
// À dpr 1, snapDev EST Math.round : sur un écran à 100 %, rien ne bouge.
//
// Historique des sites rabattus : bâtiments (cityEngineSprites.snapRect, S6),
// véhicules et bêtes de trait (isoUnits, 2026-08-30), habitants / porteurs /
// émeutiers (agents.js), bateaux (isoPort.js) et bétail (critters.js, qui n'a
// pas d'import et reçoit dpr en argument) — les trois derniers le 2026-09-14,
// à la demande de Raph : « je n'ai plus besoin de voir de clipping ».
import { CM } from './layout.js';

export const snapDev = (v) => { const d = CM.dpr || 1; return Math.round(v * d) / d; };
