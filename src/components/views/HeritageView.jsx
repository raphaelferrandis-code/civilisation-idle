import { useState, useEffect } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  isUnlocked,
  canBuyUpgrade,
  has,
  reseauRoutesCostMult
} from '../../game/core/mechanics.js';
import { buyUpgrade, engraveCadmosEpitaph, faveurShopItems, buyFaveurItem, artifactTree, buyArtifactNode, unlockTempleAuto, templeAutoUnlockCost } from '../../game/core/actions.js';
import { state } from '../../game/core/state.js';
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
import { FaveurIcon } from '../ui/FaveurIcon.jsx';
import { tipProps } from '../ui/HelpBubble.jsx';
import AutoDials, { RateBadge } from '../ui/TempleAutoDials.jsx';

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

// Les TROIS ARMOIRES de l'échoppe (arbitrage Raph 2026-07-16) : chaque marchandise
// porte une armoire (`shelf`) et tombe sur la prochaine bouteille libre de la
// sienne — GAUCHE = les jeux du temple (artefacts osselets/Icare), MILIEU = le
// confort (QoL), DROITE = les bonus de production. Bouteilles PRÉ-CALIBRÉES par
// Raph (__shopCalibPool, 2026-07-15) sur echoppe-scene.png (400×160), en % du
// cadre — chaque {x,y} = CENTRE de la zone cliquable. Jamais un item masqué.
const ARMOIRE_SLOTS = {
  // Armoire de GAUCHE (x ≤ 35) — réserve pour les futurs achats liés aux jeux
  // (les lignées actuelles ont leurs bouteilles FIXES dans LINEAGE_ROWS).
  // 2026-07-17 : +3 positions interpolées dans le trou de l'étagère du haut
  // (x 27-33, même alignement) — les 4 lignées posent 14 bouteilles sur cette
  // armoire et le pool n'en avait que 11 : trois se chevauchaient (modulo).
  // Approximatives : à recaler à l'œil via window.__shopCalibPool() si besoin.
  jeu: [
    { x: 15, y: 21 }, { x: 18, y: 21 }, { x: 21, y: 20 }, { x: 24, y: 21 },
    { x: 27, y: 21 }, { x: 30, y: 20 }, { x: 33, y: 21 }, { x: 35, y: 21 },
    { x: 26, y: 40 }, { x: 32, y: 40 },
    { x: 17, y: 59 }, { x: 24, y: 59 }, { x: 30, y: 60 }, { x: 35, y: 60 }
  ],
  // Armoire du MILIEU (au-dessus du marchand, 38 ≤ x ≤ 61) — le confort.
  qol: [
    { x: 39, y: 20 }, { x: 45, y: 21 }, { x: 48, y: 20 }, { x: 42, y: 20 }, { x: 51, y: 21 },
    { x: 53, y: 21 }, { x: 56, y: 21 }, { x: 59, y: 21 }, { x: 61, y: 21 },
    { x: 39, y: 39 }, { x: 42, y: 40 }, { x: 45, y: 40 }, { x: 56, y: 39 }, { x: 59, y: 40 }
  ],
  // Armoire de DROITE (x ≥ 62) — les bonus de production. Comptoir en dernier.
  prod: [
    { x: 66, y: 39 }, { x: 69, y: 40 }, { x: 71, y: 40 }, { x: 74, y: 39 }, { x: 77, y: 40 },
    { x: 79, y: 40 }, { x: 82, y: 39 }, { x: 85, y: 40 }, { x: 62, y: 40 },
    { x: 62, y: 59 }, { x: 66, y: 59 }, { x: 69, y: 59 }, { x: 71, y: 60 }, { x: 76, y: 59 },
    { x: 79, y: 59 }, { x: 83, y: 58 }, { x: 86, y: 58 },
    { x: 66, y: 21 }, { x: 75, y: 21 }, { x: 77, y: 20 }, { x: 80, y: 21 }, { x: 83, y: 21 },
    { x: 85, y: 21 },
    { x: 74, y: 77 }, { x: 90, y: 78 }
  ]
};

