import React, { useCallback, useEffect, useRef, useState } from 'react';
import Topbar from './components/Topbar.jsx';
import BuyToolbar from './components/BuyToolbar.jsx';
import CityView from './components/CityView.jsx';
import PrestigeView from './components/PrestigeView.jsx';
import RuinsView from './components/RuinsView.jsx';
import HeritageView from './components/HeritageView.jsx';
import MythsView from './components/MythsView.jsx';
import ChronicleView from './components/ChronicleView.jsx';
import VillagerFeed from './components/VillagerFeed.jsx';
import OptionsDialog from './components/OptionsDialog.jsx';
import ImportDialog from './components/ImportDialog.jsx';
import DebugDialog from './components/DebugDialog.jsx';
import ChoiceDialog from './components/ChoiceDialog.jsx';
import { startGameLoop, initAudio, exportSave } from './game/core/main.js';
import { useGameState } from './hooks/useGameState.js';
import { openView, save } from './game/core/state.js';
import { registerChoiceDialog } from './game/core/choiceDialog.js';

export default function App() {
  const activeView = useGameState(s => s.activeView);
  const cycles = useGameState(s => s.cycles);
  const legitimacy = useGameState(s => s.legitimacy);
  const dynastyCount = useGameState(s => s.dynastyCount);
  const mourning = useGameState(s => s.mourning);

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [choiceDialog, setChoiceDialog] = useState(null);
  const choiceResolverRef = useRef(null);

  useEffect(() => {
    initAudio();
    const cleanup = startGameLoop();

    // Detect "debug" typed on keyboard
    let debugSequence = "";
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      debugSequence = `${debugSequence}${event.key.toLowerCase()}`.slice(-5);
      if (debugSequence === "debug") {
        debugSequence = "";
        setIsDebugOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cleanup();
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => registerChoiceDialog((dialog) => new Promise((resolve) => {
    choiceResolverRef.current = resolve;
    setChoiceDialog(dialog);
  })), []);

  // Determine which tabs are unlocked
  const isRuinsUnlocked = cycles >= 1 || dynastyCount > 0;
  const isHeritageUnlocked = legitimacy > 0 || dynastyCount > 0;
  const isMythsUnlocked = cycles >= 1 || dynastyCount > 0;

  const tabs = [
    { id: 'city', label: 'Cite', unlocked: true },
    { id: 'prestige', label: 'Crises', unlocked: true },
    { id: 'ruinsView', label: 'Ruines', unlocked: isRuinsUnlocked },
    { id: 'tech', label: 'Heritage', unlocked: isHeritageUnlocked },
    { id: 'mythView', label: 'Mythes', unlocked: isMythsUnlocked },
    { id: 'history', label: 'Chronique', unlocked: true },
  ];

  const handleExport = () => {
    exportSave();
    alert("Sauvegarde exportée dans le presse-papiers !");
  };

  const handleChoice = useCallback((choice) => {
    choiceResolverRef.current?.(choice);
    choiceResolverRef.current = null;
    setChoiceDialog(null);
  }, []);

  return (
    <div className={`app ${mourning ? 'mourning' : ''}`} data-active-view={activeView}>
      {/* Sidebar de navigation */}
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">CE</span>
          <div>
            <h1>Civilisation</h1>
            <p>Effondrement Idle</p>
          </div>
        </div>
        
        <nav className="tabs" aria-label="Vues">
          {tabs.map(tab => tab.unlocked && (
            <button
              key={tab.id}
              className={`tab ${activeView === tab.id ? 'active' : ''}`}
              onClick={() => openView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Boutons d'options en bas de la sidebar */}
        <div className="quick-actions" style={{ marginTop: 'auto', padding: '1rem' }}>
          <button onClick={() => { save(); alert("Partie sauvegardée !"); }} title="Sauvegarder">Save</button>
          <button onClick={handleExport} title="Exporter">Export</button>
          <button onClick={() => setIsImportOpen(true)} title="Importer">Import</button>
          <button onClick={() => setIsOptionsOpen(true)} title="Options">Options</button>
        </div>
      </aside>

      <main>
        {/* Fil de notification des villageois */}
        <VillagerFeed />

        {/* Topbar réelle */}
        <Topbar />

        {/* BuyToolbar réelle */}
        <BuyToolbar />

        {/* Vue Active */}
        {activeView === 'city' && <CityView />}

        {activeView === 'prestige' && <PrestigeView />}

        {activeView === 'ruinsView' && <RuinsView />}

        {activeView === 'tech' && <HeritageView />}

        {activeView === 'mythView' && <MythsView />}

        {activeView === 'history' && <ChronicleView />}
      </main>

      {/* Modals Option / Import / Debug */}
      <OptionsDialog isOpen={isOptionsOpen} onClose={() => setIsOptionsOpen(false)} />
      <ImportDialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
      <DebugDialog isOpen={isDebugOpen} onClose={() => setIsDebugOpen(false)} />
      <ChoiceDialog
        dialog={choiceDialog}
        onChoose={handleChoice}
      />
    </div>
  );
}


