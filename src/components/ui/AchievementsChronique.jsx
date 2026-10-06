import { useGameState } from '../../hooks/useGameState.js';
import { achievementList, achievementDisplaySignature, achievementIconSrc } from '../../game/core/achievements.js';
import { ACHIEVEMENT_GROUPS } from '../../game/data/achievements.js';
import { tr, getLang } from '../../game/core/i18n.js';
import { tipProps } from './HelpBubble.jsx';

// LES SUCCÈS DANS LA CHRONIQUE (audit 2026-10-05, SUCCES-AFFICHAGE, décision de Raph).
//
// Une icône par succès, rangées par famille ; le nom, la condition et la date du
// déblocage passent dans l'infobulle (aucune phrase à l'écran, aucune pastille
// encadrée). Un succès verrouillé montre son icône grise — la même que Steam ; un
// secret pas encore révélé (data/achievements.js `secret`, core/achievements.js
// achievementRevealed) ne montre ni son icône ni son nom, qui la trahiraient.

const fmtDate = (ms) => new Date(ms).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric'
});

function AchievementTile({ a }) {
  const name = a.hidden ? '???' : tr(a.name);
  let tip;
  if (a.hidden) tip = tr({ fr: 'Succès caché', en: 'Hidden achievement' });
  else if (a.unlocked && a.at) tip = [{ label: tr(a.desc) }, { label: tr({ fr: 'Débloqué', en: 'Unlocked' }), value: fmtDate(a.at) }];
  else tip = tr(a.desc);
  const etat = a.unlocked ? 'is-unlocked' : a.hidden ? 'is-hidden' : 'is-locked';
  return (
    <li className={`succes-tile ${etat}`} tabIndex={0} aria-label={name} {...tipProps(name, tip)}>
      {a.hidden
        ? <span className="succes-secret" aria-hidden="true">?</span>
        : <img src={achievementIconSrc(a.id, a.unlocked)} alt="" width={64} height={64} loading="lazy" decoding="async" draggable="false" />}
    </li>
  );
}

export default function AchievementsChronique() {
  // Ne se redessine qu'à un déblocage ou à la révélation d'un secret.
  useGameState(achievementDisplaySignature);
  const list = achievementList();
  const done = list.filter((a) => a.unlocked).length;

  return (
    <div className="panel chronique-succes">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: 'Succès', en: 'Achievements' })}</h2>
        </div>
        <span className="chronicle-reg-count">{done} / {list.length}</span>
      </div>
      <div className="succes-groups">
        {ACHIEVEMENT_GROUPS.map((g) => {
          const items = list.filter((a) => a.group === g.id);
          if (!items.length) return null;
          return (
            <section className="succes-group" key={g.id}>
              <div className="chronicle-bilan-head">
                <h3>{tr(g.label)}</h3>
                <span className="chronicle-reg-count">{items.filter((a) => a.unlocked).length} / {items.length}</span>
              </div>
              <ul className="succes-grid">
                {items.map((a) => <AchievementTile key={a.id} a={a} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
