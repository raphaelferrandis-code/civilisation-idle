# Impact des Heritages de Mythes - mesure exacte

> Genere par `bench-myths.js`. Etat de reference identique pour tous (economie mid-game,
> pop 40k, ~370 batiments, 6 cycles). Chaque heritage est applique avec sa **condition
> d'activation reelle** (fenetre temporelle, langue declaree, altitude...), puis on remesure.
> Tous les chiffres viennent des formules de `src/game/**`. **10/14** heritages
> debloquent une mecanique/automatisation persistante (vrai gate) ; les autres sont des multiplicateurs.

## Tableau de synthese
> Prod/s x = effet sur la production totale par seconde (les ressources food/gold sont en racine du mult global, donc prod/s croit moins vite que le mult global). Usure/Couts/Ruines x : <1 = reduction (bonus).

| Acte | Mythe | Mult global x | Prod/s x | Usure x | Couts x | Ruines x | Role | Automatisation / mecanique debloquee |
|---|---|---|---|---|---|---|---|---|
| I | Le Mythe du Chaos | 1.00 | 1.00 | 1.00 | 1.00 | 1.10 | mult. | - |
| I | Le Mythe de Prométhée | 1.00 | 1.46 | 1.00 | 1.00 | 1.00 | mult. | - |
| I | Le Mythe d'Énée | 2.00 | 1.57 | 1.00 | 1.00 | 1.00 | mult. | - |
| I | Le Mythe de Cadmos | 1.00 | 1.03 | 1.00 | 1.00 | 1.00 | **GATE** | Gravure d'EPITAPHES : +2% permanent / orientation (max 3) |
| I | Le Mythe d'Héphaïstos | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | Panneau AUTOMATES : achat auto de batiments + actions de crise auto (runs futures) |
| II | Le Mythe de Sisyphe | 1.00 | 1.00 | 1.00 | 0.57 | 1.00 | mult. | - |
| II | Le Mythe de Babel | 1.00 | 1.16 | 1.00 | 1.00 | 1.00 | **GATE** | LANGUE COMMUNE : 1x/cycle, la categorie declaree produit +20% jusqu'a l'effondrement (reglable en auto) |
| II | Le Mythe de l'Âge d'Or | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | Le COMPTOIR : onglet Marchandage permanent (Or <-> ressources, vente du surplus, au tarif du marchand) |
| III | Le Mythe d'Atlas | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | L Epaule : 1x/cycle, une gestion de crise au choix passe sans aucun effet |
| III | Le Mythe d'Icare | 2.00 | 1.57 | 1.00 | 1.00 | 1.00 | **GATE** | L Aile (MONTER / redescendre) dans les cycles normaux, sans plafond : prod qui grimpe, Rupture qui s'emballe |
| III | Le Mythe du Phénix | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | Panneau SCRIPT : effondrement auto selon seuils (Rupture/Usure/temps) |
| III | Le Mythe des Atrides | 2.00 | 1.57 | 1.00 | 1.00 | 1.00 | **GATE** | Bouton PACTE : x2 production 2 min (puis -50% pendant la crise) |
| III | Le Mythe d'Antée | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | Choix RUINES ACTIVES en debut de cycle : x ruines selon malus actives |
| R | Ragnarok | 1.00 | 1.00 | 1.00 | 1.00 | 4.00 | **GATE** | Debloque le 11e GRAND RESET (x4 Ruines permanent) |

## Detail par Mythe (effet mesure + verdict)

### Le Mythe du Chaos (Acte I) - multiplicateur
- **Effet passif mesure** : Ruines gagnees a l'effondrement x1.10.
- **Heritage (texte)** : Né du néant : toutes les récoltes de Ruines sont augmentées de 25 %, pour toujours.

### Le Mythe de Prométhée (Acte I) - multiplicateur
- **Effet passif mesure** : production totale/s x1.46.
- **Heritage (texte)** : Braisiers ancestraux : chaque cycle démarre avec un bonus de production de Nourriture x2 pendant 2 minutes.

