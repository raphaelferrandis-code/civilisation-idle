import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { renderCache } from '../../game/core/state.js';
import {
  GRAND_RESET_MILESTONES,
  isGrandResetMilestoneRevealed,
  isGrandResetMilestoneClaimed,
  isGrandResetMilestoneClaimable,
  claimableGrandResetCount,
  grandResetMilestoneProgress
} from '../../game/core/mechanics.js';
import { performGrandReset } from '../../game/core/actions.js';
import { GRAND_RESET_PROD_BASE } from '../../game/core/balance.js';
import { tr } from '../../game/core/i18n.js';
import { fmt } from '../../game/core/utils.js';

// Un compteur de sceau s'écrit en entier ; seul le Rayonnement, qui dépasse le
// domaine lisible, passe par le format compact.
const grNombre = (v) => (typeof v === "number" ? String(Math.floor(v)) : fmt(v));
import PixelIcon from './PixelIcon.jsx';
import { tipProps } from './HelpBubble.jsx';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

// Gain de production d'UN sceau, lu à la source (GRAND_RESET_PROD_BASE) : le
// libellé suit la constante au lieu de la figer. Virgule décimale côté français.
const prodStep = { fr: String(GRAND_RESET_PROD_BASE).replace('.', ','), en: String(GRAND_RESET_PROD_BASE) };

// Médaillon pixel-art de chaque sceau (emblèmes existants + 2 dédiés). Montré
// SEULEMENT une fois le sceau révélé : avant, il vendrait la mèche du secret.
const MILESTONE_GLYPHS = {
  1: 'glyphs/cycles',
  2: 'glyphs/merveille',
  3: 'myths/pacte',
  4: 'ruins/population',
  5: 'glyphs/olympe',
  6: 'prep/sceau',
  7: 'icarus/icarus',
  8: 'myths/atrides',
  9: 'glyphs/couronne',
  10: 'glyphs/temps',
  11: 'myths/phenix'
};

