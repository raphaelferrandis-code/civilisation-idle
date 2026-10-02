# Plan — Les étages de la ville

> Fait foi pour le chantier « relief » rouvert le 2026-10-01. Planche de proposition
> validée par Raph : https://claude.ai/artifact/96r6NSAc8ciSSR9NsVxxdk
> (« je suis d'accord avec tout », 2026-10-02 ; « tout est validé, mets tout en place,
> un lot à la fois »).

## 1. La thèse

Dans ce moteur, le relief qui lit bien n'est pas **sous** la ville, il est **au-dessus**.
Le terrain par case (`isoTerrain.js`, `TERRAIN.amp`) a été re-testé le 2026-10-01 sur
les bandes 0, 1 et 4 (réglages validés du 24/08, puis `cityK 0`, puis hors ville
seulement) : murs bruns, piliers sous les places, taches grises en tissu dense ; hors
de la ville il ne se voit plus et son ombrage salit l'eau. **Le moteur n'a aucun art
pour les pentes.** On ne rallume pas le terrain sous les maisons.

À la place, **chaque ère ajoute un étage** — une structure posée sur des piles ou un
trafic en l'air, peu de lignes, nettes, triées par le peintre comme un bâtiment :

| Bande | Étage | Lot |
|---|---|---|
| B0–B4 | rien de neuf (le sol, le fleuve ; pont, places, merveilles existants) | — |
| B5 | métro aérien sur viaduc de fer, le long du quai | 3 |
| B6 | autoroute surélevée au-dessus de l'artère du pont, échangeur | 2 |
| B7 | monorail (jade), premiers taxis volants à basse altitude | 1 (taxis), 3 (monorail) |
| B8 | deux couloirs aériens, jetpacks | 1 |
| B9 | ciel à trois étages ; quartier flottant au-dessus du fleuve | 1, 4 |
| chute | les étages tombent en premier | 4 |

## 2. Décisions de Raph (2026-10-02)

1. Direction validée ; le terrain sous les maisons est abandonné.
2. On commence par le ciel.
3. **Ombre au sol** sous les véhicules volants : oui.
4. Le plan de ville peut **réserver du terrain** aux viaducs et à l'échangeur.
5. Téléphérique : accepté dans le principe (« d'accord avec tout ») — en dernier.

**Superposition métro / autoroute** (question de Raph) : dans les maquettes les deux
prenaient le boulevard du quai. Règle : **le métro longe le quai de la rive OPPOSÉE au
cœur** (il ne cache jamais la place centrale) ; **l'autoroute suit l'artère du pont**,
perpendiculaire au fleuve, au sol près du cœur puis surélevée en s'éloignant du
centre. Ils ne se croisent qu'en tête de pont, à des hauteurs différentes.

Règle tirée de la maquette B6 : **une structure haute ne passe jamais devant la place
centrale** (la fontaine était intacte, mais cachée derrière le viaduc).

## 3. Architecture

- `iso/isoElevated.js` — le point d'entrée unique : rassemble les acteurs de tous les
  étages (`elevatedActors(now)`). Branché à UN endroit de la collecte
  (`isoLiveCollect.js`, kind `'elev'`) et UN endroit de la peinture
  (`isoLivePaint.js`, l'acteur se dessine lui-même). Même contrat que la petite vie :
  `{ wx, wy, d?, draw(ctx, now) }`, trié à son aplomb au sol.
- La hauteur passe par le 3ᵉ axe : `worldToScreen(wx, wy, wz)`.
- La lumière de nuit passe par `lightCtx` (`lightLayer.js`) : déposée pendant la passe
  vivante, posée après le voile, découpée par ce qui est devant.
- Tout ce qui se répète (véhicules, ombres, traînées) est **cuit** en petites images
  par (bande, sorte, axe, sens, zoom) : un blit par objet et par frame.

## 4. Lots

### Lot 1 — Le ciel (B7–B9) · `iso/isoSkyTraffic.js`
Couloirs fixes **au-dessus des grandes rues droites** (jamais au travers d'une tour :
une voiture dont le pied tombe dans une emprise sauterait d'avant en arrière du
bâtiment). Axes x et y à des **hauteurs différentes** (pas de croisement à niveau).
B7 : peu de taxis bas ; B8 : deux hauteurs + jetpacks ; B9 : trois hauteurs, plus
dense. Pur `f(now)`, aucun état. Ombre au sol décalée vers le soleil. Nuit : phares,
feux, traînée courte, balises de couloir. Densité × santé de la cité (`CM.healthF`).
Molette `__skyTraffic({ on, density, shadow, trails, beacons, jets })`.

### Lot 2 — L'autoroute (B6+) · `procedural/highwayPlan.js` + `iso/isoHighway.js`
**Plan (pur, au layout)** : le tablier couvre l'artère du pont (colonnes `ax`, `ax+1`),
sur chaque rive : au sol près de l'eau (`farStart` 6 cases — le futur métro du quai) et
au-delà de la place centrale (`coreGap` 3 cases après elle), rampe de 8 cases (5 au
plus court), tablier plein à 1,75 tuile, redescente avant la **lisière** (première
rangée sans bâtiment tenu de part et d'autre de l'artère, à 5 rangées près). Il ne prend
aucun terrain. **L'échangeur** (deux boucles de 270°, « trèfle partiel ») se pose sur la
rive au plus long tablier, à une rue transversale qui arrive des deux côtés de l'artère
(à 4 cases au plus : la rue est prolongée jusqu'à elle). Ses deux pelouses (4×4) entrent
dans la réserve de la ville (herbe, jamais bâties) ; les bâtiments qui y tenaient leur
place sont relogés une fois. Choix **figé** dans `s.cityCore.highway` (`sign`, `dy` en
repère du centre). Publié : `L.highway`.
**Dessin** : tronçons d'une demi-cellule, deux acteurs chacun (dessus trié au coin
arrière, tranche au coin avant), piles en T sur le terre-plein (triées SOUS le dessus),
lampadaires sur l'axe, ombre au sol ; matière par ère (béton B6, jade B7, nacre et or
B8, cristal B9 — rives allumées la nuit aux ères cosmiques). Circulation : vraies
voitures de l'ère (`drawIsoVehicle` + `vehSkinFor`) soulevées à la hauteur du tablier.
Molette `__highway({ on, cars, lamps, shadow })`.
⚠ Les voitures de la grille continuent de rouler AU SOL sur l'artère, sous le tablier :
c'est voulu (l'avenue reste en dessous), mais elles y passent dans l'ombre.
### Lot 3 — Métro (B5) et monorail (B7) · à venir
### Lot 4 — Quartier flottant (B9) et ruines verticales · à venir

## 5. Journal

- 2026-10-02 — plan écrit, lot 1 ouvert.
- 2026-10-02 — lot 1 commité en local (`030ae68`). Coût mesuré en rendu logiciel (B9,
  240 véhicules) : ~0 de jour, +4 ms de nuit. Pièges : la boîte monde d'un écran iso est
  un losange deux fois trop grand (trier les candidats À L'ÉCRAN avant le plafond) ; les
  plus longues lignes droites sont les routes de CAMPAGNE (filtrer par `urbanSet`).
- 2026-10-02 — lot 2. Pièges : un chevêtre trié à l'aplomb de l'axe se peignait SUR la
  chaussée (le trier sous le dessus) ; `organicLimit` couvre toute la grille, la lisière
  se lit aux bâtiments tenus ; les maisons bordent l'artère, les rues transversales
  s'arrêtent 1-2 cases avant elle (les prolonger au lieu d'exiger qu'elles la touchent).
