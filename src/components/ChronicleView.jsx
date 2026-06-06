import React, { useState } from 'react';
import { useGameState } from '../hooks/useGameState.js';
import { buildings, BUILDING_LORE, WONDER_LORE } from '../game/data/buildings.js';

export default function ChronicleView() {
  const [activeTab, setActiveTab] = useState("chronicleLog"); // "chronicleLog", "archiveMoteur", "archiveSavoir", "archiveInfra", "archiveMerveilles"

  const history = useGameState(s => s.history || []);
  const stateBuildings = useGameState(s => ({ ...s.buildings }));
  const wonders = useGameState(s => s.wonders || []);

  const tabs = [
    { id: "chronicleLog", label: "Chutes" },
    { id: "archiveMoteur", label: "Moteur" },
    { id: "archiveSavoir", label: "Savoir" },
    { id: "archiveInfra", label: "Infrastructure" },
    { id: "archiveMerveilles", label: "Merveilles" }
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
                {history.map((entry, index) => (
                  <li key={index}>{entry}</li>
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
      </div>
    </section>
  );
}
