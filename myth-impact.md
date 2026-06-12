# Impact des Heritages de Mythes - mesure exacte

> Genere par `bench-myths.js`. Etat de reference identique pour tous (economie mid-game,
> pop 40k, ~370 batiments, 6 cycles). Chaque heritage est applique avec sa **condition
> d'activation reelle** (fenetre temporelle, equilibre, surchauffe...), puis on remesure.
> Tous les chiffres viennent des formules de `src/game/**`. **9/14** heritages
> debloquent une mecanique/automatisation persistante (vrai gate) ; les autres sont des multiplicateurs.

## Tableau de synthese
> Prod/s x = effet sur la production totale par seconde (les ressources food/gold sont en racine du mult global, donc prod/s croit moins vite que le mult global). Usure/Couts/Ruines x : <1 = reduction (bonus).

| Acte | Mythe | Mult global x | Prod/s x | Usure x | Couts x | Ruines x | Role | Automatisation / mecanique debloquee |
|---|---|---|---|---|---|---|---|---|
| I | Le Mythe du Chaos | 1.46 | 1.29 | 1.00 | 1.00 | 1.00 | mult. | - |
| I | Le Mythe de Prométhée | 1.00 | 1.48 | 1.00 | 1.00 | 1.00 | mult. | - |
| I | Le Mythe d'Énée | 2.00 | 1.61 | 1.00 | 1.00 | 1.00 | mult. | - |
| I | Le Mythe de Cadmos | 1.00 | 1.03 | 1.00 | 1.00 | 1.00 | **GATE** | Gravure d'EPITAPHES : +2% permanent / orientation (max 3) |
| II | Le Mythe de Sisyphe | 1.00 | 1.00 | 1.00 | 0.57 | 1.00 | mult. | - |
| II | Le Mythe de Babel | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | SYNERGIE d'adjacence sur la carte : +10% prod / voisin du meme type |
| II | Le Mythe de l'Âge d'Or | 1.00 | 1.00 | 0.80 | 1.00 | 1.00 | mult. | - |
| II | Le Mythe d'Héphaïstos | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | Panneau AUTOMATES : achat auto de batiments + actions de crise auto (runs futures) |
| III | Le Mythe d'Atlas | 1.00 | 1.00 | 0.85 | 1.00 | 1.00 | **GATE** | Jauge LEGITIMITE (0-100) : attenue les effets negatifs des crises (jusqu'a -25%) |
| III | Le Mythe d'Icare | 5.00 | 3.14 | 1.00 | 1.00 | 1.00 | **GATE** | Bouton SURCHAUFFE : x5 production 30s, +25% Rupture, cd 2 min |
| III | Le Mythe du Phénix | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | Panneau SCRIPT : effondrement auto selon seuils (Rupture/Usure/temps) |
| III | Le Mythe des Atrides | 2.00 | 1.61 | 1.00 | 1.00 | 1.00 | **GATE** | Bouton PACTE : x2 production 2 min (puis -50% pendant la crise) |
| III | Le Mythe d'Antee | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | **GATE** | Choix RUINES ACTIVES en debut de cycle : x ruines selon malus actives |
| R | Ragnarok | 1.00 | 1.00 | 1.00 | 1.00 | 4.00 | **GATE** | Debloque le 11e GRAND RESET (x4 Ruines permanent) |

## Detail par Mythe (effet mesure + verdict)

### Le Mythe du Chaos (Acte I) - multiplicateur
- **Effet passif mesure** : mult. global x1.46, production totale/s x1.29.
- **Heritage (texte)** : Les Ruines gagnées lors d'un cycle Chaos comptent double dans le calcul du multiplicateur global de Ruines, en permanence.

### Le Mythe de Prométhée (Acte I) - multiplicateur
- **Effet passif mesure** : production totale/s x1.48.
- **Heritage (texte)** : Braisiers ancestraux : chaque cycle démarre avec un bonus de production de Nourriture x2 pendant 2 minutes.

