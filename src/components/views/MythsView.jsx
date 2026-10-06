import { useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { useDialogModal } from '../../hooks/useDialogModal.js';
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
import { state, gamePaused, collapseInProgress } from '../../game/core/state.js';
import { pushOutcomeFloat } from '../../game/core/outcomeFloat.js';
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

// Signature de ce que le panneau de l'Olympe AFFICHE. tickOlympus modifie
// state.olympus EN PLACE à chaque tick : un abonnement à l'objet (même référence)
// ne voyait rien passer, et scores, consécration et « Ce que la cité a vu »
// restaient aux valeurs du montage (audit 2026-10-05, BUG-109). La chaîne ne
// change que quand une valeur affichée change.
function olympusSignature(o) {
  if (!o) return '';
  const dominant = dominantOlympusProfile(o);
  const m = olympusMetrics(o);
  const progress = o.profileProgress || {};
  return [
    o.unlockedProfile, dominant.profile.id,
    ...Object.keys(OLYMPUS_PROFILES).map((id) => `${dominant.scores[id] || 0}:${consecration(progress[id])}`),
    m.collapseFrequency.toFixed(2),
    Math.round(m.crisisResolutionRatio * 100),
    Math.round(m.idleRatio * 100),
    Math.round(m.averageCollapseRupture * 100)
  ].join('|');
}

const pactRefused = () => pushOutcomeFloat({
  label: tr({ fr: "Pacte impossible pour l'instant", en: 'The pact cannot be sealed right now' }),
  kind: 'cost'
});

export default function MythsView() {
  const activeMythId = useGameState(s => s.activeMythId);
  // gamePaused et collapseInProgress sont des variables du module state.js, pas
  // des champs de state : `s.gamePaused` valait toujours undefined et la garde
  // ne servait jamais (BUG-108). La liaison importée est vivante, et leurs
  // setters notifient.
  const pactBlocked = useGameState(() => gamePaused || collapseInProgress);
  useGameState(s => olympusSignature(s.olympus));

  const [modalMyth, setModalMyth] = useState(null);
  const [selectedBabelCat, setSelectedBabelCat] = useState("city");
  // Coquille commune des modales : showModal, Échap qui ferme, focus rendu au
  // bouton du Mythe à la fermeture (BUG-107).
  const closePact = () => setModalMyth(null);
  const pactDialogRef = useDialogModal(Boolean(modalMyth), closePact);
  // Un clic sur le fond (::backdrop) a pour cible la <dialog> elle-même : seules
  // les coordonnées disent s'il est tombé à côté du cadre (cf. OptionsDialog).
  const handlePactBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    const r = event.currentTarget.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closePact();
  };

  const activeMyth = activeMythId ? getMythById(activeMythId) : null;
  const ragnarokCompleted = isMythCompleted(RAGNAROK_ID);
  const olympus = state.olympus || FALLBACK_OLYMPUS;
  const olympusDominant = dominantOlympusProfile(olympus);
  const olympusUnlocked = unlockedOlympusProfile(olympus);
  const olympusMetricValues = olympusMetrics(olympus);
  const olympusProgress = olympus.profileProgress || FALLBACK_OLYMPUS.profileProgress;

  const handleOpenModal = (myth) => {
    if (!isMythUnlocked(myth) || isMythCompleted(myth.id)) return;
    if (pactBlocked) { pactRefused(); return; }
    setModalMyth(myth);
    setSelectedBabelCat("city");
  };

  // La catégorie de Babel passe en paramètre : activateMyth ne l'applique qu'une
  // fois ses gardes passées (pause, deuil d'un effondrement automatique…). Un
  // refus se dit, au lieu de refermer la fenêtre sans rien faire.
  const handleConfirmPact = async () => {
    if (!modalMyth) return;
    const mythId = modalMyth.id;
    const babelCategory = mythId === "mythe_de_babel" ? selectedBabelCat : undefined;
    setModalMyth(null);
    if (!(await activateMyth(mythId, { babelCategory }))) pactRefused();
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

      {/* Confirmation du pacte : une VRAIE modale (showModal par useDialogModal),
          comme les autres fenêtres du jeu. C'était un <dialog open> statique
          dans un faux fond sans style : Échap n'y faisait rien (le gestionnaire
          d'App s'efface devant tout dialog[open]), et le focus restait dans la
          page derrière (audit 2026-10-05, BUG-107).
          ⚠ La <dialog> reste MONTÉE, seul son contenu suit modalMyth : le hook
          vit dans MythsView, qui survit à chaque fermeture. Démontée avec son
          contenu, elle aurait laissé useDialogModal attendre l'évènement « close »
          de son propre nettoyage — reçu par la fenêtre SUIVANTE, dont la
          fermeture par Échap aurait alors été ignorée (bouton mort). */}
      <dialog ref={pactDialogRef} className="event-dialog myth-modal" onClick={handlePactBackdropClick}>
        {modalMyth && (
          <>
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
                          <span className="babel-cat-desc" style={{ display: 'block', fontSize: 'var(--fs-read)', color: 'var(--text-dim)' }}>{tr(c.desc)}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="myth-modal-warning" style={{ color: 'var(--red)', marginTop: '1rem', fontSize: 'var(--fs-read)' }}>
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
              <button type="button" className="btn-close" onClick={closePact}>
                {tr({ fr: 'Annuler', en: 'Cancel' })}
              </button>
            </menu>
          </>
        )}
      </dialog>
    </Place>
  );
}
