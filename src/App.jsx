import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Topbar from './components/ui/Topbar.jsx';
import CityStatusPanel from './components/ui/CityStatusPanel.jsx';
import PixelIcon from './components/ui/PixelIcon.jsx';
import ChoiceDialog from './components/dialogs/ChoiceDialog.jsx';
import OutcomeFloatLayer from './components/ui/OutcomeFloatLayer.jsx';
import { HelpBubbleLayer, tipProps } from './components/ui/HelpBubble.jsx';
import ContemplationBar from './components/ui/ContemplationBar.jsx';
import { startGameLoop, initAudio, exportSave } from './game/core/main.js';
import { useGameState } from './hooks/useGameState.js';
import { openView, save, getLastSaveError } from './game/core/state.js';
import { pushOutcomeFloat } from './game/core/outcomeFloat.js';
import { resolveShortcut, resolveViewDigit } from './game/core/shortcuts.js';
import { tabBadgeSignature, parseTabBadges } from './game/core/mechanics/tabBadges.js';
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
  // Vues débloquées + verrou de crise, relus par le gestionnaire clavier. Il est
  // enregistré une seule fois (deps []) : sans ce relais il capturerait les
  // valeurs du premier rendu et les touches 1-8 viseraient des onglets périmés.
  const navRef = useRef({ tabs: [], crisisLocked: false });

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  // MODE CONTEMPLATION : toute l'interface s'efface, il ne reste que la ville.
  // Purement présentationnel — le rendu et la simulation continuent à l'identique,
  // c'est ce qui rend ce mode bon marché.
  const [contemplation, setContemplation] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  // Texte d'export à copier à la main quand le presse-papiers a échoué. null =
  // pas de repli en cours (une chaîne vide reste un état valide à afficher).
  const [exportFallback, setExportFallback] = useState(null);
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
    // Catégorie d'achat de masse par identifiant de raccourci. La TOUCHE, elle,
    // vit dans la table (shortcuts.js) et peut être changée par le joueur.
    const BUY_BY_ID = { buy_all: null, buy_city: "city", buy_knowledge: "knowledge", buy_infra: "infra" };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        const hasOpenDialog = Boolean(document.querySelector("dialog[open]"));
        if (hasOpenDialog) return;
        event.preventDefault();
        // Échap sert d'ABORD à quitter la contemplation : ouvrir les Options
        // depuis un écran sans interface serait le pire des enchaînements.
        // Cette touche n'est PAS réattribuable (cf. FORBIDDEN_KEYS) : elle est
        // le seul chemin de secours vers les Options.
        setContemplation((on) => {
          if (on) return false;
          setIsOptionsOpen(true);
          return false;
        });
        return;
      }

      // Touches 1 à 8 : les vues DÉBLOQUÉES, dans l'ordre de la barre latérale.
      // Même verrou de crise terminale que les onglets, sinon le raccourci
      // contournerait ce que la barre latérale interdit.
      const digit = resolveViewDigit(event);
      if (digit >= 0) {
        const { tabs: navTabs, crisisLocked: locked } = navRef.current;
        const target = navTabs.filter((t) => t.unlocked)[digit];
        if (target && (!locked || target.id === "prestige")) {
          event.preventDefault();
          openView(target.id);
        }
        return;
      }

      const hit = resolveShortcut(event);
      if (hit) {
        event.preventDefault();
        if (hit.id === "contemplation") setContemplation((on) => !on);
        else if (hit.id in BUY_BY_ID) buyAllAffordable(BUY_BY_ID[hit.id]);
        // PAS de `return` : la séquence secrète « debug » contient un « e », qui
        // est aussi un raccourci d'achat. Elle doit continuer d'accumuler.
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

  // PASTILLES D'ATTENTION (B10). Abonnement OBLIGATOIRE et non une optimisation :
  // tous les autres sélecteurs de ce composant rendent des valeurs quasi
  // constantes (vue active, cycles, drapeaux), donc la sidebar ne se re-rend
  // presque jamais. Une pastille « évaluée au rendu » resterait figée jusqu'à ce
  // que le joueur change d'onglet — exactement le problème que B10 doit régler.
  const badgeSig = useGameState(() => tabBadgeSignature());
  const badges = useMemo(() => parseTabBadges(badgeSig), [badgeSig]);

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

  // Sauvegarde manuelle : un toast, jamais une fenêtre système. L'échec ne passe
  // PAS par ce bus (il s'effacerait au bout de 2,4 s) mais reste affiché dans la
  // pastille de l'encart d'état tant qu'il est vrai.
  const handleSave = () => {
    save();
    if (getLastSaveError()) return;
    pushOutcomeFloat({ label: tr({ fr: "Partie sauvegardée", en: "Game saved" }), kind: "gain" });
  };

  // Plus aucune fenêtre système : le succès passe par un toast, et l'échec du
  // presse-papiers rouvre le dialogue d'import EN LECTURE SEULE, où le texte est
  // sélectionnable. Un `prompt()` natif volait le focus et tronquait la chaîne.
  // Le ref se met à jour APRÈS le rendu : l'écrire pendant serait un accès à un
  // ref en phase de rendu, que la règle react-hooks/refs interdit.
  useEffect(() => {
    navRef.current = { tabs, crisisLocked };
  });

  const handleExport = async () => {
    const result = await exportSave();
    if (result.ok) {
      pushOutcomeFloat({ label: tr({ fr: "Sauvegarde copiée", en: "Save copied" }), kind: "gain" });
    } else {
      setExportFallback(result.text || "");
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
          {/* AUCUNE BULLE SUR LES ONGLETS EN ÉTAT NORMAL (B1). L'ancien `title`
              répétait simplement le nom de l'onglet, déjà écrit juste en
              dessous dans .tab-label : le migrer aurait ouvert une bulle sombre
              sous chaque onglet survolé pour n'y rien apprendre. Seul le
              message de crise reste, et il reste NATIF puisque le bouton est
              alors désactivé, état où la bulle ne peut pas s'ouvrir. */}
          {tabs.map(tab => tab.unlocked && (
            <button
              key={tab.id}
              className={`tab ${activeView === tab.id ? 'active' : ''} ${crisisLocked && tab.id !== 'prestige' ? 'tab-locked' : ''}`}
              disabled={crisisLocked && tab.id !== 'prestige'}
              onClick={() => !crisisLocked || tab.id === 'prestige' ? openView(tab.id) : undefined}
              title={crisisLocked && tab.id !== 'prestige' ? tr({ fr: 'Résolvez la crise en cours pour naviguer', en: 'Resolve the current crisis to navigate' }) : undefined}
              aria-current={activeView === tab.id ? 'page' : undefined}
            >
              <PixelIcon name={tab.icon} className="tab-icon" />
              <span className="tab-label">{tr(tab.label)}</span>
              {/* Pastille EN FLUX (B10) et non en position absolue débordante :
                  `.tab` porte un clip-path (coins crantés de la DA) qui découpe
                  tous ses descendants, y compris en position fixe — une pastille
                  débordante serait rognée. Et sous 980 px les onglets passent en
                  grille multi-colonnes, où elle mordrait la rangée du dessus.
                  En flux, `.tab` étant déjà un flex, les deux problèmes tombent. */}
              {badges[tab.id] > 0 && (
                <span
                  className="tab-badge"
                  {...tipProps(null, tr({
                    fr: `${badges[tab.id]} chose${badges[tab.id] > 1 ? 's' : ''} à réclamer, sans rien dépenser`,
                    en: `${badges[tab.id]} thing${badges[tab.id] > 1 ? 's' : ''} to claim, at no cost`
                  }))}
                >
                  {badges[tab.id] > 9 ? '9+' : badges[tab.id]}
                </span>
              )}
            </button>
          ))}
        </nav>

        <CityStatusPanel />

        <div className="quick-actions">
          <button className="btn-tiny" onClick={handleSave} {...tipProps(null, "Sauvegarder")}>
            <PixelIcon name="nav/save" className="qa-icon" /><span className="qa-label">Save</span>
          </button>
          <button className="btn-tiny" onClick={handleExport} {...tipProps(null, "Exporter")}>
            <PixelIcon name="nav/export" className="qa-icon" /><span className="qa-label">Export</span>
          </button>
          <button className="btn-tiny" onClick={() => setIsImportOpen(true)} {...tipProps(null, "Importer")}>
            <PixelIcon name="nav/import" className="qa-icon" /><span className="qa-label">Import</span>
          </button>
          <button className="btn-tiny" onClick={() => setIsOptionsOpen(true)} {...tipProps(null, "Options")}>
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
        {/* Repli d'export : le presse-papiers a échoué, on montre le texte à
            copier dans le MÊME dialogue, en lecture seule. */}
        {exportFallback !== null && (
          <ImportDialog isOpen readOnlyText={exportFallback} onClose={() => setExportFallback(null)} />
        )}
        {isDebugOpen && <DebugDialog isOpen={isDebugOpen} onClose={() => setIsDebugOpen(false)} />}
      </Suspense>
      <ChoiceDialog
        dialog={choiceDialog}
        onChoose={handleChoice}
      />
      <OutcomeFloatLayer />
      {/* Infobulle unique du jeu (B1). Montée ICI et nulle part ailleurs : la
          couche pilote un singleton de module, et elle doit survivre au
          changement de vue comme à l'ouverture d'une modale. Elle se rend
          elle-même par un portail, sa position dans l'arbre n'importe pas. */}
      <HelpBubbleLayer />

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


