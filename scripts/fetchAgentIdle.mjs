// fetchAgentIdle.mjs — L'ATTENTE ANIMÉE des habitants (docs/PLAN-COMPORTEMENTS.md,
// lot 3) : « fini les statues ». Tout personnage arrêté était figé sur l'image 0 de
// sa marche ; on lui donne une courte bande d'attente (gabarit PixelLab
// `breathing-idle`, 4 images, les 4 vues DIAGONALES de l'iso).
//
//   node scripts/fetchAgentIdle.mjs <name> <charId> [--match=idle] [--pick=<prise>]
//        [--as=idle] [--dirs=south-east,south-west,…] [--to-lowest]
//
// `--as` nomme la bande ({name}-{as}-{dir}.png) : « idle » (l'attente, gabarit
// breathing-idle), « sit » (s'asseoir sur un banc), « wave » (le salut) — ces deux-là
// sont des animations v3 décrites en texte, souvent sur deux vues seulement (`--dirs`,
// les faces sud-est et sud-ouest : de dos, on ne voit ni l'un ni l'autre). Le canevas
// v3 GRANDIT avec la silhouette : chaque image est recadrée au format de la marche,
// pieds de l'image de référence (la première) posés sur ceux de la marche.
// `--to-lowest` (s'asseoir) : la v3 se RELÈVE souvent dans ses dernières images ; on
// coupe la bande à l'image la plus RAMASSÉE (hauteur d'encre minimale : la tête descend,
// ou les jambes se replient) — la descente se joue, puis le jeu tient la dernière image.
//
// Écrit, à côté des bandes de marche (public/pixelart/agents/inhabitants) :
//   {name}-idle-{southeast|southwest|northeast|northwest}.png       (pleine)
//   {name}-idle-{…}-half.png                                         (demi-taille)
// Étapes, dans l'ordre :
//   1. le zip /download du personnage (HTTP 423 tant qu'un job pend : réessais) ;
//   2. les images de l'animation dont le DOSSIER contient --match (« idle ») — le zip
//      porte aussi la marche, qu'il ne faut surtout pas mélanger ;
//   3. l'ombre grise que le gabarit colle sous les pieds est retirée (même critère
//      que scripts/stripBakedShadow.mjs : la charte interdit toute ombre cuite) ;
//   4. chaque pixel est RABATTU sur la palette de la bande de MARCHE du même
//      personnage : passer de la marche à l'attente ne doit changer aucune teinte ;
//   5. la demi-bande est cuite comme celles de la marche (moyenne 2×2 + palette +
//      alpha binaire, cf. fetchAgentFlat.mjs half) — drawNamedAgentIso bascule dessus
//      au même seuil.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import { downloadCharacterZip, assembleStrip, stripShadow } from './lib/pixellab.mjs';
import { bakeHalf, paletteOf, nearest } from './lib/half.mjs';

const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const pos = args.filter((a) => !a.startsWith('--'));
const NAME = pos[0], CHAR_ID = pos[1];
const MATCH = new RegExp(flag('match', 'idle'), 'i');
const PICK = flag('pick', null);
const TO_LOWEST = args.includes('--to-lowest');
const OUT = flag('out', 'public/pixelart/agents/inhabitants');
const AS = flag('as', 'idle');
const DIRS = flag('dirs', 'south-east,south-west,north-east,north-west').split(',');
if (!NAME || !CHAR_ID) { console.error('usage: node scripts/fetchAgentIdle.mjs <name> <charId> [--match=idle] [--pick=<prise>]'); process.exit(1); }

const RX = /animations\/([^/]+)\/(south-east|south-west|north-east|north-west)(?:-([0-9a-f]{8}))?\/frame_(\d+)\.png$/i;
const at = (img, x, y) => (y * img.width + x) * 4;
// Téléchargement (avec ses réessais sur 423), ombre cuite (même critère que
// stripBakedShadow.mjs), palette et demi-bande : scripts/lib/pixellab.mjs et half.mjs.

