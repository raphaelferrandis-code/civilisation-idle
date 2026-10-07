// LA CHAÎNE DE PRÉPARATION DES SONS ENREGISTRÉS (docs/PLAN-AMBIANCE-SONORE.md § 7).
//
// Lit scripts/sons/catalogue.json : pour chaque son du jeu, son fichier SOURCE — déposé
// par Raph dans /assets/sons/, non versionné (règle Defender : il télécharge lui-même) —,
// où le couper, son gain. Écrit src/assets/sons/<id>.ogg : mono, 32 kHz, Ogg Vorbis,
// fondus d'entrée et de sortie, crête ramenée à −1 dBFS puis le gain du catalogue. Mesure
// ensuite la sonie (EBU R128) de ce qu'il a écrit. Le jeu lit ce dossier tout seul
// (src/game/audio/paysage/enregistrements.js) : le nom fait la famille.
//
//   node scripts/importSons.mjs             tout le catalogue
//   node scripts/importSons.mjs merle       seulement les ids qui contiennent « merle »
//   node scripts/importSons.mjs --sources   l'inventaire de /assets/sons/ (durée, format),
//                                           pour choisir les coupes
//
// Une entrée du catalogue :
//   { "id": "oiseau-merle-1", "source": "bigsoundbank/merle.wav", "debut": 0.4, "fin": 5.2,
//     "gain": 0, "passeHaut": 120, "fondu": [0.01, 0.08],
//     "credit": { "auteur": "…", "page": "https://…", "licence": "CC0" } }
// `debut` / `fin` (s) sont facultatifs (le fichier entier) ; `passeHaut` (Hz) retire le
// grondement d'un enregistrement de terrain ; `gain` (dB) s'ajoute après la crête à −1 dBFS.
//
// ffmpeg : FFMPEG=…, sinon le PATH, sinon l'installation winget (Gyan.FFmpeg) — une session
// lancée avant l'installation ne voit pas encore le PATH mis à jour.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Les trois chemins se remplacent par l'environnement, pour les essais (SONS_SOURCES,
// SONS_SORTIE, SONS_CATALOGUE) : un essai n'écrit jamais dans le jeu.
export const DOSSIER_SOURCES = process.env.SONS_SOURCES || path.join(ROOT, 'assets', 'sons');
export const DOSSIER_SORTIE = process.env.SONS_SORTIE || path.join(ROOT, 'src', 'assets', 'sons');
export const CATALOGUE = process.env.SONS_CATALOGUE || path.join(ROOT, 'scripts', 'sons', 'catalogue.json');
export const SR = 32000;
const ID = /^[a-z]+(-[a-z0-9]+)*$/;

export function trouverFfmpeg(env = process.env) {
  if (env.FFMPEG && fs.existsSync(env.FFMPEG)) return env.FFMPEG;
  const essai = spawnSync('ffmpeg', ['-hide_banner', '-version'], { encoding: 'utf8' });
  if (essai.status === 0) return 'ffmpeg';
  const base = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (base && fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('Gyan.FFmpeg')) continue;
      for (const sous of fs.readdirSync(path.join(base, d))) {
        const exe = path.join(base, d, sous, 'bin', 'ffmpeg.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return null;
}

// ── Lecture des sorties de ffmpeg (pures, testées) ─────────────────────────────
export function lireDuree(texte) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(texte || '');
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
export function lireFlux(texte) {
  const m = /Stream #\S+.*?Audio:\s*([^,\n]+),\s*(\d+)\s*Hz,\s*([^,\n]+)/.exec(texte || '');
  return m ? { codec: m[1].trim(), hz: Number(m[2]), canaux: m[3].trim() } : null;
}
export function lireCrete(texte) {
  const m = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(texte || '');
  return m ? Number(m[1]) : null;
}
// ⚠ Le RÉSUMÉ seulement : ebur128 écrit aussi une ligne par tranche de 100 ms, et la
// première vaut toujours « I: -70.0 LUFS » (le seuil, rien n'est encore mesuré).
export function lireSonie(texte) {
  const t = String(texte || ''), r = t.lastIndexOf('Summary:');
  const resume = r >= 0 ? t.slice(r) : '';
  const i = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(resume);
  const p = /Peak:\s*(-?\d+(?:\.\d+)?|-inf)\s*dBFS/.exec(resume);
  return { lufs: i ? Number(i[1]) : null, crete: p ? (p[1] === '-inf' ? -Infinity : Number(p[1])) : null };
}

// La mise en forme d'une entrée avant le gain : mono, 32 kHz, passe-haut. La crête se
// MESURE après elle (le passe-haut retire du grondement, donc de la crête).
export function filtresForme(e) {
  const f = ['aformat=channel_layouts=mono', `aresample=${SR}`];
  if (e.passeHaut) f.push(`highpass=f=${Number(e.passeHaut)}`);
  return f;
}
// Les arguments de l'encodage d'une entrée, la crête mesurée (dBFS) et la durée de la
// coupe connues. Pur (testé).
export function argsEncodage(e, { source, sortie, crete, duree }) {
  const [fIn, fOut] = Array.isArray(e.fondu) ? e.fondu : [0.01, 0.06];
  const filtres = filtresForme(e);
  filtres.push(`afade=t=in:st=0:d=${fIn}`);
  filtres.push(`afade=t=out:st=${Math.max(0, duree - fOut).toFixed(3)}:d=${fOut}`);
  const gain = -1 - (Number.isFinite(crete) ? crete : 0) + (Number(e.gain) || 0);
  filtres.push(`volume=${gain.toFixed(2)}dB`);
  const args = ['-hide_banner', '-nostats', '-y'];
  if (e.debut != null) args.push('-ss', String(e.debut));
  args.push('-t', duree.toFixed(3), '-i', source, '-af', filtres.join(','), '-ac', '1', '-ar', String(SR), '-c:a', 'libvorbis', '-q:a', '4', sortie);
  return args;
}

// Une entrée valide ? Rend la liste de ses défauts (vide si elle est bonne).
export function defautsEntree(e) {
  const d = [];
  if (!e || typeof e !== 'object') return ['entrée illisible'];
  if (!ID.test(String(e.id || ''))) d.push(`id « ${e.id} » : minuscules et tirets, la famille en tête (oiseau-merle-1)`);
  if (!e.source) d.push('source manquante');
  if (e.debut != null && !(Number(e.debut) >= 0)) d.push('début invalide');
  if (e.fin != null && !(Number(e.fin) > Number(e.debut || 0))) d.push('fin invalide');
  return d;
}

// ── L'exécution ────────────────────────────────────────────────────────────────
function ffmpeg(exe, args) {
  const r = spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, texte: (r.stderr || '') + (r.stdout || '') };
}
function listerSources(dossier) {
  const out = [];
  if (!fs.existsSync(dossier)) return out;
  const marcher = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) marcher(p);
      else if (/\.(wav|flac|mp3|ogg|opus|m4a|aif|aiff)$/i.test(e.name)) out.push(p);
    }
  };
  marcher(dossier);
  return out.sort();
}

