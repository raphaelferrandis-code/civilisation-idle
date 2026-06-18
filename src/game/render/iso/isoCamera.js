/* ============================================================================
 * isoCamera.js — Caméra du monde iso : pan (glisser) + zoom (molette).
 *
 *   La caméra = la transformation du conteneur `world` : `position` (pan) et
 *   `scale` (zoom). Rendu À LA DEMANDE : chaque pan/zoom appelle render() une
 *   fois, jamais de boucle continue.
 *
 *   Zoom par PALIERS (pixel-perfect) : on snappe sur une échelle de la liste, et
 *   on garde le point du monde sous le curseur fixe (zoom « vers la souris »).
 *   Les positions sont arrondies à l'entier pour garder le rendu net.
 * ========================================================================== */

const DEFAULT_ZOOM_STEPS = [0.25, 0.5, 1, 2, 3, 4];

export function createIsoCamera({ host, world, render, zoomSteps = DEFAULT_ZOOM_STEPS, initialZoom = 0.5 }) {
  let zoomIndex = zoomSteps.indexOf(initialZoom);
  if (zoomIndex < 0) zoomIndex = Math.max(0, zoomSteps.indexOf(1));
  world.scale.set(zoomSteps[zoomIndex]);

  let dragging = false;
  let startX = 0, startY = 0, startPosX = 0, startPosY = 0;

  const pointerPos = (e) => {
    const rect = host.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return; // glisser au bouton gauche
    dragging = true;
    const p = pointerPos(e);
    startX = p.x; startY = p.y;
    startPosX = world.position.x; startPosY = world.position.y;
    host.style.cursor = "grabbing";
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    const p = pointerPos(e);
    world.position.set(
      Math.round(startPosX + (p.x - startX)),
      Math.round(startPosY + (p.y - startY))
    );
    render();
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    host.style.cursor = "grab";
  };

  const onWheel = (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1; // molette vers le haut = zoom avant
    const next = Math.max(0, Math.min(zoomSteps.length - 1, zoomIndex + dir));
    if (next === zoomIndex) return;
    const oldScale = zoomSteps[zoomIndex];
    const newScale = zoomSteps[next];
    const p = pointerPos(e);
    // Point du monde sous le curseur, conservé fixe après le zoom.
    const wx = (p.x - world.position.x) / oldScale;
    const wy = (p.y - world.position.y) / oldScale;
    world.scale.set(newScale);
    world.position.set(
      Math.round(p.x - wx * newScale),
      Math.round(p.y - wy * newScale)
    );
    zoomIndex = next;
    render();
  };

  host.style.cursor = "grab";
  host.style.touchAction = "none"; // pas de scroll/pinch natif qui parasite
  host.addEventListener("pointerdown", onPointerDown);
  // move/up sur window : le glisser continue même curseur sorti du host.
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  host.addEventListener("wheel", onWheel, { passive: false });

  /** Centre la vue sur un point LOCAL du monde (coords pré-échelle). */
  function centerOn(localX, localY) {
    const scale = world.scale.x;
    world.position.set(
      Math.round(host.clientWidth / 2 - localX * scale),
      Math.round(host.clientHeight / 2 - localY * scale)
    );
    render();
  }

  return {
    centerOn,
    get zoom() { return zoomSteps[zoomIndex]; },
    destroy() {
      host.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      host.style.cursor = "";
      host.style.touchAction = "";
    }
  };
}
