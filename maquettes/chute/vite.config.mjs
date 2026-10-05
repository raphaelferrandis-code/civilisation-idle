// MAQUETTE « LA CHUTE » — serveur à part, port 62090.
//
// Sert le VRAI jeu (racine = ce worktree) avec une régie par-dessus. Aucun fichier
// de src/ n'est modifié : les quelques crochets dont la maquette a besoin sont
// INJECTÉS EN MÉMOIRE au moment où Vite sert le module (plugin `chute-hooks`).
// Chaque crochet est un appel `globalThis.__chuteX?.(…)` : sans régie, il ne fait
// rien et le jeu se comporte exactement comme l'original.
import base from '../../vite.config.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const MAIN_NODE_MODULES = resolve(ROOT, '../../../node_modules');
const CACHE = process.env.CHUTE_VITE_CACHE || resolve(HERE, '.vite-cache');

// [fichier, ancre exacte (doit apparaître UNE fois), texte inséré APRÈS l'ancre]
const HOOKS = [
  ['src/game/map/pixelHouses.js',
    'export function drawPixelHouse(t, x, y, w, h) {\n  const g = pixelHouseGeom(t, x, y, w, h);\n  if (!g) return null;\n',
    '  { const __h = globalThis.__chuteHouse; if (__h) { const __r = __h(t, g, CM.ctx); if (__r !== undefined) return __r; } }\n'],
  ['src/game/map/iso/isoEngineScene.js',
    '  const aNow = engineAnimNow(t, now);\n',
    '  { const __h = globalThis.__chuteEngine; if (__h) { const __r = __h(t, bx, by, bw, now, aNow, ctx); if (__r !== undefined) return __r; } }\n'],
  ['src/game/map/iso/isoRenderer.js',
    'export function drawIsoWorld(dt, now) {\n',
    '  { const __c = globalThis.__chuteClock; if (__c) { const __o = __c(dt, now); dt = __o.dt; now = __o.now; } }\n'],
  ['src/game/map/iso/isoRenderer.js',
    '  if (!CM.lodActive) drawCitizenThoughts(now);\n',
    '  { const __p = globalThis.__chutePost; if (__p) __p(CM.ctx, now); }\n'],
  ['src/game/map/iso/isoLiveCollect.js',
    '  return items;\n}',
    null, // remplacé : appel AVANT le return
  ],
  ['src/game/map/iso/isoLivePaint.js',
    '    if (glPending && !it._gl) glCompose();\n',
    "    if (it.kind === 'chute') { const __pt = globalThis.__chutePaint; if (__pt) __pt(ctx, it, now); continue; }\n"],
];

function chuteHooks() {
  return {
    name: 'chute-hooks',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.split('\\').join('/').split('?')[0];
      let out = code, touched = false;
      for (const [file, anchor, insert] of HOOKS) {
        if (!norm.endsWith('/' + file)) continue;
        const n = out.split(anchor).length - 1;
        if (n !== 1) throw new Error(`[chute-hooks] ancre ${JSON.stringify(anchor.slice(0, 50))} trouvée ${n}× dans ${file}`);
        if (insert === null) {
          out = out.replace(anchor, '  { const __cc = globalThis.__chuteCollect; if (__cc) __cc(items, { T, L, b, band, dvVis, z, eraIdx }, now); }\n' + anchor);
        } else {
          out = out.replace(anchor, anchor + insert);
        }
        touched = true;
      }
      return touched ? { code: out, map: null } : null;
    },
    // La page du jeu, servie à la racine (les chemins relatifs des sprites le
    // supposent), reçoit la régie de la maquette.
    transformIndexHtml(html) {
      return html
        .replace('<title>Civilisation: Effondrement Idle</title>', '<title>Maquette — la Chute</title>')
        .replace('</body>', '  <script type="module" src="/maquettes/chute/chute.js"></script>\n  </body>');
    },
  };
}

export default {
  ...base,
  root: ROOT,
  cacheDir: CACHE,
  plugins: [chuteHooks(), ...(base.plugins || [])],
  server: {
    ...(base.server || {}),
    port: 62090,
    strictPort: true,
    // Le worktree vit sous .claude/ : la config de base y couperait toute
    // surveillance. On surveille, sauf captures et dépendances.
    watch: { ignored: ['**/.preview-shots/**', '**/node_modules/**', '**/.vite-cache/**'] },
    fs: { allow: [ROOT, MAIN_NODE_MODULES] },
    open: false,
  },
};