const buf = await downloadCharacterZip(CHAR_ID);
const byDir = Object.fromEntries(DIRS.map((d) => [d, []]));
const ALL4 = new Set(['south-east', 'south-west', 'north-east', 'north-west']);
const folders = new Set();
for (const e of new AdmZip(buf).getEntries()) {
  const m = e.entryName.match(RX);
  if (!m) continue;
  folders.add(m[1]);
  if (!MATCH.test(m[1])) continue;
  const dk = m[2].toLowerCase();
  if (byDir[dk] && ALL4.has(dk)) byDir[dk].push({ take: m[3] || '', f: +m[4], data: e.getData() });
}
console.log('animations du zip :', [...folders].join(', '));
for (const d of DIRS) {
  const takes = [...new Set(byDir[d].map((e) => e.take))];
  if (takes.length > 1) {
    if (!PICK || !takes.includes(PICK)) throw new Error(`${d} : ${takes.length} prises (${takes.join(', ')}) — --pick=<id>`);
    byDir[d] = byDir[d].filter((e) => e.take === PICK);
  }
  if (byDir[d].length < 2) throw new Error(`${d} : ${byDir[d].length} image(s) d'attente — animation pas prête ?`);
}
for (const d of DIRS) {
  const tag = d.replace('-', '');
  const walk = path.join(OUT, `${NAME}-${tag}.png`);
  if (!fs.existsSync(walk)) throw new Error('bande de marche absente : ' + walk);
  const walkImg = PNG.sync.read(fs.readFileSync(walk));
  const pal = paletteOf(walkImg);
  let frames = byDir[d].sort((a, b) => a.f - b.f).map((e) => PNG.sync.read(e.data));
  if (TO_LOWEST) {
    const inkH = (img) => {
      let top = -1, bot = -1;
      for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) if (img.data[at(img, x, y) + 3] > 128) { if (top < 0) top = y; bot = y; }
      return bot - top;
    };
    let low = 0;
    frames.forEach((img, k) => { if (inkH(img) < inkH(frames[low])) low = k; });
    frames = frames.slice(0, low + 1);
  }
  // Au format de la marche (frames carrées de la hauteur de sa bande) : la première image
  // (la référence, debout) est calée pieds sur pieds et centre sur centre avec l'image 0
  // de la marche, et toutes les autres suivent le même décalage.
  const WH = walkImg.height;
  if (frames[0].height !== WH || frames[0].width !== WH) {
    const box = (img, w) => {
      let bot = -1, l = Infinity, r = -1;
      for (let y = 0; y < img.height; y += 1) {
        for (let x = 0; x < w; x += 1) if (img.data[at(img, x, y) + 3] > 128) { bot = y; l = Math.min(l, x); r = Math.max(r, x); }
      }
      return { bot, cx: (l + r + 1) / 2 };
    };
    const a = box(frames[0], frames[0].width), b = box(walkImg, WH);
    const dx = Math.round(b.cx - a.cx), dy = b.bot - a.bot;
    frames = frames.map((img) => {
      const o = new PNG({ width: WH, height: WH });
      for (let y = 0; y < img.height; y += 1) {
        for (let x = 0; x < img.width; x += 1) {
          const tx = x + dx, ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= WH || ty >= WH) continue;
          const si = at(img, x, y), di = at(o, tx, ty);
          for (let c = 0; c < 4; c += 1) o.data[di + c] = img.data[si + c];
        }
      }
      return o;
    });
    console.log(`  ${d} : canevas recadré au format de la marche (${WH}), décalage ${dx},${dy}`);
  }
  const fh = frames[0].height, n = frames.length;
  let shadow = 0, snapped = 0;
  for (const img of frames) {
    shadow += stripShadow(img);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] < 128) { img.data[i + 3] = 0; continue; }
      const c = nearest(pal, img.data[i], img.data[i + 1], img.data[i + 2]);
      if (c[0] !== img.data[i] || c[1] !== img.data[i + 1] || c[2] !== img.data[i + 2]) snapped += 1;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  const strip = assembleStrip(frames);
  const full = path.join(OUT, `${NAME}-${AS}-${tag}.png`);
  fs.writeFileSync(full, PNG.sync.write(strip));
  // Demi-bande : moyenne 2×2 pondérée par l'alpha, palette de la MARCHE, alpha binaire.
  fs.writeFileSync(full.replace('.png', '-half.png'), PNG.sync.write(bakeHalf(strip, { pal })));
  console.log(`${AS} ${NAME}-${AS}-${tag}.png ${strip.width}×${fh} (${n} images) · ombre retirée ${shadow} px · rabattus ${snapped} px`);
}
