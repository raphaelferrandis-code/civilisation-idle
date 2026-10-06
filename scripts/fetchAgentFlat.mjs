// fetchAgentFlat.mjs — pipeline de la DA FLAT des habitants (2026-08-03) :
// assemble les 4 bandes de marche DIAGONALES d'un personnage PixelLab et pré-cuit
// les bandes DEMI-TAILLE que le rendu iso affiche au petit zoom (drawNamedAgentIso
// bascule sur {name}-{dir}-half.png quand drawH ≤ 70 % de la bande pleine).
//   node scripts/fetchAgentFlat.mjs assemble <name> <charId>   → backup tmp + zip → 4 bandes
//   node scripts/fetchAgentFlat.mjs half <name>                → 4 bandes -half (÷2 box + palette + alpha binaire)
// Flag --cardinal : travaille les 4 vues CARDINALES (south/east/north/west, fichiers
// {name}-south.png…) au lieu des diagonales — pour les consommateurs de scènes
// (blitFarmer/blitBasket de cityEngineSprites.js) et le rendu legacy top-down.
// ⚠ Le zip /download renvoie HTTP 423 tant qu'UN job de fond du perso pend (2e gen
// v3, anim en cours…) → réessayer plus tard, ou passer par scripts/assembleAgentUrls.mjs.
// Après assemble : passer chaque bande à scripts/quantize.cjs --colors 24 PUIS lancer half.
// Une direction animée DEUX fois dans le même groupe (une tâche « annulée » qui avait
// abouti, plus sa relance) sort du zip en dossiers suffixés `north-east-70d25abe/` :
// --pick=70d25abe choisit la prise ; sans --pick, le script refuse et liste les prises.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import { downloadCharacterZip, assembleStrip, inkRows } from './lib/pixellab.mjs';
import { bakeHalf } from './lib/half.mjs';

const CARDINAL = process.argv.includes('--cardinal');
const OUT_ARG = process.argv.find((a) => a.startsWith('--out='));
const PICKS = process.argv.filter((a) => a.startsWith('--pick=')).map((a) => a.slice(7));
const args = process.argv.filter((a) => a !== '--cardinal' && !a.startsWith('--out=') && !a.startsWith('--pick='));
const NAME = args[3];
const CHAR_ID = args[4];
// --out=<dossier> : agents/events pour les émeutiers (défaut : les habitants).
const OUT = OUT_ARG ? OUT_ARG.slice(6) : 'public/pixelart/agents/inhabitants';
const BACKUP = path.join(os.tmpdir(), 'civ-agents-backup');
const DIRS = CARDINAL ? ['south', 'east', 'north', 'west'] : ['south-east', 'south-west', 'north-east', 'north-west'];
const FRAMES = 6;
const RX = CARDINAL
  ? /animations\/[^/]+\/(south|east|north|west)(?:-([0-9a-f]{8}))?\/frame_(\d+)\.png$/i
  : /animations\/[^/]+\/(south-east|south-west|north-east|north-west)(?:-([0-9a-f]{8}))?\/frame_(\d+)\.png$/i;

async function assemble() {
  fs.mkdirSync(BACKUP, { recursive: true });
  for (const d of DIRS) {
    const f = `${NAME}-${d.replace('-', '')}.png`;
    const src = path.join(OUT, f);
    if (fs.existsSync(src) && !fs.existsSync(path.join(BACKUP, f))) fs.copyFileSync(src, path.join(BACKUP, f));
  }
  // Un seul essai : sur un 423, la main passe à scripts/assembleAgentUrls.mjs (cf. l'en-tête).
  const buf = await downloadCharacterZip(CHAR_ID, { tries: 1 });
  const byDir = Object.fromEntries(DIRS.map((d) => [d, []]));
  for (const e of new AdmZip(buf).getEntries()) {
    const m = e.entryName.match(RX);
    if (m) byDir[m[1].toLowerCase()].push({ take: m[2] || '', f: +m[3], data: e.getData() });
  }
  for (const d of DIRS) {
    const takes = [...new Set(byDir[d].map((e) => e.take))];
    if (takes.length < 2) continue;
    const pick = takes.find((t) => PICKS.includes(t));
    if (pick === undefined) throw new Error(`${d} : ${takes.length} prises (${takes.join(', ')}) — choisir avec --pick=<id>`);
    byDir[d] = byDir[d].filter((e) => e.take === pick);
  }
  for (const d of DIRS) {
    if (byDir[d].length < FRAMES) throw new Error(`${d}: ${byDir[d].length}/${FRAMES} frames — anim pas prête (direction ratée en silence ? re-queuer via animate_character + animation_group_id)`);
    byDir[d].sort((a, b) => a.f - b.f);
    const imgs = byDir[d].slice(0, FRAMES).map((e) => PNG.sync.read(e.data));
    const strip = assembleStrip(imgs);
    fs.writeFileSync(path.join(OUT, `${NAME}-${d.replace('-', '')}.png`), PNG.sync.write(strip));
    console.log('bande', `${NAME}-${d.replace('-', '')}.png`, `${strip.width}×${strip.height}`);
    if (d === 'south-east') {
      // bbox frame 0 → scale runtime suggéré : même hauteur de perso à l'écran que
      // l'ancienne DA (ratio perso/canvas 0.728, scale 0.85 adulte / 0.6 enfant).
      const fh = imgs[0].height, { h } = inkRows(imgs[0]);
      const ratio = h / fh;
      console.log(`  perso ${h}px / canvas ${fh} (ratio ${ratio.toFixed(2)}) → scale adulte ≈ ${(0.85 * 0.728 / ratio).toFixed(2)}, enfant ≈ ${(0.6 * 0.728 / ratio).toFixed(2)}`);
    }
  }
}

// Demi-bandes : ÷2 box + palette de la bande + alpha binaire (scripts/lib/half.mjs,
// la cuisson commune avec bakeHalfBands.mjs et fetchAgentIdle.mjs).
function half() {
  for (const d of DIRS) {
    const f = path.join(OUT, `${NAME}-${d.replace('-', '')}.png`);
    const out = bakeHalf(PNG.sync.read(fs.readFileSync(f)));
    fs.writeFileSync(f.replace('.png', '-half.png'), PNG.sync.write(out));
    console.log('half', `${NAME}-${d.replace('-', '')}-half.png`, `${out.width}×${out.height}`);
  }
}

const mode = process.argv[2];
if (!NAME || (mode === 'assemble' && !CHAR_ID)) { console.error('usage: node scripts/fetchAgentFlat.mjs assemble <name> <charId> | half <name>'); process.exit(1); }
if (mode === 'assemble') await assemble();
else if (mode === 'half') half();
else { console.error('usage: node scripts/fetchAgentFlat.mjs assemble <name> <charId> | half <name>'); process.exit(1); }
