import { useEffect, useRef, useState } from 'react';
import { CM } from '../../game/map/layout.js';
import {
  onCitizenFocus,
  citizenSheet,
  clearCitizenFocus,
  resumeFocusCamera,
  releaseFocusCamera,
  focusPortrait,
  portraitImgReady,
  focusNextCitizen,
  focusRelative,
} from '../../game/map/citizenFocus.js';
import { startListening, stopListening, listenView, listenOptions } from '../../game/map/paroles/listen.js';
import { signsOffered, giveSign, reactionLabel } from '../../game/map/paroles/signs.js';
import { talkOffered, startTalk, talkChoose, talkView, stopTalk } from '../../game/map/paroles/talk.js';
import { tr } from '../../game/core/i18n.js';
import '../../styles/citizen-sheet.css';

// FICHE D'HABITANT — le passant (ou le véhicule) qu'on a cliqué sur la carte :
// son portrait (son propre sprite, qui marche quand il marche), qui il est, ce
// qu'il fait. La caméra le suit (citizenFocus.js) ; un drag la reprend,
// « Suivre » la rend.
// ⛔ Pas de phrase d'explication (règle de DA) : des libellés, des valeurs, des
// boutons. (Les lignes de la famille, de l'humeur et de ce qu'il fait sont des
// valeurs : « Mariée à Khael · 1 enfant », « Soucieuse · la disette ».)

// Portrait au pixel près : la boîte d'encre de sa frame, agrandie d'un facteur
// ENTIER en pixels device, pas réglé sur l'encre — un enfant reste plus petit
// qu'un adulte. Un véhicule remplit la niche.
// Un passant : le facteur suit l'ÉCHELLE DE CARTE de son dessin (`fr.scale`,
// agents.js), comme la carte — toutes les toiles ne sont pas remplies pareil (56 px
// à moitié, 32 px aux neuf dixièmes), et régler le facteur sur le CADRE donnait
// 56 px de haut au villageois et 87 à sa femme boulangère (2026-10-07). Sans
// échelle connue (personnage de scène), le cadre : un adulte y tient ~88 % de la
// hauteur, PORTRAIT_H px CSS visés.
// PORTRAIT_UNIT = px CSS par unité d'échelle : un adulte de 0,70 sur 32 px en ×3.
const PORTRAIT_H = 84, PORTRAIT_W = 120, PORTRAIT_UNIT = 134;
function drawPortrait(cv, now) {
  if (!cv) return;
  const fr = focusPortrait(now);
  if (!fr || !portraitImgReady(fr.img)) return;   // une image décodée, ou la coque cuite du bac (canvas)
  const { img, sx, fh, ink } = fr;
  const cx0 = Math.floor(ink.l * fh), cx1 = Math.ceil(ink.r * fh);
  const cy0 = Math.floor(ink.t * fh), cy1 = Math.ceil(ink.b * fh);
  const cw = Math.max(1, cx1 - cx0), ch = Math.max(1, cy1 - cy0);
  const dpr = window.devicePixelRatio || 1;
  const k = fr.fit === 'ink'
    ? Math.max(1, Math.floor(Math.min((PORTRAIT_H * dpr) / ch, (PORTRAIT_W * dpr) / cw)))
    : fr.scale
      ? Math.max(1, Math.round((PORTRAIT_UNIT * dpr * fr.scale) / fh))
      : Math.max(1, Math.round((PORTRAIT_H * dpr) / (fh * 0.88)));
  if (cv.width !== cw * k || cv.height !== ch * k) {
    cv.width = cw * k;
    cv.height = ch * k;
    cv.style.width = `${(cw * k) / dpr}px`;
    cv.style.height = `${(ch * k) / dpr}px`;
  }
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(img, sx + cx0, cy0, cw, ch, 0, 0, cw * k, ch * k);
}

