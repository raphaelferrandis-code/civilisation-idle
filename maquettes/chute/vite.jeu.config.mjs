// Le JEU de ce worktree (la chute branchée pour de vrai), servi sur le port 62092.
// Même base que le jeu ; seule différence : la racine est le worktree, et la
// surveillance des fichiers est rétablie (la config de base ignore **/.claude/**).
import base from '../../vite.config.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const MAIN_NODE_MODULES = resolve(ROOT, '../../../node_modules');

export default {
  ...base,
  root: ROOT,
  cacheDir: resolve(HERE, '.vite-cache-jeu'),
  server: {
    ...(base.server || {}),
    port: 62092,
    strictPort: true,
    watch: { ignored: ['**/.preview-shots/**', '**/node_modules/**', '**/.vite-cache*/**', '**/maquettes/**'] },
    fs: { allow: [ROOT, MAIN_NODE_MODULES] },
    open: false,
  },
};
