import { useRef, useState, useEffect } from 'react';
import { buyBuilding } from '../../game/core/actions.js';
import { state, buildingById } from '../../game/core/state.js';
import { fmtShort, labelFor } from '../../game/core/utils.js';
import { tr } from '../../game/core/i18n.js';
import { D } from '../../game/core/num.js';
import { roadWorkCost, roadNextInfo, roadWorksCount, roadWorksState, roadWorksBank } from '../../game/core/actions/roadWorks.js';
import { ROAD_WORK_QUEUE_MAX, ROAD_WORKS_BANK_MAX } from '../../game/core/balance.js';
import { RES_ICONS } from './resourceIcons.js';
import { roadNetworkInfo } from './roadNetwork.js';
import { tipProps } from './HelpBubble.jsx';

/**
 * Encart Voirie — tableau de bord de chantier (carte blanche Raph 2026-07-29 :
 * « comprendre comment ça marche sans tout écrire, juste les jauges et le
 * bouton d'achat »). Architecture À PART des PurchaseRow (les pseudo-éléments
 * de .purchase-row appartiennent au splash-art) : trois étages, zéro phrase —
 *   1. en-tête : nom + jauge réseau → « 82% · +8.2% » ;
 *   2. la vie du chantier : barre du chantier actif + file en pastilles,
 *      remplacée par les pips de réserve quand le réseau est achevé ;
 *   3. LE bouton-verbe : l'icône et le verbe disent la phase (raccorder /
 *      élargir / doubler en autoroute / mettre en réserve), tuiles et prix.
 * Le texte long vit dans les infobulles. Aucune logique de jeu ici : tout
 * passe par buyBuilding("roads") → buyRoadWorkCore.
 */
