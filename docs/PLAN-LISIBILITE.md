# PLAN — Une ville qu'on lit (quartiers, repères, grille, ville qui s'éteint)

> Retour extérieur transmis par Raph, 2026-10-06 : « la ville est superbe… mais commence à
> devenir illisible » ; « on distingue difficilement les bâtiments importants, les
> quartiers, les routes structurantes, les monuments » ; « beaucoup moins de grille sur la
> map, davantage de landmarks » ; « la récompense : regarde ce que ma civilisation est
> devenue — et ensuite, regarde-la mourir ». Raph a retenu les QUATRE chantiers proposés.

## 1. Constats mesurés (2026-10-06)

| Mesure | Valeur |
|---|---|
| Cases de rue qui ne bordent RIEN de visible (bâti, place, merveille) — ville neuve bande 4 (`__demoCity` 1e23) | 12,8 % |
| … ville neuve bande 7 (`__demoCity` 1e60) | 24,5 % |
| … partie avancée bande 8 (`etat-plein.json`, ~1 900 bâtiments) | **30,9 %** (1 221 / 3 957) |
| Où sont-elles ? | un ANNEAU d'îlots vides, 2-3 îlots d'épaisseur, tout autour de la ville (cartes `cases-*.png`) |
| Logements géants 2×2 PRÉVUS par la demande (bande 7+, `ilotBigHomeLots`) | 3 tirages sur 10 → +0,6 lot par logement → **≈ 1 100 lots** |
| … réellement POSÉS (bande 7) | **30** sur 1 844 (+90 lots) — les autres se rabattent sur une case (TOURS_COEUR, lots de bord) |
| Halles (un monument par bâtiment acheté) | ≈ 25, une par îlot, réparties par ANNEAU (centre/milieu/bord) |
| Familles mêlées au cœur (zone « center ») | 9 : guildes, monnaies, bourses, académies, culte, universités, bureaucratie, tribunaux, ministères |
| Ateliers (annexes) | semés uniformément sur TOUS les îlots, y compris l'anneau vide (boutiques isolées sur leur quadrillage) |
| Repères civiques d'août (un monument par genre) | retirés à l'audit du 05/10 (MORT-4) avec l'ancien placement |

## 2. Les quatre chantiers

### G — Moins de grille (lot G1, puis G2 si besoin)
- **G1 la demande juste** : la part de lots des logements géants se règle sur ce que la
  ville a RÉELLEMENT posé au calcul précédent (rapport mémorisé dans `cityCore.ilot`,
  par bande) ; l'estimation d'origine ne sert qu'au premier calcul d'une bande.
- **G1 la mémoire qui ne garde que l'habité** : un îlot mémorisé n'est rouvert que s'il
  porte quelque chose (case tenue, halle, place) ; un îlot vide mémorisé redevient pré.
  Rien de visible ne bouge (il était vide).
