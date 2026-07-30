import { useEffect, useRef } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { pressureBreakdown, crisisCosts, regulationContext, regulationActionUnlocked, regulationPolicyUnlocked } from '../../game/core/mechanics.js';
import { runCrisisAction, togglePolicy } from '../../game/core/actions.js';
import { openAuguryTable } from '../../game/core/auguryTable.js';
import { costLabel, canPayCost } from '../../game/core/utils.js';
import { state } from '../../game/core/state.js';
import { FOYER_RELIEF_ADD, FOYER_MALUS_RESOURCE, FOYER_MALUS_PCT, FOYER_REFORM, FOYER_RELIEF_CAP, POLICY_MAX_ACTIVE, AUGURY_STAKES } from '../../game/core/balance.js';
import { REGULATION_ACTIONS, REGULATION_POLICIES } from '../../game/data/regulationActions.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from './FaveurIcon.jsx';
import PixelIcon from './PixelIcon.jsx';
import { tipProps } from './HelpBubble.jsx';

/**
 * Actions de régulation des foyers de tension (Subsistance / Inégalités /
 * Complexité / Dissidence). Rendu dans l'en-tête de la Cité
 * (variant="compact", toujours visible) — le SEUL point d'action depuis le
 * retrait de la table tactique de l'onglet Régulation (retour Raph
 * 2026-07-13 : la Chancellerie l'y rendait redondante). La variante "full"
 * (tableau tactique large) n'a PLUS de consommateur — conservée telle quelle
 * pour un éventuel retour ; à purger si elle reste orpheline au prochain audit.
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

// Descripteur d'affichage d'une action d'apaisement : ce qu'elle calme (relief
// temporaire) et sa contrepartie (malus de production).
function describeAction(id, cost) {
  return {
    id,
    cost,
    relief: FOYER_RELIEF_ADD[id] || 0,
    malusRes: FOYER_MALUS_RESOURCE[id],
    malusPct: FOYER_MALUS_PCT[id] || 0
  };
}

// Métadonnées d'affichage des 4 foyers. SOURCE UNIQUE, partagée par le panneau
// déplié (tableau d'actions) et par sa POIGNÉE repliée (RegulSummary, bas de
// fichier) : sans elle, renommer un foyer d'un côté le ferait mentir de l'autre.
const FOYER_META = [
  { key: 'scarcity',   tone: 'food',  label: { fr: 'Subsistance', en: 'Subsistence' } },
  { key: 'inequality', tone: 'gold',  label: { fr: 'Inégalités',  en: 'Inequality' } },
  { key: 'complexity', tone: 'know',  label: { fr: 'Complexité',  en: 'Complexity' } },
  { key: 'dissent',    tone: 'usure', label: { fr: 'Dissidence',  en: 'Dissent' } }
];
const FOYER_BY_KEY = Object.fromEntries(FOYER_META.map((m) => [m.key, m]));

// Action id de la réforme de fond par foyer.
const REFORM_ID = {
  scarcity: 'reformScarcity',
  inequality: 'reformInequality',
  complexity: 'reformComplexity',
  dissent: 'reformDissent'
};

// Descripteur d'une réforme de fond : recul DURABLE déposé sur le foyer, déjà
// acquis (currentReform), et saturation au plafond partagé (atCap).
function describeReform(foyer, cost, currentReform) {
  return {
    id: REFORM_ID[foyer],
    cost,
    reform: true,
    durableAdd: FOYER_REFORM[foyer]?.add || 0,
    currentReform: currentReform || 0,
    atCap: (currentReform || 0) >= FOYER_RELIEF_CAP - 1e-6
  };
}

// Descripteur d'une action déblocable (registre) : apaisement ou réforme, avec
// éventuel effet économique (bonus), et état verrouillé/débloqué.
function describeRegAction(action, cost, ctx, currentReform) {
  const unlocked = regulationActionUnlocked(action.id, ctx);
  const isReform = action.kind === 'reform';
  return {
    id: action.id,
    label: action.label,
    cost,
    locked: !unlocked,
    unlockLabel: action.unlockLabel,
    reform: isReform,
    durableAdd: action.reformAdd || 0,
    currentReform: currentReform || 0,
    atCap: isReform && (currentReform || 0) >= FOYER_RELIEF_CAP - 1e-6,
    malusRes: action.malusRes,
    malusPct: action.malusPct || 0,
    bonus: action.infraAdd ? 'infra' : null,
    gamble: action.kind === 'gamble',
    winPct: Math.round((action.p || 0) * 100)
  };
}

// Bouton de régulation : libellé + coût (ligne 1), puis la contrepartie de
// production (ligne 2).
const BONUS_LABEL = { infra: { fr: '+infrastructure', en: '+infrastructure' } };

function RegulButton({ a, label, btnClass }) {
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
    // Mini-jeu : le bouton OUVRE la Table des augures (rite, osselets, quitte
    // ou double) au lieu de trancher sur place. Toujours cliquable — la mise
    // est en FAVEUR (monnaie du temple), pas en ressources.
    const cls = `${btnClass}${btnClass ? ' ' : ''}regul-gamble`.trim();
    return (
      <button
        className={cls}
        {...tipProps(null, tr({ fr: `Ouvre la table des augures : choisis ton rite (la mise, en Faveur, pilote la variance), jette les osselets, et tente le quitte ou double si les dieux sourient.`, en: `Opens the augurs' table: choose your rite (the Favor stake shapes variance), cast the knucklebones, and try double-or-nothing if the gods smile.` }))}
        onClick={() => openAuguryTable(a.id)}
      >
        <span className="regul-btn-line">
          <strong>{label}</strong>
          <span className="regul-cost"><FaveurIcon /> {AUGURY_STAKES.prudent} à {AUGURY_STAKES.grand}</span>
        </span>
        <span className="regul-btn-line regul-btn-sub">
          <span className="regul-gamble-tag">🎲 {tr({ fr: 'mise en Faveur', en: 'Favor stake' })} · {tr({ fr: 'ouvre la table', en: 'opens the table' })}</span>
        </span>
      </button>
    );
  }
  if (a.reform) {
    const cls = `${btnClass}${btnClass ? ' ' : ''}regul-reform`.trim();
    const reformOff = a.atCap || !canPayCost(a.cost);
    const reformTip = tr({ fr: "Réforme de fond : recul DURABLE de ce foyer (ne décline pas, jusqu'au prochain effondrement). Coût lourd.", en: 'Deep reform: LASTING reduction of this hotspot (does not decay, until the next collapse). Heavy cost.' });
    return (
      // TERNAIRE COUPÉ (B1) : Chrome ne délivre aucun événement souris à un
      // bouton `disabled`, donc la bulle maison ne peut pas s'y ouvrir. Chaque
      // état a son porteur, sans perte ni doublon. Sans cette coupe, les
      // réformes payables gardaient une infobulle système au milieu des bulles.
      <button
        className={cls}
        disabled={reformOff}
        title={reformOff ? reformTip : undefined}
        {...tipProps(null, reformOff ? null : reformTip)}
        onClick={() => runCrisisAction(a.id)}
      >
        <span className="regul-btn-line">
          <strong>{label}</strong>
          <span className="regul-cost">{costLabel(a.cost)}</span>
        </span>
        <span className="regul-btn-line regul-btn-sub">
          <span className="regul-reform-tag">
            {a.atCap ? tr({ fr: '✓ réformé au max', en: '✓ reformed to max' }) : `−${Math.round(a.durableAdd * 100)}% ${tr({ fr: 'durable', en: 'lasting' })}`}
          </span>
        </span>
      </button>
    );
  }
  return (
    <button className={btnClass} disabled={!canPayCost(a.cost)} onClick={() => runCrisisAction(a.id)}>
      <span className="regul-btn-line">
        <strong>{label}</strong>
        <span className="regul-cost">{costLabel(a.cost)}</span>
      </span>
      {(a.malusRes || a.bonus) && (
        <span className="regul-btn-line regul-btn-sub">
          {a.malusRes && (
            <span className="regul-malus" {...tipProps(null, tr({ fr: "Malus de production cumulatif, jusqu'au prochain effondrement", en: 'Cumulative production penalty, until the next collapse' }))}>
              ↓{Math.round(a.malusPct * 100)}% {tr(RES_LABEL[a.malusRes]) || a.malusRes}
            </span>
          )}
          {a.bonus && (
            <span className="regul-bonus" {...tipProps(null, tr({ fr: 'Bénéfice durable pour la cité', en: 'Lasting benefit for the city' }))}>
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
  if (p.demesureDamp) parts.push(`−${Math.round(p.demesureDamp * 100)}% ${tr({ fr: 'Démesure (échelle)', en: 'Hubris (scale)' })}`);
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
  const policyTip = p.locked ? `${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${p.unlockLabel}` : p.desc;
  return (
    // Ternaire coupé (B1), même raison que les réformes : une politique active
    // ou activable porte la bulle maison, une politique verrouillée ou hors
    // emplacement garde le `title` natif, seul à s'afficher sur un bouton grisé.
    <button
      className={`policy-btn${p.active ? ' is-active' : ''}${p.locked ? ' regul-locked' : ''}`}
      disabled={disabled}
      title={disabled ? policyTip : undefined}
      {...tipProps(null, disabled ? null : policyTip)}
      onClick={() => togglePolicy(p.id)}
    >
      {/* Sceau gravé de la politique (pierre & or) — apposé quand elle est active. */}
      <span className="policy-seal-wrap" aria-hidden="true">
        {/* La rangée repliée réduit le sceau à 16px (ui-light.css) : seul ce composant
            connaît l'état désactivé, donc c'est lui qui demande la variante native. */}
        <PixelIcon name={`seals/${p.id}`} className="policy-seal" size={disabled ? 16 : 24} />
      </span>
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

