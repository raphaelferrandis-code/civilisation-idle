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
npm run dist-win   # build + packaging Windows (electron-builder)
```

Le process principal Electron est `main.cjs`. Il sert les fichiers via le protocole
`app://` (indispensable au chargement des sprites pixel-art), pas `file://`.

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