function inventaire(exe) {
  const fichiers = listerSources(DOSSIER_SOURCES);
  if (!fichiers.length) { console.log(`Aucun enregistrement dans ${DOSSIER_SOURCES}.`); return; }
  for (const f of fichiers) {
    const { texte } = ffmpeg(exe, ['-hide_banner', '-i', f]);
    const flux = lireFlux(texte), d = lireDuree(texte);
    console.log(`${path.relative(DOSSIER_SOURCES, f)}  ${d != null ? d.toFixed(2) + ' s' : '?'}  ${flux ? `${flux.codec}, ${flux.hz} Hz, ${flux.canaux}` : '?'}`);
  }
}

function importer(exe, filtre) {
  const cat = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
  const sons = (cat.sons || []).filter((e) => !filtre || String(e.id).includes(filtre));
  if (!sons.length) { console.log('Rien à importer (catalogue vide ou filtre sans réponse).'); return 0; }
  fs.mkdirSync(DOSSIER_SORTIE, { recursive: true });
  let echecs = 0;
  for (const e of sons) {
    const defauts = defautsEntree(e);
    const source = path.join(DOSSIER_SOURCES, String(e.source || ''));
    if (!defauts.length && !fs.existsSync(source)) defauts.push(`source introuvable : ${source}`);
    if (defauts.length) { console.error(`✗ ${e.id} : ${defauts.join(' ; ')}`); echecs += 1; continue; }
    const total = lireDuree(ffmpeg(exe, ['-hide_banner', '-i', source]).texte);
    const debut = Number(e.debut || 0);
    const duree = (e.fin != null ? Number(e.fin) : total) - debut;
    if (!(duree > 0.05)) { console.error(`✗ ${e.id} : coupe vide (${duree} s)`); echecs += 1; continue; }
    const mesure = ['-hide_banner', '-nostats'];
    if (e.debut != null) mesure.push('-ss', String(e.debut));
    mesure.push('-t', duree.toFixed(3), '-i', source, '-af', [...filtresForme(e), 'volumedetect'].join(','), '-f', 'null', '-');
    let crete = lireCrete(ffmpeg(exe, mesure).texte);
    const sortie = path.join(DOSSIER_SORTIE, `${e.id}.ogg`);
    const sonie = () => lireSonie(ffmpeg(exe, ['-hide_banner', '-nostats', '-i', sortie, '-af', 'ebur128=peak=true', '-f', 'null', '-']).texte);
    let enc = ffmpeg(exe, argsEncodage(e, { source, sortie, crete, duree }));
    if (!enc.ok) { console.error(`✗ ${e.id} : ffmpeg a échoué\n${enc.texte.slice(-600)}`); echecs += 1; continue; }
    let s = sonie();
    // L'encodage Ogg déborde parfois la crête visée (+1 dB mesuré) : une seconde passe
    // ramène la vraie crête sous −1 dBFS.
    if (Number.isFinite(s.crete) && s.crete > -0.3 && Number.isFinite(crete)) {
      crete += s.crete + 1;
      enc = ffmpeg(exe, argsEncodage(e, { source, sortie, crete, duree }));
      if (!enc.ok) { console.error(`✗ ${e.id} : ffmpeg a échoué (seconde passe)`); echecs += 1; continue; }
      s = sonie();
    }
    const ko = (fs.statSync(sortie).size / 1024).toFixed(0);
    console.log(`✓ ${e.id}  ${duree.toFixed(2)} s  crête source ${crete} dB → ${s.crete} dBFS  ${s.lufs} LUFS  ${ko} Ko`);
  }
  return echecs;
}

function main() {
  const exe = trouverFfmpeg();
  if (!exe) { console.error('ffmpeg introuvable : FFMPEG=…, le PATH, ou `winget install Gyan.FFmpeg`.'); process.exit(1); }
  const arg = process.argv[2];
  if (arg === '--sources') { inventaire(exe); return; }
  const echecs = importer(exe, arg && !arg.startsWith('--') ? arg : null);
  if (echecs) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
