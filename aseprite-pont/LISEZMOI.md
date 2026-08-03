# Kit de retouche du pont (Aseprite)

Deux fichiers à retoucher : `bridge-bois-ne.png` (ponts nord-sud, le cas courant)
et `bridge-bois-nw.png` (ponts est-ouest). Ouvre le pont dans Aseprite, puis
importe le `guide-*.png` correspondant comme CALQUE au-dessus (même taille de
canvas) — tu le masques/supprimes avant d'enregistrer.

## Les guides

- **Ligne CYAN** : l'axe au sol du pont (la pente iso exacte, 2 px à droite =
  1 px plus haut). Les deux bouts du pont doivent continuer de toucher cette
  ligne là où ils la touchent aujourd'hui.
- **Ligne MAGENTA** : la ligne idéale de la rambarde AVAL (celle du bas).
  Dessine la lisse dessus, en escalier régulier 2:1 — c'est ce qui la rendra
  parfaitement droite.
- **Traits VERTS** : les bornes de la bande du milieu. Le moteur RÉPÈTE tel
  quel ce qui est entre les deux traits pour allonger le pont : le dessin au
  bord droit doit prolonger exactement celui du bord gauche (mêmes hauteurs de
  planches et de lisses aux deux bornes → aucune couture visible en jeu).
- **Traits JAUNES** : positions de poteaux suggérées (pas 15/15/16 px : le
  motif boucle pile sur la bande répétée). Tu peux t'en écarter tant que les
  poteaux DANS la bande verte gardent un espacement qui boucle.

## Ce qui est verrouillé (le moteur en dépend)

1. La TAILLE du canvas (ne pas recadrer, ne pas décaler l'ensemble).
2. Les DEUX POINTS D'APPUI au sol (là où chaque bout touche la ligne cyan).
3. Les deux traits verts : la bande entre eux doit rester auto-raccordable.

Tout le reste (planches, teintes de la palette du fichier, lisses, poteaux,
petits détails) est à toi. Poteaux : verticaux stricts, c'est ce qui rend le
mieux en iso.

## Quand tu as fini

Enregistre par-dessus les deux PNG de CE dossier (pas ceux de
`public/pixelart/iso/` — le script de préparation les écraserait) et dis-le
moi : je rebranche (extraction du calque garde-corps aval qui passe devant
les habitants + palette + pose en jeu), et on vérifie ensemble en capture.
