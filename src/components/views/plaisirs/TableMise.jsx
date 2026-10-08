import { useEffect, useMemo } from 'react';
import { tr } from '../../../game/core/i18n.js';
import { tableLimits, chipRack, chipPile, chipIndexOf } from '../../../game/core/actions/maisonTable.js';
import { chipUrl, pileImage, CHIP_ART } from './chipsArt.js';
import { FaveurIcon } from '../../ui/FaveurIcon.jsx';
import { tipProps } from '../../ui/HelpBubble.jsx';
import { usePlaisirsBand } from '../../ui/plaisirsMaterial.js';
import { lastStakeOf, fmtMise } from './miseMemory.js';
import { preparerTable, sonJetons } from '../../../game/audio/tables/tables.js';

/**
 * LA MISE LIBRE, EN JETONS (lot 1 des gains « vrai casino », 2026-10-04,
 * docs/PLAN-GAINS-CASINO.md). Remplace les trois plaques de mise fixes et le
 * sélecteur des Coffres : on pose des jetons sur le cercle de la table, entre la
 * limite basse et la limite haute (15 min de recettes de la Maison).
 *
 *   - la PILE, sur le cercle (x, y) : la mise décomposée en jetons de l'âge ;
 *   - le montant sous la pile, puis le bouton de jeu ;
 *   - le RÂTELIER (rackY) : les cinq plus gros jetons sous la limite, puis Effacer,
 *     Même mise, Tapis. `rackStack` : les boutons passent sous les jetons (deux rangs
 *     voulus, là où la place manque : le panneau étroit de la machine à sous).
 * Pas une phrase à l'écran : la limite et les règles vivent dans les infobulles et
 * l'aide « ? ».
 *
 * `limits` ({ min, max }) : les bornes d'une table qui n'a pas celles de la salle (le
 * duel des grands flambeurs : une heure de recettes au moins, sans plafond).
 */

const PILE_SHOWN = 8; // au-delà, la pile est coupée (le montant, lui, reste exact)

export default function TableMise({
  game, x, y, k = 4, rackY, rackX, rackWidth, rackStack = false, label, sub,
  stake, onStake, faveur,
  playLabel, playDisabled, onPlay, limits, children
}) {
  const band = usePlaisirsBand();
  // Les sons des jetons (audio/tables, lot 10), rendus dès que le râtelier paraît.
  useEffect(() => { preparerTable('jetons', band); }, [band]);
  const { min, max } = limits || tableLimits();
  const cap = Math.max(0, Math.min(max, Math.floor(faveur || 0)));
  const rack = useMemo(() => chipRack(max), [max]);
  const pile = useMemo(() => chipPile(stake, rack, PILE_SHOWN).slice().reverse(), [stake, rack]);
  const img = pile.length ? pileImage(band, pile.map((v) => chipIndexOf(v))) : null;
  const last = lastStakeOf(game);
  const set = (v) => onStake(Math.max(0, Math.min(max, Math.floor(v))));
  // Mise à jour FONCTIONNELLE : deux jetons posés dans le même rendu (clics rapides)
  // s'additionnent au lieu de repartir tous deux de la même pile.
  const add = (v) => { sonJetons(band, 'pose'); onStake((s) => Math.max(0, Math.min(cap, Math.floor((s || 0) + v)))); };
  // Les sons des jetons (audio/tables, lot 10) : la pile reprise, la même mise, le tapis.
  const reprendre = () => { if (stake) sonJetons(band, 'reprend'); set(0); };
  const broke = stake > faveur;
  const tooLow = stake < min;

  return (
    <>
      <div className="ptable-mise" style={{ left: x, top: y }}>
        <button
          type="button"
          className="ptable-pile"
          onClick={reprendre}
          aria-label={tr({ fr: 'Reprendre la mise', en: 'Take the stake back' })}
          {...tipProps(tr({ fr: 'La mise', en: 'The stake' }), tr({ fr: `Entre ${fmtMise(min)} et ${fmtMise(max)} Faveur. Un clic sur la pile la reprend.`, en: `Between ${fmtMise(min)} and ${fmtMise(max)} Favor. Click the pile to take it back.` }))}
        >
          {img && (
            <img
              src={img.url}
              alt=""
              aria-hidden="true"
              draggable="false"
              style={{ width: img.w * k, height: img.h * k }}
            />
          )}
        </button>
        <span className={`ptable-mise-sum${broke ? ' is-broke' : ''}`}>
          {label && <strong>{label}</strong>}
          {sub && <small>{sub}</small>}
          <span><FaveurIcon /> {fmtMise(stake || 0)}</span>
        </span>
        <button type="button" className="scratch-buy stake-play ptable-play" disabled={playDisabled || tooLow || broke} onClick={onPlay}>
          {playLabel}
        </button>
        {children}
      </div>
      <div className={`ptable-rack${rackStack ? ' is-stack' : ''}`} style={{ left: rackX ?? x, top: rackY, ...(rackWidth ? { width: rackWidth, maxWidth: rackWidth } : null) }} role="group" aria-label={tr({ fr: 'Jetons', en: 'Chips' })}>
        {rack.map((v) => (
          <button
            key={v}
            type="button"
            className="ptable-chip"
            disabled={(stake || 0) >= cap}
            onClick={() => add(v)}
            aria-label={tr({ fr: `Jeton de ${fmtMise(v)}`, en: `${fmtMise(v)} chip` })}
          >
            <img src={chipUrl(band, chipIndexOf(v))} alt="" aria-hidden="true" draggable="false" style={{ width: CHIP_ART.w * k, height: CHIP_ART.h * k }} />
            <span>{fmtMise(v)}</span>
          </button>
        ))}
        <span className="ptable-rack-sep" aria-hidden="true" />
        <button type="button" className="ptable-rack-btn" disabled={!stake} onClick={reprendre}>
          {tr({ fr: 'Effacer', en: 'Clear' })}
        </button>
        <button type="button" className="ptable-rack-btn" disabled={!last || last === stake} onClick={() => { sonJetons(band, 'meme'); set(last); }}>
          {tr({ fr: 'Même mise', en: 'Same bet' })}
        </button>
        <button
          type="button"
          className="ptable-rack-btn is-tapis"
          disabled={cap < min || stake === cap}
          onClick={() => { sonJetons(band, 'tapis'); set(cap); }}
          {...tipProps(tr({ fr: 'Tapis', en: 'All in' }), tr({ fr: `Tout ce que la table permet : ${fmtMise(cap)}.`, en: `Everything the table allows: ${fmtMise(cap)}.` }))}
        >
          {tr({ fr: 'Tapis', en: 'All in' })}
        </button>
      </div>
    </>
  );
}
