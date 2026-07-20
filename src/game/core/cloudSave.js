// ── Sauvegarde nuage (.exe + Google Drive) ───────────────────────────────────
// Le préload Electron (preload.cjs) expose window.civCloud : le contenu du
// fichier nuage lu AU LANCEMENT (synchrone) et write()/clear(). Dans le
// navigateur (dev, version web), civCloud n'existe pas → tout ici est neutre.
//
// Règle d'arbitrage : LA PARTIE LA PLUS AVANCÉE GAGNE. Le juge est l'horloge à
// vie chronicleStats.lifetimePlaySec (éternelle : elle survit au Grand Reset et
// ne peut que croître) ; à égalité, le save le plus récent (lastTick, horodaté
// par save()). On ne compare PAS les timestamps seuls : un poste resté hors
// ligne avec une vieille partie mais ouvert en dernier écraserait des heures de
// progression — l'horloge à vie, elle, ne ment jamais.
//
// ⚠ ORDRE D'IMPORT : l'arbitrage remplace la save localStorage AVANT que
// state.js ne la lise (`state = load()` court à l'IMPORT de state.js). Ce
// module doit donc être importé EN PREMIER dans src/main.jsx, et ne doit
// jamais importer state.js (ce qui déclencherait ce chargement trop tôt) —
// d'où saveKey.js.
import { SAVE_KEY } from './saveKey.js';

const cc = () => (typeof window !== 'undefined' && window.civCloud) ? window.civCloud : null;

// Dossier nuage actif, ou null (pas de Google Drive / pas en .exe) — pour l'UI.
export function cloudSaveDir() {
  const c = cc();
  return c && c.dir ? c.dir : null;
}

// Quelle save gagne ? 'cloud' ou 'local'. Exportée pure pour les tests.
export function pickMostAdvanced(cloudRaw, localRaw) {
  let cloud;
  try { cloud = JSON.parse(cloudRaw); } catch { return 'local'; }
  if (!cloud || typeof cloud !== 'object') return 'local';
  if (!localRaw) return 'cloud';
  let local;
  try { local = JSON.parse(localRaw); } catch { return 'cloud'; }
  if (!local || typeof local !== 'object') return 'cloud';
  const life = (s) => Number(s?.chronicleStats?.lifetimePlaySec) || 0;
  const tick = (s) => Number(s?.lastTick) || 0;
  if (life(cloud) !== life(local)) return life(cloud) > life(local) ? 'cloud' : 'local';
  return tick(cloud) > tick(local) ? 'cloud' : 'local';
}

// Au lancement : si la save du nuage est plus avancée que la locale, elle la
// remplace dans localStorage — le chargement normal (state.js) fait le reste.
export function reconcileCloudAtBoot() {
  const c = cc();
  if (!c || typeof c.initial !== 'string' || !c.initial) return false;
  try {
    if (pickMostAdvanced(c.initial, localStorage.getItem(SAVE_KEY)) === 'cloud') {
      localStorage.setItem(SAVE_KEY, c.initial);
      return true;
    }
  } catch { /* stockage indisponible : on joue en mémoire, comme avant */ }
  return false;
}

// Miroir nuage de la save locale. Throttlé (Drive n'a pas besoin de
// synchroniser toutes les 5 s) ; force:true pour les moments qui ne peuvent
// pas attendre (import manuel, fermeture).
const CLOUD_WRITE_MIN_MS = 30000;
let lastCloudWrite = 0;
let cloudDirty = false;
export function cloudMirrorSave(opts) {
  const c = cc();
  if (!c || !c.dir) return;
  const now = Date.now();
  if (!(opts && opts.force) && now - lastCloudWrite < CLOUD_WRITE_MIN_MS) {
    cloudDirty = true; // rattrapé par le prochain miroir ou le flush de sortie
    return;
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw && c.write(raw)) { lastCloudWrite = now; cloudDirty = false; }
  } catch { /* le jeu continue en local, le nuage rattrapera */ }
}

// « Recommencer depuis le tout premier feu » : efface aussi le fichier nuage,
// sinon l'ancienne partie (plus avancée) ressusciterait au prochain lancement.
export function cloudWipe() {
  const c = cc();
  if (c && c.clear) { try { c.clear(); } catch { /* tant pis */ } }
}

if (typeof window !== 'undefined') {
  reconcileCloudAtBoot();
  // Fermeture de la fenêtre : pousser la dernière save si un miroir est en
  // attente de throttle. Écriture SYNCHRONE côté préload → fiable à la sortie.
  const flush = () => { if (cloudDirty) cloudMirrorSave({ force: true }); };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}
