import { useEffect, useRef } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { pressureBreakdown, regulFatigueEffectMult } from '../../game/core/mechanics.js';
import { runCrisisAction, togglePolicy } from '../../game/core/actions.js';
import { openAuguryTable } from '../../game/core/auguryTable.js';
import { costLabel, canPayCost, pct, fmt } from '../../game/core/utils.js';
import { state, openView } from '../../game/core/state.js';
import { tableLimits } from '../../game/core/actions/maisonTable.js';
import { RES_LABEL, FOYER_META, regulationFoyers, regulationPolicies, policyEffectLabel, policyCostLabel } from './regulModel.js';
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
          <span className="regul-cost"><FaveurIcon /> {tr({ fr: `${fmt(tableLimits().min)} à ${fmt(tableLimits().max)}`, en: `${fmt(tableLimits().min)} to ${fmt(tableLimits().max)}` })}</span>
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
            {/* × la fatigue de régulation, comme le Conseil et le moteur au dépôt. */}
            {a.atCap ? tr({ fr: '✓ réformé au max', en: '✓ reformed to max' }) : `−${Math.round(a.durableAdd * regulFatigueEffectMult() * 100)}% ${tr({ fr: 'durable', en: 'lasting' })}`}
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
// Icône de foyer À SA TAILLE NATIVE (variante 16 px) : le maître de 64 px réduit
// à 14 px par le navigateur sortait flou.
function FoyerIcon({ k }) {
  return <img className="regul-summary-icon" src={`/pixelart/ui/foyers/${k}@16.png`} alt="" aria-hidden="true" />;
}

export function RegulSummary() {
  // Même abonnement que le panneau déplié : la pression bouge au tick (1 Hz).
  useGameState((s) => s.instability);
  useGameState((s) => (s.activePolicies || []).join(','));
  const pressure = pressureBreakdown();
  const mitigationPct = Math.round((pressure.mitigation || 0) * 100);
  const { activeCount, max: policyMax } = regulationPolicies();
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
          <FoyerIcon k={m.key} />
          <span className="regul-summary-track">
            <span
              className="regul-summary-fill"
              style={{ width: `${Math.min(1, pressure[m.key] || 0) * 100}%` }}
            ></span>
          </span>
          {/* Le chiffre et les libellés ci-dessous ne s'affichent qu'au bureau
              (cite.css) : la barre repliée de la maquette V4. Au doigt, le
              résumé reste réduit aux jauges. */}
          <em className="regul-summary-pct">{Math.round(Math.min(1, pressure[m.key] || 0) * 100)}%</em>
        </span>
      ))}
      {mitigationPct > 0 && (
        <span className="regul-summary-buffer" aria-hidden="true">
          <span className="regul-summary-label">{tr({ fr: 'Institutions', en: 'Institutions' })} </span>−{mitigationPct}%
        </span>
      )}
      <span className="regul-summary-pol" aria-hidden="true">
        {tr({ fr: 'Politiques', en: 'Policies' })} <b>{activeCount}/{policyMax}</b>
      </span>
    </span>
  );
}

/**
 * POIGNÉE DÉPLIÉE de la Cité, au bureau (refonte « la ville d'abord », maquette
 * V4) : les quatre foyers, chacun avec SON PREMIER ÉDIT — le geste réflexe — et
 * la porte du Conseil, où vivent les réformes, les politiques et l'Intendance.
 * Au doigt, la feuille garde la barre complète (CrisisActionBar).
 */
export function RegulQuick() {
  useGameState((s) => s.instability);
  useGameState((s) => s.cycles);
  useGameState((s) => s.regulFatigue || 0);
  const foyers = regulationFoyers();
  return (
    <div className="regul-quick">
      {foyers.map((f) => {
        // Le premier apaisement ouvert du foyer ; à défaut (Dissidence avant le
        // cycle 2), sa première action, réforme comprise.
        const first = f.actions.find((a) => !a.locked && !a.reform && !a.gamble) || f.actions.find((a) => !a.locked) || f.actions[0];
        return (
          <div key={f.key} className={`regul-quick-foyer regul-summary-foyer--${f.tone}`}>
            <span className="regul-quick-head">
              <FoyerIcon k={f.key} />
              <span className="regul-quick-name">{f.label}</span>
              <strong className="regul-quick-val">{pct(f.value)}</strong>
            </span>
            <span className="regul-summary-track" aria-hidden="true">
              <span className="regul-summary-fill" style={{ width: `${Math.min(1, f.value || 0) * 100}%` }}></span>
            </span>
            {first && <RegulButton a={first} label={first.label} btnClass="crisis-regul-btn regul-quick-btn" />}
          </div>
        );
      })}
      <button type="button" className="btn-secondary regul-quick-council" onClick={() => openView('regulation')}>
        {tr({ fr: 'Le Conseil', en: 'The Council' })} ▸
      </button>
    </div>
  );
}

export default function CrisisActionBar() {
  useGameState(s => s.instability);
  // Les décrets de la Dissidence s'ouvrent aux cycles 2 et 3 (regulModel.js).
  useGameState(s => s.cycles);
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
  const relief = state.foyerRelief || {};
  const reform = state.foyerReform || {};
  // Foyers, décrets et politiques : regulModel.js, source partagée avec le Conseil.
  const foyers = regulationFoyers();
  const { policies, activeCount, max: policyMax, slotsFull } = regulationPolicies();
  const policiesSection = (
    <div className="crisis-policies">
      <div className="crisis-policies-head">
        <span className="crisis-regul-title">{tr({ fr: 'Politiques permanentes', en: 'Permanent Policies' })}</span>
        <span className="crisis-policies-count">{activeCount}/{policyMax}</span>
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
