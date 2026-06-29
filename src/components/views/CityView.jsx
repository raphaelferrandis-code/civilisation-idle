import { useState, useCallback, useRef, useEffect } from 'react';
import { useCityViewState } from '../../hooks/useCityViewState.js';
import { useGameState } from '../../hooks/useGameState.js';
import CityMapCanvas from '../map/CityMapCanvas.jsx';
import BuildingShop from '../ui/BuildingShop.jsx';
import ChronicleTicker from '../ui/ChronicleTicker.jsx';
import CrisisActionBar from '../ui/CrisisActionBar.jsx';
import HudPanel from '../ui/HudPanel.jsx';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  ruinEffectSum,
  unspentRuinsPowerMultiplier,
  ruinGain,
  has,
  crisisOpen
} from '../../game/core/mechanics.js';
import {
  exhumeVestige,
  rembourserAtridesDebt,
  renegocierAtridesDebt,
  transmettreAtrides,
  activateAtridesPact,
  migrerEnee,
  rewardCitizenThought
} from '../../game/core/actions.js';
import { save, setCityName, commitCityName, state } from '../../game/core/state.js';
import { ensureMapSeed } from '../../game/map/procedural/seedManager.js';
import { computeCityPersonality } from '../../game/map/procedural/cityPersonality.js';
import { fmt, clamp01 } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { D, toNum } from '../../game/core/num.js';
import {
  ICARE_INFRA_TARGET,
  OR_GOLD_TARGET,
  OR_POP_CAP,
  BABEL_CAT_LABELS,
  PHENIX_RENAISSANCE_TARGET,
  PHENIX_REBIRTH_WINDOW_MS,
  HEPH_INFRA_PER_PEAK,
  ATRIDES_GOAL_NET_GOLD,
  ATRIDES_DEBT_PAYBACK_FACTOR,
  ENEE_MIGRATIONS_TARGET,
  ENEE_TERRITORY_INTERVAL_MS,
  isMythEffectActive
} from '../../game/data/myths.js';
import { EPITAPH_LEGACY_DURATION_MS, epitaphLegacyById, epitaphLegacyChips } from '../../game/data/epitaphs.js';
import { CHRONICLE_VISIBLE_MS } from '../../game/core/chronicleEvaluator.js';

