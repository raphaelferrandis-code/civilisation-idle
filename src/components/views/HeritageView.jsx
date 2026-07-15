import { useState, useEffect } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  isUnlocked,
  canBuyUpgrade,
  has,
  reseauRoutesCostMult
} from '../../game/core/mechanics.js';
import { buyUpgrade, engraveCadmosEpitaph, faveurShopItems, buyFaveurItem } from '../../game/core/actions.js';
import { upgrades } from '../../game/data/upgrades.js';
import { codexSavoirBonus } from '../../game/data/world.js';
import { CADMOS_MAX_PERMANENT_EPITAPHS, CADMOS_EPITAPH_BONUS_PCT } from '../../game/data/myths.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
import { fmt } from '../../game/core/utils.js';
import {
  LABELS as FAVEUR_LABELS,
  ICONS as FAVEUR_ICONS,
  DESCS as FAVEUR_DESCS,
  effectLine as faveurEffectLine
} from '../ui/faveurShopMeta.js';
import { tr } from '../../game/core/i18n.js';
import ArtifactTreePanel from '../ui/ArtifactTreePanel.jsx';

// Effet « vivant » des upgrades qui scalent avec l'état (à la manière de la
// Boutique de Faveur « edge 18 % → 16 % ») : lit la MÊME formule que la mécanique
// (imports partagés reseauRoutesCostMult / codexSavoirBonus) → l'affichage ne
// peut pas diverger de l'effet réel. Renvoie null → repli sur upgrade.effect.
function liveEffectLine(upgrade, cycles, bestEraIndex, owned) {
  if (upgrade.id === 'reseau_routes') {
    const pct = Math.round((1 - reseauRoutesCostMult(cycles)) * 100);
    if (pct <= 0) return null;
    return owned
      ? tr({ fr: `Coûts de construction −${pct}% (actuel · max −60%)`, en: `Construction costs −${pct}% (current · max −60%)` })
      : tr({ fr: `−${pct}% dès l'achat · plafond −60%`, en: `−${pct}% on purchase · cap −60%` });
  }
  if (upgrade.id === 'codex_mythique') {
    const bonus = codexSavoirBonus(bestEraIndex);
    if (bonus <= 0) return null;
    return owned
      ? tr({ fr: `+${fmt(bonus)} Savoir au début de chaque cycle`, en: `+${fmt(bonus)} Knowledge at each cycle start` })
      : tr({ fr: `+${fmt(bonus)} Savoir / cycle dès l'achat`, en: `+${fmt(bonus)} Knowledge / cycle on purchase` });
  }
  return null;
}

// Emplacements des marchandises sur les étagères du décor echoppe-pano.png
// (400×144), en % du cadre de la scène — chaque {x,y} = CENTRE de la pastille
// cliquable. ⚠ PREMIER JET à ajuster à la capture (Raph) : bouge librement.
const SHELF_SLOTS = {
  // Emplacements sur la scène echoppe-scene.png (400×160), en % du cadre — sur
  // les bocaux, en évitant le marchand (centre) et le chat (comptoir gauche).
  // Positions capturées via le mode calibration (window.__shopCalib) — Raph.
  reforme_administrative: { x: 18, y: 21 },
  protocoles_urgence:     { x: 21, y: 20 },
  reseau_routes:          { x: 24, y: 21 },
  codex_mythique:         { x: 39, y: 20 },
  conservateurs_ruines:   { x: 45, y: 21 },
  rituel_effondrement:    { x: 48, y: 20 },
  // Dés pipés / ailes cirées ont migré dans l'arbre d'artefacts (rang 1 des
  // lignées) : la Boutique ne garde que la Bénédiction (consommable de run).
  faveur_blessing:        { x: 23, y: 39 }
};

