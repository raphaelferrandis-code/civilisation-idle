// LA PETITE MÉLODIE DE LA SCÈNE : la LECTURE (demande de Raph du 2026-10-03 : « il
// faudrait ajouter une petite mélodie quand on clique sur la scène »). L'air et ses
// arrangements, âge par âge, sont dans melodieSynth.js (la synthèse, pure).
// Les fichiers déposés dans `src/assets/musiques/scene/` passent AVANT (musiques.js).
import { MELODIES_SCENE } from './musiques.js';
import { getMusicEnabled, getMusicVolume, duckMusic } from '../core/main.js';
import { audioCtx, jouerTampon, enTampon } from './synth.js';
import { renderMelodie, melodieBande, MELODIE_SR, hz } from './melodieSynth.js';
import { rendreAilleurs } from './syntheseAilleurs.js';

export { renderMelodie, MELODIE_SR, hz };

// ── La lecture (le contexte audio est celui du jeu : synth.js).
let enCours = null;
let rang = 0;
// Les mélodies rendues, en tampons PRÊTS (synth.enTampon : plus de copie à chaque
// lecture), et DEUX au plus (audit du 2026-10-05, MEM-10 : 0,7 à 0,9 Mo par âge, les
// dix gardées à vie) : celle de l'âge, et une autre — le dernier musicien des faits
// divers joue l'air du campement (fdMusicien.js). La moins récemment jouée s'oublie.
const cache = new Map();
const GARDE_MELODIES = 2;
function ranger(b, tampon) {
  cache.delete(b);
  cache.set(b, tampon);
  while (cache.size > GARDE_MELODIES) cache.delete(cache.keys().next().value);
  return tampon;
}

export function jouerMelodieScene(band) {
  if (typeof window === 'undefined') return;
  // La mélodie est de la MUSIQUE : coupée avec elle (Options › Son).
  if (!getMusicEnabled()) return;
  const vol = getMusicVolume();
  if (vol <= 0) return;
  arreter();

  // Les mélodies déposées par Raph passent avant celle du jeu, chacune à son tour.
  if (MELODIES_SCENE.length) {
    const m = MELODIES_SCENE[rang++ % MELODIES_SCENE.length];
    const a = new Audio(m.url);
    a.volume = vol;
    a.addEventListener('loadedmetadata', () => duckMusic(Math.max(0, a.duration * 1000 - 500)), { once: true });
    a.play().catch(() => {});
    enCours = { stop: () => a.pause() };
    return;
  }

  if (!audioCtx()) return;
  const b = melodieBande(band);
  // (Relue, elle redevient la plus récente.)
  const data = ranger(b, cache.has(b) ? cache.get(b) : enTampon(renderMelodie(b), MELODIE_SR));
  const p = jouerTampon(data, MELODIE_SR, vol * 0.9);
  if (!p) return;
  enCours = { stop: p.stop };
  duckMusic(Math.max(0, (data.length / MELODIE_SR) * 1000 - 900));
}

function arreter() {
  if (enCours) enCours.stop();
  enCours = null;
}

// PRÉPARE la mélodie d'un âge à l'avance, hors du fil principal (audit du 2026-10-05,
// PERF-41) : rendue au premier clic, elle coûtait 10 à 70 ms d'un bloc au moment même
// où le récit s'ouvre (la scène des Plaisirs, le musicien ou les amoureux sur la carte).
// Appelée à l'ouverture des Plaisirs et quand le musicien prend sa place. Sans Worker,
// rien : le clic la rend comme avant.
const enRoute = new Set();
export function prechaufferMelodie(band) {
  if (typeof window === 'undefined' || !getMusicEnabled() || MELODIES_SCENE.length) return;
  const b = melodieBande(band);
  if (cache.has(b) || enRoute.has(b)) return;
  enRoute.add(b);
  rendreAilleurs({ quoi: 'melodie', band: b })
    .then((data) => { if (!cache.has(b)) ranger(b, enTampon(data, MELODIE_SR)); }, () => {})
    .finally(() => enRoute.delete(b));
}
