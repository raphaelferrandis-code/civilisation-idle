# Références pour dessiner le pont de pierre

`ref-pont-pierre-3.png` (400 px de large) : proposition de pont long à arche, à
pixeliser par-dessus dans Aseprite. Le format allongé est la clé — c'est lui
qui permet un pont à la fois LONG et BAS, ce que le générateur de sprites
(canvas carré) ne pouvait pas produire.

⚠ Deux défauts de cette référence, à NE PAS reprendre en dessinant :
- elle a un PILIER au milieu, dans l'eau — on n'en veut pas (les bateaux
  doivent passer) : une seule arche, ou un tablier droit à cet endroit ;
- un filigrane du générateur occupait le coin bas-droit : il a été effacé, la
  zone est vide.
(Deux références antérieures ont été jetées : leur tablier était dessiné en
escalier.)

## Les trois contraintes pour que ton dessin soit posable en jeu

1. **La pente iso** : le pont doit filer à 2 px horizontaux pour 1 px vertical
   (l'inclinaison des routes du jeu). Je peux corriger un petit écart, mais
   plus c'est juste au départ, moins le dessin est déformé.
2. **Une bande droite de chaque côté de l'arche** : quelques dizaines de pixels
   où le tablier ET le dessous sont parallèles à cette pente, sans détail qui
   saute aux yeux. C'est cette bande que le moteur répète pour allonger le pont
   selon la largeur du fleuve — donc son bord droit doit prolonger exactement
   son bord gauche.
3. **La hauteur** : vise environ une tuile (32 px) entre le sol et le dessus du
   tablier. C'est ce qui rend les pentes douces — un tablier haut oblige à des
   rampes raides, c'est tout le problème qu'on a rencontré.

Le reste est libre : forme de l'arche, appareillage, parapets, teintes, longueur.

## Quand tu as fini

Dépose ton PNG dans ce dossier et dis-le moi. Je m'occupe du reste : mise à la
pente exacte, repérage de la bande répétable, mesure de la hauteur du tablier
pour que piétons et attelages marchent dessus, et pose en jeu.
