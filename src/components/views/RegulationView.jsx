import { useGameState } from '../../hooks/useGameState.js';
import { pressureBreakdown, ruinEffectSum, regulFatigueEffectMult } from '../../game/core/mechanics.js';
import { runCrisisAction, togglePolicy } from '../../game/core/actions.js';
import { openAuguryTable } from '../../game/core/auguryTable.js';
import { canPayCost, fmt, pct } from '../../game/core/utils.js';
import { INEQUALITY_RESERVE_REF_S } from '../../game/core/balance.js';
import { tableLimits } from '../../game/core/actions/maisonTable.js';
import { tr } from '../../game/core/i18n.js';
import { RES_LABEL, regulationFoyers, regulationPolicies, policyEffectLabel, policyCostLabel } from '../ui/regulModel.js';
import Place, { PlaceKey } from '../ui/Place.jsx';
import PixelIcon from '../ui/PixelIcon.jsx';
import StewardPanel from '../ui/StewardPanel.jsx';
import { RecentDecrees } from '../ui/CycleAnnals.jsx';
import { FaveurIcon } from '../ui/FaveurIcon.jsx';
import { tipProps } from '../ui/HelpBubble.jsx';

/**
 * LE CONSEIL — l'onglet Régulation, « comprendre et agir » (arbitrage Raph
 * 2026-10-03 sur la maquette V4 : l'ancienne page était « un gros powerpoint
 * illisible »). De haut en bas :
 *   le décor de la salle du conseil, avec la Rupture, les institutions et la
 *   fatigue ;
 *   l'ÉQUATION de la cible, en chiffres : foyers × théocratie − institutions
 *   + démesure = cible ;
 *   un DOSSIER par source de pression : sa part, son état, et ses décrets
 *   chiffrés (ce qu'ils retirent, ce qu'ils coûtent, ce qu'ils laissent) ;
 *   les politiques permanentes, l'Intendance et les derniers décrets.
 * ⛔ Aucune phrase d'explication à l'écran : les mécanismes sont dans l'Aide
 * (Options › Aide › La Régulation), le « pourquoi » chiffré de chaque source
 * dans l'infobulle de son dossier.
 * Les décrets et les politiques viennent de regulModel.js, la même source que
 * la poignée de la Cité : les deux endroits annoncent les mêmes chiffres.
 */

const RES_ICON = { food: 'res/food', gold: 'res/gold', knowledge: 'res/knowledge', infrastructure: 'res/infra', ruins: 'glyphs/ruines' };

// Échelle commune des pistes de dossier : 75 % de pression = piste pleine (le
// plus haut plafond doux d'une source, cf. pressure.js).
const DOSSIER_SCALE = 0.75;

// État d'un dossier, en mots invariables (les sources sont toutes féminines, et
// « Inégalités » est au pluriel).
function dossierState(value, heaviest, plural) {
  if (value < 0.03) return { cls: 'calm', label: tr({ fr: 'au calme', en: 'quiet' }) };
  if (heaviest) {
    return {
      cls: 'heaviest',
      label: tr(plural ? { fr: 'les plus lourdes', en: 'the heaviest' } : { fr: 'la plus lourde', en: 'the heaviest' })
    };
  }
  if (value < 0.25) return { cls: 'strain', label: tr({ fr: 'sous tension', en: 'under strain' }) };
  return { cls: 'fire', label: tr({ fr: 'en feu', en: 'ablaze' }) };
}

