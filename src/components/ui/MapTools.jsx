import { tr } from '../../game/core/i18n.js';
import { SHORTCUT_DEFS, shortcutKey, shortcutLabel } from '../../game/core/shortcuts.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * LES OUTILS DE LA CARTE — coin bas-droit de la Cité, au bureau (refonte « la
 * ville d'abord », maquette V4 : la poignée de Régulation et les outils de carte
 * vont jusqu'au coin, à la demande de Raph).
 *
 * Ils REJOUENT les touches du clavier au lieu d'appeler le moteur : le zoom et
 * le recentrage vivent dans le runtime de la carte (bindCityMapInput, au plus
 * près de la molette et du drag), la contemplation dans App. Un seul chemin pour
 * chaque geste, qu'il vienne du clavier ou du bouton — et aucune dépendance au
 * runtime de la carte, que d'autres chantiers modifient en continu.
 * Émis sur `document` : il remonte jusqu'à `window`, où écoute la carte, et
 * passe par `document`, où écoute App.
 */
function press(key) {
  if (!key) return;
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

const keyOf = (id) => {
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  return def ? shortcutKey(def) : null;
};

export default function MapTools() {
  // Les touches RÉATTRIBUABLES sont relues au rendu : le bouton suit le choix
  // du joueur (Options › Raccourcis).
  const recenterKey = keyOf('recenter_map');
  const contemplateKey = keyOf('contemplation');
  const tools = [
    { id: 'in', key: '+', label: tr({ fr: 'Zoom avant', en: 'Zoom in' }), kbd: '+', glyph: '+' },
    { id: 'out', key: '-', label: tr({ fr: 'Zoom arrière', en: 'Zoom out' }), kbd: '−', glyph: '−' },
    {
      id: 'recenter',
      key: recenterKey,
      label: tr({ fr: 'Recentrer', en: 'Recenter' }),
      kbd: shortcutLabel(recenterKey),
      glyph: (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="M10 1v4M10 15v4M1 10h4M15 10h4" />
        </svg>
      )
    },
    {
      id: 'contemplate',
      key: contemplateKey,
      label: tr({ fr: 'Contempler', en: 'Contemplate' }),
      kbd: shortcutLabel(contemplateKey),
      glyph: (
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M2 7V2h5M13 2h5v5M18 13v5h-5M7 18H2v-5" />
        </svg>
      )
    }
  ];
  return (
    <div className="map-tools" role="toolbar" aria-label={tr({ fr: 'Outils de la carte', en: 'Map tools' })}>
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`map-tool map-tool--${t.id}`}
          aria-label={t.label}
          {...tipProps(t.label, t.kbd)}
          onClick={() => press(t.key)}
        >
          {t.glyph}
        </button>
      ))}
    </div>
  );
}