// Plateau des Sceaux du Grand Reset (page Effondrement, sous la Doctrine de crise).
// Système ORDRE-LIBRE : les 11 sceaux se réclament indépendamment, dans n'importe
// quel ordre. Remplir la condition d'un sceau le LATCHE « prêt » à vie (banking) ;
// réclamer un sceau coûte un reset et donne GRAND_RESET_PROD_BASE permanent (le
// libellé de récompense lit la constante). Chaque sceau reste masqué
// (« ??? ») jusqu'à ce que sa condition soit atteinte une 1re fois.
export default function GrandResetLadder() {
  const grandResetCount = useGameState(s => s.grandResetCount || 0);
  const ragnarokHeritage = useGameState(s => Boolean(s.ragnarokHeritage));
  // Abonnement à l'horloge du tick : re-rend en direct pour refléter l'atteinte /
  // le latch d'un sceau (les checks lisent le state courant) sans sélecteur par sceau.
  useGameState(() => renderCache.tickNow);

  const maxGR = ragnarokHeritage ? 11 : 10;
  const rungs = GRAND_RESET_MILESTONES.filter(m => m.gr <= maxGR);
  const claimable = claimableGrandResetCount();

  // Sélection multiple : cocher plusieurs sceaux prêts et les réclamer dans un
  // SEUL reset. Strictement équivalent aux resets un par un (le multiplicateur
  // ne dépend que du NOMBRE de sceaux réclamés), mais un seul effacement. Les
  // cases n'apparaissent qu'à 2 sceaux prêts, sinon elles encombrent pour rien.
  const [checked, setChecked] = useState(() => new Set());
  const multi = claimable >= 2;
  // La sélection est refiltrée à chaque rendu : un sceau réclamé (ou devenu
  // non réclamable) ne peut pas traîner dans le lot.
  const picked = multi ? rungs.filter(m => checked.has(m.gr) && isGrandResetMilestoneClaimable(m.gr)).map(m => m.gr) : [];
  const toggle = (gr) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(gr)) next.delete(gr); else next.add(gr);
    return next;
  });
  const toggleAll = () => setChecked(picked.length === claimable
    ? new Set()
    : new Set(rungs.filter(m => isGrandResetMilestoneClaimable(m.gr)).map(m => m.gr)));

  // Cliché des sceaux déjà révélés au montage : une révélation qui survient EN
  // SESSION (absente du cliché) déclenche l'animation de dorure, une seule fois.
  const [initialRevealed] = useState(() => new Set(
    GRAND_RESET_MILESTONES
      .filter(m => isGrandResetMilestoneRevealed(m.gr))
      .map(m => m.gr)
  ));

  return (
    <div className="panel gr-ladder-panel">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: "Les Sceaux du Grand Reset", en: "The Grand Reset Seals" })}</h2>
          <p className="gr-ladder-hint">
            {tr({
              fr: "Débloque-les dans l'ordre que tu veux. Un sceau atteint reste réclamable à vie. Quand plusieurs sont prêts, coche-les pour tous les réclamer dans un seul reset.",
              en: "Unlock them in any order. A reached seal stays claimable forever. When several are ready, tick them to claim them all in a single reset."
            })}
          </p>
        </div>
        <div className="gr-ladder-progress">
          <span className="gr-notches" aria-hidden="true">
            {rungs.map(m => (
              <span
                key={m.gr}
                className={`gr-notch${isGrandResetMilestoneClaimed(m.gr) ? ' is-filled' : isGrandResetMilestoneClaimable(m.gr) ? ' is-next' : ''}`}
              />
            ))}
          </span>
          <span className="gr-ladder-count">{grandResetCount} / {maxGR}</span>
        </div>
      </div>

      {claimable > 0 && (
        <div className="gr-ladder-batch">
          <p className="gr-ladder-ready" role="status">
            {tr({
              fr: `✦ ${claimable} sceau${claimable > 1 ? 'x' : ''} prêt${claimable > 1 ? 's' : ''} à réclamer`,
              en: `✦ ${claimable} seal${claimable > 1 ? 's' : ''} ready to claim`
            })}
          </p>
          {multi && (
            <>
              <button className="gr-batch-all" onClick={toggleAll}>
                {picked.length === claimable
                  ? tr({ fr: "Tout décocher", en: "Untick all" })
                  : tr({ fr: "Tout cocher", en: "Tick all" })}
              </button>
              <button
                className="gr-batch-btn"
                disabled={picked.length === 0}
                onClick={() => performGrandReset(picked)}
              >
                {picked.length > 1
                  ? tr({ fr: `Réclamer les ${picked.length} sceaux cochés`, en: `Claim the ${picked.length} ticked seals` })
                  : tr({ fr: "Réclamer les sceaux cochés", en: "Claim ticked seals" })}
              </button>
            </>
          )}
        </div>
      )}

      <ol className="gr-ladder">
        {rungs.map(m => {
          const claimed = isGrandResetMilestoneClaimed(m.gr);
          const ready = isGrandResetMilestoneClaimable(m.gr);
          const revealed = claimed || isGrandResetMilestoneRevealed(m.gr);
          // Seul cas « révélé mais pas réclamable » : le Ragnarök (gr 11) découvert
          // sans encore posséder l'héritage du pacte final.
          const ragnarokLocked = m.gr === 11 && revealed && !claimed && !ready;
          const fresh = revealed && !initialRevealed.has(m.gr);
          const status = claimed ? 'done' : ready ? 'ready' : revealed ? 'next' : 'locked';
          // Récompense MARGINALE : chaque sceau réclamé multiplie la production par
          // GRAND_RESET_PROD_BASE (le total est base^réclamés, indépendant de l'ordre).
          // Le libellé LIT la constante : un rééquilibrage ne doit pas faire mentir
          // l'affichage (la base est passée de 2 à 3,5 sans que ce texte suive).
          const reward = m.gr === 11
            ? tr({ fr: `×${prodStep.fr} & ×4 Ruines`, en: `×${prodStep.en} & ×4 Ruins` })
            : tr({ fr: `×${prodStep.fr} prod`, en: `×${prodStep.en} prod` });
          // Progression chiffrée (B9). null sur les sceaux binaires — l'Olympe,
          // le jackpot d'Icare, le premier Mythe : on les a ou on ne les a pas.
          const jauge = grandResetMilestoneProgress(m);
          // Les compteurs sont des ENTIERS (cycles, merveilles, mythes, capstones,
          // ère) : fmt() les décorerait en « 4.0 / 3.0 ». Seul le Rayonnement est
          // un Decimal hors du domaine lisible, et lui a besoin de fmt().
          const chiffres = jauge
            ? `${grNombre(jauge.current)} / ${grNombre(jauge.target)}`
            : "";

          return (
            <li key={m.gr} className={`gr-rung is-${status}${fresh ? ' is-fresh' : ''}`}>
              {/* size explicite : taille portée par `.gr-medal .px-icon` (ancêtre).
                  Le breakpoint étroit la ramène à 24 ; on sert le 32, réduit de 4/3
                  sur mobile uniquement.
                  ⚠ Ce commentaire vit ICI et pas dans la branche du ternaire ci-dessous :
                  entre `? (` et le JSX, une accolade de commentaire est lue comme un
                  littéral d'objet et le fichier ne parse plus — build KO et onglet
                  Effondrement blanc, sans qu'aucun test ne le voie (aucun n'importe ce
                  composant, donc Vitest ne le transforme jamais). */}
              <span className="gr-medal" aria-hidden="true">
                {revealed ? (
                  <PixelIcon name={MILESTONE_GLYPHS[m.gr]} className="gr-medal-icon" size={32} />
                ) : (
                  <span className="gr-medal-rune" />
                )}
              </span>
              <span className="gr-rung-num">{ROMAN[m.gr]}</span>
              <span className="gr-rung-body">
                <span className="gr-rung-jalon">
                  {revealed ? tr(m.name)
                    : <span className="gr-rune-line" {...tipProps(null, tr({ fr: "Sceau scellé", en: "Sealed" }))} />}
                </span>
                <span className="gr-rung-sub">
                  {ragnarokLocked
                    ? tr({ fr: "Exige le pacte du Ragnarök", en: "Requires the Ragnarök pact" })
                    : revealed ? tr(m.system)
                    : tr({ fr: "Sceau à découvrir…", en: "Seal to discover…" })}
                </span>
                {/* JAUGE CHIFFRÉE (B9). Sur un sceau SCELLÉ elle reste ANONYME :
                    on montre qu'on approche, jamais de quoi. Nommer le système
                    ici dévoilerait l'Olympe ou Icare à un joueur qui ne les a
                    pas rencontrés — c'est ce que le régime à deux états du
                    plateau refuse déjà, et c'est l'arbitrage retenu.
                    Absente sur les sceaux binaires (progress() rend null) et
                    pendant le verrou Ragnarök, où le chiffre ne dirait rien. */}
                {!ragnarokLocked && jauge && (
                  <span
                    className={`gr-gauge${jauge.acquis ? ' is-acquis' : ''}`}
                    {...tipProps(null, revealed
                      // Valeur VIVANTE : le compteur avance pendant qu'on lit. La
                      // bulle relit la progression tant qu'elle est ouverte, sinon
                      // le chiffre se figerait alors que celui d'à côté avance.
                      ? () => {
                        const vif = grandResetMilestoneProgress(m);
                        const n = vif ? `${grNombre(vif.current)} / ${grNombre(vif.target)}` : chiffres;
                        return tr({ fr: `${n} vers ce sceau`, en: `${n} toward this seal` });
                      }
                      : tr({ fr: "Progression vers un sceau encore scellé", en: "Progress toward a still-sealed milestone" }))}
                  >
                    <span className="gr-gauge-track">
                      <span className="gr-gauge-fill" style={{ width: `${Math.round(jauge.ratio * 100)}%` }}></span>
                    </span>
                    {/* Le chiffre ne s'écrit que sur un sceau RÉVÉLÉ : « 3 / 14 »
                        sur une rune muette trahirait l'échelle de la mécanique. */}
                    {revealed && <span className="gr-gauge-num">{chiffres}</span>}
                  </span>
                )}
              </span>
              <span className="gr-rung-reward">{reward}</span>
              <span className="gr-rung-status">
                {claimed ? (
                  <span className="gr-rung-done" {...tipProps(null, tr({ fr: "Sceau réclamé", en: "Seal claimed" }))}>✓</span>
                ) : ready ? (
                  <>
                    {multi && (
                      <label className="gr-rung-pick" {...tipProps(null, tr({ fr: "Ajouter ce sceau au lot", en: "Add this seal to the batch" }))}>
                        <input
                          type="checkbox"
                          checked={checked.has(m.gr)}
                          onChange={() => toggle(m.gr)}
                          aria-label={tr({ fr: `Ajouter ${tr(m.name)} au lot`, en: `Add ${tr(m.name)} to the batch` })}
                        />
                      </label>
                    )}
                    <button className="gr-rung-btn" onClick={() => performGrandReset(m.gr)}>
                      {tr({ fr: "Réclamer", en: "Claim" })}
                    </button>
                  </>
                ) : ragnarokLocked ? (
                  <span className="gr-rung-pending" {...tipProps(null, tr({ fr: "Honore le pacte du Ragnarök pour le réclamer", en: "Honor the Ragnarök pact to claim it" }))}>🔒</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
