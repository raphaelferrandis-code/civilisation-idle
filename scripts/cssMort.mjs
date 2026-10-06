/**
 * CSS MORT — les règles qui ne peuvent viser aucun élément.
 * ---------------------------------------------------------------------------
 * Le relevé du 05/10 a trouvé ≈370 règles mortes (≈42 Ko minifiés, ≈11 % du CSS
 * principal) : les anciennes UI des Augures, d'Icare, de l'ancienne boutique et
 * de l'ancienne vue Cité, qui se lisaient comme vivantes (audit du 2026-10-05,
 * MORT-7). Elles ont été retirées ; ce relevé, gardé comme garde-fou (cf.
 * src/styles/__tests__/cssMort.test.js), empêche qu'elles se réaccumulent.
 *
 * Une règle est MORTE quand CHAQUE sélecteur de sa liste exige une classe, un id
 * ou un attribut data-* qu'aucun fichier de prod (src/ hors tests, index.html)
 * ne nomme. Le relevé est volontairement PRUDENT — il ne crie jamais « mort »
 * sur ce qu'il ne peut pas prouver :
 * - un nom cité n'importe où (même dans un commentaire) compte comme posé ;
 * - une classe qui commence par un préfixe dynamique (`foo-${x}`, `'foo-' + x`)
 *   ou finit par un suffixe dynamique (`${x}--on`) compte comme posée ;
 * - le contenu des pseudo-classes fonctionnelles (:not, :is, :where, :has…) est
 *   ignoré : `.a:not(.b)` ne meurt pas de l'absence de `.b`.
 * Seule exception, sans risque : un argument mort d'une liste :is()/:where()
 * (`.app :is(.vive, .morte)`) est relevé comme un sélecteur mort de liste — la
 * règle vit par les autres, lui traîne.
 *
 * Il relève aussi les @keyframes jamais nommés (ni par une règle, ni par le JS)
 * et les propriétés personnalisées écrites mais jamais lues, ou lues mais jamais
 * écrites (la valeur de repli s'applique alors toujours — STRUCT-14).
 *
 * Usage : `node scripts/cssMort.mjs` (liste, code de sortie 1 s'il y a du mort).
 * postcss est fourni par Vite (dépendance directe de vite).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function lister(dir, filtre, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) lister(p, filtre, out);
    else if (filtre(p)) out.push(p);
  }
  return out;
}

// Un « mot » au sens des sélecteurs : lettres (latines accentuées comprises, mais
// pas × ÷ ni la ponctuation typographique — « foo— » doit encore donner « foo »),
// chiffres, `_` et `-`. Chercher une classe = chercher ce mot ENTIER dans le texte
// de prod. Sans le drapeau `u` : 10 fois plus rapide sur ~10 Mo de sources.
const L = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F';
const C = `${L}0-9_-`;
const MOT = new RegExp(`[${C}]+`, 'g');
const PREFIXE_GABARIT = new RegExp(`([${L}_][${C}]*[-_])\\$\\{`, 'g');            // foo-${x}
const PREFIXE_CONCAT = new RegExp(`['"\`]([${L}_][${C}]*[-_])['"\`]\\s*\\+`, 'g'); // 'foo-' + x
const SUFFIXE_GABARIT = new RegExp(`\\}([-_][${C}]*[${L}0-9])`, 'g');            // ${x}--on
const SUFFIXE_CONCAT = new RegExp(`\\+\\s*['"\`]([-_][${C}]*[${L}0-9])['"\`]`, 'g'); // x + '--on'
const CLASSE = new RegExp(`\\.(-?[${L}_][${C}]*)`, 'g');
const ID = new RegExp(`#(-?[${L}_][${C}]*)`, 'g');

// data-foo-bar ↔ dataset.fooBar
const enCamel = (attr) => attr.replace(/^data-/, '').replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Ce que nomment les fichiers de prod : mots, préfixes et suffixes dynamiques. */
function lireProd(racine) {
  const fichiers = lister(path.join(racine, 'src'), (p) => /\.(jsx?|tsx?|html)$/.test(p) && !/__tests__|\.test\./.test(p));
  const html = path.join(racine, 'index.html');
  if (fs.existsSync(html)) fichiers.push(html);
  const mots = new Set();
  const prefixes = new Set();
  const suffixes = new Set();
  for (const f of fichiers) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.match(MOT) || []) mots.add(m);
    for (const m of t.matchAll(PREFIXE_GABARIT)) prefixes.add(m[1]);
    for (const m of t.matchAll(PREFIXE_CONCAT)) prefixes.add(m[1]);
    for (const m of t.matchAll(SUFFIXE_GABARIT)) suffixes.add(m[1]);
    for (const m of t.matchAll(SUFFIXE_CONCAT)) suffixes.add(m[1]);
  }
  return { mots, prefixes: [...prefixes], suffixes: [...suffixes] };
}

