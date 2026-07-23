import { memo, useRef, useState } from 'react';
import { buyBuilding } from '../../game/core/actions.js';
import { state, setBuyAmount, invalidateRenderCache } from '../../game/core/state.js';
import { fmt, fmtShort, signed, signedShort, labelFor, rateScale } from '../../game/core/utils.js';
import { currentEraIndex } from '../../game/core/mechanics.js';
import { tr } from '../../game/core/i18n.js';
import { RES_ICONS } from './resourceIcons.js';
import { tipProps } from './HelpBubble.jsx';
import { splashSrcFor } from '../../game/data/pixelSplash.js';

const RES_CLASS = {
  population: "res-pop",
  food: "res-food",
  gold: "res-gold",
  knowledge: "res-know",
  infrastructure: "res-infra"
};

/* Valeur exacte pour le tooltip des suffixes (Sx, Oc, Qi…) */
function exactLabel(value) {
  const n = typeof value?.toNumber === "function" ? value.toNumber() : value;
  if (!Number.isFinite(n)) {
    return typeof value?.toExponential === "function" ? value.toExponential(3) : String(value);
  }
  if (Math.abs(n) >= 1e15) return n.toExponential(3);
  return Math.round(n).toLocaleString("fr-FR");
}

/* État du réseau routier pour la rangée `roads` : les routes RELIENT les bâtiments
   (couverture = bâtiments-moteur reliés / total, écrite par la carte dans
   state.roadCoverage) et donnent jusqu'à +10 % de production (roadNetworkMultiplier).
   Le rang suit l'ère, mêmes seuils que le rang des connecteurs (layout.js). */
function roadNetworkInfo() {
  const cov = state.roadCoverage;
  const c = (typeof cov === "number" && cov > 0) ? Math.min(1, cov) : 0;
  const ei = currentEraIndex();
  const rank = ei >= 30
    ? { fr: "Boulevards", en: "Boulevards" }
    : ei >= 20 ? { fr: "Avenues", en: "Avenues" }
    : ei >= 10 ? { fr: "Routes", en: "Roads" }
    : { fr: "Sentiers", en: "Paths" };
  return { pct: Math.round(c * 100), bonus: Math.round(c * 100) / 10, rank: tr(rank) };
}

/**
 * Rangée d'achat de bâtiment (Audit UI Phase 3).
 * — coût intégré au bouton, état affordable au niveau de la ligne,
 *   compteur fantôme, barre de progression vers le prochain palier.
 * Aucune logique de jeu : tout passe par buyBuilding / buildingBatchCost.
 */
