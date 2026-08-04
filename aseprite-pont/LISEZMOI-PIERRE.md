# Reprendre le pont de PIERRE (Aseprite)

Fichiers : `pierre-ne.png` (ponts nord-sud) et `pierre-nw.png` (est-ouest).
Ouvre-les et importe le `guide-pierre-*.png` correspondant comme calque
au-dessus (même canvas) ; tu le masques avant d'enregistrer.

## Les guides

- **CYAN** : la ligne de sol. Les deux bouts du pont doivent la toucher là où
  ils la touchent déjà — c'est elle qui pose l'ouvrage sur le terrain.
- **MAGENTA** : la hauteur de tablier VISÉE (celle de ton pont de bois). Le
  dessus du tablier de pierre devrait descendre à peu près à ce niveau : c'est
  ce qui rendra les rampes douces, puisque la pente c'est la hauteur divisée
  par la longueur.
- **VERT** : les deux bornes de la bande que le moteur RÉPÈTE pour allonger le
  pont. Ce qui est peint au bord droit doit prolonger exactement le bord
  gauche, sinon la couture se voit en jeu.

## Ce qui est verrouillé

1. La taille du canvas (ne pas recadrer, ne pas décaler l'ensemble).
2. Les deux points d'appui au sol (sur la ligne cyan).
3. La bande verte doit rester auto-raccordable.

Tout le reste est à toi : hauteur du tablier, longueur et pente des rampes,
appareillage, parapets, teintes.

## Quand tu as fini

Écrase `pierre-ne.png` / `pierre-nw.png` de CE dossier et dis-le moi. Je pose
tes fichiers tels quels (aucune retouche automatique), je remesure la hauteur
du tablier pour que piétons et attelages marchent dessus, et on vérifie en
capture.