function nomme(nom, prod) {
  if (prod.mots.has(nom)) return true;
  return prod.prefixes.some((p) => nom.length > p.length && nom.startsWith(p))
    || prod.suffixes.some((s) => nom.length > s.length && nom.endsWith(s));
}

// Pseudo-classes fonctionnelles : leur contenu ne rend pas le sélecteur obligatoire.
const FONCTIONNELLES = /:(?:not|is|where|has|matches|any|-webkit-any|host|host-context|nth-child|nth-last-child)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g;

/** Ce qu'un sélecteur EXIGE : classes, ids, attributs data-*. */
function exigences(sel) {
  const s = sel.replace(FONCTIONNELLES, '');
  const attrs = [...s.matchAll(/\[\s*(data-[\w-]+)/g)].map((m) => m[1]);
  const sansAttr = s.replace(/\[[^\]]*\]/g, '');
  return {
    classes: [...sansAttr.matchAll(CLASSE)].map((m) => m[1]),
    ids: [...sansAttr.matchAll(ID)].map((m) => m[1]),
    attrs,
  };
}

/** Les noms absents de la prod qu'exige ce sélecteur ([] = vivant). */
function absents(sel, prod) {
  if (sel.includes('&')) return [];
  const { classes, ids, attrs } = exigences(sel);
  const out = [];
  for (const c of classes) if (!nomme(c, prod)) out.push('.' + c);
  for (const id of ids) if (!nomme(id, prod)) out.push('#' + id);
  for (const a of attrs) if (!nomme(a, prod) && !prod.mots.has(enCamel(a))) out.push('[' + a + ']');
  return out;
}

// Les listes « indulgentes » :is() / :where() : un argument mort ne tue pas la
// règle (les autres suffisent à la faire vivre), mais il traîne comme un
// sélecteur mort de liste — `.app :is(.vive, .morte)` garde `.morte` pour rien.
const LISTES = /:(?:is|where|matches|any|-webkit-any)\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g;

function scinder(liste) {
  const out = [];
  let prof = 0;
  let debut = 0;
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i];
    if (c === '(') prof++;
    else if (c === ')') prof--;
    else if (c === ',' && !prof) { out.push(liste.slice(debut, i)); debut = i + 1; }
  }
  out.push(liste.slice(debut));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Les arguments morts des :is()/:where() d'un sélecteur ([] = aucun). */
function argumentsMorts(sel, prod) {
  const out = [];
  for (const m of sel.matchAll(LISTES)) {
    const fn = m[0].slice(0, m[0].indexOf('('));
    for (const arg of scinder(m[1])) {
      const pourquoi = absents(arg, prod);
      if (pourquoi.length) out.push({ s: `${fn}(${arg})`, pourquoi });
    }
  }
  return out;
}

const dansKeyframes = (node) => {
  for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
  return false;
};

/**
 * Relève le CSS mort de src/ (`fichier` relatif à la racine, `ligne` 1-based) :
 * - regles      : règles dont TOUS les sélecteurs sont morts ;
 * - partielles  : sélecteurs morts dans une liste qui a encore un vivant ;
 * - keyframes   : @keyframes jamais nommés (ou nommés seulement par du mort) ;
 * - jetonsMuets : --propriétés écrites, jamais lues (ni CSS, ni JS) ;
 * - jetonsVides : --propriétés lues, jamais écrites (ni CSS, ni JS).
 */
