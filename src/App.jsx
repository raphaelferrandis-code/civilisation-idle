import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Topbar from './components/ui/Topbar.jsx';
import CityStatusPanel from './components/ui/CityStatusPanel.jsx';
import PixelIcon from './components/ui/PixelIcon.jsx';
import ChoiceDialog from './components/dialogs/ChoiceDialog.jsx';
import OutcomeFloatLayer from './components/ui/OutcomeFloatLayer.jsx';
import ContemplationBar from './components/ui/ContemplationBar.jsx';
import { startGameLoop, initAudio, exportSave } from './game/core/main.js';
import { useGameState } from './hooks/useGameState.js';
import { openView, save } from './game/core/state.js';
import { buyAllAffordable } from './game/core/actions.js';
import { registerChoiceDialog } from './game/core/choiceDialog.js';
import { currentEraIndex } from './game/core/mechanics.js';
import { eras } from './game/data/world.js';
import { getEraTheme } from './game/data/eraThemes.js';
import { tr, getLang } from './game/core/i18n.js';
import logoFr from './assets/LOGO.png';
import logoEn from './assets/LOGO_collapse.png';

// Logo selon la langue (figée par session — la page est rechargée au changement
// dans OptionsDialog, donc un simple choix au rendu suffit).
const logoUrl = getLang() === 'en' ? logoEn : logoFr;

const CityView = lazy(() => import('./components/views/CityView.jsx'));
const RegulationView = lazy(() => import('./components/views/RegulationView.jsx'));
const PrestigeView = lazy(() => import('./components/views/PrestigeView.jsx'));
const RuinsView = lazy(() => import('./components/views/RuinsView.jsx'));
const HeritageView = lazy(() => import('./components/views/HeritageView.jsx'));
const MythsView = lazy(() => import('./components/views/MythsView.jsx'));
const ChronicleView = lazy(() => import('./components/views/ChronicleView.jsx'));
const ComptoirView = lazy(() => import('./components/views/ComptoirView.jsx'));
const OptionsDialog = lazy(() => import('./components/dialogs/OptionsDialog.jsx'));
const ImportDialog = lazy(() => import('./components/dialogs/ImportDialog.jsx'));
const DebugDialog = lazy(() => import('./components/dialogs/DebugDialog.jsx'));

