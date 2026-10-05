import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { optimizeDistPngs } from './scripts/build/optimizeDistPngs.mjs'
import { stampServiceWorker } from './scripts/build/stampServiceWorker.mjs'
// Fichiers de travail de public/ (README, .aseprite, _orig, palettes…) retirés de
// dist/ AVANT les finitions ci-dessous (audit 2026-10-05, ASSET-7).
import { pruneWorkFilesPlugin } from './scripts/build/pruneWorkFiles.mjs'

// Plugin DEV-ONLY (harnais de vérification visuelle) : reçoit un PNG en
// POST /__shot?name=xxx et l'écrit dans .preview-shots/<name>.png. Le navigateur
// POST la frame capturée par window.__cityShot — le base64 ne transite jamais
// ailleurs, on relit juste le fichier. Aucun effet en build de production.
function previewShotPlugin() {
  return {
    name: 'preview-shot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const m = (req.originalUrl || req.url || '').match(/[?&]name=([A-Za-z0-9_-]+)/);
        const name = (m ? m[1] : 'shot').slice(0, 60);
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          try {
            const buf = Buffer.concat(chunks);
            const dir = join(process.cwd(), '.preview-shots');
            await mkdir(dir, { recursive: true });
            const out = join(dir, name + '.png');
            await writeFile(out, buf);
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, bytes: buf.length, file: out }));
          } catch (e) {
            res.statusCode = 500;
            res.end(String((e && e.message) || e));
          }
        });
      });
    }
  };
}

// Plugin DEV-ONLY : FULL RELOAD sur tout edit d'un module de src/game/.
// Ces modules sont des SINGLETONS : l'objet `state`, le Set de listeners, les
// intervalles de la boucle de jeu, la boucle rAF de la carte. Un hot-update
// partiel en crée un SECOND exemplaire — Vite ré-évalue le module édité et ses
// importateurs jusqu'au boundary React, si bien que les composants se
// rebranchent sur le NOUVEAU `state` pendant que la boucle de jeu (main.js, non
// re-évaluée) continue de tourner sur l'ANCIEN. Deux parties vivent alors en
// parallèle, et les gestes des dialogues tombent dans le vide : « Réinitialiser
// la partie » efface une copie morte, la vraie partie revient intacte à la
// sauvegarde suivante. Même piège côté carte, où la boucle rAF de
// cityMapRuntime capture les fonctions de rendu à l'init : le composant se
// re-rend mais l'ANCIEN code de rendu tourne toujours en silence (« mon edit ne
// se voit pas »). NB : import.meta.hot.decline() est un no-op dans Vite moderne
// — d'où ce plugin serveur.
function gameFullReloadPlugin() {
  return {
    name: 'game-full-reload',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      if (file.includes('/src/game/') && !file.includes('__tests__')) {
        server.ws.send({ type: 'full-reload' });
        return []; // stoppe la propagation HMR normale
      }
    }
  };
}

// Plugin BUILD-ONLY : finitions de dist/, une fois tout écrit (public/ compris).
// Un plugin et non un « && node … » dans le script npm : `dist-win` appelle
// `vite build` directement, il y aurait échappé (audit 2026-10-05, ASSET-1).
//   1) Recompression SANS PERTE des PNG (palette indexée quand ≤ 256 couleurs) :
//      ~24 Mo de sprites RVBA → ~5 Mo, pixels décodés identiques, contrôlés un
//      par un (scripts/build/pngRecompress.mjs). public/ n'est jamais touché.
//   2) Date le service worker par l'empreinte de dist/ (WEB-1) — APRÈS les PNG,
//      dont les octets entrent dans l'empreinte.
// Dans `npm run build` / `dist-win` uniquement : jamais en dev ni sous Vitest.
// `order: 'post'` : DERNIER des closeBundle (Rolldown les enchaîne dans l'ordre),
// donc sur le dist/ définitif — après le tri des fichiers de travail, par exemple.
function distFinishPlugin() {
  let outDir = 'dist'
  let logger = console
  return {
    name: 'dist-finish',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      logger = config.logger
    },
    closeBundle: {
      order: 'post',
      async handler() {
        const png = await optimizeDistPngs(outDir)
        if (png.files) {
          const mo = (n) => (n / 1048576).toFixed(1)
          logger.info(`PNG sans perte : ${png.files} fichiers, ${mo(png.before)} → ${mo(png.after)} Mo (${(png.ms / 1000).toFixed(1)} s)`)
        }
        const id = stampServiceWorker(outDir)
        if (id) logger.info(`Service worker daté : ${id}`)
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), previewShotPlugin(), gameFullReloadPlugin(), pruneWorkFilesPlugin(), distFinishPlugin()],
  // NOTICES DE LICENCE (audit 2026-10-05, STEAM-5). La minification retire les
  // en-têtes « @license » de React, scheduler, break_infinity.js, pad-end : Vite
  // en regroupe les textes dans dist/licenses/THIRD-PARTY-LICENSES.md (MIT, à
  // livrer avec chaque copie). Les polices (OFL) et Font Awesome, qu'il ne voit
  // pas, ont leurs textes dans public/licenses/. L'onglet Crédits les affiche ;
  // l'.exe les pose aussi à côté du programme (package.json, build.extraFiles).
  // SEUIL D'AVERTISSEMENT DE TAILLE (audit 2026-10-05, PERF-67) : le moteur de
  // carte (chunk cityMapRuntime, ~1,1 Mo) ne se charge qu'avec la vue Cité — il
  // ne pèse plus sur le démarrage depuis que ContemplationBar ne l'importe plus.
  // Le seuil le laisse passer, et crie de nouveau si un chunk grossit au-delà.
  build: { license: { fileName: 'licenses/THIRD-PARTY-LICENSES.md' }, chunkSizeWarningLimit: 1200 },
  // Le serveur de dev ne surveille PAS les dossiers de travail des sessions :
  // `.preview-shots/` reçoit des captures en continu (harnais /__shot, planches),
  // et sous Windows un PNG encore verrouillé par son écrivain fait planter le
  // watcher (EBUSY → le serveur meurt, vu deux fois le 2026-10-02). La partie
  // ouverte ne charge alors plus ses images : sol en aplats de secours, habitants
  // retombés sur leurs vieilles bandes de face (retour Raph, ère 0).
  server: { watch: { ignored: ['**/.preview-shots/**', '**/.claude/**'] } },
  // `.claude/worktrees` = copies de travail jetables de l'agent (gitignorées) ;
  // sans cette exclusion Vitest ré-exécute leurs suites → tests en triple et
  // échec golden compté plusieurs fois (portes non déterministes en local).
  // `testTimeout` : la machine de la CI est 2 à 3 fois plus lente que le poste de
  // dev. Les gardes de carte qui génèrent plusieurs villes complètes (campLife,
  // sol urbain, placement…) y dépassaient les 5 s par défaut — deux runs rouges
  // (1259afa, 34fa75e : « Test timed out in 5000ms ») alors que tout passait ici.
  // C'est le SEUL délai : pas de délai propre par test, ni plus bas (il couperait
  // la marge de la CI), ni plus haut (un test bloqué retiendrait la CI des
  // minutes) — audit 2026-10-05, TEST-14.
  // `setupFiles` : un localStorage en mémoire, vidé avant chaque test (TEST-2) —
  // sans lui, chaque save() des tests passait par son chemin d'échec.
  test: { exclude: [...configDefaults.exclude, '**/.claude/**'], testTimeout: 30000, setupFiles: ['src/test/setup.js'] },
})
