# Sprites isométriques — dépôt des PNG

Le moteur iso (`src/game/render/iso/isoScene.js`) charge automatiquement les sprites
depuis ce dossier. **Si le PNG existe, il s'affiche ; sinon, boîte greybox de secours.**
Aucune liste à tenir à jour : c'est le nom du fichier qui fait le branchement.

## Convention de nommage

```
<famille>_t<palier>.png      ex. market_t2.png, temple_t4.png
```

- **familles** (15) : `food`, `granary`, `farm`, `market`, `craft`, `mill`, `port`,
  `mint`, `bank`, `knowledge`, `temple`, `observatory`, `civic`, `aqueduct`, `watchtower`
- **paliers** (5) : `t1` primitif · `t2` antique/marchand · `t3` impérial · `t4`
  industriel · `t5` cosmique

(À venir, même mécanique : `ground_t<n>.png`, `water_t<n>.png`.)

## Spécifications (calées sur le code)

| Paramètre | Valeur |
|---|---|
| Tuile de sol | losange **128×64** (`TILE_W`/`TILE_H` dans `isoProjection.js`) |
| Empreinte | **1 tuile** (la silhouette peut déborder au-dessus, l'assise = 1 case) |
| Vue | iso 2:1, **vue de 3/4 plongée** |
| Lumière | **haut-gauche**, cohérente sur tous les sprites |
| Ancre | **bas-centre** (le pied posé sur la pointe basse du losange) |
| Format | **PNG transparent** (32 bits) |
| Style visé | pixel art propre, pierre antique + accents or, palette sombre |

> Échelle : le moteur dessine à l'échelle native × `SPRITE_SCALE` (=1 par défaut dans
> `isoScene.js`). On ajuste `SPRITE_SCALE` une fois le premier vrai sprite vu en jeu.
