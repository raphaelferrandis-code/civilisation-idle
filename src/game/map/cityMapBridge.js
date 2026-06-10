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

export function captureCurrentVestige() {
  if (captureVestigeHandler) captureVestigeHandler();
}

export function setResetCameraCenterHandler(handler) {
  resetCameraCenterHandler = typeof handler === "function" ? handler : null;
}

export function resetCameraCenter() {
  if (resetCameraCenterHandler) resetCameraCenterHandler();
}