### Le Mythe d'Énée (Acte I) - multiplicateur
- **Effet passif mesure** : mult. global x2.00, production totale/s x1.61.
- **Heritage (texte)** : Migration fondatrice : chaque nouveau cycle démarre avec un boost de production globale (+10% par effondrement passé, jusqu'à +100%) pendant les 30 premières secondes.

### Le Mythe de Cadmos (Acte I) - GATE de progression
- **Effet passif mesure** : production totale/s x1.03.
- **Mecanique/automatisation debloquee** : Gravure d'EPITAPHES : +2% permanent / orientation (max 3).
- **Heritage (texte)** : Noms de Pouvoir : apres chaque run, graver un Age de la Chronique comme Epitaphe Permanente. Chaque Epitaphe donne +2% permanent a son orientation, avec 3 Epitaphes actives maximum.

### Le Mythe de Sisyphe (Acte II) - multiplicateur
- **Effet passif mesure** : couts de construction x0.57.
- **Heritage (texte)** : Réduit de façon permanente le facteur de scaling des coûts de tous les bâtiments de 10% (l'inflation naturelle croît plus lentement pour toujours).

### Le Mythe de Babel (Acte II) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : SYNERGIE d'adjacence sur la carte : +10% prod / voisin du meme type.
- **Heritage (texte)** : Synergie d'Urbanisme : sur la carte, chaque bâtiment du même type placé côte à côte accorde +10% de production par voisin du même type (halo doré visible sur le canvas).

### Le Mythe de l'Âge d'Or (Acte II) - multiplicateur
- **Effet passif mesure** : Usure x0.80.
- **Heritage (texte)** : Équilibre Doré : quand l'écart entre Nourriture et Trésor est inférieur à 15%, l'Usure monte 20% plus lentement — en permanence, dans toutes les runs futures.

### Le Mythe d'Héphaïstos (Acte II) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : Panneau AUTOMATES : achat auto de batiments + actions de crise auto (runs futures).
- **Heritage (texte)** : Automates ancestraux : débloque un panneau "Automates" dans les Options pour activer des automatisations permanentes dans toutes les runs futures (achat automatique de bâtiments, déclenchement de crises).

### Le Mythe d'Atlas (Acte III) - GATE de progression
- **Effet passif mesure** : Usure x0.85.
- **Mecanique/automatisation debloquee** : Jauge LEGITIMITE (0-100) : attenue les effets negatifs des crises (jusqu'a -25%).
- **Heritage (texte)** : 1) L'Usure de base est réduite de 15% en permanence. 2) Débloque la jauge "Légitimité" (0-100, démarre à 50 chaque cycle). Quand elle est haute, les effets négatifs des crises sont atténués jusqu'à 25%.

### Le Mythe d'Icare (Acte III) - GATE de progression
- **Effet passif mesure** : mult. global x5.00, production totale/s x3.14.
- **Mecanique/automatisation debloquee** : Bouton SURCHAUFFE : x5 production 30s, +25% Rupture, cd 2 min.
- **Heritage (texte)** : Surchauffe : débloque un bouton activable pendant les runs normaux. Active x5 production pendant 30s (+25% Rupture instant). Cooldown : 2 min.

### Le Mythe du Phénix (Acte III) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : Panneau SCRIPT : effondrement auto selon seuils (Rupture/Usure/temps).
- **Heritage (texte)** : Script d'Automatisation : débloque un panneau dans les Options pour définir des conditions d'effondrement automatique dans toutes les runs futures (seuil de Rupture, seuil d'Usure, durée du cycle).

### Le Mythe des Atrides (Acte III) - GATE de progression
- **Effet passif mesure** : mult. global x2.00, production totale/s x1.61.
- **Mecanique/automatisation debloquee** : Bouton PACTE : x2 production 2 min (puis -50% pendant la crise).
- **Heritage (texte)** : Débloque le bouton 'Pacte des Atrides' en début de cycle normal (runs normales) pour doubler la production pendant 2 minutes en échange de -50% pendant la crise.

### Le Mythe d'Antee (Acte III) - GATE de progression
- **Effet passif mesure** : aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation).
- **Mecanique/automatisation debloquee** : Choix RUINES ACTIVES en debut de cycle : x ruines selon malus actives.
- **Heritage (texte)** : Ruines actives : dans les runs futures, chaque debut de cycle propose de choisir volontairement des Heritages avec leur malus. Les Ruines gagnees a l'effondrement recoivent un multiplicateur proportionnel au nombre de malus actifs (placeholder).

### Ragnarok (Acte R) - GATE de progression
- **Effet passif mesure** : Ruines gagnees a l'effondrement x4.00.
- **Mecanique/automatisation debloquee** : Debloque le 11e GRAND RESET (x4 Ruines permanent).
- **Heritage (texte)** : La Fin des Dieux : debloque le 11e Grand Reset, qui donne un multiplicateur x4 aux Ruines, et grave un titre final permanent dans la Chronique.

## Lecture / verdict global
- **Gates (9)** : ces Mythes debloquent une mecanique **persistante** (panneaux d'automatisation Hephaistos/Phenix, boutons actifs Icare/Atrides, jauge Atlas, choix Antee, gravure Cadmos, synergie Babel). Leur "impact production" passif peut etre ~x1 : la valeur est dans la **capacite debloquee**, pas dans un multiplicateur constant.
- **Multiplicateurs** : effet passif direct mesurable (ex. Cadmos +6% nourriture avec 3 epitaphes, Sisyphe couts x0.57, Enee +100% global 30s/cycle, Icare Surchauffe x3 ponctuel, Atrides Pacte x2).
- **Non mesurable headless (flagge)** : Babel adjacence (necessite la carte / placement), Antee ruines actives (multiplicateur applique a l'effondrement selon malus choisis), Ragnarok x4 ruines (effectif uniquement au 11e Grand Reset).
- **A calibrer (placeholder dans data/myths.js)** : objectifs de Chaos, Sisyphe, Antee marques "placeholder/a calibrer".
