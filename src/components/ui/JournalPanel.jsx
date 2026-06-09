import { useGameState } from '../../hooks/useGameState.js';
import { markChronicleEntryRead } from '../../game/core/state.js';
import { currentEraIndex } from '../../game/core/mechanics.js';

export function getJournalTheme(eraIndex) {
  if (eraIndex < 4) {
    return {
      cssClass: "is-oral",
      masthead: "L'ÉCHO DES SOUCHES",
      price: "Gratuit",
      tradition: "Tradition Orale"
    };
  } else if (eraIndex < 9) {
    return {
      cssClass: "is-clay-tablet",
      masthead: "LE DIT DE LA PIERRE",
      price: "3 coquillages",
      tradition: "Argile Gravée"
    };
  } else if (eraIndex < 15) {
    return {
      cssClass: "is-parchment",
      masthead: "LE FEUILLET DU HAMEAU",
      price: "1 œuf frais",
      tradition: "Manuscrit"
    };
  } else if (eraIndex < 21) {
    return {
      cssClass: "is-scroll",
      masthead: "LE HÉRAUT DE LA CITÉ",
      price: "2 deniers",
      tradition: "Proclamation"
    };
  } else if (eraIndex < 27) {
    return {
      cssClass: "is-printed-paper",
      masthead: "LA FEUILLE QUOTIDIENNE",
      price: "5 centimes",
      tradition: "Gazette Imprimée"
    };
  } else if (eraIndex < 32) {
    return {
      cssClass: "is-press",
      masthead: "LA GRANDE DÉPÊCHE",
      price: "10 centimes",
      tradition: "Presse / Ondes"
    };
  } else {
    return {
      cssClass: "is-cyber-feed",
      masthead: "LE SIGNAL",
      price: "0.02 crédit",
      tradition: "Flux Cybernétique"
    };
  }
}

export default function JournalPanel() {
  const entries = useGameState(s => s.chronicleEntries || []);
  const eraIndex = useGameState(() => currentEraIndex());
  
  const theme = getJournalTheme(eraIndex);
  const latestEntry = entries[0];
  const displayDate = latestEntry ? latestEntry.date : "An 1";

  const handleMarkRead = (id) => {
    markChronicleEntryRead(id);
  };

  return (
    <div className={`journal-panel ${theme.cssClass}`} aria-label="Journal de civilisation">
      {/* Texture parchemin / effet visuel spécifique */}
      <div className="journal-overlay" />
      
      {/* En-tête du journal */}
      <header className="journal-header">
        <div className="journal-meta-top">
          <span className="journal-source">{theme.tradition}</span>
          <span className="journal-date">{displayDate}</span>
          <span className="journal-price">Prix : {theme.price}</span>
        </div>
        
        <h3 className="journal-masthead">
          Chronique de l'Effondrement
        </h3>
        
        <div className="journal-border-line" />
      </header>

      {/* Contenu de l'article actif */}
      <div className="journal-content">
        {entries.length === 0 ? (
          <div className="journal-entry-empty">
            <p className="journal-empty-text">
              La mémoire de la civilisation est calme. Aucun événement marquant...
            </p>
          </div>
        ) : (
          <div 
            className={`journal-entry-card ${latestEntry.isNew ? 'unread' : ''}`}
            onClick={() => handleMarkRead(latestEntry.id)}
          >
            <div className="journal-entry-meta">
              <span className="journal-entry-category">{latestEntry.category}</span>
            </div>

            <h4 className="journal-entry-title">{latestEntry.title}</h4>
            <p className="journal-entry-text">
              {latestEntry.text}
              {latestEntry.author && (
                <span className="journal-entry-author"> — {latestEntry.author}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
