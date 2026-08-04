// Audit d'echelle du grain (docs/PLAN-EGALISATION-GRAIN.md, lot G0).
//
//   node scripts/spriteScaleAudit.mjs inventory   → scripts/data/sprite-inventory.json
//   node scripts/spriteScaleAudit.mjs apparent    → scripts/data/sprite-apparent.json + table console
//
// `inventory` : scan mecanique (pngjs) de public/pixelart/houses/ et
// public/pixelart/agents/buildings/ — dimensions natives, bbox d'encre aux deux
// seuils du jeu (16 = contentBBox maisons, 40 = propBBox scenes), presence dans
// PROP_KEYS (extrait du source de cityEngineSprites.js), classe grossiere.
// `apparent` : croise l'inventaire avec scripts/data/sprite-annotations.json et
// les VRAIES formules d'echelle (houseScaleK importee de src/game/map/spriteScale.js)
// pour sortir les tailles APPARENTES @z=1 et la table des ecarts a la bande.
// Lecture seule sur les PNG ; n'ecrit que dans scripts/data/.
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { houseScaleK, HOUSE_LOT_WF, ENGINE_UNIT_F, TILE_REF, COSMIC_TOWER_H, PALIER_SPANSUM, palierHFrac } from '../src/game/map/spriteScale.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DATA = path.join(ROOT, 'scripts', 'data');
const HOUSES = path.join(ROOT, 'public', 'pixelart', 'houses');
const PROPS = path.join(ROOT, 'public', 'pixelart', 'agents', 'buildings');

function inkBBox(png, seuil) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > seuil) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// PROP_KEYS est du code JS, pas un manifest : on l'extrait du source. Garde G3 a
// prevoir : si la declaration bouge, cette regex casse BRUYAMMENT (throw).
function readPropKeys() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'game', 'map', 'cityEngineSprites.js'), 'utf8');
  const m = src.match(/const PROP_KEYS = \[([\s\S]*?)\];/);
  if (!m) throw new Error('PROP_KEYS introuvable dans cityEngineSprites.js');
  const keys = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (keys.length < 100) throw new Error(`PROP_KEYS suspect: ${keys.length} cles`);
  return keys;
}

function scanDir(dir, famille) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    out.push({
      key: f.replace(/\.png$/, ''),
      famille,
      w: png.width, h: png.height,
      ink16: inkBBox(png, 16),
      ink40: inkBBox(png, 40),
    });
  }
  return out;
}

function classify(e, propKeys) {
  if (e.famille === 'house') return /-cosmic-\d$/.test(e.key) ? 'house-cosmic' : 'house';
  if (e.key.endsWith('-half')) return 'strip-half';
  if (e.w >= 200 || e.w >= e.h * 3.5) return 'strip';
  if (!propKeys.has(e.key)) return 'orphelin';
  if (/^cosmic-|-cosmic-\d$/.test(e.key)) return 'prop-cosmic';
  return 'prop';
}

function inventory() {
  const propKeys = new Set(readPropKeys());
  const entries = [...scanDir(HOUSES, 'house'), ...scanDir(PROPS, 'engine')];
  for (const e of entries) e.classe = classify(e, propKeys);
  const manquants = [...propKeys].filter((k) => !entries.some((e) => e.key === k));
  fs.mkdirSync(DATA, { recursive: true });
  const out = { _doc: 'Genere par spriteScaleAudit.mjs inventory — ne pas editer a la main.', date: new Date().toISOString().slice(0, 10), entries, propKeysManquants: manquants };
  fs.writeFileSync(path.join(DATA, 'sprite-inventory.json'), JSON.stringify(out, null, 1));
  const parClasse = {};
  for (const e of entries) parClasse[e.classe] = (parClasse[e.classe] || 0) + 1;
  console.log('inventaire:', entries.length, 'PNG —', JSON.stringify(parClasse));
  if (manquants.length) console.log('PROP_KEYS sans PNG:', manquants.join(', '));
}

