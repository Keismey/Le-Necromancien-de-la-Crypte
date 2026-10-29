# Le Nécromancien de la Crypte

Recycle les héros tombés, couds des abominations avec leurs restes et défends ta crypte pendant dix nuits, jusqu'à la cathédrale. Un jeu de **Keismey Studio**, jouable dans le navigateur et installable sur téléphone.

Jouer : https://keismey.github.io/Le-Necromancien-de-la-Crypte/ (aussi dans le hub : https://keismey.github.io/)
Play in English: https://keismey.github.io/Le-Necromancien-de-la-Crypte/?lang=en

## Fichiers

- `index.html` — la page, ordre de chargement des scripts
- `js/game.js` — le jeu (écrans, combats, atelier, notes de mise à jour)
- `js/data.js` — tout l'équilibrage (pièces, coûts, vagues), séparé du code
- `js/lang.js` — textes français et anglais
- `js/assets.js` — liste des images
- `js/ks-studio.js`, `js/ks-back.js` — fichiers communs à tous les jeux du studio (ne pas les modifier ici)
- `assets/` — images (WebP : légères, avec transparence) et musiques ; `icons/` — icônes de l'appli ; `og.jpg` — image d'aperçu des liens partagés
- `fonts/` — Creepster et Fredoka (licence SIL OFL)
- `tools/` — préparation des planches d'images (non utilisé par le jeu)
- `sw.js` — mode hors ligne ; changer `VERSION` à chaque mise en ligne

Le jeu est en français et en anglais : `?lang=fr` ou `?lang=en` dans l'adresse (le choix est retenu), sinon la langue de l'appareil.

## Sauvegarde

Dans le navigateur (`localStorage`, clé `necro_crypte_save`). Le hub Keismey Studio la lit pour afficher la progression, sans jamais l'écrire.