export default function CityView() {
  const {
    cityName, population, gold, infrastructure,
    cycleStartedAt, archaeologyUsed,
    activeMythId, sisypheMult, icareInfraReached, babelProdReached, babelCategory,
    orPopPeak, orUsureImbalance, phoenixRenaissances, phoenixRebirthTargetPop,
    hephPopPeak, hephGoalReached,
    atridesDebt, atridesDrainDisabled, atridesDebtGrowthMultiplier,
    atridesRenegotiateActiveUntil, atridesRenegotiateCooldownEnd,
    atridesHeritage, atridesPactActive, atridesNextRunPenaltyActive,
    eneeMigrations, eneeDegraded, eneeTerritoryStartedAt, eneeHeritage, eneeCollapseCount,
    activeEpitaphLegacy,
    instability,
    tickNow
  } = useCityViewState();

  // Horloge du tick (1 Hz) : évite un timer local qui doublerait les rendus.
  const now = tickNow;
  const [bubbleMessage, setBubbleMessage] = useState(null);
  // Timer de la bulle de pensée : tracé en ref pour être nettoyé au démontage
  // (la vie/effondrement démonte fréquemment CityView → pas de timer orphelin).
  const bubbleTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(bubbleTimerRef.current), []);
  // Dock du rail gauche : un seul popover ouvert à la fois (chronique/exhume/mythes).
  const [openDock, setOpenDock] = useState(null);
  const toggleDock = (id) => setOpenDock((cur) => (cur === id ? null : id));
  const latestChronicle = useGameState((s) => (s.chronicleEntries || [])[0]);

  // Personnalité procédurale de la ville (stable par cycle ; la surcouche
  // crise/effondrement évolue avec instability/timeWear, recalcul léger).
  const cityPersonalityLabel = (() => {
    try {
      const p = computeCityPersonality(ensureMapSeed(state), state);
      return p.label.charAt(0).toUpperCase() + p.label.slice(1);
    } catch {
      return "";
    }
  })();

  const handleCitizenThought = useCallback((citizen, thoughtType) => {
    const quotes = {
      thought: [
        { fr: "J'ai vu une ombre étrange dans les bois... Serait-ce un présage du cycle suivant ?", en: "I saw a strange shadow in the woods... Could it be an omen of the next cycle?" },
        { fr: "Les anciens bâtissaient avec de l'argile brute. Nous construisons sur leurs débris.", en: "The ancients built with raw clay. We build upon their rubble." },
        { fr: "Parfois, j'ai l'impression que le temps tourne en boucle. Quelle idée absurde...", en: "Sometimes I feel like time is running in circles. What an absurd notion..." },
        { fr: "Si notre dynastie tombe, j'espère que les scribes écriront mon nom correctement.", en: "If our dynasty falls, I hope the scribes will spell my name correctly." },
        { fr: "Le pain d'aujourd'hui a un goût de cendres. Est-ce l'usure qui s'installe ?", en: "Today's bread tastes of ashes. Is the wear setting in?" },
        { fr: "Nos philosophes affirment que notre cité n'est qu'un grain de sable sur l'Olympe.", en: "Our philosophers claim our city is but a grain of sand upon Olympus." },
        { fr: "Quand le ciel rougeoie le soir, je prie pour que l'effondrement attende l'aube.", en: "When the sky glows red at dusk, I pray the collapse waits for dawn." }
      ],
      scroll: [
        { fr: "J'ai trouvé ce vieux parchemin sous les ruines d'un temple !", en: "I found this old parchment beneath the ruins of a temple!" },
        { fr: "Voici une formule mathématique oubliée du cycle précédent !", en: "Here is a mathematical formula forgotten from the previous cycle!" },
        { fr: "Cette tablette d'argile décrit la chute de notre première cité.", en: "This clay tablet describes the fall of our first city." },
        { fr: "Un secret des anciens ingénieurs ! Nos scribes vont adorer.", en: "A secret of the ancient engineers! Our scribes will love it." },
        { fr: "Un codex cryptique... Son déchiffrement va accélérer nos recherches !", en: "A cryptic codex... Deciphering it will speed up our research!" }
      ],
      lightning: [
        { fr: "Le feu créateur coule dans nos veines ! Travaillons plus vite !", en: "The creative fire flows in our veins! Let us work faster!" },
        { fr: "Une idée fulgurante traverse notre corporation ! En avant !", en: "A flash of insight sweeps through our guild! Onward!" },
        { fr: "L'énergie de la jeunesse anime nos chantiers aujourd'hui !", en: "The energy of youth drives our worksites today!" },
        { fr: "Par Héphaïstos ! L'inspiration divine accélère nos tâches !", en: "By Hephaestus! Divine inspiration hastens our tasks!" }
      ]
    };

    const pool = quotes[thoughtType] || quotes.thought;
    const text = tr(pool[Math.floor(Math.random() * pool.length)]);
    
    const rewardText = rewardCitizenThought(thoughtType, citizen);
    
    setBubbleMessage({
      name: citizen.name,
      role: citizen.role,
      text,
      reward: rewardText
    });
    
    // Fermer le message après 4 secondes (timer nettoyé au démontage via la ref)
    clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      setBubbleMessage(current => {
        if (current && current.name === citizen.name && current.text === text) {
          return null;
        }
        return current;
      });
    }, 4000);
  }, []);

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);

  const unspentPower = ruinEffectSum("unspentRuinsPower");
  const unspentMult = unspentPower > 0 ? unspentRuinsPowerMultiplier() : 1;
  const hasLatent = unspentPower > 0;

  const showExhume = has("skill_archaeology") && !archaeologyUsed;

  const handleNameChange = (e) => {
    setCityName(e.target.value);
  };

  const handleNameBlur = () => {
    commitCityName();
    save();
  };

  // formatting for special myths
  const isSisyphe = isMythEffectActive("mythe_de_sisyphe");
  const isIcare = isMythEffectActive("mythe_d_icare");
  const isBabel = isMythEffectActive("mythe_de_babel");
  const isOr = isMythEffectActive("mythe_age_or");
  const isPhoenix = isMythEffectActive("mythe_du_phenix");
  const isHeph = isMythEffectActive("mythe_d_hephaistos");
  const cycleSeconds = Math.floor((now - (cycleStartedAt || now)) / 1000);
  const activeEpitaphDefinition = activeEpitaphLegacy ? epitaphLegacyById(activeEpitaphLegacy.id) : null;
  const epitaphRemainingSeconds = activeEpitaphLegacy
    ? Math.max(0, Math.ceil((EPITAPH_LEGACY_DURATION_MS - (now - (activeEpitaphLegacy.startedAt || cycleStartedAt || now))) / 1000))
    : 0;
  const hasActiveEpitaphLegacy = Boolean(activeEpitaphDefinition && epitaphRemainingSeconds > 0);
  const phoenixWindowSecs = isPhoenix
    ? Math.max(0, Math.ceil(((cycleStartedAt || now) + PHENIX_REBIRTH_WINDOW_MS - now) / 1000))
    : null;

  const isAtrides = isMythEffectActive("mythe_atrides");
  const totalProd = Math.max(0, toNum(r.food.add(r.gold).add(r.knowledge).add(r.infrastructure)));
  const atridesDebtGrowthRate = Math.max(10, totalProd * 0.01) * (atridesDebtGrowthMultiplier || 1);
  const netGold = D(gold).sub(atridesDebt || 0);
  const netGoldReached = netGold.gte(ATRIDES_GOAL_NET_GOLD);
  const atridesRepayCost = (atridesDebt || 0) * ATRIDES_DEBT_PAYBACK_FACTOR;
  const canRepayAtrides = D(gold).gte(atridesRepayCost) && (atridesDebt || 0) > 0;

  const renegocierCooldownSecs = atridesRenegotiateCooldownEnd ? Math.max(0, Math.ceil((atridesRenegotiateCooldownEnd - now) / 1000)) : 0;
  const renegocierActiveSecs = atridesRenegotiateActiveUntil ? Math.max(0, Math.ceil((atridesRenegotiateActiveUntil - now) / 1000)) : 0;
  const isRenegotiationActive = renegocierActiveSecs > 0;
  const isRenegotiationOnCooldown = renegocierCooldownSecs > 0;

  const eneeIntervalMs = ENEE_TERRITORY_INTERVAL_MS;
  const eneeElapsedMs = eneeTerritoryStartedAt ? Math.max(0, now - eneeTerritoryStartedAt) : 0;
  const eneeRemainingSecs = Math.max(0, Math.ceil((eneeIntervalMs - eneeElapsedMs) / 1000));

  const showMythsPanel = isSisyphe || isIcare || isBabel || isOr || isPhoenix || isHeph || isAtrides || atridesPactActive || atridesNextRunPenaltyActive || isMythEffectActive("mythe_d_enee") || eneeHeritage || hasLatent || hasActiveEpitaphLegacy;

  // Pastille de la chronique : dépêche encore dans sa fenêtre d'affichage.
  const chronicleVisible = Boolean(latestChronicle && now - (latestChronicle.publishedAt || 0) < CHRONICLE_VISIBLE_MS);
  const chronicleNew = Boolean(latestChronicle?.isNew);
  // Badge du dock Mythes : nombre de cartes de statut actuellement actives.
  const mythCount = [
    isSisyphe, isIcare, isBabel, isOr, isPhoenix, isHeph, isAtrides,
    atridesPactActive, atridesNextRunPenaltyActive, isMythEffectActive("mythe_d_enee"),
    eneeHeritage && cycleSeconds < 30, hasActiveEpitaphLegacy, hasLatent
  ].filter(Boolean).length;

  return (
    <section className="view active" id="city">
      <div className="city-left-col">
        {eneeHeritage && cycleSeconds < 30 && (
          <div className="enee-boost-banner">
            <strong>⚖ {tr({ fr: "Bénédiction d'Énée", en: "Aeneas's Blessing" })}</strong>
            <p>
              {tr({ fr: <>Démarrage rapide : la production globale est augmentée de <strong>+{Math.round(Math.min(10, eneeCollapseCount || 0) * 10)}%</strong> ({30 - cycleSeconds}s restantes).</>, en: <>Fast start: global production is increased by <strong>+{Math.round(Math.min(10, eneeCollapseCount || 0) * 10)}%</strong> ({30 - cycleSeconds}s remaining).</> })}
            </p>
          </div>
        )}
        {atridesHeritage && !activeMythId && cycleSeconds < 120 && (
          <div className={`atrides-pact-banner${atridesPactActive ? ' is-sealed' : ''}`}>
            <div className="pact-banner-head">
              <strong>
                {atridesPactActive ? tr({ fr: "⚖ Pacte des Atrides Scellé", en: "⚖ Atreides Pact Sealed" }) : tr({ fr: "📜 Pacte des Atrides Disponible", en: "📜 Atreides Pact Available" })}
              </strong>
              <span className="pact-banner-time">{tr({ fr: "Temps restant", en: "Time remaining" })}: {120 - cycleSeconds}s</span>
            </div>
            <p>
              {atridesPactActive
                ? tr({ fr: "Vous avez emprunté de la production. Bonus x2 actif pendant les 2 premières minutes, puis malus x0.5 s'appliquera en phase de crise.", en: "You have borrowed production. The x2 bonus is active for the first 2 minutes, then a x0.5 penalty will apply during the crisis phase." })
                : tr({ fr: "Empruntez un bonus de production de x2 pour les 2 premières minutes de ce cycle. En échange, la production sera réduite de 50% pendant la crise finale.", en: "Borrow a x2 production bonus for the first 2 minutes of this cycle. In exchange, production will be reduced by 50% during the final crisis." })}
            </p>
            {!atridesPactActive && (
              <button onClick={activateAtridesPact} className="btn-primary pact-activate-btn">
                {tr({ fr: "Activer le Pacte", en: "Activate the Pact" })}
              </button>
            )}
          </div>
        )}

        {/* La Cité en héros : carte plein cadre, identité + jauge de stabilité
            posées en HUD par-dessus (on montre le monde d'abord). */}
        <div className="city-stage">
          <div className="city-stage-hud">
          <div className="city-title-wrapper">
            <input
              id="cityNameInput"
              className="city-name-input"
              maxLength={42}
              value={cityName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              aria-label={tr({ fr: "Nom de la ville", en: "City name" })}
            />
            <span
              className="city-personality-label"
              title={tr({ fr: "Personnalité procédurale de cette civilisation : elle façonne le plan de la ville, ses bâtiments et ses habitants", en: "Procedural personality of this civilization: it shapes the city layout, its buildings, and its inhabitants" })}
            >
              {cityPersonalityLabel}
            </span>
          </div>

          {/* Jauge de pression civilisationnelle (fine, adaptative) */}
          {(() => {
            const lvl = clamp01(instability);
            const pctValue = Math.round(lvl * 100);
            const tier = lvl >= 0.9
              ? { cls: "sg-collapse", icon: "💀", label: { fr: "Effondrement imminent", en: "Imminent Collapse" }, desc: { fr: "La cité est au bord du gouffre. Résolvez la crise avant l'effondrement total.", en: "The city is on the brink. Resolve the crisis before total collapse." } }
              : lvl >= 0.75
              ? { cls: "sg-crisis", icon: "🚨", label: { fr: "Crise ouverte", en: "Open Crisis" }, desc: { fr: "Les pressions montent. Construisez, stabilisez, ou acceptez l'inévitable.", en: "Pressures are rising. Build, stabilize, or accept the inevitable." } }
              : lvl >= 0.5
              ? { cls: "sg-strain", icon: "🔥", label: { fr: "Instabilité croissante", en: "Growing Instability" }, desc: { fr: "Les fractures s'élargissent. Le progrès coûte de plus en plus de stabilité.", en: "The fractures widen. Progress costs ever more stability." } }
              : lvl >= 0.25
              ? { cls: "sg-tension", icon: "⚠️", label: { fr: "Premières tensions", en: "First Tensions" }, desc: { fr: "Les tensions s'accumulent. Le progrès coûte de la stabilité.", en: "Tensions are building. Progress costs stability." } }
              : { cls: "sg-stable", icon: "🛡️", label: { fr: "Civilisation stable", en: "Stable Civilization" }, desc: { fr: "La cité tient bon. Continuez à bâtir votre civilisation.", en: "The city holds firm. Keep building your civilization." } };
            const crackOpacity = (threshold, ramp, max) =>
              lvl >= threshold ? Math.min(max, 0.3 + (lvl - threshold) * ramp) : 0;
            // Reworks §5.1/§5.2 surfacés ici : cible (fantôme) + gain projeté.
            const targetLvl = clamp01(pressure.total);
            const projectedRuin = ruinGain(true);
            // Tooltip détaillé : sources de pression (données de pressureBreakdown)
            const pp = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
            const pressureTooltip = [
              tr(tier.desc),
              "",
              tr({ fr: "Sources de pression :", en: "Sources of pressure:" }),
              tr({ fr: `Rareté ${pp(pressure.scarcity)} · Inégalités ${pp(pressure.inequality)}`, en: `Scarcity ${pp(pressure.scarcity)} · Inequality ${pp(pressure.inequality)}` }),
              tr({ fr: `Complexité ${pp(pressure.complexity)} · Dissidence ${pp(pressure.dissent)}`, en: `Complexity ${pp(pressure.complexity)} · Dissent ${pp(pressure.dissent)}` }),
              tr({ fr: `Structurel ${pp(pressure.structural)} · Atténuation -${(pressure.mitigation * 100).toFixed(0)}%`, en: `Structural ${pp(pressure.structural)} · Mitigation -${(pressure.mitigation * 100).toFixed(0)}%` }),
              pressure.demesure > 0 ? tr({ fr: `Démesure ${pp(pressure.demesure)} (irréductible)`, en: `Hubris ${pp(pressure.demesure)} (irreducible)` }) : null
            ].filter(Boolean).join("\n");
            return (
              <div
                className={`stability-gauge ${tier.cls}`}
                title={pressureTooltip}
                aria-label={tr({ fr: `Pression civilisationnelle : ${pctValue}% — ${tr(tier.label)}`, en: `Civilizational pressure: ${pctValue}% — ${tr(tier.label)}` })}
              >
                <div className="sg-meta">
                  <span className="sg-icon" aria-hidden="true">{tier.icon}</span>
                  <span className="sg-label">{tr(tier.label)}</span>
                  <span className="sg-collapse-gain" title={tr({ fr: "Ruines obtenues si la cité s'effondrait maintenant. Tenir plus longtemps et chuter plus profond rapporte davantage.", en: "Ruins gained if the city collapsed right now. Holding out longer and falling deeper yields more." })}>💀 +{fmt(projectedRuin)} 🏛️</span>
                  <span className="sg-pct" id="rupturePanelValue">{pctValue}%</span>
                </div>
                <div className="sg-track">
                  {[25, 50, 75, 90].map((t) => (
                    <span key={t} className="sg-tick" style={{ left: `${t}%` }} aria-hidden="true"></span>
                  ))}
                  <span className="sg-fill" style={{ width: `${lvl * 100}%` }}></span>
                  <span className="sg-target-ghost" style={{ left: `${targetLvl * 100}%` }} title={tr({ fr: `Cible : ${Math.round(targetLvl * 100)}% — la jauge dérive vers ce niveau.`, en: `Target: ${Math.round(targetLvl * 100)}% — the gauge drifts toward this level.` })}></span>
                  {lvl >= 0.68 && (
                    <svg className="sg-cracks" viewBox="0 0 320 40" preserveAspectRatio="none" aria-hidden="true">
                      {[
                        { d: "M250 13 L246 17.5 L249 21.5 L244 26.5 M246 17.5 L241 19.5 L238 25 M286 13 L283 17 L286 20.5 L282 26.5 M286 20.5 L290.5 23.5", opacity: crackOpacity(0.70, 3, 0.8) },
                        { d: "M196 12.5 L192 17 L195 21 L190 27 M192 17 L186.5 19 M222 13.5 L226 18.5 L223 23 L227 27 M226 18.5 L231 20.5 L234.5 25.5 M305 12 L301 16 L304 21 L300 27.5 M301 16 L296 18 M304 21 L309 24", opacity: crackOpacity(0.82, 5, 0.9) },
                        { d: "M150 7.5 L146 13.5 L149 18.5 L144 24 L147 31.5 M146 13.5 L140.5 16 M144 24 L154 26.5 M172 6 L176 12 L173 17 L177 23 L174 32.5 M176 12 L181.5 14 M177 23 L170 26.5 M262 7 L258 13 L261 18 L256 25 L259 33.5 M261 18 L267 20.5 M118 9.5 L114 15.5 L117 21.5 L112 28 M117 21.5 L123 24", opacity: crackOpacity(0.92, 7, 1) }
                      ].map((g, i) => (
                        <g key={i} className="sg-crack-group" style={{ opacity: g.opacity }}>
                          <path className="sg-crack-light" d={g.d} transform="translate(0.7 0.9)" vectorEffect="non-scaling-stroke" />
                          <path className="sg-crack-dark" d={g.d} vectorEffect="non-scaling-stroke" />
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
              </div>
            );
          })()}

          </div>{/* /city-stage-hud */}

          {/* La carte interactive : le monde occupe tout le cadre */}
          <div className="city-map-container">
          <div
            className="civilization-map-interactive"
            id="civilizationMap"
            aria-label={tr({ fr: "Diorama de la cité", en: "City diorama" })}
          >
            <CityMapCanvas onCitizenThoughtClicked={handleCitizenThought} />
          </div>
          {bubbleMessage && (
            <div className="map-bubble-alert">
              <span className="bubble-alert-name">{bubbleMessage.name} ({bubbleMessage.role}) :</span>
              <span className="bubble-alert-text">"{bubbleMessage.text}"</span>
              {bubbleMessage.reward && <span className="bubble-alert-reward">{bubbleMessage.reward}</span>}
            </div>
          )}
          </div>{/* /city-map-container */}

          {/* Boutique dockée : le menu de construction posé sur le bord droit du monde */}
          <aside className="city-shop-dock" aria-label={tr({ fr: "Construction", en: "Construction" })}>
            <BuildingShop />
          </aside>
        </div>{/* /city-stage */}

        {/* Régulation des tensions + politiques : encart pliable, sous la carte */}
        <HudPanel className="city-controls-panel" storageKey="regul" title={tr({ fr: "Régulation des tensions", en: "Tension Regulation" })}>
          <CrisisActionBar variant="compact" />
        </HudPanel>

        {/* Rail gauche : dock d'icônes + popovers (chronique / exhume / mythes) */}
        <div className="city-aux">
          <div className="hud-dock" role="toolbar" aria-label={tr({ fr: "Outils de la cité", en: "City tools" })}>
            {chronicleVisible && (
              <button type="button" className={`hud-dock-btn${openDock === 'chronique' ? ' is-active' : ''}`} aria-label={tr({ fr: "Chronique de l'effondrement", en: "Chronicle of the collapse" })} aria-pressed={openDock === 'chronique'} onClick={() => toggleDock('chronique')}>
                <i className="fa-solid fa-newspaper" aria-hidden="true"></i>
                {chronicleNew && <span className="hud-dock-dot" aria-hidden="true"></span>}
              </button>
            )}
            {showExhume && (
              <button type="button" className={`hud-dock-btn${openDock === 'exhume' ? ' is-active' : ''}`} aria-label={tr({ fr: "Exhumer un vestige archéologique", en: "Exhume an archaeological vestige" })} aria-pressed={openDock === 'exhume'} onClick={() => toggleDock('exhume')}>
                <i className="fa-solid fa-trowel" aria-hidden="true"></i>
                <span className="hud-dock-dot hud-dock-dot--gold" aria-hidden="true"></span>
              </button>
            )}
            {showMythsPanel && (
              <button type="button" className={`hud-dock-btn${openDock === 'myths' ? ' is-active' : ''}`} aria-label={tr({ fr: "Mythes actifs et bénédictions", en: "Active myths and blessings" })} aria-pressed={openDock === 'myths'} onClick={() => toggleDock('myths')}>
                <i className="fa-solid fa-scroll" aria-hidden="true"></i>
                {mythCount > 0 && <span className="hud-dock-badge">{mythCount}</span>}
              </button>
            )}
          </div>

          {openDock === 'chronique' && chronicleVisible && (
            <div className="panel hud-pop hud-pop--chronique">
              <ChronicleTicker />
            </div>
          )}

          {openDock === 'exhume' && showExhume && (
            <div className="panel hud-pop">
              <h3 className="hud-pop-title">{tr({ fr: "Vestige archéologique", en: "Archaeological Vestige" })}</h3>
              <p className="hud-pop-desc">{tr({ fr: "Fouille les décombres d'un cycle passé pour en exhumer un bonus unique.", en: "Dig through the rubble of a past cycle to exhume a unique bonus." })}</p>
              <button id="exhumeBtn" className="btn-primary" onClick={() => { exhumeVestige(); setOpenDock(null); }}>
                ⛏ {tr({ fr: "Exhumer un vestige", en: "Exhume a vestige" })}
              </button>
            </div>
          )}

          {openDock === 'myths' && showMythsPanel && (
          <div className="panel hud-pop hud-pop--myths">

        {/* 5. Atrides Debt Panel */}
        {isAtrides && (
          <div className="myth-panel myth-panel--atrides atrides-debt-panel">
            <div className="panel-heading">
              <div>
                <span className="label label-red">{tr({ fr: "Acte III · Le Fardeau des Atrides", en: "Act III · The Burden of the Atreides" })}</span>
                <h2>{tr({ fr: "Tragédie & Dette Active", en: "Tragedy & Active Debt" })}</h2>
              </div>
            </div>

            <div className="myth-panel-body">
              <div className="myth-stats-grid">
                <div className="myth-stat is-red">
                  <span>{tr({ fr: "Dette Cumulée", en: "Accumulated Debt" })}</span>
                  <strong>{fmt(atridesDebt)}</strong>
                </div>

                <div className="myth-stat is-orange">
                  <span>{tr({ fr: "Taux de Croissance", en: "Growth Rate" })}</span>
                  <strong>+{fmt(atridesDebtGrowthRate)} /s</strong>
                  {isRenegotiationActive && (
                    <small className="stat-green">{tr({ fr: `Renégociation active (${renegocierActiveSecs}s)`, en: `Renegotiation active (${renegocierActiveSecs}s)` })}</small>
                  )}
                </div>

                <div className="myth-stat">
                  <span>{tr({ fr: "Objectif Trésor Net", en: "Net Treasury Goal" })}</span>
                  <strong className={netGoldReached ? "stat-green" : "stat-gold"}>
                    {fmt(netGold)} / {fmt(ATRIDES_GOAL_NET_GOLD)}
                  </strong>
                  <small>{tr({ fr: "Trésor moins Dette", en: "Treasury minus Debt" })}</small>
                </div>

                <div className={`myth-stat ${atridesDrainDisabled ? "is-green" : "is-red"}`}>
                  <span>{tr({ fr: "Drain de Ressources", en: "Resource Drain" })}</span>
                  <strong>{atridesDrainDisabled ? tr({ fr: "Désactivé", en: "Disabled" }) : "-10%"}</strong>
                  <small>{atridesDrainDisabled ? tr({ fr: "Transmission active", en: "Transmission active" }) : tr({ fr: "Va à la Dette", en: "Goes to Debt" })}</small>
                </div>
              </div>

              <div className="myth-actions">
                <button
                  onClick={rembourserAtridesDebt}
                  disabled={!canRepayAtrides}
                  className="btn-primary"
                  title={tr({ fr: "Rembourse la dette en payant de l'Or", en: "Repays the debt by paying Gold" })}
                >
                  {tr({ fr: `Rembourser (${fmt(atridesRepayCost)} Or)`, en: `Repay (${fmt(atridesRepayCost)} Gold)` })}
                </button>

                <button
                  onClick={renegocierAtridesDebt}
                  disabled={isRenegotiationOnCooldown}
                  className="btn-secondary"
                  title={tr({ fr: "Réduit le taux de croissance de la dette de 70% pour 30s", en: "Reduces the debt growth rate by 70% for 30s" })}
                >
                  {isRenegotiationOnCooldown ? tr({ fr: `Renégocier (${renegocierCooldownSecs}s)`, en: `Renegotiate (${renegocierCooldownSecs}s)` }) : tr({ fr: "Renégocier (120s CD)", en: "Renegotiate (120s CD)" })}
                </button>

                <button
                  onClick={transmettreAtrides}
                  disabled={atridesDrainDisabled}
                  className="btn-danger"
                  title={tr({ fr: "Désactive le drain, gains de ruines x1.5, mais malus de production de 20% au cycle suivant", en: "Disables the drain, ruins gains x1.5, but a 20% production penalty on the next cycle" })}
                >
                  {atridesDrainDisabled ? tr({ fr: "Transmis", en: "Transmitted" }) : tr({ fr: "Transmettre (Ruines x1.5)", en: "Transmit (Ruins x1.5)" })}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. Enee Panel */}
        {isMythEffectActive("mythe_d_enee") && (
          <div className={`myth-panel myth-panel--enee enee-panel${eneeDegraded ? ' is-degraded' : ''}`}>
            <div className="panel-heading">
              <div>
                <span className={`label ${eneeDegraded ? 'label-red' : 'label-green'}`}>{tr({ fr: "Acte I · Le Mythe d'Énée", en: "Act I · The Myth of Aeneas" })}</span>
                <h2>{tr({ fr: "Territoire & Migration", en: "Territory & Migration" })}</h2>
              </div>
            </div>

            <div className="myth-panel-body">
              <div className="myth-stats-grid">
                <div className="myth-stat is-green">
                  <span>{tr({ fr: "Migrations Effectuées", en: "Migrations Completed" })}</span>
                  <strong className={eneeMigrations >= ENEE_MIGRATIONS_TARGET ? "stat-green" : "stat-text"}>
                    {eneeMigrations} / {ENEE_MIGRATIONS_TARGET}
                  </strong>
                </div>

                <div className={`myth-stat ${eneeDegraded ? "is-red" : ""}`}>
                  <span>{tr({ fr: "Statut du Territoire", en: "Territory Status" })}</span>
                  {eneeDegraded ? (
                    <strong>{tr({ fr: "DÉGRADÉ (Invivable)", en: "DEGRADED (Uninhabitable)" })}</strong>
                  ) : (
                    <>
                      <strong>
                        {Math.floor(eneeRemainingSecs / 60)}m {String(eneeRemainingSecs % 60).padStart(2, '0')}s
                      </strong>
                      <small>{tr({ fr: "Avant dégradation", en: "Until degradation" })}</small>
                    </>
                  )}
                </div>
              </div>

              {eneeDegraded && (
                <div className="myth-alert">
                  ⚠️ {tr({ fr: <><strong>Alerte : Le territoire se dégrade !</strong> Nourriture à 0, Or bloqué, Usure x2. Migrez dès que possible.</>, en: <><strong>Alert: The territory is degrading!</strong> Food at 0, Gold blocked, Wear x2. Migrate as soon as possible.</> })}
                </div>
              )}

              <button
                onClick={migrerEnee}
                disabled={!eneeDegraded}
                className="btn-critical enee-migrate-btn"
                title={eneeDegraded ? tr({ fr: "Détruit tous les bâtiments mais conserve les ressources (Or, Population, Savoir)", en: "Destroys all buildings but keeps the resources (Gold, Population, Knowledge)" }) : tr({ fr: "Le territoire est viable pour le moment.", en: "The territory is viable for now." })}
              >
                {eneeDegraded ? tr({ fr: "MIGRER (Nouveau Territoire)", en: "MIGRATE (New Territory)" }) : tr({ fr: "Territoire viable (Attendre dégradation)", en: "Territory viable (Await degradation)" })}
              </button>
            </div>
          </div>
        )}

            {/* Cartes de statut des mythes & puissance latente */}
            <div className="myths-grid-redesigned">
              {isSisyphe && (
                <div className="myth-status-card sisyphus" title={tr({ fr: "Le mythe de Sisyphe est actif", en: "The myth of Sisyphus is active" })}>
                  <span className="myth-card-icon">🪨</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Sisyphe", en: "Sisyphus" })}</span>
                    <strong id="sisypheMultValue">{tr({ fr: `Production x${fmt(sisypheMult || 1)}`, en: `Production x${fmt(sisypheMult || 1)}` })}</strong>
                  </div>
                </div>
              )}
              {isIcare && (
                <div className="myth-status-card icare" title={tr({ fr: "Le mythe d'Icare est actif", en: "The myth of Icarus is active" })}>
                  <span className="myth-card-icon">🪶</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Icare", en: "Icarus" })}</span>
                    <strong id="icareTimerValue">
                      {icareInfraReached ? tr({ fr: "Soleil touché !", en: "Sun reached!" }) : tr({ fr: `${fmt(infrastructure)} / ${fmt(ICARE_INFRA_TARGET)} Infra`, en: `${fmt(infrastructure)} / ${fmt(ICARE_INFRA_TARGET)} Infra` })}
                    </strong>
                  </div>
                </div>
              )}
              {isBabel && (
                <div className="myth-status-card babel" title={tr({ fr: "Le mythe de Babel est actif", en: "The myth of Babel is active" })}>
                  <span className="myth-card-icon">🏗</span>
                  <div className="myth-card-info">
                    <span>Babel ({tr(BABEL_CAT_LABELS[babelCategory]) || babelCategory || tr({ fr: 'Non choisi', en: 'Not chosen' })})</span>
                    <strong id="babelMultValue">{babelProdReached ? tr({ fr: "Tour achevée !", en: "Tower completed!" }) : tr({ fr: "En construction", en: "Under construction" })}</strong>
                  </div>
                </div>
              )}
              {isOr && (
                <div className="myth-status-card age-or" title={tr({ fr: "Le mythe de l'Âge d'Or est actif", en: "The myth of the Golden Age is active" })}>
                  <span className="myth-card-icon">✦</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Âge d'Or", en: "Golden Age" })} ({orUsureImbalance ? tr({ fr: "Déséquilibré", en: "Imbalanced" }) : tr({ fr: "Équilibré", en: "Balanced" })})</span>
                    <strong>{tr({ fr: `Or: ${fmt(gold)}/${fmt(OR_GOLD_TARGET)} | Pop Peak: ${fmt(orPopPeak)}/${fmt(OR_POP_CAP)}`, en: `Gold: ${fmt(gold)}/${fmt(OR_GOLD_TARGET)} | Pop Peak: ${fmt(orPopPeak)}/${fmt(OR_POP_CAP)}` })}</strong>
                  </div>
                </div>
              )}
              {isPhoenix && (
                <div className="myth-status-card phoenix" title={tr({ fr: "Le mythe du Phénix est actif", en: "The myth of the Phoenix is active" })}>
                  <span className="myth-card-icon">🔥</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Phénix", en: "Phoenix" })}</span>
                    <strong>{tr({ fr: `Renaissances: ${phoenixRenaissances || 0}/${PHENIX_RENAISSANCE_TARGET} | Pop: ${fmt(population)}/${fmt(phoenixRebirthTargetPop)} | Fenêtre: ${phoenixWindowSecs !== null ? `${Math.floor(phoenixWindowSecs / 60)}m${String(phoenixWindowSecs % 60).padStart(2, '0')}s` : '-'}`, en: `Rebirths: ${phoenixRenaissances || 0}/${PHENIX_RENAISSANCE_TARGET} | Pop: ${fmt(population)}/${fmt(phoenixRebirthTargetPop)} | Window: ${phoenixWindowSecs !== null ? `${Math.floor(phoenixWindowSecs / 60)}m${String(phoenixWindowSecs % 60).padStart(2, '0')}s` : '-'}` })}</strong>
                  </div>
                </div>
              )}
              {isHeph && (
                <div className="myth-status-card heph" title={tr({ fr: "Le mythe d'Héphaïstos est actif", en: "The myth of Hephaestus is active" })}>
                  <span className="myth-card-icon">⚙</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Héphaïstos", en: "Hephaestus" })} {hephGoalReached && tr({ fr: " (Pacte accompli !)", en: " (Pact fulfilled!)" })}</span>
                    <strong>{tr({ fr: `Infra: ${fmt(infrastructure)}/${fmt(D(hephPopPeak || 1).max(1).mul(HEPH_INFRA_PER_PEAK))} | ${D(population).lt(hephPopPeak) ? 'Déclin pop' : 'Stable'}`, en: `Infra: ${fmt(infrastructure)}/${fmt(D(hephPopPeak || 1).max(1).mul(HEPH_INFRA_PER_PEAK))} | ${D(population).lt(hephPopPeak) ? 'Pop decline' : 'Stable'}` })}</strong>
                  </div>
                </div>
              )}
              {isAtrides && (
                <div className="myth-status-card atrides" title={tr({ fr: "Le fardeau des Atrides est actif", en: "The burden of the Atreides is active" })}>
                  <span className="myth-card-icon">⚖</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Atrides", en: "Atreides" })}</span>
                    <strong>{tr({ fr: `Dette: ${fmt(atridesDebt)} | Net: ${fmt(netGold)}`, en: `Debt: ${fmt(atridesDebt)} | Net: ${fmt(netGold)}` })}</strong>
                  </div>
                </div>
              )}
              {atridesPactActive && (
                <div className="myth-status-card atrides-pact" title={tr({ fr: "Pacte des Atrides scellé", en: "Atreides Pact sealed" })}>
                  <span className="myth-card-icon">📜</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Pacte Atrides", en: "Atreides Pact" })}</span>
                    <strong>
                      {cycleSeconds < 120
                        ? tr({ fr: "Bonus actif (x2.0)", en: "Bonus active (x2.0)" })
                        : crisisOpen()
                        ? tr({ fr: "Malus actif (x0.5)", en: "Penalty active (x0.5)" })
                        : tr({ fr: "Pacte latent", en: "Pact latent" })}
                    </strong>
                  </div>
                </div>
              )}
              {atridesNextRunPenaltyActive && (
                <div className="myth-status-card atrides-penalty" title={tr({ fr: "Malus de transmission des Atrides actif", en: "Atreides transmission penalty active" })}>
                  <span className="myth-card-icon">⚠️</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Fardeau Atrides", en: "Atreides Burden" })}</span>
                    <strong className="danger-text">{tr({ fr: "Production globale -20%", en: "Global production -20%" })}</strong>
                  </div>
                </div>
              )}
              {isMythEffectActive("mythe_d_enee") && (
                <div className="myth-status-card enee" title={tr({ fr: "Le mythe d'Énée est actif", en: "The myth of Aeneas is active" })}>
                  <span className="myth-card-icon">⛵</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Énée", en: "Aeneas" })}</span>
                    <strong>{tr({ fr: `Migr: ${eneeMigrations}/${ENEE_MIGRATIONS_TARGET} | ${eneeDegraded ? "Invivable !" : `${Math.floor(eneeRemainingSecs / 60)}m ${eneeRemainingSecs % 60}s`}`, en: `Migr: ${eneeMigrations}/${ENEE_MIGRATIONS_TARGET} | ${eneeDegraded ? "Uninhabitable!" : `${Math.floor(eneeRemainingSecs / 60)}m ${eneeRemainingSecs % 60}s`}` })}</strong>
                  </div>
                </div>
              )}
              {eneeHeritage && cycleSeconds < 30 && (
                <div className="myth-status-card enee-heritage" title={tr({ fr: "Bénédiction d'Énée active pour le début du cycle", en: "Aeneas's Blessing active for the start of the cycle" })}>
                  <span className="myth-card-icon">⚖</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Bénédiction Énée", en: "Aeneas's Blessing" })}</span>
                    <strong className="positive-text">{tr({ fr: `Prod globale +${Math.round(Math.min(10, eneeCollapseCount || 0) * 10)}%`, en: `Global prod +${Math.round(Math.min(10, eneeCollapseCount || 0) * 10)}%` })}</strong>
                  </div>
                </div>
              )}
              {hasActiveEpitaphLegacy && (
                <div
                  className="myth-status-card epitaph-legacy"
                  title={`${activeEpitaphDefinition.tagline}\n${epitaphLegacyChips(activeEpitaphDefinition, activeEpitaphLegacy.cause).map((chip) => chip.label).join(" · ")}`}
                >
                  <span className="myth-card-icon">{activeEpitaphDefinition.icon || "📜"}</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: `Legs : ${activeEpitaphDefinition.logLabel}`, en: `Legacy: ${activeEpitaphDefinition.logLabel}` })}</span>
                    <strong>
                      {tr({ fr: `${Math.floor(epitaphRemainingSeconds / 60)}m ${String(epitaphRemainingSeconds % 60).padStart(2, "0")}s restantes`, en: `${Math.floor(epitaphRemainingSeconds / 60)}m ${String(epitaphRemainingSeconds % 60).padStart(2, "0")}s remaining` })}
                    </strong>
                  </div>
                </div>
              )}
              {hasLatent && (
                <div className="myth-status-card latent" id="cityLatentRow" title={tr({ fr: "Bonus de ruines non dépensées", en: "Bonus from unspent ruins" })}>
                  <span className="myth-card-icon">✨</span>
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Puissance Latente", en: "Latent Power" })}</span>
                    <strong id="cityLatentBonus">{tr({ fr: `Bonus global x${fmt(unspentMult)}`, en: `Global bonus x${fmt(unspentMult)}` })}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>{/* /city-aux */}
      </div>
    </section>
  );
}
