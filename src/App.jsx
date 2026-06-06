import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Topbar from './components/Topbar.jsx';
import BuyToolbar from './components/BuyToolbar.jsx';
import VillagerFeed from './components/VillagerFeed.jsx';
import ChoiceDialog from './components/ChoiceDialog.jsx';
import { startGameLoop, initAudio, exportSave } from './game/core/main.js';
import { useGameState } from './hooks/useGameState.js';
import { openView, save } from './game/core/state.js';
import { registerChoiceDialog } from './game/core/choiceDialog.js';

const CityView = lazy(() => import('./components/CityView.jsx'));
const PrestigeView = lazy(() => import('./components/PrestigeView.jsx'));
const RuinsView = lazy(() => import('./components/RuinsView.jsx'));
const HeritageView = lazy(() => import('./components/HeritageView.jsx'));
const MythsView = lazy(() => import('./components/MythsView.jsx'));
const ChronicleView = lazy(() => import('./components/ChronicleView.jsx'));
const OptionsDialog = lazy(() => import('./components/OptionsDialog.jsx'));
const ImportDialog = lazy(() => import('./components/ImportDialog.jsx'));
const DebugDialog = lazy(() => import('./components/DebugDialog.jsx'));

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
      if (event.key === "Escape") {
        const hasOpenDialog = Boolean(document.querySelector("dialog[open]"));
        if (!hasOpenDialog) {
          event.preventDefault();
          setIsOptionsOpen(true);
        }
        return;
      }

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
    alert("Sauvegarde exportee dans le presse-papiers !");
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
        <div className="quick-actions" style={{ marginTop: 'auto', padding: '1rem' }}>
          <button onClick={() => { save(); alert("Partie sauvegardee !"); }} title="Sauvegarder">Save</button>
          <button onClick={handleExport} title="Exporter">Export</button>
          <button onClick={() => setIsImportOpen(true)} title="Importer">Import</button>
          <button onClick={() => setIsOptionsOpen(true)} title="Options">Options</button>
        </div>
      </aside>

      <main>
        {/* Fil de notification des villageois */}
        <VillagerFeed />

        {/* Topbar reelle */}
        <Topbar />

        {/* BuyToolbar reelle */}
        <BuyToolbar />

        {/* Vue Active */}
        <Suspense fallback={null}>
          {activeView === 'city' && <CityView />}

          {activeView === 'prestige' && <PrestigeView />}

          {activeView === 'ruinsView' && <RuinsView />}

          {activeView === 'tech' && <HeritageView />}

          {activeView === 'mythView' && <MythsView />}

          {activeView === 'history' && <ChronicleView />}
        </Suspense>
      </main>

      {/* Modals Option / Import / Debug */}
      <Suspense fallback={null}>
        {isOptionsOpen && <OptionsDialog isOpen={isOptionsOpen} onClose={() => setIsOptionsOpen(false)} />}
        {isImportOpen && <ImportDialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />}
        {isDebugOpen && <DebugDialog isOpen={isDebugOpen} onClose={() => setIsDebugOpen(false)} />}
      </Suspense>
      <ChoiceDialog
        dialog={choiceDialog}
        onChoose={handleChoice}
      />
    </div>
  );
}