/**
 * POIGNÉE de la Régulation repliée (P2) : les 4 foyers réduits à leurs jauges,
 * plus la pression absorbée par les institutions. Rendue DANS le bouton de
 * l'encart (cf. HudPanel `summary`), donc sans aucun élément interactif — un
 * bouton dans un bouton n'est pas un document valide, et le clic irait au
 * mauvais endroit.
 *
 * C'est ce qui rend le repli honnête : on perd les actions et le détail, jamais
 * la surveillance. Replier ne doit pas revenir à éteindre le tableau de bord.
 */
export function RegulSummary() {
  // Même abonnement que le panneau déplié : la pression bouge au tick (1 Hz).
  useGameState((s) => s.instability);
  const pressure = pressureBreakdown();
  const mitigationPct = Math.round((pressure.mitigation || 0) * 100);
  // Les valeurs en TEXTE partent dans l'infobulle : les jauges sont muettes pour
  // un lecteur d'écran, et `tipProps` pose l'aria-describedby qui les lui rend.
  const detail = FOYER_META
    .map((m) => `${tr(m.label)} ${Math.round(Math.min(1, pressure[m.key] || 0) * 100)} %`)
    .join(' · ');

  return (
    <span
      className="regul-summary"
      {...tipProps(
        tr({ fr: 'Foyers de tension', en: 'Tension hotspots' }),
        `${detail}${mitigationPct > 0 ? ` — ${tr({ fr: 'institutions : −', en: 'institutions: −' })}${mitigationPct}${tr({ fr: ' % absorbés', en: '% absorbed' })}` : ''}`
      )}
    >
      {FOYER_META.map((m) => (
        <span key={m.key} className={`regul-summary-foyer regul-summary-foyer--${m.tone}`} aria-hidden="true">
          <img className="regul-summary-icon" src={`/pixelart/ui/foyers/${m.key}.png`} alt="" />
          <span className="regul-summary-track">
            <span
              className="regul-summary-fill"
              style={{ width: `${Math.min(1, pressure[m.key] || 0) * 100}%` }}
            ></span>
          </span>
        </span>
      ))}
      {mitigationPct > 0 && (
        <span className="regul-summary-buffer" aria-hidden="true">−{mitigationPct}%</span>
      )}
    </span>
  );
}

