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

### Lot 2 — L'autoroute (B6+) · à venir
### Lot 3 — Métro (B5) et monorail (B7) · à venir
### Lot 4 — Quartier flottant (B9) et ruines verticales · à venir

## 5. Journal

- 2026-10-02 — plan écrit, lot 1 ouvert.
