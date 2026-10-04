import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  isUnlocked,
  canBuyUpgrade,
  has,
  reseauRoutesCostMult
} from '../../game/core/mechanics.js';
import { buyUpgrade, engraveCadmosEpitaph, faveurShopItems, buyFaveurItem, artifactTree, buyArtifactNode, unlockTempleAuto, templeAutoUnlockCost } from '../../game/core/actions.js';
import { state, openView } from '../../game/core/state.js';
import { upgrades } from '../../game/data/upgrades.js';
import { codexSavoirBonus } from '../../game/data/world.js';
import { CADMOS_MAX_PERMANENT_EPITAPHS, CADMOS_EPITAPH_BONUS_PCT } from '../../game/data/myths.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
import { fmt } from '../../game/core/utils.js';
import {
  LABELS as FAVEUR_LABELS,
  DESCS as FAVEUR_DESCS,
  effectLine as faveurEffectLine
} from '../ui/faveurShopMeta.js';
import { tr } from '../../game/core/i18n.js';
import { FaveurIcon } from '../ui/FaveurIcon.jsx';
import { tipProps } from '../ui/HelpBubble.jsx';
import PlaceScene from '../ui/PlaceScene.jsx';
import PixelIcon from '../ui/PixelIcon.jsx';
import AutoDials, { RateBadge } from '../ui/TempleAutoDials.jsx';
import { BOTTLE_POS, bottleOf } from './echoppeBottles.js';

/**
 * LA BOUTIQUE — l'échoppe du Chiffonnier des cycles (refonte V4, « toute
 * l'échoppe à refaire », demande de Raph sur la V2).
 *
 * En haut, le décor PixelLab (echoppe-neuve.png) en entier, agrandi d'un facteur
 * entier : trois armoires de flacons, le vieux marchand au comptoir. Les flacons
 * NE SE CLIQUENT PLUS : celui de l'article présélectionné S'ILLUMINE (sa découpe
 * exacte posée sur lui, éclairée, et un halo) — au survol d'une ligne, et pour
 * l'article choisi.
 * En bas, le COMPTOIR : les trois armoires en listes (jeux, confort, production),
 * rangées par lignée, et la FICHE de l'article dans le cadre grec — effet, prix,
 * achat (ou les cadrans d'un automate acquis).
 * Tout se paie en FAVEUR (arbitrage Raph 2026-07-15) — sauf les épitaphes de
 * Cadmos (héritage du mythe), gratuites et plafonnées, rangées en articles dans
 * l'armoire de la production. Montée aussi en plein cadre
 * dans la Maison des Plaisirs (PlaisirsView) : la mise en page suit son conteneur.
 */

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

// Répartition des upgrades d'Héritage dans les armoires (défaut : production).
const HERITAGE_ARMOIRE = {
  reforme_administrative: 'qol',   // bouton Max
  protocoles_urgence: 'qol',       // Rationner/Recensement automatiques
  conservateurs_ruines: 'qol',     // auto-achat ruines après effondrement
  reseau_routes: 'prod',           // coûts de construction réduits
  codex_mythique: 'prod',          // +Savoir à chaque cycle
  rituel_effondrement: 'prod'      // +25 % de ruines à l'effondrement
};

// L'état d'un article, pour la liste comme pour la fiche.
function wareState(o, faveur) {
  if (o.owned) return 'owned';
  if (o.gift) return 'gift';
  if (o.locked) return 'rank';
  if (o.free) return o.canBuy ? 'afford' : 'poor';
  return o.canBuy || faveur >= (o.price || 0) ? 'afford' : 'poor';
}

