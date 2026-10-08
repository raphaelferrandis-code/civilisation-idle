import { useState, useEffect, useRef } from 'react';
import PixelIcon from '../ui/PixelIcon.jsx';
import OdometerNumber from '../ui/OdometerNumber.jsx';
import { useGameState } from '../../hooks/useGameState.js';
import {
  ruinGain,
  ruinGainFactors,
  ruinGainWithPrep,
  boostedPrep,
  crisisOpen,
  terminalCrisisCost,
  terminalCrisisReady,
  terminalRiteSealed,
  TERMINAL_PREP_TIERS,
  TERMINAL_EDICT_CAUSE,
  TERMINAL_RITE_RESOURCE,
  has,
  autoCollapseDelay,
  ruptureTarget
} from '../../game/core/mechanics.js';
import { collapseCause } from '../../game/core/events.js';
import { projectedCollapseHarvest } from '../../game/core/mechanics/collapseHarvest.js';
import {
  collapse,
  runTerminalCrisisAction,
} from '../../game/core/actions.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { FAVORED_CAUSE_LABELS } from '../../game/data/epitaphs.js';
import { costLabel, pct } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import CrisisDoctrinePanel from '../ui/CrisisDoctrinePanel.jsx';
import GrandResetLadder from '../ui/GrandResetLadder.jsx';
import TestamentSeals from '../ui/TestamentSeals.jsx';
import Place, { PlaceKey } from '../ui/Place.jsx';
import { tipProps } from '../ui/HelpBubble.jsx';
import { isFirstGame } from '../../game/core/onboarding.js';
import { annoncer } from '../../game/audio/moments/annonces.js';

const RITE_RESOURCE_LABEL = {
  food: { fr: "Nourriture", en: "Food" },
  knowledge: { fr: "Savoir", en: "Knowledge" },
  gold: { fr: "Trésor", en: "Treasury" }
};

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : "");

