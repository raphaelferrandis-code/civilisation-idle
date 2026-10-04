// LA FAMINE SUR LA CARTE — les étals de nourriture se vident.
//
// Analyse du visuel de crise (2026-10-04, lot B, Raph : oui) : aucune des crises
// de mi-parcours n'avait de rendu sur la carte — une famine ne se voyait pas. Ici,
// quand le foyer SUBSISTANCE monte, des étals de nourriture des places de marché
// passent à leur version VIDE (comptoir nu, même étal, même place) : pain et
// fromages, légumes. Les étals de draps ne changent pas (rien à manger dessus).
//
// · Le signal est la Subsistance de pressureBreakdown() — la valeur du dossier
//   « Subsistance » du Conseil, celle que les crises de famine (grain_panic,
//   low_district_famine…) font monter. 0 étal vide sous 20 %, tous vides à 45 %.
// · Le tirage par étal est FIXE (hash de sa position) donc monotone : un étal vide
//   à 30 % le reste à 40 % — la place ne clignote pas, elle se vide.
// · L'étal reste EN PLACE : seul son art change (les flâneurs de plazaFolk.js s'en
//   servent comme obstacles et comme postes — un étal retiré ferait sauter la
//   composition de la place).
// · Pas d'art vide pour cette ère ou cette couleur → l'étal plein reste (repli de
//   propImage) : rien ne disparaît jamais.
// Molette : __famine({ on, from, full, force }) — `force` (0-1) pose la famine à la
// main pour juger le rendu sans toucher à la partie.
import { pressureBreakdown } from '../../core/mechanics.js';
import { cmHash } from '../layout.js';

export const FAMINE_TUNE = { on: true, from: 0.2, full: 0.45, force: null };
if (typeof window !== 'undefined') {
  window.__famine = (o) => { if (o) Object.assign(FAMINE_TUNE, o); return { ...FAMINE_TUNE }; };
}

// Part des étals de nourriture vidés (0 → 1), calculée une fois par frame (`now`).
let _at = -1, _k = 0;
export function famineK(now) {
  if (now === _at) return _k;
  _at = now;
  const F = FAMINE_TUNE;
  if (!F.on) return (_k = 0);
  if (F.force != null) return (_k = Math.max(0, Math.min(1, F.force)));
  const s = pressureBreakdown().scarcity || 0;
  _k = Math.max(0, Math.min(1, (s - F.from) / (F.full - F.from)));
  return _k;
}

// Les étals qui ONT un art vide (`<prop>-vide-<face>-<ère>.png`, PixelLab inpaint
// du comptoir). Liste fermée : demander un art absent coûterait un 404 par étal.
// Pilote 2026-10-04 : marché médiéval, pain/fromages (rouge) et légumes (vert).
export const STALLS_VIDES = new Set(['stall-red-medieval', 'stall-green-medieval']);

// Le nom de prop VIDE de cet étal pour cette ère, ou null (pas vide / pas d'art).
export function stallVideProp(rec, era, now) {
  if (!STALLS_VIDES.has(rec.prop + '-' + era) || !stallEmpty(rec, now)) return null;
  return rec.prop + '-vide';
}

// Cet étal est-il vide ? `rec` = l'enregistrement du prop de place (wx, wy stables).
export function stallEmpty(rec, now) {
  const k = famineK(now);
  if (k <= 0) return false;
  if (rec._famS === undefined) rec._famS = (cmHash('fam:' + Math.round(rec.wx) + ':' + Math.round(rec.wy)) >>> 0) % 1000;
  return rec._famS < k * 1000;
}
