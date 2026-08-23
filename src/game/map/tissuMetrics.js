/* ---------------------------------------------------------------------------
 * TISSU URBAIN — mesure du rapport voirie / bâti / vide.
 *
 * Ouvert avec le chantier « micmacs de routes » (docs/PLAN-TISSU-URBAIN.md, lot
 * L0). Raison d'être : le grief de Raph était visuel (« des gros micmacs de
 * routes ») et j'ai passé une séance entière à corriger le CONTRASTE des
 * chaussées avant de mesurer la MAILLE. Le contraste était un vrai défaut, mais
 * il ne pouvait pas être la cause : une cellule-route est intégralement minérale
 * (demi-chaussée 0,25 × 2 + trottoir 0,22 × 2 = 0,94 de cellule), donc avec des
 * îlots d'une cellule la voirie occupe les trois quarts du sol par ARITHMÉTIQUE.
 * Aucune texture ne rattrape ça. Tant qu'on ne mesure pas, chaque lot du plan se
 * juge à l'œil et on se raconte des histoires.
 *
 * Ce module est PUR (aucun Canvas, aucun CM) : il prend un layout et rend des
 * nombres. Molette `window.__tissu()` côté runtime, gardes dans
 * __tests__/tissuMetrics.test.js.
 *
 * Périmètre de mesure = `urbanSet`, le SOL DE VILLE — pas la grille entière ni
 * le roadSet complet. Une route qui part vers la campagne traverse de l'herbe :
 * la compter gonflerait la part de voirie d'un tissu qui n'existe pas.
 * ------------------------------------------------------------------------- */

// La MATIÈRE d'une cellule vide est décidée par le renderer (lot L2) : on
// importe SA règle au lieu de la recopier ici. Un tableau de bord qui rejouerait
// le calcul qu'il surveille ne surveillerait que lui-même.
import { courField } from './iso/isoTissu.js';
// Le compteur de clôtures appelle le VRAI module de pose, pas une copie de sa règle
// (cf. fenceCount plus bas) — une mesure déduite d'une réplique dériverait en silence.
import { fenceEdges, fenceInputs, FENCE } from './fenceEdges.js';

