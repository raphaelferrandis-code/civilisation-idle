# Civilisation: Effondrement Idle

Jeu idle de civilisation, crises, ruines, héritages et mythes, porté sur React avec Vite.

## Commandes

```bash
npm run dev        # serveur de dev Vite
npm run build      # build de production (dist/)
npm run lint       # ESLint
npm test           # suite Vitest (vitest run)
npm run preview    # prévisualise le build
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

## Tests & CI

- `npm test` exécute la suite Vitest (golden économique, parité Decimal, hydratation
  save, Grand Reset, chronique, procédural…).
- L'intégration continue (`.github/workflows/ci.yml`) rejoue lint + tests + build à
  chaque push et pull request.

## Structure

- `src/components` : interface React.
- `src/game/core` : état, boucle de jeu, actions et mécaniques.
- `src/game/data` : bâtiments, upgrades, mythes et données de monde.
- `src/game/map` : runtime canvas de la carte de cité, découpé par responsabilité (`layout`, agents, rendu monde, rendu bâtiments).
- `public/audio` : musique de fond.

## Crédits

Les ressources externes (packs de sprites et d'icônes) et leurs licences sont listées dans
[CREDITS.md](CREDITS.md).

## Notes

La carte de cité n'est plus chargée depuis `public/js` par injection de scripts. Elle est importée depuis `src/game/map` et montée par `CityMapCanvas`.