### Le Mythe d'Énée (Acte I) - multiplicateur
- **Effet passif mesure** : mult. global x2.00, production totale/s x1.57.
- **Heritage (texte)** : Migration fondatrice : chaque nouveau cycle démarre avec un boost de production globale (+10% par effondrement passé, jusqu'à +100%) pendant les 30 premières secondes.

### Le Mythe de Cadmos (Acte I) - GATE de progression
- **Effet passif mesure** : production totale/s x1.03.
- **Mecanique/automatisation debloquee** : Gravure d'EPITAPHES : +2% permanent / orientation (max 3).
- **Heritage (texte)** : Noms de Pouvoir : après chaque run, graver un Âge de la Chronique comme Épitaphe Permanente. Chaque Épitaphe donne +2% permanent à son orientation, avec 3 Épitaphes actives maximum.

### Le Mythe d'Héphaïstos (Acte I) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : Panneau AUTOMATES : achat auto de batiments + actions de crise auto (runs futures).
- **Heritage (texte)** : Automates ancestraux : débloque un panneau "Automates" dans les Options pour activer des automatisations permanentes dans toutes les runs futures (achat automatique de bâtiments, déclenchement de crises).

### Le Mythe de Sisyphe (Acte II) - multiplicateur
- **Effet passif mesure** : couts de construction x0.57.
- **Heritage (texte)** : Réduit de façon permanente le facteur de scaling des coûts de tous les bâtiments de 10% (l'inflation naturelle croît plus lentement pour toujours).

### Le Mythe de Babel (Acte II) - GATE de progression
- **Effet passif mesure** : production totale/s x1.16.
- **Mecanique/automatisation debloquee** : LANGUE COMMUNE : 1x/cycle, la categorie declaree produit +20% jusqu'a l'effondrement (reglable en auto).
- **Heritage (texte)** : La Langue commune : une fois par cycle, déclare une langue — la catégorie choisie produit +20 % jusqu'à la fin du cycle. Réglable en automatique.

### Le Mythe de l'Âge d'Or (Acte II) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : Le COMPTOIR : onglet Marchandage permanent (Or <-> ressources, vente du surplus, au tarif du marchand).
- **Heritage (texte)** : Le Comptoir : débloque l'onglet Marchandage — échanger de l'Or contre des ressources (et vendre son surplus), en permanence, au tarif du marchand.

### Le Mythe d'Atlas (Acte III) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : L Epaule : 1x/cycle, une gestion de crise au choix passe sans aucun effet.
- **Heritage (texte)** : L'Épaule : une fois par cycle, « Atlas prend le coup » — une gestion de crise au choix passe sans aucun effet.

### Le Mythe d'Icare (Acte III) - GATE de progression
- **Effet passif mesure** : mult. global x2.00, production totale/s x1.57.
- **Mecanique/automatisation debloquee** : L Aile (MONTER / redescendre) dans les cycles normaux, sans plafond : prod qui grimpe, Rupture qui s'emballe.
- **Heritage (texte)** : L'Aile : MONTER et redescendre restent disponibles dans les cycles normaux, sans plafond. La production grimpe, la Rupture s'emballe — à toi de choisir ton altitude.

### Le Mythe du Phénix (Acte III) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : Panneau SCRIPT : effondrement auto selon seuils (Rupture/Usure/temps).
- **Heritage (texte)** : Script d'Automatisation : débloque un panneau dans les Options pour définir des conditions d'effondrement automatique dans toutes les runs futures (seuil de Rupture, seuil d'Usure, durée du cycle).

### Le Mythe des Atrides (Acte III) - GATE de progression
- **Effet passif mesure** : mult. global x2.00, production totale/s x1.57.
- **Mecanique/automatisation debloquee** : Bouton PACTE : x2 production 2 min (puis -50% pendant la crise).
- **Heritage (texte)** : Débloque le bouton 'Pacte des Atrides' en début de cycle normal (runs normales) pour doubler la production pendant 2 minutes en échange de -50% pendant la crise.

### Le Mythe d'Antée (Acte III) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : Choix RUINES ACTIVES en debut de cycle : x ruines selon malus actives.
- **Heritage (texte)** : Ruines actives : dans les runs futures, chaque début de cycle propose de choisir volontairement des Héritages avec leur malus. Les Ruines gagnées à l'effondrement reçoivent un multiplicateur proportionnel au nombre de malus actifs (placeholder).

### Ragnarok (Acte R) - GATE de progression
- **Effet passif mesure** : Ruines gagnees a l'effondrement x4.00.
- **Mecanique/automatisation debloquee** : Debloque le 11e GRAND RESET (x4 Ruines permanent).
- **Heritage (texte)** : La Fin des Dieux : débloque le 11e Grand Reset, qui donne un multiplicateur x4 aux Ruines, et grave un titre final permanent dans la Chronique.

## Lecture / verdict global
- **Gates (10)** : ces Mythes debloquent une mecanique **persistante** (panneaux d'automatisation Hephaistos/Phenix, boutons actifs Icare/Atrides, parade d'Atlas, choix Antee, gravure Cadmos, Langue commune de Babel, Comptoir de l'Age d'Or). Leur "impact production" passif peut etre ~x1 : la valeur est dans la **capacite debloquee**, pas dans un multiplicateur constant.
- **Multiplicateurs** : effet passif direct mesurable (ex. Cadmos +6% nourriture avec 3 epitaphes, Sisyphe couts x0.57, Enee +100% global 30s/cycle, Icare l Aile a l'altitude 1 x2, Atrides Pacte x2).
- **Non mesurable headless (flagge)** : Atlas (une gestion de crise annulee : effet hors production), Comptoir de l'Age d'Or (echanges au gre du joueur), Antee ruines actives (multiplicateur applique a l'effondrement selon malus choisis), Ragnarok x4 ruines (effectif uniquement au 11e Grand Reset).
- **A calibrer (placeholder dans data/myths.js)** : objectifs de Chaos, Sisyphe, Antee marques "placeholder/a calibrer".
