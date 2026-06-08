import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { buildings, BUILDING_LORE, WONDER_LORE } from '../../game/data/buildings.js';
import { CADMOS_MAX_PERMANENT_EPITAPHS, CADMOS_EPITAPH_BONUS_PCT } from '../../game/data/myths.js';
import { engraveCadmosEpitaph } from '../../game/core/actions.js';

export default function ChronicleView() {
  const [activeTab, setActiveTab] = useState("chronicleLog"); // "chronicleLog", "archiveMoteur", "archiveSavoir", "archiveInfra", "archiveMerveilles"

  const history = useGameState(s => s.history || []);
  const recentHistory = [...history].reverse();
  const stateBuildings = useGameState(s => ({ ...s.buildings }));
  const wonders = useGameState(s => [...(s.wonders || [])]);
  const cadmosHeritage = useGameState(s => Boolean(s.cadmosHeritage));
  const cadmosChronicle = useGameState(s => s.cadmosChronicle || []);
  const cadmosLastRunChronicle = useGameState(s => s.cadmosLastRunChronicle || []);
  const cadmosPermanentEpitaphs = useGameState(s => s.cadmosPermanentEpitaphs || []);

  const tabs = [
    { id: "chronicleLog", label: "Chutes" },
    { id: "archiveMoteur", label: "Moteur" },
    { id: "archiveSavoir", label: "Savoir" },
    { id: "archiveInfra", label: "Infrastructure" },
    { id: "archiveMerveilles", label: "Merveilles" },
    { id: "archiveCadmos", label: "Ages" }
  ];

  // Render a list of cards for a given category (city / knowledge / infra)
  const renderBuildingLore = (cat) => {
    let entries = [];
    const catBuildings = buildings.filter(b => b.category === cat);
    
    catBuildings.forEach(b => {
      const count = stateBuildings[b.id] || 0;
      if (count < 1) return;

      const loreList = BUILDING_LORE[b.id] || [];
      loreList.forEach(entry => {
        if (count >= entry.at) {
          entries.push({
            id: `${b.id}-${entry.at}`,
            title: b.name,
            label: entry.label,
            text: entry.text
          });
        }
      });
    });

    if (entries.length === 0) {
      return (
        <p className="archive-empty">
          Aucune trace encore. Les premières constructions révèlent leurs secrets.
        </p>
      );
    }

    return (
      <div className="archive-list">
        {entries.map(entry => (
          <article key={entry.id} className="archive-entry">
            <header>
              <h3>{entry.title}</h3>
              <span className="chip">{entry.label}</span>
            </header>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>
    );
  };

  const renderWondersLore = () => {
    const earned = WONDER_LORE.filter(w => wonders.includes(w.id));

    if (earned.length === 0) {
      return (
        <p className="archive-empty">
          Aucune merveille n'a encore été érigée. Les grandes œuvres demandent du temps.
        </p>
      );
    }

    return (
      <div className="archive-list">
        {earned.map(w => (
          <article key={w.id} className="archive-entry">
            <header>
              <h3>{w.name}</h3>
              <span className="chip">Merveille érigée</span>
            </header>
            <p>{w.text}</p>
          </article>
        ))}
      </div>
    );
  };

  const renderCadmosEntry = (entry, { canEngrave = false } = {}) => {
    const engraved = cadmosPermanentEpitaphs.some(e => e.id === entry.id);
    const limitReached = cadmosPermanentEpitaphs.length >= CADMOS_MAX_PERMANENT_EPITAPHS;
    return (
      <article key={entry.id} className="archive-entry cadmos-entry">
        <header>
          <h3>{entry.name}</h3>
          <span className="chip">{entry.orientationLabel}</span>
        </header>
        <p>
          Palier {entry.milestoneType === "population" ? "Population" : "Infrastructure"} {entry.threshold || "-"}.
        </p>
        {canEngrave && cadmosHeritage && (
          <button
            type="button"
            disabled={engraved || limitReached}
            onClick={() => engraveCadmosEpitaph(entry.id)}
          >
            {engraved ? "Gravee" : limitReached ? "Limite atteinte" : "Graver"}
          </button>
        )}
      </article>
    );
  };

  const renderCadmosArchive = () => {
    const current = cadmosChronicle || [];
    const lastRun = cadmosLastRunChronicle || [];
    const permanent = cadmosPermanentEpitaphs || [];
    const canEngrave = cadmosHeritage && lastRun.length > 0;

    return (
      <div className="cadmos-archive">
        <section className="cadmos-block">
          <header className="cadmos-block-heading">
            <h3>Epitaphes permanentes</h3>
            <span className="chip">{permanent.length}/{CADMOS_MAX_PERMANENT_EPITAPHS}</span>
          </header>
          <p className="archive-empty">
            Bonus actif : +{Math.round(CADMOS_EPITAPH_BONUS_PCT * 100)}% permanent par epitaphe selon son orientation.
          </p>
          {permanent.length > 0 && (
            <div className="archive-list">
              {permanent.map(entry => renderCadmosEntry(entry))}
            </div>
          )}
        </section>

        <section className="cadmos-block">
          <header className="cadmos-block-heading">
            <h3>Derniere run</h3>
          </header>
          {lastRun.length === 0 ? (
            <p className="archive-empty">Aucun Age nomme dans la derniere run.</p>
          ) : (
            <div className="archive-list">
              {lastRun.map(entry => renderCadmosEntry(entry, { canEngrave }))}
            </div>
          )}
        </section>

        <section className="cadmos-block">
          <header className="cadmos-block-heading">
            <h3>Run en cours</h3>
          </header>
          {current.length === 0 ? (
            <p className="archive-empty">Aucun Age nomme pour ce cycle.</p>
          ) : (
            <div className="archive-list">
              {current.map(entry => renderCadmosEntry(entry))}
            </div>
          )}
        </section>
      </div>
    );
  };

  return (
    <section className="view active" id="history">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="label">Archives</span>
            <h2>Chronique</h2>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="archive-tabs" aria-label="Archives de la civilisation" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`archive-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {activeTab === "chronicleLog" && (
          <div className="archive-view active" id="chronicleLog">
            {history.length === 0 ? (
              <p className="archive-empty">Aucune chute répertoriée dans les chroniques pour l'instant.</p>
            ) : (
              <ol id="log" className="log">
                {recentHistory.map((entry, index) => (
                  <li key={`${history.length - index}-${entry}`}>{entry}</li>
                ))}
              </ol>
            )}
          </div>
        )}

        {activeTab === "archiveMoteur" && (
          <div className="archive-view active" id="archiveMoteur">
            {renderBuildingLore("city")}
          </div>
        )}

        {activeTab === "archiveSavoir" && (
          <div className="archive-view active" id="archiveSavoir">
            {renderBuildingLore("knowledge")}
          </div>
        )}

        {activeTab === "archiveInfra" && (
          <div className="archive-view active" id="archiveInfra">
            {renderBuildingLore("infra")}
          </div>
        )}

        {activeTab === "archiveMerveilles" && (
          <div className="archive-view active" id="archiveMerveilles">
            {renderWondersLore()}
          </div>
        )}

        {activeTab === "archiveCadmos" && (
          <div className="archive-view active" id="archiveCadmos">
            {renderCadmosArchive()}
          </div>
        )}
      </div>
    </section>
  );
}