// Armoire de GAUCHE — une étagère PAR LIGNÉE d'artefacts, rang 1 → capstone de
// gauche à droite (osselets = étagère du milieu, Icare = étagère basse). Positions
// FIXES pour que les bouteilles ne bougent pas quand l'autre lignée s'ouvre.
// Les lignées se sont allongées (2026-07-17 : osselets 6 rangs, Icare 7) et deux
// nouvelles sont nées (gratteux, vingt-et-un). Les positions au-delà des rangées
// calibrées tombent sur le POOL de bouteilles libres (slot null → AUTO_SLOTS),
// prévu exactement pour ça (cf. __shopCalibPool).
const LINEAGE_ROWS = {
  osselets: [{ x: 18, y: 40 }, { x: 23, y: 39 }, { x: 29, y: 41 }, { x: 35, y: 40 }],
  icarus:   [{ x: 15, y: 59 }, { x: 21, y: 59 }, { x: 27, y: 59 }, { x: 32, y: 60 }],
  gratteux: [],
  vingtetun: []
};

// Répartition des upgrades d'Héritage dans les armoires (défaut : droite/prod).
const HERITAGE_ARMOIRE = {
  reforme_administrative: 'qol',   // bouton Max
  protocoles_urgence: 'qol',       // Rationner/Recensement automatiques
  conservateurs_ruines: 'qol',     // auto-achat ruines après effondrement
  reseau_routes: 'prod',           // coûts de construction réduits
  codex_mythique: 'prod',          // +Savoir à chaque cycle
  rituel_effondrement: 'prod'      // +25 % de ruines à l'effondrement
};

