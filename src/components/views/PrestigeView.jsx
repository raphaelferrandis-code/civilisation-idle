import { useState, useEffect, useRef } from 'react';
import PixelIcon from '../ui/PixelIcon.jsx';
import OdometerNumber from '../ui/OdometerNumber.jsx';
import { useGameState } from '../../hooks/useGameState.js';
import {
  ruinGain,
  ruinGainFactors,
  ruinGainWithPrep,
  crisisOpen,
  terminalCrisisCost,
  terminalCrisisReady,
  TERMINAL_PREP_TIERS,
  has,
  autoCollapseDelay
} from '../../game/core/mechanics.js';
import {
  collapse,
  runTerminalCrisisAction,
} from '../../game/core/actions.js';
import { isMythEffectActive } from '../../game/data/myths.js';
import { costLabel } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import CrisisDoctrinePanel from '../ui/CrisisDoctrinePanel.jsx';
import GrandResetLadder from '../ui/GrandResetLadder.jsx';
import TestamentSeals from '../ui/TestamentSeals.jsx';
import { tipProps } from '../ui/HelpBubble.jsx';

export default function PrestigeView() {
  const instability = useGameState(s => s.instability);
  const timeWear = useGameState(s => s.timeWear);
  const crisisLimitAnnounced = useGameState(s => s.crisisLimitAnnounced);
  const crisisOpenedAt = useGameState(s => s.crisisOpenedAt);
  useGameState(s => s.activeMythId);
  const history = useGameState(s => s.history);
  const crisisExtensions = useGameState(s => s.crisisExtensions);
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
  // la main au joueur (refonte 2026-07-19). Seul Atlas verrouille encore.
  const mythBlocksCollapse = isMythEffectActive("mythe_d_atlas");
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
        fr: "Des familles quittent la cité : moins de bras aux champs, mais la pression retombe.",
        en: "Families leave the city: fewer hands in the fields, but the pressure eases."
      }),
      tierChips: (t) => [
        { label: tr({ fr: `Nourriture −${Math.round(t.malus * 100)}%`, en: `Food −${Math.round(t.malus * 100)}%` }), kind: "cost" }
      ]
    },
    {
      type: "prepareArchives",
      iconName: "prep/archives",
      title: tr({ fr: "Préparer les archives", en: "Prepare the archives" }),
      desc: tr({
        fr: "Scribes et ateliers se consacrent à la mémoire : savoir et trésor ralentissent, l'infrastructure profite des plans consignés.",
        en: "Scribes and workshops devote themselves to memory: knowledge and treasury slow down, while infrastructure benefits from the recorded plans."
      }),
      tierChips: (t) => [
        { label: tr({ fr: `Savoir & Trésor −${Math.round(t.malus * 100)}%`, en: `Knowledge & Treasury −${Math.round(t.malus * 100)}%` }), kind: "cost" },
        { label: tr({ fr: `Infrastructure +${Math.round((t.infraBonus || 0) * 100)}%`, en: `Infrastructure +${Math.round((t.infraBonus || 0) * 100)}%` }), kind: "gain" }
      ]
    },
    {
      type: "holdOrder",
      iconName: "prep/ordre",
      title: tr({ fr: "Maintenir l'ordre", en: "Maintain order" }),
      desc: tr({
        fr: "La garde verrouille la cité : toute l'économie ralentit, mais la rupture monte plus lentement.",
        en: "The guard locks down the city: the whole economy slows, but Rupture rises more slowly."
      }),
      tierChips: (t) => [
        { label: tr({ fr: `Toute production −${Math.round(t.malus * 100)}%`, en: `All production −${Math.round(t.malus * 100)}%` }), kind: "cost" },
        { label: tr({ fr: `Montée de Rupture −${Math.round((t.ruptureSlow || 0) * 100)}%`, en: `Rupture rise −${Math.round((t.ruptureSlow || 0) * 100)}%` }), kind: "gain" }
      ]
    }
  ];

  const activeMaluses = [];
  if ((tp.foodMalus || 0) > 0) activeMaluses.push({ label: tr({ fr: `Nourriture −${Math.round(tp.foodMalus * 100)}%`, en: `Food −${Math.round(tp.foodMalus * 100)}%` }), kind: "cost" });
  if ((tp.goldMalus || 0) > 0) activeMaluses.push({ label: tr({ fr: `Trésor −${Math.round(tp.goldMalus * 100)}%`, en: `Treasury −${Math.round(tp.goldMalus * 100)}%` }), kind: "cost" });
  if ((tp.knowledgeMalus || 0) > 0) activeMaluses.push({ label: tr({ fr: `Savoir −${Math.round(tp.knowledgeMalus * 100)}%`, en: `Knowledge −${Math.round(tp.knowledgeMalus * 100)}%` }), kind: "cost" });
  if ((tp.infraBonus || 0) > 0) activeMaluses.push({ label: tr({ fr: `Infrastructure +${Math.round(tp.infraBonus * 100)}%`, en: `Infrastructure +${Math.round(tp.infraBonus * 100)}%` }), kind: "gain" });
  if ((tp.ruptureSlow || 0) > 0) activeMaluses.push({ label: tr({ fr: `Montée de Rupture −${Math.round(tp.ruptureSlow * 100)}%`, en: `Rupture rise −${Math.round(tp.ruptureSlow * 100)}%` }), kind: "gain" });

  // ── Mode crise : jauge héros PLEINE à 100 % (échelle simple — l'échelle
  // étendue « avec zone de pression » lisait comme une jauge pas remplie),
  // crans aux cibles des édits, fantôme de prévisualisation au survol. ──
  const wearCrisis = isCrisisActive && (timeWear || 0) >= 1 && instability < 1;
  const gaugeName = wearCrisis ? tr({ fr: "Usure", en: "Wear" }) : tr({ fr: "Rupture", en: "Rupture" });
  const factors = ruinGainFactors();
  const journal = (history || []).slice(-5);
  // Préviz de moisson : au survol d'un palier, l'odomètre roule vers le total
  // qu'apporterait cet édit (et revient au départ du survol).
  const previewGain = hoverTarget ? ruinGainWithPrep(hoverTarget.prep) : null;

  return (
    // En crise, la fresque devient le fond de TOUTE la page (retour Raph) :
    // la classe déclenche le débord pleine largeur + l'image dans le CSS.
    <section className={`view active${isCrisisActive ? " crisis-backdrop" : ""}`} id="prestige">
      {/* 1. JAUGE HÉROS (crise uniquement) : la jauge fautive pleine largeur.
          Hors crise, les baromètres Rupture/Usure vivent dans l'onglet
          Régulation (TensionBarometers) — retour Raph 2026-07-13. */}
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
                Crans des édits et fantôme de survol en surimpression. */}
            <div className="barometer-track barometer-track--crisis rupture-bar">
              {[0.25, 0.5, 0.75].map((m) => (
                <span
                  key={m}
                  className="barometer-mark"
                  style={{ left: `${m * 100}%` }}
                  {...tipProps(null, `${Math.round(m * 100)} %`)}
                ></span>
              ))}
              {hoverTarget != null && (
                <span className="barometer-target-ghost ghost-preview" style={{ left: `${hoverTarget.target * 100}%` }}></span>
              )}
            </div>
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
              <h2>{tr({ fr: "Chute & Transmission", en: "Fall & Transmission" })}</h2>
              <p className="crisis-intro">
                {tr({
                  fr: "Chaque édit ramène la jauge au palier choisi et relance la cité. Coût immédiat, malus jusqu'à l'effondrement, plus de Ruines à la chute.",
                  en: "Each edict brings the gauge back to the chosen tier and restarts the city. Immediate cost, penalties until the collapse, more Ruins at the fall."
                })}
              </p>
            </div>
          </div>

          <div className="crisis-focus-layout">
            <div className="crisis-choices-grid">
              <div className="crisis-edicts-col">
                <div className="crisis-edicts">
                  {prepDefs.map((def) => {
                    const used = Boolean(tp.used?.[def.type]);
                    return (
                      <section className={`crisis-edict${used ? " edict-sealed" : ""}`} key={def.type}>
                        {/* La description vit en tooltip (retirée de l'écran — dé-boxing). */}
                        <div className="edict-head" {...tipProps(def.title, def.desc)}>
                          <PixelIcon name={def.iconName} className="edict-emblem" />
                          <h4>{def.title}</h4>
                        </div>
                        {used ? (
                          <p className="edict-sealed-note">
                            <PixelIcon name="prep/sceau" className="edict-seal" />
                            <span>{tr({ fr: "Édit scellé, en vigueur jusqu'à l'effondrement.", en: "Edict sealed, in effect until the collapse." })}</span>
                          </p>
                        ) : (
                          <div className="edict-tiers">
                            {TERMINAL_PREP_TIERS[def.type].map((t, i) => (
                              <button
                                key={i}
                                className="edict-tier"
                                disabled={!terminalCrisisReady(def.type, i)}
                                title={!terminalCrisisReady(def.type, i) ? tr({ fr: "Préparation non disponible pour l'instant", en: "Preparation not available yet" }) : undefined}
                                onClick={() => { setHoverTarget(null); runTerminalCrisisAction(def.type, i); }}
                                onMouseEnter={() => setHoverTarget({ target: t.target, prep: t.prep })}
                                onMouseLeave={() => setHoverTarget(null)}
                                onFocus={() => setHoverTarget({ target: t.target, prep: t.prep })}
                                onBlur={() => setHoverTarget(null)}
                              >
                                <span className="edict-tier-row">
                                  <strong>{tierNames[i]}</strong>
                                  <span className="edict-tier-target">{gaugeName} → {Math.round(t.target * 100)} %</span>
                                  <span className="effect-chip is-harvest">
                                    {tr({ fr: `Ruines +${Math.round(t.prep * 100)} %`, en: `Ruins +${Math.round(t.prep * 100)}%` })}
                                  </span>
                                </span>
                                <span className="edict-tier-sub">
                                  <span className="effect-chips">
                                    {def.tierChips(t).map((chip) => (
                                      <span key={chip.label} className={`effect-chip is-${chip.kind}`}>{chip.label}</span>
                                    ))}
                                  </span>
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

                {(crisisExtensions || 0) > 0 && (
                  <p className="edict-escalation">
                    {tr({
                      fr: `Chaque édit scellé renchérit les suivants : prochains coûts ×${(1 + crisisExtensions * 0.55).toFixed(2)}.`,
                      en: `Each sealed edict raises the next prices: upcoming costs ×${(1 + crisisExtensions * 0.55).toFixed(2)}.`
                    })}
                  </p>
                )}

                {activeMaluses.length > 0 && (
                  <div className="prep-active-maluses">
                    <span>{tr({ fr: "En vigueur jusqu'à l'effondrement :", en: "In effect until collapse:" })}</span>
                    <span className="effect-chips">
                      {activeMaluses.map((chip) => (
                        <span key={chip.label} className={`effect-chip is-${chip.kind}`}>{chip.label}</span>
                      ))}
                    </span>
                  </div>
                )}
              </div>

              <aside className="collapse-altar">
                <h4>{tr({ fr: "Bilan de la Chute", en: "Fall Summary" })}</h4>
                <div className={`harvest-count${previewGain ? " is-preview" : ""}`}>
                  <span className="harvest-plus">+</span>
                  <OdometerNumber value={previewGain ?? ruinGainVal} />
                  <PixelIcon name="glyphs/ruines" className="harvest-glyph" />
                </div>
                <p className="harvest-caption">
                  {tr({ fr: "Ruines récupérées à l'effondrement.", en: "Ruins recovered at the collapse." })}
                </p>
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

      {/* 3. DOCTRINE DE CRISE — automatisation des paliers (déplacée depuis les Options).
          Le tableau tactique (Foyers de tension & Actions de régulation) vit
          désormais dans son propre onglet Régulation. */}
      {!isCrisisActive && <CrisisDoctrinePanel />}

      {/* 4. LES GRANDS RESETS — échelle des 11 jalons marquants (jalons secrets
          jusqu'à découverte), activables au gré du joueur. */}
      {!isCrisisActive && <GrandResetLadder />}
    </section>
  );
}