// Le flacon de l'article (sa silhouette, détourée dans le décor) ; à défaut son
// emblème, à défaut la Faveur.
function BottleThumb({ ware, className = '' }) {
  const b = bottleOf(ware.id);
  return (
    <span className={`ware-bottle ${className}`.trim()} aria-hidden="true">
      {b
        ? <img src={`/pixelart/boutique/flacons/${b}.png`} alt="" draggable="false" />
        : ware.icon ? <PixelIcon name={ware.icon} size={16} /> : <FaveurIcon />}
    </span>
  );
}

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
    // (on/mise/tempo/plancher), plus le rite des osselets et la cible d'Icare. La mise
    // (stakeStep, une part de la limite) en fait partie : l'omettre retardait son
    // affichage d'un tick.
    const autoKey = ['osselets', 'icarus', 'gratteux', 'vingtetun']
      .map((k) => { const g = t[k] || {}; return `${g.unlocked}:${g.on}:${g.rite || ''}:${g.tempo}:${g.faveurFloor}:${g.target || 0}:${g.stakeStep || ''}`; })
      .join('|');
    return `${s.styletLevel || 0}:${s.blessingUntil || 0}:${Math.floor((s.instability || 0) * 1000)}:${arts}:${tr_.unlocked}:${autoKey}`;
  });
  const cadmosHeritage = useGameState((s) => Boolean(s.cadmosHeritage));
  const cadmosPermanentEpitaphs = useGameState((s) => s.cadmosPermanentEpitaphs) || [];
  const cadmosLastRunChronicle = useGameState((s) => s.cadmosLastRunChronicle) || [];
  const cadmosChronicle = useGameState((s) => s.cadmosChronicle) || [];

  // Article CHOISI (fiche + flacon allumé) et article SURVOLÉ (flacon allumé).
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

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

  // Les upgrades d'Héritage : payés en FAVEUR, comme tout à la Boutique.
  const heritageObjs = visibleHeritageUpgrades.map((u) => {
    const owned = has(u.id);
    return {
      id: u.id, shelf: HERITAGE_ARMOIRE[u.id] || 'prod',
      name: u.name, desc: u.desc, owned, canBuy: canBuyUpgrade(u),
      price: u.cost?.faveur || 0,
      effect: liveEffectLine(u, cycles, bestEraIndex, owned) || u.effect,
      buy: () => { if (buyUpgrade(u.id)) pushOutcomeFloat({ label: `✓ ${u.name}`, kind: 'gain' }); }
    };
  });
  // Boutique de Faveur : seul le consommable BÉNÉDICTION reste à l'étal (les dés
  // pipés et les ailes cirées ont disparu au lot 1 des gains « vrai casino »). Un
  // nouveau kind est toléré (repli sur ses champs).
  const faveurObjs = faveurShopItems().filter((it) => it.kind === 'blessing').map((it) => {
    const known = FAVEUR_LABELS[it.kind];
    return {
      id: `faveur_${it.id}`, shelf: 'prod',
      name: known ? tr(known) : (it.name || it.label || it.kind),
      desc: FAVEUR_DESCS[it.kind] ? tr(FAVEUR_DESCS[it.kind]) : (it.desc || ''),
      owned: it.maxed, canBuy: it.canAfford && !it.maxed, price: it.cost,
      ownedLabel: tr({ fr: 'Complet', en: 'Full' }),
      effect: known ? faveurEffectLine(it) : (it.fx || it.effect || ''),
      buy: () => { if (!it.maxed && it.canAfford) buyFaveurItem(it.id); }
    };
  });
  // Les artefacts des jeux du temple, en ÉCHELLE (le rang N exige le rang N-1).
  // Une lignée n'expose ses articles qu'une fois son ère atteinte. Le capstone
  // acquis déplie ses cadrans dans la fiche (champ `dials`).
  const tree = artifactTree().filter((lin) => lin.eraOk);
  const nodeObj = (lin, node) => {
    const isLevel = node.kind === 'level';
    const lvl = isLevel && node.level > 0
      ? ` · ${tr({ fr: 'niv.', en: 'lvl' })} ${node.level}${node.maxed ? ` (${tr({ fr: 'max', en: 'max' })})` : `/${node.maxLevel}`}`
      : '';
    // Cadeau de rang (lot 2) : le titre de la Maison qui l'offre, à la place du prix.
    const gift = node.lockedReason === 'gift' && node.giftLabel ? tr(node.giftLabel) : null;
    return {
      id: `temple_${node.id}`,
      gift,
      name: `${tr(node.label)}${lvl}`,
      desc: `${tr(lin.label)} · ${tr(lin.subtitle)}`,
      effect: tr(node.desc),
      owned: node.maxed, locked: !node.unlocked && !gift, canBuy: node.buyable, price: node.cost || 0,
      ownedLabel: isLevel ? tr({ fr: 'Complet', en: 'Full' }) : null,
      buyLabel: isLevel
        ? tr({ fr: 'Améliorer', en: 'Upgrade' })
        : node.kind === 'automation'
          ? tr({ fr: 'Débloquer', en: 'Unlock' })
          : tr({ fr: 'Acheter', en: 'Buy' }),
      buy: () => buyArtifactNode(node.id),
      dials: node.kind === 'automation' && node.owned && state.templeAuto ? lin.id : null
    };
  };
  // L'AUTO-RELÈVE DES OFFRANDES (arbitrage Raph 2026-07-16) : la sébile du
  // sacristain. L'achat débloque ET active ; le toggle reste sur la ligne des
  // Offrandes. Gatée comme la lignée osselets (ère II) — le tronc naît avec la table.
  const trunkAutoState = state.templeAuto?.tronc || {};
  const trunkUnlockCost = templeAutoUnlockCost('tronc');
  const trunkObjs = tree.some((lin) => lin.id === 'osselets') ? [{
    id: 'temple_autoTronc',
    name: tr({ fr: 'Sébile du sacristain', en: "Sacristan's dish" }),
    desc: tr({ fr: 'Les jeux du temple · les Offrandes', en: 'The temple games · the Offerings' }),
    effect: tr({
      fr: "Auto-relève : le temple encaisse les offrandes avant qu'elles ne débordent (éternel).",
      en: 'Auto-collect: the temple cashes the offerings before they overflow (permanent).'
    }),
    owned: Boolean(trunkAutoState.unlocked), locked: false,
    canBuy: !trunkAutoState.unlocked && faveur >= trunkUnlockCost, price: trunkUnlockCost,
    buyLabel: tr({ fr: 'Débloquer', en: 'Unlock' }),
    buy: () => unlockTempleAuto('tronc')
  }] : [];

  // CADMOS (héritage du mythe) : les Âges de la Chronique à graver en Noms de
  // Pouvoir permanents. Gratuits mais plafonnés ; la règle vit dans l'infobulle
  // du titre de leur ligne.
  const cadmosEffect = (e) => `${e.orientationLabel} +${cadmosBonusPct}% ${tr({ fr: 'permanent', en: 'permanent' })}`;
  const cadmosObjs = cadmosHeritage ? [
    ...cadmosPermanentEpitaphs.map((e) => ({
      id: `epitaphe:${e.id}`, icon: 'myths/epitaph', free: true,
      name: e.name, effect: cadmosEffect(e),
      owned: true, ownedLabel: tr({ fr: 'Gravé', en: 'Engraved' })
    })),
    ...cadmosCandidates.map((e) => ({
      id: `epitaphe:${e.id}`, icon: 'myths/epitaph', free: true,
      name: e.name, effect: cadmosEffect(e),
      owned: false, canBuy: !cadmosFull,
      buyLabel: tr({ fr: 'Graver', en: 'Engrave' }),
      blockedLabel: tr({ fr: 'Complet', en: 'Full' }),
      buy: () => engraveCadmosEpitaph(e.id)
    }))
  ] : [];

  // LES TROIS ARMOIRES du comptoir, par lignée. Le trésor du temple et la sébile
  // se rangent avec le confort, comme sur l'étagère du milieu du décor.
  const tresor = tree.find((lin) => lin.id === 'tresor');
  const cabinets = [
    {
      key: 'jeux',
      title: tr({ fr: "L'armoire des jeux", en: 'The games cabinet' }),
      lines: tree.filter((lin) => lin.id !== 'tresor').map((lin) => ({
        key: lin.id, title: tr(lin.label), wares: lin.nodes.map((n) => nodeObj(lin, n))
      }))
    },
    {
      key: 'confort',
      title: tr({ fr: "L'armoire du confort", en: 'The comfort cabinet' }),
      lines: [
        { key: 'qol', title: tr({ fr: 'Confort', en: 'Comfort' }), wares: heritageObjs.filter((o) => o.shelf === 'qol') },
        {
          key: 'tresor',
          title: tresor ? tr(tresor.label) : tr({ fr: 'Le Trésor', en: 'The Treasury' }),
          wares: [...(tresor ? tresor.nodes.map((n) => nodeObj(tresor, n)) : []), ...trunkObjs]
        }
      ]
    },
    {
      key: 'prod',
      title: tr({ fr: "L'armoire de la production", en: 'The production cabinet' }),
      lines: [
        { key: 'prod', title: tr({ fr: 'Production', en: 'Production' }), wares: [...heritageObjs.filter((o) => o.shelf !== 'qol'), ...faveurObjs] },
        {
          key: 'cadmos',
          title: tr({
            fr: `Cadmos · ${cadmosPermanentEpitaphs.length} / ${CADMOS_MAX_PERMANENT_EPITAPHS}`,
            en: `Cadmus · ${cadmosPermanentEpitaphs.length} / ${CADMOS_MAX_PERMANENT_EPITAPHS}`
          }),
          tip: tr({
            fr: `Grave un Âge inscrit à la Chronique comme Nom de Pouvoir permanent : chaque épitaphe accorde +${cadmosBonusPct}% à son orientation (Nourriture, Trésor ou Stabilité), pour toujours. Maximum ${CADMOS_MAX_PERMANENT_EPITAPHS}.`,
            en: `Engrave an Age recorded in the Chronicle as a permanent Name of Power: each epitaph grants +${cadmosBonusPct}% to its orientation (Food, Treasury or Stability), forever. Maximum ${CADMOS_MAX_PERMANENT_EPITAPHS}.`
          }),
          wares: cadmosObjs
        }
      ]
    }
  ]
    .map((c) => ({ ...c, lines: c.lines.filter((l) => l.wares.length > 0) }))
    .filter((c) => c.lines.length > 0);

  const allWares = cabinets.flatMap((c) => c.lines.flatMap((l) => l.wares.map((w) => ({ ...w, lineTitle: l.title }))));
  // Par défaut : le premier article payable, sinon le premier ouvert.
  const selected = allWares.find((o) => o.id === selectedId)
    || allWares.find((o) => wareState(o, faveur) === 'afford')
    || allWares.find((o) => !o.owned && !o.locked)
    || allWares[0]
    || null;
  const litId = hoverId || selected?.id || null;
  const lit = litId ? BOTTLE_POS[bottleOf(litId)] : null;
  const litBottle = litId ? bottleOf(litId) : null;
  const selState = selected ? wareState(selected, faveur) : null;

  return (
    <section className="view active echoppe" id="tech">
      <div className="echoppe-stage">
        <img className="echoppe-ambient" src="/pixelart/boutique/echoppe-neuve.png" alt="" aria-hidden="true" draggable="false" />
        <PlaceScene
          className="echoppe-scene"
          src="/pixelart/boutique/echoppe-neuve.png"
          alt={tr({ fr: "L'échoppe du Chiffonnier des cycles : trois armoires de flacons, le vieux marchand au comptoir", en: "The Rag-picker's shop: three cabinets of flasks, the old merchant at his counter" })}
          fit="contain"
        >
          {lit && (
            <>
              <i className="bottle-halo" style={{ left: `${lit.cx}%`, top: `${lit.cy}%` }} />
              <img
                className="bottle-lit"
                src={`/pixelart/boutique/flacons/${litBottle}.png`}
                alt=""
                draggable="false"
                style={{ left: `${lit.x}%`, top: `${lit.y}%`, width: `${lit.w}%`, height: `${lit.h}%` }}
              />
            </>
          )}
        </PlaceScene>

        {/* La bourse : la Boutique ne se paie QU'EN FAVEUR, et la Faveur se gagne
            aux tables — d'où la porte vers les Plaisirs. */}
        <div className="echoppe-wallet">
          <span className="echoppe-wallet-val" {...tipProps(tr({ fr: 'Faveur', en: 'Favor' }), tr({ fr: 'Se gagne aux jeux du temple et aux Offrandes.', en: 'Earned at the temple games and from the Offerings.' }))}>
            <FaveurIcon /> {fmt(faveur)}
          </span>
          <button type="button" className="btn-secondary echoppe-play" onClick={() => openView('plaisirs')}>
            {tr({ fr: 'Aller jouer', en: 'Go play' })}
          </button>
        </div>
      </div>

      <div className="echoppe-counter">
        {cabinets.map((cab) => (
          <section key={cab.key} className="echoppe-cabinet" aria-label={cab.title}>
            <header className="echoppe-cabinet-head"><h2>{cab.title}</h2></header>
            <div className="echoppe-cabinet-body">
              {cab.lines.map((line) => (
                <div key={line.key} className="echoppe-line">
                  <h3 className="echoppe-line-title" {...(line.tip ? tipProps(line.title, line.tip) : {})}>{line.title}</h3>
                  <div className="echoppe-wares">
                    {line.wares.map((o) => {
                      const st = wareState(o, faveur);
                      return (
                        <button
                          key={o.id}
                          type="button"
                          className={`ware is-${st}${selected?.id === o.id ? ' is-sel' : ''}`}
                          aria-pressed={selected?.id === o.id}
                          onClick={() => setSelectedId(o.id)}
                          onMouseEnter={() => setHoverId(o.id)}
                          onMouseLeave={() => setHoverId(null)}
                          onFocus={() => setHoverId(o.id)}
                          onBlur={() => setHoverId(null)}
                        >
                          <BottleThumb ware={o} />
                          <span className="ware-name">{o.name}</span>
                          <span className="ware-price">
                            {st === 'owned'
                              ? `✓ ${o.ownedLabel || tr({ fr: 'Acquis', en: 'Owned' })}`
                              : st === 'gift'
                                ? `🎁 ${o.gift}`
                                : st === 'rank'
                                  ? '🔒'
                                  : o.free ? null : <><FaveurIcon /> {fmt(o.price)}</>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* LA FICHE de l'article : le seul cadre grec de l'écran — c'est là qu'on
            décide. */}
        {selected && (
          <aside className="echoppe-card" aria-live="polite">
            <div className="echoppe-card-top">
              <BottleThumb ware={selected} className="is-big" />
              <div className="echoppe-card-title">
                <span className="echoppe-card-line">{selected.lineTitle}</span>
                {/* Automate acquis : ce qu'il fait passe dans l'infobulle du titre,
                    ses cadrans prennent la place (sinon le dernier débordait). */}
                <h3 {...(selected.dials ? tipProps(selected.name, selected.effect) : {})}>
                  {selected.name}
                  {selected.dials ? <> <RateBadge game={selected.dials} /></> : null}
                </h3>
              </div>
            </div>
            {!selected.dials && <p className="echoppe-card-effect">{selected.effect}</p>}
            {selected.dials ? (
              /* Capstone d'automatisation acquis : ses cadrans remplacent l'achat. */
              <div className="echoppe-card-dials">
                <AutoDials game={selected.dials} />
              </div>
            ) : (
              <div className="echoppe-card-foot">
                <span className="echoppe-card-price">
                  {selState === 'owned' || selState === 'gift' || selected.free ? '' : <><FaveurIcon /> {fmt(selected.price)}</>}
                </span>
                {selState === 'owned' ? (
                  <span className="echoppe-card-state is-owned">✓ {selected.ownedLabel || tr({ fr: 'Acquis', en: 'Owned' })}</span>
                ) : selState === 'gift' ? (
                  <span
                    className="echoppe-card-state is-gift"
                    {...tipProps(tr({ fr: 'Un cadeau de la Maison', en: 'A gift from the House' }), tr({
                      fr: `Il ne se vend pas : la Maison l'offre au titre de ${selected.gift}, que l'on gagne en jouant à ses tables.`,
                      en: `Not for sale: the House gives it with the title ${selected.gift}, earned by playing at its tables.`
                    }))}
                  >
                    🎁 {selected.gift}
                  </span>
                ) : selState === 'rank' ? (
                  <span className="echoppe-card-state">🔒 {tr({ fr: 'Rang précédent', en: 'Previous rank' })}</span>
                ) : (
                  <button
                    type="button"
                    className="btn-primary echoppe-buy"
                    disabled={!selected.canBuy}
                    onClick={() => selected.buy()}
                  >
                    {selected.canBuy
                      ? (selected.buyLabel || tr({ fr: 'Acheter', en: 'Buy' }))
                      : selected.free
                        ? selected.blockedLabel
                        : tr({ fr: `Il manque ${fmt(Math.max(0, (selected.price || 0) - faveur))}`, en: `${fmt(Math.max(0, (selected.price || 0) - faveur))} short` })}
                  </button>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