const KIND = {
  man: { fr: 'Homme', en: 'Man' },
  woman: { fr: 'Femme', en: 'Woman' },
  child: { fr: 'Enfant', en: 'Child' },
};

// « de Garin », « d'Oda » : l'élision du nom qui suit.
const deFr = (given) => (/^[aeiouyàâäéèêëîïôöùûüh]/i.test(given) ? "d'" : 'de ');
const kidsWord = (n) => tr(n > 1 ? { fr: `${n} enfants`, en: `${n} children` } : { fr: '1 enfant', en: '1 child' });

// Un proche nommé par la fiche : un lien quand il passe dans la rue en ce moment.
function Kin({ fam, who }) {
  if (!who) return null;
  if (!who.here) return <span>{who.given}</span>;
  return (
    <button type="button" className="cs-kin" onClick={() => focusRelative(fam.hh, who.slot)}>
      {who.given}
    </button>
  );
}
// LA FAMILLE (idée 7) : sa place au foyer, en quelques mots. Les prénoms sont ceux
// des proches ; ceux qui passent dans la rue se désignent d'un clic. Chaque
// morceau de phrase est une unité { fr, en } : « Fille d'Oda et de Garin » /
// « Daughter of Oda and Garin ».
function familyValue(fam, fem) {
  if (!fam) return null;
  const kids = fam.kids ? <> · {kidsWord(fam.kids)}</> : null;
  const kin = (who) => <Kin fam={fam} who={who} />;
  switch (fam.kind) {
    case 'married':
      if (!fam.other) return null;
      return <>{tr(fem ? { fr: 'Mariée à ', en: 'Married to ' } : { fr: 'Marié à ', en: 'Married to ' })}{kin(fam.other)}{kids}</>;
    case 'single':
      if (!fam.kids) return tr({ fr: 'Célibataire', en: 'Single' });
      return <>{tr(fem ? { fr: 'Mère seule', en: 'Single mother' } : { fr: 'Père seul', en: 'Single father' })}{kids}</>;
    case 'child': {
      const [a, b] = fam.parents;
      if (!a) return null;
      return (
        <>
          {tr(fem ? { fr: `Fille ${deFr(a.given)}`, en: 'Daughter of ' } : { fr: `Fils ${deFr(a.given)}`, en: 'Son of ' })}
          {kin(a)}
          {b && <>{tr({ fr: ` et ${deFr(b.given)}`, en: ' and ' })}{kin(b)}</>}
        </>
      );
    }
    case 'elder':
      if (!fam.of) return null;
      return <>{tr(fem ? { fr: `Mère ${deFr(fam.of.given)}`, en: 'Mother of ' } : { fr: `Père ${deFr(fam.of.given)}`, en: 'Father of ' })}{kin(fam.of)}</>;
    case 'lodger':
      if (!fam.host) return null;
      return <>{tr(fem ? { fr: 'Hébergée chez ', en: 'Lodging with ' } : { fr: 'Hébergé chez ', en: 'Lodging with ' })}{kin(fam.host)}</>;
    case 'nephew':
      if (!fam.host) return null;
      return <>{tr(fem ? { fr: `Nièce ${deFr(fam.host.given)}`, en: 'Niece of ' } : { fr: `Neveu ${deFr(fam.host.given)}`, en: 'Nephew of ' })}{kin(fam.host)}</>;
    default:
      return null;
  }
}

// L'HUMEUR (idée 6) : cinq crans, le mot, et ce qui la tire vers le bas.
function moodValue(sheet) {
  const lvl = sheet.moodLevel ?? 2;
  return (
    <span className="cs-mood">
      <span className="cs-pips" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className={i <= lvl ? 'is-on' : ''} />)}
      </span>
      <span className={lvl === 0 ? 'cs-mood-word is-bad' : 'cs-mood-word'}>{tr(sheet.mood)}</span>
      {sheet.moodCause && <span className="cs-mood-cause"> · {tr(sheet.moodCause)}</span>}
    </span>
  );
}

