import { useGameState } from '../../hooks/useGameState.js';
import { annalsWindow } from '../../game/core/annals.js';
import { state } from '../../game/core/state.js';
import { tr } from '../../game/core/i18n.js';
import { REGULATION_ACTIONS_BY_ID, POLICY_BY_ID } from '../../game/data/regulationActions.js';
import { FOYER_REFORM, REFORM_ACTION_FOYER } from '../../game/core/balance.js';
import { BASE_ACTION_LABELS } from '../../game/core/actions.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * Les Annales (pilier 2 de la Chancellerie) — version DENSE (passe 2026-07-14) :
 * plus de panneau, courbe au-dessus, registre en LIGNES UNIQUES dessous
 * (libellé + effet + signature/moment ; le foyer est parti — la couleur du
 * chip suffit). ⚠ passé seulement : ni vitesse ni ETA (décision actée).
 */

const W = 600, H = 152, X0 = 6, X1 = 594, Y_BOTTOM = 132, Y_TOP = 12, Y_LANE = 143;

const MARK_LABELS = {
  soothe: { fr: 'édit posé', en: 'edict passed' },
  reform: { fr: 'réforme de fond', en: 'deep reform' },
  gambleWin: { fr: 'pari gagné', en: 'gamble won' },
  gambleLoss: { fr: 'pari perdu', en: 'gamble lost' },
  doubleWin: { fr: 'quitte ou double gagné', en: 'double or nothing won' },
  doubleLoss: { fr: 'quitte ou double perdu', en: 'double or nothing lost' },
  crisis: { fr: 'crise narrative', en: 'narrative crisis' },
  policyOn: { fr: 'politique activée', en: 'policy enabled' },
  policyOff: { fr: 'politique suspendue', en: 'policy disabled' }
};

const GAMBLE_KINDS = new Set(['gambleWin', 'gambleLoss', 'doubleWin', 'doubleLoss']);

export function regulActionLabel(id) {
  if (REGULATION_ACTIONS_BY_ID[id]) return tr(REGULATION_ACTIONS_BY_ID[id].label);
  if (BASE_ACTION_LABELS[id]) return tr(BASE_ACTION_LABELS[id]);
  if (REFORM_ACTION_FOYER[id]) return tr(FOYER_REFORM[REFORM_ACTION_FOYER[id]].label);
  if (POLICY_BY_ID[id]) return tr(POLICY_BY_ID[id].label);
  return id;
}

function ago(t, now) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return tr({ fr: "à l'instant", en: 'just now' });
  if (s < 60) return tr({ fr: `il y a ${s} s`, en: `${s}s ago` });
  const m = Math.round(s / 60);
  return tr({ fr: `il y a ${m} min`, en: `${m} min ago` });
}

function MarkGlyph({ mark, x }) {
  const y = Y_LANE;
  const label = `${tr(MARK_LABELS[mark.kind] || { fr: mark.kind, en: mark.kind })}${mark.id ? ` — ${regulActionLabel(mark.id)}` : ''}`;
  let shape;
  switch (mark.kind) {
    case 'reform':
      shape = <rect x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" fill="#F0B429" transform={`rotate(45 ${x} ${y})`} />;
      break;
    case 'gambleWin':
    case 'doubleWin':
      shape = <path d={`M${x} ${y - 4.2} L${x + 3.8} ${y + 2.6} L${x - 3.8} ${y + 2.6} Z`} fill="#36B37E" />;
      break;
    case 'gambleLoss':
    case 'doubleLoss':
      shape = <path d={`M${x} ${y - 4.2} L${x + 3.8} ${y + 2.6} L${x - 3.8} ${y + 2.6} Z`} fill="#e2704b" />;
      break;
    case 'crisis':
      shape = <rect x={x - 3} y={y - 3} width="6" height="6" fill="#ef4444" />;
      break;
    case 'policyOn':
      shape = <rect x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" fill="#9B5DE5" transform={`rotate(45 ${x} ${y})`} />;
      break;
    case 'policyOff':
      shape = <rect x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" fill="none" stroke="#9B5DE5" strokeWidth="1.2" transform={`rotate(45 ${x} ${y})`} />;
      break;
    default:
      shape = <circle cx={x} cy={y} r="3.1" fill="#36B37E" />;
  }
  return <g>{shape}<title>{label}</title></g>;
}

