import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Topbar from './components/ui/Topbar.jsx';
import CityStatusPanel from './components/ui/CityStatusPanel.jsx';
import PixelIcon, { RAIL_ICON_COMPACT } from './components/ui/PixelIcon.jsx';
import ChoiceDialog from './components/dialogs/ChoiceDialog.jsx';
import ViewErrorBoundary from './components/ui/ViewErrorBoundary.jsx';
import OutcomeFloatLayer from './components/ui/OutcomeFloatLayer.jsx';
import { HelpBubbleLayer, tipProps } from './components/ui/HelpBubble.jsx';
import ContemplationBar from './components/ui/ContemplationBar.jsx';
// Le PLAN de la carte (layout.js), chargé dès le démarrage pour son effet : il
// branche le relevé des vestiges auprès du cœur (cityMapBridge), dont chaque
// chute a besoin — même si la vue Cité ne s'est jamais montée (Édit sur un autre
// onglet, rattrapage hors ligne au lancement). Il arrivait jusqu'ici par
// ContemplationBar, avec tout le moteur de rendu (sprites, peintre, ~1 Mo) ;
// celui-là suit désormais le chunk paresseux de CityView (audit 2026-10-05, PERF-67).
import './game/map/layout.js';
import MoreSheet from './components/ui/MoreSheet.jsx';
import { startGameLoop, initAudio, exportSave } from './game/core/main.js';
import { useGameState } from './hooks/useGameState.js';
import { usePointerCoarse } from './hooks/usePointerCoarse.js';
import { state, renderCache, openView, save, getLastSaveError, collapseUnderway } from './game/core/state.js';
import { uiRevealed, uiRevealFresh } from './game/core/uiReveal.js';
import { placeUnlocked } from './game/core/places.js';
import { pushOutcomeFloat } from './game/core/outcomeFloat.js';
import { resolveShortcut, resolveViewDigit, feedDebugSequence } from './game/core/shortcuts.js';
import { tabBadgeSignature, parseTabBadges } from './game/core/mechanics/tabBadges.js';
import { buyAllAffordableChained } from './game/core/actions.js';
import { registerChoiceDialog } from './game/core/choiceDialog.js';
import { currentEraIndex } from './game/core/mechanics.js';
import { eras } from './game/data/world.js';
import { getEraTheme } from './game/data/eraThemes.js';
import { armerMoments, sonNouvelAge, suivreBande } from './game/audio/moments/moments.js';
import { RAGNAROK_FINAL_TITLE_TEXT } from './game/data/myths.js';
import { tr, getLang, applyDocumentLang } from './game/core/i18n.js';
import { applyMotionAttribute } from './game/map/ambianceMode.js';
import { applyDensityAttribute, applyContrastAttribute } from './game/core/uiPrefs.js';
import logoFr from './assets/LOGO.png';
import logoEn from './assets/LOGO_collapse.png';

// Logo selon la langue (figée par session — la page est rechargée au changement
// dans OptionsDialog, donc un simple choix au rendu suffit).
const logoUrl = getLang() === 'en' ? logoEn : logoFr;

// PRÉCHARGEMENT AU SURVOL (E7). Les vues sont découpées en morceaux chargés à
// la demande : le premier passage sur un onglet paie donc un aller-retour
// réseau, et l'écran reste vide le temps du Suspense. Survoler suffit à lancer
// le chargement, ce qui couvre largement le temps qu'on met à cliquer.
//
// La table des chargeurs est indexée par identifiant d'onglet, et c'est ELLE
// que `lazy` consomme : un second `import()` écrit à part créerait une seconde
// entrée dans le graphe, donc un second morceau, et ne préchargerait rien.
// `import()` est idempotent — le module reste en cache, survoler dix fois ne
// déclenche qu'un chargement.
const VIEW_LOADERS = {
  city: () => import('./components/views/CityView.jsx'),
  regulation: () => import('./components/views/RegulationView.jsx'),
  prestige: () => import('./components/views/PrestigeView.jsx'),
  ruinsView: () => import('./components/views/RuinsView.jsx'),
  tech: () => import('./components/views/HeritageView.jsx'),
  mythView: () => import('./components/views/MythsView.jsx'),
  history: () => import('./components/views/ChronicleView.jsx'),
  comptoir: () => import('./components/views/ComptoirView.jsx'),
  plaisirs: () => import('./components/views/PlaisirsView.jsx')
};

// Un échec de préchargement ne doit RIEN casser : le clic refera l'import et
// Suspense reprendra la main normalement. Sans ce catch, une coupure réseau
// pendant un simple survol lèverait un rejet non traité.
const preloadView = (id) => { VIEW_LOADERS[id]?.().catch(() => {}); };

// FILET DE SÉCURITÉ pour les fenêtres montées conditionnellement. Une <dialog>
// peut être fermée par le NAVIGATEUR (Échap, close() natif) sans que React
// l'apprenne : l'état reste alors à `true`, le composant reste monté avec sa
// fenêtre fermée — donc invisible — et un nouveau clic ne change plus rien
// (même valeur d'état → aucun rendu → jamais rouverte). Le bouton paraît mort
// jusqu'au rechargement de la page. En repassant par `false`, on garantit un
// démontage puis un remontage propre, quoi qu'il soit arrivé à l'élément.
const reopenDialog = (setOpen) => { setOpen(false); setTimeout(() => setOpen(true), 0); };

