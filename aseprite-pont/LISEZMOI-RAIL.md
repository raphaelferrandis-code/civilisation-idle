# Peindre toi-même le calque « devant les habitants »

Le jeu dessine le pont en deux images superposées, pixel-alignées :

1. `final-ne.png` / `final-nw.png` — LE PONT ENTIER (dessiné DERRIÈRE les
   habitants). Ne les modifie pas ici, c'est ta référence d'alignement.
2. `rail-ne.png` / `rail-nw.png` — LE CALQUE D'OCCLUSION : tout ce qui y est
   peint sera redessiné PAR-DESSUS les habitants qui traversent. Aujourd'hui
   il contient les poteaux aval + un liseré de tablier (raté). C'est CE
   fichier que tu reprends.

## Dans Aseprite

1. Ouvre `final-ne.png`, ajoute un calque au-dessus, glisses-y `rail-ne.png`
   (ou repars de zéro sur un calque vide).
2. Peins sur ce calque UNIQUEMENT ce qui doit masquer un habitant qui passe
   derrière : les poteaux du bas, et rien d'autre si tu veux voir les
   habitants entre eux. Tout le reste : transparent. Tu peux recopier les
   pixels du pont (pipette/sélection) — ce qui est peint aux deux endroits se
   superpose exactement.
3. Exporte CE CALQUE SEUL (le calque du pont masqué), même taille de canvas
   que `final-*.png` — ne recadre pas, ne décale pas.
4. Écrase `rail-ne.png` / `rail-nw.png` de ce dossier et dis-le moi : je les
   branche tels quels (plus aucune génération automatique par-dessus).

Règle d'or : ce calque est un DUPLICATA de pixels déjà présents dans le pont.
S'il est vide, les habitants passent devant tout ; ce que tu y peins repasse
devant eux. Impossible de trouer le pont avec — au pire un pixel mal placé
« flotte » au-dessus d'un habitant.
