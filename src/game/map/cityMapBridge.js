let engineTileMap = null;
let captureVestigeHandler = null;
let resetCameraCenterHandler = null;

export function setCityMapEngineTileMap(tileMap) {
  engineTileMap = tileMap || null;
}

export function getCityMapEngineTileMap() {
  return engineTileMap;
}

export function setCaptureVestigeHandler(handler) {
  captureVestigeHandler = typeof handler === "function" ? handler : null;
}

export function captureCurrentVestige(meta) {
  if (captureVestigeHandler) captureVestigeHandler(meta);
}

export function setResetCameraCenterHandler(handler) {
  resetCameraCenterHandler = typeof handler === "function" ? handler : null;
}

export function resetCameraCenter() {
  if (resetCameraCenterHandler) resetCameraCenterHandler();
}

// ── LA CHUTE SUR LA CARTE (iso/isoChute.js, docs/PLAN-CHUTE.md) ─────────────────
// Le cœur du jeu (events.js, crisis.js) joue la chute sans connaître la carte : la
// carte enregistre ses gestes ici. Sans carte (tests, chute hors ligne), tout est
// muet : playCityFall() rend null, takeCityRelics() aussi.
let chuteHandlers = null;
export function setChuteHandlers(h) { chuteHandlers = h && typeof h === "object" ? h : null; }
// Joue la chute : promesse tenue au noir, null si la carte ne peut pas la jouer
// maintenant (pas encore construite), undefined si aucune carte n'est branchée.
export function playCityFall() { return chuteHandlers ? chuteHandlers.fall() : undefined; }
// Au noir : relève les ruines de la cité qui tombe (rien n'est écrit dans l'état).
export function captureCityRelics() { return chuteHandlers ? chuteHandlers.capture() : false; }
// completeCollapse : prend les ruines relevées (une fois), ou null.
export function takeCityRelics() { return chuteHandlers ? chuteHandlers.take() : null; }
// Cycle neuf fondé : le lever (noir → feu du campement → aube) ; onDone à l'aube.
export function playCityRise(onDone) {
  if (chuteHandlers) chuteHandlers.rise(onDone);
  else if (onDone) onDone();
}
// Séquence interrompue : la carte rend la main.
export function abortCityFall() { if (chuteHandlers) chuteHandlers.abort(); }