// Le « pourquoi » chiffré de chaque source (infobulle de son dossier). Repris de
// l'ancienne Anatomie de la Rupture, qui lisait déjà les moteurs de pressure.js.
function whyOf(key, g, cycles) {
  switch (key) {
    case 'scarcity': {
      const cover = Math.max(0, Math.round((1 - (g.scarcityDeficit || 0)) * 100));
      return tr({ fr: `Les entrepôts couvrent ${cover} % du besoin.`, en: `Warehouses cover ${cover}% of need.` });
    }
    case 'inequality': {
      const s = g.goldReserveSeconds != null ? Math.round(g.goldReserveSeconds) : null;
      return s == null
        ? tr({ fr: 'La réserve du Trésor pèse quand elle grossit.', en: 'The Treasury reserve weighs as it grows.' })
        : tr({
          fr: `Réserve du Trésor : ${s} s de revenu (pèse au-delà de ${INEQUALITY_RESERVE_REF_S} s).`,
          en: `Treasury reserve: ${s}s of income (weighs beyond ${INEQUALITY_RESERVE_REF_S}s).`
        });
    }
    case 'complexity':
      return tr({
        fr: `${g.riskyBuildingCount || 0} bâtiments à administrer ; couverture d'infrastructure ×${(g.infraCoverage || 0).toFixed(1)}.`,
        en: `${g.riskyBuildingCount || 0} buildings to administer; infrastructure coverage ×${(g.infraCoverage || 0).toFixed(1)}.`
      });
    case 'dissent':
      return tr({
        fr: `La mémoire de ${cycles} cycle${cycles > 1 ? 's' : ''} et de leurs ruines.`,
        en: `The memory of ${cycles} cycle${cycles > 1 ? 's' : ''} and their ruins.`
      });
    case 'structural':
      return tr({
        fr: `${g.stabilizerCount || 0} bâtiments stabilisants la réduisent.`,
        en: `${g.stabilizerCount || 0} stabilizing buildings reduce it.`
      });
    case 'demesure':
      return tr({
        fr: `Rayonnement de 10^${(g.popLog || 0).toFixed(1)}. S'ajoute après les institutions. Gouvernance : −${Math.round((g.demesureCut || 0) * 100)} %.`,
        en: `Radiance of 10^${(g.popLog || 0).toFixed(1)}. Added after the institutions. Governance: −${Math.round((g.demesureCut || 0) * 100)}%.`
      });
    default:
      return null;
  }
}

function CostTag({ cost }) {
  return Object.entries(cost || {}).map(([res, amount]) => (
    <span key={res} className="decree-cost">
      <PixelIcon name={RES_ICON[res] || 'res/gold'} size={16} />
      {fmt(amount)}
    </span>
  ));
}

// Un décret : son nom et son prix, puis ce qu'il fait et ce qu'il laisse.
// L'effet affiché est l'effet RÉEL, fatigue comprise (crisis.js applique
// regulFatigueEffectMult au dépôt).
function DecreeButton({ a, eff }) {
  if (a.locked) {
    return (
      <button type="button" className="conseil-decree is-locked" disabled title={`${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${a.unlockLabel}`}>
        <b>{a.label}</b>
        <span className="decree-kind">🔒 {a.unlockLabel}</span>
      </button>
    );
  }
  if (a.gamble) {
    return (
      <button type="button" className="conseil-decree is-gamble" onClick={() => openAuguryTable(a.id)} {...tipProps(a.label, a.note)}>
        <b>{a.label}</b>
        <span className="decree-cost"><FaveurIcon /> {fmt(tableLimits().min)} – {fmt(tableLimits().max)}</span>
        <span className="decree-kind">{tr({ fr: 'pari', en: 'wager' })}</span>
      </button>
    );
  }
  const disabled = a.reform ? (a.atCap || !canPayCost(a.cost)) : !canPayCost(a.cost);
  const effect = a.reform
    ? (a.atCap ? tr({ fr: '✓ au plafond', en: '✓ at cap' }) : `−${Math.round(a.durableAdd * eff * 100)} % ${tr({ fr: 'durable', en: 'lasting' })}`)
    : `−${Math.round((a.relief || 0) * eff * 100)} %`;
  const side = a.malusRes
    ? <span className="decree-side is-cost">↓{Math.round(a.malusPct * 100)} % {tr(RES_LABEL[a.malusRes]) || a.malusRes}</span>
    : a.bonus ? <span className="decree-side is-gain">+{tr({ fr: 'infrastructure', en: 'infrastructure' })}</span> : null;
  // Ternaire coupé (B1) : un bouton désactivé ne reçoit aucun événement souris,
  // il garde donc le `title` natif ; un bouton actif porte la bulle maison.
  return (
    <button
      type="button"
      className={`conseil-decree${a.reform ? ' is-reform' : ''}`}
      disabled={disabled}
      title={disabled && a.note ? a.note : undefined}
      {...tipProps(a.label, disabled ? null : a.note)}
      onClick={() => runCrisisAction(a.id)}
    >
      <b>{a.label}</b>
      <span className="decree-costs"><CostTag cost={a.cost} /></span>
      <span className="decree-kind">
        {a.reform ? tr({ fr: 'réforme', en: 'reform' }) : tr({ fr: 'édit', en: 'edict' })} <em>{effect}</em>
      </span>
      {side}
    </button>
  );
}

