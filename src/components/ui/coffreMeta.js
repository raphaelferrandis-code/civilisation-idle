"use strict";

// Métadonnées des coffres du temple partagées entre composants (CoffreSelect,
// TempleAutoDials) — module plat séparé du composant pour le Fast Refresh
// (react-refresh/only-export-components), même motif que faveurShopMeta.js.

import { state } from '../../game/core/state.js';
import { COFFRE_MAX_LEVEL } from '../../game/core/balance.js';

// ×1, ×10 … ×100M : multiplicateur en clair, court (pas de fmt() ici, les
// puissances de 10 exactes se lisent mieux crues).
export function fmtMult(m) {
  if (m >= 1e6) return `${m / 1e6}M`;
  if (m >= 1e3) return `${m / 1e3}k`;
  return String(m);
}

// Rang de coffre possédé, borné (saves trafiquées comprises).
export function coffreLevel() {
  return Math.max(0, Math.min(COFFRE_MAX_LEVEL, state.coffreLevel || 0));
}
