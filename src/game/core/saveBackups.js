// COPIES DE SECOURS de la sauvegarde (audit 2026-10-05, SAV-3).
// Quatre sortes, toutes en localStorage à côté de la clé principale :
//   - « illisible » : la save que load() n'a pas pu relire (JSON tronqué par un
//     quota, régression d'un normaliseur…), ou que le repli champ par champ a dû
//     amputer. Les DEUX dernières copies DIFFÉRENTES sont gardées : une seule clé,
//     réécrite au moindre échec suivant, perdait la bonne au deuxième lancement ;
//   - « avant le nuage » : la save locale évincée par une copie nuage plus
//     avancée (cloudSave.js, reconcileCloudAtBoot) ;
//   - « avant l'import » : la partie remplacée par le dernier import (SAV-7) ;
//   - « version N » : une save d'une version PLUS RÉCENTE du jeu, gardée telle
//     quelle avant d'être jouée rétrogradée (SAV-6).
// Avant, elles existaient sans qu'aucune interface ne sache les relire : la
// copie survivait, mais le joueur ne pouvait rien en faire. Les Options les
// listent désormais, avec Charger (saveSlots.js, loadBackup) et Exporter.
//
// ⚠ Dépend de saveKey.js SEULEMENT : load() (state.js) l'appelle pendant
// l'évaluation de state.js — importer state.js d'ici créerait un cycle où ce
// module pourrait être lu avant d'être initialisé (TDZ, perte de save).
import { SAVE_KEY, stripBom } from './saveKey.js';

// [0] = la plus récente, [1] = la précédente. La première garde le nom
// historique : une copie archivée par une version antérieure reste listée.
const UNREADABLE_KEYS = [SAVE_KEY + "-corrupt-backup", SAVE_KEY + "-corrupt-backup-2"];
export const PRE_CLOUD_KEY = SAVE_KEY + ":pre-cloud";
// « avant l'import » (SAV-7) : la partie que le dernier import a remplacée
// (importSave, main.js) — un import fait par erreur se rattrape.
export const BEFORE_IMPORT_KEY = SAVE_KEY + "-before-import";
const metaKey = (key) => key + "-meta";
// « version plus récente » (SAV-6) : une save écrite par un build plus récent,
// gardée TELLE QUELLE avant qu'on la joue rétrogradée. Une clé par version.
const futureKey = (version) => `${SAVE_KEY}-v${version}-backup`;
// SAVE_KEY ne contient que lettres, chiffres et tirets : rien à échapper.
const FUTURE_KEY_RE = new RegExp(`^${SAVE_KEY}-v(\\d{1,4})-backup$`);
const isFutureKey = (key) => typeof key === "string" && FUTURE_KEY_RE.test(key);

// Archive une save d'une version PLUS RÉCENTE du jeu (load, state.js). Une copie
// par version, rafraîchie si le contenu a changé (c'est alors la plus avancée).
export function archiveFutureSave(raw, version) {
  const v = Math.floor(Number(version));
  if (typeof raw !== "string" || !raw || !Number.isFinite(v) || v <= 0) return;
  try {
    const key = futureKey(v);
    if (localStorage.getItem(key) === raw) return;
    localStorage.setItem(key, raw);
    localStorage.setItem(metaKey(key), JSON.stringify({ at: Date.now(), version: v }));
  } catch { /* stockage plein : la clé principale, elle, n'est pas réécrite */ }
}

