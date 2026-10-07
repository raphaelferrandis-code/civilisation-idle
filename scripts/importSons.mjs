// LA CHAÎNE DE PRÉPARATION DES SONS ENREGISTRÉS (docs/PLAN-AMBIANCE-SONORE.md § 7).
//
// Lit scripts/sons/catalogue.json : pour chaque son du jeu, son fichier SOURCE — déposé
// par Raph dans /assets/sons/, non versionné (règle Defender : il télécharge lui-même) —,
// où le couper, son gain. Écrit src/assets/sons/<id>.ogg : mono, 32 kHz, Ogg Vorbis,
// fondus d'entrée et de sortie, crête ramenée à −1 dBFS puis le gain du catalogue. Mesure
// ensuite la sonie (EBU R128) de ce qu'il a écrit. Le jeu lit ce dossier tout seul
// (src/game/audio/paysage/enregistrements.js) : le nom fait la famille.
//
//   node scripts/importSons.mjs             les sons du catalogue pas encore importés
//   node scripts/importSons.mjs merle       seulement les ids qui contiennent « merle » (refaits)
//   node scripts/importSons.mjs --tout      tout le catalogue, refait
// ⚠ Refaire un son déjà importé change son fichier même à l'identique (l'Ogg tire un numéro
// de série à chaque encodage) : d'où, par défaut, seulement les manquants.
//   node scripts/importSons.mjs --sources   l'inventaire de /assets/sons/ (durée, format),
//                                           pour choisir les coupes
//
// Une entrée du catalogue :
//   { "id": "oiseau-merle-1", "source": "bigsoundbank/merle.wav", "debut": 0.4, "fin": 5.2,
//     "gain": 0, "passeHaut": 120, "fondu": [0.01, 0.08],
//     "credit": { "auteur": "…", "page": "https://…", "licence": "CC0" } }
// `debut` / `fin` (s) sont facultatifs (le fichier entier) ; `passeHaut` (Hz) retire le
// grondement d'un enregistrement de terrain ; `gain` (dB) s'ajoute après la crête à −1 dBFS.
// Pour une NAPPE (lot 3), la sortie est une boucle exacte, sans fondus :
//   · `brouiller` : { grain, duree, graine } recompose une foule en grains tirés au hasard
//     (plus aucun mot ne survit) ;
//   · `boucler` : { fondu } referme la prise sur elle-même, en fondu (des sabots au pas) ;
//   · `passeBas` (Hz) : une foule qu'on entend de loin ;
//   · `rms` (dBFS) : une nappe se met au niveau par son ÉNERGIE, comme les nappes
//     synthétisées (≈ −20 dBFS), la crête plafonnée à −1 dBFS ; sans `rms`, par la crête.
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

// La mise en forme d'une entrée avant le gain : mono, 32 kHz, passe-haut (et passe-bas,
// pour une foule qu'on entend de loin). La crête se MESURE après elle (le passe-haut
// retire du grondement, donc de la crête).
export function filtresForme(e) {
  const f = ['aformat=channel_layouts=mono', `aresample=${SR}`];
  if (e.passeHaut) f.push(`highpass=f=${Number(e.passeHaut)}`);
  if (e.passeBas) f.push(`lowpass=f=${Number(e.passeBas)}`);
  return f;
}

