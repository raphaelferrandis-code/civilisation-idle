import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `.claude/worktrees` = copies de travail jetables de l'agent (gitignorées) ;
  // sans cette exclusion ESLint les relint et gonfle le compte d'erreurs ×3.
  globalIgnores(['dist', 'scratch', 'scratchpad', '.claude', 'simulate-game.js', 'simulate-ce.js', 'sim-idle-*.js', 'bench-myths.js', 'bench-rupture.js', 'bench-temple.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Outillage Node : process principal Electron, scripts de build/génération
    // et simulateur `sim-10-profils.js` — tournent sous Node (require, process,
    // __dirname, setImmediate...), pas dans le navigateur. Sans ce bloc ils sont
    // soit non lintés (.mjs/.cjs invisibles à la config `.js/.jsx`), soit criblés
    // de faux `no-undef`.
    files: ['**/*.{mjs,cjs}', 'main.cjs', 'scripts/**/*.js', 'sim-10-profils.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // vite.config.js s'execute dans Node (Buffer, process...), pas dans le navigateur.
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
])
