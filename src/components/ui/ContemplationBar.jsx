import { CM } from '../../game/map/cityMapRuntime.js';
import { state } from '../../game/core/state.js';
import { tr } from '../../game/core/i18n.js';

// MODE CONTEMPLATION (A12) : les deux seuls éléments d'interface qui survivent,
// discrets, en bas à droite. Sortir, et garder une image.
export default function ContemplationBar({ onExit }) {
  // Cliché de la frame courante, À L'HEURE QU'IL EST : `live` garde la scène telle
  // qu'elle est (nuit, santé, météo, ambiance réglée par le joueur, brume de
  // l'heure, émeute) au lieu du plein jour déterministe du harnais — repasser la
  // nuit et la santé ne suffisait pas : l'averse et l'émeute disparaissaient du
  // cliché (audit 2026-10-05, BUG-89). `now` est nécessaire sans quoi la capture
  // fige le temps à 0 et vide la scène de ses animations.
  const handleShot = () => {
    if (typeof CM.captureFrame !== 'function') return;
    const url = CM.captureFrame({ live: true, night: CM.nightF, health: CM.healthF, now: performance.now() });
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
      <button type="button" className="btn-close" onClick={onExit}>
        {tr({ fr: "Quitter (Échap)", en: "Leave (Esc)" })}
      </button>
    </div>
  );
}