// ── apparent ────────────────────────────────────────────────────────────────
// Densite maisons @z=1 : k = houseScaleK(spanX, wpx, inkW) avec
// wpx = (spanX+spanY) * TILE_REF * HOUSE_LOT_WF (isoRenderer.js, boite-lot).
// Scenes moteur : drawH = hFrac * bw, bw = spanSum * TILE_REF * ENGINE_UNIT_F
// (fractions extraites statiquement, voir engine-fractions.json quand il existe).
const HOUSE_FOOTPRINT = { manor: [2, 2], tenement: [1, 2], tower: [1, 2], megablock: [2, 2], arcologyhome: [2, 2] };
const HOUSE_FOOTPRINT_COSMIC = { tower: [2, 2] };
function houseSpan(key) {
  const cosmic = /-cosmic-\d$/.test(key);
  const base = key.replace(/-cosmic-\d$/, '');
  const fp = (cosmic && HOUSE_FOOTPRINT_COSMIC[base]) || HOUSE_FOOTPRINT[base] || [1, 1];
  return { spanX: fp[0], spanY: fp[1] };
}

const BANDES = {
  'porte': [10, 14],
  'portail': [14, 22],
  'fenetre': [5, 9],
};

// ── fractions ───────────────────────────────────────────────────────────────
// Extraction STATIQUE des (wFrac, hFrac) des appels blitProp*/ des scenes
// moteur : la taille dessinee d'un prop est drawH = hFrac × cote de boite. On ne
// capture que les appels a cle ET fractions LITTERALES (les sites calcules sont
// listes 'dynamiques', a mesurer par __grainAudit en G1). Premiere occurrence
// par cle = usage principal.
function fractions() {
  const FICHIERS = ['cityEngineSprites.js', 'engineSprites.js'];
  const out = {}, dynamiques = [];
  const pose = (key, wf, hf, fichier, ligne) => {
    if (!out[key]) out[key] = { wFrac: wf, hFrac: hf, site: `${fichier}:${ligne}` };
  };
  for (const fichier of FICHIERS) {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'game', 'map', fichier), 'utf8');
    const lignes = src.split('\n');
    const re = /blitProp(?:Grounded)?\(ctx, ox, oy, sw, sh, ([^,]+), ([^,]+), ([^,]+), ([^,]+), ([^,)]+)\)/;
    lignes.forEach((l, i) => {
      const m = l.match(re);
      if (!m) return;
      const [, keyExpr, , , wf, hf] = m;
      // `0.7 * kP` : la fraction CALIBREE est le litteral ; le facteur en
      // variable est la compensation de palier (palierK), qui depend de la
      // boite reelle et n'entre pas dans la mesure de reference.
      const litFrac = (s) => Number(String(s).trim().replace(/\s*\*\s*[A-Za-z_$][\w$]*\s*$/, ''));
      const wNum = litFrac(wf), hNum = litFrac(hf);
      if (!Number.isFinite(hNum)) { dynamiques.push({ keyExpr: keyExpr.trim(), site: `${fichier}:${i + 1}`, hFrac: hf.trim() }); return; }
      const lit = keyExpr.trim().match(/^'([^']+)'$/);
      if (lit) { pose(lit[1], Number.isFinite(wNum) ? wNum : null, hNum, fichier, i + 1); return; }
      // Cle en ACCES DE TABLE (`RB4[id]`) : resoudre la table PAR SON NOM, ou
      // qu'elle soit declaree — se fier aux lignes voisines casse des qu'on
      // insere du code entre la table et son blit (vecu).
      const table = keyExpr.trim().match(/^([A-Za-z_$][\w$]*)\s*\[/);
      if (table) {
        const decl = src.match(new RegExp(`const ${table[1]}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
        if (decl) {
          const vals = [...decl[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
          if (vals.length) { for (const k of vals) pose(k, Number.isFinite(wNum) ? wNum : null, hNum, fichier, i + 1); return; }
        }
      }
      // Sinon : cles candidates dans les 8 lignes au-dessus (tableaux de stades
      // `['', 'a-b', ...]`, ternaires de cles). Toutes recoivent CES fractions —
      // c'est le meme appel.
      const contexte = lignes.slice(Math.max(0, i - 8), i + 1).join('\n');
      const cles = [...contexte.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)+)'/g)].map((x) => x[1])
        .filter((k) => !/^rgba?$/.test(k));
      if (cles.length) { for (const k of cles) pose(k, Number.isFinite(wNum) ? wNum : null, hNum, fichier, i + 1); }
      else dynamiques.push({ keyExpr: keyExpr.trim(), site: `${fichier}:${i + 1}`, hFrac: String(hNum), note: 'cle irresolue' });
    });
  }
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'engine-fractions.json'), JSON.stringify({
    _doc: 'Extraction statique des fractions blitProp (cityEngineSprites.js + engineSprites.js). Cles en variable resolues par les litteraux des 8 lignes precedentes ; sites a fractions calculees dans `dynamiques` — verite runtime via __grainAudit (G1).',
    entries: out, dynamiques,
  }, null, 1));
  console.log('fractions couvrant', Object.keys(out).length, 'cles — sites dynamiques:', dynamiques.length);
}

function apparent() {
  const inv = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-inventory.json'), 'utf8'));
  const annPath = path.join(DATA, 'sprite-annotations.json');
  if (!fs.existsSync(annPath)) { console.error('sprite-annotations.json absent — lancer le lot d annotation d abord'); process.exit(1); }
  const ann = JSON.parse(fs.readFileSync(annPath, 'utf8'));
  const invByKey = new Map(inv.entries.map((e) => [e.key, e]));
  const fracPath = path.join(DATA, 'engine-fractions.json');
  const fracByKey = fs.existsSync(fracPath)
    ? new Map(Object.entries(JSON.parse(fs.readFileSync(fracPath, 'utf8')).entries))
    : new Map();
  const rows = [];
  for (const a of ann.entries) {
    const e = invByKey.get(a.key);
    if (!e || a.nature !== 'batiment') continue;
    let dens = null, densNote = '';
    if (e.famille === 'house') {
      const { spanX, spanY } = houseSpan(a.key);
      const wpx = (spanX + spanY) * TILE_REF * HOUSE_LOT_WF;
      // spanY + clé : unité honnête iso et GRAIN_FIX (G1) — l'audit rapporte
      // donc le RÉSIDUEL après compensation, pas l'état d'avant.
      dens = houseScaleK(spanX, wpx, (e.ink16 || { w: e.w }).w, spanY, a.key);
      densNote = `lot ${spanX}x${spanY}`;
    } else if (e.famille === 'engine') {
      // drawH = hFrac × côté de boîte ; boîte = spanSum × T × 0.72 (jitter
      // 0,92-1,08 ignoré). Trois empreintes de référence : petit moteur 1×1
      // (spanSum 2), atelier 2×2 (spanSum 4, l'unité d'échelle des scènes),
      // halle max 5×5 (spanSum 10, SANS cap aux bandes ≥ 3). La densité du
      // tableau = celle de l'ATELIER ; les deux autres en colonnes.
      if (e.classe === 'prop-cosmic') {
        // Chemin dédié blitCosmicTower : drawH = H × boîte, ratio natif préservé.
        dens = (4 * TILE_REF * ENGINE_UNIT_F * COSMIC_TOWER_H) / e.h;
        densNote = `tour cosmique H=${COSMIC_TOWER_H}`;
      } else if (PALIER_SPANSUM[a.key]) {
        // PALIER : pose par blitProp lui-meme (pas d'appel litteral a extraire),
        // dans la boite pour laquelle il est CALIBRE et a sa hauteur de calibrage.
        const spanSum = PALIER_SPANSUM[a.key], hFrac = palierHFrac(a.key);
        dens = (spanSum * TILE_REF * ENGINE_UNIT_F * hFrac) / e.h;
        densNote = `palier spanSum ${spanSum}, hFrac ${hFrac}`;
      } else {
        const fr = fracByKey.get(a.key);
        const hFrac = fr ? fr.hFrac : 0.75;
        dens = (4 * TILE_REF * ENGINE_UNIT_F * hFrac) / e.h;
        densNote = fr ? `hFrac ${hFrac} (${fr.site || 'l.' + fr.ligne})` : 'hFrac 0.75 SUPPOSÉ (site dynamique)';
      }
    }
    if (dens == null) continue;
    const row = { key: a.key, famille: e.famille, densite: +dens.toFixed(3), densNote };
    if (e.famille === 'engine') {
      row.densPetit = +(dens / 2).toFixed(3);        // spanSum 2 = moitié de l'atelier
      row.densHalleMax = +(dens * 2.5).toFixed(3);   // spanSum 10 = 2,5 × l'atelier
    }
    for (const [champ, bande] of [['door', a.doorKind === 'portail' ? 'portail' : 'porte'], ['window', 'fenetre']]) {
      const r = a[champ];
      if (!r) continue;
      const app = r.h * dens;
      const [lo, hi] = BANDES[bande];
      row[champ] = { hSource: r.h, apparent: +app.toFixed(1), bande, ecart: app < lo ? +(app - lo).toFixed(1) : app > hi ? +(app - hi).toFixed(1) : 0 };
    }
    if (a.floorPitch) row.floorPitch = { source: a.floorPitch, apparent: +(a.floorPitch * dens).toFixed(1) };
    rows.push(row);
  }
  rows.sort((x, y) => Math.abs((y.door?.ecart) || 0) - Math.abs((x.door?.ecart) || 0));
  fs.writeFileSync(path.join(DATA, 'sprite-apparent.json'), JSON.stringify({ _doc: 'Genere par spriteScaleAudit.mjs apparent — ne pas editer a la main.', habitantApparent: 10, bandes: BANDES, rows }, null, 1));
  console.log('cle | densite | porte app (ecart) | fenetre app (ecart)');
  for (const r of rows) {
    console.log(`${r.key} | ${r.densite} | ${r.door ? r.door.apparent + ' (' + r.door.ecart + ')' : '-'} | ${r.window ? r.window.apparent + ' (' + r.window.ecart + ')' : '-'}`);
  }
}

// ── merge ───────────────────────────────────────────────────────────────────
// Fusionne les paquets d'annotation (JSON par agent) en un seul
// scripts/data/sprite-annotations.json, avec validation stricte : cle connue de
// l'inventaire, rects DANS le canvas, hauteurs plausibles, pas de doublon.
const NATURES = new Set(['batiment', 'prop-sans-bati', 'infrastructure', 'vegetal', 'autre']);
function validRect(r, e, nom, erreurs) {
  if (r == null) return null;
  const ok = Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)
    && r.w >= 1 && r.h >= 2 && r.h <= 90
    && r.x >= 0 && r.y >= 0 && r.x + r.w <= e.w && r.y + r.h <= e.h;
  if (!ok) { erreurs.push(`${e.key}: ${nom} hors bornes ${JSON.stringify(r)} (canvas ${e.w}x${e.h})`); return null; }
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
}
function merge(dir) {
  const inv = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-inventory.json'), 'utf8'));
  const invByKey = new Map(inv.entries.map((e) => [e.key, e]));
  const entries = new Map();
  const erreurs = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(arr)) { erreurs.push(`${f}: pas un tableau`); continue; }
    for (let a of arr) {
      // Deux formes tolerees : {key: "x", ...} ou {"x": {...}} (paquets d'agents).
      if (!a.key) { const k = Object.keys(a)[0]; a = { key: k, ...a[k] }; }
      const e = invByKey.get(a.key);
      if (!e) { erreurs.push(`${f}: cle inconnue ${a.key}`); continue; }
      if (entries.has(a.key)) { erreurs.push(`${f}: doublon ${a.key}`); continue; }
      if (!NATURES.has(a.nature)) { erreurs.push(`${f}: nature invalide ${a.key}=${a.nature}`); continue; }
      entries.set(a.key, {
        key: a.key, nature: a.nature,
        door: validRect(a.door, e, 'door', erreurs),
        doorKind: a.door ? (a.doorKind === 'portail' ? 'portail' : 'porte') : null,
        window: validRect(a.window, e, 'window', erreurs),
        floorPitch: Number.isFinite(a.floorPitch) && a.floorPitch >= 2 && a.floorPitch <= 40 ? Math.round(a.floorPitch) : null,
        confidence: Number.isFinite(a.confidence) ? Math.max(0, Math.min(1, a.confidence)) : 0.5,
        note: String(a.note || '').slice(0, 120),
      });
    }
  }
  // Couverture attendue : maisons + props + cosmiques bande 7 (les bandes 8/9
  // partagent le gabarit, verifiees par echantillon en G3).
  const attendus = inv.entries.filter((e) =>
    e.classe === 'house' || e.classe === 'house-cosmic' || e.classe === 'prop'
    || (e.classe === 'prop-cosmic' && /-7$/.test(e.key)));
  const manquants = attendus.filter((e) => !entries.has(e.key)).map((e) => e.key);
  fs.writeFileSync(path.join(DATA, 'sprite-annotations.json'), JSON.stringify({
    _doc: 'Annotations portes/fenetres en px SOURCE, origine canvas haut-gauche. Fusion validee par spriteScaleAudit.mjs merge.',
    date: new Date().toISOString().slice(0, 10),
    entries: [...entries.values()].sort((a, b) => a.key.localeCompare(b.key)),
  }, null, 1));
  console.log(`fusion: ${entries.size} annotations, ${manquants.length} attendues manquantes, ${erreurs.length} erreurs`);
  for (const m of manquants) console.log('  manquant:', m);
  for (const er of erreurs) console.log('  ERREUR:', er);
}

// ── serie ───────────────────────────────────────────────────────────────────
// Chiffre le RESTE de la campagne des paliers (G2) : pour chaque famille de
// moteur, la plus grande empreinte que sa HALLE peut atteindre, et la taille
// de porte que ses sprites y prendraient. Une famille dont la halle plafonne a
// l'empreinte 2 (= l'atelier) n'a besoin d'AUCUN palier.
//
// L'empreinte max est LUE dans layout.js (cmEngineFootprint n'est pas
// exportee) : chaque regle y est un `if (id === "x" ...) return a : b : c;`.
// On parse les nombres du return — derive de la source, jamais recopie.
const FAMILLES = {
  'forager-': 'foragers', 'granary-': 'granaries_city', 'caravan-': 'caravans',
  'market-': 'markets', 'guild-': 'guilds', 'field-': 'irrigated_fields',
  'port-': 'river_ports', 'mill-': 'mills', 'mint-': 'mint_houses',
  'bank-': 'imperial_exchanges', 'exchange-': 'imperial_exchanges',
  'storyteller-': 'storytellers', 'scribes-': 'scribes', 'schools-': 'schools',
  'academies-': 'academies', 'cult-': 'ancestral_cult', 'ancestralcult-': 'ancestral_cult',
  'observatories-': 'observatories', 'libraries-': 'libraries', 'universities-': 'universities',
  'printing-': 'printing_houses', 'think-': 'think_tanks', 'aqueduct-': 'aqueducts',
  'watch-': 'watch', 'ministries-': 'ministries', 'courthouses-': 'courthouses',
  'bureau-': 'bureaucracy', 'works-': 'public_works', 'archive-': 'archive_grids',
  'ruins-': 'ruin_architects', 'sewers-': 'sewers', 'cosmic-': '(cosmique)',
};
function empreintesMax() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'game', 'map', 'layout.js'), 'utf8');
  const m = src.match(/function cmEngineFootprint\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('cmEngineFootprint introuvable dans layout.js');
  const parId = {};
  let defaut = null;
  for (const ligne of m[1].split('\n')) {
    const ret = ligne.match(/return ([^;]+);/);
    if (!ret) continue;
    const nombres = [...ret[1].matchAll(/(?:^|[^\w.])(\d+)(?=\s*(?::|;|$))/g)].map((x) => +x[1]);
    if (!nombres.length) continue;
    const max = Math.max(...nombres);
    const ids = [...ligne.matchAll(/id === "([^"]+)"/g)].map((x) => x[1]);
    if (ids.length) for (const id of ids) parId[id] = max;
    else if (/^\s*return/.test(ligne)) defaut = max;
  }
  if (defaut == null) throw new Error('defaut de cmEngineFootprint non trouve');
  return { parId, defaut };
}
function serie() {
  const { parId, defaut } = empreintesMax();
  const inv = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-inventory.json'), 'utf8'));
  const ann = JSON.parse(fs.readFileSync(path.join(DATA, 'sprite-annotations.json'), 'utf8'));
  const fr = JSON.parse(fs.readFileSync(path.join(DATA, 'engine-fractions.json'), 'utf8')).entries;
  const invByKey = new Map(inv.entries.map((e) => [e.key, e]));
  const parFamille = new Map();
  for (const a of ann.entries) {
    const e = invByKey.get(a.key);
    if (!e || e.famille !== 'engine' || a.nature !== 'batiment' || !a.door) continue;
    if (PALIER_SPANSUM[a.key]) continue;                       // c'est un palier
    if (invByKey.has(a.key + '-grand')) continue;              // son palier existe deja
    // Les sprites COSMIQUES ne passent pas par blitProp mais par
    // blitCosmicTower (H = 1,72 de la boite, ratio natif) : la substitution de
    // palier ne les touche pas, ils sont hors campagne.
    if (e.classe === 'prop-cosmic') continue;
    if (a.key === 'granary-horreum-classical' && invByKey.has('granary-horreum-grand')) continue;
    const pref = Object.keys(FAMILLES).find((p) => a.key.startsWith(p));
    if (!pref) continue;
    const id = FAMILLES[pref];
    const foot = parId[id] != null ? parId[id] : defaut;
    const hFrac = fr[a.key] ? fr[a.key].hFrac : 0.75;
    const dens = (2 * foot * TILE_REF * ENGINE_UNIT_F * hFrac) / e.h;
    const app = a.door.h * dens;
    const [lo, hi] = a.doorKind === 'portail' ? BANDES.portail : BANDES.porte;
    const ecart = app < lo ? app - lo : app > hi ? app - hi : 0;
    if (!parFamille.has(id)) parFamille.set(id, { id, foot, sprites: [] });
    parFamille.get(id).sprites.push({ key: a.key, app: +app.toFixed(1), ecart: +ecart.toFixed(1) });
  }
  const rows = [...parFamille.values()].map((f) => {
    const hors = f.sprites.filter((s) => s.ecart !== 0);
    return { ...f, hors: hors.length, pire: hors.length ? Math.max(...hors.map((s) => Math.abs(s.ecart))) : 0 };
  }).sort((a, b) => b.pire - a.pire);
  const aFaire = rows.filter((r) => r.foot >= 3 && r.hors > 0);
  const saines = rows.filter((r) => r.foot < 3 || r.hors === 0);
  console.log(`FAMILLES A TRAITER : ${aFaire.length} — sprites de palier a produire : ${aFaire.reduce((s, r) => s + r.hors, 0)}`);
  for (const r of aFaire) {
    console.log(`  ${r.id} (empreinte max ${r.foot}) — ${r.hors} sprite(s), pire ecart ${r.pire}`);
    for (const s of r.sprites.filter((x) => x.ecart !== 0).sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))) {
      console.log(`      ${s.key} → ${s.app} px apparents (ecart ${s.ecart})`);
    }
  }
  console.log(`\nFAMILLES SANS RIEN A FAIRE : ${saines.length}`);
  for (const r of saines) console.log(`  ${r.id} (empreinte max ${r.foot}${r.foot < 3 ? ', plafonne a l atelier' : ', deja en bande'})`);
}

const cmd = process.argv[2];
if (cmd === 'serie') serie();
else if (cmd === 'inventory') inventory();
else if (cmd === 'fractions') fractions();
else if (cmd === 'apparent') apparent();
else if (cmd === 'merge' && process.argv[3]) merge(process.argv[3]);
else { console.error('usage: node scripts/spriteScaleAudit.mjs inventory|fractions|apparent|merge <dir>'); process.exit(1); }
