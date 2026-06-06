let engineTileMap = null;
let captureVestigeHandler = null;

export function setCityMapEngineTileMap(tileMap) {
  engineTileMap = tileMap || null;
}

export function getCityMapEngineTileMap() {
  return engineTileMap;
}

export function setCaptureVestigeHandler(handler) {
  captureVestigeHandler = typeof handler === "function" ? handler : null;
}

export function captureCurrentVestige() {
  if (captureVestigeHandler) captureVestigeHandler();
}
