# Effondrement Idle

*Collapse Idle* en anglais. Jeu idle de civilisation, crises, ruines, héritages et mythes, porté sur React avec Vite.

## Commandes

```bash
npm run dev        # serveur de dev Vite
npm run build      # build de production (dist/)
npm run lint       # ESLint
npm test           # suite Vitest (vitest run)
npm run preview    # prévisualise le build
npm run zip:web    # archive de dist/ pour un hébergeur statique (scripts/zipDist.mjs)
```

## Application desktop (Electron)

```bash
npm run electron   # lance l'app Electron sur le build courant (dist/)
npm run dist-win   # build + installeur Windows NSIS (electron-builder)
npm run dist-steam # build + DOSSIER win-unpacked, celui que SteamPipe téléverse
```

Le process principal Electron est `main.cjs`. Il sert les fichiers via le protocole
`app://` (indispensable au chargement des sprites pixel-art), pas `file://`.

- **La partie** vit dans `%APPDATA%\civilisation-effondrement` (dossier figé par
  `main.cjs` : ne jamais changer `name` dans package.json ni l'hôte `app://localhost`) :
  le localStorage de Chromium, plus une copie en fichier, `saves\save.json` (écriture
  atomique, précédente en `.bak`) — c'est elle que Steam Auto-Cloud synchronise
  (racine WinAppDataRoaming, sous-dossier `civilisation-effondrement/saves`, motif
  `save.json`). Fenêtre : `window.json` ; journal : `logs\civilisation.log`.
- ⚠ `npm run electron` utilise ce MÊME dossier que l'.exe installé : la vraie partie.
  Pour essayer sans y toucher : `CE_USER_DATA=<dossier temporaire>`.
- `.exe` empaqueté : ni menu, ni DevTools, ni zoom de page. `CIV_DEVTOOLS=1` (ou
  `--devtools`) rouvre les DevTools pour mesurer.
- Sécurité : page dans le bac à sable (`sandbox: true`), Content-Security-Policy
  posée par le protocole `app://` (`APP_CSP`, `desktopFiles.cjs`), aucune permission
  du navigateur sauf l'écriture du presse-papiers. Tout accès disque (save en
  fichier, fichier nuage Google Drive, export) passe par le process principal.
- Lancé par Steam (`SteamAppId` / `SteamGameId` présents) : drapeaux de l'overlay
  (`in-process-gpu`, `disable-direct-composition`) ; `--no-steam-overlay` les retire.
- **Version Steam** (lancée par Steam, ou build `npm run dist-steam`, qui injecte
  `civSteamBuild` dans le package.json empaqueté) : pas de miroir Google Drive, Steam
  Cloud transporte `saves\save.json`. L'.exe hors Steam garde le miroir.
- La cité **vit fenêtre réduite ou couverte** (`backgroundThrottling: false`) : seul
  le rendu de la carte s'arrête quand la fenêtre est réduite. Le crédit hors-ligne ne
  vaut que pour une vraie fermeture ou une veille. Le navigateur, lui, traite toujours
  un onglet caché comme une absence.

## Tests & CI

- `npm test` exécute la suite Vitest (golden économique, parité Decimal, hydratation
  save, Grand Reset, chronique, procédural…). Un localStorage en mémoire, vidé avant
  chaque test, y est posé par `src/test/setup.js`.
- `npm run test:parcours` ajoute le harnais de parcours (`src/game/core/__tests__/parcours/`) :
  un joueur scripté joue une partie complète sous horloge virtuelle, du premier feu
  au titre final (NaN, aller-retour de sauvegarde, rechargements, hors-ligne,
  blocages), puis les Mythes de l'Acte III depuis une save figée, en doctrine de
  crise automatique et en « ask ». Une dizaine de secondes ; hors de `npm test`
  (seule sa version courte, `parcoursCourt.test.js`, y tourne). Réglages par
  variables d'environnement (en tête de `parcours.test.js`) ; `PC_OUT=<dossier>`
  y garde journaux et saves des jalons.
- L'intégration continue (`.github/workflows/ci.yml`) rejoue lint + tests + build à
  chaque push et pull request.

## Molettes de dev (`window.__…`)

Les réglages, interrupteurs d'A/B, sondes et harnais de capture exposés à la console
(`window.__x`, `globalThis.__x`) n'existent que sous `npm run dev` et sous Vitest.
Règle unique : chacun est gardé par `import.meta.env?.DEV`, sa définition comme ses
lectures. Le build de production remplace ce drapeau par `false` et en retire le code :
aucune molette dans `dist/` ni dans l'.exe, où le jeu suit toujours ses valeurs par
défaut.

Seule exception, une liste fermée : les profileurs bon marché de la sonde de perf
(`scripts/sondeGeste.js`, `docs/PERF-CARTE-REPRISE.md`), qui doivent pouvoir mesurer
dans l'.exe. La règle et la liste sont en tête de `src/game/map/devKnobs.js` ;
`src/game/map/__tests__/devKnobs.test.js` refuse toute molette qui en sort.

## Structure

- `src/components` : interface React.
- `src/game/core` : état, boucle de jeu, actions et mécaniques.
- `src/game/data` : bâtiments, upgrades, mythes et données de monde.
- `src/game/map` : la carte de cité en canvas 2D isométrique. `layout.js` (disposition
  de la ville), `cityMapRuntime.js` (boucle, caméra, entrées), `agents.js` (habitants
  et véhicules), `cityEngineSprites.js` (scènes des bâtiments-moteur) et le peintre
  iso dans `iso/` : `isoRenderer.js` orchestre plus de 120 modules (sol en
  pyramide de tuiles, collecte et peinture des items triés, fleuve, ports, places…).
  Contrats et pièges : [ARCHITECTURE.md](ARCHITECTURE.md).
- `src/assets/musiques/` : les musiques (un fichier par piste ; mode d'emploi dans
  son `LISEZMOI.md`). `public/pixelart/` : les sprites (le build les recompresse sans
  perte dans `dist/`, `public/` n'est jamais touché).
- `scripts/` : l'outillage (art, sortie web, planches, retouches) — familles, usages et
  conventions dans [scripts/README.md](scripts/README.md). Harnais d'équilibrage à la
  racine : `bench-*.js`, `simulate-ce.js`, `sim-10-profils.js` ; les rapports des bancs
  sont versionnés dans `docs/bench/`.
- `docs/` : les plans de chantier, classés (actifs, clos mais de référence, archivés)
  dans [docs/README.md](docs/README.md). Les passations et audits périmés de la
  racine sont dans `docs/archive/`.

## Crédits

Les ressources externes (packs de sprites et d'icônes) et leurs licences sont listées dans
[CREDITS.md](CREDITS.md).
