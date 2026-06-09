import { useState, useEffect, useCallback } from 'react';
import { useCityViewState } from '../../hooks/useCityViewState.js';
import CityMapCanvas from '../map/CityMapCanvas.jsx';
import BuildingShop from '../ui/BuildingShop.jsx';
import JournalPanel from '../ui/JournalPanel.jsx';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  currentEraIndex,
  nextEraProgress,
  globalMultiplier,
  ruinEffectSum,
  unspentRuinsPowerMultiplier,
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
  rewardCitizenThought,
  log
} from '../../game/core/actions.js';
import { save, setCityName } from '../../game/core/state.js';
import { eras } from '../../game/data/world.js';
import { fmt, roman } from '../../game/core/utils.js';
import {
  ICARE_INFRA_TARGET,
  OR_GOLD_TARGET,
  OR_POP_CAP,
  BABEL_CAT_LABELS,
  PHENIX_CYCLE_COUNT,
  HEPH_INFRA_TARGET,
  ATRIDES_GOAL_NET_GOLD,
  ATRIDES_DEBT_PAYBACK_FACTOR,
  ENEE_MIGRATIONS_TARGET,
  isMythEffectActive
} from '../../game/data/myths.js';
import { EPITAPH_LEGACY_DURATION_MS, epitaphLegacyById } from '../../game/data/epitaphs.js';