export default function CrisisActionBar() {
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

  // Un seul pointerdown gère la fermeture au clic extérieur ET l'accordéon
  // (ouvrir un foyer ferme les autres → un seul menu flottant).
  const regulRef = useRef(null);
  useEffect(() => {
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
  }, []);

  const pressure = pressureBreakdown();
  const costs = crisisCosts();
  const relief = state.foyerRelief || {};
  const reform = state.foyerReform || {};
  const showArchiveBtn = cycles >= 2;
  const showAncestorBtn = cycles >= 3;

  // Config unique des 4 foyers (key = foyer de pressureBreakdown / foyerRelief).
  // `act` = apaisement (temporaire) ; `ref` = réforme de fond (recul durable).
  const ctx = regulationContext();
  const act = (id, label) => ({ label, ...describeAction(id, costs[id]) });
  const ref = (foyer) => ({ label: tr(FOYER_REFORM[foyer].label), ...describeReform(foyer, costs[REFORM_ID[foyer]], reform[foyer]) });
  // Actions déblocables du registre pour un foyer (triées par palier ; les
  // verrouillées s'affichent en aperçu « 🔒 Ère / mythe »).
  const regFor = (foyerKey) => REGULATION_ACTIONS
    .filter((a) => a.foyer === foyerKey)
    .sort((a, b) => a.tier - b.tier)
    .map((a) => describeRegAction(a, costs[a.id], ctx, reform[foyerKey]));
  const foyers = [
    {
      key: 'scarcity', icon: '🌾', label: tr(FOYER_BY_KEY.scarcity.label), tone: FOYER_BY_KEY.scarcity.tone, value: pressure.scarcity,
      actions: [act('rationing', tr({ fr: 'Rationner', en: 'Ration' })), ref('scarcity'), ...regFor('scarcity')]
    },
    {
      key: 'inequality', icon: '⚖️', label: tr(FOYER_BY_KEY.inequality.label), tone: FOYER_BY_KEY.inequality.tone, value: pressure.inequality,
      actions: [act('festivals', tr({ fr: 'Jeux civiques', en: 'Civic Games' })), ref('inequality'), ...regFor('inequality')]
    },
    {
      key: 'complexity', icon: '🏛️', label: tr(FOYER_BY_KEY.complexity.label), tone: FOYER_BY_KEY.complexity.tone, value: pressure.complexity,
      actions: [act('census', tr({ fr: 'Recenser', en: 'Census' })), act('reforms', tr({ fr: 'Réformes', en: 'Reforms' })), ref('complexity'), ...regFor('complexity')]
    },
    {
      key: 'dissent', icon: '📜', label: tr(FOYER_BY_KEY.dissent.label), tone: FOYER_BY_KEY.dissent.tone, value: pressure.dissent,
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
    <div className="crisis-fatigue" {...tipProps(tr({ fr: 'Fatigue de régulation', en: 'Regulation Fatigue' }), tr({ fr: "Fatigue de l'administration : chaque action la fait monter. Plus elle est haute, moins les actions sont efficaces et plus elles coûtent cher. Elle redescend si vous espacez vos interventions.", en: 'Administration fatigue: each action raises it. The higher it is, the less effective actions become and the more they cost. It drops if you space out your interventions.' }))}>
      <span className="crisis-fatigue-label">😮‍💨 {tr({ fr: 'Fatigue de régulation', en: 'Regulation Fatigue' })}</span>
      <span className="crisis-fatigue-track"><span className="crisis-fatigue-fill" style={{ width: `${Math.min(100, fatiguePct)}%` }}></span></span>
      <span className="crisis-fatigue-val">{fatiguePct}%</span>
    </div>
  ) : null;

  return (
      <div className="crisis-regul" aria-label={tr({ fr: 'Régulation des tensions', en: 'Tension Regulation' })} ref={regulRef}>
        <div className="crisis-regul-head">
          <span className="crisis-regul-title">{tr({ fr: 'Régulation des tensions', en: 'Tension Regulation' })}</span>
          {mitigationPct > 0 && (
            <span className="crisis-regul-buffer" {...tipProps(null, tr({ fr: "Pression absorbée en continu par tes institutions (infrastructure). Construire de l'infrastructure recule durablement la Rupture.", en: 'Pressure absorbed continuously by your institutions (infrastructure). Building infrastructure lastingly pushes back the Rupture.' }))}>
              {tr({ fr: 'Institutions : −', en: 'Institutions: −' })}{mitigationPct}{tr({ fr: '% de pression absorbée', en: '% of pressure absorbed' })}
            </span>
          )}
        </div>
        {fatigueIndicator}
        <div className="crisis-regul-grid">
          {foyers.map((f) => (
            <details key={f.key} className={`crisis-foyer crisis-foyer--${f.tone}${isSoothed(f.key) ? ' is-soothed' : ''}${isReformed(f.key) ? ' is-reformed' : ''}`}>
              <summary className="crisis-foyer-head" {...tipProps(f.label, tr({ fr: "Pression que ce foyer ajoute à la Rupture (100 % = seuil de crise). Les 4 foyers s'additionnent dans la jauge globale.", en: 'Pressure this hotspot adds to the Rupture (100% = crisis threshold). The 4 hotspots add up in the overall gauge.' }))}>
                <img className="crisis-foyer-icon" src={`/pixelart/ui/foyers/${f.key}.png`} alt="" aria-hidden="true" />
                <span className="crisis-foyer-name">{f.label}</span>
                {isReformed(f.key) && <span className="crisis-foyer-reformed" {...tipProps(null, tr({ fr: 'Foyer réformé. Le recul acquis ne décline pas.', en: 'Hotspot reformed. The reduction does not decay.' }))}>{tr({ fr: 'réformé', en: 'reformed' })}</span>}
                {isSoothed(f.key) && <span className="crisis-foyer-soothed" {...tipProps(null, tr({ fr: "Foyer apaisé. L'effet décline avec le temps.", en: 'Hotspot soothed. The effect decays over time.' }))}>{tr({ fr: 'apaisé', en: 'soothed' })}</span>}
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
                    <RegulButton key={a.id} a={a} label={a.label} btnClass="crisis-regul-btn" />
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
