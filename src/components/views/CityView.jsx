import { useState, useCallback, useRef, useEffect } from 'react';
import { useCityViewState } from '../../hooks/useCityViewState.js';
import { useGameState } from '../../hooks/useGameState.js';
import CityMapCanvas from '../map/CityMapCanvas.jsx';
import BuildingShop from '../ui/BuildingShop.jsx';
import ChronicleTicker from '../ui/ChronicleTicker.jsx';
import CrisisActionBar from '../ui/CrisisActionBar.jsx';
import HudPanel from '../ui/HudPanel.jsx';
import PixelIcon from '../ui/PixelIcon.jsx';
import {
  cityVitals,
  pressureBreakdown,
  rates,
  ruinEffectSum,
  unspentRuinsPowerMultiplier,
  ruinGain,
  has,
  crisisOpen,
  epitaphLegacyDurationMs,
  exhumeChargesPerCycle
} from '../../game/core/mechanics.js';
import {
  exhumeVestige,
  icareClimb,
  icareDescend,
  atlasEpauler,
  sisyphePousser,
  babelDeclareTongue,
  babelToggleAutoTongue,
  ragnarokOffrir,
  ragnarokOfferingCost,
  negotiateOrDeal,
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
  ICARE_ALTITUDE_TARGET,
  ICARE_CLIMB_PROD_MULT,
  OR_DEALS_TARGET,
  ATLAS_SHOULDER_TARGET,
  ATLAS_COUNT_THRESHOLD,
  SISYPHE_CRANS,
  SISYPHE_MONTEES_TARGET,
  SISYPHE_STEP_BASE,
  BABEL_CAT_LABELS,
  BABEL_TOWER_TARGET,
  BABEL_COMMON_TONGUE_MULT,
  babelTowerCount,
  PHENIX_RENAISSANCE_TARGET,
  PHENIX_REBIRTH_WINDOW_MS,
  HEPH_INFRA_PER_PEAK,
  ATRIDES_GAIN_SECONDS,
  ATRIDES_DEBT_PAYBACK_FACTOR,
  ENEE_MIGRATIONS_TARGET,
  ENEE_TERRITORY_INTERVAL_MS,
  PROMETHEE_POP_TARGET,
  PROMETHEE_FATAL_RUPTURE,
  CHAOS_RAW_RUIN_TARGET,
  RAGNAROK_ID,
  RAGNAROK_ARK_TARGET,
  RAGNAROK_ARK_COOLDOWN_MS,
  RAGNAROK_WINTER_AT_MS,
  RAGNAROK_WOLF_AT_MS,
  RAGNAROK_FIRE_AT_MS,
  RAGNAROK_DURATION_MS,
  isMythEffectActive
} from '../../game/data/myths.js';
import { epitaphLegacyById, epitaphLegacyChips } from '../../game/data/epitaphs.js';
import { CHRONICLE_VISIBLE_MS } from '../../game/core/chronicleEvaluator.js';

