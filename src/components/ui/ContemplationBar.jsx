import { CM } from '../../game/map/cityMapRuntime.js';
import { state } from '../../game/core/state.js';
import { tr } from '../../game/core/i18n.js';

// MODE CONTEMPLATION (A12) : les deux seuls éléments d'interface qui survivent,
// discrets, en bas à droite. Sortir, et garder une image.
export default function ContemplationBar({ onExit }) {
  // Cliché de la frame courante, À L'HEURE QU'IL EST : captureFrame accepte déjà
  // la nuit et la santé, il suffit de lui repasser l'état de la scène plutôt que
  // de la laisser retomber sur son plein jour déterministe. `now` est nécessaire
  // sans quoi la capture fige le temps à 0 et vide la scène de ses animations.
  const handleShot = () => {
    if (typeof CM.captureFrame !== 'function') return;
    const url = CM.captureFrame({ night: CM.nightF, health: CM.healthF, now: performance.now() });
    if (!url) return;
    const a = document.createElement('a');
    const name = (state.cityName || 'cite').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 40);
    a.href = url;
    a.download = `${name}.png`;
    a.click();
  };

  return (
    <div className="contemplation-bar">
      <button type="button" onClick={handleShot}>
        {tr({ fr: "Garder une image", en: "Keep an image" })}
      </button>
      <button type="button" onClick={onExit}>
        {tr({ fr: "Quitter (Échap)", en: "Leave (Esc)" })}
      </button>
    </div>
  );
}