// Le relevé complet : la fiche, plus l'écoute (docs/PLAN-ECOUTER-PARLER.md) — ce
// qu'on entend en ce moment, et ce qu'on peut écouter — et les signes qu'on peut lui
// faire (lot 4), avec ce qu'il fait quand il y réagit (« À genoux », « S’enfuit ») ; et
// dès la période 3, ce qu'on lui dit (lot 6).
function readSheet() {
  const s = citizenSheet();
  return s && {
    ...s, listen: listenView(), ears: listenOptions(), signs: signsOffered(), react: reactionLabel(CM.focus && CM.focus.p),
    talk: talkView(), speak: talkOffered(),
  };
}

// LES SIGNES (lot 4) : le vent, la lumière, le feu (s'il y en a un près de lui), la
// bête (s'il y en a une). Après la troisième fois, il ne s'y prête plus : la rangée
// disparaît.
const SIGN_BUTTONS = [
  { kind: 'wind', label: { fr: 'Vent', en: 'Wind' } },
  { kind: 'light', label: { fr: 'Lumière', en: 'Light' } },
  { kind: 'fire', label: { fr: 'Feu', en: 'Fire' } },
  { kind: 'beast', label: { fr: 'Bête', en: 'Animal' } },
];

export default function CitizenSheet() {
  const [open, setOpen] = useState(() => !!CM.focus);
  const [sheet, setSheet] = useState(() => readSheet());
  const portraitRef = useRef(null);

  // Désignation, changement d'habitant, suivi lâché ou repris : relevé immédiat,
  // sans attendre la boucle (pas une frame avec la fiche du précédent).
  useEffect(() => onCitizenFocus((p) => {
    setOpen(!!p);
    setSheet(p ? readSheet() : null);
  }), []);

  // Relevé ~10 fois par seconde : l'activité change en marchant, le portrait
  // joue sa frame, les répliques de l'écoute arrivent une à une. React ne re-rend
  // que si le relevé a changé.
  useEffect(() => {
    if (!open) return undefined;
    let raf = 0, last = 0, lastKey = '';
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 90) return;
      last = now;
      const s = readSheet();
      if (!s) { setOpen(false); return; }   // désignation effacée hors des voies prévues
      const key = JSON.stringify(s);
      if (key !== lastKey) { lastKey = key; setSheet(s); }
      drawPortrait(portraitRef.current, now);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Échap ferme la fiche AVANT d'ouvrir les Options (App.jsx écoute aussi
  // Échap) : écouteur en CAPTURE sur window, donc servi le premier. Pas en
  // contemplation — la fiche y est masquée, Échap y sert à en sortir.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return;
      if (document.querySelector('.app[data-contemplation="on"]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearCitizenFocus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open || !sheet) return null;
  const vehicle = sheet.kind === 'vehicle';
  const rows = vehicle ? [
    sheet.driver && [tr(sheet.driverLabel || { fr: 'Conduite', en: 'Driver' }), sheet.driver],
    [tr({ fr: 'Activité', en: 'Doing' }), tr(sheet.activity)],
    sheet.cargo && [tr(sheet.person ? { fr: 'Panier', en: 'Basket' } : { fr: 'Chargement', en: 'Load' }), tr(sheet.cargo)],
    sheet.riders != null && [tr({ fr: 'Voyageurs', en: 'Passengers' }), <span className="cs-num" key="n">{sheet.riders}</span>],
    sheet.crossings != null && [tr({ fr: 'Traversées', en: 'Crossings' }), <span className="cs-num" key="c">{sheet.crossings}</span>],
  ] : [
    [tr({ fr: 'Activité', en: 'Doing' }), tr(sheet.react || sheet.activity)],
    sheet.home && [tr({ fr: 'Logis', en: 'Home' }), tr(sheet.home)],
    // L'enfant va à l'école (citizenIdentity.SCHOOLS) : sa ligne dit « École ».
    sheet.work && [tr(sheet.kind === 'child' ? { fr: 'École', en: 'School' } : { fr: 'Travail', en: 'Work' }), tr(sheet.work)],
    sheet.family && [tr({ fr: 'Famille', en: 'Family' }), familyValue(sheet.family, sheet.fem)],
    sheet.companion && [tr({ fr: 'Avec', en: 'With' }), sheet.companion],
    [tr({ fr: 'Humeur', en: 'Mood' }), moodValue(sheet)],
    [tr({ fr: 'Caractère', en: 'Nature' }), sheet.traits.map((t) => tr(t)).join(' · ')],
  ];
  const name = tr(sheet.name);
  // Le sous-titre : son MÉTIER (idée 4), le dessin et l'atelier le disent ; à défaut
  // ce qu'il est (homme, femme, enfant).
  const sub = sheet.job ? tr(sheet.job) : tr(KIND[sheet.kind]);
  // L'écoute (personnes seulement) : ce qu'on entend, et ce qu'on peut écouter.
  const talk = vehicle ? null : sheet.talk;
  const listen = vehicle || talk ? null : sheet.listen;
  const ears = vehicle ? null : sheet.ears;
  const signs = vehicle || sheet.lost || talk ? null : sheet.signs;

  return (
    <aside className={`citizen-sheet${sheet.lost ? ' is-lost' : ''}${vehicle ? ' is-vehicle' : ''}`} aria-label={name}>
      <div className="cs-head">
        {/* Le ciel derrière lui (idée 2) : l'heure, la pluie ou la neige, et une teinte
            qui se refroidit quand l'humeur baisse (citizen-sheet.css). */}
        <div
          className="cs-portrait"
          data-sky={sheet.sky || 'day'}
          data-precip={sheet.precip || undefined}
          data-mood={sheet.moodLevel ?? undefined}
        >
          <canvas ref={portraitRef} aria-hidden="true"></canvas>
        </div>
        <div className="cs-id">
          <strong className="cs-name">{name}</strong>
          {vehicle ? (
            sheet.person && <span className="cs-sub">{tr(sheet.label)}</span>
          ) : (
            <span className="cs-sub">
              {sub} · <span className="cs-num">{sheet.age}</span> {tr({ fr: 'ans', en: 'y.o.' })}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn-close cs-close"
          onClick={clearCitizenFocus}
          aria-label={tr({ fr: 'Fermer (Échap)', en: 'Close (Esc)' })}
        >
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      {talk ? (
        // PARLER (lot 6) : ce qu'il dit en entendant la voix, puis ta réponse (« Toi »), ou
        // ton silence, puis la sienne ; quand c'est à toi, tes réponses possibles.
        <div className="cs-listen is-talk" aria-live="polite">
          {talk.lines.map((l, i) => (
            <p className={`cs-line is-${l.who}`} key={i}>
              <span className="cs-line-who">{l.who === 'you' ? tr({ fr: 'Toi', en: 'You' }) : l.name}</span>
              {l.silent
                ? <span className="cs-line-text is-silent">{tr({ fr: 'Tu te tais.', en: 'You say nothing.' })}</span>
                : <span className="cs-line-text">{tr({ fr: `« ${l.fr} »`, en: `“${l.en}”` })}</span>}
            </p>
          ))}
          {talk.choices && (
            <div className="cs-talk-choices" role="group" aria-label={tr({ fr: 'Ta réponse', en: 'Your answer' })}>
              {talk.choices.map((c) => (
                <button type="button" className="cs-talk-choice" key={c.key} onClick={() => { talkChoose(c.key); setSheet(readSheet()); }}>
                  {tr({ fr: `« ${c.fr} »`, en: `“${c.en}”` })}
                </button>
              ))}
              <button type="button" className="cs-talk-choice is-silent" onClick={() => { talkChoose(null); setSheet(readSheet()); }}>
                {tr({ fr: 'Se taire', en: 'Say nothing' })}
              </button>
            </div>
          )}
        </div>
      ) : listen ? (
        // L'ÉCOUTE : les répliques arrivent une à une à la place des lignes de la
        // fiche ; dans une causette, le prénom de qui parle, dans une pensée, rien.
        <div className={`cs-listen is-${listen.kind}`} aria-live="polite">
          {listen.lines.map((l, i) => (
            <p className={`cs-line is-${l.who}`} key={i}>
              {listen.kind === 'chat' && <span className="cs-line-who">{l.name}</span>}
              <span className="cs-line-text">{tr({ fr: `« ${l.fr} »`, en: `“${l.en}”` })}</span>
            </p>
          ))}
        </div>
      ) : (
        <dl className="cs-rows">
          {rows.filter(Boolean).map(([k, v]) => (
            <div className="cs-row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {ears && !sheet.lost && (talk ? (
        <div className="cs-ears">
          <button type="button" className="cs-ear" onClick={() => { stopTalk(); setSheet(readSheet()); }}>
            {tr({ fr: 'Retour', en: 'Back' })}
          </button>
        </div>
      ) : (
        <div className="cs-ears">
          {listen ? (
            <button type="button" className="cs-ear" onClick={() => { stopListening(); setSheet(readSheet()); }}>
              {tr({ fr: 'Retour', en: 'Back' })}
            </button>
          ) : ears.chat && (
            <button type="button" className="cs-ear" onClick={() => { startListening('chat'); setSheet(readSheet()); }}>
              {tr({ fr: 'Écouter', en: 'Listen' })}
            </button>
          )}
          {(!listen || listen.done) && (
            <button type="button" className="cs-ear" onClick={() => { startListening('thought'); setSheet(readSheet()); }}>
              {tr({ fr: 'Ses pensées', en: 'Thoughts' })}
            </button>
          )}
          {/* PARLER (lot 6) : dès la période 3, une fois par passant. */}
          {sheet.speak && (!listen || listen.done) && (
            <button type="button" className="cs-ear" onClick={() => { startTalk(); setSheet(readSheet()); }}>
              {tr({ fr: 'Parler', en: 'Speak' })}
            </button>
          )}
        </div>
      ))}
      {signs && (
        <div className="cs-signs" role="group" aria-label={tr({ fr: 'Signe', en: 'Sign' })}>
          <span className="cs-signs-label" aria-hidden="true">{tr({ fr: 'Signe', en: 'Sign' })}</span>
          {SIGN_BUTTONS.filter((b) => signs[b.kind]).map((b) => (
            <button
              type="button"
              className="cs-sign"
              key={b.kind}
              disabled={signs.busy}
              onClick={() => { giveSign(b.kind); setSheet(readSheet()); }}
            >
              {tr(b.label)}
            </button>
          ))}
        </div>
      )}
      <div className="cs-actions">
        {!sheet.lost && (
          <button
            type="button"
            className={`cs-follow${sheet.following ? ' is-on' : ' btn-primary'}`}
            aria-pressed={sheet.following}
            onClick={sheet.following ? releaseFocusCamera : resumeFocusCamera}
          >
            <i className={`fa-solid ${sheet.following ? 'fa-video' : 'fa-location-crosshairs'}`} aria-hidden="true"></i>
            {sheet.following ? tr({ fr: 'Suivi', en: 'Following' }) : tr({ fr: 'Suivre', en: 'Follow' })}
          </button>
        )}
        {/* « Suivant » (idée 11) : le passant le plus proche, pour flâner de l'un à l'autre. */}
        <button type="button" className="cs-next" onClick={focusNextCitizen}>
          {tr({ fr: 'Suivant', en: 'Next' })}
        </button>
      </div>
    </aside>
  );
}