// Une politique posée comme un décret (le seul levier de la Démesure).
function PolicyDecree({ p, slotsFull }) {
  if (!p) return null;
  if (p.locked) {
    return (
      <button type="button" className="conseil-decree is-locked" disabled title={`${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${p.unlockLabel}`}>
        <b>{p.label}</b>
        <span className="decree-kind">🔒 {p.unlockLabel}</span>
      </button>
    );
  }
  const disabled = !p.active && slotsFull;
  return (
    <button
      type="button"
      className={`conseil-decree is-policy${p.active ? ' is-active' : ''}`}
      disabled={disabled}
      aria-pressed={p.active}
      title={disabled ? p.desc : undefined}
      {...tipProps(p.label, disabled ? null : p.desc)}
      onClick={() => togglePolicy(p.id)}
    >
      <b>{p.label}</b>
      <span className="decree-state">{p.active ? `● ${tr({ fr: 'active', en: 'active' })}` : ''}</span>
      <span className="decree-kind">{tr({ fr: 'politique', en: 'policy' })} <em>{policyEffectLabel(p)}</em></span>
      <span className="decree-side is-cost">{policyCostLabel(p.cost)}</span>
    </button>
  );
}

function Dossier({ dKey, label, value, why, heaviest, plural, children }) {
  const st = dossierState(value, heaviest, plural);
  return (
    <article className={`conseil-dossier is-${st.cls}`}>
      <header className="dossier-head" {...tipProps(label, why)}>
        <PixelIcon name={`foyers/${dKey}`} size={32} className="dossier-icon" />
        <h3>{label}</h3>
        <span className="dossier-val">{pct(value)}</span>
      </header>
      <div className={`dossier-track tone-${dKey}`} aria-hidden="true">
        <i style={{ width: `${Math.max(1.5, Math.min(1, value / DOSSIER_SCALE) * 100)}%` }} />
      </div>
      <span className="dossier-state">{st.label}</span>
      <div className="dossier-decrees">{children}</div>
    </article>
  );
}

function EqTerm({ label, value, cls = '', tip }) {
  return (
    <span className={`eq-term${cls ? ` ${cls}` : ''}`} {...tipProps(label, tip)}>
      <small>{label}</small>
      <b>{value}</b>
    </span>
  );
}

