import React, { useEffect, useRef } from 'react';
import { resetCityMapRuntime, startCityMapRuntime } from '../game/citymap/loadCityMapScripts.js';

export default function CityMapCanvas() {
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    startCityMapRuntime(canvasRef.current, {
      mapRoot: canvasRef.current.closest(".civilization-map"),
      tooltip: tooltipRef.current,
      isActive: () => true
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