export default function CityView() {
  const {
    cityName, population, food, gold, knowledge, infrastructure,
    cycleStartedAt, archaeologyUses,
    activeMythId, icareAltitude, icareHeritage, mythStartGold, babelCategory, babelHeritage, babelCommonTongue, babelAutoTongue,
    ragnarokArkOfferings, ragnarokArkNextAt,
    sisypheCran, sisypheMontees, sisypheUsesFood, sisypheUsesKnowledge, sisypheUsesInfra,
    orDealsClosed, orUsureImbalance, phoenixRenaissances, phoenixRebirthTargetPop,
    hephPopPeak, hephGoalReached,
    atridesDebt, atridesReached, atridesDrainDisabled, atridesDebtGrowthMultiplier,
    atridesRenegotiateActiveUntil, atridesRenegotiateCooldownEnd,
    atridesHeritage, atridesPactActive, atridesNextRunPenaltyActive,
    eneeMigrations, eneeDegraded, eneeTerritoryStartedAt, eneeHeritage, eneeCollapseCount,
    activeEpitaphLegacy,
    prometheePopReached, prometheeFailed,
    atlasHeritage, atlasSkipUsed, atlasFardeau, atlasEpaules, atlasCrushed, atlasShoulderCdEnd,
    instability,
    tickNow
  } = useCityViewState();

  // Horloge du tick (1 Hz) : évite un timer local qui doublerait les rendus.
  const now = tickNow;
  const [bubbleMessage, setBubbleMessage] = useState(null);
  // Timer de la bulle de pensée : tracé en ref pour être nettoyé au démontage
  // (la vie/effondrement démonte fréquemment CityView → pas de timer orphelin).
  const bubbleTimerRef = useRef(null);
  // N° de message : key du chip (re-monte → l'anim CSS rejoue) et cible du
  // timer de fermeture (un nouveau message annule la fermeture de l'ancien).
  const bubbleIdRef = useRef(0);
  useEffect(() => () => clearTimeout(bubbleTimerRef.current), []);

  // Recadrage du rail gauche (retour Raph 2026-07-13) : l'encart identité a une
  // hauteur VARIABLE (nom long, sous-titre de crise, jauge) — le dock et ses
  // popovers se calent sous son bord RÉEL, sinon ils le chevauchent. Recalé
  // après CHAQUE rendu (la vue re-rend à 1 Hz via tickNow ; deux mesures de
  // rect, coût négligeable) — un observer se périmerait si React recrée le
  // nœud. Le `top` fixe du CSS ne sert que de repli avant la première mesure.
  const stageHudRef = useRef(null);
  const cityAuxRef = useRef(null);
  useEffect(() => {
    const hud = stageHudRef.current;
    const aux = cityAuxRef.current;
    const parent = aux?.offsetParent;
    if (!hud || !aux || !parent) return;
    const top = hud.getBoundingClientRect().bottom - parent.getBoundingClientRect().top;
    aux.style.top = `${Math.round(top + 12)}px`;
  });
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
    // Paroles d'habitant, dans le ton du jeu (phrases courtes, concrètes,
    // sans emphase). Chaque famille colle à la ressource que le clic rapporte :
    // pensée → nourriture, parchemin → savoir, éclair → or.
    const quotes = {
      thought: [
        { fr: "Le pain est encore chaud. Un jour de plus, c'est déjà beaucoup.", en: "The bread is still warm. One more day is already a lot." },
        { fr: "Mon grand-père disait que la cité finit toujours par tomber. Je sème quand même.", en: "My grandfather said the city always falls in the end. I sow anyway." },
        { fr: "Les entrepôts sentent le grain sec. Bon présage pour l'hiver.", en: "The warehouses smell of dry grain. A good omen for winter." },
        { fr: "J'ai gardé une part pour les miens et une pour la cité.", en: "I kept one share for my kin and one for the city." },
        { fr: "Les champs ont bien donné cette saison.", en: "The fields yielded well this season." }
      ],
      scroll: [
        { fr: "Un parchemin sous les ruines du temple. L'encre tient encore.", en: "A parchment beneath the temple ruins. The ink still holds." },
        { fr: "Cette tablette raconte la chute de la première cité.", en: "This tablet tells of the first city's fall." },
        { fr: "Une formule d'un cycle passé. Nos bâtisseurs sauront quoi en faire.", en: "A formula from a past cycle. Our builders will know what to do with it." },
        { fr: "Les scribes vont veiller tard ce soir.", en: "The scribes will be up late tonight." },
        { fr: "Les anciens notaient tout. Cela nous sert encore.", en: "The ancients wrote everything down. It still serves us." }
      ],
      lightning: [
        { fr: "Les ateliers tournent bien aujourd'hui. Le trésor s'en souviendra.", en: "The workshops run well today. The treasury will remember it." },
        { fr: "Une bonne affaire au marché. La cité y gagne aussi.", en: "A good deal at the market. The city gains as well." },
        { fr: "La forge n'a pas désempli de la journée.", en: "The forge was busy all day long." },
        { fr: "Un marchand de passage a payé sans marchander. Jour faste.", en: "A passing merchant paid without haggling. A favorable day." },
        { fr: "Les caisses de la guilde sonnent plein. Une part revient à la cité.", en: "The guild's coffers ring full. A share goes to the city." }
      ]
    };

    const pool = quotes[thoughtType] || quotes.thought;
    const text = tr(pool[Math.floor(Math.random() * pool.length)]);

    const rewardText = rewardCitizenThought(thoughtType, citizen);

    const id = ++bubbleIdRef.current;
    setBubbleMessage({ id, name: citizen.name, text, reward: rewardText });

    // Fermeture après 9 s, SYNCHRONE avec l'animation CSS bubbleAnnounce
    // (views-city.css) qui fond le chip juste avant le retrait du nœud.
    clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      setBubbleMessage(current => (current && current.id === id ? null : current));
    }, 9000);
  }, []);

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);

  const unspentPower = ruinEffectSum("unspentRuinsPower");
  const unspentMult = unspentPower > 0 ? unspentRuinsPowerMultiplier() : 1;
  const hasLatent = unspentPower > 0;

  const showExhume = has("skill_archaeology") && (archaeologyUses || 0) < exhumeChargesPerCycle();

  const handleNameChange = (e) => {
    setCityName(e.target.value);
  };

  const handleNameBlur = () => {
    commitCityName();
    save();
  };

  // formatting for special myths
  const isPromethee = isMythEffectActive("mythe_de_promethee");

  const isSisyphe = isMythEffectActive("mythe_de_sisyphe");
  const isIcare = isMythEffectActive("mythe_d_icare");
  // Carte de vol : pendant le Mythe, ou dès que l'Aile (héritage) est acquise.
  const showVol = isIcare || Boolean(icareHeritage);
  const isBabel = isMythEffectActive("mythe_de_babel");
  // Carte Babel : pendant le Mythe (la tour), ou en héritage (la Langue commune).
  const showBabel = isBabel || Boolean(babelHeritage);
  const isChaos = isMythEffectActive("mythe_du_chaos");
  const isRagnarok = isMythEffectActive(RAGNAROK_ID);
  // « L'Hiver Fimbul » : la prochaine échéance de la prophétie, pour le compte à
  // rebours de la carte (l'âge se lit sur l'horloge du tick, comme le reste).
  const ragnarokEcheances = [
    [RAGNAROK_WINTER_AT_MS, tr({ fr: "l'Hiver", en: "the Winter" })],
    [RAGNAROK_WOLF_AT_MS, tr({ fr: "le Loup", en: "the Wolf" })],
    [RAGNAROK_FIRE_AT_MS, tr({ fr: "le Feu", en: "the Fire" })],
    [RAGNAROK_DURATION_MS, tr({ fr: "la Fin", en: "the End" })]
  ];
  const ragnarokAgeMs = isRagnarok ? Math.max(0, now - (cycleStartedAt || now)) : 0;
  const ragnarokNext = ragnarokEcheances.find(([at]) => ragnarokAgeMs < at) || null;
  const ragnarokCompteARebours = ragnarokNext
    ? `${Math.floor((ragnarokNext[0] - ragnarokAgeMs) / 60_000)}:${String(Math.floor(((ragnarokNext[0] - ragnarokAgeMs) % 60_000) / 1000)).padStart(2, "0")}`
    : null;
  // Prix VIVANT de l'offrande (secondes de prod courante, cliqueté à la hausse) —
  // recalculé au rythme du re-render 1 Hz, comme les taux du Comptoir.
  const ragnarokLot = isRagnarok ? ragnarokOfferingCost() : null;
  const ragnarokCdLeft = Math.max(0, Math.ceil(((ragnarokArkNextAt || 0) - now) / 1000));
  const ragnarokPayable = Boolean(ragnarokLot) && ragnarokCdLeft <= 0 &&
    D(food || 0).gte(ragnarokLot.food) && D(gold || 0).gte(ragnarokLot.gold) &&
    D(knowledge || 0).gte(ragnarokLot.knowledge) && D(infrastructure || 0).gte(ragnarokLot.infrastructure);
  const isOr = isMythEffectActive("mythe_age_or");
  const isPhoenix = isMythEffectActive("mythe_du_phenix");
  const isHeph = isMythEffectActive("mythe_d_hephaistos");
  const cycleSeconds = Math.floor((now - (cycleStartedAt || now)) / 1000);
  const activeEpitaphDefinition = activeEpitaphLegacy ? epitaphLegacyById(activeEpitaphLegacy.id) : null;
  const epitaphRemainingSeconds = activeEpitaphLegacy
    ? Math.max(0, Math.ceil((epitaphLegacyDurationMs() - (now - (activeEpitaphLegacy.startedAt || cycleStartedAt || now))) / 1000))
    : 0;
  const hasActiveEpitaphLegacy = Boolean(activeEpitaphDefinition && epitaphRemainingSeconds > 0);
  const phoenixWindowSecs = isPhoenix
    ? Math.max(0, Math.ceil(((cycleStartedAt || now) + PHENIX_REBIRTH_WINDOW_MS - now) / 1000))
    : null;

  // Atlas — « le poids du ciel » : pendant le Mythe, la course aux 12 épaulées ;
  // avec l'héritage (l'Épaule), le même bouton monte la Légitimité en cycle normal.
  const isAtlas = isMythEffectActive("mythe_d_atlas");
  const showEpaule = isAtlas || Boolean(atlasHeritage);
  const atlasCdLeft = Math.max(0, Math.ceil(((atlasShoulderCdEnd || 0) - now) / 1000));

  const isAtrides = isMythEffectActive("mythe_atrides");
  const totalProd = Math.max(0, toNum(r.food.add(r.gold).add(r.knowledge).add(r.infrastructure)));
  const atridesDebtGrowthRate = Math.max(10, totalProd * 0.01) * (atridesDebtGrowthMultiplier || 1);
  const netGold = D(gold).sub(atridesDebt || 0);
  // Progression RELATIVE des mythes à objectif « N s de production » : on affiche
  // exactement ce que mythTicks.js mesure pour la réussite (ressource gagnée ce
  // cycle ÷ taux courant → « X s / N s »), et non un seuil absolu. Les flags
  // *Reached (source de vérité) figent l'état « atteint ».
  const goldRate = Math.max(0, toNum(r.gold));
  const secOfProd = (gained, rate) => (rate > 0 ? Math.max(0, Math.floor(toNum(gained) / rate)) : 0);
  const atridesGainSec = secOfProd(netGold.sub(mythStartGold || 0), goldRate);
  const atridesRepayCost = (atridesDebt || 0) * ATRIDES_DEBT_PAYBACK_FACTOR;
  const canRepayAtrides = D(gold).gte(atridesRepayCost) && (atridesDebt || 0) > 0;

  const renegocierCooldownSecs = atridesRenegotiateCooldownEnd ? Math.max(0, Math.ceil((atridesRenegotiateCooldownEnd - now) / 1000)) : 0;
  const renegocierActiveSecs = atridesRenegotiateActiveUntil ? Math.max(0, Math.ceil((atridesRenegotiateActiveUntil - now) / 1000)) : 0;
  const isRenegotiationActive = renegocierActiveSecs > 0;
  const isRenegotiationOnCooldown = renegocierCooldownSecs > 0;

  const eneeIntervalMs = ENEE_TERRITORY_INTERVAL_MS;
  const eneeElapsedMs = eneeTerritoryStartedAt ? Math.max(0, now - eneeTerritoryStartedAt) : 0;
  const eneeRemainingSecs = Math.max(0, Math.ceil((eneeIntervalMs - eneeElapsedMs) / 1000));

  const showMythsPanel = isPromethee || isSisyphe || showVol || showBabel || isChaos || isRagnarok || isOr || showEpaule || isPhoenix || isHeph || isAtrides || atridesPactActive || atridesNextRunPenaltyActive || isMythEffectActive("mythe_d_enee") || eneeHeritage || hasLatent || hasActiveEpitaphLegacy;

  // Pastille de la chronique : dépêche encore dans sa fenêtre d'affichage.
  const chronicleVisible = Boolean(latestChronicle && now - (latestChronicle.publishedAt || 0) < CHRONICLE_VISIBLE_MS);
  const chronicleNew = Boolean(latestChronicle?.isNew);
  // Badge du dock Mythes : nombre de cartes de statut actuellement actives.
  const mythCount = [
    isPromethee, showEpaule,
    isSisyphe, isIcare || ((icareAltitude || 0) > 0), showBabel, isChaos, isRagnarok, isOr, isPhoenix, isHeph, isAtrides,
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
          <div className="city-stage-hud" ref={stageHudRef}>
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
                aria-label={tr({ fr: `Pression civilisationnelle : ${pctValue}%, ${tr(tier.label)}`, en: `Civilizational pressure: ${pctValue}%, ${tr(tier.label)}` })}
              >
                <div className="sg-meta">
                  <span className="sg-label">{tr(tier.label)}</span>
                  <span className="sg-collapse-gain" title={tr({ fr: "Ruines obtenues si la cité s'effondrait maintenant. Tenir plus longtemps et chuter plus profond rapporte davantage.", en: "Ruins gained if the city collapsed right now. Holding out longer and falling deeper yields more." })}>+{fmt(projectedRuin)}</span>
                  <span className="sg-pct" id="rupturePanelValue">{pctValue}%</span>
                </div>
                <div className="sg-track">
                  {[25, 50, 75, 90].map((t) => (
                    <span key={t} className="sg-tick" style={{ left: `${t}%` }} aria-hidden="true"></span>
                  ))}
                  <span className="sg-fill" style={{ width: `${lvl * 100}%` }}></span>
                  <span className="sg-target-ghost" style={{ left: `${targetLvl * 100}%` }} title={tr({ fr: `Cible : ${Math.round(targetLvl * 100)} %. La jauge dérive vers ce niveau.`, en: `Target: ${Math.round(targetLvl * 100)}%. The gauge drifts toward this level.` })}></span>
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

          {/* Bonus de bulle cliquée : annonce CENTRÉE en haut du monde, ancrée
              sur .city-stage (sous la barre de ressources, loin de la jauge de
              régulation du bas). key = n° de message → le chip est re-monté à
              chaque clic et son animation d'entrée rejoue. */}
          {bubbleMessage && (
            <div className="map-bubble-alert" key={bubbleMessage.id}>
              <span className="bubble-alert-name">{bubbleMessage.name}</span>
              <span className="bubble-alert-text">"{bubbleMessage.text}"</span>
              {bubbleMessage.reward && <span className="bubble-alert-reward">{bubbleMessage.reward}</span>}
            </div>
          )}

          {/* La carte interactive : le monde occupe tout le cadre */}
          <div className="city-map-container">
          <div
            className="civilization-map-interactive"
            id="civilizationMap"
            aria-label={tr({ fr: "Diorama de la cité", en: "City diorama" })}
          >
            <CityMapCanvas onCitizenThoughtClicked={handleCitizenThought} />
          </div>
          </div>{/* /city-map-container */}

          {/* Boutique dockée : le menu de construction posé sur le bord droit du monde */}
          <aside className="city-shop-dock" aria-label={tr({ fr: "Construction", en: "Construction" })}>
            <BuildingShop />
          </aside>
        </div>{/* /city-stage */}

        {/* Régulation des tensions + politiques : encart pliable, sous la carte */}
        <HudPanel className="city-controls-panel" storageKey="regul" title={tr({ fr: "Régulation des tensions", en: "Tension Regulation" })}>
          <CrisisActionBar />
        </HudPanel>

        {/* Rail gauche : dock d'icônes + popovers (chronique / exhume / mythes) */}
        <div className="city-aux" ref={cityAuxRef}>
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
                  <strong className={atridesReached ? "stat-green" : "stat-gold"}>
                    {atridesReached ? tr({ fr: "Malédiction conjurée !", en: "Curse lifted!" }) : `${atridesGainSec}s / ${ATRIDES_GAIN_SECONDS}s`}
                  </strong>
                  <small>{tr({ fr: "Trésor net gagné ce cycle (en s de production d'Or)", en: "Net treasury gained this cycle (in s of Gold output)" })}</small>
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
              {/* Ragnarok — « l'Hiver Fimbul » : l'Arche à achever avant la Fin,
                  avec le compte à rebours de la prochaine échéance de la prophétie.
                  OFFRIR paie le lot figé à l'activation (title du bouton). */}
              {/* ⚠ Icône PLACEHOLDER (myths/pacte) : pas de myths/ragnarok.png — à générer. */}
              {isRagnarok && (
                <div className="myth-status-card ragnarok" title={tr({
                  fr: `Achever l'Arche (${RAGNAROK_ARK_TARGET} offrandes) avant la Fin. La prophétie : l'Hiver à 8 min (production ÷2), le Loup à 14 min (dévore les bâtiments), le Feu à 20 min (Rupture inexorable), la Fin à ${RAGNAROK_DURATION_MS / 60_000} min.`,
                  en: `Complete the Ark (${RAGNAROK_ARK_TARGET} offerings) before the End. The prophecy: the Winter at 8 min (production ÷2), the Wolf at 14 min (devours buildings), the Fire at 20 min (relentless Rupture), the End at ${RAGNAROK_DURATION_MS / 60_000} min.`
                })}>
                  <PixelIcon name="myths/pacte" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Ragnarok", en: "Ragnarok" })}</span>
                    <strong className={ragnarokAgeMs >= RAGNAROK_WOLF_AT_MS ? "danger-text" : undefined}>
                      {tr({
                        fr: `Arche ${ragnarokArkOfferings || 0}/${RAGNAROK_ARK_TARGET}${ragnarokNext ? ` · ${ragnarokNext[1]} dans ${ragnarokCompteARebours}` : ""}`,
                        en: `Ark ${ragnarokArkOfferings || 0}/${RAGNAROK_ARK_TARGET}${ragnarokNext ? ` · ${ragnarokNext[1]} in ${ragnarokCompteARebours}` : ""}`
                      })}
                    </strong>
                    <div className="myth-card-actions">
                      <button type="button" className={ragnarokPayable ? "btn-primary" : "btn-secondary"}
                        onClick={ragnarokOffrir} disabled={!ragnarokPayable}
                        title={ragnarokLot
                          ? tr({
                              fr: `Verser une offrande : ${fmt(ragnarokLot.food)} Nourriture + ${fmt(ragnarokLot.gold)} Trésor + ${fmt(ragnarokLot.knowledge)} Savoir + ${fmt(ragnarokLot.infrastructure)} Infrastructure. Le prix a été scellé au pacte, à la mesure de la cité d'avant ; l'Arche n'accepte qu'une offrande toutes les ${Math.round(RAGNAROK_ARK_COOLDOWN_MS / 1000)} s.`,
                              en: `Pour an offering: ${fmt(ragnarokLot.food)} Food + ${fmt(ragnarokLot.gold)} Treasury + ${fmt(ragnarokLot.knowledge)} Knowledge + ${fmt(ragnarokLot.infrastructure)} Infrastructure. The price was sealed at the pact, to the measure of the city that was; the Ark accepts one offering every ${Math.round(RAGNAROK_ARK_COOLDOWN_MS / 1000)}s.`
                            })
                          : undefined}>
                        {ragnarokCdLeft > 0 ? tr({ fr: `Offrir (${ragnarokCdLeft}s)`, en: `Offer (${ragnarokCdLeft}s)` }) : tr({ fr: "Offrir", en: "Offer" })}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Chaos — cycle sans aucun bonus de méta : la carte suit la moisson
                  de Ruines BRUTES projetée (ruinGain(true), déjà « brut » puisque le
                  Mythe neutralise les bonus). Sacré en direct dès la cible en vue. */}
              {/* ⚠ Icône PLACEHOLDER (myths/pacte) : pas de myths/chaos.png — à générer. */}
              {isChaos && (
                <div className="myth-status-card chaos" title={tr({
                  fr: `Gagner ${CHAOS_RAW_RUIN_TARGET} Ruines brutes en un seul cycle, tous les bonus de méta-progression coupés.`,
                  en: `Earn ${CHAOS_RAW_RUIN_TARGET} raw Ruins in a single cycle, with every meta-progression bonus cut off.`
                })}>
                  <PixelIcon name="myths/pacte" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Chaos", en: "Chaos" })}</span>
                    <strong>
                      {tr({
                        fr: `Ruines brutes ${Math.min(CHAOS_RAW_RUIN_TARGET, Math.floor(toNum(ruinGain(true))))}/${CHAOS_RAW_RUIN_TARGET}`,
                        en: `Raw Ruins ${Math.min(CHAOS_RAW_RUIN_TARGET, Math.floor(toNum(ruinGain(true))))}/${CHAOS_RAW_RUIN_TARGET}`
                      })}
                    </strong>
                  </div>
                </div>
              )}
              {/* Prométhée — règle de lisibilité des défis : cible en chiffre FIXE,
                  progression vivante, état (en course / accompli / échoué). L'échec
                  n'existait avant que dans une ligne de log.
                  ⚠ Icône PLACEHOLDER : myths/promethee.png n'existe pas, et PixelIcon
                  n'a aucun repli sur fichier manquant. À générer. */}
              {isPromethee && (
                <div className="myth-status-card promethee" title={tr({
                  fr: `Porter la population à ${PROMETHEE_POP_TARGET} habitants avant que la Rupture n'atteigne ${Math.round(PROMETHEE_FATAL_RUPTURE * 100)} %.`,
                  en: `Bring the population to ${PROMETHEE_POP_TARGET} inhabitants before Rupture reaches ${Math.round(PROMETHEE_FATAL_RUPTURE * 100)}%.`
                })}>
                  <PixelIcon name="ruins/node-rites_feu_court" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Prométhée", en: "Prometheus" })}</span>
                    {prometheeFailed ? (
                      <strong className="danger-text">{tr({ fr: "Échoué — le feu a gagné", en: "Failed — the fire won" })}</strong>
                    ) : prometheePopReached ? (
                      /* Quasi inatteignable depuis la validation vivante (le sacre
                         retire la carte au même tick) — repli de sûreté. */
                      <strong className="positive-text">{tr({ fr: "Accompli !", en: "Achieved!" })}</strong>
                    ) : (
                      <strong className={instability >= PROMETHEE_FATAL_RUPTURE - 0.2 ? "danger-text" : undefined}>
                        {tr({
                          fr: `${fmt(population)} / ${PROMETHEE_POP_TARGET} hab · R ${Math.round((instability || 0) * 100)}/${Math.round(PROMETHEE_FATAL_RUPTURE * 100)} %`,
                          en: `${fmt(population)} / ${PROMETHEE_POP_TARGET} pop · R ${Math.round((instability || 0) * 100)}/${Math.round(PROMETHEE_FATAL_RUPTURE * 100)}%`
                        })}
                      </strong>
                    )}
                  </div>
                </div>
              )}
              {/* Sisyphe — « la Montée » : POUSSER paie le cran dans une matière au
                  choix (chaque matière ré-employée double son prix) ; bâtir pendant
                  la montée lâche le rocher (building.js) ; le premier sommet
                  retombe toujours, le second scelle. */}
              {isSisyphe && (
                <div className="myth-status-card sisyphus" title={tr({
                  fr: `Hisser le rocher au sommet ${SISYPHE_MONTEES_TARGET} fois (${SISYPHE_CRANS} crans). Chaque matière ré-employée double son prix ; bâtir pendant la montée lâche le rocher. Au premier sommet, il retombe — toujours.`,
                  en: `Haul the boulder to the summit ${SISYPHE_MONTEES_TARGET} times (${SISYPHE_CRANS} notches). Each reused material doubles its price; building during the climb lets go of the boulder. At the first summit, it rolls back — always.`
                })}>
                  <PixelIcon name="myths/sisyphe" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Sisyphe", en: "Sisyphus" })}</span>
                    {/* danger-text en montée = rappel que bâtir lâche le rocher. */}
                    <strong className={(sisypheCran || 0) > 0 ? "danger-text" : undefined}>
                      {tr({
                        fr: `Montée ${Math.min((sisypheMontees || 0) + 1, SISYPHE_MONTEES_TARGET)}/${SISYPHE_MONTEES_TARGET} · Cran ${sisypheCran || 0}/${SISYPHE_CRANS}${(sisypheCran || 0) > 0 ? " · ne bâtis pas !" : ""}`,
                        en: `Climb ${Math.min((sisypheMontees || 0) + 1, SISYPHE_MONTEES_TARGET)}/${SISYPHE_MONTEES_TARGET} · Notch ${sisypheCran || 0}/${SISYPHE_CRANS}${(sisypheCran || 0) > 0 ? " · do not build!" : ""}`
                      })}
                    </strong>
                    <div className="myth-card-actions">
                      {[
                        { key: "food", stock: food, glyphe: "🌾", nom: tr({ fr: "Nourriture", en: "Food" }), uses: sisypheUsesFood || 0 },
                        { key: "knowledge", stock: knowledge, glyphe: "📜", nom: tr({ fr: "Savoir", en: "Knowledge" }), uses: sisypheUsesKnowledge || 0 },
                        { key: "infrastructure", stock: infrastructure, glyphe: "🏛️", nom: tr({ fr: "Infrastructure", en: "Infrastructure" }), uses: sisypheUsesInfra || 0 }
                      ].map((m) => {
                        const cout = SISYPHE_STEP_BASE[m.key] * Math.pow(2, m.uses);
                        return (
                          <button key={m.key} type="button" className="btn-secondary"
                            onClick={() => sisyphePousser(m.key)}
                            disabled={!D(m.stock || 0).gte(cout)}
                            title={tr({
                              fr: `Pousser en payant ${fmt(cout)} ${m.nom}${m.uses > 0 ? ` (prix ×${Math.pow(2, m.uses)} — matière déjà employée ${m.uses}× cette montée)` : ""}.`,
                              en: `Push by paying ${fmt(cout)} ${m.nom}${m.uses > 0 ? ` (price ×${Math.pow(2, m.uses)} — material already used ${m.uses}× this climb)` : ""}.`
                            })}>
                            {m.glyphe} {fmt(cout)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {/* Icare — « le vol par paliers » : pendant le Mythe, la course à
                  l'altitude 5 ; avec l'héritage (l'Aile), le même cadran en cycle
                  normal, sans plafond. MONTER coûte de la Rupture immédiate et
                  accélère sa montée — redescendre est gratuit. */}
              {showVol && (
                <div className="myth-status-card icare" title={isIcare
                  ? tr({ fr: `Atteindre l'altitude ${ICARE_ALTITUDE_TARGET}. Chaque montée : production ×${ICARE_CLIMB_PROD_MULT}, Rupture immédiate et accélérée.`, en: `Reach altitude ${ICARE_ALTITUDE_TARGET}. Each climb: production ×${ICARE_CLIMB_PROD_MULT}, instant and hastened Rupture.` })
                  : tr({ fr: "L'Aile : choisis ton altitude — la production grimpe, la Rupture s'emballe.", en: "The Wing: choose your altitude — production soars, Rupture races." })}>
                  <PixelIcon name="myths/icare" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{isIcare ? tr({ fr: "Icare", en: "Icarus" }) : tr({ fr: "L'Aile", en: "The Wing" })}</span>
                    <strong id="icareAltitudeValue">
                      {isIcare
                        ? tr({ fr: `Altitude ${icareAltitude || 0}/${ICARE_ALTITUDE_TARGET} · R ${Math.round((instability || 0) * 100)} %`, en: `Altitude ${icareAltitude || 0}/${ICARE_ALTITUDE_TARGET} · R ${Math.round((instability || 0) * 100)}%` })
                        : tr({ fr: `Altitude ${icareAltitude || 0} · ×${fmt(Math.pow(ICARE_CLIMB_PROD_MULT, icareAltitude || 0))}`, en: `Altitude ${icareAltitude || 0} · ×${fmt(Math.pow(ICARE_CLIMB_PROD_MULT, icareAltitude || 0))}` })}
                    </strong>
                    <div className="myth-card-actions">
                      <button type="button" className="btn-primary" onClick={icareClimb}
                        title={tr({ fr: "Production ×2, Rupture immédiate et accélérée.", en: "Production ×2, instant and hastened Rupture." })}>
                        {tr({ fr: "Monter", en: "Climb" })}
                      </button>
                      <button type="button" className="btn-secondary" onClick={icareDescend} disabled={(icareAltitude || 0) <= 0}
                        title={tr({ fr: "Gratuit : n'efface que l'accélération, pas le mal déjà fait.", en: "Free: only removes the haste, not the harm already done." })}>
                        {tr({ fr: "Redescendre", en: "Descend" })}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Babel — la tour : compteur lisible vers BABEL_TOWER_TARGET pendant
                  le Mythe ; en héritage, « la Langue commune » (déclarer une
                  catégorie 1×/cycle → +20 % de production). */}
              {showBabel && (
                <div className="myth-status-card babel" title={isBabel
                  ? tr({ fr: `Ériger la tour : ${BABEL_TOWER_TARGET} bâtiments de la catégorie choisie. Seule cette catégorie est constructible ce cycle ; la Rupture monte ×2.`, en: `Raise the tower: ${BABEL_TOWER_TARGET} buildings of the chosen category. Only that category can be built this cycle; Rupture rises ×2.` })
                  : tr({ fr: "La Langue commune : une fois par cycle, déclare une langue — la catégorie choisie produit +20 % jusqu'à la fin du cycle.", en: "The Common Tongue: once per cycle, declare a language — the chosen category produces +20% until the end of the cycle." })}>
                  <PixelIcon name="myths/babel" className="myth-card-icon" />
                  <div className="myth-card-info">
                    {isBabel ? (
                      <>
                        <span>Babel ({tr(BABEL_CAT_LABELS[babelCategory]) || babelCategory || tr({ fr: 'Non choisi', en: 'Not chosen' })})</span>
                        <strong>{tr({ fr: `Tour ${babelTowerCount()}/${BABEL_TOWER_TARGET}`, en: `Tower ${babelTowerCount()}/${BABEL_TOWER_TARGET}` })}</strong>
                      </>
                    ) : babelCommonTongue ? (
                      <>
                        <span>{tr({ fr: "La Langue commune", en: "The Common Tongue" })}</span>
                        <strong>{tr({ fr: `Langue : ${tr(BABEL_CAT_LABELS[babelCommonTongue])} · +${Math.round((BABEL_COMMON_TONGUE_MULT - 1) * 100)} %${babelAutoTongue ? " · auto" : ""}`, en: `Tongue: ${tr(BABEL_CAT_LABELS[babelCommonTongue])} · +${Math.round((BABEL_COMMON_TONGUE_MULT - 1) * 100)}%${babelAutoTongue ? " · auto" : ""}` })}</strong>
                        <div className="myth-card-actions">
                          {/* Réglage Auto : retient CETTE langue pour qu'elle reparte
                              déclarée d'elle-même à chaque cycle. */}
                          <button type="button" className={babelAutoTongue ? "btn-primary" : "btn-secondary"}
                            onClick={babelToggleAutoTongue}
                            title={babelAutoTongue
                              ? tr({ fr: "Lever le réglage automatique — chaque cycle re-choisira sa langue à la main.", en: "Lift the automatic setting — each cycle will pick its tongue by hand." })
                              : tr({ fr: `Redéclarer « ${tr(BABEL_CAT_LABELS[babelCommonTongue])} » automatiquement à chaque nouveau cycle (réglage conservé, même après un Grand Reset).`, en: `Automatically redeclare "${tr(BABEL_CAT_LABELS[babelCommonTongue])}" each new cycle (setting kept, even through a Grand Reset).` })}>
                            {babelAutoTongue ? tr({ fr: "Auto ✓", en: "Auto ✓" }) : tr({ fr: "Auto", en: "Auto" })}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>{tr({ fr: "La Langue commune", en: "The Common Tongue" })}</span>
                        <strong>{tr({ fr: "Déclarer la langue du cycle", en: "Declare the cycle's tongue" })}</strong>
                        <div className="myth-card-actions">
                          {Object.keys(BABEL_CAT_LABELS).map((cat) => (
                            <button key={cat} type="button" className="btn-secondary"
                              onClick={() => babelDeclareTongue(cat)}
                              title={tr({ fr: `Toute la catégorie « ${tr(BABEL_CAT_LABELS[cat])} » produit +${Math.round((BABEL_COMMON_TONGUE_MULT - 1) * 100)} % jusqu'à la fin du cycle. Une déclaration par cycle.`, en: `The whole "${tr(BABEL_CAT_LABELS[cat])}" category produces +${Math.round((BABEL_COMMON_TONGUE_MULT - 1) * 100)}% until the end of the cycle. One declaration per cycle.` })}>
                              {tr(BABEL_CAT_LABELS[cat])}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {/* Âge d'Or — « les Caravanes » : conclure 8 marchés. Le bouton ouvre
                  la négociation ; le déséquilibre Nourriture/Trésor brûle l'Usure ×3. */}
              {isOr && (
                <div className="myth-status-card age-or" title={tr({
                  fr: `Conclure ${OR_DEALS_TARGET} marchés avec les caravanes. Marchander baisse le prix, mais un marchand vexé s'en va. Le déséquilibre Nourriture/Trésor brûle l'Usure.`,
                  en: `Close ${OR_DEALS_TARGET} deals with the caravans. Haggling lowers the price, but an offended merchant walks away. Food/Treasury imbalance burns Wear.`
                })}>
                  <PixelIcon name="myths/age-or" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Âge d'Or", en: "Golden Age" })}</span>
                    <strong className={orUsureImbalance ? "danger-text" : undefined}>
                      {tr({
                        fr: `Marchés ${orDealsClosed || 0}/${OR_DEALS_TARGET}${orUsureImbalance ? " · déséquilibre !" : ""}`,
                        en: `Deals ${orDealsClosed || 0}/${OR_DEALS_TARGET}${orUsureImbalance ? " · imbalance!" : ""}`
                      })}
                    </strong>
                    <div className="myth-card-actions">
                      <button type="button" className="btn-primary" onClick={negotiateOrDeal}
                        title={tr({ fr: "Une caravane attend au portail.", en: "A caravan waits at the gate." })}>
                        {tr({ fr: "Négocier", en: "Negotiate" })}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Atlas — « le poids du ciel » : ÉPAULER fait redescendre le Fardeau
                  (cooldown) ; écrasé à 100 %. Avec l'héritage, la carte n'affiche
                  que l'état du coup : « Atlas prend le coup » se joue DANS le
                  dialogue de crise (1×/cycle), pas ici. */}
              {/* ⚠ Icône PLACEHOLDER (myths/age-or) : pas de myths/atlas.png — à générer. */}
              {showEpaule && (
                <div className="myth-status-card atlas" title={isAtlas
                  ? tr({ fr: `Épauler ${ATLAS_SHOULDER_TARGET} fois le ciel à pleine charge (Fardeau ≥ ${ATLAS_COUNT_THRESHOLD} %). En dessous, le geste soulage mais ne compte pas — et gaspille la récupération. À 100 %, écrasement.`, en: `Shoulder the sky at full weight ${ATLAS_SHOULDER_TARGET} times (Burden ≥ ${ATLAS_COUNT_THRESHOLD}%). Below, the act relieves but does not count — and wastes the recovery. At 100%, crushed.` })
                  : tr({ fr: "L'Épaule : une fois par cycle, « Atlas prend le coup » — une gestion de crise au choix passe sans effet. L'option apparaît dans la crise elle-même.", en: "The Shoulder: once per cycle, \"Atlas takes the hit\" — one crisis management of your choice passes with no effect. The option appears in the crisis itself." })}>
                  <PixelIcon name="myths/age-or" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{isAtlas ? tr({ fr: "Atlas", en: "Atlas" }) : tr({ fr: "L'Épaule", en: "The Shoulder" })}</span>
                    {isAtlas && atlasCrushed ? (
                      <strong className="danger-text">{tr({ fr: "Écrasé — le ciel a gagné", en: "Crushed — the sky won" })}</strong>
                    ) : isAtlas ? (
                      <strong className={(atlasFardeau || 0) >= ATLAS_COUNT_THRESHOLD ? "danger-text" : undefined}>
                        {tr({ fr: `Épaulées ${atlasEpaules || 0}/${ATLAS_SHOULDER_TARGET} · Fardeau ${Math.round(atlasFardeau || 0)}/${ATLAS_COUNT_THRESHOLD} %`, en: `Shoulders ${atlasEpaules || 0}/${ATLAS_SHOULDER_TARGET} · Burden ${Math.round(atlasFardeau || 0)}/${ATLAS_COUNT_THRESHOLD}%` })}
                      </strong>
                    ) : atlasSkipUsed ? (
                      <strong>{tr({ fr: "Coup pris — retour au prochain cycle", en: "Hit taken — back next cycle" })}</strong>
                    ) : (
                      <strong>{tr({ fr: "Atlas peut prendre un coup", en: "Atlas can take a hit" })}</strong>
                    )}
                    {isAtlas && !atlasCrushed && (
                      <div className="myth-card-actions">
                        {/* Le bouton ne passe en primaire QUE dans la zone rouge :
                            c'est là que le geste compte. */}
                        <button type="button"
                          className={(atlasFardeau || 0) >= ATLAS_COUNT_THRESHOLD ? "btn-primary" : "btn-secondary"}
                          onClick={atlasEpauler} disabled={atlasCdLeft > 0}
                          title={(atlasFardeau || 0) < ATLAS_COUNT_THRESHOLD
                            ? tr({ fr: `Le ciel est léger : ce geste soulagerait sans compter (compte dès ${ATLAS_COUNT_THRESHOLD} %).`, en: `The sky is light: this act would relieve without counting (counts from ${ATLAS_COUNT_THRESHOLD}%).` })
                            : tr({ fr: "Soutenir le ciel — récupération avant le geste suivant.", en: "Bear the sky — recovery before the next act." })}>
                          {atlasCdLeft > 0 ? tr({ fr: `Épauler (${atlasCdLeft}s)`, en: `Shoulder (${atlasCdLeft}s)` }) : tr({ fr: "Épauler", en: "Shoulder" })}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {isPhoenix && (
                <div className="myth-status-card phoenix" title={tr({ fr: "Le mythe du Phénix est actif", en: "The myth of the Phoenix is active" })}>
                  <PixelIcon name="myths/phenix" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Phénix", en: "Phoenix" })}</span>
                    <strong>{tr({ fr: `Renaissances: ${phoenixRenaissances || 0}/${PHENIX_RENAISSANCE_TARGET} | Pop: ${fmt(population)}/${fmt(phoenixRebirthTargetPop)} | Fenêtre: ${phoenixWindowSecs !== null ? `${Math.floor(phoenixWindowSecs / 60)}m${String(phoenixWindowSecs % 60).padStart(2, '0')}s` : '-'}`, en: `Rebirths: ${phoenixRenaissances || 0}/${PHENIX_RENAISSANCE_TARGET} | Pop: ${fmt(population)}/${fmt(phoenixRebirthTargetPop)} | Window: ${phoenixWindowSecs !== null ? `${Math.floor(phoenixWindowSecs / 60)}m${String(phoenixWindowSecs % 60).padStart(2, '0')}s` : '-'}` })}</strong>
                  </div>
                </div>
              )}
              {isHeph && (
                <div className="myth-status-card heph" title={tr({ fr: "Le mythe d'Héphaïstos est actif", en: "The myth of Hephaestus is active" })}>
                  <PixelIcon name="myths/hephaistos" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Héphaïstos", en: "Hephaestus" })} {hephGoalReached && tr({ fr: " (Pacte accompli !)", en: " (Pact fulfilled!)" })}</span>
                    <strong>{tr({ fr: `Infra: ${fmt(infrastructure)}/${fmt(D(hephPopPeak || 1).max(1).mul(HEPH_INFRA_PER_PEAK))} | ${D(population).lt(hephPopPeak) ? 'Déclin pop' : 'Stable'}`, en: `Infra: ${fmt(infrastructure)}/${fmt(D(hephPopPeak || 1).max(1).mul(HEPH_INFRA_PER_PEAK))} | ${D(population).lt(hephPopPeak) ? 'Pop decline' : 'Stable'}` })}</strong>
                  </div>
                </div>
              )}
              {isAtrides && (
                <div className="myth-status-card atrides" title={tr({ fr: "Le fardeau des Atrides est actif", en: "The burden of the Atreides is active" })}>
                  <PixelIcon name="myths/atrides" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Atrides", en: "Atreides" })}</span>
                    <strong>{tr({ fr: `Dette: ${fmt(atridesDebt)} | Net: ${fmt(netGold)}`, en: `Debt: ${fmt(atridesDebt)} | Net: ${fmt(netGold)}` })}</strong>
                  </div>
                </div>
              )}
              {atridesPactActive && (
                <div className="myth-status-card atrides-pact" title={tr({ fr: "Pacte des Atrides scellé", en: "Atreides Pact sealed" })}>
                  <PixelIcon name="myths/pacte" className="myth-card-icon" />
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
                  <PixelIcon name="myths/atrides" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Fardeau Atrides", en: "Atreides Burden" })}</span>
                    <strong className="danger-text">{tr({ fr: "Production globale -20%", en: "Global production -20%" })}</strong>
                  </div>
                </div>
              )}
              {isMythEffectActive("mythe_d_enee") && (
                <div className="myth-status-card enee" title={tr({ fr: "Le mythe d'Énée est actif", en: "The myth of Aeneas is active" })}>
                  <PixelIcon name="myths/enee" className="myth-card-icon" />
                  <div className="myth-card-info">
                    <span>{tr({ fr: "Énée", en: "Aeneas" })}</span>
                    <strong>{tr({ fr: `Migr: ${eneeMigrations}/${ENEE_MIGRATIONS_TARGET} | ${eneeDegraded ? "Invivable !" : `${Math.floor(eneeRemainingSecs / 60)}m ${eneeRemainingSecs % 60}s`}`, en: `Migr: ${eneeMigrations}/${ENEE_MIGRATIONS_TARGET} | ${eneeDegraded ? "Uninhabitable!" : `${Math.floor(eneeRemainingSecs / 60)}m ${eneeRemainingSecs % 60}s`}` })}</strong>
                  </div>
                </div>
              )}
              {eneeHeritage && cycleSeconds < 30 && (
                <div className="myth-status-card enee-heritage" title={tr({ fr: "Bénédiction d'Énée active pour le début du cycle", en: "Aeneas's Blessing active for the start of the cycle" })}>
                  <PixelIcon name="myths/benediction" className="myth-card-icon" />
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
                  <PixelIcon name="myths/epitaph" className="myth-card-icon" />
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
                  <PixelIcon name="myths/latente" className="myth-card-icon" />
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