// Médiane d'un tableau de nombres (copie triée ; les tableaux d'entrée sont des
// longueurs de runs, quelques milliers d'éléments au pire).
function median(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(list, q) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/**
 * Mesure le tissu d'un layout.
 *
 * @param {object} L layout (`urbanSet`, `roadSet`, `roadMap`, `tiles`, `gridN`)
 * @returns {object} compteurs, parts, maille, distribution des rangs, îlots
 */
export function tissuMetrics(L) {
  const urban = (L && L.urbanSet) || new Set();
  const roadSet = (L && L.roadSet) || new Set();
  const roadMap = (L && L.roadMap) || new Map();
  const N = (L && L.gridN) | 0;

  // Empreintes bâties : une tuile occupe spanX × spanY cellules (même formule
  // que le trim et le sol de ville, cf. layout.js).
  const builtSet = new Set();
  for (const t of (L && L.tiles) || []) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) {
      for (let ay = 0; ay < sy; ay += 1) builtSet.add((t.gx + ax) + ',' + (t.gy + ay));
    }
  }

  // ── Comptage par cellule de SOL DE VILLE ───────────────────────────────────
  // Priorité route > place > bâti > vide : une cellule ne compte qu'une fois, et
  // ce qu'on voit d'une cellule-route c'est la route (le bâti ne s'y pose pas,
  // mais une empreinte de moteur peut border et une place vit dans le roadSet).
  let road = 0, plaza = 0, built = 0, free = 0;
  const rankCount = {};
  for (const k of urban) {
    if (roadSet.has(k)) {
      const c = roadMap.get(k);
      const rank = (c && c.rank) || 'secondary';
      rankCount[rank] = (rankCount[rank] || 0) + 1;
      if (rank === 'plaza') plaza += 1; else road += 1;
      continue;
    }
    if (builtSet.has(k)) built += 1;
    else free += 1;
  }
  const cells = road + plaza + built + free;
  const share = (n) => (cells ? n / cells : 0);

  // ── MAILLE : combien de cellules entre deux rues ───────────────────────────
  // On balaie chaque ligne puis chaque colonne du sol de ville et on relève la
  // longueur des RUNS de cellules non-route. Un run BORDÉ des deux côtés par une
  // route est un intervalle de maille ; un run qui touche le bord du tissu ne
  // l'est pas (il est tronqué par la lisière, pas par une rue) et fausserait la
  // médiane vers le haut. Le pas = run + 1 (la rue elle-même).
  const runs = [];
  const scan = (get) => {
    let run = 0, bounded = false;
    for (let i = 0; i < N; i += 1) {
      const st = get(i);                       // 0 hors ville, 1 route, 2 libre
      if (st === 1) {
        if (bounded && run > 0) runs.push(run);
        run = 0; bounded = true;               // une route ouvre un intervalle borné
      } else if (st === 2) {
        run += 1;
      } else {
        run = 0; bounded = false;              // sortie du tissu : l'intervalle ne compte pas
      }
    }
  };
  const stateAt = (gx, gy) => {
    const k = gx + ',' + gy;
    if (!urban.has(k)) return 0;
    return roadSet.has(k) ? 1 : 2;
  };
  for (let gy = 0; gy < N; gy += 1) scan((gx) => stateAt(gx, gy));
  for (let gx = 0; gx < N; gx += 1) scan((gy) => stateAt(gx, gy));
  const runMedian = median(runs);

  // ── ÎLOTS : composantes connexes (4-connexité) de cellules non-route ───────
  // C'est LA signature du micmac : une ville dont la moitié des îlots fait une
  // seule cellule n'a pas de pâtés de maisons, elle a des plots. La part d'îlots
  // d'une cellule dit directement combien de fusions le lot L1 aura à faire.
  const seen = new Set();
  const sizes = [];
  for (const k of urban) {
    if (roadSet.has(k) || seen.has(k)) continue;
    let n = 0;
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop();
      n += 1;
      const c = cur.indexOf(',');
      const gx = +cur.slice(0, c), gy = +cur.slice(c + 1);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (gx + dx) + ',' + (gy + dy);
        if (seen.has(nk) || !urban.has(nk) || roadSet.has(nk)) continue;
        seen.add(nk);
        stack.push(nk);
      }
    }
    sizes.push(n);
  }
  const single = sizes.reduce((a, s) => a + (s === 1 ? 1 : 0), 0);

  // ── MATIÈRES VUES À L'ÉCRAN ────────────────────────────────────────────────
  // Les compteurs ci-dessus décrivent le LAYOUT ; ils ne bougent pas d'un iota
  // quand on change la matière d'un lot vide. Or c'est précisément ce que le lot
  // L2 fait, et c'est ce que le joueur voit. On ventile donc les mêmes cellules
  // selon la matière que le renderer leur donnera : la nappe minérale (voirie +
  // bâti + devants de parcelle encore pavés), la cour de terre, la friche.
  const cf = courField(urban, builtSet);
  let cour = 0, friche = 0, videPave = 0;
  for (const k of urban) {
    if (roadSet.has(k) || builtSet.has(k)) continue;
    const kind = cf.get(k);
    if (kind === 'dirt') cour += 1;
    else if (kind === 'grass') friche += 1;
    else videPave += 1;
  }

  // ── TAILLE DES TACHES ─────────────────────────────────────────────────────
  // Le grief de Raph sur la v1 du sol : « le retour des multiples petits carrés
  // de sol entre les routes ». Une part de cour de 10 % peut être un beau
  // faubourg d'un seul tenant ou 364 confettis d'une cellule — les parts ne les
  // distinguent pas, la taille des taches si. C'est CE nombre que le lot doit
  // faire baisser, et il ne se voit dans aucun autre indicateur.
  const patchSizes = { dirt: [], grass: [] };
  const vus = new Set();
  for (const start of urban) {
    if (vus.has(start)) continue;
    const kd = cf.get(start);
    if (kd !== 'dirt' && kd !== 'grass') continue;
    const comp = [start];
    vus.add(start);
    for (let i = 0; i < comp.length; i += 1) {
      const c = comp[i].indexOf(',');
      const gx = +comp[i].slice(0, c), gy = +comp[i].slice(c + 1);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (gx + dx) + ',' + (gy + dy);
        if (vus.has(nk) || !urban.has(nk) || cf.get(nk) !== kd) continue;
        vus.add(nk);
        comp.push(nk);
      }
    }
    patchSizes[kd].push(comp.length);
  }
  const patchStat = (a) => ({
    n: a.length,
    median: median(a),
    // Part de taches minuscules : c'est le confetti, littéralement.
    tinyShare: a.length ? a.filter((v) => v <= 2).length / a.length : 0,
  });

  return {
    surfaces: {
      mineral: road + plaza + built + videPave,
      mineralShare: share(road + plaza + built + videPave),
      cour, courShare: share(cour),
      friche, fricheShare: share(friche),
      patches: { cour: patchStat(patchSizes.dirt), friche: patchStat(patchSizes.grass) },
    },
    cells,
    road, plaza, built, free,
    roadShare: share(road + plaza),
    builtShare: share(built),
    freeShare: share(free),
    maille: runMedian + 1,        // pas entre deux rues parallèles, en cellules
    runMedian,
    rankCount,
    blocks: {
      n: sizes.length,
      median: median(sizes),
      p90: quantile(sizes, 0.9),
      max: sizes.length ? Math.max(...sizes) : 0,
      singleShare: sizes.length ? single / sizes.length : 0,
    },
    fences: fenceCount(L),
  };
}

