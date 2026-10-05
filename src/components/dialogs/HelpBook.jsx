import { useEffect, useRef, useState } from 'react';
import { useGameState } from '../../hooks/useGameState.js';
import { getLang, tr } from '../../game/core/i18n.js';
import { HELP_CHAPTERS } from '../../game/data/helpChapters.js';
import { placeUnlocked } from '../../game/core/places.js';
import { SHORTCUT_DEFS, shortcutKey, shortcutLabel } from '../../game/core/shortcuts.js';
import PixelIcon from '../ui/PixelIcon.jsx';
// Version du jeu (package.json, seul le champ `version` part dans le bundle) :
// en pied de la table des chapitres, pour qu'un joueur dise quelle build il
// fait tourner quand il signale un bug (audit 2026-10-05, STEAM-8).
import { version as APP_VERSION } from '../../../package.json';

/**
 * L'AIDE — onglet des Options, et SEUL accès (arbitrage Raph 2026-10-03 : pas de
 * bouton d'aide ailleurs). Une table des chapitres, une page de lecture.
 * Le contenu vit dans helpChapters.js ; ce composant ne fait que le mettre en page.
 *
 * Un chapitre dont le lieu n'est pas encore découvert reste fermé, sans titre
 * (« Chapitre à découvrir ») : l'Aide ne dévoile pas plus que le rail.
 */

// Typographie française : espaces insécables devant ; ! ? % (fine) et : » (mot),
// derrière «, et entre un nombre et ×. Sans elles, « 25 % » se coupe en fin de ligne.
function typo(text) {
  if (getLang() !== 'fr') return text;
  return text
    .replace(/ ([;!?%])/g, ' $1')
    .replace(/ ([:»])/g, ' $1')
    .replace(/« /g, '« ')
    .replace(/(\d) ×/g, '$1 ×');
}

// Touche d'un raccourci RÉATTRIBUABLE : celle que le joueur a choisie.
function shortcutKeyLabel(id) {
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  return def ? shortcutLabel(shortcutKey(def)) : id;
}

// Texte d'aide → nœuds : {k:Maj} et {key:id} deviennent des touches (<kbd>).
function RichText({ text }) {
  const out = [];
  const re = /\{(k|key):([^}]+)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(typo(text.slice(last, m.index)));
    out.push(<kbd key={m.index} className="help-kbd">{m[1] === 'key' ? shortcutKeyLabel(m[2]) : m[2]}</kbd>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(typo(text.slice(last)));
  return out;
}

export default function HelpBook() {
  // Un caractère par chapitre (1 = ouvert) : la signature ne change qu'au
  // déblocage d'un lieu, l'Aide ne se re-rend pas à chaque tick.
  const openSig = useGameState((s) => HELP_CHAPTERS.map((c) => (c.place && !placeUnlocked(s, c.place) ? '0' : '1')).join(''));
  const [currentId, setCurrentId] = useState(HELP_CHAPTERS[0].id);
  const pageRef = useRef(null);

  const open = HELP_CHAPTERS.filter((_, i) => openSig[i] === '1');
  const current = open.find((c) => c.id === currentId) || open[0];
  const number = HELP_CHAPTERS.indexOf(current) + 1;
  const k = open.indexOf(current);
  const prev = open[k - 1];
  const next = open[k + 1];

  // Un nouveau chapitre se lit depuis son début.
  useEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [current.id]);

  return (
    <div className="help-book">
      <nav className="help-toc" aria-label={tr({ fr: "Chapitres de l'aide", en: 'Help chapters' })}>
        {HELP_CHAPTERS.map((c, i) => (openSig[i] === '1' ? (
          <button
            key={c.id}
            type="button"
            className={`help-ch${c.id === current.id ? ' active' : ''}`}
            aria-current={c.id === current.id ? 'true' : undefined}
            onClick={() => setCurrentId(c.id)}
          >
            <span className="help-ch-n">{i + 1}</span>
            <PixelIcon name={c.icon} size={24} />
            <span className="help-ch-t">{tr(c.title)}</span>
          </button>
        ) : (
          <button key={c.id} type="button" className="help-ch is-locked" disabled>
            <span className="help-ch-n">{i + 1}</span>
            <PixelIcon name="glyphs/verrou" size={24} />
            <span className="help-ch-t">{tr({ fr: 'Chapitre à découvrir', en: 'Chapter to discover' })}</span>
          </button>
        )))}
        <span className="help-version">v{APP_VERSION}</span>
      </nav>

      <article className="help-page" ref={pageRef} tabIndex={0} aria-labelledby="help-title">
        <span className="help-eyebrow">{tr({ fr: `Chapitre ${number}`, en: `Chapter ${number}` })}</span>
        <h3 className="help-title" id="help-title">
          <PixelIcon name={current.icon} size={48} />
          {tr(current.title)}
        </h3>
        <p className="help-lede"><RichText text={tr(current.lede)} /></p>

        {current.secs.map((sec) => (
          <section key={sec.h.fr} className="help-sec">
            <h4>{tr(sec.h)}</h4>
            <dl className="help-dl">
              {sec.items.map((it) => (
                <div key={it.t.fr}>
                  <dt>
                    {it.dot && <i className="help-dot" style={{ '--c': it.dot }} aria-hidden="true" />}
                    <span>{tr(it.t)}</span>
                    {it.tag && <span className="help-tag">{tr(it.tag)}</span>}
                  </dt>
                  <dd><RichText text={tr(it.d)} /></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <nav className="help-nav" aria-label={tr({ fr: 'Chapitre précédent ou suivant', en: 'Previous or next chapter' })}>
          {prev
            ? <button type="button" className="help-nav-btn" onClick={() => setCurrentId(prev.id)}>← {tr(prev.title)}</button>
            : <span />}
          {next
            ? <button type="button" className="help-nav-btn" onClick={() => setCurrentId(next.id)}>{tr(next.title)} →</button>
            : <span />}
        </nav>
      </article>
    </div>
  );
}
