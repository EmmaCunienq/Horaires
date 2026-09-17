# Mes horaires

Un widget compact, en français, pour planifier exactement **8 heures de travail effectif**, hors déjeuner. HTML, CSS et JavaScript vanilla, sans dépendance, compte ou backend.

## Lancer localement

Ouvrir `index.html` dans un navigateur suffit pour découvrir le widget. Pour une persistance fiable, utiliser un serveur local depuis ce dossier :

```sh
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000. Aucun build ni installation nécessaire.

## Fonctionnement

- Trois horaires modifiables ; fin de journée calculée immédiatement : début + 480 minutes + durée du déjeuner.
- Valeurs initiales : 08:30, 12:30 et 13:30 → fin à 17:30.
- Frise par cases de 15 minutes, repères horaires, travail en rose soutenu, déjeuner en rose poudré avec un motif, hors travail en gris rosé. Les cases travaillées se rejoignent en bandes continues ; la pause et le hors travail restent séparés. Survoler une case affiche ses intervalles exacts.
- Les saisies restent précises à la minute : une case traversée par une limite affiche les couleurs dans les proportions correspondantes, sans arrondi du temps travaillé.
- La plage s'étend aux heures entières avec au moins 30 minutes de marge, sauf aux limites de la journée (00:00 et 24:00).
- Sur petit écran, les champs passent sur deux colonnes et seule la frise défile horizontalement, au doigt, au pavé tactile ou au clavier après sélection.
- Les dernières saisies sont restaurées via `localStorage` (`mes-horaires.v1`), y compris une saisie temporairement incomplète. Elles restent propres au navigateur et au domaine ; aucun historique quotidien ni synchronisation.
- Si le stockage est bloqué, le calcul reste utilisable et un message le signale. En iframe, les politiques du navigateur peuvent isoler ou bloquer le stockage.

Les horaires doivent appartenir au même jour. Les champs vides, une pause avant le début, une fin de pause antérieure à son début, plus de 8 h avant le déjeuner ou une fin calculée à minuit ou après sont refusés. Une pause de zéro minute est autorisée. Lors d'une erreur, la fin et la frise sont masquées pour éviter tout résultat trompeur.

## GitHub Pages

Le projet est préparé pour le dépôt [EmmaCunienq/Horaires](https://github.com/EmmaCunienq/Horaires).

- Source de publication : branche `main`, dossier racine `/`.
- Le fichier `.nojekyll` permet de servir directement les fichiers statiques, sans Jekyll ni build.
- URL du widget après activation : https://emmacunienq.github.io/Horaires/
- Chaque push sur `main` met à jour le site après le déploiement GitHub Pages.

Pour activer ou contrôler la publication : ouvrir **Settings → Pages → Build and deployment**, choisir **Deploy from a branch**, puis **main** et **/ (root)**. Le statut du déploiement apparaît dans l'onglet **Actions**.

Voir la [documentation GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Autres hébergements statiques

Publier les fichiers `index.html`, `style.css` et `script.js` ensemble, en conservant leurs noms. Aucun secret ni variable d'environnement.

- **Netlify** : déposer le dossier du site dans l'interface de déploiement manuel, ou connecter le dépôt sans commande de build et avec `.` comme dossier publié.
- **Vercel** : importer le dépôt en tant que site statique (preset Other), sans commande de build, et servir la racine du projet.

Les intitulés des interfaces d'hébergement peuvent évoluer. Utiliser l'URL HTTPS publique du déploiement. Ne pas ajouter d'en-tête `X-Frame-Options: DENY` / `SAMEORIGIN`, ni de règle CSP qui empêcherait Notion d'afficher la page dans une iframe.

## Intégrer dans Notion

1. Dans une page Notion, saisir `/embed` et choisir le bloc d'intégration.
2. Coller l'URL HTTPS publique du widget, puis valider.
3. Ajuster la largeur et la hauteur du bloc (environ 400–480 px de hauteur pour un encart étroit).

Une URL locale n'est pas un hébergement public. Les horaires peuvent être différents entre le site ouvert directement et l'intégration Notion selon le partitionnement du stockage du navigateur.

## Vérifications

Les fonctions pures `calculate` et `buildSlots` sont également exportées pour vérification avec Node.js, sans modifier leur fonctionnement dans le navigateur. La page est utilisable au clavier, expose les erreurs et le résultat aux lecteurs d'écran et ne charge aucune ressource externe.

Exécuter les tests (Node.js, sans dépendance) :

```sh
node --test tests/widget.test.cjs
```

Ils couvrent les calculs, les erreurs, plus de 900 combinaisons de frise, les cases partagées à la minute et la persistance avec un DOM et un stockage simulés. Ils ne remplacent pas un essai visuel dans un navigateur : contrôler le rendu à 320, 375, 768 et 1024 px, le défilement de la frise et la restauration après rechargement, puis dans l'Embed Notion.