// Pool de bouteilles PRÉ-CALIBRÉES (via __shopCalibPool, Raph 2026-07-15) : toute
// marchandise sans slot explicite (les futurs augments) apparaît AUTOMATIQUEMENT
// sur la prochaine bouteille libre de ce pool, dans l'ordre. Jamais un item masqué.
const AUTO_SLOTS = [
  // Rangée haute (y~20)
  { x: 15, y: 21 }, { x: 35, y: 21 }, { x: 42, y: 20 }, { x: 51, y: 21 }, { x: 53, y: 21 },
  { x: 56, y: 21 }, { x: 59, y: 21 }, { x: 61, y: 21 }, { x: 66, y: 21 }, { x: 75, y: 21 },
  { x: 77, y: 20 }, { x: 80, y: 21 }, { x: 83, y: 21 }, { x: 85, y: 21 },
  // Rangée médiane (y~40)
  { x: 18, y: 40 }, { x: 26, y: 40 }, { x: 29, y: 41 }, { x: 32, y: 40 }, { x: 35, y: 40 },
  { x: 39, y: 39 }, { x: 42, y: 40 }, { x: 45, y: 40 }, { x: 56, y: 39 }, { x: 59, y: 40 },
  { x: 62, y: 40 }, { x: 66, y: 39 }, { x: 69, y: 40 }, { x: 71, y: 40 }, { x: 74, y: 39 },
  { x: 77, y: 40 }, { x: 79, y: 40 }, { x: 82, y: 39 }, { x: 85, y: 40 },
  // Rangée basse (y~59)
  { x: 15, y: 59 }, { x: 17, y: 59 }, { x: 21, y: 59 }, { x: 24, y: 59 }, { x: 27, y: 59 },
  { x: 30, y: 60 }, { x: 32, y: 60 }, { x: 35, y: 60 }, { x: 62, y: 59 }, { x: 66, y: 59 },
  { x: 69, y: 59 }, { x: 71, y: 60 }, { x: 76, y: 59 }, { x: 79, y: 59 }, { x: 83, y: 58 },
  { x: 86, y: 58 },
  // Comptoir (y~78)
  { x: 90, y: 78 }, { x: 74, y: 77 }
];