export default function RoadworksPanel({ building: b }) {
  const [floats, setFloats] = useState([]);
  const [shaking, setShaking] = useState(false);
  const timersRef = useRef([]);
  const floatIdRef = useRef(0);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  const next = roadNextInfo();
  const cost = roadWorkCost();
  const queued = roadWorksCount();
  const bank = roadWorksBank();
  const active = roadWorksState().active;
  const net = roadNetworkInfo();

  const done = next.kind === "done";
  const full = !done && queued >= ROAD_WORK_QUEUE_MAX;
  const buyable = !full && !!cost && D(state.knowledge).gte(cost);

  const spawnFloat = (text) => {
    const id = floatIdRef.current += 1;
    setFloats((f) => [...f, { id, text }]);
    timersRef.current.push(setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900));
  };
  const doShake = () => {
    setShaking(true);
    timersRef.current.push(setTimeout(() => setShaking(false), 400));
  };
  const handleBuy = () => {
    if (buyBuilding("roads")) spawnFloat(done ? tr({ fr: "+1 en réserve", en: "+1 stockpiled" }) : tr({ fr: "+1 chantier", en: "+1 work site" }));
    else doShake();
  };

  // Bouton-verbe : icône + libellé selon la phase.
  const targetMeta = next.kind === "link" && next.targetId ? buildingById[next.targetId] : null;
  const tiles = Math.max(1, next.tiles | 0);
  const phase = done ? "bank"
    : next.kind === "widen" ? (next.toRank === "twin" ? "twin" : "widen")
    : "link";
  const phaseIcon = phase === "link" ? "fa-link"
    : phase === "twin" ? "fa-road"
    : phase === "widen" ? "fa-arrows-left-right"
    : "fa-box-archive";
  const verb = phase === "bank"
    ? (cost ? tr({ fr: "Mettre en réserve", en: "Stockpile" }) : tr({ fr: "Réserve pleine", en: "Stockpile full" }))
    : full ? tr({ fr: "File pleine", en: "Queue full" })
    : phase === "twin" ? tr({ fr: "Doubler en autoroute", en: "Twin into a highway" })
    : phase === "widen"
      ? tr({
        fr: `Élargir en ${next.toRank === "main" ? "boulevard" : "avenue"}`,
        en: `Widen into ${next.toRank === "main" ? "a boulevard" : "an avenue"}`
      })
      : (next.count || 1) > 1
        ? tr({ fr: `Raccorder ${next.count} bâtiments`, en: `Link ${next.count} buildings` })
        : targetMeta
          ? tr({ fr: `Raccorder : ${tr(targetMeta.name)}`, en: `Link: ${tr(targetMeta.name)}` })
          : tr({ fr: "Raccorder le prochain bâtiment", en: "Link the next building" });

  const activePct = active ? Math.round(100 * Math.max(0, Math.min(1, 1 - active.left / active.total))) : 0;

  return (
    <article
      className={`roadworks-panel${buyable ? " is-affordable" : ""}${shaking ? " rw-shake" : ""}`}
      onPointerDown={() => { if (!buyable) doShake(); }}
    >
      <div className="rw-head">
        <h3 className="rw-name" {...tipProps(tr(b.name), tr(b.desc))}>{tr(b.name)}</h3>
        <span
          className="rw-net"
          {...tipProps(null, tr({
            fr: `${net.rank} : ${net.pct} % des bâtiments achetables desservables ont une rue à leur porte ; les habitations, elles, se raccordent toutes seules par leurs venelles.`
              + (net.doors ? ` Portes réelles : ${net.doors.onRoad} sur ${net.doors.total} — les autres sont enclavés au cœur des pâtés, aucune venelle ne peut les atteindre.` : "")
              + ` Bonus de production global : +${net.bonus} % (maximum +10 %), plus un léger bonus par grand axe élargi. Chaque chantier raccorde une vague de bâtiments, puis élargit les axes les plus empruntés jusqu'à l'autoroute ; l'excédent part en réserve et se lance tout seul quand la ville grandit.`,
            en: `${net.rank}: ${net.pct}% of servable purchasable buildings have a street at their door; homes link themselves through their lanes.`
              + (net.doors ? ` Actual doors: ${net.doors.onRoad} of ${net.doors.total} — the rest sit landlocked inside dense blocks, no lane can reach them.` : "")
              + ` Global production bonus: +${net.bonus}% (up to +10%), plus a small bonus per widened street. Each work site links a wave of buildings, then widens the busiest streets up to highways; surplus goes to the stockpile and launches by itself as the city grows.`
          }))}
        >
          <span className="rw-net-track" aria-hidden="true">
            <span className={`rw-net-fill${net.pct >= 100 ? " is-full" : ""}`} style={{ width: `${net.pct}%` }} />
          </span>
          <span className="rw-net-label">{net.pct}% · +{net.bonus}%</span>
        </span>
      </div>

      {done ? (
        <div
          className="rw-line"
          {...tipProps(null, tr({
            fr: `Réseau achevé. Chantiers en réserve : ${bank}/${ROAD_WORKS_BANK_MAX} — prépayés, ils se lancent tout seuls dès que la ville repropose du travail.`,
            en: `Network complete. Stockpiled work sites: ${bank}/${ROAD_WORKS_BANK_MAX} — prepaid, they launch by themselves as soon as the city offers new work.`
          }))}
        >
          <i className="fa-solid fa-box-archive rw-line-icon rw-bank-icon" aria-hidden="true"></i>
          <span className="rw-bank-pips" aria-hidden="true">
            {Array.from({ length: ROAD_WORKS_BANK_MAX }, (_, i) => (
              <span key={i} className={`rw-pip${i < bank ? " is-filled" : ""}`} />
            ))}
          </span>
          <span className="rw-bank-count">{bank}/{ROAD_WORKS_BANK_MAX}</span>
        </div>
      ) : (
        <div
          className="rw-line"
          {...tipProps(null, active
            ? tr({
              fr: `${active.kind === "widen" ? "Élargissement" : "Raccord"} en cours, ${Math.max(1, Math.ceil(active.left))} s restantes. File : ${queued}/${ROAD_WORK_QUEUE_MAX}.`,
              en: `${active.kind === "widen" ? "Widening" : "Link"} in progress, ${Math.max(1, Math.ceil(active.left))}s left. Queue: ${queued}/${ROAD_WORK_QUEUE_MAX}.`
            })
            : tr({ fr: "L'équipe de cantonniers est libre.", en: "The road crew is idle." }))}
        >
          <i className="fa-solid fa-hammer rw-line-icon" aria-hidden="true"></i>
          <span className="rw-work-track" aria-hidden="true">
            <span className="rw-work-fill" style={{ width: `${activePct}%` }} />
          </span>
          <span className="rw-queue" aria-hidden="true">
            {Array.from({ length: ROAD_WORK_QUEUE_MAX }, (_, i) => (
              <span key={i} className={`rw-dot${i < queued ? " is-filled" : ""}`} />
            ))}
          </span>
          {bank > 0 && (
            <span className="rw-bank-count" {...tipProps(null, tr({ fr: `En réserve : ${bank}`, en: `Stockpiled: ${bank}` }))}>
              <i className="fa-solid fa-box-archive" aria-hidden="true"></i> {bank}
            </span>
          )}
        </div>
      )}

      <button className="rw-buy" disabled={!buyable} onClick={handleBuy}>
        {floats.map((f) => (
          <span key={f.id} className="rw-float" aria-hidden="true">{f.text}</span>
        ))}
        <i className={`fa-solid ${phaseIcon} rw-buy-icon${phase === "bank" ? " rw-bank-icon" : ""}`} aria-hidden="true"></i>
        <span className="rw-buy-verb">{verb}</span>
        {!done && !full && (
          <span className="rw-buy-tiles">{tiles} {tr({ fr: `tuile${tiles > 1 ? "s" : ""}`, en: `tile${tiles > 1 ? "s" : ""}` })}</span>
        )}
        {cost && (
          <span className={`rw-buy-cost${buyable ? "" : " is-lacking"}`} {...tipProps(null, `${fmtShort(cost)} ${labelFor("knowledge")}`)}>
            <i className={`fa-solid ${RES_ICONS.knowledge || "fa-circle"}`} aria-hidden="true"></i>
            {fmtShort(cost)}
          </span>
        )}
      </button>
    </article>
  );
}