// ── Les foules SANS LANGUE (lot 3) ─────────────────────────────────────────────
// Les foules de BigSoundBank parlent français ; Raph veut un brouhaha « sans langue
// reconnaissable », et les voix synthétisées ont été refusées (« cauchemardesques »).
// On RECOMPOSE donc la prise : des grains de quelques dixièmes de seconde (`grain`), chacun
// tiré au hasard dans toute la prise, posés bout à bout en fondu — fenêtre en sinus,
// recouvrement de moitié : deux grains sans lien gardent la puissance constante. Plus
// aucun mot ne survit, et ce sont de vraies voix. Le résultat est une BOUCLE exacte de
// `duree` secondes : les grains sont posés en cercle, le dernier retombe sur le premier.
// PUR (aléa à graine), testé.
function alea(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Une BOUCLE CROISÉE, pour un son rythmé qu'il ne faut pas hacher (des sabots au pas) :
// la queue de la prise (`fondu` s) se fond dans son début, à puissance constante — les
// deux bouts sont sans lien, leurs puissances s'ajoutent. PUR, testé.
export function bouclerPrise(src, sr, fondu = 0.5) {
  const F = Math.max(1, Math.round(fondu * sr)), Ln = src.length - F;
  if (!(Ln > F)) throw new Error('prise trop courte pour boucler');
  const out = src.slice(0, Ln);
  for (let i = 0; i < F; i += 1) {
    const th = ((i / F) * Math.PI) / 2;
    out[i] = src[i] * Math.sin(th) + src[Ln + i] * Math.cos(th);
  }
  return out;
}
export function brouiller(src, sr, { grain = 0.2, duree = 30, graine = 1 } = {}) {
  const G = Math.max(64, 2 * Math.round((grain * sr) / 2)), H = G / 2;
  const span = src.length - G;
  if (!(span > 0)) throw new Error('prise plus courte qu’un grain');
  const n = Math.max(2, Math.round((duree * sr) / H)) * H;
  const w = new Float32Array(G);
  for (let j = 0; j < G; j += 1) w[j] = Math.sin((Math.PI * (j + 0.5)) / G);
  const out = new Float32Array(n), rnd = alea(graine);
  for (let k = 0; k < n / H; k += 1) {
    const s0 = Math.floor(rnd() * span), o = k * H;
    for (let j = 0; j < G; j += 1) out[(o + j) % n] += src[s0 + j] * w[j];
  }
  return out;
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
  if (e.brouiller != null) {
    const b = e.brouiller;
    if (!b || typeof b !== 'object') d.push('brouiller : { grain, duree, graine }');
    else {
      if (!(Number(b.grain) >= 0.05 && Number(b.grain) <= 1)) d.push('brouiller.grain : de 0,05 à 1 s');
      if (!(Number(b.duree) >= 5 && Number(b.duree) <= 120)) d.push('brouiller.duree : de 5 à 120 s');
    }
  }
  if (e.boucler != null && !(e.boucler && Number(e.boucler.fondu) >= 0.05 && Number(e.boucler.fondu) <= 5)) d.push('boucler.fondu : de 0,05 à 5 s');
  if (e.brouiller != null && e.boucler != null) d.push('brouiller OU boucler, pas les deux');
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

// Une BOUCLE : la prise décodée en flottants (mono, 32 kHz, filtres de forme), recomposée
// en foule sans langue (`brouiller`) ou refermée en fondu (`boucler`), sa crête ramenée à
// −1 dBFS puis le gain du catalogue, et encodée depuis l'entrée standard. Pas de fondus
// d'entrée ni de sortie : la boucle se referme sur elle-même. Comme pour les autres, une
// seconde passe si l'encodage déborde.
function importerBoucle(exe, e, source, duree) {
  const lire = ['-hide_banner', '-nostats'];
  if (e.debut != null) lire.push('-ss', String(e.debut));
  lire.push('-t', duree.toFixed(3), '-i', source, '-af', filtresForme(e).join(','), '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1');
  const lu = spawnSync(exe, lire, { maxBuffer: 512 * 1024 * 1024 });
  if (lu.status !== 0 || !lu.stdout || lu.stdout.length < 4) return { ok: false, erreur: 'décodage impossible\n' + String(lu.stderr || '').slice(-400) };
  // Copie dans un tampon aligné : la sortie du processus peut commencer à n'importe quel octet.
  const octets = new ArrayBuffer(lu.stdout.length - (lu.stdout.length % 4));
  new Uint8Array(octets).set(lu.stdout.subarray(0, octets.byteLength));
  let boucle;
  try {
    const prise = new Float32Array(octets);
    boucle = e.brouiller ? brouiller(prise, SR, e.brouiller) : bouclerPrise(prise, SR, Number(e.boucler.fondu));
  } catch (err) { return { ok: false, erreur: String(err.message || err) }; }
  let max = 1e-9;
  for (let i = 0; i < boucle.length; i += 1) max = Math.max(max, Math.abs(boucle[i]));
  const sortie = path.join(DOSSIER_SORTIE, `${e.id}.ogg`);
  // Par l'énergie : le gain qui porte la RMS à `rms` dBFS, exprimé en crête visée.
  if (e.rms != null) {
    let en = 0;
    for (let i = 0; i < boucle.length; i += 1) en += boucle[i] * boucle[i];
    const rms = Math.sqrt(en / boucle.length) || 1e-9;
    max = Math.max(max, (rms * Math.pow(10, -1 / 20)) / Math.pow(10, Number(e.rms) / 20));
  }
  const encoder = (db) => {
    const k = Math.pow(10, db / 20) / max, pcm = new Float32Array(boucle.length);
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = boucle[i] * k;
    const args = ['-hide_banner', '-nostats', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libvorbis', '-q:a', '4', sortie];
    return spawnSync(exe, args, { input: Buffer.from(pcm.buffer), maxBuffer: 64 * 1024 * 1024 }).status === 0;
  };
  const sonie = () => lireSonie(ffmpeg(exe, ['-hide_banner', '-nostats', '-i', sortie, '-af', 'ebur128=peak=true', '-f', 'null', '-']).texte);
  let cible = -1 + (Number(e.gain) || 0);
  if (!encoder(cible)) return { ok: false, erreur: 'encodage impossible' };
  let s = sonie();
  if (Number.isFinite(s.crete) && s.crete > -0.3) {
    cible -= s.crete + 1;
    if (!encoder(cible)) return { ok: false, erreur: 'encodage impossible (seconde passe)' };
    s = sonie();
  }
  return { ok: true, secondes: boucle.length / SR, crete: s.crete, lufs: s.lufs, ko: (fs.statSync(sortie).size / 1024).toFixed(0) };
}

function importer(exe, filtre, tout = false) {
  const cat = JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'));
  const manque = (e) => !fs.existsSync(path.join(DOSSIER_SORTIE, `${e.id}.ogg`));
  const sons = (cat.sons || []).filter((e) => (filtre ? String(e.id).includes(filtre) : tout || manque(e)));
  if (!sons.length) { console.log(filtre ? 'Aucun id ne contient ce filtre.' : 'Rien à importer : tout est déjà là (--tout pour refaire).'); return 0; }
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
    if (e.brouiller || e.boucler) {
      const r = importerBoucle(exe, e, source, duree);
      const comment = e.brouiller ? `grains de ${e.brouiller.grain} s, pris dans ${duree.toFixed(1)} s` : `fondu de ${e.boucler.fondu} s`;
      if (!r.ok) { console.error(`✗ ${e.id} : ${r.erreur}`); echecs += 1; }
      else console.log(`✓ ${e.id}  boucle de ${r.secondes.toFixed(1)} s (${comment})  → ${r.crete} dBFS  ${r.lufs} LUFS  ${r.ko} Ko`);
      continue;
    }
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
  const echecs = importer(exe, arg && !arg.startsWith('--') ? arg : null, arg === '--tout');
  if (echecs) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
