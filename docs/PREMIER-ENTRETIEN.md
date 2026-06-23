# Premier entretien avec l'équipe / l'artiste — aide-mémoire

> Tu veux parler avant de lancer. Voici quoi clarifier, quoi montrer, quoi NE PAS donner,
> et les signaux à surveiller.

## Avant l'appel — ce que tu prépares (10 min)

- 3–5 **références visuelles** (screenshots de jeux dont tu aimes le rendu) + en une
  phrase ce que tu veux reprendre de chacune.
- 3–4 **captures de TON jeu actuel**, annotées : « ici je veux X ».
- Ta phrase d'ambiance, déjà claire : **sombre / or / antique**, « le moins de panneaux
  possible », une carte plein écran qui donne envie de rester et de la voir grandir.
- Tu n'envoies **pas** encore le code. À ce stade : captures + brief seulement.

## À cadrer avec eux pendant l'appel

1. **Procédural, sprites ou hybride ?** Le point décisif (voir `INVENTAIRE-RENDU.md`).
   Voie recommandée = **hybride** : base procédurale embellie (lumière, atmosphère,
   animation, theming par époque) + **quelques assets faits main pour les éléments héros**
   (merveilles, monuments, feu central, cadres d'UI). Vérifie qu'ils sont à l'aise avec du
   **rendu Canvas 2D en code**, pas seulement de l'illustration. Si leur réflexe est « on
   refait TOUT en assets », rappelle que ça casse l'évolution auto par époque et que c'est
   un autre budget (2 métiers) → recadre vers l'hybride.
2. **Équipe ou solo ?** « L'équipe de l'artiste » : qui code réellement ? L'artiste
   produit, mais qui intègre dans le repo React/Canvas ? Assure-toi qu'il y a bien
   quelqu'un côté **dev front-end / Canvas**.
3. **Périmètre exact** : améliorer le rendu de la carte (lumière, eau, routes, bâtiments,
   nuit) + polish UI/CSS (boutique, HUD). Pas de refonte de la logique de jeu.
4. **Contrainte perf** : boucle d'animation temps réel, ~60 fps même sur GPU intégré.
   Demande-leur comment ils gèrent la perf en Canvas — une vraie réponse = bon signe.
5. **Codebase FR** : commentaires en français, c'est ok pour eux ?
6. **Process** : tu travailles par **branche + Pull Request**, tu review avant de merger,
   jamais d'accès direct à `main`.
7. **Tâche d'essai payée** d'abord (petite, isolée) avant tout gros engagement.
   Ex. : passe d'éclairage nocturne de la carte, OU re-skin CSS du panneau boutique.
8. **PI & sources** : tout le travail t'appartient à la livraison ; pour tout asset
   produit, tu reçois les **fichiers sources** (`.aseprite/.psd/.svg`), pas juste les PNG.
9. **Budget & délais** : forfait par tâche/jalon, paiement par milestones (maquette →
   intégration → polish), pas tout d'avance.

## Bons signaux ✅

- Ils posent des questions sur la **stack** (Vite/React/Canvas) et le **périmètre**.
- Ils parlent **perf** spontanément.
- Ils proposent une **maquette / proposition** avant de coder.
- Portfolio avec du **rendu temps réel navigateur**, pas que des images fixes.
- Ils acceptent **branche + PR + tâche d'essai**.

## Drapeaux rouges 🚩

- « On vous refait tous les assets » alors que tu veux du rendu en code → mauvais métier.
- Veut **tout le repo en accès écriture** tout de suite, ou refuse les PR.
- Veut **tout le paiement d'avance**.
- Évasif sur qui code vs qui dessine.
- Aucune mention de perf / « ça passera, t'inquiète ».

## Après l'appel

- Si bon feeling → lance **une seule tâche d'essai payée** et juge sur pièce (qualité +
  collaboration) avant d'élargir.
- Tu n'ouvres l'accès au repo (branche dédiée + `DEV-ONBOARDING.md`) qu'à ce moment-là.
- Avant de partager le repo : vérifier qu'aucune clé/secret n'est committée (ici, rien de
  sensible a priori — c'est un jeu client, pas de backend).
