import { useEffect, useState } from 'react';
import { tr } from '../../game/core/i18n.js';
import { tipProps } from '../ui/HelpBubble.jsx';

// PLEIN ÉCRAN de l'.exe (audit 2026-10-05, ELEC-2) — une ligne d'Options ›
// Affichage. Le pont window.civWindow (preload.cjs) n'existe que dans l'.exe :
// ailleurs (navigateur, téléphone), la ligne ne s'affiche pas. L'état est celui
// de la FENÊTRE, que main.cjs mémorise et rétablit au lancement suivant ; F11 et
// Alt+Entrée le basculent aussi, et l'interrupteur suit.
const bridge = () => (typeof window !== 'undefined' && window.civWindow) ? window.civWindow : null;

function readFullScreen() {
  try {
    return Boolean(bridge()?.isFullScreen());
  } catch {
    return false;
  }
}

export default function FullscreenOption() {
  const [on, setOn] = useState(readFullScreen);

  useEffect(() => {
    const b = bridge();
    if (!b || typeof b.onFullScreenChange !== 'function') return undefined;
    return b.onFullScreenChange((value) => setOn(Boolean(value)));
  }, []);

  if (!bridge()) return null;
  const label = tr({ fr: "Plein écran", en: "Fullscreen" });
  const toggle = () => {
    const next = !on;
    try { bridge()?.setFullScreen(next); } catch { return; }
    setOn(next);
  };

  return (
    <div className="options-row">
      <div>
        <span {...tipProps(label, tr({ fr: "Aussi avec F11 ou Alt+Entrée", en: "Also with F11 or Alt+Enter" }))}>{label}</span>
      </div>
      <button
        type="button"
        className={`toggle-btn ${on ? 'on' : 'off'}`}
        aria-label={tr({ fr: on ? 'Activé' : 'Désactivé', en: on ? 'On' : 'Off' })}
        aria-pressed={on}
        onClick={toggle}
      />
    </div>
  );
}
