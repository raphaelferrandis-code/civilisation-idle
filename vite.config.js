import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

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

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), previewShotPlugin(), gameFullReloadPlugin()],
  // `.claude/worktrees` = copies de travail jetables de l'agent (gitignorées) ;
  // sans cette exclusion Vitest ré-exécute leurs suites → tests en triple et
  // échec golden compté plusieurs fois (portes non déterministes en local).
  test: { exclude: [...configDefaults.exclude, '**/.claude/**'] },
})
