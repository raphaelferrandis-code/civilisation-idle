import { useSheetSwipeClose } from '../../hooks/useSheetSwipeClose.js';
import { tr } from '../../game/core/i18n.js';
import PixelIcon from './PixelIcon.jsx';

/**
 * LA FEUILLE « PLUS » DE LA BARRE BASSE (M4, tactile seulement).
 *
 * Pourquoi elle existe : à 384px, une rangée qui se partage à parts égales donne
 * 52px par onglet en début de partie et 27px avec les neuf d'une partie avancée
 * (mesuré en clonant des onglets dans le DOM). Le plancher du doigt est 44px, et
 * c'est la barre qu'on vise en aveugle au pouce. Quatre onglets restent en bas,
 * le reste s'ouvre ici.
 *
 * ⚠ ELLE PORTE AUSSI OPTIONS ET ÉTAT, et ce n'est pas un fourre-tout : ce sont
 * les deux commandes que la rangée gardait à droite, et leurs 83px sont
 * exactement ce qui manquait aux onglets pour afficher leur nom entier. « Plus »
 * veut dire tout ce qui n'est pas un des quatre gestes principaux — deux menus
 * pour la même idée en feraient un de trop.
 *
 * Le libellé est ENTIER ici, jamais le court : une feuille a la largeur d'un
 * écran, elle n'a aucune raison d'abréger ce que la barre abrège par contrainte.
 */
export default function MoreSheet({
  open,
  onClose,
  tabs = [],
  badges = {},
  activeView,
  onPick,
  onPreload,
  onOptions,
  onStatus,
  statusOpen = false,
}) {
  const [sheetRef, swipeHandleProps] = useSheetSwipeClose({ enabled: open, onClose });

  if (!open) return null;

  return (
    <>
      {/* Voile : fermer en tapant à côté est le geste que tout le monde essaie
          en premier sur une feuille. Il assombrit aussi la ville, ce qui dit
          « on est ailleurs » — la feuille ne flotte pas, elle recouvre. */}
      <div className="more-sheet-scrim" onClick={onClose} />
      <div className="more-sheet" role="dialog" aria-label={tr({ fr: 'Plus de vues', en: 'More views' })} ref={sheetRef}>
        {/* Poignée du balayage. Même règle que les deux autres feuilles : le
            geste s'arme sur le bandeau, jamais sur la liste. */}
        <div className="more-sheet-head" {...swipeHandleProps}>
          <span className="more-sheet-title">{tr({ fr: 'Plus', en: 'More' })}</span>
          <button
            type="button"
            className="more-sheet-close"
            onClick={onClose}
            aria-label={tr({ fr: 'Fermer', en: 'Close' })}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <nav className="more-sheet-list" aria-label={tr({ fr: 'Vues', en: 'Views' })}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`more-item ${activeView === tab.id ? 'active' : ''}`}
              onClick={() => onPick(tab.id)}
              onPointerEnter={() => onPreload?.(tab.id)}
              onFocus={() => onPreload?.(tab.id)}
              aria-current={activeView === tab.id ? 'page' : undefined}
            >
              <PixelIcon name={tab.icon} className="more-item-icon" />
              <span className="more-item-label">{tr(tab.label)}</span>
              {badges[tab.id] > 0 && (
                <span className="tab-badge">{badges[tab.id] > 9 ? '9+' : badges[tab.id]}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="more-sheet-list more-sheet-reglages">
          <button type="button" className="more-item" onClick={onOptions}>
            <PixelIcon name="nav/options" className="more-item-icon" />
            <span className="more-item-label">{tr({ fr: 'Options', en: 'Options' })}</span>
          </button>
          <button
            type="button"
            className={`more-item ${statusOpen ? 'active' : ''}`}
            aria-expanded={statusOpen}
            onClick={onStatus}
          >
            <i className="fa-solid fa-gauge-high more-item-icon" aria-hidden="true"></i>
            <span className="more-item-label">{tr({ fr: 'État de la civilisation', en: 'Civilization status' })}</span>
          </button>
        </div>
      </div>
    </>
  );
}
