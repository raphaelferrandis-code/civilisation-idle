import { memo, useRef, useState } from 'react';
import { buyBuilding } from '../../game/core/actions.js';
import { state, setBuyAmount, invalidateRenderCache } from '../../game/core/state.js';
import { fmt, fmtShort, signed, signedShort, labelFor } from '../../game/core/utils.js';
import { currentEraIndex } from '../../game/core/mechanics.js';
import { tr } from '../../game/core/i18n.js';
import { RES_ICONS } from './resourceIcons.js';
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
  milestoneInfo,
  step,
  tier,
  production,
  lackingKey,
  pulse
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
      data-tier={tier > 0 ? tier : undefined}
      style={splash ? { "--pr-splash": `url(${splash})` } : undefined}
      onPointerDown={handleRowPointerDown}
    >
      <div className="pr-name-row">
        <h3 className="pr-name" title={tr(b.desc)}>{tr(b.name)}</h3>
        {milestoneInfo && (
          <span
            className="pr-milestone-badge"
            title={tr({ fr: `Bonus de production de palier : ×${fmt(milestoneInfo.bonus)} (${milestoneInfo.label})`, en: `Milestone production bonus: ×${fmt(milestoneInfo.bonus)} (${milestoneInfo.label})` })}
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
            production.map(([key, value]) => (
              <span
                key={key}
                className={`pr-prod-item ${RES_CLASS[key] || ""}`}
                title={`${labelFor(key)} : ${signed(value)}/s`}
              >
                {signedShort(value)}/s
              </span>
            ))
          )}
          {b.id === "roads" && (() => {
            const net = roadNetworkInfo();
            return (
              <span
                className="pr-prod-item res-infra"
                title={tr({
                  fr: `${net.rank} : ${net.pct} % des bâtiments-moteur sont reliés au réseau. Bonus de production global : +${net.bonus} % (maximum +10 % quand tout est relié). Chaque route achetée étend le réseau d'une tuile vers le bâtiment le plus proche.`,
                  en: `${net.rank}: ${net.pct}% of engine buildings are linked to the network. Global production bonus: +${net.bonus}% (up to +10% when everything is linked). Each road purchased extends the network one tile toward the nearest building.`
                })}
              >
                {net.rank} · {net.pct}% {tr({ fr: "relié", en: "linked" })} (+{net.bonus}%)
              </span>
            );
          })()}
        </div>

        <div
          className="pr-step-track"
          title={tr({ fr: `Palier ${stepLabel} dans ${nextIn} achat${nextIn > 1 ? "s" : ""}`, en: `${stepLabel} milestone in ${nextIn} purchase${nextIn > 1 ? "s" : ""}` })}
          aria-hidden="true"
        >
          <span style={{ width: `${stepPct}%` }}></span>
        </div>

        <div className="pr-footer">
          <button
            className={`btn-purchase${floats.length ? " bp-flash" : ""}`}
            disabled={!affordable}
            onClick={handleBuy}
            title={tr({ fr: "Shift-clic : ×10 · Ctrl-clic : ×100", en: "Shift-click: ×10 · Ctrl-click: ×100" })}
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
                  title={`${exactLabel(amount)} ${labelFor(currency)}`}
                >
                  <i className={`fa-solid ${RES_ICONS[currency] || "fa-circle"}`} aria-hidden="true"></i>
                  {fmtShort(amount)}
                </span>
              ))}
            </span>
          </button>
          <span className="pr-count" title={tr({ fr: `Possédés : ${countLabel}`, en: `Owned: ${countLabel}` })} aria-label={tr({ fr: `${countLabel} possédés`, en: `${countLabel} owned` })}>
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
    prev.lackingKey === next.lackingKey     // highlight is-lacking par devise
  );
}

export default memo(PurchaseRow, arePropsEqual);
