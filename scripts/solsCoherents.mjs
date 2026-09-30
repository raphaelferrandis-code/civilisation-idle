// solsCoherents.mjs — la BIBLE DES SURFACES appliquée aux PNG de sol (2026-10-01,
// docs/PLAN-MAQUETTE-VIVANTE.md, lot « sols et routes »).
//
// Deux gestes, jamais un remap de palette (refus consigné : −33 % de chroma) :
//
//   equalize <clé> [r,g,b]   GAIN PAR CANAL de chaque variante vers un ton commun
//                            (la médiane des variantes par défaut). Le dessin ne
//                            bouge pas, seule la valeur s'aligne. C'est le geste de
//                            fetchGroundTiles (« la variété doit venir du DESSIN, pas
//                            de la valeur ») que le béton et la dalle tech n'avaient
//                            jamais reçu : leurs variantes allaient de L105 à L155
//                            (béton) et de L49 à L73 (tech) — posées au hasard, un
//                            DAMIER clair/sombre sur toute la ville (audit du
//                            2026-10-01, bandes 6 à 9).
//
//   shift <clé> r,g,b [k]    DÉCALAGE par canal : chaque pixel garde son écart au ton
//                            moyen (× k, pour calmer le grain), autour du NOUVEAU ton.
//                            Sert aux dallages de place, qui doivent être la version
//                            claire de la matière du quartier (§ bible) et non une
//                            autre pierre : le médiéval sortait bleu-gris et PLUS
//                            SOMBRE que la rue (L117 contre 137), l'industriel noir
//                            (L91 dans une ville à L176), le cosmique blanc (L225 sur
//                            un sol à L61).
//
// Les originaux partent dans --backup=<dossier> (obligatoire) avant toute écriture.
// Usage : node scripts/solsCoherents.mjs <geste> <clé> [args] --backup=<dossier>
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const DIR = 'public/pixelart/iso';
const args = process.argv.slice(2);
const backup = (args.find((a) => a.startsWith('--backup=')) || '').slice(9);
const [geste, key, a1, a2] = args.filter((a) => !a.startsWith('--'));
if (!geste || !key || !backup) {
  console.error('usage : <equalize|shift> <clé> [r,g,b] [k] --backup=<dossier>');
  process.exit(1);
}

const files = [];
for (let v = 1; v <= 4; v += 1) {
  const f = path.join(DIR, `${key}-${v}.png`);
  if (fs.existsSync(f)) files.push(f);
}
if (!files.length) { console.error('aucune variante pour', key); process.exit(1); }

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const meanOf = (p) => {
  const s = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < p.width * p.height; i += 1) {
    if (p.data[i * 4 + 3] < 128) continue;
    for (let c = 0; c < 3; c += 1) s[c] += p.data[i * 4 + c];
    n += 1;
  }
  return s.map((x) => x / n);
};
const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
const parse = (s) => s.split(',').map(Number);

const pngs = files.map((f) => ({ f, p: PNG.sync.read(fs.readFileSync(f)) }));
const means = pngs.map(({ p }) => meanOf(p));

let target;
if (geste === 'equalize') {
  if (a1) target = parse(a1);
  else {
    // Médiane PAR CANAL des tons des variantes : une variante extrême ne tire pas le lot.
    target = [0, 1, 2].map((c) => {
      const v = means.map((m) => m[c]).sort((x, y) => x - y);
      return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    });
  }
} else if (geste === 'shift') {
  if (!a1) { console.error('shift demande r,g,b'); process.exit(1); }
  target = parse(a1);
} else { console.error('geste inconnu', geste); process.exit(1); }
const k = geste === 'shift' && a2 ? Number(a2) : 1;

fs.mkdirSync(backup, { recursive: true });
pngs.forEach(({ f, p }, idx) => {
  const b = path.join(backup, path.basename(f));
  if (!fs.existsSync(b)) fs.copyFileSync(f, b);   // la PREMIÈRE version reste la référence
  const m = means[idx];
  for (let i = 0; i < p.width * p.height; i += 1) {
    if (p.data[i * 4 + 3] < 128) continue;
    for (let c = 0; c < 3; c += 1) {
      const v = p.data[i * 4 + c];
      p.data[i * 4 + c] = geste === 'equalize'
        ? clamp(v * (target[c] / Math.max(1, m[c])))
        : clamp(target[c] + (v - m[c]) * k);
    }
  }
  fs.writeFileSync(f, PNG.sync.write(p));
  const after = meanOf(p);
  console.log(`${path.basename(f)}  L${lum(m).toFixed(0)} → L${lum(after).toFixed(0)}  (${after.map((x) => x.toFixed(0)).join(',')})`);
});
console.log(`${geste} ${key} → cible ${target.map((x) => x.toFixed(0)).join(',')}${k !== 1 ? ` · écarts ×${k}` : ''}`);
