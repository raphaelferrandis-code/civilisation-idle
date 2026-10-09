# Contrôle de continuité des 67 habitants — 7 octobre 2026

> Historique de la première livraison du 7 octobre. Pour les 28 habitants ensuite retouchés, consulter le [bilan de la nouvelle revue](RETOUCHES-HABITANTS-REVUE-07.md). Le n°10 y est désormais repris ; le décompte courant est de 9 versions conservées et 58 propositions.

**67 dossiers préparés : 57 reprises depuis les originaux et 10 versions retenues préservées (n°1, 2 et 9 à 16).** Les nouvelles reprises attendent l’appréciation artistique de Raphaël. [Ouvrir l’index des 67 comparatifs](../art/habitants/index.html).

## Périmètre et méthode

La consigne du 7 octobre remplace l’approche de redessin du 6 octobre : conserver le dessin et l’identité d’origine, supprimer les variations entre les poses, en prenant les retouches manuelles de Raphaël et la reprise validée du n°2 comme méthode. Les 40 personnages de la Maison des Plaisirs sont exclus. Les fichiers préparés restent dans `art/habitants/continuite` ; aucune intégration dans `public/` et aucune modification des réduits n’a été effectuée par cette reprise.

Les 57 dossiers utilisent la taille native, les quatre directions et les six poses des PNG originaux. Le n°67 conserve ses directions cardinales. Les visages et coiffures propres à chaque vue sont reportés avec leurs déplacements d’origine : les couleurs et le contour ne changent plus d’une pose à l’autre dans les zones contrôlées. Les retouches de silhouette sont limitées à ces zones ; le masque du corps et les positions des pieds restent ceux des originaux. Les teintes proches sont harmonisées par famille de couleur, avec retouches locales lorsque la revue montre un changement de matière ou de teinte évident.

La construction et les exports ont été effectués dans Aseprite 1.3.18.1, avec les modules d’Animation Suite installés et les validations `validate_loop` d’aseprite-mcp. Python a servi à l’analyse en lecture seule, aux métadonnées et à la copie des dossiers, sans retoucher les images.

## Vérifications effectuées

- Les **67 masters**, **268 documents par direction** et leurs PNG correspondent pixel par pixel après rendu natif Aseprite : 1 672 poses au total.
- Les GIF individuels des **67 habitants** correspondent exactement aux PNG, avec agrandissement sans interpolation. Pour les 57 nouveaux dossiers, les 228 GIF et les 57 comparatifs animés sont vérifiés pose par pose, y compris les couleurs et la cadence.
- Les **228 régions de tête** des 57 reprises sont identiques à la référence propre à leur direction après compensation du déplacement. Les yeux et leurs contours restent solidaires du visage ; aucune teinte ne clignote dans ces régions, y compris au raccord 6→1.
- Les **67 planches** de quatre directions ont été ouvertes et examinées. Les 57 reprises sont examinées sur leurs 24 poses, les versions médiévales retenues sur leurs 32 poses. La revue couvre les têtes, raccords tête/épaules, bras, accessoires et pieds.
- Aucun nouveau fragment isolé ne subsiste dans les 57 reprises selon le contrôle de connexité comparé à l’original. Les fragments et objets déjà distincts dans l’original ne sont pas assimilés automatiquement à des défauts.
- Les **228 cycles des nouvelles reprises** passent `validate_loop` sans erreur bloquante : pas de pose vide, de doublon adjacent ou de doublon au raccord. Les avertissements de cadence et d’appui restent consignés dans les rapports par direction.
- Les empreintes des sources retenues ont été comparées avant/après : les masters des n°1, 2 et 9 à 16 restent inchangés. Pour le n°1, les exports individuels ont seulement été resynchronisés avec le dernier master manuel de Raphaël, qui contenait 15 pixels différents des anciens exports.

## Corrections issues de la revue

Les placements d’yeux automatiques qui déformaient les premiers essais ont été retirés au profit des motifs natifs, avec corrections locales pour les deux cueilleuses. Les petits motifs isolés sont réduits ou prolongés sur deux pixels alignés ; les yeux sous casque restent collés à son bord. Les masques, visières et yeux masqués par les cheveux conservent leur dessin et ne reçoivent pas de faux yeux supplémentaires. La stabilité du motif est vérifiée numériquement ; le repérage sémantique œil/cheveu/visière relève de la revue visuelle.

La revue a également corrigé un bord de sac à dos isolé du livreur moderne, une pointe de chevelure isolée de la danseuse de cristal, et le sac de la passante moderne qui passait du violet/rose au bleu selon la pose. Ces dossiers ont été régénérés puis revérifiés.

## Limites conservées et statut

**Cette livraison est une correction de continuité, pas une reconstruction des cycles de marche.** Les positions et trajectoires des membres restent celles des originaux. Plusieurs cycles conservent une variation de la dernière ligne occupée de **1 à 3 pixels**, détaillée ci-dessous ; il ne faut donc pas lire les contrôles comme une certification que toute impression de glissement ou de boiterie a disparu. Les accessoires influencent aussi cette mesure de bord inférieur.

