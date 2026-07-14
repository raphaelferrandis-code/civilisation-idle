"use strict";

// Annales du cycle (onglet Régulation) : mémoire COURT TERME de la Rupture.
// Courbe des ~10 dernières minutes + marqueurs de décision, consommées par
// CycleAnnals.jsx. Buffer module-scope, HORS save : la courbe repart vide au
// chargement et se remplit au fil du jeu — c'est une mémoire de séance, pas
// d'archive. Module PUR (zéro import) : state.js peut l'appeler au reset de
// cycle sans créer de dépendance circulaire.
//
// ⚠ Décision actée (2026-07-13) : les annales regardent le PASSÉ seulement —
// aucune vitesse effective ni ETA de Rupture ne doit être dérivée d'ici pour
// l'affichage (proposé puis rejeté par Raph).

const WINDOW_MS = 10 * 60 * 1000; // fenêtre glissante de la courbe
const SAMPLE_MIN_GAP_MS = 900;    // ~1 Hz réel — la simulation offline (boucle
                                  // de ticks dans la même ms) n'empile donc
                                  // qu'un point, pas des centaines.
const MAX_MARKS = 48;

let samples = []; // { t, v } — v = state.instability [0..1]
let marks = [];   // { t, kind, id } — kind: soothe|reform|gambleWin|gambleLoss|crisis|policyOn|policyOff

export function pushAnnalsSample(v) {
  const t = Date.now();
  const last = samples[samples.length - 1];
  if (last && t - last.t < SAMPLE_MIN_GAP_MS) return;
  samples.push({ t, v });
  // Purge paresseuse (par paquet de 30 s hors fenêtre) : évite un filter par tick.
  const cutoff = t - WINDOW_MS;
  if (samples.length > 2 && samples[0].t < cutoff - 30_000) {
    samples = samples.filter((s) => s.t >= cutoff);
  }
}

export function pushAnnalsMark(kind, id = null) {
  marks.push({ t: Date.now(), kind, id });
  if (marks.length > MAX_MARKS) marks = marks.slice(-MAX_MARKS);
}

// Instantané pour le rendu : tableaux LIVE (ne pas muter côté UI) + bornes de
// la fenêtre. Les marqueurs hors fenêtre sont filtrés à la lecture.
export function annalsWindow() {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  return {
    now,
    windowMs: WINDOW_MS,
    samples: samples.filter((s) => s.t >= cutoff),
    marks: marks.filter((m) => m.t >= cutoff)
  };
}

// Nouveau cycle (effondrement / Grand Reset) : la mémoire de la civilisation
// tombée ne concerne pas la suivante.
export function resetAnnals() {
  samples = [];
  marks = [];
}
