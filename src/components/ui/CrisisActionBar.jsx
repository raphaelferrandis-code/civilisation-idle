import { useEffect, useRef } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { pressureBreakdown, crisisCosts, rates, regulationContext, regulationActionUnlocked, regulationPolicyUnlocked } from '../../game/core/mechanics.js';
import { runCrisisAction, togglePolicy } from '../../game/core/actions.js';
import { costLabel, canPayCost } from '../../game/core/utils.js';
import { state } from '../../game/core/state.js';
import { toNum } from '../../game/core/num.js';
import { FOYER_RELIEF_ADD, FOYER_MALUS_RESOURCE, FOYER_MALUS_PCT, FOYER_REFORM, FOYER_RELIEF_CAP, POLICY_MAX_ACTIVE } from '../../game/core/balance.js';
import { REGULATION_ACTIONS, REGULATION_POLICIES } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';

/**
 * Actions de régulation des foyers de tension (Subsistance / Inégalités /
 * Complexité / Dissidence). Source unique partagée par :
 *  — l'en-tête de la Cité (variant="compact", toujours visible) ;
 *  — l'onglet Effondrement (variant="full", tableau tactique détaillé).
 *
 * Les deux variantes mappent la MÊME config `foyers` : chaque bouton annonce
 * désormais ce qu'il calme (−X % du foyer), sa contrepartie de production
 * (↓Y % d'une ressource jusqu'au prochain effondrement) et son coût (montant +
 * équivalent en secondes de production). L'abonnement à `instability` cale le
 * recalcul (coûts, relief décroissant) sur le tick (1 Hz).
 */

const RES_LABEL = {
  food: { fr: 'nourriture', en: 'food' },
  gold: { fr: 'trésor', en: 'treasury' },
  knowledge: { fr: 'savoir', en: 'knowledge' },
  infrastructure: { fr: 'infrastructure', en: 'infrastructure' }
};

// Équivalent du coût en secondes de production courante (coût ÷ revenu/s) : le
// coût est ancré sur la production, on l'affiche aussi « ≈ N s » pour la lisibilité.
function costSeconds(cost, r) {
  let sec = 0;
  for (const [res, amt] of Object.entries(cost)) {
    const inc = r[res] ? toNum(r[res]) : 0;
    if (inc > 0) sec = Math.max(sec, toNum(amt) / inc);
  }
  return sec >= 1 ? Math.round(sec) : 0;
}

// Descripteur d'affichage d'une action d'apaisement : ce qu'elle calme (relief
// temporaire), sa contrepartie (malus de production), et la durée-coût.
function describeAction(id, cost, r) {
  return {
    id,
    cost,
    relief: FOYER_RELIEF_ADD[id] || 0,
    malusRes: FOYER_MALUS_RESOURCE[id],
    malusPct: FOYER_MALUS_PCT[id] || 0,
    costSec: costSeconds(cost, r)
  };
}

// Action id de la réforme de fond par foyer.
const REFORM_ID = {
  scarcity: 'reformScarcity',
  inequality: 'reformInequality',
  complexity: 'reformComplexity',
  dissent: 'reformDissent'
};

// Descripteur d'une réforme de fond : recul DURABLE déposé sur le foyer, déjà
// acquis (currentReform), et saturation au plafond partagé (atCap).
function describeReform(foyer, cost, r, currentReform) {
  return {
    id: REFORM_ID[foyer],
    cost,
    reform: true,
    durableAdd: FOYER_REFORM[foyer]?.add || 0,
    currentReform: currentReform || 0,
    atCap: (currentReform || 0) >= FOYER_RELIEF_CAP - 1e-6,
    costSec: costSeconds(cost, r)
  };
}

// Descripteur d'une action déblocable (registre) : apaisement ou réforme, avec
// éventuel effet économique (bonus), et état verrouillé/débloqué.
function describeRegAction(action, cost, r, ctx, currentReform) {
  const unlocked = regulationActionUnlocked(action.id, ctx);
  const isReform = action.kind === 'reform';
  return {
    id: action.id,
    label: action.label,
    cost,
    costSec: costSeconds(cost, r),
    locked: !unlocked,
    unlockLabel: action.unlockLabel,
    reform: isReform,
    durableAdd: action.reformAdd || 0,
    currentReform: currentReform || 0,
    atCap: isReform && (currentReform || 0) >= FOYER_RELIEF_CAP - 1e-6,
    malusRes: action.malusRes,
    malusPct: action.malusPct || 0,
    bonus: action.infraAdd ? 'infra' : (action.legitAdd ? 'legit' : null),
    gamble: action.kind === 'gamble',
    winPct: Math.round((action.p || 0) * 100)
  };
}