export default function HeritageView() {
  const faveur = useGameState((s) => s.faveur || 0);
  const cycles = useGameState((s) => s.cycles || 0);
  const bestEraIndex = useGameState((s) => s.bestEraIndex || 0);
  // Re-render au rythme de la Boutique de Faveur (niveaux, bénédiction, prix).
  useGameState((s) => `${s.diceLevel || 0}:${s.wingLevel || 0}:${s.blessingUntil || 0}:${Math.floor((s.instability || 0) * 1000)}`);
  const cadmosHeritage = useGameState((s) => Boolean(s.cadmosHeritage));
  const cadmosPermanentEpitaphs = useGameState((s) => s.cadmosPermanentEpitaphs) || [];
  const cadmosLastRunChronicle = useGameState((s) => s.cadmosLastRunChronicle) || [];
  const cadmosChronicle = useGameState((s) => s.cadmosChronicle) || [];

  // Marchandise sélectionnée (dont le détail s'affiche en bas du comptoir).
  const [selectedId, setSelectedId] = useState(null);

  // CALIBRATION dev (console). Deux modes :
  //   window.__shopCalib()      → place les items NOMMÉS dans l'ordre (→ SHELF_SLOTS) ;
  //   window.__shopCalibPool()  → capture un POOL de bouteilles libres (→ AUTO_SLOTS),
  //                                pour que les futurs augments tombent déjà sur de
  //                                vraies bouteilles. Re-taper la commande = éteindre.
  const [calibMode, setCalibMode] = useState(null); // null | 'items' | 'pool'
  const [calibIdx, setCalibIdx] = useState(0);
  const [calibItems, setCalibItems] = useState({});
  const [calibPool, setCalibPool] = useState([]);
  useEffect(() => {
    window.__shopCalib = () => { setCalibMode((v) => (v === 'items' ? null : 'items')); setCalibIdx(0); setCalibItems({}); };
    window.__shopCalibPool = () => { setCalibMode((v) => (v === 'pool' ? null : 'pool')); setCalibPool([]); };
    return () => { delete window.__shopCalib; delete window.__shopCalibPool; };
  }, []);

  // Âges chroniqués (cycle courant + dernier run) encore gravables.
  const cadmosEngravedIds = new Set(cadmosPermanentEpitaphs.map((e) => e.id));
  const cadmosCandidates = [...cadmosLastRunChronicle, ...cadmosChronicle]
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
    .filter((e) => !cadmosEngravedIds.has(e.id));
  const cadmosFull = cadmosPermanentEpitaphs.length >= CADMOS_MAX_PERMANENT_EPITAPHS;
  const cadmosBonusPct = Math.round(CADMOS_EPITAPH_BONUS_PCT * 100);

  const visibleHeritageUpgrades = upgrades.filter(
    (upgrade) => (upgrade.group || 'heritage') === 'heritage' && isUnlocked(upgrade)
  );

  // Marchandises = objets cliquables sur les étagères. TOUT se paie en FAVEUR
  // (arbitrage Raph 2026-07-15) : les upgrades d'Héritage comme la Boutique de
  // Faveur — une seule monnaie à la Boutique.
  const heritageObjs = visibleHeritageUpgrades.map((u) => {
    const owned = has(u.id);
    return {
      id: u.id, slot: SHELF_SLOTS[u.id] || null, currency: 'faveur', icon: null,
      name: u.name, desc: u.desc, owned, canBuy: canBuyUpgrade(u),
      effect: liveEffectLine(u, cycles, bestEraIndex, owned) || u.effect,
      cost: owned ? tr({ fr: 'Acquis', en: 'Owned' }) : `✦ ${fmt(u.cost?.faveur || 0)}`,
      buy: () => { if (buyUpgrade(u.id)) pushOutcomeFloat({ label: `✓ ${u.name}`, kind: 'gain' }); }
    };
  });
  // Boutique de Faveur : seul le consommable BÉNÉDICTION reste sur l'étagère —
  // les dés pipés / ailes cirées ont migré dans l'arbre d'artefacts (rang 1 des
  // lignées, panneau dédié). Tout kind connu a ses libellés dans faveurShopMeta ;
  // un nouveau kind est toléré (repli sur ses champs), jamais de crash.
  const faveurObjs = faveurShopItems().filter((it) => it.kind === 'blessing').map((it) => {
    const id = `faveur_${it.id}`;
    const known = FAVEUR_LABELS[it.kind];
    return {
      id, slot: SHELF_SLOTS[id] || null, currency: 'faveur',
      icon: FAVEUR_ICONS[it.kind] || '✦',
      name: known ? tr(known) : (it.name || it.label || it.kind),
      desc: FAVEUR_DESCS[it.kind] ? tr(FAVEUR_DESCS[it.kind]) : (it.desc || ''),
      owned: it.maxed, canBuy: it.canAfford && !it.maxed,
      effect: known ? faveurEffectLine(it) : (it.fx || it.effect || ''),
      cost: it.maxed ? tr({ fr: 'Complet', en: 'Full' }) : `✦ ${fmt(it.cost)}`,
      buy: () => { if (!it.maxed && it.canAfford) buyFaveurItem(it.id); }
    };
  });
  // Slot explicite sinon spot de secours → AUCUN item n'est masqué (les nouveaux
  // augments apparaissent tout seuls, puis on affine leur position).
  let autoIdx = 0;
  const shopObjs = [...heritageObjs, ...faveurObjs].map((o) =>
    o.slot ? o : { ...o, slot: AUTO_SLOTS[(autoIdx++) % AUTO_SLOTS.length] }
  );
  const selected = shopObjs.find((o) => o.id === selectedId) || null;

  // Calibration : chaque clic capture une position (%). Mode 'items' = pour l'item
  // courant ; mode 'pool' = empile des bouteilles réservées (illimité).
  const onCalibClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 100);
    const y = Math.round(((e.clientY - r.top) / r.height) * 100);
    if (calibMode === 'pool') { setCalibPool((prev) => [...prev, { x, y }]); return; }
    const cur = shopObjs[calibIdx];
    if (!cur) return;
    setCalibItems((prev) => ({ ...prev, [cur.id]: { x, y } }));
    setCalibIdx((i) => i + 1);
  };
  const calibConfig = calibMode === 'pool'
    ? 'const AUTO_SLOTS = [\n' + calibPool.map((p) => `  { x: ${p.x}, y: ${p.y} },`).join('\n') + '\n];'
    : Object.entries(calibItems).map(([id, p]) => `  ${id}: { x: ${p.x}, y: ${p.y} },`).join('\n');

  return (
    <section className={`view active boutique-shop boutique-immersive${calibMode ? ' calib' : ''}`} id="tech">
      {/* La scène : décor panoramique plein cadre, marchand au comptoir, props,
          et les marchandises = pastilles cliquables sur les étagères (MUET). */}
      <div className="shop-stage">
        <img className="shop-backdrop-full" src="/pixelart/boutique/echoppe-scene.png" alt={tr({ fr: "L'échoppe du Chiffonnier des cycles", en: "The Rag-picker's shop" })} draggable="false" />

        {/* Scène COMPLÈTE bakée (echoppe-scene.png) : le marchand, le chat, la
            cloche, la bougie et les étagères sont dans l'image — plus de sprites
            superposés (les positions props/marchand ne sont donc plus utilisées). */}

        {/* Portefeuille : plaque de comptoir. La Boutique ne se paie QU'EN FAVEUR. */}
        <div className="boutique-wallet">
          <span className="wallet-balance wallet-faveur" title={tr({ fr: 'Faveur — gagnée aux jeux du temple (Régulation)', en: 'Favor — earned at the temple games (Regulation)' })}>
            <span className="wallet-icon" aria-hidden="true">✦</span>
            <span className="wallet-amount">{fmt(faveur)}</span>
          </span>
        </div>

        {/* Marchandises cliquables sur les étagères. */}
        {shopObjs.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`shop-hotspot${o.owned ? ' is-owned' : o.canBuy ? ' is-affordable' : ''}${selectedId === o.id ? ' is-selected' : ''}`}
            style={{ left: `${o.slot.x}%`, top: `${o.slot.y}%` }}
            onClick={() => setSelectedId(selectedId === o.id ? null : o.id)}
            aria-label={o.name}
          />
        ))}

        {calibMode && (
          <div className="shop-calib" onClick={onCalibClick}>
            <div className="shop-calib-hud" onClick={(e) => e.stopPropagation()}>
              <strong>
                {calibMode === 'pool'
                  ? `POOL — clique toutes les bouteilles à réserver (${calibPool.length} capturées). Re-tape __shopCalibPool() pour finir.`
                  : (calibIdx < shopObjs.length
                      ? `Clique la bouteille → ${shopObjs[calibIdx].name} (${calibIdx + 1}/${shopObjs.length})`
                      : 'Terminé ! Copie ce bloc et donne-le moi :')}
              </strong>
              {calibConfig && <pre>{calibConfig}</pre>}
            </div>
          </div>
        )}
      </div>

      {/* Barre de détail SOUS la scène : le marchand présente l'objet choisi. */}
      <div className={`shop-detail${selected ? ' is-open' : ''}`}>
        {selected ? (
          <>
            <div className="shop-detail-text">
              <span className="shop-detail-name">{selected.icon ? `${selected.icon} ` : ''}{selected.name}</span>
              <span className="shop-detail-fx">{selected.effect}</span>
              <span className="shop-detail-desc">{selected.desc}</span>
            </div>
            <div className="shop-detail-buyrow">
              <span className={`shop-detail-cost shop-detail-cost--${selected.currency}`}>{selected.cost}</span>
              <button
                type="button"
                className="shop-detail-buy"
                disabled={selected.owned || !selected.canBuy}
                onClick={() => selected.buy()}
              >
                {selected.owned ? tr({ fr: 'Acquis', en: 'Owned' }) : tr({ fr: 'Acheter', en: 'Buy' })}
              </button>
            </div>
          </>
        ) : (
          <p className="shop-detail-hint">
            {tr({
              fr: "Le Chiffonnier des cycles — choisis un objet sur les étagères.",
              en: 'The Rag-picker of Cycles — pick an item from the shelves.'
            })}
          </p>
        )}
      </div>

      {/* L'arbre d'artefacts du Temple (Phase 4) — deux lignées en échelle
          (osselets / Icare) sous la scène, hors métaphore étagère (comme Cadmos).
          Le capstone de chaque voie = l'automatisation (ses cadrans se déplient
          une fois débloquée). Se rend null tant qu'aucune ère de jeu n'est atteinte. */}
      <ArtifactTreePanel />

      {/* Cadmos — épitaphes permanentes (visible une fois l'héritage Cadmos acquis).
          Gardé en panneau simple sous la scène : ne se prête pas au métaphore étagère. */}
      {cadmosHeritage && (
        <div className="panel cadmos-panel">
          <div className="panel-heading">
            <div>
              <h2>{tr({ fr: "Cadmos — Épitaphes permanentes", en: "Cadmus — Permanent Epitaphs" })}</h2>
            </div>
          </div>
          <p className="body-copy">
            {tr({
              fr: "Grave un Âge inscrit à la Chronique comme Nom de Pouvoir permanent : chaque épitaphe accorde ",
              en: "Engrave an Age recorded in the Chronicle as a permanent Name of Power: each epitaph grants "
            })}
            <strong>+{cadmosBonusPct}%</strong>
            {tr({
              fr: ` à son orientation (Nourriture, Trésor ou Stabilité), pour toujours. Maximum ${CADMOS_MAX_PERMANENT_EPITAPHS}.`,
              en: ` to its orientation (Food, Treasury or Stability), forever. Maximum ${CADMOS_MAX_PERMANENT_EPITAPHS}.`
            })}
          </p>
          <div className="prestige-stats">
            <div>
              <span>{tr({ fr: "Épitaphes gravées", en: "Epitaphs engraved" })}</span>
              <strong>{cadmosPermanentEpitaphs.length} / {CADMOS_MAX_PERMANENT_EPITAPHS}</strong>
            </div>
          </div>

          {cadmosPermanentEpitaphs.length > 0 && (
            <div className="upgrade-grid">
              {cadmosPermanentEpitaphs.map((entry) => (
                <article key={entry.id} className="upgrade bought">
                  <div>
                    <h3>{entry.name}</h3>
                    <p className="effect-line">{entry.orientationLabel} +{cadmosBonusPct}% {tr({ fr: "permanent", en: "permanent" })}</p>
                  </div>
                  <button disabled>{tr({ fr: "Gravé", en: "Engraved" })}</button>
                </article>
              ))}
            </div>
          )}

          <p className="body-copy" style={{ marginTop: '0.6rem' }}>{tr({ fr: "Âges disponibles à graver :", en: "Ages available to engrave:" })}</p>
          {cadmosCandidates.length === 0 ? (
            <p className="body-copy">
              <em>{tr({ fr: "Aucun Âge à graver — nomme des Âges pendant un cycle sous le Mythe de Cadmos, puis reviens ici après l'effondrement.", en: "No Age to engrave — name Ages during a cycle under the Myth of Cadmus, then come back here after the collapse." })}</em>
            </p>
          ) : (
            <div className="upgrade-grid">
              {cadmosCandidates.map((entry) => (
                <article key={entry.id} className="upgrade">
                  <div>
                    <h3>{entry.name}</h3>
                    <p className="effect-line">{entry.orientationLabel} +{cadmosBonusPct}% {tr({ fr: "permanent", en: "permanent" })}</p>
                  </div>
                  <button
                    disabled={cadmosFull}
                    onClick={() => engraveCadmosEpitaph(entry.id)}
                    title={cadmosFull ? tr({ fr: `Maximum de ${CADMOS_MAX_PERMANENT_EPITAPHS} épitaphes atteint`, en: `Maximum of ${CADMOS_MAX_PERMANENT_EPITAPHS} epitaphs reached` }) : tr({ fr: "Graver cette épitaphe de façon permanente", en: "Engrave this epitaph permanently" })}
                  >
                    {cadmosFull ? tr({ fr: "Complet", en: "Full" }) : tr({ fr: "Graver", en: "Engrave" })}
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
