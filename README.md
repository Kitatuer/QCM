[README.md](https://github.com/user-attachments/files/29437529/README.md)
# QCM Studio

Application web autonome pour créer, passer, corriger et partager des QCM.

## Utilisation locale

Ouvre `index.html` dans un navigateur.

Fonctions disponibles :

- création de questions à réponse unique ou réponses multiples ;
- correction automatique avec score de réussite configurable ;
- sauvegarde automatique dans le navigateur ;
- import/export JSON ;
- bouton `Copier le lien` pour générer un lien partageable compact.
- mode participant verrouillé quand le QCM est ouvert depuis un lien partagé ;
- saisie du nom ou pseudo avant de répondre au QCM.
- passage question par question avec bouton `Suivant`, puis `Terminer` ;
- panneau admin `Suivi` pour voir les participants, scores et erreurs ;
- stockage en ligne des résultats via Firebase, si `firebase-config.js` est configuré.
- liens participants courts via Firebase (`#quiz=...`) ;
- portail participant listant les QCM actifs (`#join`) ;
- activation/desactivation des QCM depuis le panneau admin.
- chronometre par participant, enregistre avec le resultat pour departager les ex aequo.
- sessions de QCM séparées avec classement filtrable par score puis par temps.
- identification des participants par nom libre, liste imposée, ou combinaison des deux.

## Lien en ligne

Le lien de partage contient le QCM dans l'URL, dans un format compact. Pour qu'il soit accessible à d'autres personnes, héberge simplement ces fichiers statiques (`index.html`, `styles.css`, `app.js`) sur GitHub Pages, Netlify, Vercel ou n'importe quel hébergement web.

Une fois hébergé, crée ton QCM depuis l'adresse en ligne, puis utilise `Copier le lien`.

Ouvre l'adresse simple du site pour administrer et modifier le QCM. Les personnes qui ouvrent le lien partagé compact arrivent directement sur le passage du QCM, sans accès à l'onglet d'édition.

Pour recevoir automatiquement les résultats dans l'onglet `Suivi`, consulte `FIREBASE_STOCKAGE_RESULTATS.md`.
