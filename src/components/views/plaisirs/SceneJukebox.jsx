import { useGameState } from '../../../hooks/useGameState.js';
import { tr } from '../../../game/core/i18n.js';
import { getMusicTrack, getMusicTracks, stepMusicTrack } from '../../../game/core/main.js';
import { tipProps } from '../../ui/HelpBubble.jsx';
import '../../../styles/plaisirs-scene.css';

/**
 * LE PUPITRE DE LA SCÈNE (2026-10-03, demande de Raph : « la possibilité de changer
 * les musiques quand j'en rajouterai »). Quand on regarde la scène, la troupe tient
 * l'affiche du morceau qui joue : ◀ titre ▶. Les flèches n'apparaissent qu'à partir
 * de deux morceaux — tout fichier déposé dans `src/assets/musiques/` en est un.
 *
 * Posé comme le bouton d'action des jeux (en haut du lieu, sur son mur) et sous la
 * même classe : il s'efface de la même façon quand une partie s'ouvre.
 */
export default function SceneJukebox({ x, y }) {
  const piste = useGameState(() => getMusicTrack());
  const pistes = getMusicTracks();
  const t = pistes.find((p) => p.id === piste);
  if (!t) return null;
  const plusieurs = pistes.length > 1;
  const pas = (dir) => (e) => { e.stopPropagation(); stepMusicTrack(dir); };
  return (
    <div
      className="plaisirs-action scene-juke"
      style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, 3px)', zIndex: 4 }}
    >
      {plusieurs && (
        <button type="button" className="scene-juke-pas" onClick={pas(-1)} {...tipProps(null, tr({ fr: 'Morceau précédent', en: 'Previous track' }))}>◀</button>
      )}
      <span className="scene-juke-titre" aria-live="polite">♪ {t.title}</span>
      {plusieurs && (
        <button type="button" className="scene-juke-pas" onClick={pas(1)} {...tipProps(null, tr({ fr: 'Morceau suivant', en: 'Next track' }))}>▶</button>
      )}
    </div>
  );
}
