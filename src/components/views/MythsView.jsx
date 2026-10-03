import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import {
  MYTHS,
  RAGNAROK_ID,
  RAGNAROK_DURATION_MS,
  RAGNAROK_ARK_TARGET,
  getMythById,
  isMythCompleted,
  isMythActive,
  isMythUnlocked
} from '../../game/data/myths.js';
import { activateMyth } from '../../game/core/actions.js';
import Place, { PlaceKey } from '../ui/Place.jsx';
import PixelIcon from '../ui/PixelIcon.jsx';
import { tipProps } from '../ui/HelpBubble.jsx';
import { tr } from '../../game/core/i18n.js';
import { state } from '../../game/core/state.js';
import {
  OLYMPUS_COMPLETION_SCORE,
  OLYMPUS_PROFILES,
  defaultOlympusState,
  dominantOlympusProfile,
  olympusMetrics,
  unlockedOlympusProfile
} from '../../game/data/olympus.js';

// Les indices de déblocage sont calculés dynamiquement (mythCountInAct) pour ne
// jamais désynchroniser avec data/myths.js si un Mythe change d'acte.
const ACT_META = {
  1: { num: { fr: "Acte I", en: "Act I" }, name: { fr: "Fondation", en: "Foundation" }, unlockFrom: null },
  2: { num: { fr: "Acte II", en: "Act II" }, name: { fr: "Domination", en: "Domination" }, unlockFrom: 1 },
  3: { num: { fr: "Acte III", en: "Act III" }, name: { fr: "Apocalypse", en: "Apocalypse" }, unlockFrom: 2 },
  ragnarok: { num: { fr: "Ragnarok", en: "Ragnarok" }, name: { fr: "La Fin", en: "The End" }, unlockFrom: "all" }
};

const mythCountInAct = (act) => MYTHS.filter(m => m.act === act).length;
function actUnlockHint(act) {
  const from = ACT_META[act]?.unlockFrom;
  if (from == null) return null;
  if (from === "all") return tr({ fr: "Complétez les Mythes des Actes I, II et III", en: "Complete the Myths of Acts I, II and III" });
  return tr({
    fr: `Complétez les ${mythCountInAct(from)} Mythes de l'Acte ${from === 1 ? "I" : "II"}`,
    en: `Complete the ${mythCountInAct(from)} Myths of Act ${from === 1 ? "I" : "II"}`
  });
}

// Un acte s'ouvre quand le précédent est accompli ; le Ragnarok, quand les trois
// premiers le sont.
function isActUnlocked(act) {
  const allDone = (acts) => {
    const list = MYTHS.filter((m) => acts.includes(m.act));
    return list.length > 0 && list.every((m) => isMythCompleted(m.id));
  };
  if (act === 1) return true;
  if (act === 2) return allDone([1]);
  if (act === 3) return allDone([2]);
  return allDone([1, 2, 3]);
}

// Emblème pixel de chaque mythe ; sans emblème (Chaos, Prométhée, Atlas, Antée,
// Ragnarök), la tuile porte son initiale dans un médaillon.
const MYTH_ICONS = {
  mythe_d_enee: 'enee',
  mythe_de_cadmos: 'epitaph',
  mythe_d_hephaistos: 'hephaistos',
  mythe_de_sisyphe: 'sisyphe',
  mythe_de_babel: 'babel',
  mythe_age_or: 'age-or',
  mythe_d_icare: 'icare',
  mythe_du_phenix: 'phenix',
  mythe_atrides: 'atrides'
};

/**
 * Un mythe = une tuile : emblème, nom, état. La règle, l'objectif ou l'héritage
 * passent dans l'infobulle (aucune phrase à l'écran) et en entier dans la
 * fenêtre de confirmation. Jamais `disabled` : un bouton désactivé ne reçoit
 * aucun survol, et l'héritage d'un mythe accompli ne se lirait plus.
 */