// ── CLÔTURES : le compteur AVANT la pose (lot L9) ───────────────────────────
// Exigence du plan, mot pour mot : « Un compteur avant de livrer. "Ça alourdit" ne se
// teste pas, "tant de panneaux à l'écran" si. Compteur dans __tissu() et plafond dur,
// pour qu'une ère future ne puisse pas en faire pousser dix mille sans que ça se voie. »
//
// On appelle le VRAI module de pose (`fenceEdges`), jamais une réplique de sa règle :
// le but est de savoir ce que la pose produira, pas ce qu'on croit qu'elle produira.
//
// ⚠ LES ENTRÉES VIENNENT DE `fenceInputs`, JAMAIS D'UNE COPIE LOCALE. Première
// version écrite : un `matOf(gx, gy)` recopié ici. Or `fenceEdges` appelle
// `matOf(clé)` avec UNE CHAÎNE — le `gx + ',' + gy` local rendait donc
// « 11,83,undefined », introuvable partout, et la fonction répondait 'grass' pour
// TOUTE cellule. Le compteur ne voyait alors que les arêtes touchant l'EAU (l'eau est
// testée avant `matOf`) et manquait entièrement les parvis de merveille, c'est-à-dire
// l'étape 1 de l'ordre de pose. Une seule définition, partagée avec la pose.
function fenceCount(L) {
  let edges;
  try {
    edges = fenceEdges(fenceInputs(L)) || [];
  } catch { return { n: 0, cap: FENCE.cap, parCote: {}, erreur: true }; }
  const parCote = {};
  for (const e of edges) {
    const s = e.side || '?';
    parCote[s] = (parCote[s] || 0) + 1;
  }
  return { n: edges.length, cap: FENCE.cap, atteintLePlafond: edges.length >= FENCE.cap, parCote };
}

/** Rendu texte d'une mesure, pour la molette et les journaux. */
export function tissuReport(m) {
  const pc = (v) => (v * 100).toFixed(1) + ' %';
  const ranks = Object.entries(m.rankCount).sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${r} ${n}`).join('  ');
  return [
    `sol de ville      ${m.cells} cellules`,
    `  voirie          ${pc(m.roadShare)}  (${m.road} rues + ${m.plaza} places)`,
    `  bâti            ${pc(m.builtShare)}  (${m.built})`,
    `  vide            ${pc(m.freeShare)}  (${m.free})`,
    `à l'écran         minéral ${pc(m.surfaces.mineralShare)} · cour ${pc(m.surfaces.courShare)} · friche ${pc(m.surfaces.fricheShare)}`,
    `taches            cour ${m.surfaces.patches.cour.n} (médiane ${m.surfaces.patches.cour.median}, ${pc(m.surfaces.patches.cour.tinyShare)} minuscules)`,
    `                  friche ${m.surfaces.patches.friche.n} (médiane ${m.surfaces.patches.friche.median}, ${pc(m.surfaces.patches.friche.tinyShare)} minuscules)`,
    `maille            ${m.maille} cellules entre deux rues`,
    `îlots             ${m.blocks.n} — médiane ${m.blocks.median}, p90 ${m.blocks.p90}, max ${m.blocks.max}`,
    `  d'une cellule   ${pc(m.blocks.singleShare)}`,
    `rangs             ${ranks}`,
    `clôtures L9       ${m.fences.n} arêtes qualifiées${m.fences.atteintLePlafond ? ' ⚠ PLAFOND ATTEINT' : ''}`
      + `  (plafond ${m.fences.cap})`
      + (Object.keys(m.fences.parCote).length
        ? '  · ' + Object.entries(m.fences.parCote).sort((a, b) => b[1] - a[1])
          .map(([s, n]) => s + ' ' + n).join(' ')
        : ''),
  ].join('\n');
}