export default function PrestigeView() {
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const crisisLimitAnnounced = useGameState(s => s.crisisLimitAnnounced);
  const crisisOpenedAt = useGameState(s => s.crisisOpenedAt);
  const firstGame = useGameState(isFirstGame);
  useGameState(s => s.activeMythId);
  const atlasCrushed = useGameState(s => s.atlasCrushed);
  // Le chiffre de l'autel compte le legs gravé et le vœu (BUG-33) : graver un
  // autre sceau, ou tenir le vœu, doit le redessiner.
  useGameState(s => s.testamentLegacyId);
  useGameState(s => s.cycleVow);
  const history = useGameState(s => s.history);
  const terminalPreparations = useGameState(s => s.terminalPreparations);
  // L'auto-effondrement « rupture100 » est la SEULE configuration où le moteur
  // applique le délai de grâce après l'annonce de crise (cf. checkAutoCollapse,
  // main.js) — les déclencheurs usure/temps n'attendent pas ce décompte.
  const autoRupture100 = useGameState(s => {
    const ac = s.crisisDoctrine?.autoCollapse;
    return Boolean(ac && ac.enabled && ac.trigger === "rupture100");
  });

  // Compte à rebours d'auto-effondrement : texte + fraction restante (intégré
  // au bouton d'effondrement — bandeau qui se consume).
  const [remaining, setRemaining] = useState(null);
  // Palier d'édit survolé : projeté en fantôme sur la grande jauge de crise ET
  // en préviz de moisson sur l'odomètre de l'autel. ({ target, prep } | null —
  // lu via `hoverTarget`, dérivé plus bas : hors crise il est toujours nul.)
  const [hoverTargetRaw, setHoverTarget] = useState(null);

  const ruinGainVal = ruinGain();
  const isCrisisActive = crisisOpen();

  useEffect(() => {
    const checkCountdown = () => {
      // « intendant_de_crise » n'existe plus (migré vers conseil_de_crise +
      // edit_effondrement, cf. state.js) : le décompte suit la même garde que
      // le moteur — Édit possédé ET doctrine « rupture100 » armée.
      const autoArmed = autoRupture100 && has("edit_effondrement");
      if (crisisLimitAnnounced && autoArmed && crisisOpenedAt) {
        const delay = autoCollapseDelay();
        const left = Math.max(0, delay - (Date.now() - crisisOpenedAt));
        const mins = Math.floor(left / 60000);
        const secs = Math.floor((left % 60000) / 1000);
        setRemaining({
          text: tr({
            fr: `Effondrement auto dans ${mins}:${secs.toString().padStart(2, "0")}`,
            en: `Auto collapse in ${mins}:${secs.toString().padStart(2, "0")}`
          }),
          frac: delay > 0 ? left / delay : 0
        });
      } else {
        setRemaining(null);
      }
    };
    checkCountdown();
    const timer = setInterval(checkCountdown, 1000);
    return () => clearInterval(timer);
  }, [crisisLimitAnnounced, crisisOpenedAt, autoRupture100]);

  // Dérivé plutôt que resetté en effet (lint set-state-in-effect) : le clic sur
  // un palier remet déjà la valeur à zéro, ceci couvre la fermeture de crise.
  const hoverTarget = isCrisisActive ? hoverTargetRaw : null;

  // Icare ne confisque plus l'effondrement manuel : le « vol par paliers » rend
  // la main au joueur (refonte 2026-07-19). Seul Atlas verrouille encore, tant
  // que le ciel n'a pas écrasé la cité : le pacte rompu rend la chute (le moteur,
  // collapse(), applique la même règle).
  const mythBlocksCollapse = isMythEffectActive("mythe_d_atlas") && !atlasCrushed;
  const canCollapse = ruinGainVal.gt(0) && !mythBlocksCollapse;


  // ── Hold-to-collapse : l'effondrement se MAINTIENT (~1,1 s), pas de clic sec.
  // Tout vit dans des refs (aucun re-render pendant le hold : le remplissage
  // est piloté au rAF sur le style du span). Clavier : tenir Entrée/Espace.
  const HOLD_MS = 1100;
  const holdRafRef = useRef(0);
  const holdStartRef = useRef(0);
  const holdFillRef = useRef(null);
  const holdBtnRef = useRef(null);

  const cancelHold = () => {
    // Le grondement de la main qui tient se tait (ou passe à la chute, audio/moments).
    if (holdStartRef.current) annoncer('chute:lacher');
    if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    holdRafRef.current = 0;
    holdStartRef.current = 0;
    if (holdFillRef.current) holdFillRef.current.style.width = "0%";
    if (holdBtnRef.current) holdBtnRef.current.classList.remove("is-holding");
  };

  const startHold = () => {
    if (!canCollapse || holdStartRef.current) return;
    holdStartRef.current = performance.now();
    if (holdBtnRef.current) holdBtnRef.current.classList.add("is-holding");
    annoncer('chute:tenir');
    const step = () => {
      if (!holdStartRef.current) return;
      const p = Math.min(1, (performance.now() - holdStartRef.current) / HOLD_MS);
      if (holdFillRef.current) holdFillRef.current.style.width = `${p * 100}%`;
      if (p >= 1) {
        cancelHold();
        collapse("manual");
        return;
      }
      holdRafRef.current = requestAnimationFrame(step);
    };
    holdRafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    return () => {
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    };
  }, []);

  const tp = terminalPreparations || {};

  // 3 actions × 3 paliers : coût flat + malus % jusqu'à l'effondrement.
  const tierNames = [
    tr({ fr: "Mesuré", en: "Measured" }),
    tr({ fr: "Drastique", en: "Drastic" }),
    tr({ fr: "Total", en: "Total" })
  ];
  const prepDefs = [
    {
      type: "exodus",
      iconName: "prep/exode",
      title: tr({ fr: "Organiser l'exode", en: "Organize the exodus" }),
      desc: tr({
        fr: "Les familles partent avec les réserves de grain : la cité tombera par la famine, ses enfants vivront ailleurs. Se paie en Nourriture.",
        en: "Families leave with the grain stores: the city will fall by famine, its children will live elsewhere. Paid in Food."
      })
    },
    {
      type: "prepareArchives",
      iconName: "prep/archives",
      title: tr({ fr: "Préparer les archives", en: "Prepare the archives" }),
      desc: tr({
        fr: "Les scribes gravent tout le savoir de la cité : elle s'éteindra par l'usure du temps, et rien ne sera oublié. Se paie en Savoir.",
        en: "The scribes engrave all the city's knowledge: it will fade by the wear of time, and nothing will be forgotten. Paid in Knowledge."
      })
    },
    {
      type: "holdOrder",
      iconName: "prep/ordre",
      title: tr({ fr: "Maintenir l'ordre", en: "Maintain order" }),
      desc: tr({
        fr: "La garde tient les rues jusqu'au bout : la cité tombera sous la Rupture, mais en rangs serrés. Se paie en Trésor.",
        en: "The guard holds the streets to the end: the city will fall to Rupture, but in close ranks. Paid in Treasury."
      })
    }
  ];

  // ── Mode crise : jauge héros PLEINE à 100 % (échelle simple — l'échelle
  // étendue « avec zone de pression » lisait comme une jauge pas remplie),
  // crans aux cibles des édits, fantôme de prévisualisation au survol. ──
  const wearCrisis = isCrisisActive && (timeWear || 0) >= 1 && instability < 1;
  const factors = ruinGainFactors();
  const journal = (history || []).slice(-5);
  // Moisson COMPLÈTE (décision de Raph sur BUG-33 : A) : Rite × legs gravé, ou
  // dernière volonté, × vœu — le chiffre que la chute versera, et non plus le
  // gain brut. Préviz : au survol d'un palier, l'odomètre roule vers le total
  // qu'apporterait ce rite (et revient au départ du survol). Le rite DÉCLARE sa
  // cause, donc l'affinité du legs : même ordre que collapseCause, où l'Usure
  // prime sur la cause déclarée.
  const shownGain = isCrisisActive ? projectedCollapseHarvest(ruinGainVal, collapseCause()) : null;
  const previewGain = hoverTarget
    ? projectedCollapseHarvest(
        ruinGainWithPrep(hoverTarget.prep),
        (timeWear || 0) >= 1 ? "time" : TERMINAL_EDICT_CAUSE[hoverTarget.type]
      )
    : null;

  // HORS CRISE : LA VEILLE (refonte « chaque onglet est un lieu », maquette V4).
  // Décor de la salle des sceaux, la Rupture, l'Usure et la chute annoncée en
  // chiffres clés ; puis la Doctrine de crise et les Sceaux du Grand Reset.
  // Avant la toute première chute, une plaque dit seulement que la chute n'est
  // pas ouverte (décision de Raph 2026-09-28 : le tutoriel y envoie le joueur) —
  // le pourquoi est dans sa bulle et dans l'Aide, plus en phrase à l'écran.
  if (!isCrisisActive) {
    const target = ruptureTarget();
    // PLATEAU (audit 2026-10-05, BUG-78, décision de Raph) : Rupture haute mais
    // cible sous 100 % — la bascule de la crise terminale exige une cible pleine,
    // la jauge s'arrêtera donc sous la chute. Un indicateur discret (« plafond »
    // au lieu de « cible », repère ambré sur la piste), le pourquoi en bulle.
    const plateau = target < 1 && (instability || 0) >= 0.9;
    const causeLabel = String(FAVORED_CAUSE_LABELS[collapseCause()] || '').replace(/^(chute|fall) /i, '');
    return (
      <Place
        id="prestige"
        className="veille"
        scene="/pixelart/places/salle-sceaux.png"
        sceneAlt={tr({ fr: 'La salle des sceaux : un anneau de médaillons de bronze autour du sablier', en: 'The hall of seals: a ring of bronze medallions around the hourglass' })}
        focus={[50, 27]}
        eyebrow={tr({ fr: 'Effondrement', en: 'Collapse' })}
        title={tr({ fr: 'La Veille', en: 'The Vigil' })}
        bodyClassName="veille-body"
        keys={<>
          <div
            className="place-key is-wide"
            {...tipProps(tr({ fr: 'Rupture', en: 'Rupture' }), plateau
              ? tr({ fr: `Sa cible plafonne à ${pct(target)} : la Rupture n'ira pas jusqu'à la chute. L'Usure, ou l'Édit réglé sur « Durée », y mènera.`, en: `Its target caps at ${pct(target)}: Rupture will not reach the fall. Wear, or the Edict set to “Time”, will get there.` })
              : tr({ fr: `Elle glisse vers sa cible : ${pct(target)}.`, en: `It drifts toward its target: ${pct(target)}.` }))}
          >
            <span className="place-key-head">
              <span className="place-key-label">{tr({ fr: 'Rupture', en: 'Rupture' })}</span>
              <strong className="place-key-val is-rupture">{pct(instability || 0)}</strong>
            </span>
            <span className="conseil-rupture-track" aria-hidden="true">
              <i style={{ width: `${Math.min(1, instability || 0) * 100}%` }} />
              <span className="tick" style={{ left: '25%' }} />
              <span className="tick" style={{ left: '50%' }} />
              <span className="tick" style={{ left: '75%' }} />
              <span className="tick" style={{ left: '90%' }} />
              <span className={`ghost${plateau ? ' is-plateau' : ''}`} style={{ left: `${Math.min(1, target) * 100}%` }} />
            </span>
            <span className="place-key-sub">{plateau ? tr({ fr: 'plafond', en: 'ceiling' }) : tr({ fr: 'cible', en: 'target' })} <b className={target >= 1 ? 'is-rupture' : plateau ? 'is-bad' : ''}>{pct(target)}</b></span>
          </div>
          <div className="place-key" {...tipProps(tr({ fr: 'Usure du Temps', en: 'Wear of Time' }), null)}>
            <span className="place-key-head">
              <span className="place-key-label">{tr({ fr: 'Usure', en: 'Wear' })}</span>
              <strong className="place-key-val is-usure">{pct(timeWear || 0)}</strong>
            </span>
            <span className="conseil-rupture-track is-usure" aria-hidden="true">
              <i style={{ width: `${Math.min(1, timeWear || 0) * 100}%` }} />
            </span>
          </div>
          <PlaceKey label={tr({ fr: 'Chute annoncée', en: 'Foretold fall' })} value={causeLabel} valueClassName="is-cause" />
        </>}
      >
        {firstGame && (
          <div
            className="veille-closed"
            {...tipProps(null, tr({
              fr: "Elle s'ouvre quand la Rupture, ou l'Usure, atteint 100 % : la cité entre en crise, et c'est ici que tu pourras l'effondrer.",
              en: 'It opens when Rupture, or Wear, reaches 100%: the city enters a crisis, and this is where you will be able to collapse it.'
            }))}
          >
            {tr({ fr: "La chute n'est pas encore ouverte", en: 'The fall is not open yet' })}
          </div>
        )}
        <CrisisDoctrinePanel />
        <GrandResetLadder />
      </Place>
    );
  }

  return (
    // En crise, la fresque devient le fond de TOUTE la page (retour Raph) :
    // la classe déclenche le débord pleine largeur + l'image dans le CSS.
    <section className={`view active${isCrisisActive ? " crisis-backdrop" : ""}`} id="prestige">
      {/* 1. JAUGE HÉROS (crise uniquement) : la jauge fautive pleine largeur.
          Hors crise, Rupture et Usure vivent dans les chiffres clés de la
          Veille (RegulationView) et dans le Conseil. */}
      {isCrisisActive && (
        <div className="barometers-grid">
          <div className={`barometer-card crisis-hero ${wearCrisis ? "time-wear" : "instability"}`}>
            {/* Juste un GROS titre centré, police pixel carrée du « IDLE » du
                logo (Silkscreen = --font-number) — sans %, ni Usure/Pression. */}
            <div className="barometer-header crisis-hero-header">
              <span className="crisis-hero-title">{wearCrisis
                ? tr({ fr: "Usure du Temps", en: "Wear of Time" })
                : tr({ fr: "Rupture", en: "Rupture" })}</span>
            </div>
            {/* Barre-SPRITE « digue rompue » : en crise la jauge est épinglée à
                100 % (jeu gelé) — le sprite pixel-art fissuré EST le remplissage.
                Sans crans : sur une barre pleine, 25/50/75 ne marquaient plus rien. */}
            <div className="barometer-track barometer-track--crisis rupture-bar"></div>
          </div>
        </div>
      )}

      {/* 2. MODE CRISE : CHUTE & TRANSMISSION (hors crise, le Bilan vit dans la Chronique) */}
      {isCrisisActive && (
        <div className="panel cycle-outcome-panel crisis-focus-active" id="crisisOutcomePanel">
          {/* Braises montantes (transform+opacity seuls — pas de blur/drop-shadow,
              cf. leçon perf de l'arbre des ruines) ; masquées en reduced-motion. */}
          <div className="crisis-embers" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
          <div className="panel-heading">
            <div>
              <h2 {...tipProps(tr({ fr: "Chute & Transmission", en: "Fall & Transmission" }), tr({
                fr: "Avant de tomber, la cité peut accomplir un rite — un seul. Il rapporte des Ruines et décide de la cause de la chute, donc du legs qui aura l'affinité. Les grands rites demandent d'avoir mis de côté.",
                en: "Before it falls, the city may perform one rite — only one. It yields Ruins and decides the cause of the fall, and so which legacy gets the affinity. The great rites require savings."
              }))}>{tr({ fr: "Chute & Transmission", en: "Fall & Transmission" })}</h2>
            </div>
          </div>

          <div className="crisis-focus-layout">
            <div className="crisis-choices-grid">
              <div className="crisis-edicts-col">
                <div className="crisis-edicts">
                  {prepDefs.map((def) => {
                    const used = Boolean(tp.used?.[def.type]);
                    const riteDone = terminalRiteSealed();
                    return (
                      <section className={`crisis-edict${used ? " edict-sealed" : ""}`} key={def.type}>
                        {/* La description vit en tooltip (retirée de l'écran — dé-boxing). */}
                        <div className="edict-head" {...tipProps(def.title, def.desc)}>
                          <PixelIcon name={def.iconName} className="edict-emblem" />
                          <h4>{def.title}</h4>
                        </div>
                        {/* « Choisir sa chute » : l'édit déclare la cause, donc l'affinité du legs. */}
                        <span
                          className="effect-chip is-info edict-cause"
                          {...tipProps(null, tr({ fr: "Accomplir ce rite décide de la cause de la chute, et donc du legs qui aura l'affinité.", en: "Performing this rite decides the cause of the fall, and so which legacy gets the affinity." }))}
                        >
                          {capitalize(FAVORED_CAUSE_LABELS[TERMINAL_EDICT_CAUSE[def.type]])}
                        </span>
                        {used ? (
                          <p className="edict-sealed-note">
                            <PixelIcon name="prep/sceau" className="edict-seal" />
                            <span>{tr({ fr: "Rite accompli", en: "Rite performed" })}</span>
                          </p>
                        ) : (
                          <div className="edict-tiers">
                            {TERMINAL_PREP_TIERS[def.type].map((t, i) => (
                              <button
                                key={i}
                                className="edict-tier"
                                disabled={!terminalCrisisReady(def.type, i)}
                                title={terminalCrisisReady(def.type, i) ? undefined : riteDone
                                  ? tr({ fr: "Un seul rite par chute.", en: "Only one rite per fall." })
                                  : tr({ fr: `Pas assez de ${RITE_RESOURCE_LABEL[TERMINAL_RITE_RESOURCE[def.type]] ? tr(RITE_RESOURCE_LABEL[TERMINAL_RITE_RESOURCE[def.type]]) : ""} en réserve.`, en: "Not enough in reserve." })}
                                onClick={() => { setHoverTarget(null); runTerminalCrisisAction(def.type, i); }}
                                onMouseEnter={() => setHoverTarget({ prep: t.prep, type: def.type })}
                                onMouseLeave={() => setHoverTarget(null)}
                                onFocus={() => setHoverTarget({ prep: t.prep, type: def.type })}
                                onBlur={() => setHoverTarget(null)}
                              >
                                <span className="edict-tier-row">
                                  <strong>{tierNames[i]}</strong>
                                  <span className="effect-chip is-harvest">
                                    {tr({ fr: `Ruines +${Math.round(boostedPrep(t.prep) * 100)} %`, en: `Ruins +${Math.round(boostedPrep(t.prep) * 100)}%` })}
                                  </span>
                                </span>
                                <span className="edict-tier-sub">
                                  <span className="action-cost">{costLabel(terminalCrisisCost(def.type, i))}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>

              </div>

              <aside className="collapse-altar">
                <h4>{tr({ fr: "Bilan de la Chute", en: "Fall Summary" })}</h4>
                <div
                  className={`harvest-count${previewGain ? " is-preview" : ""}`}
                  {...tipProps(null, tr({ fr: "Ruines récupérées à l'effondrement, Rite de Passage, legs gravé (ou dernière volonté) et vœu compris.", en: "Ruins recovered at the collapse, including the Rite of Passage, the engraved legacy (or last will) and the vow." }))}
                >
                  <span className="harvest-plus">+</span>
                  <OdometerNumber value={previewGain ?? shownGain} />
                  <PixelIcon name="glyphs/ruines" className="harvest-glyph" />
                </div>
                <ul className="harvest-factors">
                  <li {...tipProps(
                    tr({ fr: "Patience du cycle", en: "Cycle patience" }),
                    tr({ fr: "Grandit avec la durée de vie du cycle. Figée pendant la crise.", en: "Grows with the cycle's lived time. Frozen during the crisis." })
                  )}>
                    <span>{tr({ fr: "Patience du cycle", en: "Cycle patience" })}</span>
                    <strong>×{factors.patience.toFixed(2)}</strong>
                  </li>
                  <li
                    className={factors.preparationBonus > 0 ? undefined : "factor-idle"}
                    {...tipProps(
                      tr({ fr: "Édits scellés", en: "Sealed edicts" }),
                      tr({ fr: "Chaque édit scellé augmente les Ruines récupérées.", en: "Each sealed edict increases the Ruins recovered." })
                    )}
                  >
                    <span>{tr({ fr: "Édits scellés", en: "Sealed edicts" })}</span>
                    <strong>+{Math.round(factors.preparationBonus * 100)} %</strong>
                  </li>
                </ul>
                <TestamentSeals />
                <div className="collapse-main-buttons">
                  {/* Le `title` natif survit pour le SEUL état désactivé : un bouton
                      disabled ne reçoit aucun événement souris, la bulle maison ne
                      s'ouvrirait jamais dessus. L'état actif, lui, passe en bulle. */}
                  <button
                    ref={holdBtnRef}
                    className="collapse-btn-primary collapse-hold"
                    id="collapseBtn"
                    disabled={!canCollapse}
                    title={!canCollapse
                      ? tr({ fr: "Effondrement pas encore possible", en: "Collapse not yet possible" })
                      : undefined}
                    {...tipProps(null, canCollapse
                      ? tr({ fr: "Maintenir pour confirmer", en: "Hold to confirm" })
                      : null)}
                    onPointerDown={startHold}
                    onPointerUp={cancelHold}
                    onPointerLeave={cancelHold}
                    onPointerCancel={cancelHold}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
                        e.preventDefault();
                        startHold();
                      }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        cancelHold();
                      }
                    }}
                  >
                    <span className="hold-fill" ref={holdFillRef} aria-hidden="true"></span>
                    <span className="hold-label">{tr({ fr: "Effondrer la Cité", en: "Collapse the City" })}</span>
                    <span className="hold-hint">
                      {remaining ? remaining.text : tr({ fr: "Maintenir pour confirmer", en: "Hold to confirm" })}
                    </span>
                    {remaining && (
                      <span
                        className="hold-countdown-strip"
                        id="autoCollapseCountdown"
                        style={{ width: `${remaining.frac * 100}%` }}
                        aria-hidden="true"
                      ></span>
                    )}
                  </button>
                </div>
              </aside>
            </div>

            {journal.length > 0 && (
              <div className="crisis-journal">
                <div className="crisis-journal-head">
                  <PixelIcon name="glyphs/temps" />
                  <span>{tr({ fr: "Journal des derniers jours", en: "Journal of the last days" })}</span>
                </div>
                <ol className="crisis-journal-lines">
                  {journal.map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

    </section>
  );
}
