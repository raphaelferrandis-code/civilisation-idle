import { useGameState } from '../../hooks/useGameState.js';
import { markChronicleEntryRead } from '../../game/core/state.js';

export default function CollapseChronicle() {
  const entries = useGameState(s => s.chronicleEntries || []);
  const latestEntry = entries[0];
  const displayDate = latestEntry ? latestEntry.date : "An 1";

  const handleMarkRead = (id) => {
    markChronicleEntryRead(id);
  };

  return (
    <div className="collapse-chronicle-widget" aria-label="Chronique de l'effondrement">
      {/* Texture parchemin intégrée au widget */}
      <div className="chronicle-parchment-overlay" />

      {/* En-tête de la gazette */}
      <header className="chronicle-header">
        <div className="chronicle-meta-top">
          <span>Tradition & Mémoire</span>
          <span>{displayDate}</span>
          <span>Prix : Gratuit</span>
        </div>
        
        <h3 className="chronicle-main-title">
          Chronique de l'Effondrement
        </h3>
        
        <div className="chronicle-border-line" />
      </header>

      {/* Liste des entrées défilante */}
      <div className="chronicle-entries-list">
        {entries.length === 0 ? (
          <div className="chronicle-entry-card" style={{ cursor: 'default', opacity: 0.7, textAlign: 'center' }}>
            <p className="chronicle-entry-text" style={{ fontStyle: 'italic' }}>
              La chronique est vide. Le clan commence son histoire...
            </p>
          </div>
        ) : (
          (() => {
            const entry = latestEntry;
            return (
              <div 
                key={entry.id} 
                className={`chronicle-entry-card ${entry.isNew ? 'unread' : ''}`}
                onClick={() => handleMarkRead(entry.id)}
              >
                <div className="chronicle-entry-meta">
                  <span className="chronicle-entry-category">{entry.category}</span>
                </div>

                <h4 className="chronicle-entry-title">{entry.title}</h4>
                <p className="chronicle-entry-text">
                  {entry.text}
                  {entry.author && (
                    <span className="chronicle-entry-author"> — {entry.author}</span>
                  )}
                </p>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