// Archive une save illisible. Ne duplique jamais une copie déjà gardée (le même
// échec relancé dix fois ne doit pas pousser dehors la copie précédente) ; sinon
// la nouvelle prend la place [0] et l'ancienne [0] glisse en [1].
export function archiveUnreadableSave(raw) {
  if (typeof raw !== "string" || !raw) return;
  try {
    const current = UNREADABLE_KEYS.map((key) => localStorage.getItem(key));
    if (current.includes(raw)) return;
    if (current[0] != null) {
      localStorage.setItem(UNREADABLE_KEYS[1], current[0]);
      const prevMeta = localStorage.getItem(metaKey(UNREADABLE_KEYS[0]));
      if (prevMeta != null) localStorage.setItem(metaKey(UNREADABLE_KEYS[1]), prevMeta);
      else localStorage.removeItem(metaKey(UNREADABLE_KEYS[1]));
    }
    localStorage.setItem(UNREADABLE_KEYS[0], raw);
    localStorage.setItem(metaKey(UNREADABLE_KEYS[0]), JSON.stringify({ at: Date.now() }));
  } catch { /* stockage plein : on ne peut pas archiver, tant pis */ }
}

// Résumé lisible d'une copie (cité, cycles, date de la dernière partie jouée),
// ou null si son contenu ne se relit pas — c'est justement le cas des copies
// « illisibles » dont le JSON est tronqué : elles restent listées par leur date.
// Mémorisé par clé et longueur : les Options se re-rendent souvent, et parser
// 270 ko à chaque rendu ne se justifie pas pour trois mots d'affichage.
const summaryCache = new Map();
function summarize(key, raw) {
  const cached = summaryCache.get(key);
  if (cached && cached.length === raw.length) return cached.summary;
  let summary = null;
  try {
    const s = JSON.parse(stripBom(raw));
    if (s && typeof s === "object") {
      summary = {
        city: String(s.cityName || "").slice(0, 42),
        cycles: Math.max(0, Math.floor(Number(s.cycles) || 0)),
        lastTick: Number(s.lastTick) || 0
      };
    }
  } catch { /* contenu illisible : la date de l'archivage suffira */ }
  summaryCache.set(key, { length: raw.length, summary });
  return summary;
}

// Copies présentes, la plus récente d'abord par sorte. { key, kind, at, summary }
// (+ `version` pour kind "version") — `at` : date d'archivage (illisibles,
// version) ou de la dernière partie jouée (avant le nuage, qui n'a pas de méta).
export function listSaveBackups() {
  const out = [];
  try {
    for (const key of UNREADABLE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let at = 0;
      try { at = Number(JSON.parse(localStorage.getItem(metaKey(key)) || "{}").at) || 0; } catch { /* méta abîmée */ }
      out.push({ key, kind: "unreadable", at, summary: summarize(key, raw) });
    }
    const preCloud = localStorage.getItem(PRE_CLOUD_KEY);
    if (preCloud) {
      const summary = summarize(PRE_CLOUD_KEY, preCloud);
      out.push({ key: PRE_CLOUD_KEY, kind: "pre-cloud", at: summary ? summary.lastTick : 0, summary });
    }
    const beforeImport = localStorage.getItem(BEFORE_IMPORT_KEY);
    if (beforeImport) {
      const summary = summarize(BEFORE_IMPORT_KEY, beforeImport);
      out.push({ key: BEFORE_IMPORT_KEY, kind: "before-import", at: summary ? summary.lastTick : 0, summary });
    }
    // Copies d'une version plus récente (SAV-6) : leurs clés portent la version.
    // `kind: "version"` et non « plus récente » : une fois le jeu mis à jour, la
    // même copie redevient lisible (et se charge).
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!isFutureKey(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let at = 0;
      try { at = Number(JSON.parse(localStorage.getItem(metaKey(key)) || "{}").at) || 0; } catch { /* méta abîmée */ }
      out.push({ key, kind: "version", version: Number(FUTURE_KEY_RE.exec(key)[1]), at, summary: summarize(key, raw) });
    }
  } catch { /* stockage indisponible : aucune copie à montrer */ }
  return out;
}

// Contenu brut d'une copie, ou null. Refuse toute autre clé : ce n'est pas une
// porte d'entrée générique vers le localStorage.
export function readSaveBackup(key) {
  if (key !== PRE_CLOUD_KEY && key !== BEFORE_IMPORT_KEY && !UNREADABLE_KEYS.includes(key) && !isFutureKey(key)) return null;
  try {
    return localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}
