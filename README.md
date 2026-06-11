# Civilisation: Effondrement Idle

Jeu idle de civilisation, crises, ruines, héritages et mythes, porté sur React avec Vite.

## Commandes

```bash
npm run dev
npm run build
npm run lint
```

## Structure

- `src/components` : interface React.
- `src/game/core` : état, boucle de jeu, actions et mécaniques.
- `src/game/data` : bâtiments, upgrades, mythes et données de monde.
- `src/game/map` : runtime canvas de la carte de cité, découpé par responsabilité (`layout`, agents, rendu monde, rendu bâtiments).
- `public/audio` : musique de fond.

## Notes

La carte de cité n'est plus chargée depuis `public/js` par injection de scripts. Elle est importée depuis `src/game/map` et montée par `CityMapCanvas`.