// L'équation de la cible, en chiffres. ⚠ Les institutions affichent ce
// qu'elles ABSORBENT (au plus ce qui arrive) et non leur capacité : la cible
// est max(0, foyers × théocratie − institutions) + démesure, et une capacité
// supérieure aux foyers ferait mentir la soustraction.
function Equation({ p, g, foyersSum }) {
  const growth = g.ruptureGrowth || 1;
  const absorbed = Math.min(p.mitigation, foyersSum * growth);
  const op = (o) => <span className="eq-op" aria-hidden="true">{o}</span>;
  return (
    <div
      className="conseil-equation"
      role="img"
      aria-label={tr({
        fr: `Foyers ${pct(foyersSum)}, moins les institutions ${pct(absorbed)}, plus la démesure ${pct(p.demesure)} : cible ${pct(p.total)}`,
        en: `Sources ${pct(foyersSum)}, minus institutions ${pct(absorbed)}, plus hubris ${pct(p.demesure)}: target ${pct(p.total)}`
      })}
    >
      <EqTerm
        label={tr({ fr: 'foyers', en: 'sources' })}
        value={pct(foyersSum)}
        tip={[
          [tr({ fr: 'Subsistance', en: 'Subsistence' }), p.scarcity],
          [tr({ fr: 'Inégalités', en: 'Inequality' }), p.inequality],
          [tr({ fr: 'Complexité', en: 'Complexity' }), p.complexity],
          [tr({ fr: 'Dissidence', en: 'Dissent' }), p.dissent],
          [tr({ fr: 'Structurelle', en: 'Structural' }), p.structural]
        ].map(([n, v]) => ({ label: `${n} ${pct(v)}` }))}
      />
      {growth !== 1 && (
        <>
          {op('×')}
          <EqTerm label={tr({ fr: 'théocratie', en: 'theocracy' })} value={growth.toFixed(2)} />
        </>
      )}
      {op('−')}
      <EqTerm
        label={tr({ fr: 'institutions', en: 'institutions' })}
        value={pct(absorbed)}
        cls="is-good"
        tip={tr({
          fr: `Capacité ${pct(p.mitigation)} · couverture ×${(g.infraCoverage || 0).toFixed(1)}`,
          en: `Capacity ${pct(p.mitigation)} · coverage ×${(g.infraCoverage || 0).toFixed(1)}`
        })}
      />
      {p.demesure > 0 && (
        <>
          {op('+')}
          <EqTerm label={tr({ fr: 'démesure', en: 'hubris' })} value={pct(p.demesure)} cls="is-bad" />
        </>
      )}
      {op('=')}
      <EqTerm label={tr({ fr: 'cible', en: 'target' })} value={pct(p.total)} cls={`is-result${p.total >= 1 ? ' is-over' : ''}`} />
    </div>
  );
}

function PolicyCard({ p, slotsFull }) {
  const disabled = !p.active && (p.locked || slotsFull);
  const tip = p.locked ? `${tr({ fr: 'Se débloque', en: 'Unlocks' })} : ${p.unlockLabel}` : p.desc;
  return (
    <button
      type="button"
      className={`conseil-policy${p.active ? ' is-active' : ''}${p.locked ? ' is-locked' : ''}`}
      disabled={disabled}
      aria-pressed={p.active}
      title={disabled ? tip : undefined}
      {...tipProps(p.label, disabled ? null : tip)}
      onClick={() => togglePolicy(p.id)}
    >
      <PixelIcon name={`seals/${p.id}`} size={24} className="conseil-policy-seal" />
      <b>{p.label}</b>
      {p.locked ? (
        <span className="conseil-policy-lock">🔒 {p.unlockLabel}</span>
      ) : (
        <>
          <span className="conseil-policy-good">{policyEffectLabel(p)}</span>
          <span className="conseil-policy-bad">{policyCostLabel(p.cost)}</span>
        </>
      )}
    </button>
  );
}