export default function App() {
  const activeView = useGameState(s => s.activeView);
  const cycles = useGameState(s => s.cycles);
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
  // MODE CONTEMPLATION : toute l'interface s'efface, il ne reste que la ville.
  // Purement présentationnel — le rendu et la simulation continuent à l'identique,
  // c'est ce qui rend ce mode bon marché.
  const [contemplation, setContemplation] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [choiceDialog, setChoiceDialog] = useState(null);
  // Les jeux du temple (augures / Icare) ne sont PLUS des modales : ils vivent
  // dans la scène en bas de la page Régulation (RegulationStage).

  // Moment signature : bandeau plein écran au passage d'un nouvel âge (Phase 7).
  // Changement d'ÉPOQUE (toutes les 5 ères) : cérémonie renforcée + bascule de peau UI.
  const eraIdx = useGameState(() => currentEraIndex());
  const prevEraRef = useRef(null);
  const [eraBanner, setEraBanner] = useState(null);
  useEffect(() => {
    const prev = prevEraRef.current;
    prevEraRef.current = eraIdx;
    if (prev !== null && eraIdx > prev) {
      const theme = getEraTheme(eraIdx);
      const isEpochShift = getEraTheme(prev).band !== theme.band;
      setEraBanner({
        name: eras[eraIdx]?.name || "",
        epoch: isEpochShift ? theme.epochLabel : null
      });
      const t = setTimeout(() => setEraBanner(null), isEpochShift ? 4800 : 3200);
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
        if (hasOpenDialog) return;
        event.preventDefault();
        // Échap sert d'ABORD à quitter la contemplation : ouvrir les Options
        // depuis un écran sans interface serait le pire des enchaînements.
        setContemplation((on) => {
          if (on) return false;
          setIsOptionsOpen(true);
          return false;
        });
        return;
      }
      // F : entrer ou sortir de la contemplation (jamais automatique).
      if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const el = document.activeElement;
        const isTyping = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
        if (!isTyping && !document.querySelector("dialog[open]")) {
          event.preventDefault();
          setContemplation((on) => !on);
          return;
        }
      }

      // Raccourcis d'achat de masse, sans scroller :
      //   E → tout acheter (Moteurs + Savoir + Infra)
      //   M → Moteurs seuls,  S → Savoir seul,  I → Infrastructure seule
      // Ignorés si une saisie a le focus, si un modificateur est actif ou si un
      // dialog est ouvert. On ne `return` PAS : la séquence debug (qui contient
      // un « e ») continue de s'accumuler plus bas.
      const buyKey = event.key.toLowerCase();
      const buyCategory = { e: null, m: "city", s: "knowledge", i: "infra" };
      if (Object.prototype.hasOwnProperty.call(buyCategory, buyKey) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const el = document.activeElement;
        const isTyping = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
        if (!isTyping && !document.querySelector("dialog[open]")) {
          event.preventDefault();
          buyAllAffordable(buyCategory[buyKey]);
        }
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
  const isRuinsUnlocked = cycles >= 1 || grandResetCount > 0;
  // Boutique : s'ouvre au 1er effondrement (Ruines) — ou dès qu'on détient de la
  // Faveur (gagnable aux jeux du temple dès le cycle 0), sinon elle serait
  // indépensable tant que la Boutique de Faveur y vit.
  const hasFaveur = useGameState(s => (s.faveur || 0) > 0);
  const isShopUnlocked = cycles >= 1 || grandResetCount > 0 || hasFaveur;
  // « Le Comptoir » : l'onglet Marchandage, héritage du Mythe de l'Âge d'Or.
  const isComptoirUnlocked = useGameState(s => Boolean(s.orHeritage));
  const isMythsUnlocked = grandResetCount >= 1;

  const tabs = [
    { id: 'city', label: { fr: 'Cité', en: 'City' }, icon: 'nav/cite', unlocked: true },
    { id: 'regulation', label: { fr: 'Régulation', en: 'Regulation' }, icon: 'nav/regulation', unlocked: true },
    { id: 'prestige', label: { fr: 'Effondrement', en: 'Collapse' }, icon: 'nav/effondrement', unlocked: true },
    { id: 'ruinsView', label: { fr: 'Ruines', en: 'Ruins' }, icon: 'glyphs/ruines', unlocked: isRuinsUnlocked },
    { id: 'tech', label: { fr: 'Boutique', en: 'Shop' }, icon: 'nav/boutique', unlocked: isShopUnlocked },
    { id: 'mythView', label: { fr: 'Mythes', en: 'Myths' }, icon: 'nav/mythes', unlocked: isMythsUnlocked },
    // ⚠ Icône PLACEHOLDER (res/gold) : pas de nav/marchandage.png — à générer.
    { id: 'comptoir', label: { fr: 'Marchandage', en: 'Trading' }, icon: 'res/gold', unlocked: isComptoirUnlocked },
    { id: 'history', label: { fr: 'Chronique', en: 'Chronicle' }, icon: 'nav/chronique', unlocked: true },
  ];

  const handleExport = async () => {
    const result = await exportSave();
    if (result.ok) {
      alert(tr({ fr: "Sauvegarde exportee dans le presse-papiers !", en: "Save exported to clipboard!" }));
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
      data-contemplation={contemplation && activeView === 'city' ? 'on' : undefined}
      style={{
        // Style universel : le chrome n'est plus teinté par l'âge — l'accent or
        // canonique de variables.css s'applique partout. L'âge ne pilote plus
        // que la carte (rendu JS) et le bandeau de transition d'ère.
        '--crisis-level': crisisLevel
      }}
    >
      {/* Sidebar de navigation */}
      <aside className="sidebar">
        <div className="brand">
          <img src={logoUrl} alt={tr({ fr: "Effondrement Idle", en: "Collapse Idle" })} className="brand-logo" />
        </div>
        
        <nav className="tabs" aria-label="Vues">
          {tabs.map(tab => tab.unlocked && (
            <button
              key={tab.id}
              className={`tab ${activeView === tab.id ? 'active' : ''} ${crisisLocked && tab.id !== 'prestige' ? 'tab-locked' : ''}`}
              disabled={crisisLocked && tab.id !== 'prestige'}
              onClick={() => !crisisLocked || tab.id === 'prestige' ? openView(tab.id) : undefined}
              title={crisisLocked && tab.id !== 'prestige' ? tr({ fr: 'Résolvez la crise en cours pour naviguer', en: 'Resolve the current crisis to navigate' }) : tr(tab.label)}
              aria-current={activeView === tab.id ? 'page' : undefined}
            >
              <PixelIcon name={tab.icon} className="tab-icon" />
              <span className="tab-label">{tr(tab.label)}</span>
            </button>
          ))}
        </nav>

        <CityStatusPanel />

        <div className="quick-actions">
          <button className="btn-tiny" onClick={() => { save(); alert(tr({ fr: "Partie sauvegardée !", en: "Game saved!" })); }} title="Sauvegarder">
            <PixelIcon name="nav/save" className="qa-icon" /><span className="qa-label">Save</span>
          </button>
          <button className="btn-tiny" onClick={handleExport} title="Exporter">
            <PixelIcon name="nav/export" className="qa-icon" /><span className="qa-label">Export</span>
          </button>
          <button className="btn-tiny" onClick={() => setIsImportOpen(true)} title="Importer">
            <PixelIcon name="nav/import" className="qa-icon" /><span className="qa-label">Import</span>
          </button>
          <button className="btn-tiny" onClick={() => setIsOptionsOpen(true)} title="Options">
            <PixelIcon name="nav/options" className="qa-icon" /><span className="qa-label">Options</span>
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

          {activeView === 'regulation' && <RegulationView />}

          {activeView === 'prestige' && <PrestigeView />}

          {activeView === 'ruinsView' && <RuinsView />}

          {activeView === 'tech' && <HeritageView />}

          {activeView === 'mythView' && <MythsView />}

          {activeView === 'comptoir' && <ComptoirView />}

          {activeView === 'history' && <ChronicleView />}
        </Suspense>
        {contemplation && activeView === 'city' && (
          <ContemplationBar onExit={() => setContemplation(false)} />
        )}
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
      <OutcomeFloatLayer />

      {eraBanner && (
        <div className={`era-banner ${eraBanner.epoch ? 'era-banner--epoch' : ''}`} role="status" aria-live="polite">
          <span className="era-banner-kicker">
            {eraBanner.epoch
              ? tr({ fr: `Une nouvelle époque s'ouvre : ${eraBanner.epoch}`, en: `A new epoch opens: ${eraBanner.epoch}` })
              : tr({ fr: 'Un nouvel âge commence', en: 'A new age begins' })}
          </span>
          <strong className="era-banner-name">{eraBanner.name}</strong>
        </div>
      )}
    </div>
  );
}