export function analyserCss({ racine = RACINE } = {}) {
  const prod = lireProd(racine);
  const feuilles = lister(path.join(racine, 'src'), (p) => p.endsWith('.css'));
  const rel = (f) => path.relative(racine, f).replace(/\\/g, '/');
  const regles = [];
  const partielles = [];
  const animations = new Set();
  const keyframes = [];
  const ecrits = new Map();
  const lus = new Map();
  const noter = (map, nom, ou) => { if (!map.has(nom)) map.set(nom, []); map.get(nom).push(ou); };

  for (const f of feuilles) {
    const fichier = rel(f);
    const racineCss = postcss.parse(fs.readFileSync(f, 'utf8'), { from: f });
    racineCss.walkAtRules(/keyframes$/i, (at) => keyframes.push({ fichier, ligne: at.source.start.line, nom: at.params.trim() }));
    racineCss.walkRules((r) => {
      if (dansKeyframes(r)) return;
      const ligne = r.source.start.line;
      const juges = r.selectors.map((s) => ({ s: s.trim(), pourquoi: absents(s, prod) }));
      const morts = juges.filter((x) => x.pourquoi.length);
      const vivante = morts.length < r.selectors.length;
      if (!vivante) regles.push({ fichier, ligne, selecteurs: r.selectors, pourquoi: [...new Set(morts.flatMap((x) => x.pourquoi))] });
      else {
        // Sélecteurs morts de la liste, plus les arguments morts des :is()/:where()
        // de ses sélecteurs vivants.
        const trainants = [...morts, ...juges.filter((x) => !x.pourquoi.length).flatMap((x) => argumentsMorts(x.s, prod))];
        if (trainants.length) partielles.push({ fichier, ligne, morts: trainants.map((x) => x.s), pourquoi: [...new Set(trainants.flatMap((x) => x.pourquoi))] });
      }
      // Ce que lit ou anime une règle morte ne compte pas : une @keyframes ou une
      // --propriété nommée seulement par du mort est morte aussi.
      if (!vivante) return;
      r.walkDecls((d) => {
        const ou = `${fichier}:${d.source.start.line}`;
        if (d.prop.startsWith('--')) noter(ecrits, d.prop, ou);
        for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) noter(lus, m[1], ou);
        if (/^(?:-webkit-)?animation(?:-name)?$/.test(d.prop)) for (const m of d.value.match(MOT) || []) animations.add(m);
      });
    });
  }

  return {
    regles,
    partielles,
    keyframes: keyframes.filter((k) => !animations.has(k.nom) && !prod.mots.has(k.nom)),
    jetonsMuets: [...ecrits].filter(([n]) => !lus.has(n) && !prod.mots.has(n)).map(([nom, ou]) => ({ nom, ou })),
    jetonsVides: [...lus].filter(([n]) => !ecrits.has(n) && !prod.mots.has(n)).map(([nom, ou]) => ({ nom, ou })),
  };
}

/** Une ligne lisible par trouvaille, rangée par catégorie. */
export function formaterCss(r) {
  return {
    regles: r.regles.map((x) => `${x.fichier}:${x.ligne}  ${x.selecteurs.join(', ').slice(0, 120)}  ⇐ ${x.pourquoi.join(' ')}`),
    partielles: r.partielles.map((x) => `${x.fichier}:${x.ligne}  ${x.morts.join(' | ').slice(0, 160)}  ⇐ ${x.pourquoi.join(' ')}`),
    keyframes: r.keyframes.map((x) => `${x.fichier}:${x.ligne}  @keyframes ${x.nom}`),
    jetonsMuets: r.jetonsMuets.map((x) => `${x.nom}  écrit en ${x.ou.join(' ')}`),
    jetonsVides: r.jetonsVides.map((x) => `${x.nom}  lu en ${x.ou.join(' ')}`),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let total = 0;
  for (const [titre, liste] of Object.entries(formaterCss(analyserCss()))) {
    total += liste.length;
    console.log(`\n== ${titre} (${liste.length}) ==`);
    for (const l of liste) console.log(l);
  }
  process.exitCode = total ? 1 : 0;
}
