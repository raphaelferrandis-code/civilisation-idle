// LES BRUITAGES DE LA MACHINE À SOUS : la LECTURE. La synthèse (les sons de chaque
// habit, pure) vit dans slotsSynth.js ; ici le cache, la préparation à l'avance, et la
// lecture par le contexte audio du jeu, qui suit Options › Son › Bruitages.
import { jouerTampon, enTampon } from './synth.js';
import { getSfxEnabled, getSfxVolume, duckMusic } from '../core/main.js';
import { SFX_SR, SONS_SLOTS, rendreSon, rendreRonron } from './slotsSynth.js';
import { rendreAilleurs } from './syntheseAilleurs.js';

export { SFX_SR, SONS_SLOTS, rendreSon, rendreRonron };
const NIVEAU = { tic: 0.35, cliquet: 0.4, arret: 0.7, levier: 0.75, tension: 0.6, coffre: 0.7, pieces: 0.6, atterrit: 0.8, relance: 0.55 };

// ── La lecture ─────────────────────────────────────────────────────────────────
// Les caches gardent des tampons PRÊTS (AudioBuffer, synth.enTampon) : plus de copie à
// chaque son. Et seulement DEUX habits (audit du 2026-10-05, MEM-10 : ~2,6 Mo par
// habit, gardés à vie) — celui de la machine en service, et la fonte, dans laquelle
// sonnent toujours les grands gains de la salle (GrandGain.jsx). Changer d'habit (la
// ville change de bande) oublie l'ancien ; il se rendra de nouveau s'il revient.
const cache = new Map();
const ronrons = new Map();
let habit = null;
const garde = (look) => look === 'fonte' || look === habit;
function garder(look) {
  if (garde(look)) return;
  habit = look;
  for (const k of cache.keys()) if (!garde(k.slice(k.indexOf('|') + 1))) cache.delete(k);
  for (const l of ronrons.keys()) if (!garde(l)) ronrons.delete(l);
}
function tampon(nom, look) {
  const k = nom + '|' + look;
  garder(look);
  if (!cache.has(k)) cache.set(k, enTampon(rendreSon(nom, look), SFX_SR));
  return cache.get(k);
}
function ronron(look) {
  garder(look);
  if (!ronrons.has(look)) ronrons.set(look, enTampon(rendreRonron(look), SFX_SR));
  return ronrons.get(look);
}
// Prépare les sons d'un habit à l'avance (au montage de la machine), les plus utiles
// d'abord, le jackpot en dernier. Rend de quoi annuler.
// HORS DU FIL PRINCIPAL (audit du 2026-10-05, PERF-41) : rendus d'un bloc, le jackpot
// (~100 ms) et le gros gain (~55 ms) figeaient la page vers 0,8 s après l'ouverture,
// souvent rouleaux lancés — l'étalement par pas de 40 ms ne coupe pas un son lourd. Ils
// se rendent dans le Worker des sons (syntheseAilleurs.js) ; sans Worker, UN PAR UN
// comme avant. Bruitages coupés : rien (~250 ms de calcul et ~2,7 Mo pour rien) — un son
// joué après les avoir rallumés se rend à la demande.
const ORDRE = ['levier', 'tic', 'arret', 'ronron', 'cliquet', 'gain1', 'tension', 'atterrit', 'relance', 'roue', 'tours', 'gain2', 'coffre', 'vol', 'pieces', 'gain3', 'jackpot'];
const enRoute = new Set();
export function prechaufferSons(look) {
  if (typeof window === 'undefined' || !getSfxEnabled()) return () => {};
  garder(look);
  let vivant = true, repli = false, i = 0, id = null;
  const ici = () => {
    if (!vivant) return;
    const nom = ORDRE[i++];
    if (!nom) return;
    if (nom === 'ronron') ronron(look); else tampon(nom, look);
    id = setTimeout(ici, 40);
  };
  for (const nom of ORDRE) {
    const k = nom + '|' + look;
    if ((nom === 'ronron' ? ronrons.has(look) : cache.has(k)) || enRoute.has(k)) continue;
    enRoute.add(k);
    rendreAilleurs(nom === 'ronron' ? { quoi: 'ronron', look } : { quoi: 'son', nom, look }).then((data) => {
      // (Déjà rendu à la demande entre-temps : on garde celui-là, identique. Habit
      // quitté pendant le rendu : on ne le range pas.)
      if (!garde(look)) return;
      if (nom === 'ronron') { if (!ronrons.has(look)) ronrons.set(look, enTampon(data, SFX_SR)); } else if (!cache.has(k)) cache.set(k, enTampon(data, SFX_SR));
    }, () => {
      if (!repli && vivant) { repli = true; id = setTimeout(ici, 40); }
    }).finally(() => enRoute.delete(k));
  }
  return () => { vivant = false; clearTimeout(id); };
}
// Joue `nom` (fonte | neon | cosmic). `fort` : 0 à 1, le volume relatif (les tics des
// rouleaux qui ralentissent montent en approchant de l'arrêt).
export function sonSlots(nom, look, fort = 1) {
  if (typeof window === 'undefined' || !getSfxEnabled()) return null;
  const vol = getSfxVolume() * (NIVEAU[nom] ?? 1) * fort;
  if (vol <= 0) return null;
  const data = tampon(nom, look);
  // Les gros moments couvrent la musique un instant.
  if (nom === 'gain3' || nom === 'jackpot' || nom === 'roue' || nom === 'tours') duckMusic((data.length / SFX_SR) * 1000 - 400);
  return jouerTampon(data, SFX_SR, vol);
}
// Rend { vitesse(v 0..1), stop() } ou null (bruitages coupés, pas de navigateur).
export function ronronSlots(look) {
  if (typeof window === 'undefined' || !getSfxEnabled()) return null;
  const vol = getSfxVolume() * 0.32;
  const p = jouerTampon(ronron(look), SFX_SR, 0, { loop: true });
  if (!p) return null;
  return {
    vitesse(v) { p.gain.gain.setTargetAtTime(vol * Math.max(0, Math.min(1, v)), p.ctx.currentTime, 0.04); },
    stop() { p.gain.gain.setTargetAtTime(0, p.ctx.currentTime, 0.05); setTimeout(() => p.stop(), 300); }
  };
}