- **G1 les ateliers dans la ville** : semés seulement dans les îlots qui logeront des
  maisons (le préfixe d'îlots qui couvre la demande), plus dans la marge du bord.
  Migration unique (fiche v5) : un atelier isolé dans un îlot sans maison est ressemé.
- G2 (à décider après mesure) : la marge restante (12 lots + maisons-moteur pas encore
  révélées) — rues dormantes ?

### E — La ville qui s'éteint (« regarde-la mourir »)
Avec la Rupture, la ville se vide du BORD vers le CŒUR (quartiers désertés), sans
nouvel art : fenêtres de nuit qui ne se rallument plus (relevés à la main existants),
moins de passants, herbe qui reprend les cours. Paliers 25/50/75/90 alignés sur les
autres signes de crise (`cityCrisisBand`, fumées, émeutes, étals vides).

### Q — Des quartiers par famille
Les halles se groupent par FAMILLE en secteurs autour du forum : marchands (marchés,
guildes, monnaies, bourses) vers le fleuve/port ; savants (écoles, académies,
bibliothèques, universités, imprimeries) ; pouvoir et culte (bureaucratie, tribunaux,
ministères, culte) autour du forum ; faubourgs (cueilleurs, greniers, conteurs, scribes,
travaux publics) au bord. Les ateliers suivent leur famille. Place de quartier assortie
(marché / parvis / jardin). Nom du quartier dans l'INFOBULLE seulement (⛔ aucune phrase à
l'écran). ⚠ Réorganisation unique des halles d'une partie en cours.

### R — Un repère par quartier
Seule la halle la plus haute (niveau) de chaque quartier garde sa stature et son parvis ;
les autres rentrent dans le rang. (Leçon d'août : une hiérarchie est RARE par définition.)

### U — Relevé de l'écran Cité
Compter, en 2560×1340 (fenêtre de Raph), les cadres et les informations visibles en même
temps sur la Cité ; proposer une liste de coupes chiffrée. Aucune coupe sans accord.

## 3. Relevé de l'écran Cité (U, 2026-10-06)

Partie avancée fabriquée (bande 5, 6 cycles, crise de cycle ouverte → Régulation dépliée),
2560×1340, `scratchpad/releve-cite.mjs` (cadres = bordure, image de bordure ou plaque
`::before/::after` à image ; nombres = nœuds texte qui portent un chiffre).

| Bloc | Boîte (px) | Cadres | Textes | Nombres |
|---|---|---|---|---|
| Boutique (10 lignes visibles) | 392 × 1 029 | **25** (10 plaques de ligne, 10 boutons) | 115 | **69** |
| Ruban des ressources | 665 × 77 | 5 | 5 valeurs + 5 débits | 10 (odomètres découpés en chiffres) |
| Identité | 349 × 99 | 7 | 6 | 2 |
| Régulation (dépliée en crise) | 2 034 × 87 | 0 | 34 | 12 |
| Rail | 77 × 697 | 1 | 9 | 1 |
| Outils de carte | 202 × 51 | 0 | 2 | 0 |

Carte cliquable : **72 %** de l'écran (Régulation dépliée). La boutique porte à elle seule
plus de nombres que tout le reste réuni : par ligne, la production (×2 ou ×3 débits), la
part du total, le prix, le compteur.

Coupes PROPOSÉES (aucune faite) : boutique = un seul débit + le prix par ligne, le reste
en infobulle (−30 nombres) et lignes sans plaque, séparées d'un filet (−10 cadres) ; débits
du ruban en infobulle (−5) ; « Réserve d'absence » vers les Options.

## 4. Journal

- 2026-10-06 : constats chiffrés, cause de la grille trouvée (géants prévus ≠ posés).
- G1 FAIT (`69992426`, local) : bande 7 neuve 30 → 7 % de rues nues ; save bande 8
  31 → 7,7 %, 447 → 273 îlots.
- U FAIT (relevé ci-dessus, coupes à arbitrer).
- E FAIT : `map/cityDecline.js` — front d'abandon du bord vers le cœur au-delà de 50 % de
  Rupture (par quartiers de 10 cases), maisons ternies le jour, fenêtres, verre d'ère et
  réverbères éteints la nuit, plus de fumée de cheminée ; la suie de crise monte des
  quartiers abandonnés. ~30 % de la ville éteinte à 75 %, le cœur (0,3 du rayon) jamais.
  ⚠ Au dézoom < 0,55 (LOD) les fenêtres sont coupées de toute façon : seul le ternissement
  se voit. Planche `.preview-shots/declin-planche.png`.
- Q+R FAITS : une ville NÉE avec ses quartiers (fiche `q: 1`, donc la prochaine ville après
  une chute — la partie en cours ne se réorganise pas) est coupée en quatre par le cardo et
  le decumanus : MARCHANDS (côté fleuve, est), FAUBOURGS (côté fleuve, ouest), POUVOIR
  (terres, côté forum), SAVANTS (terres, est). Halles et ateliers vont dans le quartier de
  leur famille (`CM_QUARTER_OF`, cityBuildings.js), chaque quartier a sa place (marché,
  parvis, square), ses logements (liste « riche » au pouvoir, « pauvre » aux faubourgs, par
  substitution de MÊME emprise après la pose — jamais pendant, cf. S4), sa boutique
  (la taberna / le rez haussmannien / la boutique néon chez les marchands), et UN repère :
  la meilleure halle présente (`LANDMARK_RANK` : bourse, ministères, université,
  greniers…), 3×3 dès sa naissance, seule au milieu d'une pelouse ; les autres halles
  plafonnent à 2×2. Nom du quartier dans l'infobulle. Molette `__quartiers`.
  ⚠ Pièges payés : (1) la liste riche du Néon n'a AUCUN logis d'une case → la pose
  s'arrêtait (46 maisons sur 1 439) quand le biais était dans le générateur ; (2) le tirage
  par case faisait changer 49 dessins à un achat. D'où la substitution après la pose.