export default function HeritageView() {
  const faveur = useGameState((s) => s.faveur || 0);
  const cycles = useGameState((s) => s.cycles || 0);
  const bestEraIndex = useGameState((s) => s.bestEraIndex || 0);
  // Re-render au rythme de la Boutique de Faveur (niveaux, bénédiction, prix)
  // ET de l'arbre d'artefacts (possessions, cadrans d'automatisation).
  useGameState((s) => {
    const t = s.templeAuto || {};
    const tr_ = t.tronc || {};
    const arts = Object.keys(s.templeArtifacts || {}).sort().join(',');
    // Un fragment de clé par auto de jeu : les 4 jeux ont les mêmes cadrans
    // (on/mise ou rite/tempo/plancher), Icare a la cible en plus.
    const autoKey = ['osselets', 'icarus', 'gratteux', 'vingtetun']
      .map((k) => { const g = t[k] || {}; return `${g.unlocked}:${g.on}:${g.rite || g.stakeId}:${g.tempo}:${g.faveurFloor}:${g.target || 0}`; })
      .join('|');
    return `${s.diceLevel || 0}:${s.wingLevel || 0}:${s.styletLevel || 0}:${s.blessingUntil || 0}:${Math.floor((s.instability || 0) * 1000)}:${arts}:${tr_.unlocked}:${autoKey}`;
  });
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
      id: u.id, shelf: HERITAGE_ARMOIRE[u.id] || 'prod', slot: null, currency: 'faveur', icon: null,
      name: u.name, desc: u.desc, owned, canBuy: canBuyUpgrade(u),
      effect: liveEffectLine(u, cycles, bestEraIndex, owned) || u.effect,
      cost: owned ? tr({ fr: 'Acquis', en: 'Owned' }) : <><FaveurIcon /> {fmt(u.cost?.faveur || 0)}</>,
      buy: () => { if (buyUpgrade(u.id)) pushOutcomeFloat({ label: `✓ ${u.name}`, kind: 'gain' }); }
    };
  });
  // Boutique de Faveur : seul le consommable BÉNÉDICTION reste sur l'étagère —
  // les dés pipés / ailes cirées ont migré dans l'arbre d'artefacts (rang 1 des
  // lignées). Tout kind connu a ses libellés dans faveurShopMeta ; un nouveau
  // kind est toléré (repli sur ses champs), jamais de crash.
  const faveurObjs = faveurShopItems().filter((it) => it.kind === 'blessing').map((it) => {
    const id = `faveur_${it.id}`;
    const known = FAVEUR_LABELS[it.kind];
    return {
      id, shelf: 'prod', slot: null, currency: 'faveur',
      icon: FAVEUR_ICONS[it.kind] || '✦',
      name: known ? tr(known) : (it.name || it.label || it.kind),
      desc: FAVEUR_DESCS[it.kind] ? tr(FAVEUR_DESCS[it.kind]) : (it.desc || ''),
      owned: it.maxed, canBuy: it.canAfford && !it.maxed,
      effect: known ? faveurEffectLine(it) : (it.fx || it.effect || ''),
      cost: it.maxed ? tr({ fr: 'Complet', en: 'Full' }) : <><FaveurIcon /> {fmt(it.cost)}</>,
      buy: () => { if (!it.maxed && it.canAfford) buyFaveurItem(it.id); }
    };
  });
  // Armoire de GAUCHE — les artefacts des jeux du temple, en ÉCHELLE (le rang N
  // exige le rang N-1 : bouteille 🔒 tant que le rang précédent manque). Une
  // lignée n'expose ses bouteilles qu'une fois son ère atteinte. Le capstone
  // acquis déplie ses cadrans dans la barre de détail (champ `dials`).
  const templeObjs = artifactTree().filter((lin) => lin.eraOk).flatMap((lin) =>
    lin.nodes.map((node, idx) => {
      const isLevel = node.kind === 'level';
      const lvl = isLevel && node.level > 0
        ? ` · ${tr({ fr: 'niv.', en: 'lvl' })} ${node.level}${node.maxed ? ` (${tr({ fr: 'max', en: 'max' })})` : `/${node.maxLevel}`}`
        : '';
      return {
        id: `temple_${node.id}`, shelf: 'jeu',
        slot: (LINEAGE_ROWS[lin.id] || [])[idx] || null,
        currency: 'faveur', icon: lin.icon,
        name: `${tr(node.label)}${lvl}`,
        desc: `${lin.icon} ${tr(lin.label)} · ${tr(lin.subtitle)}`,
        effect: tr(node.desc),
        owned: node.maxed, locked: !node.unlocked, canBuy: node.buyable,
        ownedLabel: isLevel ? tr({ fr: 'Complet', en: 'Full' }) : null,
        buyLabel: isLevel
          ? tr({ fr: 'Améliorer', en: 'Upgrade' })
          : node.kind === 'automation'
            ? tr({ fr: 'Débloquer', en: 'Unlock' })
            : tr({ fr: 'Acheter', en: 'Buy' }),
        cost: node.maxed
          ? tr(isLevel ? { fr: 'Complet', en: 'Full' } : { fr: 'Acquis', en: 'Owned' })
          : !node.unlocked
            ? tr({ fr: '🔒 Rang précédent requis', en: '🔒 Previous rank required' })
            : <><FaveurIcon /> {fmt(node.cost)}</>,
        buy: () => buyArtifactNode(node.id),
        dials: node.kind === 'automation' && node.owned && state.templeAuto ? lin.id : null
      };
    })
  );
  // L'AUTO-RELÈVE DES OFFRANDES (achat déplacé de la Régulation à l'échoppe,
  // arbitrage Raph 2026-07-16) : une bouteille de l'armoire des jeux. L'achat
  // débloque ET active (unlockTempleAuto) ; le toggle on/off reste sur la
  // ligne des Offrandes (AuguresPanel). Gatée comme la lignée osselets (ère II)
  // — le tronc naît avec la table.
  const trunkAutoState = state.templeAuto?.tronc || {};
  const trunkUnlockCost = templeAutoUnlockCost('tronc');
  const osseletsEraOk = artifactTree().some((lin) => lin.id === 'osselets' && lin.eraOk);
  const trunkObjs = osseletsEraOk ? [{
    id: 'temple_autoTronc', shelf: 'jeu', slot: null, currency: 'faveur', icon: '🏺',
    name: tr({ fr: 'Sébile du sacristain', en: "Sacristan's dish" }),
    desc: `🏺 ${tr({ fr: 'Les jeux du temple · les Offrandes', en: 'The temple games · the Offerings' })}`,
    effect: tr({
      fr: "Auto-relève : le temple encaisse les offrandes avant qu'elles ne débordent (éternel).",
      en: 'Auto-collect: the temple cashes the offerings before they overflow (permanent).'
    }),
    owned: Boolean(trunkAutoState.unlocked), locked: false,
    canBuy: !trunkAutoState.unlocked && faveur >= trunkUnlockCost,
    buyLabel: tr({ fr: 'Débloquer', en: 'Unlock' }),
    cost: trunkAutoState.unlocked ? tr({ fr: 'Acquis', en: 'Owned' }) : <><FaveurIcon /> {fmt(trunkUnlockCost)}</>,
    buy: () => unlockTempleAuto('tronc')
  }] : [];
  // Bouteilles fixes (lignées) sinon prochaine bouteille libre de l'armoire de sa
  // catégorie → AUCUN item n'est masqué (les nouveaux augments apparaissent tout
  // seuls dans la bonne armoire, puis on affine leur position).
  const nextSlot = { jeu: 0, qol: 0, prod: 0 };
  const shopObjs = [...templeObjs, ...trunkObjs, ...heritageObjs, ...faveurObjs].map((o) => {
    if (o.slot) return o;
    const shelf = ARMOIRE_SLOTS[o.shelf] ? o.shelf : 'prod';
    return { ...o, slot: ARMOIRE_SLOTS[shelf][(nextSlot[shelf]++) % ARMOIRE_SLOTS[shelf].length] };
  });
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
          <span className="wallet-balance wallet-faveur" {...tipProps(null, tr({ fr: 'Faveur. Se gagne aux jeux du temple (Régulation).', en: 'Favor. Earned at the temple games (Regulation).' }))}>
            <span className="wallet-icon" aria-hidden="true"><FaveurIcon /></span>
            <span className="wallet-amount">{fmt(faveur)}</span>
          </span>
        </div>

        {/* Marchandises cliquables sur les étagères. */}
        {shopObjs.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`shop-hotspot${o.locked ? ' is-locked' : o.owned ? ' is-owned' : o.canBuy ? ' is-affordable' : ''}${selectedId === o.id ? ' is-selected' : ''}`}
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
              <span className="shop-detail-name">
                {selected.icon ? `${selected.icon} ` : ''}{selected.name}
                {selected.dials ? <> <RateBadge game={selected.dials} /></> : null}
              </span>
              <span className="shop-detail-fx">{selected.effect}</span>
              <span className="shop-detail-desc">{selected.desc}</span>
            </div>
            {selected.dials ? (
              /* Capstone d'automatisation acquis : ses cadrans remplacent l'achat. */
              <div className="shop-detail-dials">
                <AutoDials game={selected.dials} />
              </div>
            ) : (
              <div className="shop-detail-buyrow">
                <span className={`shop-detail-cost shop-detail-cost--${selected.currency}`}>{selected.cost}</span>
                <button
                  type="button"
                  className="shop-detail-buy"
                  disabled={selected.owned || !selected.canBuy}
                  onClick={() => selected.buy()}
                >
                  {selected.owned
                    ? (selected.ownedLabel || tr({ fr: 'Acquis', en: 'Owned' }))
                    : (selected.buyLabel || tr({ fr: 'Acheter', en: 'Buy' }))}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="shop-detail-hint">
            {tr({
              fr: "Le Chiffonnier des cycles. Choisis un objet sur les étagères.",
              en: 'The Rag-picker of Cycles. Pick an item from the shelves.'
            })}
          </p>
        )}
      </div>

      {/* Cadmos — épitaphes permanentes (visible une fois l'héritage Cadmos acquis).
          Gardé en panneau simple sous la scène : ne se prête pas au métaphore étagère. */}
      {cadmosHeritage && (
        <div className="panel cadmos-panel">
          <div className="panel-heading">
            <div>
              <h2>{tr({ fr: "Cadmos : épitaphes permanentes", en: "Cadmus: permanent epitaphs" })}</h2>
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
              <em>{tr({ fr: "Aucun Âge à graver. Nomme des Âges pendant un cycle sous le Mythe de Cadmos, puis reviens après l'effondrement.", en: "No Age to engrave. Name Ages during a cycle under the Myth of Cadmus, then come back after the collapse." })}</em>
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
                    title={cadmosFull ? tr({ fr: `Maximum de ${CADMOS_MAX_PERMANENT_EPITAPHS} épitaphes atteint`, en: `Maximum of ${CADMOS_MAX_PERMANENT_EPITAPHS} epitaphs reached` }) : undefined}
                    {...tipProps(null, cadmosFull ? null : tr({ fr: "Graver cette épitaphe de façon permanente", en: "Engrave this epitaph permanently" }))}
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