La cadence de présentation est de **160 ms par pose**, soit 960 ms par boucle pour les reprises de six poses : les PNG originaux ne contiennent pas de durée. L’avertissement MCP sur la cadence uniforme n’est pas traité comme une erreur. Les variantes d’ombres et de plis des membres qui suivent les poses originales ne sont pas toutes uniformisées ; le contrôle strict de constance porte sur les régions de visage et de coiffure déclarées dans chaque configuration.

Les n°9 à 16 gardent leurs cycles de huit poses précédemment retenus. Les 57 nouvelles corrections ne sont pas marquées comme artistiquement acceptées. Le bilan historique du 6 octobre reste consultable, mais ne vaut pas validation des dessins qui avaient été rejetés.

## Index et état par habitant

| N° | Habitant | État | Original / résultat | Variation maximale d’appui |
|---:|---|---|---|---|
| 1 | Homme 1 · `caveman` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/continuite/caveman-comparatif-original-continuite.gif) | Source retenue conservée |
| 2 | Homme 2 · `caveman2` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/continuite/caveman2-comparatif-original-continuite.gif) | Source retenue conservée |
| 3 | Pêcheur · `caveman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/caveman3-comparatif-original-continuite.gif) | 2 px (original) |
| 4 | Chaman · `caveman4` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/caveman4-comparatif-original-continuite.gif) | 2 px (original) |
| 5 | Femme 1 · `cavewoman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/cavewoman-comparatif-original-continuite.gif) | 2 px (original) |
| 6 | Femme 2 · `cavewoman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/cavewoman2-comparatif-original-continuite.gif) | 1 px (original) |
| 7 | Cueilleuse · `cavewoman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/cavewoman3-comparatif-original-continuite.gif) | 2 px (original) |
| 8 | Enfant · `cavechild` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/cavechild-comparatif-original-continuite.gif) | 2 px (original) |
| 9 | Villageois 1 · `villager` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villager-comparatif-initial-reprise.gif) | Source retenue conservée |
| 10 | Villageois 2 · `villager2` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villager2-comparatif-initial-reprise.gif) | Source retenue conservée |
| 11 | Moine · `villager3` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villager3-comparatif-initial-reprise.gif) | Source retenue conservée |
| 12 | Garde · `villager4` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villager4-comparatif-initial-reprise.gif) | Source retenue conservée |
| 13 | Villageoise 1 · `villagerwoman` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villagerwoman-comparatif-initial-reprise.gif) | Source retenue conservée |
| 14 | Villageoise 2 · `villagerwoman2` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villagerwoman2-comparatif-initial-reprise.gif) | Source retenue conservée |
| 15 | Boulangère · `villagerwoman3` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villagerwoman3-comparatif-initial-reprise.gif) | Source retenue conservée |
| 16 | Enfant · `villagerchild` | Conservé — retenu par Raphaël | [Comparatif](../art/habitants/propositions/villagerchild-comparatif-initial-reprise.gif) | Source retenue conservée |
| 17 | Citoyen en toge · `romanman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanman-comparatif-original-continuite.gif) | 2 px (original) |
| 18 | Marchand · `romanman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanman2-comparatif-original-continuite.gif) | 2 px (original) |
| 19 | Légionnaire · `romanman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanman3-comparatif-original-continuite.gif) | 1 px (original) |
| 20 | Porteur d’amphore · `romanman4` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanman4-comparatif-original-continuite.gif) | 2 px (original) |
| 21 | Matrone · `romanwoman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanwoman-comparatif-original-continuite.gif) | 1 px (original) |
| 22 | Prêtresse · `romanwoman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanwoman2-comparatif-original-continuite.gif) | 1 px (original) |
| 23 | Porteuse d’eau · `romanwoman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanwoman3-comparatif-original-continuite.gif) | 1 px (original) |
| 24 | Enfant · `romanchild` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/romanchild-comparatif-original-continuite.gif) | 1 px (original) |
| 25 | Homme 1 · `industrialman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialman-comparatif-original-continuite.gif) | 2 px (original) |
| 26 | Homme 2 · `industrialman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialman2-comparatif-original-continuite.gif) | 2 px (original) |
| 27 | Sergent de ville · `industrialman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialman3-comparatif-original-continuite.gif) | 2 px (original) |
| 28 | Ouvrier · `industrialman4` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialman4-comparatif-original-continuite.gif) | 2 px (original) |
| 29 | Femme 1 · `industrialwoman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialwoman-comparatif-original-continuite.gif) | 1 px (original) |
| 30 | Femme 2 · `industrialwoman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialwoman2-comparatif-original-continuite.gif) | 1 px (original) |
| 31 | Marchande de fleurs · `industrialwoman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialwoman3-comparatif-original-continuite.gif) | 2 px (original) |
| 32 | Enfant · `industrialchild` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/industrialchild-comparatif-original-continuite.gif) | 1 px (original) |
| 33 | Homme en costume · `modernman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernman-comparatif-original-continuite.gif) | 2 px (original) |
| 34 | Homme en sweat · `modernman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernman2-comparatif-original-continuite.gif) | 2 px (original) |
| 35 | Coursier · `modernman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernman3-comparatif-original-continuite.gif) | 1 px (original) |
| 36 | Joggeur · `modernman4` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernman4-comparatif-original-continuite.gif) | 2 px (original) |
| 37 | Femme en manteau · `modernwoman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernwoman-comparatif-original-continuite.gif) | 2 px (original) |
| 38 | Infirmière · `modernwoman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernwoman2-comparatif-original-continuite.gif) | 2 px (original) |
| 39 | Femme aux courses · `modernwoman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernwoman3-comparatif-original-continuite.gif) | 1 px (original) |
| 40 | Enfant · `modernchild` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/modernchild-comparatif-original-continuite.gif) | 2 px (original) |
| 41 | Homme en tunique · `jademan` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jademan-comparatif-original-continuite.gif) | 2 px (original) |
| 42 | Jardinier · `jademan2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jademan2-comparatif-original-continuite.gif) | 1 px (original) |
| 43 | Ingénieur · `jademan3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jademan3-comparatif-original-continuite.gif) | 1 px (original) |
| 44 | Savant · `jademan4` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jademan4-comparatif-original-continuite.gif) | 2 px (original) |
| 45 | Femme en robe · `jadewoman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jadewoman-comparatif-original-continuite.gif) | 2 px (original) |
| 46 | Botaniste · `jadewoman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jadewoman2-comparatif-original-continuite.gif) | 2 px (original) |
| 47 | Pilote · `jadewoman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jadewoman3-comparatif-original-continuite.gif) | 2 px (original) |
| 48 | Enfant · `jadechild` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/jadechild-comparatif-original-continuite.gif) | 1 px (original) |
| 49 | Astronome · `stellarman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarman-comparatif-original-continuite.gif) | 1 px (original) |
| 50 | Coursier · `stellarman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarman2-comparatif-original-continuite.gif) | 1 px (original) |
| 51 | Noble · `stellarman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarman3-comparatif-original-continuite.gif) | 1 px (original) |
| 52 | Marin des étoiles · `stellarman4` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarman4-comparatif-original-continuite.gif) | 1 px (original) |
| 53 | Chanteuse · `stellarwoman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarwoman-comparatif-original-continuite.gif) | 2 px (original) |
| 54 | Navigatrice · `stellarwoman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarwoman2-comparatif-original-continuite.gif) | 2 px (original) |
| 55 | Jardinière · `stellarwoman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarwoman3-comparatif-original-continuite.gif) | 1 px (original) |
| 56 | Enfant · `stellarchild` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/stellarchild-comparatif-original-continuite.gif) | 2 px (original) |
| 57 | Mage · `crystalman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalman-comparatif-original-continuite.gif) | 2 px (original) |
| 58 | Sculpteur · `crystalman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalman2-comparatif-original-continuite.gif) | 2 px (original) |
| 59 | Moine · `crystalman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalman3-comparatif-original-continuite.gif) | 1 px (original) |
| 60 | Mineur · `crystalman4` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalman4-comparatif-original-continuite.gif) | 2 px (original) |
| 61 | Prêtresse · `crystalwoman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalwoman-comparatif-original-continuite.gif) | 3 px (original) |
| 62 | Tisserande · `crystalwoman2` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalwoman2-comparatif-original-continuite.gif) | 2 px (original) |
| 63 | Danseuse · `crystalwoman3` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalwoman3-comparatif-original-continuite.gif) | 1 px (original) |
| 64 | Enfant · `crystalchild` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/crystalchild-comparatif-original-continuite.gif) | 2 px (original) |
| 65 | Porteur de panier · `basket-man` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/basket-man-comparatif-original-continuite.gif) | 1 px (original) |
| 66 | Porteuse de panier · `basket-woman` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/basket-woman-comparatif-original-continuite.gif) | 1 px (original) |
| 67 | Fermier des champs · `farmer` | Continuité préparée — à revoir | [Comparatif](../art/habitants/continuite/farmer-comparatif-original-continuite.gif) | 1 px (original) |

## Fichiers de preuve et reprise ultérieure

[État détaillé](../art/habitants/reprise-67.json) · [Contrôle global](../art/habitants/continuite/controle-global-67.json) · [Index visuel](../art/habitants/index.html).

Chaque nouveau dossier contient un master Aseprite à 24 poses, quatre documents Aseprite, quatre strips PNG, quatre GIF exacts, une planche de 24 poses, une planche des têtes, un comparatif animé et fixe, et ses rapports. Les originaux sont conservés dans `art/habitants/originaux` et sur un calque masqué verrouillé des sources de travail.

Les scripts de construction préparent des candidats dans `scratch/reprise-globale`. **Ne pas relancer une construction pour exporter un master retouché manuellement** : exporter le master existant afin de préserver les modifications de Raphaël. La reprise automatique reste en pause.