function MythTile({ myth, onOpen }) {
  const unlocked = isMythUnlocked(myth);
  const completed = isMythCompleted(myth.id);
  const active = isMythActive(myth.id);
  const status = !unlocked ? 'locked' : completed ? 'done' : active ? 'active' : 'open';
  const label = {
    locked: tr({ fr: 'Verrouillé', en: 'Locked' }),
    done: tr({ fr: 'Accompli', en: 'Completed' }),
    active: tr({ fr: 'Actif', en: 'Active' }),
    open: tr({ fr: 'Disponible', en: 'Available' })
  }[status];
  const tip = !unlocked
    ? tr({ fr: "S'ouvre avec l'acte précédent.", en: 'Opens with the previous act.' })
    : [
      { label: `${tr({ fr: 'Règle', en: 'Rule' })} : ${tr(myth.description)}` },
      completed
        ? { label: `${tr({ fr: 'Héritage', en: 'Heritage' })} : ${tr(myth.heritageDescription)}` }
        : { label: `${tr({ fr: 'Objectif', en: 'Objective' })} : ${tr(myth.objectif)}` }
    ];
  const icon = MYTH_ICONS[myth.id];
  const name = tr(myth.name);
  // « Le Mythe du Chaos » → C : on retire d'abord « Le Mythe de/du/d' », puis
  // l'article (l'ordre compte : « Le » seul raterait le nom propre).
  const initial = name
    .replace(/^(le mythe (de la |de l'|des |du |de |d')|the myth of (the )?)/i, '')
    .replace(/^(le |la |les |l'|the )/i, '')
    .charAt(0)
    .toUpperCase();
  return (
    <button
      type="button"
      className={`myth-tile is-${status}`}
      aria-disabled={status === 'locked' || status === 'done'}
      onClick={() => onOpen(myth)}
      {...tipProps(name, tip)}
    >
      {icon
        ? <PixelIcon name={`myths/${icon}`} size={32} className="myth-tile-icon" />
        : <span className="myth-tile-ph" aria-hidden="true">{initial}</span>}
      <b>{name}</b>
      <span className="myth-tile-state">{label}</span>
    </button>
  );
}

const FALLBACK_OLYMPUS = defaultOlympusState(0);

// Consécration : le moteur ajoute (ferveur/100) par effondrement (olympus.js),
// donc 0,8 cran à 80 de ferveur — jamais un cran entier. Une décimale, en
// PLANCHER et non en arrondi : « 12,0/12 » avant la proclamation serait un
// mensonge, et l'ancien floor entier semblait figé après un effondrement.
const consecration = (p) => (Math.floor((p || 0) * 10) / 10).toFixed(1);

export default function MythsView() {
  const activeMythId = useGameState(s => s.activeMythId);
  const gamePaused = useGameState(s => s.gamePaused);
  const olympusState = useGameState(s => s.olympus);

  const [modalMyth, setModalMyth] = useState(null);
  const [selectedBabelCat, setSelectedBabelCat] = useState("city");

  const activeMyth = activeMythId ? getMythById(activeMythId) : null;
  const ragnarokCompleted = isMythCompleted(RAGNAROK_ID);
  const olympus = olympusState || FALLBACK_OLYMPUS;
  const olympusDominant = dominantOlympusProfile(olympus);
  const olympusUnlocked = unlockedOlympusProfile(olympus);
  const olympusMetricValues = olympusMetrics(olympus);
  const olympusProgress = olympus.profileProgress || FALLBACK_OLYMPUS.profileProgress;

  const handleOpenModal = (myth) => {
    if (gamePaused) return;
    if (!isMythUnlocked(myth) || isMythCompleted(myth.id)) return;
    setModalMyth(myth);
    setSelectedBabelCat("city");
  };

  const handleConfirmPact = async () => {
    if (!modalMyth) return;
    const mythId = modalMyth.id;
    if (modalMyth.id === "mythe_de_babel") {
      state.babelCategory = selectedBabelCat;
    }
    setModalMyth(null);
    await activateMyth(mythId);
  };

  const completedCount = MYTHS.filter((m) => isMythCompleted(m.id)).length;

  return (
    <Place
      id="mythView"
      className="mythes"
      scene="/pixelart/places/olympe.png"
      sceneAlt={tr({ fr: 'Le temple de marbre au clair de lune', en: 'The marble temple by moonlight' })}
      focus={[50, 38]}
      eyebrow={tr({ fr: 'Mythes', en: 'Myths' })}
      title={tr({ fr: 'Le Panthéon', en: 'The Pantheon' })}
      bodyClassName="mythes-body"
      keys={<>
        <PlaceKey label={tr({ fr: 'Mythes accomplis', en: 'Myths fulfilled' })} value={`${completedCount} / ${MYTHS.length}`} />
        {activeMyth && (
          <PlaceKey
            label={tr({ fr: 'Pacte actif', en: 'Active pact' })}
            value={tr(activeMyth.name)}
            valueClassName="is-title"
            tip={[{ label: tr(activeMyth.description) }, { label: `${tr({ fr: 'Objectif', en: 'Objective' })} : ${tr(activeMyth.objectif)}` }]}
          />
        )}
      </>}
    >
      <div className="mythes-main">
        {/* « L'Hiver Fimbul » : la Prophétie — les échéances scriptées du boss
            final (le compte à rebours vivant est sur la carte de la Cité). */}
        {activeMythId === RAGNAROK_ID && (
          <section className="mythes-panel ragnarok-prophecy">
            <header className="mythes-panel-head"><h2>{tr({ fr: 'La Prophétie', en: 'The Prophecy' })}</h2></header>
            <ul>
              <li><b>8 min</b> {tr({ fr: "l'Hiver : la production gelée de moitié", en: 'the Winter: production frozen by half' })}</li>
              <li><b>14 min</b> {tr({ fr: 'le Loup : il dévore les bâtiments', en: 'the Wolf: it devours buildings' })}</li>
              <li><b>20 min</b> {tr({ fr: 'le Feu de Surt : la Rupture monte, insensible aux leviers', en: "Surtr's Fire: Rupture rises, deaf to every lever" })}</li>
              <li><b>{RAGNAROK_DURATION_MS / 60_000} min</b> {tr({ fr: `la Fin — l'Arche : ${RAGNAROK_ARK_TARGET} offrandes`, en: `the End — the Ark: ${RAGNAROK_ARK_TARGET} offerings` })}</li>
            </ul>
          </section>
        )}

        <section className="mythes-panel" aria-labelledby="mythes-acts-title">
          <header className="mythes-panel-head">
            <h2 id="mythes-acts-title">{tr({ fr: 'Les Actes', en: 'The Acts' })}</h2>
            {ragnarokCompleted && <span className="mythes-chip is-gold">{tr({ fr: 'Fresque complète', en: 'Fresco complete' })}</span>}
          </header>
          <div className={`myth-acts${ragnarokCompleted ? ' myth-fresco-complete' : ''}`}>
            {[1, 2, 3, 'ragnarok'].map((act) => {
              const mythsInAct = MYTHS.filter((m) => m.act === act);
              const meta = ACT_META[act] || { num: { fr: String(act), en: String(act) }, name: { fr: '', en: '' } };
              const actUnlocked = isActUnlocked(act);
              const done = mythsInAct.filter((m) => isMythCompleted(m.id)).length;
              const actCompleted = mythsInAct.length > 0 && done === mythsInAct.length;
              return (
                <div key={act} className={`myth-act-block${!actUnlocked ? ' is-locked' : ''}${actCompleted ? ' is-done' : ''}`}>
                  <header className="myth-act-head">
                    <h3>{tr(meta.num)} · {tr(meta.name)}</h3>
                    {actUnlocked
                      ? <small>{done} / {mythsInAct.length}</small>
                      : <small {...tipProps(tr(meta.num), actUnlockHint(act))}>🔒</small>}
                  </header>
                  <div className="myth-tile-grid">
                    {mythsInAct.length === 0
                      ? <span className="myth-tile-empty">—</span>
                      : mythsInAct.map((myth) => <MythTile key={myth.id} myth={myth} onOpen={handleOpenModal} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mythes-panel olympus-panel" aria-labelledby="mythes-olympus-title">
        <header className="mythes-panel-head">
          <h2 id="mythes-olympus-title">{tr({ fr: "L'Olympe", en: 'Olympus' })}</h2>
          <span className={`mythes-chip${olympusUnlocked ? ' is-gold' : ''}`}>
            {olympusUnlocked ? tr({ fr: 'Religion proclamée', en: 'Religion proclaimed' }) : tr({ fr: 'Croyance émergente', en: 'Emerging belief' })}
          </span>
        </header>
        <div className="cult-list">
          {Object.values(OLYMPUS_PROFILES).map((profile) => {
            const score = olympusDominant.scores[profile.id] || 0;
            const progress = olympusProgress[profile.id] || 0;
            const isDominant = profile.id === olympusDominant.profile.id;
            const isUnlocked = olympusUnlocked?.id === profile.id;
            return (
              <div
                key={profile.id}
                className={`cult${isDominant ? ' is-top' : ''}${isUnlocked ? ' is-proclaimed' : ''}`}
                {...tipProps(profile.name, [
                  { label: profile.feeds },
                  {
                    label: isUnlocked
                      ? tr({ fr: `Héritage actif : ${profile.heritageDescription}`, en: `Active heritage: ${profile.heritageDescription}` })
                      : tr({ fr: `Si proclamé : ${profile.heritageDescription}`, en: `If proclaimed: ${profile.heritageDescription}` })
                  }
                ])}
              >
                <span className="cult-names"><b>{profile.name}</b><small>{profile.short}</small></span>
                <span className="cult-score">{score} / 100</span>
                <span className="cult-track" aria-hidden="true"><i style={{ width: `${Math.min(100, score)}%` }} /></span>
                {/* La consécration n'avance que pour le culte DOMINANT : ailleurs,
                    seulement si elle a déjà des crans gravés. */}
                {(isDominant || progress > 0) && (
                  <span className="cult-consecration">
                    {tr({ fr: 'consécration', en: 'consecration' })} {consecration(progress)} / {OLYMPUS_COMPLETION_SCORE}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="olympus-seen">
          <h3>{tr({ fr: 'Ce que la cité a vu', en: 'What the city has seen' })}</h3>
          <dl>
            <div><dt>{tr({ fr: 'Effondrements volontaires', en: 'Voluntary collapses' })}</dt><dd>{olympusMetricValues.collapseFrequency.toFixed(2)} /h</dd></div>
            <div><dt>{tr({ fr: 'Crises résolues', en: 'Crises resolved' })}</dt><dd>{Math.round(olympusMetricValues.crisisResolutionRatio * 100)} %</dd></div>
            <div><dt>{tr({ fr: 'Temps sans intervenir', en: 'Time without intervening' })}</dt><dd>{Math.round(olympusMetricValues.idleRatio * 100)} %</dd></div>
            <div><dt>{tr({ fr: 'Rupture moyenne à la chute', en: 'Average Rupture at collapse' })}</dt><dd>{Math.round(olympusMetricValues.averageCollapseRupture * 100)} %</dd></div>
          </dl>
        </div>
      </section>

      {/* Confirmation Modal */}
      {modalMyth && (
        <div className="modal-backdrop" onClick={() => setModalMyth(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <dialog open className="event-dialog myth-modal" style={{ display: 'block', position: 'static' }}>
              <span className="label">
                {ACT_META[modalMyth.act] ? tr(ACT_META[modalMyth.act].num) : modalMyth.act} - {ACT_META[modalMyth.act] ? tr(ACT_META[modalMyth.act].name) : ""}
              </span>
              <h2>{tr(modalMyth.name)}</h2>

              <div className="myth-modal-body">
                <div className="myth-modal-row">
                  <span className="myth-modal-label">{tr({ fr: 'Règle imposée', en: 'Imposed rule' })}</span>
                  <span>{tr(modalMyth.description)}</span>
                </div>
                <div className="myth-modal-row">
                  <span className="myth-modal-label">{tr({ fr: 'Objectif', en: 'Objective' })}</span>
                  <span>{tr(modalMyth.objectif)}</span>
                </div>
                <div className="myth-modal-row myth-modal-heritage">
                  <span className="myth-modal-label">{tr({ fr: 'Héritage promis', en: 'Promised heritage' })}</span>
                  <span>{tr(modalMyth.heritageDescription)}</span>
                </div>

                {/* Custom Options for Babel */}
                {modalMyth.id === "mythe_de_babel" && (
                  <div className="myth-modal-row">
                    <span className="myth-modal-label">{tr({ fr: 'Type de bâtiment', en: 'Building type' })}</span>
                    <div className="babel-category-choice" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {[
                        { value: "city", label: { fr: "Cité", en: "City" }, desc: { fr: "Nourriture, Commerce, Rayonnement", en: "Food, Trade, Radiance" } },
                        { value: "knowledge", label: { fr: "Savoir", en: "Knowledge" }, desc: { fr: "Connaissance, Académies, Archives", en: "Knowledge, Academies, Archives" } },
                        { value: "infra", label: { fr: "Infrastructure", en: "Infrastructure" }, desc: { fr: "Eau, Routes, Bâtisseurs", en: "Water, Roads, Builders" } }
                      ].map(c => (
                        <label key={c.value} className="babel-cat-option" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="babelCategory"
                            value={c.value}
                            checked={selectedBabelCat === c.value}
                            onChange={() => setSelectedBabelCat(c.value)}
                          />
                          <div>
                            <span className="babel-cat-name" style={{ fontWeight: 'bold' }}>{tr(c.label)}</span>
                            <span className="babel-cat-desc" style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)' }}>{tr(c.desc)}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <p className="myth-modal-warning" style={{ color: 'var(--red)', marginTop: '1rem', fontSize: '0.9rem' }}>
                {activeMythId && activeMythId !== modalMyth.id
                  ? tr({
                      fr: `Le pacte "${activeMyth?.name ? tr(activeMyth.name) : 'en cours'}" est déjà actif ce cycle et sera abandonné. Le cycle sera réinitialisé.`,
                      en: `The pact "${activeMyth?.name ? tr(activeMyth.name) : 'in progress'}" is already active this cycle and will be abandoned. The cycle will be reset.`
                    })
                  : activeMythId === modalMyth.id
                  ? tr({ fr: `Ce pacte est déjà actif. Confirmer va réinitialiser entièrement le cycle en cours.`, en: `This pact is already active. Confirming will fully reset the current cycle.` })
                  : tr({ fr: `Le cycle en cours sera entièrement réinitialisé (ressources, bâtiments, jauges).`, en: `The current cycle will be fully reset (resources, buildings, gauges).` })}
              </p>

              <menu className="choice-menu" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button className="myth-confirm-btn" onClick={handleConfirmPact}>
                  {tr({ fr: 'Sceller ce pacte', en: 'Seal this pact' })}
                </button>
                <button type="button" className="btn-close" onClick={() => setModalMyth(null)}>
                  {tr({ fr: 'Annuler', en: 'Cancel' })}
                </button>
              </menu>
            </dialog>
          </div>
        </div>
      )}
    </Place>
  );
}