function DeltaChip({ e }) {
  const pts = Math.round((e.delta || 0) * 100);
  if (e.kind === 'policyOn') return <span className="annals-chip annals-chip--policy">{tr({ fr: 'activée', en: 'enabled' })}</span>;
  if (e.kind === 'policyOff') return <span className="annals-chip annals-chip--mut">{tr({ fr: 'suspendue', en: 'disabled' })}</span>;
  if (e.kind === 'gambleLoss') return <span className="annals-chip annals-chip--loss">+{pts} pts</span>;
  if (e.kind === 'doubleWin') return <span className="annals-chip annals-chip--gain">−{pts} pts ×2</span>;
  if (e.kind === 'doubleLoss') return <span className="annals-chip annals-chip--loss">{tr({ fr: 'repris', en: 'taken back' })}</span>;
  if (pts <= 0) return <span className="annals-chip annals-chip--mut">{tr({ fr: 'sans effet', en: 'no effect' })}</span>;
  const cls = e.kind === 'reform' ? 'annals-chip--reform' : 'annals-chip--gain';
  return <span className={`annals-chip ${cls}`}>−{pts} pts</span>;
}

export default function CycleAnnals() {
  useGameState((s) => s.instability);
  useGameState((s) => (s.regulLedger || []).map((e) => e.t).join(','));
  const { samples, marks, windowMs, now } = annalsWindow();
  const t0 = now - windowMs;
  const xFor = (t) => X0 + Math.max(0, Math.min(1, (t - t0) / windowMs)) * (X1 - X0);
  const yFor = (v) => Y_BOTTOM - Math.max(0, Math.min(1, v)) * (Y_BOTTOM - Y_TOP);

  const pts = samples.map((s) => `${xFor(s.t).toFixed(1)},${yFor(s.v).toFixed(1)}`).join(' ');
  const area = samples.length >= 2
    ? `${pts} ${xFor(samples[samples.length - 1].t).toFixed(1)},${Y_BOTTOM} ${xFor(samples[0].t).toFixed(1)},${Y_BOTTOM}`
    : null;

  const ledger = (state.regulLedger || []).slice(-6).reverse();

  return (
    <section className="regul-block annals-block">
      <h3
        className="regul-block-title"
        {...tipProps(
          tr({ fr: 'Les Annales', en: 'The Annals' }),
          tr({ fr: 'La Rupture sur les 10 dernières minutes, vos décisions marquées dessus, et le registre des derniers actes.', en: 'The Rupture over the last 10 minutes, your decisions marked on it, and the ledger of recent acts.' })
        )}
      >
        {tr({ fr: 'Les Annales', en: 'The Annals' })}
      </h3>
      {samples.length >= 2 ? (
        <svg className="annals-chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
          aria-label={tr({ fr: 'Courbe de la Rupture sur les dix dernières minutes, avec les décisions marquées', en: 'Rupture curve over the last ten minutes, with decisions marked' })}>
          <line x1={X0} y1={Y_TOP} x2={X1} y2={Y_TOP} stroke="rgba(239,68,68,0.45)" strokeWidth="1" strokeDasharray="5 5" />
          <line x1={X0} y1={Y_BOTTOM} x2={X1} y2={Y_BOTTOM} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          {area && <polygon points={area} fill="rgba(220,95,75,0.10)" />}
          <polyline points={pts} fill="none" stroke="#dc5f4b" strokeWidth="1.8" strokeLinejoin="round" />
          {marks.map((m, i) => <MarkGlyph key={`${m.t}-${i}`} mark={m} x={xFor(m.t)} />)}
        </svg>
      ) : (
        <div className="annals-empty">
          {tr({ fr: "Les annales s'écrivent — la courbe apparaît au fil des minutes.", en: 'The annals are being written — the curve appears as minutes pass.' })}
        </div>
      )}
      <div className="annals-legend">
        <span className="annals-axis-note">−10 min → {tr({ fr: 'maintenant', en: 'now' })}</span>
        <span><i className="annals-dot" style={{ background: '#36B37E' }}></i>{tr({ fr: 'édit', en: 'edict' })}</span>
        <span><i className="annals-dot annals-dot--diamond" style={{ background: '#F0B429' }}></i>{tr({ fr: 'réforme', en: 'reform' })}</span>
        <span><i className="annals-dot annals-dot--tri" style={{ borderBottomColor: '#e2704b' }}></i>{tr({ fr: 'pari', en: 'gamble' })}</span>
        <span><i className="annals-dot annals-dot--square" style={{ background: '#ef4444' }}></i>{tr({ fr: 'crise', en: 'crisis' })}</span>
        <span><i className="annals-dot annals-dot--diamond" style={{ background: '#9B5DE5' }}></i>{tr({ fr: 'politique', en: 'policy' })}</span>
      </div>
      {ledger.length > 0 && (
        <ul className="annals-ledger-list">
          {ledger.map((e, i) => (
            <li key={`${e.t}-${i}`} className="annals-ledger-row">
              <span className="annals-ledger-label">
                {GAMBLE_KINDS.has(e.kind) && <span aria-hidden="true">🎲 </span>}
                {regulActionLabel(e.id)}
              </span>
              <DeltaChip e={e} />
              <span className="annals-ledger-meta">
                {e.by ? `✍ ${e.by} · ` : ''}{ago(e.t, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
