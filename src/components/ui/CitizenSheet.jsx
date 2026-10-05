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
} from '../../game/map/citizenFocus.js';
import { tr } from '../../game/core/i18n.js';
import '../../styles/citizen-sheet.css';

// FICHE D'HABITANT — le passant (ou le véhicule) qu'on a cliqué sur la carte :
// son portrait (son propre sprite, qui marche quand il marche), qui il est, ce
// qu'il fait. La caméra le suit (citizenFocus.js) ; un drag la reprend,
// « Suivre » la rend.
// ⛔ Pas de phrase d'explication (règle de DA) : des libellés, des valeurs, deux
// boutons.

// Portrait au pixel près : la boîte d'encre de sa frame, agrandie d'un facteur
// ENTIER en pixels device. Une personne : le facteur se règle sur le CADRE (un
// adulte y tient ~88 % de la hauteur, PORTRAIT_H px CSS visés), pas sur l'encre
// — un enfant reste plus petit qu'un adulte. Un véhicule remplit la niche.
const PORTRAIT_H = 84, PORTRAIT_W = 120;
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

export default function CitizenSheet() {
  const [open, setOpen] = useState(() => !!CM.focus);
  const [sheet, setSheet] = useState(() => citizenSheet());
  const portraitRef = useRef(null);

  // Désignation, changement d'habitant, suivi lâché ou repris : relevé immédiat,
  // sans attendre la boucle (pas une frame avec la fiche du précédent).
  useEffect(() => onCitizenFocus((p) => {
    setOpen(!!p);
    setSheet(p ? citizenSheet() : null);
  }), []);

  // Relevé ~10 fois par seconde : l'activité change en marchant, le portrait
  // joue sa frame. React ne re-rend que si le relevé a changé.
  useEffect(() => {
    if (!open) return undefined;
    let raf = 0, last = 0, lastKey = '';
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 90) return;
      last = now;
      const s = citizenSheet();
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
    [tr({ fr: 'Activité', en: 'Doing' }), tr(sheet.activity)],
    sheet.home && [tr({ fr: 'Logis', en: 'Home' }), tr(sheet.home)],
    sheet.work && [tr({ fr: 'Travail', en: 'Work' }), tr(sheet.work)],
    sheet.companion && [tr({ fr: 'Avec', en: 'With' }), sheet.companion],
    [tr({ fr: 'Humeur', en: 'Mood' }), tr(sheet.mood)],
    [tr({ fr: 'Caractère', en: 'Nature' }), sheet.traits.map((t) => tr(t)).join(' · ')],
  ];
  const name = tr(sheet.name);

  return (
    <aside className={`citizen-sheet${sheet.lost ? ' is-lost' : ''}${vehicle ? ' is-vehicle' : ''}`} aria-label={name}>
      <div className="cs-head">
        <div className="cs-portrait">
          <canvas ref={portraitRef} aria-hidden="true"></canvas>
        </div>
        <div className="cs-id">
          <strong className="cs-name">{name}</strong>
          {vehicle ? (
            sheet.person && <span className="cs-sub">{tr(sheet.label)}</span>
          ) : (
            <span className="cs-sub">
              {tr(KIND[sheet.kind])} · <span className="cs-num">{sheet.age}</span> {tr({ fr: 'ans', en: 'y.o.' })}
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
      <dl className="cs-rows">
        {rows.filter(Boolean).map(([k, v]) => (
          <div className="cs-row" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
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
    </aside>
  );
}