// Bouton partagé par les deux variantes : libellé + coût (ligne 1), puis la
// contrepartie de production (ligne 2). `showSeconds` ajoute l'équivalent
// « ≈ N s de prod » au coût — réservé à la variante full (cartes larges) ;
// en compact le menu flottant est trop étroit.
const BONUS_LABEL = { infra: { fr: '+infrastructure', en: '+infrastructure' }, legit: { fr: '+légitimité', en: '+legitimacy' } };

function RegulButton({ a, label, btnClass, showSeconds }) {
  if (a.locked) {
    const cls = `${btnClass}${btnClass ? ' ' : ''}regul-locked`.trim();
    return (
      <button className={cls} disabled title={`${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${a.unlockLabel}`}>
        <span className="regul-btn-line">
          <strong>{label}</strong>
          <span className="regul-cost">🔒 {a.unlockLabel}</span>
        </span>
      </button>
    );
  }
  if (a.gamble) {
    const cls = `${btnClass}${btnClass ? ' ' : ''}regul-gamble`.trim();
    return (
      <button
        className={cls}
        disabled={!canPayCost(a.cost)}
        title={tr({ fr: `Pari : ${a.winPct}% de gros apaisement, ${100 - a.winPct}% de retour de bâton (hausse de Rupture).`, en: `Gamble: ${a.winPct}% major relief, ${100 - a.winPct}% backlash (Rupture rises).` })}
        onClick={() => runCrisisAction(a.id)}
      >
        <span className="regul-btn-line">
          <strong>{label}</strong>
          <span className="regul-cost">{costLabel(a.cost)}{showSeconds && a.costSec ? ` · ≈${a.costSec}s` : ''}</span>
        </span>
        <span className="regul-btn-line regul-btn-sub">
          <span className="regul-gamble-tag">🎲 {a.winPct}% {tr({ fr: 'apaise', en: 'soothes' })} · {100 - a.winPct}% {tr({ fr: 'aggrave', en: 'worsens' })}</span>
        </span>
      </button>
    );
  }
  if (a.reform) {
    const cls = `${btnClass}${btnClass ? ' ' : ''}regul-reform`.trim();
    return (
      <button
        className={cls}
        disabled={a.atCap || !canPayCost(a.cost)}
        title={tr({ fr: "Réforme de fond : recul DURABLE de ce foyer (ne décline pas, jusqu'au prochain effondrement). Coût lourd.", en: 'Deep reform: LASTING reduction of this hotspot (does not decay, until the next collapse). Heavy cost.' })}
        onClick={() => runCrisisAction(a.id)}
      >
        <span className="regul-btn-line">
          <strong>{label}</strong>
          <span className="regul-cost">{costLabel(a.cost)}{showSeconds && a.costSec ? ` · ≈${a.costSec}s` : ''}</span>
        </span>
        <span className="regul-btn-line regul-btn-sub">
          <span className="regul-reform-tag">
            {a.atCap ? tr({ fr: '✓ foyer réformé au maximum', en: '✓ hotspot reformed to the maximum' }) : `−${Math.round(a.durableAdd * 100)}% ${tr({ fr: 'durable', en: 'lasting' })}`}
          </span>
        </span>
      </button>
    );
  }
  return (
    <button className={btnClass} disabled={!canPayCost(a.cost)} onClick={() => runCrisisAction(a.id)}>
      <span className="regul-btn-line">
        <strong>{label}</strong>
        <span className="regul-cost">{costLabel(a.cost)}{showSeconds && a.costSec ? ` · ≈${a.costSec}s` : ''}</span>
      </span>
      {(a.malusRes || a.bonus) && (
        <span className="regul-btn-line regul-btn-sub">
          {a.malusRes && (
            <span className="regul-malus" title={tr({ fr: "Malus de production cumulatif, jusqu'au prochain effondrement", en: 'Cumulative production penalty, until the next collapse' })}>
              ↓{Math.round(a.malusPct * 100)}% {tr(RES_LABEL[a.malusRes]) || a.malusRes}
            </span>
          )}
          {a.bonus && (
            <span className="regul-bonus" title={tr({ fr: 'Bénéfice durable pour la cité', en: 'Lasting benefit for the city' })}>
              {tr(BONUS_LABEL[a.bonus]) || a.bonus}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

const FOYER_SHORT = {
  scarcity: { fr: 'Subsistance', en: 'Subsistence' },
  inequality: { fr: 'Inégalités', en: 'Inequality' },
  complexity: { fr: 'Complexité', en: 'Complexity' },
  dissent: { fr: 'Dissidence', en: 'Dissent' }
};

// Effet d'une politique en libellé court (cumule riseSlow / surcharge / étouffement).
function policyEffectLabel(p) {
  const parts = [];
  if (p.riseSlow) parts.push(`−${Math.round(p.riseSlow * 100)}% ${tr({ fr: 'montée de la Rupture', en: 'Rupture rise' })}`);
  if (p.overshootDamp) parts.push(`−${Math.round(p.overshootDamp * 100)}% ${tr({ fr: 'surcharge', en: 'overshoot' })}`);
  if (p.foyerDamp) {
    for (const [f, v] of Object.entries(p.foyerDamp)) {
      parts.push(`−${Math.round(v * 100)}% ${tr(FOYER_SHORT[f]) || f} ${tr({ fr: '(continu)', en: '(continuous)' })}`);
    }
  }
  return parts.join(' · ');
}

// Coût continu d'une politique en libellé court (« −10% production · −15% trésor »).
function policyCostLabel(cost) {
  const parts = [];
  if (cost.global) parts.push(`−${Math.round(cost.global * 100)}% ${tr({ fr: 'production', en: 'production' })}`);
  for (const [res, v] of Object.entries(cost)) {
    if (res === 'global') continue;
    parts.push(`−${Math.round(v * 100)}% ${tr(RES_LABEL[res]) || res}`);
  }
  return parts.join(' · ');
}

// Bascule d'une politique permanente (Levier C) : ralentit la montée, coût continu.
function PolicyRow({ p, slotsFull }) {
  const disabled = !p.active && (p.locked || slotsFull);
  return (
    <button
      className={`policy-btn${p.active ? ' is-active' : ''}${p.locked ? ' regul-locked' : ''}`}
      disabled={disabled}
      title={p.locked ? `${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${p.unlockLabel}` : p.desc}
      onClick={() => togglePolicy(p.id)}
    >
      <span className="regul-btn-line">
        <strong>{p.label}</strong>
        <span className="regul-cost">{p.locked ? `🔒 ${p.unlockLabel}` : policyCostLabel(p.cost)}</span>
      </span>
      <span className="regul-btn-line regul-btn-sub">
        <span className="policy-effect">{policyEffectLabel(p)}</span>
        {p.active && <span className="policy-active-tag">● {tr({ fr: 'active', en: 'active' })}</span>}
      </span>
    </button>
  );
}

export default function CrisisActionBar({ variant = 'full' }) {
  useGameState(s => s.instability);
  const cycles = useGameState(s => s.cycles);
  // Les réformes ne touchent pas `instability` : on s'abonne aussi à la somme du
  // recul durable pour re-render dès le clic (sinon feedback retardé au tick).
  useGameState(s => {
    const rf = s.foyerReform || {};
    return (rf.scarcity || 0) + (rf.inequality || 0) + (rf.complexity || 0) + (rf.dissent || 0);
  });
  // Levier C : re-render au toggle d'une politique (la liste change).
  useGameState(s => (s.activePolicies || []).join(','));
  // Fatigue de régulation : re-render quand elle évolue (effet/coût des actions).
  const regulFatigue = useGameState(s => s.regulFatigue || 0);

  // Variante compacte : un seul pointerdown gère la fermeture au clic extérieur
  // ET l'accordéon (ouvrir un foyer ferme les autres → un seul menu flottant).
  const regulRef = useRef(null);
  useEffect(() => {
    if (variant !== 'compact') return undefined;
    const onPointerDown = (e) => {
      const root = regulRef.current;
      if (!root) return;
      const clickedFoyer = e.target instanceof Element ? e.target.closest('.crisis-foyer') : null;
      root.querySelectorAll('.crisis-foyer[open]').forEach((d) => {
        if (d !== clickedFoyer) d.open = false;
      });
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [variant]);

  const pressure = pressureBreakdown();
  const costs = crisisCosts();
  const r = rates();
  const relief = state.foyerRelief || {};
  const reform = state.foyerReform || {};
  const showArchiveBtn = cycles >= 2;
  const showAncestorBtn = cycles >= 3;

  // Config unique des 4 foyers (key = foyer de pressureBreakdown / foyerRelief),
  // partagée par les deux variantes. `desc` n'est affichée qu'en variante full.
  // `act` = apaisement (temporaire) ; `ref` = réforme de fond (recul durable).
  const ctx = regulationContext();
  const act = (id, label) => ({ label, ...describeAction(id, costs[id], r) });
  const ref = (foyer) => ({ label: tr(FOYER_REFORM[foyer].label), ...describeReform(foyer, costs[REFORM_ID[foyer]], r, reform[foyer]) });
  // Actions déblocables du registre pour un foyer (triées par palier ; les
  // verrouillées s'affichent en aperçu « 🔒 Ère / mythe »).
  const regFor = (foyerKey) => REGULATION_ACTIONS
    .filter((a) => a.foyer === foyerKey)
    .sort((a, b) => a.tier - b.tier)
    .map((a) => describeRegAction(a, costs[a.id], r, ctx, reform[foyerKey]));
  const foyers = [
    {
      key: 'scarcity', icon: '🌾', label: tr({ fr: 'Subsistance', en: 'Subsistence' }), tone: 'food', value: pressure.scarcity,
      desc: tr({ fr: 'La population croissante pèse sur les réserves de blé.', en: 'The growing population strains the grain reserves.' }),
      actions: [act('rationing', tr({ fr: 'Rationner', en: 'Ration' })), ref('scarcity'), ...regFor('scarcity')]
    },
    {
      key: 'inequality', icon: '⚖️', label: tr({ fr: 'Inégalités', en: 'Inequality' }), tone: 'gold', value: pressure.inequality,
      desc: tr({ fr: "L'accumulation de trésor crée des barrières entre classes.", en: 'The accumulation of treasury creates barriers between classes.' }),
      actions: [act('festivals', tr({ fr: 'Jeux civiques', en: 'Civic Games' })), ref('inequality'), ...regFor('inequality')]
    },
    {
      key: 'complexity', icon: '🏛️', label: tr({ fr: 'Complexité', en: 'Complexity' }), tone: 'know', value: pressure.complexity,
      desc: tr({ fr: 'Le nombre de structures demande une administration lourde.', en: 'The number of structures demands a heavy administration.' }),
      actions: [act('census', tr({ fr: 'Recenser', en: 'Census' })), act('reforms', tr({ fr: 'Réformes', en: 'Reforms' })), ref('complexity'), ...regFor('complexity')]
    },
    {
      key: 'dissent', icon: '📜', label: tr({ fr: 'Dissidence', en: 'Dissent' }), tone: 'usure', value: pressure.dissent,
      desc: tr({ fr: "Les récits et la mémoire des cycles divisent l'opinion.", en: 'The narratives and memory of the cycles divide opinion.' }),
      actions: [
        showAncestorBtn && act('ancestorCrisis', tr({ fr: 'Culte des ancêtres', en: 'Ancestor Cult' })),
        showArchiveBtn && act('archiveCrisis', tr({ fr: 'Catastrophes', en: 'Catastrophes' })),
        ref('dissent'),
        ...regFor('dissent')
      ].filter(Boolean)
    }
  ];

  // Levier C — politiques permanentes (toggles).
  const activePolicies = state.activePolicies || [];
  const policies = REGULATION_POLICIES.map((p) => ({
    ...p,
    active: activePolicies.includes(p.id),
    locked: !regulationPolicyUnlocked(p.id, ctx)
  }));
  const slotsFull = activePolicies.length >= POLICY_MAX_ACTIVE;
  const policiesSection = (
    <div className="crisis-policies">
      <div className="crisis-policies-head">
        <span className="crisis-regul-title">{tr({ fr: 'Politiques permanentes', en: 'Permanent Policies' })}</span>
        <span className="crisis-policies-count">{activePolicies.length}/{POLICY_MAX_ACTIVE}</span>
      </div>
      <div className="crisis-policies-grid">
        {policies.map((p) => <PolicyRow key={p.id} p={p} slotsFull={slotsFull} />)}
      </div>
    </div>
  );

  const isSoothed = (key) => (relief[key] || 0) > 0.02;
  const isReformed = (key) => (reform[key] || 0) > 0.02;
  // Levier B — lisibilité : combien tes institutions (infrastructure + légitimité)
  // absorbent de pression. Rend visible que CONSTRUIRE de l'infra recule la Rupture.
  const mitigationPct = Math.round((pressure.mitigation || 0) * 100);

  // Fatigue de régulation : indicateur (affiché dès qu'elle est sensible).
  const fatiguePct = Math.round(regulFatigue * 100);
  const fatigueIndicator = fatiguePct >= 3 ? (
    <div className="crisis-fatigue" title={tr({ fr: "Fatigue de l'administration : chaque action la fait monter. Plus elle est haute, moins les actions sont efficaces et plus elles coûtent cher. Elle redescend si vous espacez vos interventions.", en: 'Administration fatigue: each action raises it. The higher it is, the less effective actions become and the more they cost. It drops if you space out your interventions.' })}>
      <span className="crisis-fatigue-label">😮‍💨 {tr({ fr: 'Fatigue de régulation', en: 'Regulation Fatigue' })}</span>
      <span className="crisis-fatigue-track"><span className="crisis-fatigue-fill" style={{ width: `${Math.min(100, fatiguePct)}%` }}></span></span>
      <span className="crisis-fatigue-val">{fatiguePct}%</span>
    </div>
  ) : null;

  if (variant === 'compact') {
    return (
      <div className="crisis-regul" aria-label={tr({ fr: 'Régulation des tensions', en: 'Tension Regulation' })} ref={regulRef}>
        <div className="crisis-regul-head">
          <span className="crisis-regul-title">{tr({ fr: 'Régulation des tensions', en: 'Tension Regulation' })}</span>
          {mitigationPct > 0 && (
            <span className="crisis-regul-buffer" title={tr({ fr: "Pression absorbée en continu par tes institutions (infrastructure + légitimité). Construire de l'infrastructure recule durablement la Rupture.", en: 'Pressure absorbed continuously by your institutions (infrastructure + legitimacy). Building infrastructure lastingly pushes back the Rupture.' })}>
              🛡️ {tr({ fr: 'Institutions : −', en: 'Institutions: −' })}{mitigationPct}{tr({ fr: '% de pression absorbée', en: '% of pressure absorbed' })}
            </span>
          )}
        </div>
        {fatigueIndicator}
        <div className="crisis-regul-grid">
          {foyers.map((f) => (
            <details key={f.key} className={`crisis-foyer crisis-foyer--${f.tone}${isSoothed(f.key) ? ' is-soothed' : ''}${isReformed(f.key) ? ' is-reformed' : ''}`}>
              <summary className="crisis-foyer-head" title={tr({ fr: "Pression que ce foyer ajoute à la Rupture (100 % = seuil de crise). Les 4 foyers s'additionnent dans la jauge globale.", en: 'Pressure this hotspot adds to the Rupture (100% = crisis threshold). The 4 hotspots add up in the overall gauge.' })}>
                <span className="crisis-foyer-icon" aria-hidden="true">{f.icon}</span>
                <span className="crisis-foyer-name">{f.label}</span>
                {isReformed(f.key) && <span className="crisis-foyer-reformed" title={tr({ fr: 'Foyer réformé — recul durable acquis (ne décline pas)', en: 'Hotspot reformed — lasting reduction acquired (does not decay)' })}>{tr({ fr: 'réformé', en: 'reformed' })}</span>}
                {isSoothed(f.key) && <span className="crisis-foyer-soothed" title={tr({ fr: "Foyer apaisé — l'effet décline", en: 'Hotspot soothed — the effect decays' })}>{tr({ fr: 'apaisé', en: 'soothed' })}</span>}
                <span className="crisis-foyer-chevron" aria-hidden="true"></span>
                <span className="crisis-foyer-track" aria-hidden="true">
                  <span
                    className="crisis-foyer-fill"
                    style={{ width: `${Math.min(1, f.value) * 100}%` }}
                  ></span>
                </span>
              </summary>
              <div className="crisis-foyer-actions">
                {f.actions.length === 0 ? (
                  <span className="crisis-foyer-locked">{tr({ fr: 'Disponible au cycle 2', en: 'Available at cycle 2' })}</span>
                ) : (
                  f.actions.map((a) => (
                    <RegulButton key={a.id} a={a} label={a.label} btnClass="crisis-regul-btn" showSeconds={false} />
                  ))
                )}
              </div>
            </details>
          ))}
        </div>
        {policiesSection}
      </div>
    );
  }

  return (
    <div className="panel tactical-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: 'Foyers de tension & Actions de régulation', en: 'Tension Hotspots & Regulation Actions' })}</h2>
        </div>
      </div>
      <p className="body-copy">{tr({ fr: 'Dépenser vos ressources pour atténuer les facteurs de rupture ralentit le déclin, mais une chute tardive et complexe rapporte davantage de ruines.', en: 'Spending your resources to mitigate the rupture factors slows the decline, but a late and complex fall yields more ruins.' })}</p>
      {mitigationPct > 0 && (
        <p className="crisis-regul-buffer crisis-regul-buffer--full" title={tr({ fr: "Pression absorbée en continu par tes institutions (infrastructure + légitimité). Construire de l'infrastructure recule durablement la Rupture.", en: 'Pressure absorbed continuously by your institutions (infrastructure + legitimacy). Building infrastructure lastingly pushes back the Rupture.' })}>
          🛡️ {tr({ fr: 'Tes institutions (infrastructure + légitimité) absorbent', en: 'Your institutions (infrastructure + legitimacy) absorb' })} <strong>−{mitigationPct}%</strong> {tr({ fr: "de pression en continu — construire de l'infrastructure recule durablement la Rupture.", en: 'of pressure continuously — building infrastructure lastingly pushes back the Rupture.' })}
        </p>
      )}
      {fatigueIndicator}

      <div className="tactical-board">
        <div className="tactical-grid">
          {foyers.map((f) => (
            <article key={f.key} className={`tactical-card tactical-card--${f.tone}${isSoothed(f.key) ? ' is-soothed' : ''}${isReformed(f.key) ? ' is-reformed' : ''}`} title={tr({ fr: "Pression que ce foyer ajoute à la Rupture (100 % = seuil de crise). Les 4 foyers s'additionnent dans la jauge globale.", en: 'Pressure this hotspot adds to the Rupture (100% = crisis threshold). The 4 hotspots add up in the overall gauge.' })}>
              <div className="tactical-info">
                <header>
                  <span className="tactical-htitle">
                    <h4>{f.icon} {f.label}</h4>
                    {isReformed(f.key) && <span className="crisis-foyer-reformed" title={tr({ fr: 'Foyer réformé — recul durable acquis (ne décline pas)', en: 'Hotspot reformed — lasting reduction acquired (does not decay)' })}>{tr({ fr: 'réformé', en: 'reformed' })}</span>}
                    {isSoothed(f.key) && <span className="crisis-foyer-soothed" title={tr({ fr: "Foyer apaisé — l'effet décline", en: 'Hotspot soothed — the effect decays' })}>{tr({ fr: 'apaisé', en: 'soothed' })}</span>}
                  </span>
                </header>
                <p>{f.desc}</p>
                <div className="tactical-track">
                  <span className="tactical-fill" style={{ width: `${Math.min(1, f.value) * 100}%` }}></span>
                </div>
              </div>
              <div className="tactical-actions">
                {f.actions.length === 0 ? (
                  <span className="crisis-foyer-locked">{tr({ fr: 'Disponible au cycle 2', en: 'Available at cycle 2' })}</span>
                ) : (
                  f.actions.map((a) => (
                    <RegulButton key={a.id} a={a} label={a.label} btnClass="" showSeconds={true} />
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
      {policiesSection}
    </div>
  );
}
