# Paliers des moulins — sources, plus livrées

Les quatre « grands » des moulins (`mill-prop-house-grand`, `mill-house-stone-grand`,
`mill-house-roman-grand`, `mill-house-industrial-grand`) étaient des paliers de halle
(spanSum 6) de la scène moteur `water_mills` de `cityEngineSprites.js`. Cette scène
n'était plus atteinte depuis que les moulins sont cuits par le code (`iso/isoMill.js`) :
seule la molette `__millTune({ on: false })` y menait encore.

À l'audit du 05/10 (MORT-2), Raph a fait retirer les replis procéduraux des
bâtiments-moteur et les familles inatteignables : la branche des moulins est partie,
avec `blitPropRot` et `propPivot`, et ces paliers ont quitté le manifeste
`PALIER_SPANSUM` (`src/game/map/spriteScale.js`). Les images restent ici comme source.