const CityView = lazy(VIEW_LOADERS.city);
const RegulationView = lazy(VIEW_LOADERS.regulation);
const PlaisirsView = lazy(VIEW_LOADERS.plaisirs);
const PrestigeView = lazy(VIEW_LOADERS.prestige);
const RuinsView = lazy(VIEW_LOADERS.ruinsView);
const HeritageView = lazy(VIEW_LOADERS.tech);
const MythsView = lazy(VIEW_LOADERS.mythView);
const ChronicleView = lazy(VIEW_LOADERS.history);
const ComptoirView = lazy(VIEW_LOADERS.comptoir);
const OptionsDialog = lazy(() => import('./components/dialogs/OptionsDialog.jsx'));
const ImportDialog = lazy(() => import('./components/dialogs/ImportDialog.jsx'));
// Menu de triche : en dev SEULEMENT. En production, `null` — Vite ne garde ni
// le morceau de la fenêtre ni ses outils (debugTools.js), audit 2026-10-05 DEV-1.
const DebugDialog = import.meta.env.DEV ? lazy(() => import('./components/dialogs/DebugDialog.jsx')) : null;

export default function App() {
  const activeView = useGameState(s => s.activeView);
  const mourning = useGameState(s => s.mourning);
  // La chute se joue sur la carte (docs/PLAN-CHUTE.md) : la Cité est montée quel que
  // soit l'onglet, et son interface se retire le temps de la séquence.
  const chute = useGameState(s => s.chute);
  // Toute la chute, du déclenchement au lever (collapseUnderway) : aucune vue ne
  // s'ouvre, rien ne s'importe ni ne se charge par-dessus la séquence.
  const chuteEnCours = useGameState(() => collapseUnderway());
  // Niveau de crise continu (0→1), au pas de 5% pour limiter les re-renders.
  // Pilote la vignette progressive et la teinte de la carte via --crisis-level.
  // Arrondi INFÉRIEUR : les paliers tombent pile sur ceux de la jauge (vignette à
  // 50 %, battement à 90 %) — l'arrondi au plus proche les avançait de 2,5 points.
  const crisisLevel = useGameState(s => {
    const lvl = Math.max(s.instability || 0, s.timeWear || 0);
    return Math.min(1, Math.floor(lvl * 20 + 1e-9) / 20);
  });
  const isCrisisExtreme = crisisLevel >= 0.9;
  const crisisLocked = useGameState(s => !!s.crisisLimitAnnounced);
  const finalChronicleTitle = useGameState(s => s.finalChronicleTitle);
  const choiceResolverRef = useRef(null);
  // Vues débloquées + verrou de crise, relus par le gestionnaire clavier. Il est
  // enregistré une seule fois (deps []) : sans ce relais il capturerait les
  // valeurs du premier rendu et les touches 1-8 viseraient des onglets périmés.
  const navRef = useRef({ tabs: [], crisisLocked: false, chuteEnCours: false });
  const mainRef = useRef(null);
  // Le tout premier rendu n'est pas un CHANGEMENT de vue : y déplacer le focus
  // le volerait au chargement, alors que le joueur n'a rien demandé.
  const premierRenduRef = useRef(true);

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  // MODE CONTEMPLATION : toute l'interface s'efface, il ne reste que la ville.
  // Purement présentationnel — le rendu et la simulation continuent à l'identique,
  // c'est ce qui rend ce mode bon marché.
  const [contemplation, setContemplation] = useState(false);
  // Relue par le gestionnaire clavier (enregistré une fois) : Échap décide
  // HORS de l'updater de setContemplation, que React peut rejouer — ouvrir les
  // Options depuis l'updater était un effet de bord (audit 2026-10-05, BUG-104).
  const contemplationRef = useRef(false);
  useEffect(() => { contemplationRef.current = contemplation; }, [contemplation]);
  // Feuille d'état, régime tactile uniquement (cf. data-status-sheet plus bas).
  const [statusSheet, setStatusSheet] = useState(false);
  // Feuille « Plus » de la barre basse (tactile). Cf. PRIMAIRES_TACTILE.
  const [moreSheet, setMoreSheet] = useState(false);
  // Identité stable : useSheetSwipeClose garde aussi onClose dans un ref, mais
  // une lambda neuve à chaque rendu n'a aucune raison d'être (BUG-112).
  const closeMoreSheet = useCallback(() => setMoreSheet(false), []);
  const coarse = usePointerCoarse();
  const [isImportOpen, setIsImportOpen] = useState(false);
  // Texte d'export à copier à la main quand le presse-papiers a échoué. null =
  // pas de repli en cours (une chaîne vide reste un état valide à afficher).
  const [exportFallback, setExportFallback] = useState(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [choiceDialog, setChoiceDialog] = useState(null);
  // Une clé par DEMANDE de choix (BUG-3) : chaque fenêtre monte un <dialog> neuf.
  // Sans elle, React passait directement de la fenêtre A à la B sur le MÊME
  // élément, et l'évènement « close » mis en file par la fermeture de A validait
  // B aussitôt (stèle → « Choisir les Ruines actives » refermée à vide).
  const [choiceKey, setChoiceKey] = useState(0);
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
    // Les grands moments préparent les sons de la matière de l'âge (audio/moments).
    suivreBande(getEraTheme(eraIdx).band);
    if (prev !== null && eraIdx > prev) {
      const theme = getEraTheme(eraIdx);
      const isEpochShift = getEraTheme(prev).band !== theme.band;
      // Une frappe discrète, plus ample à une nouvelle époque ; jamais pour un âge
      // franchi pendant une absence rejouée (décision de Raph du 2026-10-08).
      sonNouvelAge({ bande: theme.band, epoque: isEpochShift });
      setEraBanner({
        name: eras[eraIdx]?.name || "",
        epoch: isEpochShift ? theme.epochLabel : null
      });
      const t = setTimeout(() => setEraBanner(null), isEpochShift ? 4800 : 3200);
      return () => clearTimeout(t);
    }
  }, [eraIdx]);

  // FOCUS AU CHANGEMENT DE VUE (E8). Sans ça, changer d'onglet au clavier
  // laissait le focus sur le bouton d'onglet : la tabulation suivante repartait
  // dans la barre latérale, et on ne pouvait atteindre le contenu qu'en
  // traversant tous les onglets restants.
  //
  // ⚠ preventScroll est OBLIGATOIRE : sans lui, focaliser un conteneur en
  // hauteur pleine fait sauter la page en haut à chaque changement d'onglet,
  // ce qui serait une régression bien plus visible que le problème corrigé.
  useEffect(() => {
    if (premierRenduRef.current) {
      premierRenduRef.current = false;
      return;
    }
    try {
      mainRef.current?.focus({ preventScroll: true });
    } catch {
      mainRef.current?.focus();
    }
  }, [activeView]);

  // ⚠ ORDRE VERROUILLÉ : l'interface de choix s'enregistre AVANT l'effet qui lance
  // startGameLoop, juste en dessous — React exécute les effets dans l'ordre où ils
  // sont déclarés. Le démarrage rouvre un choix de Ruines actives interrompu
  // (resumeActiveRuinsChoiceIfPending) : déclaré après, ce choix partait sans
  // interface, validé vide d'office — pacte d'Antée perdu en silence à chaque
  // rechargement (audit 2026-10-05, BUG-4). choiceDialog.js garde aussi en file
  // une demande arrivée trop tôt (expectChoiceDialog, main.jsx), en second filet.
  useEffect(() => registerChoiceDialog((dialog) => new Promise((resolve) => {
    choiceResolverRef.current = resolve;
    setChoiceKey((key) => key + 1);
    setChoiceDialog(dialog);
  })), []);

  useEffect(() => {
    // Préférences d'interface (E4) : les attributs sont posés sur <html> AVANT
    // le premier rendu utile, sinon la page s'ouvre en densité normale puis
    // saute au cran choisi. Ils sont relus du localStorage à l'import du
    // module, donc rien à attendre.
    applyMotionAttribute();
    applyDensityAttribute();
    applyContrastAttribute();
    // La langue déclarée à la machine (E8) : index.html la fige à « fr ».
    applyDocumentLang();
    initAudio();
    // Les grands moments (la chute, le Grand Reset, les maisons qui sortent de terre).
    const desarmerMoments = armerMoments(getEraTheme(currentEraIndex()).band);
    const cleanup = startGameLoop();

    // Séquence « debug » tapée au clavier → menu de triche (dev seulement).
    let debugSequence = "";
    // Catégorie d'achat de masse par identifiant de raccourci. La TOUCHE, elle,
    // vit dans la table (shortcuts.js) et peut être changée par le joueur.
    const BUY_BY_ID = { buy_all: null, buy_city: "city", buy_knowledge: "knowledge", buy_infra: "infra" };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        // Pendant la chute jouée sur la carte, Échap la SAUTE (iso/isoChute.js) :
        // ouvrir les Options figerait la carte (elle ne peint pas sous un dialog
        // ouvert) et la séquence attendrait son filet de fin.
        if (state.chute) return;
        const hasOpenDialog = Boolean(document.querySelector("dialog[open]"));
        if (hasOpenDialog) return;
        event.preventDefault();
        // Échap sert d'ABORD à quitter la contemplation : ouvrir les Options
        // depuis un écran sans interface serait le pire des enchaînements.
        // Cette touche n'est PAS réattribuable (cf. FORBIDDEN_KEYS) : elle est
        // le seul chemin de secours vers les Options.
        // La contemplation ne se voit que sur la Cité : laissée armée sur un
        // autre onglet, elle n'efface rien, et Échap ouvre les Options du
        // premier coup au lieu de quitter un mode invisible.
        if (contemplationRef.current) {
          setContemplation(false);
          if (state.activeView === "city") return;
        }
        setIsOptionsOpen(true);
        return;
      }

      // Touches 1 à 8 : les vues DÉBLOQUÉES, dans l'ordre de la barre latérale.
      // Même verrou de crise terminale que les onglets, sinon le raccourci
      // contournerait ce que la barre latérale interdit — et rien pendant la chute.
      const digit = resolveViewDigit(event);
      if (digit >= 0) {
        const { tabs: navTabs, crisisLocked: locked, chuteEnCours: enChute } = navRef.current;
        const target = navTabs.filter((t) => t.unlocked)[digit];
        if (target && !enChute && (!locked || target.id === "prestige")) {
          event.preventDefault();
          openView(target.id);
        }
        return;
      }

      const hit = resolveShortcut(event);
      if (hit) {
        event.preventDefault();
        if (hit.id === "contemplation") {
          // Seulement sur la Cité, la seule vue où elle se voit : armée
          // ailleurs, on retrouvait en revenant toute l'interface effacée.
          // Et une fois par appui : la répétition de la touche tenue la
          // faisait clignoter à ~30 Hz (BUG-104).
          if (!event.repeat && state.activeView === "city") setContemplation((on) => !on);
        } else if (hit.id in BUY_BY_ID) {
          // Un achat de masse par appui, lui aussi : touche tenue, la répétition
          // enchaînait les « Tout acheter » (jusqu'à 10 000 achats chacun) et
          // figeait l'interface (audit 2026-10-05, PERF-16). Par tranches de
          // ~16 ms d'une image à l'autre (BUG-79) : tout, mais sans gel.
          if (!event.repeat) buyAllAffordableChained(BUY_BY_ID[hit.id]);
        }
        // PAS de `return` : la séquence secrète « debug » contient un « e », qui
        // est aussi un raccourci d'achat. Elle doit continuer d'accumuler.
        // NB : les touches CAMÉRA (flèches, +/-, recentrage) sont gérées dans le
        // runtime carte (cityMapRuntime.bindCityMapInput), au plus près du zoom
        // molette et du drag, et seulement quand la carte est montée.
      }

      // En dev SEULEMENT, et jamais pendant une saisie (garde des raccourcis,
      // feedDebugSequence) : en production, cette branche disparaît du bundle.
      if (import.meta.env.DEV) {
        const fed = feedDebugSequence(debugSequence, event);
        debugSequence = fed.seq;
        if (fed.hit) setIsDebugOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cleanup();
      desarmerMoments();
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Quels lieux sont ouverts : places.js, source partagée avec les chapitres de
  // l'Aide (Options) — l'Aide ne doit pas ouvrir un chapitre que le rail cache.
  const isRuinsUnlocked = useGameState((s) => placeUnlocked(s, 'ruinsView'));
  const isShopUnlocked = useGameState((s) => placeUnlocked(s, 'tech'));
  const isComptoirUnlocked = useGameState((s) => placeUnlocked(s, 'comptoir'));
  const isMythsUnlocked = useGameState((s) => placeUnlocked(s, 'mythView'));
  // LE JEU QUI SE DÉVOILE (uiReveal.js). Pendant la TOUTE PREMIÈRE partie, la
  // Régulation et l'Effondrement arrivent avec la tension (premier quart de
  // Rupture), les Plaisirs avec leur premier jeu jouable, les boutons de
  // sauvegarde au Grand Feu (ère 1). Hors première partie ces sélecteurs valent
  // toujours vrai : rien ne change pour un joueur installé.
  const revealTension = useGameState((s) => uiRevealed(s, 'tension'));
  const revealPlaisirs = useGameState((s) => uiRevealed(s, 'plaisirs'));
  const revealMeta = useGameState((s) => uiRevealed(s, 'meta'));
  // Horloge du dernier tick, pas Date.now() : un rendu doit rester pur.
  const revealNow = renderCache.tickNow;
  const freshTab = {
    regulation: uiRevealFresh(state, 'tension', revealNow),
    prestige: uiRevealFresh(state, 'tension', revealNow),
    plaisirs: uiRevealFresh(state, 'plaisirs', revealNow)
  };

  // PASTILLES D'ATTENTION (B10). Abonnement OBLIGATOIRE et non une optimisation :
  // tous les autres sélecteurs de ce composant rendent des valeurs quasi
  // constantes (vue active, cycles, drapeaux), donc la sidebar ne se re-rend
  // presque jamais. Une pastille « évaluée au rendu » resterait figée jusqu'à ce
  // que le joueur change d'onglet — exactement le problème que B10 doit régler.
  const badgeSig = useGameState(() => tabBadgeSignature());
  const badges = useMemo(() => parseTabBadges(badgeSig), [badgeSig]);

  const tabs = [
    { id: 'city', label: { fr: 'Cité', en: 'City' }, icon: 'nav/cite', unlocked: true },
    { id: 'regulation', label: { fr: 'Régulation', en: 'Regulation' }, icon: 'nav/regulation', unlocked: revealTension },
    { id: 'plaisirs', label: { fr: 'Plaisirs', en: 'Pleasures' }, icon: 'nav/plaisirs', unlocked: revealPlaisirs },
    // `short` — LIBELLÉ DE BARRE BASSE. Il ne sert QUE là, et seulement quand le
    // nom complet ne rentre pas dans une cellule de la rangée tactile : mesuré,
    // « Effondrement » demande 93px pour 77 disponibles, et un mot rogné
    // (« Effondreme ») se lit plus mal qu'un mot court. « Chute » est le terme
    // que le jeu emploie déjà partout ailleurs (« Chute annoncée », « chute par
    // famine ») : ce n'est pas une abréviation, c'est le synonyme maison.
    // Les trois autres onglets primaires tiennent en entier, ils n'en ont pas.
    // Jamais caché pendant une crise terminale : c'est alors le SEUL onglet
    // accessible (uiReveal le dévoile de toute façon à ce moment-là).
    { id: 'prestige', label: { fr: 'Effondrement', en: 'Collapse' }, short: { fr: 'Chute', en: 'Collapse' }, icon: 'nav/effondrement', unlocked: revealTension || crisisLocked },
    { id: 'ruinsView', label: { fr: 'Ruines', en: 'Ruins' }, icon: 'glyphs/ruines', unlocked: isRuinsUnlocked },
    { id: 'tech', label: { fr: 'Boutique', en: 'Shop' }, icon: 'nav/boutique', unlocked: isShopUnlocked },
    { id: 'mythView', label: { fr: 'Mythes', en: 'Myths' }, icon: 'nav/mythes', unlocked: isMythsUnlocked },
    { id: 'comptoir', label: { fr: 'Marchandage', en: 'Trading' }, short: { fr: 'Marché', en: 'Market' }, icon: 'nav/marchandage', unlocked: isComptoirUnlocked },
    { id: 'history', label: { fr: 'Chronique', en: 'Chronicle' }, icon: 'nav/chronique', unlocked: true },
  ];

  // ---- BARRE BASSE : QUATRE ONGLETS, ET « PLUS » POUR LE RESTE (M4) ----
  // Mesuré le 2026-08-07 en clonant des onglets dans le DOM : à 384px, la rangée
  // donne 52px par onglet avec les 5 d'une partie neuve, et 27px avec les 9
  // d'une partie avancée. 27px, c'est moins des deux tiers du plancher du doigt,
  // sur la seule barre qu'on vise EN AVEUGLE au pouce — et aucun mot n'y entre.
  // Le nombre d'onglets grandit avec la partie, la largeur de l'écran non : une
  // rangée qui se partage à parts égales ne peut pas tenir les deux.
  // Arbitrage de Raph : quatre onglets fixes, le reste dans une feuille.
  // ⚠ La liste est FIXE et non « les quatre premiers débloqués » : une barre
  // dont les cases changent de place en cours de partie se réapprend à chaque
  // déblocage, ce qui est exactement ce qu'une barre de navigation doit éviter.
  const PRIMAIRES_TACTILE = ['city', 'regulation', 'prestige', 'history'];
  const ongletsDebloques = tabs.filter((t) => t.unlocked);
  const ongletsBarre = coarse
    ? ongletsDebloques.filter((t) => PRIMAIRES_TACTILE.includes(t.id))
    : ongletsDebloques;
  const ongletsRanges = coarse
    ? ongletsDebloques.filter((t) => !PRIMAIRES_TACTILE.includes(t.id))
    : [];
  // La pastille des onglets rangés remonte sur « Plus », sinon replier la
  // navigation reviendrait à éteindre l'alerte : un joueur ne va pas ouvrir un
  // menu pour vérifier s'il a quelque chose à réclamer dedans.
  const pastilleRanges = ongletsRanges.reduce((n, t) => n + (badges[t.id] || 0), 0);
  // « Plus » s'allume quand la vue courante est rangée dedans : sans ça, se
  // trouver dans les Mythes se lit comme n'être nulle part.
  const vueRangee = ongletsRanges.some((t) => t.id === activeView);

  // Nom de la vue courante, lu à la SOURCE (la table d'onglets) plutôt que
  // recopié dans une seconde table : un libellé dupliqué finit toujours par
  // diverger, et c'est le lecteur d'écran qui entendrait l'ancien nom.
  const activeViewLabel = tr(tabs.find((t) => t.id === activeView)?.label || {});

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
    navRef.current = { tabs, crisisLocked, chuteEnCours };
  });

  const handleExport = async () => {
    const result = await exportSave();
    if (result.ok) {
      pushOutcomeFloat({ label: tr({ fr: "Sauvegarde copiée", en: "Save copied" }), kind: "gain" });
    } else {
      setExportFallback(result.text || "");
    }
  };
  // Une fenêtre (Options, Import, Debug) a planté : on les referme toutes — la
  // frontière se réarme avec — et on le dit. Le joueur peut la rouvrir.
  const closeDialogsAfterError = useCallback(() => {
    setIsOptionsOpen(false);
    setIsImportOpen(false);
    setExportFallback(null);
    setIsDebugOpen(false);
    pushOutcomeFloat({ label: tr({ fr: "Cette fenêtre a rencontré un problème", en: "This window ran into a problem" }), kind: "cost" });
  }, []);

  // La fenêtre se retire AVANT de rendre la réponse (BUG-3) : la suite du code qui
  // attend ce choix peut en ouvrir une autre aussitôt, elle ne doit pas hériter
  // de celle-ci.
  const handleChoice = useCallback((choice) => {
    const resolve = choiceResolverRef.current;
    choiceResolverRef.current = null;
    setChoiceDialog(null);
    resolve?.(choice);
  }, []);

  return (
    <div
      className={`app ${mourning ? 'mourning' : ''} ${isCrisisExtreme ? 'crisis-extreme' : ''} ${chute ? 'chute' : ''}`}
      data-active-view={chute ? 'city' : activeView}
      data-contemplation={contemplation && activeView === 'city' ? 'on' : undefined}
      // Feuille d'ÉTAT (P5, tactile) : la barre basse n'a pas la place d'afficher
      // l'encart Âge/Usure/Vœu/Clepsydre, mais l'Usure est l'échéance de toute la
      // partie — la masquer sur téléphone reviendrait à jouer sans montre. Elle
      // s'ouvre donc à la demande. L'attribut est posé quel que soit le régime :
      // c'est le CSS tactile qui lui donne un sens, et le bouton qui l'actionne
      // n'existe que là (sur un écran de bureau l'encart est déjà en vue).
      data-status-sheet={statusSheet ? 'on' : undefined}
      style={{
        // Style universel : le chrome n'est plus teinté par l'âge — l'accent or
        // canonique de variables.css s'applique partout. L'âge ne pilote plus
        // que la carte (rendu JS) et le bandeau de transition d'ère.
        '--crisis-level': crisisLevel
      }}
    >
      {/* OSSATURE D'ACCESSIBILITÉ (E8). Le jeu n'avait aucun titre de niveau 1 :
          un lecteur d'écran annonçait une page sans nom, et les h2 des vues
          flottaient sous rien. Il est visuellement absent (.sr-only) parce que
          le logo tient déjà ce rôle à l'œil. */}
      <h1 className="sr-only">
        {tr({ fr: "Effondrement Idle", en: "Collapse Idle" })}
        {" — "}
        {eras[eraIdx]?.name || ""}
      </h1>
      {/* Lien d'évitement : au clavier, la première tabulation permettait
          seulement de traverser les dix onglets avant d'atteindre le jeu. */}
      <a className="skip-link" href="#vue-active">
        {tr({ fr: "Aller au contenu", en: "Skip to content" })}
      </a>
      {/* Annonce vocale du changement de vue. `role="status"` (poli) et non
          `alert` : c'est une confirmation de navigation, elle ne doit pas
          couper ce que le lecteur est en train de dire. */}
      <p className="sr-only" role="status">
        {tr({ fr: `Vue : ${activeViewLabel}`, en: `View: ${activeViewLabel}` })}
      </p>

      {/* Sidebar de navigation */}
      <aside className="sidebar">
        <div className="brand">
          <img src={logoUrl} alt={tr({ fr: "Effondrement Idle", en: "Collapse Idle" })} className="brand-logo" />
        </div>
        
        <nav className="tabs" aria-label={tr({ fr: "Vues", en: "Views" })}>
          {/* AUCUNE BULLE SUR LES ONGLETS EN ÉTAT NORMAL (B1). L'ancien `title`
              répétait simplement le nom de l'onglet, déjà écrit juste en
              dessous dans .tab-label : le migrer aurait ouvert une bulle sombre
              sous chaque onglet survolé pour n'y rien apprendre. Seul le
              message de crise reste, et il reste NATIF puisque le bouton est
              alors désactivé, état où la bulle ne peut pas s'ouvrir. */}
          {ongletsBarre.map(tab => (
            <button
              key={tab.id}
              className={`tab ${activeView === tab.id ? 'active' : ''} ${crisisLocked && tab.id !== 'prestige' ? 'tab-locked' : ''} ${freshTab[tab.id] ? 'is-fresh' : ''}`}
              disabled={crisisLocked && tab.id !== 'prestige'}
              onClick={() => !chuteEnCours && (!crisisLocked || tab.id === 'prestige') ? openView(tab.id) : undefined}
              // Préchargement au survol ET au focus (E7) : au clavier on ne
              // survole jamais, et c'est justement là que l'attente se remarque.
              onMouseEnter={() => preloadView(tab.id)}
              onFocus={() => preloadView(tab.id)}
              title={crisisLocked && tab.id !== 'prestige' ? tr({ fr: 'La cité tombe : effondrez-la pour continuer', en: 'The city is falling: collapse it to continue' }) : undefined}
              aria-current={activeView === tab.id ? 'page' : undefined}
            >
              {/* RAIL du bureau (refonte « la ville d'abord ») : l'icône en 48 px,
                  sa taille de dessin — nette, sans rééchantillonnage. Au doigt,
                  la barre basse garde sa variante 24. Neuf lieux dans une fenêtre
                  basse : la variante cuite @32 (BUG-43, rail.css). */}
              <PixelIcon
                name={tab.icon}
                className="tab-icon"
                size={coarse ? undefined : 48}
                compact={!coarse && ongletsBarre.length >= RAIL_ICON_COMPACT.minTabs ? RAIL_ICON_COMPACT : undefined}
              />
              {/* Le libellé COURT sert partout où la place est comptée : la rangée
                  du doigt et, depuis la refonte, le rail du bureau (≈ 6,75 rem). */}
              <span className="tab-label">{tr(tab.short ? tab.short : tab.label)}</span>
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
          {/* « PLUS » — la porte des onglets rangés. Elle vit DANS la rangée des
              onglets et non dans les actions rapides : c'est une destination de
              navigation, elle doit être là où le pouce cherche à naviguer.
              ⚠ Le verrou de crise la ferme aussi. Sans ça, elle serait le seul
              chemin encore ouvert vers les vues qu'une crise interdit — le
              verrou se contournerait par le menu. */}
          {/* TOUJOURS là au doigt, même sans onglet rangé : la feuille porte aussi
              les Options et l'État. Pendant le dévoilement de la première partie
              (uiReveal), il n'y a d'abord AUCUN onglet à ranger — la condition
              « au moins un onglet rangé » rendait alors les Options injoignables
              sur téléphone. */}
          {coarse && (
            <button
              className={`tab tab-more ${vueRangee ? 'active' : ''} ${crisisLocked ? 'tab-locked' : ''}`}
              disabled={crisisLocked}
              aria-expanded={moreSheet}
              onClick={() => setMoreSheet((v) => !v)}
              title={crisisLocked ? tr({ fr: 'La cité tombe : effondrez-la pour continuer', en: 'The city is falling: collapse it to continue' }) : undefined}
            >
              <i className="fa-solid fa-ellipsis tab-icon" aria-hidden="true"></i>
              <span className="tab-label">{tr({ fr: 'Plus', en: 'More' })}</span>
              {pastilleRanges > 0 && (
                <span className="tab-badge">{pastilleRanges > 9 ? '9+' : pastilleRanges}</span>
              )}
            </button>
          )}
        </nav>

        {/* LA FEUILLE « PLUS ». Elle porte les onglets rangés ET les deux
            réglages (Options, État) : « plus » veut dire tout ce qui n'est pas
            un des quatre gestes principaux, sinon ce serait deux menus.
            ⚠ C'EST ELLE QUI PAYE LES LIBELLÉS. En sortant les actions rapides de
            la rangée, on rend 83px aux onglets : ils passent de 55 à 77px, et
            « Régulation » (73px) comme « Chronique » (69px) redeviennent
            lisibles en entier. Sans ce déplacement il aurait fallu rebaptiser
            trois onglets sur quatre — et « Annales », le seul synonyme correct
            de Chronique, est déjà pris par la Chancellerie. */}
        {coarse && (
          <MoreSheet
            open={moreSheet}
            onClose={closeMoreSheet}
            tabs={ongletsRanges}
            badges={badges}
            activeView={activeView}
            onPick={(id) => { if (!chuteEnCours) openView(id); setMoreSheet(false); }}
            onPreload={preloadView}
            onOptions={() => { setMoreSheet(false); reopenDialog(setIsOptionsOpen); }}
            onStatus={() => { setMoreSheet(false); setStatusSheet((v) => !v); }}
            statusOpen={statusSheet}
          />
        )}

        {/* L'encart d'état ne vit dans la barre qu'AU DOIGT (sa feuille « État »).
            Sur bureau, le rail n'est que navigation : l'encart passe dans la
            carte d'identité de la Cité (CityView, variante « identity »). */}
        {coarse && <CityStatusPanel />}

        {/* `data-qa` : prise CSS par action. En régime tactile la rangée n'en
            garde AUCUNE : Options et État sont passés dans la feuille « Plus »
            (leur place y est plus juste, et leurs 83px rendent aux onglets la
            largeur qui leur manquait). Save, Export et Import vivent dans les
            Options, où le joueur les cherche de toute façon sur téléphone. */}
        <div className="quick-actions">
          {/* Sauver / Exporter / Importer : dévoilés au Grand Feu (ère 1) pendant la
              toute première partie (uiReveal, clé `meta`) — à la première minute
              il n'y a rien à perdre, la sauvegarde est automatique, et ces trois
              boutons étaient le quart des choses à lire. Les Options, elles,
              restent toujours là : les mêmes actions y vivent aussi. */}
          {revealMeta && (<>
          {/* Libellés et bulles dans la langue du joueur (audit du 05/10, I18N-11) :
              les bulles étaient en français et les libellés en anglais, partout. */}
          <button className="btn-tiny" data-qa="save" onClick={handleSave} {...tipProps(null, tr({ fr: "Sauvegarder", en: "Save" }))}>
            <PixelIcon name="nav/save" className="qa-icon" /><span className="qa-label">{tr({ fr: "Sauver", en: "Save" })}</span>
          </button>
          <button className="btn-tiny" data-qa="export" onClick={handleExport} {...tipProps(null, tr({ fr: "Exporter", en: "Export" }))}>
            <PixelIcon name="nav/export" className="qa-icon" /><span className="qa-label">{tr({ fr: "Exporter", en: "Export" })}</span>
          </button>
          <button className="btn-tiny" data-qa="import" disabled={chuteEnCours} onClick={() => reopenDialog(setIsImportOpen)} {...tipProps(null, tr({ fr: "Importer", en: "Import" }))}>
            <PixelIcon name="nav/import" className="qa-icon" /><span className="qa-label">{tr({ fr: "Importer", en: "Import" })}</span>
          </button>
          </>)}
          <button className="btn-tiny" data-qa="options" onClick={() => reopenDialog(setIsOptionsOpen)} {...tipProps(null, "Options")}>
            <PixelIcon name="nav/options" className="qa-icon" /><span className="qa-label">Options</span>
          </button>
          {/* Bouton d'ouverture de la feuille d'état. Rendu TOUJOURS, masqué par
              le CSS hors régime tactile : sur un écran de bureau l'encart est
              déjà affiché en permanence dans la barre latérale, un bouton pour
              le montrer n'y voudrait rien dire. */}
          <button
            className="btn-tiny qa-status"
            aria-expanded={statusSheet}
            onClick={() => setStatusSheet((v) => !v)}
            {...tipProps(null, tr({ fr: "État de la civilisation", en: "Civilization status" }))}
          >
            <i className="fa-solid fa-gauge-high qa-icon" aria-hidden="true"></i>
            <span className="qa-label">{tr({ fr: "État", en: "Status" })}</span>
          </button>
        </div>
      </aside>

      {/* `id` = cible du lien d'évitement. `tabIndex -1` rend le conteneur
          focalisable par programme SANS l'insérer dans l'ordre de tabulation :
          une tabulation ne s'y arrête pas, mais on peut y renvoyer le focus au
          changement de vue, ce qui fait repartir la navigation clavier du
          contenu au lieu du logo. */}
      <main id="vue-active" tabIndex={-1} aria-label={activeViewLabel} ref={mainRef}>
        {/* Le titre stocké n'est qu'un drapeau (posé par l'héritage Ragnarok, en
            français) : le texte affiché suit la langue du moment (I18N-6). */}
        {finalChronicleTitle && (
          <div className="final-chronicle-title" aria-label={tr({ fr: "Titre final de la Chronique", en: "Final title of the Chronicle" })}>
            {tr(RAGNAROK_FINAL_TITLE_TEXT)}
          </div>
        )}



        {/* Topbar reelle */}
        <Topbar />

        {/* Vue Active — sous une frontière d'erreur (BUG-18) : une vue qui plante
            affiche un repli au lieu d'emporter App, la boucle de jeu et l'autosave.
            Elle se réarme au changement d'onglet ; pendant la chute la Cité reste
            la vue montée, d'où la clé « city ». */}
        <ViewErrorBoundary resetKey={chute ? 'city' : activeView} onHome={() => openView('city')}>
        <Suspense fallback={null}>
          {(activeView === 'city' || chute) && <CityView />}

          {/* Pendant la chute, la Cité SEULE : une vue ouverte par un autre chemin
              (toast, clic sur la carte) attend la fin de la séquence pour se monter. */}
          {activeView === 'regulation' && !chute && <RegulationView />}
          {activeView === 'plaisirs' && !chute && <PlaisirsView />}

          {activeView === 'prestige' && !chute && <PrestigeView />}

          {activeView === 'ruinsView' && !chute && <RuinsView />}

          {activeView === 'tech' && !chute && <HeritageView />}

          {activeView === 'mythView' && !chute && <MythsView />}

          {activeView === 'comptoir' && !chute && <ComptoirView />}

          {activeView === 'history' && !chute && <ChronicleView />}
        </Suspense>
        </ViewErrorBoundary>
        {contemplation && activeView === 'city' && (
          <ContemplationBar onExit={() => setContemplation(false)} />
        )}
      </main>

      {/* Modals Option / Import / Debug — même frontière, repli MUET : une fenêtre
          qui plante est refermée et le dit par un toast (BUG-18). */}
      <ViewErrorBoundary
        resetKey={`${isOptionsOpen}|${isImportOpen}|${exportFallback !== null}|${isDebugOpen}`}
        onError={closeDialogsAfterError}
      >
      <Suspense fallback={null}>
        {/* Les trois gestes de sauvegarde sont PASSÉS aux Options : sur
            téléphone la barre basse ne garde que l'icône Options, et c'est là
            qu'on doit les retrouver. Ils restent aussi dans la barre latérale du
            bureau — même fonction, deux portes, aucune duplication de logique. */}
        {isOptionsOpen && (
          <OptionsDialog
            isOpen={isOptionsOpen}
            onClose={() => setIsOptionsOpen(false)}
            onSave={handleSave}
            onExport={handleExport}
            onImport={() => { setIsOptionsOpen(false); reopenDialog(setIsImportOpen); }}
          />
        )}
        {isImportOpen && <ImportDialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />}
        {/* Repli d'export : le presse-papiers a échoué, on montre le texte à
            copier dans le MÊME dialogue, en lecture seule. */}
        {exportFallback !== null && (
          <ImportDialog isOpen readOnlyText={exportFallback} onClose={() => setExportFallback(null)} />
        )}
        {DebugDialog && isDebugOpen && <DebugDialog isOpen={isDebugOpen} onClose={() => setIsDebugOpen(false)} />}
      </Suspense>
      </ViewErrorBoundary>
      <ChoiceDialog
        key={choiceKey}
        dialog={choiceDialog}
        onChoose={handleChoice}
      />
      <OutcomeFloatLayer />
      {/* Infobulle unique du jeu (B1). Montée ICI et nulle part ailleurs : la
          couche pilote un singleton de module, et elle doit survivre au
          changement de vue comme à l'ouverture d'une modale. Elle se rend
          elle-même par un portail, sa position dans l'arbre n'importe pas. */}
      <HelpBubbleLayer />

      {/* Annonce vocale du changement d'ère dans une région sr-only PÉRENNE
          (motif RuinsTreePixel) : un bandeau inséré déjà rempli n'est jamais
          annoncé — les lecteurs d'écran ne lisent que les MUTATIONS d'une
          région aria-live déjà montée. Le bandeau visuel reste conditionnel,
          masqué à la synthèse pour ne pas doubler l'annonce. */}
      <div className="sr-only" role="status" aria-live="polite">
        {eraBanner
          ? `${eraBanner.epoch
              ? tr({ fr: `Une nouvelle époque s'ouvre : ${eraBanner.epoch}`, en: `A new epoch opens: ${eraBanner.epoch}` })
              : tr({ fr: 'Un nouvel âge commence', en: 'A new age begins' })} — ${eraBanner.name}`
          : ''}
      </div>
      {eraBanner && (
        <div className={`era-banner ${eraBanner.epoch ? 'era-banner--epoch' : ''}`} aria-hidden="true">
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