export default function RegulationView() {
  const instability = useGameState((s) => s.instability || 0);
  const cycles = useGameState((s) => s.cycles || 0);
  const fatigue = useGameState((s) => s.regulFatigue || 0);
  // Les réformes et les politiques ne touchent pas `instability` : abonnements
  // dédiés, sinon le clic ne se verrait qu'au tick suivant.
  useGameState((s) => {
    const rf = s.foyerReform || {};
    return (rf.scarcity || 0) + (rf.inequality || 0) + (rf.complexity || 0) + (rf.dissent || 0);
  });
  useGameState((s) => (s.activePolicies || []).join(','));

  const p = pressureBreakdown();
  const g = p.gauges || {};
  const haste = ruinEffectSum('ruptureHaste');
  const foyersSum = p.scarcity + p.inequality + p.complexity + p.dissent + p.structural + haste;
  const absorbed = Math.min(p.mitigation, foyersSum * (g.ruptureGrowth || 1));
  const eff = regulFatigueEffectMult();
  const foyers = regulationFoyers();
  const { policies, activeCount, max, slotsFull } = regulationPolicies();
  const governance = policies.find((x) => x.demesureDamp);

  // Le plus lourd des dossiers affichés porte l'état « la plus lourde ».
  const showStructural = p.structural >= 0.005;
  const values = [...foyers.map((f) => f.value), p.demesure, showStructural ? p.structural : 0];
  const heaviestValue = Math.max(...values);
  const isHeaviest = (v) => v >= 0.03 && v === heaviestValue;
  const targetPos = Math.min(1, p.total) * 100;

  return (
    <Place
      id="regulation"
      className="conseil"
      scene="/pixelart/places/chancellerie.png"
      sceneAlt={tr({ fr: 'La salle du conseil, de nuit', en: 'The council chamber, at night' })}
      focus={[50, 42]}
      eyebrow={tr({ fr: 'Régulation', en: 'Regulation' })}
      title={tr({ fr: 'Le Conseil', en: 'The Council' })}
      bodyClassName="conseil-body"
      keys={<>
          <div
            className="place-key is-wide"
            {...tipProps(tr({ fr: 'Rupture', en: 'Rupture' }), tr({
              fr: `Elle glisse vers sa cible : ${pct(p.total)}.`,
              en: `It drifts toward its target: ${pct(p.total)}.`
            }))}
          >
            <span className="place-key-head">
              <span className="place-key-label">{tr({ fr: 'Rupture', en: 'Rupture' })}</span>
              <strong className="place-key-val is-rupture">{pct(instability)}</strong>
            </span>
            <span className="conseil-rupture-track" aria-hidden="true">
              <i style={{ width: `${Math.min(1, instability) * 100}%` }} />
              <span className="tick" style={{ left: '25%' }} />
              <span className="tick" style={{ left: '50%' }} />
              <span className="tick" style={{ left: '75%' }} />
              <span className="ghost" style={{ left: `${targetPos}%` }} />
            </span>
            <span className="place-key-sub">{tr({ fr: 'cible', en: 'target' })} <b className={p.total >= 1 ? 'is-rupture' : ''}>{pct(p.total)}</b></span>
          </div>
          <PlaceKey label={tr({ fr: 'Institutions', en: 'Institutions' })} value={`−${pct(absorbed)}`} valueClassName="is-good" />
          <PlaceKey label={tr({ fr: 'Fatigue', en: 'Fatigue' })} value={`${Math.round(fatigue * 100)} %`} />
      </>}
    >
      <Equation p={p} g={g} foyersSum={foyersSum} />

      <div className="conseil-dossiers">
        {foyers.map((f) => (
          <Dossier
            key={f.key}
            dKey={f.key}
            label={f.label}
            value={f.value}
            why={whyOf(f.key, g, cycles)}
            heaviest={isHeaviest(f.value)}
            plural={f.key === 'inequality'}
          >
            {f.actions.map((a) => <DecreeButton key={a.id} a={a} eff={eff} />)}
          </Dossier>
        ))}
        {showStructural && (
          <Dossier
            dKey="structural"
            label={tr({ fr: 'Structurelle', en: 'Structural' })}
            value={p.structural}
            why={whyOf('structural', g, cycles)}
            heaviest={isHeaviest(p.structural)}
          />
        )}
        <Dossier
          dKey="demesure"
          label={tr({ fr: 'Démesure', en: 'Hubris' })}
          value={p.demesure}
          why={whyOf('demesure', g, cycles)}
          heaviest={isHeaviest(p.demesure)}
        >
          <PolicyDecree p={governance} slotsFull={slotsFull} />
        </Dossier>
      </div>

      <div className="conseil-foot">
        <section className="conseil-panel conseil-policies" aria-labelledby="conseil-pol-title">
          <header className="conseil-panel-head">
            <h2 id="conseil-pol-title">{tr({ fr: 'Politiques permanentes', en: 'Permanent Policies' })}</h2>
            <span className="conseil-count">{activeCount} / {max}</span>
          </header>
          <div className="conseil-policy-grid">
            {policies.map((x) => <PolicyCard key={x.id} p={x} slotsFull={slotsFull} />)}
          </div>
        </section>
        <section className="conseil-panel conseil-steward">
          <StewardPanel />
          <RecentDecrees limit={4} />
        </section>
      </div>
    </Place>
  );
}
