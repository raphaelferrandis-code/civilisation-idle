import { memo, useRef, useState } from 'react';
import { buyBuilding } from '../../game/core/actions.js';
import { state, setBuyAmount, invalidateRenderCache } from '../../game/core/state.js';
import { fmt, fmtShort, signed, signedShort, labelFor } from '../../game/core/utils.js';
import { RES_ICONS } from './resourceIcons.js';

const RES_CLASS = {
  population: "res-pop",
  food: "res-food",
  gold: "res-gold",
  knowledge: "res-know",
  infrastructure: "res-infra"
};

const CATEGORY_ICONS = { city: "fa-gears", knowledge: "fa-book-open", infra: "fa-archway" };

/* Icône propre à CHAQUE bâtiment (scannabilité — fini les icônes partagées par
   ressource où 6 bâtiments montraient la même pièce d'or). La couleur, elle,
   reste celle de la ressource dominante (cf. cls dans buildingIcon). */
const BUILDING_ICONS = {
  foragers: "fa-seedling",
  granaries_city: "fa-warehouse",
  caravans: "fa-route",
  scribes: "fa-feather-pointed",
  storytellers: "fa-comments",
  schools: "fa-chalkboard",
  aqueducts: "fa-bridge-water",
  roads: "fa-road",
  watch: "fa-eye",
  markets: "fa-store",
  guilds: "fa-people-group",
  irrigated_fields: "fa-wheat-awn",
  river_ports: "fa-anchor",
  water_mills: "fa-fan",
  mint_houses: "fa-coins",
  imperial_exchanges: "fa-building-columns",
  academies: "fa-user-graduate",
  observatories: "fa-binoculars",
  libraries: "fa-book-bookmark",
  bureaucracy: "fa-stamp",
  sewers: "fa-water",
  courthouses: "fa-gavel",
  public_works: "fa-person-digging",
  ministries: "fa-landmark",
  archive_grids: "fa-box-archive",
  ruin_architects: "fa-compass-drafting",
  ancestral_cult: "fa-hands-praying",
  universities: "fa-graduation-cap",
  printing_houses: "fa-print",
  think_tanks: "fa-brain"
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

/* Icône de la rangée : la ressource dominante produite, sinon la catégorie */
function buildingIcon(b) {
  const outputs = [
    ["population", b.pop],
    ["food", b.food],
    ["gold", b.gold],
    ["knowledge", b.knowledge],
    ["infrastructure", b.infra]
  ].filter(([, v]) => Math.abs(v) > 0.0001);
  // Couleur = ressource dominante ; icône = propre au bâtiment (sinon repli).
  let cls = "";
  let fallback = CATEGORY_ICONS[b.category] || "fa-gears";
  if (outputs.length) {
    outputs.sort((a, c) => Math.abs(c[1]) - Math.abs(a[1]));
    const key = outputs[0][0];
    cls = RES_CLASS[key] || "";
    fallback = RES_ICONS[key];
  }
  return { icon: BUILDING_ICONS[b.id] || fallback, cls };
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
  tier,
  production,
  lackingKey,
  pulse
}) {
  // Les niveaux sont des entiers : pas de décimale sous 1000 (fmt(0) → "0.0").
  // Au-delà, compact forcé (fmtShort) : un compteur « full » déborderait la pastille.
  const countLabel = count < 1000 ? String(count) : fmtShort(count);
  const stepLabel = b.category === "city" ? "×2" : "×1.5";
  const inStep = count % 25;
  const nextIn = 25 - inStep;
  const stepPct = (inStep / 25) * 100;
  const { icon, cls } = buildingIcon(b);

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
    shaking ? "pr-shake" : ""
  ].filter(Boolean).join(" ");

  return (
    <article
      className={rowClass}
      data-tier={tier > 0 ? tier : undefined}
      onPointerDown={handleRowPointerDown}
    >
      <div className={`pr-icon ${cls}`} aria-hidden="true">
        <i className={`fa-solid ${icon}`}></i>
      </div>

      <div className="pr-main">
        <div className="pr-name-row">
          <h3 className="pr-name" title={b.desc}>{b.name}</h3>
          {milestoneInfo && (
            <span
              className="pr-milestone-badge"
              title={`Bonus de production de palier : ×${fmt(milestoneInfo.bonus)} (${milestoneInfo.label})`}
            >
              <i className="fa-solid fa-bolt" aria-hidden="true"></i>
              {"×"}{fmtShort(milestoneInfo.bonus)}
            </span>
          )}
        </div>

        <div className="pr-prod">
          {production.length === 0 ? (
            <span className="pr-prod-item pr-prod-indirect">effet indirect</span>
          ) : (
            production.map(([key, value]) => (
              <span
                key={key}
                className={`pr-prod-item ${RES_CLASS[key] || ""}`}
                title={`${labelFor(key)} : ${signed(value)}/s`}
              >
                <i className={`fa-solid ${RES_ICONS[key]}`} aria-hidden="true"></i>
                {signedShort(value)}/s
              </span>
            ))
          )}
        </div>

        <div
          className="pr-step-track"
          title={`Palier ${stepLabel} dans ${nextIn} achat${nextIn > 1 ? "s" : ""}`}
          aria-hidden="true"
        >
          <span style={{ width: `${stepPct}%` }}></span>
        </div>
      </div>

      <span className="pr-count" title={`Possédés : ${countLabel}`} aria-label={`${countLabel} possédés`}>
        <span className="pr-count-x" aria-hidden="true">×</span>{countLabel}
      </span>

      <button
        className={`btn-purchase${floats.length ? " bp-flash" : ""}`}
        disabled={!affordable}
        onClick={handleBuy}
        title="Shift-clic : ×10 — Ctrl-clic : ×100"
      >
        {floats.map((f) => (
          <span key={f.id} className="pr-float" aria-hidden="true">{f.text}</span>
        ))}
        <span className="bp-action">
          {buyAmount === "max" ? "Acheter Max" : `Acheter ×${buyAmount}`}
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
    prev.affordable === next.affordable &&
    prev.babelBlocked === next.babelBlocked &&
    prev.tier === next.tier &&
    prev.pulse === next.pulse &&
    prev.globalMult === next.globalMult &&  // production = f(count, globalMult, building)
    prev.lackingKey === next.lackingKey     // highlight is-lacking par devise
  );
}

export default memo(PurchaseRow, arePropsEqual);
