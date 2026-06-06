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
- `src/game/citymap` : runtime canvas de la carte de cité, importé comme module React.
- `public/audio` : musique de fond.

## Notes

La carte de cité n'est plus chargée depuis `public/js` par injection de scripts. Elle est importée depuis `src/game/citymap` et montée par `CityMapCanvas`.