function PurchaseRow({
  building: b,
  count,
  prices,
  buyAmount,
  affordable,
  babelBlocked,
  // Trois états lisibles SANS la couleur (E5) : "affordable", "soon", "locked".
  // Calculé par le parent, qui seul dispose de l'échéance en secondes ; le
  // déduire ici du libellé d'ETA obligerait à parser une phrase TRADUITE.
  rowState = "locked",
  milestoneInfo,
  step,
  tier,
  production,
  lackingKey,
  pulse,
  queuePos,
  queueable,
  queueFull,
  onToggleQueue,
  etaLabel
}) {
  // Les niveaux sont des entiers : pas de décimale sous 1000 (fmt(0) → "0.0").
  // Au-delà, compact forcé (fmtShort) : un compteur « full » déborderait la pastille.
  const countLabel = count < 1000 ? String(count) : fmtShort(count);
  const stepLabel = b.category === "city" ? "×2" : "×1.5";
  // Pas des jalons fourni par le parent (milestoneStepSize) : il tombe de 25 à 20
  // avec le capstone Ville-Monde. Il était codé en dur ici, donc la barre et
  // l'infobulle mentaient dès le capstone acquis, alors que l'achat, lui,
  // appliquait déjà le bon pas.
  const stepSize = step || 25;
  const inStep = count % stepSize;
  const nextIn = stepSize - inStep;
  const stepPct = (inStep / stepSize) * 100;

  // Splash-art de fond (filigrane), résolu selon le bâtiment ET l'ère en cours.
  // null tant qu'aucun splash n'existe pour ce bâtiment → carte normale.
  const splash = splashSrcFor(b.id, currentEraIndex());

  // Devises manquantes : signature fournie par le parent (abonné aux ressources).
  const lackingSet = lackingKey ? new Set(lackingKey.split(",")) : null;

  /* Game feel (Phase 7) : +N flottant à l'achat, shake si impayable */
  const [floats, setFloats] = useState([]);
  const [shaking, setShaking] = useState(false);
  const floatId = useRef(0);

  const spawnFloat = (text) => {
    const id = ++floatId.current;
    setFloats((f) => [...f, { id, text }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
  };

  const doShake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  };

  const handleBuy = (event) => {
    const before = state.buildings[b.id] || 0;
    if (event.shiftKey || event.ctrlKey) {
      const previous = state.buyAmount;
      setBuyAmount(event.ctrlKey ? 100 : 10);
      buyBuilding(b.id);
      setBuyAmount(previous);
      invalidateRenderCache("buildings");
    } else {
      buyBuilding(b.id);
    }
    const gained = (state.buildings[b.id] || 0) - before;
    if (gained > 0) spawnFloat(`+${gained}`);
    else doShake();
  };

  /* Clic sur une rangée impayable (le bouton disabled n'émet pas de click) */
  const handleRowPointerDown = () => {
    if (!affordable) doShake();
  };

  const rowClass = [
    "purchase-row",
    affordable ? "is-affordable" : "is-locked-cost",
    babelBlocked ? "babel-blocked" : "",
    pulse ? "pr-pulse" : "",
    shaking ? "pr-shake" : "",
    splash ? "pr-has-splash" : ""
  ].filter(Boolean).join(" ");

  return (
    <article
      className={rowClass}
      // ÉTAT LISIBLE SANS LA COULEUR (E5). `is-affordable` / `is-locked-cost`
      // ne portaient qu'une teinte, et le jeu se joue sous vignette de crise
      // rouge et en mode deuil (l'application entière passe en grayscale) : la
      // couleur y disparaît purement et simplement. `data-state` porte les
      // TROIS états et le CSS y accroche une FORME, pas une nuance.
      data-state={rowState}
      data-tier={tier > 0 ? tier : undefined}
      style={splash ? { "--pr-splash": `url(${splash})` } : undefined}
      onPointerDown={handleRowPointerDown}
    >
      {/* Pastille d'état (E5). Purement visuelle : l'état est déjà dit en
          toutes lettres par le libellé d'échéance et par le bouton d'achat. */}
      <span className="pr-state-pip" aria-hidden="true" />
      <div className="pr-name-row">
        <h3 className="pr-name" {...tipProps(tr(b.name), tr(b.desc))}>{tr(b.name)}</h3>
        {milestoneInfo && (
          <span
            className="pr-milestone-badge"
            {...tipProps(null, tr({ fr: `Bonus de production de palier : ×${fmt(milestoneInfo.bonus)} (${milestoneInfo.label})`, en: `Milestone production bonus: ×${fmt(milestoneInfo.bonus)} (${milestoneInfo.label})` }))}
          >
            <i className="fa-solid fa-bolt" aria-hidden="true"></i>
            {"×"}{fmtShort(milestoneInfo.bonus)}
          </span>
        )}
      </div>

      <div className="pr-prod">
          {production.length === 0 ? (
            <span className="pr-prod-item pr-prod-indirect">{tr({ fr: "effet indirect", en: "indirect effect" })}</span>
          ) : (
            production.map(([key, value]) => {
              // UNITÉ ADAPTATIVE (B4). Les effets indirects de la boutique sont
              // souvent bien sous 1/s — les Conteurs rendent 0,01 Rayonnement,
              // affiché « +0.0/s », c'est-à-dire rien. En horaire, 36/h.
              // ⚠ `value` est un NUMBER natif ici (le produit est fait en
              // flottant par buildingProductionSegments), pas un Decimal.
              const r = rateScale(value);
              return (
                <span
                  key={key}
                  className={`pr-prod-item ${RES_CLASS[key] || ""}`}
                  {...tipProps(null, `${labelFor(key)} : ${signed(value)}/s`)}
                >
                  {signedShort(r.value)}{r.unit}
                </span>
              );
            })
          )}
          {b.id === "roads" && (() => {
            const net = roadNetworkInfo();
            return (
              <span
                className="pr-prod-item res-infra"
                {...tipProps(null, () => {
                  // VALEUR VIVANTE : la couverture est écrite par la carte dans
                  // state.roadCoverage, hors des props comparées par
                  // arePropsEqual — une chaîne figerait le pourcentage à
                  // l'ouverture de la bulle. On relit donc à chaque passe.
                  const live = roadNetworkInfo();
                  return tr({
                    fr: `${live.rank} : ${live.pct} % des bâtiments-moteur sont reliés au réseau. Bonus de production global : +${live.bonus} % (maximum +10 % quand tout est relié). Chaque route achetée étend le réseau d'une tuile vers le bâtiment le plus proche.`,
                    en: `${live.rank}: ${live.pct}% of engine buildings are linked to the network. Global production bonus: +${live.bonus}% (up to +10% when everything is linked). Each road purchased extends the network one tile toward the nearest building.`
                  });
                })}
              >
                {net.rank} · {net.pct}% {tr({ fr: "relié", en: "linked" })} (+{net.bonus}%)
              </span>
            );
          })()}
        </div>

        <div
          className="pr-step-track"
          {...tipProps(null, tr({ fr: `Palier ${stepLabel} dans ${nextIn} achat${nextIn > 1 ? "s" : ""}`, en: `${stepLabel} milestone in ${nextIn} purchase${nextIn > 1 ? "s" : ""}` }))}
          aria-hidden="true"
        >
          <span style={{ width: `${stepPct}%` }}></span>
        </div>

        {/* DÉLAI AVANT ACHAT (B5) : n'existe que sur une rangée impayable, donc
            aucune ligne ajoutée à celles qu'on peut acheter. Le libellé arrive
            DÉJÀ FORMATÉ du parent — le comparateur de mémoïsation reste ainsi
            une comparaison de primitives. */}
        {etaLabel && (
          <div
            className="pr-eta"
            {...tipProps(null, tr({
              fr: "Au rythme actuel de production. Un bonus temporaire ou une chute de rendement le change.",
              en: "At the current production rate. A temporary bonus or a drop in output changes it."
            }))}
          >
            {etaLabel}
          </div>
        )}

        <div className="pr-footer">
          {/* TERNAIRE COUPÉ (B1). Un bouton `disabled` ne reçoit aucun événement
              souris dans Chrome, ni lui ni ses enfants : la bulle maison ne peut
              donc pas s'y ouvrir, alors que le `title` natif s'y affiche encore.
              On garde les deux, chacun sur son état — bulle quand la rangée est
              payable (le cas courant), `title` quand elle ne l'est pas, là où le
              coût exact est justement ce qu'on cherche. Tout garder en natif
              laissait une infobulle système sur chaque rangée abordable. */}
          <button
            className={`btn-purchase${floats.length ? " bp-flash" : ""}`}
            disabled={!affordable}
            onClick={handleBuy}
            title={affordable ? undefined : tr({ fr: "Shift-clic : ×10 · Ctrl-clic : ×100", en: "Shift-click: ×10 · Ctrl-click: ×100" })}
            {...tipProps(null, affordable ? tr({ fr: "Shift-clic : ×10 · Ctrl-clic : ×100", en: "Shift-click: ×10 · Ctrl-click: ×100" }) : null)}
          >
            {floats.map((f) => (
              <span key={f.id} className="pr-float" aria-hidden="true">{f.text}</span>
            ))}
            <span className="bp-action">
              {buyAmount === "max"
                ? tr({ fr: "Acheter Max", en: "Buy Max" })
                : buyAmount === "step"
                  // La quantité est propre à cette rangée : on l'affiche, sinon
                  // « Acheter Palier » ne dit pas ce qu'on s'apprête à payer.
                  ? tr({ fr: `Acheter ×${nextIn}`, en: `Buy ×${nextIn}` })
                  : tr({ fr: `Acheter ×${buyAmount}`, en: `Buy ×${buyAmount}` })}
            </span>
            <span className="bp-cost">
              {Object.entries(prices).map(([currency, amount]) => (
                <span
                  key={currency}
                  className={`bp-cost-item${lackingSet?.has(currency) ? " is-lacking" : ""}`}
                  title={affordable ? undefined : `${exactLabel(amount)} ${labelFor(currency)}`}
                  {...tipProps(null, affordable ? `${exactLabel(amount)} ${labelFor(currency)}` : null)}
                >
                  <i className={`fa-solid ${RES_ICONS[currency] || "fa-circle"}`} aria-hidden="true"></i>
                  {fmtShort(amount)}
                </span>
              ))}
            </span>
          </button>
          {/* ÉPINGLE (C8) : la file achètera cette cible dès qu'elle sera
              finançable. Absente pour ce qui ne s'achète pas en masse (coût en
              Ruines) — la file ne doit jamais ponctionner l'arbre permanent. */}
          {queueable && (
            // Même ternaire coupé que le bouton d'achat : l'épingle ne se
            // désactive que dans un seul cas, file pleine ET cible non épinglée,
            // qui est aussi le seul où son libellé explique quoi faire.
            <button
              type="button"
              className={`pr-pin${queuePos ? " is-queued" : ""}`}
              disabled={!queuePos && queueFull}
              onClick={(e) => { e.stopPropagation(); onToggleQueue(b.id); }}
              aria-pressed={!!queuePos}
              title={!queuePos && queueFull
                ? tr({ fr: "La file est pleine : retire une cible d'abord.", en: "The queue is full: remove a target first." })
                : undefined}
              {...tipProps(null, !queuePos && queueFull
                ? null
                : queuePos
                  ? tr({ fr: `Cible n° ${queuePos} de la file (×${buyAmount === "step" ? nextIn : buyAmount}). Cliquer pour retirer.`, en: `Target #${queuePos} in the queue. Click to remove.` })
                  : tr({ fr: "Épingler : la cité l'achètera dès que ce sera finançable, dans l'ordre de la file.", en: "Pin: the city will buy it as soon as it is affordable, in queue order." }))}
            >
              <i className="fa-solid fa-thumbtack" aria-hidden="true"></i>
              {queuePos ? <span className="pr-pin-pos">{queuePos}</span> : null}
            </button>
          )}
          <span className="pr-count" {...tipProps(null, tr({ fr: `Possédés : ${countLabel}`, en: `Owned: ${countLabel}` }))} aria-label={tr({ fr: `${countLabel} possédés`, en: `${countLabel} owned` })}>
            <span className="pr-count-x" aria-hidden="true">×</span>{countLabel}
          </span>
        </div>
    </article>
  );
}

/**
 * Le parent (BuildingShop) se re-rend à chaque tick (instances Decimal des
 * ressources). On bloque ici le re-render des rangées dont l'affichage n'a pas
 * bougé. `milestoneInfo` et `production` sont recréés à chaque rendu parent mais
 * dérivent de (building, count, globalMult) : on compare ces entrées, pas les
 * objets. `globalMult` n'est passé que pour ce comparateur (proxy de production).
 */
function arePropsEqual(prev, next) {
  return (
    prev.building === next.building &&
    prev.count === next.count &&
    prev.prices === next.prices &&          // ref stable (costById mémoïsé)
    prev.buyAmount === next.buyAmount &&
    prev.step === next.step &&              // capstone Ville-Monde : 25 → 20
    prev.affordable === next.affordable &&
    prev.babelBlocked === next.babelBlocked &&
    prev.tier === next.tier &&
    prev.pulse === next.pulse &&
    prev.globalMult === next.globalMult &&  // production = f(count, globalMult, building)
    prev.lackingKey === next.lackingKey &&  // highlight is-lacking par devise
    // File d'achats (C8). Sans ces trois-là, l'épingle resterait figée sur son
    // ancien rang jusqu'au prochain achat : la rangée est mémoïsée, tout ce qui
    // s'affiche doit être comparé ici.
    prev.queuePos === next.queuePos &&
    prev.queueable === next.queueable &&
    prev.queueFull === next.queueFull &&
    // Délai avant achat (B5) : une CHAÎNE déjà formatée, donc comparable comme
    // une primitive. L'oublier ici figerait le compte à rebours sur sa première
    // valeur jusqu'au prochain achat, en silence.
    prev.etaLabel === next.etaLabel &&
    // État à trois valeurs (E5). Même piège que l'ETA juste au-dessus : la
    // rangée est mémoïsée, donc TOUT ce qui s'affiche doit être comparé ici,
    // sinon le pip reste figé sur son premier état jusqu'au prochain achat.
    prev.rowState === next.rowState
  );
}

export default memo(PurchaseRow, arePropsEqual);
