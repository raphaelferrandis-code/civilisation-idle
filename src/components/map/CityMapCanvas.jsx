import { useEffect, useRef } from 'react';
import { resetCityMapRuntime, startCityMapRuntime } from '../../game/map/loadCityMapScripts.js';

export default function CityMapCanvas({ onCitizenThoughtClicked }) {
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);
  const callbackRef = useRef(onCitizenThoughtClicked);

  // Mettre à jour la référence du callback sans réinitialiser le canvas
  useEffect(() => {
    callbackRef.current = onCitizenThoughtClicked;
  }, [onCitizenThoughtClicked]);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    // Pas de `mapRoot` : le runtime prend le parent du canvas, le cadre
    // `.civilization-map-interactive` de CityView. L'ancien `closest()` visait une
    // classe qu'aucun élément ne porte, ne trouvait jamais rien et retombait déjà
    // sur ce parent (audit 2026-10-05, MORT-7).
    startCityMapRuntime(canvasRef.current, {
      tooltip: tooltipRef.current,
      // Met le rendu en pause tant qu'une modale (<dialog open>) est ouverte par-dessus
      // la carte (Options, Import, Debug, choix de crise). Inutile de dessiner derrière
      // une fenêtre opaque : libère CPU/GPU pour rendre l'interaction fluide.
      isActive: () => !document.querySelector("dialog[open]"),
      onCitizenThoughtClicked: (citizen, type) => {
        callbackRef.current?.(citizen, type);
      }
    });

    return () => {
      resetCityMapRuntime();
    };
  }, []);

  return (
    <>
      <canvas id="cityCanvas" ref={canvasRef} className="city-canvas" aria-hidden="true"></canvas>
      <div ref={tooltipRef} className="city-map-tooltip" aria-hidden="true">
        <span data-citymap-tooltip-kind></span>
        <strong data-citymap-tooltip-title></strong>
        <em data-citymap-tooltip-body></em>
      </div>
    </>
  );
}
