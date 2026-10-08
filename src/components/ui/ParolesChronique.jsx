import { useEffect, useState } from 'react';
import { onParoles, parolesToi, parolesNameNow } from '../../game/core/paroles.js';
import { PAROLES } from '../../game/data/paroles.js';
import { PAROLES_SIGNES, PAROLES_REPONSES } from '../../game/data/parolesSignes.js';
import { PAROLES_MOTS } from '../../game/data/parolesMots.js';
import { NOMS_DU_JOUEUR } from '../../game/data/parolesToi.js';
import { resolveLines, talkTranscript } from '../../game/map/paroles/pick.js';
import { EPOCHS } from '../../game/data/eraThemes.js';
import { tr } from '../../game/core/i18n.js';
import { fmtClock } from '../../game/core/utils.js';
import { tipProps } from './HelpBubble.jsx';
import '../../styles/paroles-chronique.css';

// CE QU'ON DIT DE TOI (docs/PLAN-ECOUTER-PARLER.md, lot 2, § 4.4).
//
// Ce que le joueur a entendu sur lui en écoutant les habitants, daté (l'âge, le temps
// de jeu), le plus récent en haut. Comme les faits divers : le panneau n'existe pas
// tant qu'il n'a rien entendu, et il ne dit jamais ce qui reste à entendre (ni compte,
// ni « ??? »). En tête, le nom qu'ils te donnent : celui que la gazette de la cité a
// publié en dernier ; avant le premier, ils ne t'appellent pas.

// Ce qu'on a entendu, ce qu'un signe leur a fait penser de toi (lot 4), et ce qu'on s'est
// dit (lot 6).
const BY_ID = new Map([...PAROLES, ...PAROLES_SIGNES, ...PAROLES_REPONSES, ...PAROLES_MOTS].map((e) => [e.id, e]));
const ageOf = (band) => tr((EPOCHS[Math.max(0, Math.min(EPOCHS.length - 1, band | 0))] || EPOCHS[0]).label);
const fmtAt = (sec) => fmtClock(sec, { seconds: 'never' });
const quote = (l) => tr({ fr: `« ${l.fr} »`, en: `“${l.en}”` });
// Une réplique, ou ton silence (lot 6).
const say = (l) => (l.silent ? tr({ fr: 'Tu te tais.', en: 'You say nothing.' }) : quote(l));
const YOU = { fr: 'Toi', en: 'You' };

// Les répliques d'un souvenir, relues dans le catalogue avec les prénoms et le nom de
// l'époque où il a été entendu. null si l'échange a quitté le catalogue.
function relire(rec) {
  const e = BY_ID.get(rec.id);
  if (!e) return null;
  const nom = rec.nom && NOMS_DU_JOUEUR[rec.nom];
  const names = { a: rec.a, b: rec.b, ...rec.n };
  if (nom) { names.nom = { fr: nom.fr, en: nom.en }; names.Nom = { fr: nom.Fr, en: nom.En }; }
  const ctx = {
    kind: e.kind, kidIs: rec.kid, names,
    a: { fem: rec.fa }, b: { fem: rec.fb },
  };
  if (e.kind === 'talk') return relireTalk(e, rec, ctx);
  const lines = resolveLines(e, ctx);
  const who = (l) => (l.who === 'b' ? rec.b : rec.a) || '';
  return { kind: e.kind, lines, who };
}
// Un échange avec toi (lot 6) : sa première réplique, ta réponse (ou ton silence), la
// sienne.
function relireTalk(e, rec, ctx) {
  const lines = talkTranscript(e, rec.talk, ctx);
  if (!lines) return null;
  const who = (l) => (l.who === 'you' ? tr(YOU) : rec.a || '');
  return { kind: 'talk', lines, who };
}

export default function ParolesChronique() {
  // Le registre change par mutation en place : le re-rendu suit son abonnement.
  const [, setRev] = useState(0);
  useEffect(() => onParoles(() => setRev((r) => r + 1)), []);
  const heard = parolesToi();
  if (!heard.length) return null;
  const name = parolesNameNow();
  const rows = [];
  for (let i = heard.length - 1; i >= 0; i -= 1) {
    const rec = heard[i];
    const r = relire(rec);
    if (r) rows.push({ rec, r, key: `${rec.id}:${i}` });
  }
  if (!rows.length) return null;

  return (
    <div className="panel chronique-paroles">
      <div className="panel-heading">
        <div>
          <h2>{tr({ fr: 'Ce qu’on dit de toi', en: 'What they say about you' })}</h2>
        </div>
      </div>
      {name && (
        <p className="chronique-paroles-nom">
          {tr({ fr: 'On t’appelle ', en: 'They call you ' })}
          <strong>{tr({ fr: name.fr, en: name.en })}</strong>
        </p>
      )}
      <ul className="chronicle-reg-list">
        {rows.map(({ rec, r, key }) => {
          const first = r.lines[0];
          const two = r.kind === 'chat' || r.kind === 'talk';
          const full = r.lines.map((l) => (two ? `${r.who(l)} : ${say(l)}` : quote(l))).join('\n');
          const head = r.kind === 'chat'
            ? tr({ fr: `${rec.a} et ${rec.b}`, en: `${rec.a} and ${rec.b}` })
            : r.kind === 'talk' ? tr({ fr: `${rec.a} et toi`, en: `${rec.a} and you` }) : (rec.a || '');
          return (
            <li key={key} className="chronicle-reg-row chronique-paroles-row" tabIndex={0} {...tipProps(head, full)}>
              <span className="chronicle-reg-badge">{two ? '··' : '·'}</span>
              <span className="chronicle-reg-name chronique-paroles-line">
                {quote(first)}
                <em>{rec.a}{r.kind === 'chat' && rec.b ? ` · ${rec.b}` : ''}{r.kind === 'talk' ? ` · ${tr(YOU)}` : ''} · {ageOf(rec.band)}</em>
              </span>
              <span className="chronicle-reg-meta">{fmtAt(rec.at)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