export default function CityView() {
  const {
    cityName, population, gold, infrastructure, cycles, dynastyCount,
    bestEraIndex, cycleStartedAt, archaeologyUsed,
    activeMythId, sisypheMult, icareInfraReached, babelProdReached, babelCategory,
    orPopPeak, orUsureImbalance, phoenixCycleCount, phoenixTotalRuins, phoenixNextForceAt,
    hephPopPeak, hephGoalReached,
    atridesDebt, atridesDrainDisabled, atridesDebtGrowthMultiplier,
    atridesRenegotiateActiveUntil, atridesRenegotiateCooldownEnd,
    atridesHeritage, atridesPactActive, atridesNextRunPenaltyActive,
    eneeMigrations, eneeDegraded, eneeTerritoryStartedAt, eneeHeritage, eneeCollapseCount,
    activeEpitaphLegacy,
    food, knowledge, legitimacy, instability, ruins, rationing, prometheeBraisiers, buildingsSig, upgradesSig
  } = useCityViewState();

  const [now, setNow] = useState(() => Date.now());
  const [bubbleMessage, setBubbleMessage] = useState(null);

  const handleCitizenThought = useCallback((citizen, thoughtType) => {
    const quotes = {
      thought: [
        "J'ai vu une ombre étrange dans les bois... Serait-ce un présage du cycle suivant ?",
        "Les anciens bâtissaient avec de l'argile brute. Nous construisons sur leurs débris.",
        "Parfois, j'ai l'impression que le temps tourne en boucle. Quelle idée absurde...",
        "Si notre dynastie tombe, j'espère que les scribes écriront mon nom correctement.",
        "Le pain d'aujourd'hui a un goût de cendres. Est-ce l'usure qui s'installe ?",
        "Nos philosophes affirment que notre cité n'est qu'un grain de sable sur l'Olympe.",
        "Quand le ciel rougeoie le soir, je prie pour que l'effondrement attende l'aube."
      ],
      scroll: [
        "J'ai trouvé ce vieux parchemin sous les ruines d'un temple !",
        "Voici une formule mathématique oubliée du cycle précédent !",
        "Cette tablette d'argile décrit la chute de notre première cité.",
        "Un secret des anciens ingénieurs ! Nos scribes vont adorer.",
        "Un codex cryptique... Son déchiffrement va accélérer nos recherches !"
      ],
      lightning: [
        "Le feu créateur coule dans nos veines ! Travaillons plus vite !",
        "Une idée fulgurante traverse notre corporation ! En avant !",
        "L'énergie de la jeunesse anime nos chantiers aujourd'hui !",
        "Par Héphaïstos ! L'inspiration divine accélère nos tâches !"
      ]
    };
    
    const pool = quotes[thoughtType] || quotes.thought;
    const text = pool[Math.floor(Math.random() * pool.length)];
    
    const rewardText = rewardCitizenThought(thoughtType, citizen);
    
    setBubbleMessage({
      name: citizen.name,
      role: citizen.role,
      text,
      reward: rewardText
    });
    
    // Fermer le message après 4 secondes
    setTimeout(() => {
      setBubbleMessage(current => {
        if (current && current.name === citizen.name && current.text === text) {
          return null;
        }
        return current;
      });
    }, 4000);
  }, []);

  // Update cycle duration timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);

  const globalMult = globalMultiplier();

  const eraIndex = currentEraIndex();
  const era = eras[eraIndex];
  const progress = nextEraProgress(eraIndex);
  const nextEra = eras[eraIndex + 1];

  const unspentPower = ruinEffectSum("unspentRuinsPower");
  const unspentMult = unspentPower > 0 ? unspentRuinsPowerMultiplier() : 1;
  const hasLatent = unspentPower > 0;

  const showExhume = has("skill_archaeology") && !archaeologyUsed;

  const handleNameChange = (e) => {
    setCityName(e.target.value);
  };

  const handleNameBlur = () => {
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
  const phoenixSeconds = phoenixNextForceAt ? Math.max(0, Math.floor((phoenixNextForceAt - now) / 1000)) : null;

  const isAtrides = isMythEffectActive("mythe_atrides");
  const totalProd = Math.max(0, r.food + r.gold + r.knowledge + r.infrastructure);
  const atridesDebtGrowthRate = Math.max(10, totalProd * 0.01) * (atridesDebtGrowthMultiplier || 1);
  const netGold = gold - (atridesDebt || 0);

  const renegocierCooldownSecs = atridesRenegotiateCooldownEnd ? Math.max(0, Math.ceil((atridesRenegotiateCooldownEnd - now) / 1000)) : 0;
  const renegocierActiveSecs = atridesRenegotiateActiveUntil ? Math.max(0, Math.ceil((atridesRenegotiateActiveUntil - now) / 1000)) : 0;
  const isRenegotiationActive = renegocierActiveSecs > 0;
  const isRenegotiationOnCooldown = renegocierCooldownSecs > 0;

  const eneeIntervalMs = 6 * 60_000;
  const eneeElapsedMs = eneeTerritoryStartedAt ? Math.max(0, now - eneeTerritoryStartedAt) : 0;
  const eneeRemainingSecs = Math.max(0, Math.ceil((eneeIntervalMs - eneeElapsedMs) / 1000));

  const showMythsPanel = isSisyphe || isIcare || isBabel || isOr || isPhoenix || isHeph || isAtrides || atridesPactActive || atridesNextRunPenaltyActive || isMythEffectActive("mythe_d_enee") || eneeHeritage || hasLatent || hasActiveEpitaphLegacy;

  return (
    <section className="view active" id="city">
      <div className="city-left-col">
        {eneeHeritage && cycleSeconds < 30 && (
          <div className="enee-boost-banner" style={{
            background: 'rgba(76,201,168,0.15)',
            border: '1px solid var(--green)',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            position: 'relative'
          }}>
            <strong style={{ color: 'var(--green)', fontSize: '1rem' }}>
              ⚖ Bénédiction d'Énée
            </strong>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
              Démarrage rapide : la production globale est augmentée de <strong>+{Math.round(Math.min(10, eneeCollapseCount || 0) * 10)}%</strong> ({30 - cycleSeconds}s restantes).
            </p>
          </div>
        )}
        {atridesHeritage && !activeMythId && cycleSeconds < 120 && (
          <div className="atrides-pact-banner" style={{
            background: atridesPactActive ? 'rgba(201,168,76,0.15)' : 'rgba(201,100,76,0.1)',
            border: '1px solid var(--gold)',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: 'var(--gold)', fontSize: '1rem' }}>
                {atridesPactActive ? "⚖ Pacte des Atrides Scellé" : "📜 Pacte des Atrides Disponible"}
              </strong>
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Temps restant: {120 - cycleSeconds}s</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4' }}>
              {atridesPactActive 
                ? "Vous avez emprunté de la production. Bonus x2 actif pendant les 2 premières minutes, puis malus x0.5 s'appliquera en phase de crise."
                : "Empruntez un bonus de production de x2 pour les 2 premières minutes de ce cycle. En échange, la production sera réduite de 50% pendant la crise finale."}
            </p>
            {!atridesPactActive && (
              <button 
                onClick={activateAtridesPact}
                className="myth-activate-btn"
                style={{
                  alignSelf: 'flex-start',
                  marginTop: '0.5rem',
                  padding: '0.4rem 1rem',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--gold)',
                  color: '#111',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Activer le Pacte
              </button>
            )}
          </div>
        )}

        {/* 1. En-tête de la Cité (Identity & Dynasty stats) */}
        <div className="city-header-panel">
          <div className="city-header-main">
          <div className="city-title-wrapper">
            <span className="city-title-label">Cité de la Dynastie</span>
            <input
              id="cityNameInput"
              className="city-name-input"
              maxLength={42}
              value={cityName}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              aria-label="Nom de la ville"
            />
          </div>
          <div className="city-dynasty-stats" aria-label="Statistiques dynastiques">
            <div className="stat-chip" title="Cycles accomplis">
              <span className="chip-icon">🔄</span>
              <span className="chip-label">Cycles</span>
              <strong id="cycles">{fmt(cycles)}</strong>
            </div>
            <div className="stat-chip" title="Numéro de la dynastie actuelle">
              <span className="chip-icon">👑</span>
              <span className="chip-label">Dynastie</span>
              <strong id="dynastyAge">{roman(dynastyCount + 1)}</strong>
            </div>
            <div className="stat-chip" title="Multiplicateur global de production">
              <span className="chip-icon">⚡</span>
              <span className="chip-label">Multiplicateur</span>
              <strong id="globalMult">x{fmt(globalMult)}</strong>
            </div>
            <div className="stat-chip" title="Meilleure ère atteinte à ce jour">
              <span className="chip-icon">🏆</span>
              <span className="chip-label">Âge Max</span>
              <strong id="bestEra">{eras[bestEraIndex].name}</strong>
            </div>
            <div className="stat-chip" title="Durée du cycle actuel">
              <span className="chip-icon">⏳</span>
              <span className="chip-label">Temps</span>
              <strong id="cycleTime">{cycleSeconds}s</strong>
            </div>
          </div>
          </div>
          <div className="city-inline-era" aria-label="Progression de l'ere de la civilisation">
            <div className="city-inline-era-head">
              <span>Age courant</span>
              <strong>{era.name}</strong>
              <small>{nextEra ? `Prochain: ${nextEra.name}` : "Apogee de l'Histoire"}</small>
            </div>
            <div className="city-inline-era-progress">
              <div className="era-progress-track">
                <span className="era-progress-fill" style={{ width: `${progress * 100}%` }}></span>
              </div>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>
        </div>

        {/* 2. Panneau de progression de l'Ère (Civilization Progress) */}
        <div className="era-progress-panel" aria-label="Progression de l'ère de la civilisation">
          <div className="era-header-row">
            <div className="era-title-block">
              <span className="era-subtitle">Âge Courant</span>
              <h2 className="era-title-name" id="eraName">{era.name}</h2>
            </div>
            <span className="era-next-pointer" id="eraNextName">
              {nextEra ? `Prochain Âge: ${nextEra.name}` : "Apogée de l'Histoire"}
            </span>
          </div>
          
          <div className="era-progress-bar-wrapper">
            <div className="era-progress-track">
              <span id="eraProgress" className="era-progress-fill" style={{ width: `${progress * 100}%` }}></span>
            </div>
            <span className="era-progress-percentage">{Math.round(progress * 100)}%</span>
          </div>
          
          <p className="era-description-text" id="eraText">{era.text}</p>
        </div>

        {/* 3. Diorama Interactif de la Cité (City Canvas) */}
        <div className="city-map-container">
          <div
            className="civilization-map-interactive"
            id="civilizationMap"
            aria-label="Diorama de la cité"
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
        </div>

        {showExhume && (
          <button id="exhumeBtn" className="exhume-btn-redesigned" onClick={exhumeVestige}>
            ⛏ Exhumer un vestige archéologique
          </button>
        )}

        {/* 5. Atrides Debt Panel */}
        {isAtrides && (
          <div className="panel atrides-debt-panel" style={{
            marginTop: '1rem',
            border: '1px solid rgba(220, 50, 50, 0.3)',
            background: 'rgba(20, 10, 10, 0.45)',
            boxShadow: 'inset 0 0 10px rgba(220, 50, 50, 0.15)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            <div className="panel-heading" style={{ borderBottom: '1px solid rgba(220, 50, 50, 0.15)', padding: '1rem' }}>
              <div>
                <span className="label" style={{ color: 'var(--red)' }}>Acte III · Le Fardeau des Atrides</span>
                <h2 style={{ margin: '0.2rem 0 0 0', fontSize: '1.25rem' }}>Tragédie & Dette Active</h2>
              </div>
            </div>
            
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--red)' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Dette Cumulée</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--red)' }}>{fmt(atridesDebt)}</strong>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--orange)' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Taux de Croissance</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--orange)' }}>+{fmt(atridesDebtGrowthRate)} /s</strong>
                  {isRenegotiationActive && (
                    <small style={{ color: 'var(--green)', fontSize: '0.75rem' }}>Renégociation active ({renegocierActiveSecs}s)</small>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--gold)' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Objectif Trésor Net</span>
                  <strong style={{ fontSize: '1.25rem', color: netGold >= ATRIDES_GOAL_NET_GOLD ? 'var(--green)' : 'var(--gold)' }}>
                    {fmt(netGold)} / {fmt(ATRIDES_GOAL_NET_GOLD)}
                  </strong>
                  <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>Trésor moins Dette</small>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', borderLeft: `3px solid ${atridesDrainDisabled ? 'var(--green)' : 'var(--red)'}` }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Drain de Ressources</span>
                  <strong style={{ fontSize: '1.25rem', color: atridesDrainDisabled ? 'var(--green)' : 'var(--red)' }}>
                    {atridesDrainDisabled ? "Désactivé" : "-10%"}
                  </strong>
                  <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    {atridesDrainDisabled ? "Transmission active" : "Va à la Dette"}
                  </small>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                <button
                  onClick={rembourserAtridesDebt}
                  disabled={gold < atridesDebt * ATRIDES_DEBT_PAYBACK_FACTOR || atridesDebt <= 0}
                  className="action-btn"
                  style={{
                    flex: '1 1 120px',
                    padding: '0.6rem',
                    backgroundColor: gold >= atridesDebt * ATRIDES_DEBT_PAYBACK_FACTOR && atridesDebt > 0 ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--gold)',
                    borderRadius: '4px',
                    color: 'var(--gold)',
                    cursor: gold >= atridesDebt * ATRIDES_DEBT_PAYBACK_FACTOR && atridesDebt > 0 ? 'pointer' : 'not-allowed',
                    opacity: gold >= atridesDebt * ATRIDES_DEBT_PAYBACK_FACTOR && atridesDebt > 0 ? 1 : 0.4,
                    fontWeight: 'bold',
                    fontSize: '0.85rem'
                  }}
                  title="Rembourse la dette en payant de l'Or"
                >
                  Rembourser ({fmt(atridesDebt * ATRIDES_DEBT_PAYBACK_FACTOR)} Or)
                </button>

                <button
                  onClick={renegocierAtridesDebt}
                  disabled={isRenegotiationOnCooldown}
                  className="action-btn"
                  style={{
                    flex: '1 1 120px',
                    padding: '0.6rem',
                    backgroundColor: !isRenegotiationOnCooldown ? 'rgba(168,161,78,0.2)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--text)',
                    borderRadius: '4px',
                    cursor: !isRenegotiationOnCooldown ? 'pointer' : 'not-allowed',
                    opacity: !isRenegotiationOnCooldown ? 1 : 0.4,
                    fontWeight: 'bold',
                    fontSize: '0.85rem'
                  }}
                  title="Réduit le taux de croissance de la dette de 70% pour 30s"
                >
                  {isRenegotiationOnCooldown ? `Renégocier (${renegocierCooldownSecs}s)` : "Renégocier (120s CD)"}
                </button>

                <button
                  onClick={transmettreAtrides}
                  disabled={atridesDrainDisabled}
                  className="action-btn"
                  style={{
                    flex: '1 1 120px',
                    padding: '0.6rem',
                    backgroundColor: !atridesDrainDisabled ? 'rgba(220,50,50,0.2)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--red)',
                    borderRadius: '4px',
                    color: 'var(--red)',
                    cursor: !atridesDrainDisabled ? 'pointer' : 'not-allowed',
                    opacity: !atridesDrainDisabled ? 1 : 0.4,
                    fontWeight: 'bold',
                    fontSize: '0.85rem'
                  }}
                  title="Désactive le drain, gains de ruines x1.5, mais malus de production de 20% au cycle suivant"
                >
                  {atridesDrainDisabled ? "Transmis" : "Transmettre (Ruines x1.5)"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. Enee Panel */}
        {isMythEffectActive("mythe_d_enee") && (
          <div className="panel enee-panel" style={{
            marginTop: '1rem',
            border: eneeDegraded ? '1px solid rgba(220, 50, 50, 0.5)' : '1px solid rgba(76, 201, 168, 0.3)',
            background: eneeDegraded ? 'rgba(30, 10, 10, 0.45)' : 'rgba(10, 25, 20, 0.45)',
            boxShadow: eneeDegraded ? 'inset 0 0 10px rgba(220, 50, 50, 0.2)' : 'inset 0 0 10px rgba(76, 201, 168, 0.1)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            <div className="panel-heading" style={{ 
              borderBottom: eneeDegraded ? '1px solid rgba(220, 50, 50, 0.2)' : '1px solid rgba(76, 201, 168, 0.15)', 
              padding: '1rem' 
            }}>
              <div>
                <span className="label" style={{ color: eneeDegraded ? 'var(--red)' : 'var(--green)' }}>Acte I · Le Mythe d'Énée</span>
                <h2 style={{ margin: '0.2rem 0 0 0', fontSize: '1.25rem' }}>Territoire & Migration</h2>
              </div>
            </div>
            
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--green)' }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Migrations Effectuées</span>
                  <strong style={{ fontSize: '1.25rem', color: eneeMigrations >= ENEE_MIGRATIONS_TARGET ? 'var(--green)' : 'var(--text)' }}>
                    {eneeMigrations} / {ENEE_MIGRATIONS_TARGET}
                  </strong>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', borderLeft: `3px solid ${eneeDegraded ? 'var(--red)' : 'var(--gold)'}` }}>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Statut du Territoire</span>
                  {eneeDegraded ? (
                    <strong style={{ fontSize: '1.1rem', color: 'var(--red)' }}>DÉGRADÉ (Invivable)</strong>
                  ) : (
                    <>
                      <strong style={{ fontSize: '1.25rem', color: 'var(--gold)' }}>
                        {Math.floor(eneeRemainingSecs / 60)}m {String(eneeRemainingSecs % 60).padStart(2, '0')}s
                      </strong>
                      <small style={{ fontSize: '0.75rem', opacity: 0.7 }}>Avant dégradation</small>
                    </>
                  )}
                </div>
              </div>

              {eneeDegraded && (
                <div style={{ 
                  backgroundColor: 'rgba(220, 50, 50, 0.1)', 
                  border: '1px solid rgba(220, 50, 50, 0.3)', 
                  borderRadius: '4px', 
                  padding: '0.75rem', 
                  fontSize: '0.85rem', 
                  color: 'var(--red)',
                  lineHeight: '1.4'
                }}>
                  ⚠️ <strong>Alerte : Le territoire se dégrade !</strong> Nourriture à 0, Or bloqué, Usure x2. Migrez dès que possible.
                </div>
              )}

              <button
                onClick={migrerEnee}
                disabled={!eneeDegraded}
                className="action-btn"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: eneeDegraded ? 'var(--red)' : 'rgba(255, 255, 255, 0.05)',
                  border: eneeDegraded ? '1px solid var(--red)' : '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '4px',
                  color: eneeDegraded ? '#fff' : 'var(--text-dim)',
                  cursor: eneeDegraded ? 'pointer' : 'not-allowed',
                  opacity: eneeDegraded ? 1 : 0.6,
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s',
                  boxShadow: eneeDegraded ? '0 0 10px rgba(220, 50, 50, 0.3)' : 'none'
                }}
                title={eneeDegraded ? "Détruit tous les bâtiments mais conserve les ressources (Or, Population, Savoir)" : "Le territoire est viable pour le moment."}
              >
                {eneeDegraded ? "MIGRER (Nouveau Territoire)" : "Territoire viable (Attendre dégradation)"}
              </button>
            </div>
          </div>
        )}

        {/* 7. Panneau des défis mythologiques et puissance latente */}
        {showMythsPanel && (
          <div className="active-myths-panel">
            <div className="panel-heading-myths">
              <span>📜 Mythes Actifs & Bénédictions de Cycle</span>
            </div>
            <div className="myths-grid-redesigned">
              {isSisyphe && (
                <div className="myth-status-card sisyphus" title="Le mythe de Sisyphe est actif">
                  <span className="myth-card-icon">🪨</span>
                  <div className="myth-card-info">
                    <span>Sisyphe</span>
                    <strong id="sisypheMultValue">Production x{fmt(sisypheMult || 1)}</strong>
                  </div>
                </div>
              )}
              {isIcare && (
                <div className="myth-status-card icare" title="Le mythe d'Icare est actif">
                  <span className="myth-card-icon">🪶</span>
                  <div className="myth-card-info">
                    <span>Icare</span>
                    <strong id="icareTimerValue">
                      {icareInfraReached ? "Soleil touché !" : `${fmt(infrastructure)} / ${fmt(ICARE_INFRA_TARGET)} Infra`}
                    </strong>
                  </div>
                </div>
              )}
              {isBabel && (
                <div className="myth-status-card babel" title="Le mythe de Babel est actif">
                  <span className="myth-card-icon">🏗</span>
                  <div className="myth-card-info">
                    <span>Babel ({BABEL_CAT_LABELS[babelCategory] || babelCategory || 'Non choisi'})</span>
                    <strong id="babelMultValue">{babelProdReached ? "Tour achevée !" : "En construction"}</strong>
                  </div>
                </div>
              )}
              {isOr && (
                <div className="myth-status-card age-or" title="Le mythe de l'Âge d'Or est actif">
                  <span className="myth-card-icon">✦</span>
                  <div className="myth-card-info">
                    <span>Âge d'Or ({orUsureImbalance ? "Déséquilibré" : "Équilibré"})</span>
                    <strong>Or: {fmt(gold)}/{fmt(OR_GOLD_TARGET)} | Pop Peak: {fmt(orPopPeak)}/{fmt(OR_POP_CAP)}</strong>
                  </div>
                </div>
              )}
              {isPhoenix && (
                <div className="myth-status-card phoenix" title="Le mythe du Phénix est actif">
                  <span className="myth-card-icon">🔥</span>
                  <div className="myth-card-info">
                    <span>Phénix</span>
                    <strong>Cycle: {phoenixCycleCount}/{PHENIX_CYCLE_COUNT} | Ruines: {fmt(phoenixTotalRuins)} | Prox: {phoenixSeconds !== null ? `${phoenixSeconds}s` : '-'}</strong>
                  </div>
                </div>
              )}
              {isHeph && (
                <div className="myth-status-card heph" title="Le mythe d'Héphaïstos est actif">
                  <span className="myth-card-icon">⚙</span>
                  <div className="myth-card-info">
                    <span>Héphaïstos {hephGoalReached && " (Pacte accompli !)"}</span>
                    <strong>Infra: {fmt(infrastructure)}/{fmt(HEPH_INFRA_TARGET)} | {population < hephPopPeak ? 'Déclin pop' : 'Stable'}</strong>
                  </div>
                </div>
              )}
              {isAtrides && (
                <div className="myth-status-card atrides" title="Le fardeau des Atrides est actif">
                  <span className="myth-card-icon">⚖</span>
                  <div className="myth-card-info">
                    <span>Atrides</span>
                    <strong>Dette: {fmt(atridesDebt)} | Net: {fmt(netGold)}</strong>
                  </div>
                </div>
              )}
              {atridesPactActive && (
                <div className="myth-status-card atrides-pact" title="Pacte des Atrides scellé">
                  <span className="myth-card-icon">📜</span>
                  <div className="myth-card-info">
                    <span>Pacte Atrides</span>
                    <strong>
                      {cycleSeconds < 120 
                        ? "Bonus actif (x2.0)" 
                        : crisisOpen() 
                        ? "Malus actif (x0.5)" 
                        : "Pacte latent"}
                    </strong>
                  </div>
                </div>
              )}
              {atridesNextRunPenaltyActive && (
                <div className="myth-status-card atrides-penalty" title="Malus de transmission des Atrides actif">
                  <span className="myth-card-icon">⚠️</span>
                  <div className="myth-card-info">
                    <span>Fardeau Atrides</span>
                    <strong className="danger-text">Production globale -20%</strong>
                  </div>
                </div>
              )}
              {isMythEffectActive("mythe_d_enee") && (
                <div className="myth-status-card enee" title="Le mythe d'Énée est actif">
                  <span className="myth-card-icon">⛵</span>
                  <div className="myth-card-info">
                    <span>Énée</span>
                    <strong>Migr: {eneeMigrations}/{ENEE_MIGRATIONS_TARGET} | {eneeDegraded ? "Invivable !" : `${Math.floor(eneeRemainingSecs / 60)}m ${eneeRemainingSecs % 60}s`}</strong>
                  </div>
                </div>
              )}
              {eneeHeritage && cycleSeconds < 30 && (
                <div className="myth-status-card enee-heritage" title="Bénédiction d'Énée active pour le début du cycle">
                  <span className="myth-card-icon">⚖</span>
                  <div className="myth-card-info">
                    <span>Bénédiction Énée</span>
                    <strong className="positive-text">Prod globale +{Math.round(Math.min(10, eneeCollapseCount || 0) * 10)}%</strong>
                  </div>
                </div>
              )}
              {hasActiveEpitaphLegacy && (
                <div className="myth-status-card epitaph-legacy" title={activeEpitaphDefinition.detail}>
                  <span className="myth-card-icon">📜</span>
                  <div className="myth-card-info">
                    <span>Legs d'épitaphe</span>
                    <strong>{activeEpitaphDefinition.logLabel} · {Math.ceil(epitaphRemainingSeconds / 60)}m</strong>
                  </div>
                </div>
              )}
              {hasLatent && (
                <div className="myth-status-card latent" id="cityLatentRow" title="Bonus de ruines non dépensées">
                  <span className="myth-card-icon">✨</span>
                  <div className="myth-card-info">
                    <span>Puissance Latente</span>
                    <strong id="cityLatentBonus">Bonus global x{fmt(unspentMult)}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Colonne latérale droite (Bâtiments et Achats) */}
      <div className="city-right-col">
        <JournalPanel />
        <BuildingShop />
      </div>
    </section>
  );
}
