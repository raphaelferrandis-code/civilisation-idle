"use strict";

// Le journal court (state.history, 48 entrées). FEUILLE qui n'importe que state.js :
// data/myths.js la prend ici et plus dans le baril actions.js, ce qui refermait un
// cycle de 43 modules (importer actions/augures.js en premier levait une TDZ sur
// AUGURY_RITES — audit du 05/10, STRUCT-1). actions/utils.js la réexporte.
import { state } from './state.js';

export function log(message) {
  state.history = [...(state.history || []), message].slice(-48);
}
