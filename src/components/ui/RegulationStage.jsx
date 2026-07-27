import { useEffect, useState } from 'react';
import { registerTempleStage, closeTempleStage } from '../../game/core/templeGames.js';
import AuguryStage from './AuguryStage.jsx';
import IcarusStage from './IcarusStage.jsx';
import ScratchStage from './ScratchStage.jsx';
import BlackjackStage from './BlackjackStage.jsx';

/**
 * La scène des jeux du temple (retour Raph 2026-07-14 : « les jeux se lancent
 * dans le cadre vide en bas ») — colonne droite de l'étage bas de la page
 * Régulation. UN SEUL jeu actif à la fois : le pont unique (templeGames.js)
 * livre le jeu ouvert { kind, openedAt, …req } ; ouvrir un jeu remplace le
 * précédent. Vide : un simple filigrane. Échap referme (sauf si un vrai
 * dialogue est ouvert).
 *
 * Ajouter un jeu du temple = UNE entrée dans STAGES + son verbe open<Jeu>()
 * (délégant à openTempleGame). Rien d'autre à toucher ici.
 */

// Registre kind → composant de scène. Chaque scène reçoit { table, onClose },
// où `table` EST le jeu actif (elle lit openedAt comme clé de reset, et ses
// propres champs de requête — ex. table.id pour les osselets).
const STAGES = {
  augury: AuguryStage,
  icarus: IcarusStage,
  scratch: ScratchStage,
  blackjack: BlackjackStage
};

export default function RegulationStage() {
  const [game, setGame] = useState(null); // { kind, openedAt, …req } | null

  useEffect(() => registerTempleStage((g) => setGame(g)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return; // les vrais dialogues d'abord
      closeTempleStage();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const Stage = game && STAGES[game.kind];
  const empty = !Stage;

  return (
    <section className={`regul-block regulation-stage${empty ? ' is-empty' : ''}`} aria-hidden={empty ? 'true' : undefined}>
      {empty ? (
        <span className="stage-watermark" aria-hidden="true">🎲</span>
      ) : (
        /* key OBLIGATOIRE : rouvrir le MÊME jeu doit REMONTER la scène, comme
           ouvrir un jeu différent. Sans elle, le cleanup de l'effet openedAt
           coupait le ticker d'Icare et l'effet [phase] ne repartait jamais
           (phase déjà 'flying') : multiplicateur gelé, mise inencaissable (M3).
           openedAt est déjà le contrat de reset des scènes — on le donne à React. */
        <Stage key={`${game.kind}:${game.openedAt}`} table={game} onClose={() => closeTempleStage()} />
      )}
    </section>
  );
}
