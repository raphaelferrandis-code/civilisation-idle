import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Topbar from './components/ui/Topbar.jsx';
import ChoiceDialog from './components/dialogs/ChoiceDialog.jsx';
import { startGameLoop, initAudio, exportSave } from './game/core/main.js';
import { useGameState } from './hooks/useGameState.js';
import { openView, save } from './game/core/state.js';
import { registerChoiceDialog } from './game/core/choiceDialog.js';
import { currentEraIndex } from './game/core/mechanics.js';
import { eras } from './game/data/world.js';

const CityView = lazy(() => import('./components/views/CityView.jsx'));
const PrestigeView = lazy(() => import('./components/views/PrestigeView.jsx'));
const RuinsView = lazy(() => import('./components/views/RuinsView.jsx'));
const HeritageView = lazy(() => import('./components/views/HeritageView.jsx'));
const MythsView = lazy(() => import('./components/views/MythsView.jsx'));
const ChronicleView = lazy(() => import('./components/views/ChronicleView.jsx'));
const OptionsDialog = lazy(() => import('./components/dialogs/OptionsDialog.jsx'));
const ImportDialog = lazy(() => import('./components/dialogs/ImportDialog.jsx'));
const DebugDialog = lazy(() => import('./components/dialogs/DebugDialog.jsx'));

export default function App() {
  const activeView = useGameState(s => s.activeView);
  const cycles = useGameState(s => s.cycles);
  const legitimacy = useGameState(s => s.legitimacy);
  const dynastyCount = useGameState(s => s.dynastyCount);
  const grandResetCount = useGameState(s => s.grandResetCount || 0);
  const mourning = useGameState(s => s.mourning);
  // Niveau de crise continu (0→1), arrondi au pas de 5% pour limiter les re-renders.
  // Pilote la vignette progressive et la teinte de la carte via --crisis-level.
  const crisisLevel = useGameState(s => {
    const lvl = Math.max(s.instability || 0, s.timeWear || 0);
    return Math.min(1, Math.round(lvl * 20) / 20);
  });
  const isCrisisExtreme = crisisLevel >= 0.9;
  const crisisLocked = useGameState(s => !!s.crisisLimitAnnounced);
  const finalChronicleTitle = useGameState(s => s.finalChronicleTitle);
  const choiceResolverRef = useRef(null);

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [choiceDialog, setChoiceDialog] = useState(null);

  // Moment signature : bandeau plein écran au passage d'un nouvel âge (Phase 7)
  const eraIdx = useGameState(() => currentEraIndex());
  const prevEraRef = useRef(null);
  const [eraBanner, setEraBanner] = useState(null);
  useEffect(() => {
    const prev = prevEraRef.current;
    prevEraRef.current = eraIdx;
    if (prev !== null && eraIdx > prev) {
      setEraBanner(eras[eraIdx]?.name || "");
      const t = setTimeout(() => setEraBanner(null), 3200);
      return () => clearTimeout(t);
    }
  }, [eraIdx]);

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
  const isMythsUnlocked = grandResetCount >= 1;

  const tabs = [
    { id: 'city', label: 'Cité', icon: 'fa-city', unlocked: true },
    { id: 'prestige', label: 'Crises', icon: 'fa-fire', unlocked: true },
    { id: 'ruinsView', label: 'Ruines', icon: 'fa-landmark', unlocked: isRuinsUnlocked },
    { id: 'tech', label: 'Héritage', icon: 'fa-monument', unlocked: isHeritageUnlocked },
    { id: 'mythView', label: 'Mythes', icon: 'fa-bolt', unlocked: isMythsUnlocked },
    { id: 'history', label: 'Chronique', icon: 'fa-feather', unlocked: true },
  ];

  const handleExport = async () => {
    const result = await exportSave();
    if (result.ok) {
      alert("Sauvegarde exportee dans le presse-papiers !");
    } else {
      prompt("Copie ce texte :", result.text);
    }
  };
  const handleChoice = useCallback((choice) => {
    choiceResolverRef.current?.(choice);
    choiceResolverRef.current = null;
    setChoiceDialog(null);
  }, []);

  return (
    <div
      className={`app ${mourning ? 'mourning' : ''} ${isCrisisExtreme ? 'crisis-extreme' : ''}`}
      data-active-view={activeView}
      style={{ '--crisis-level': crisisLevel }}
    >
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
              className={`tab ${activeView === tab.id ? 'active' : ''} ${crisisLocked && tab.id !== 'prestige' ? 'tab-locked' : ''}`}
              disabled={crisisLocked && tab.id !== 'prestige'}
              onClick={() => !crisisLocked || tab.id === 'prestige' ? openView(tab.id) : undefined}
              title={crisisLocked && tab.id !== 'prestige' ? 'Résolvez la crise en cours pour naviguer' : tab.label}
              aria-current={activeView === tab.id ? 'page' : undefined}
            >
              <i className={`fa-solid ${tab.icon}`} aria-hidden="true"></i>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="quick-actions">
          <button className="btn-tiny" onClick={() => { save(); alert("Partie sauvegardée !"); }} title="Sauvegarder">
            <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i><span className="qa-label">Save</span>
          </button>
          <button className="btn-tiny" onClick={handleExport} title="Exporter">
            <i className="fa-solid fa-file-export" aria-hidden="true"></i><span className="qa-label">Export</span>
          </button>
          <button className="btn-tiny" onClick={() => setIsImportOpen(true)} title="Importer">
            <i className="fa-solid fa-file-import" aria-hidden="true"></i><span className="qa-label">Import</span>
          </button>
          <button className="btn-tiny" onClick={() => setIsOptionsOpen(true)} title="Options">
            <i className="fa-solid fa-gear" aria-hidden="true"></i><span className="qa-label">Options</span>
          </button>
        </div>
      </aside>

      <main>
        {finalChronicleTitle && (
          <div className="final-chronicle-title" aria-label="Titre final de la Chronique">
            {finalChronicleTitle}
          </div>
        )}



        {/* Topbar reelle */}
        <Topbar />

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

      {eraBanner && (
        <div className="era-banner" role="status" aria-live="polite">
          <span className="era-banner-kicker">Un nouvel âge commence</span>
          <strong className="era-banner-name">{eraBanner}</strong>
        </div>
      )}
    </div>
  );
}


