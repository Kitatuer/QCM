# Stockage gratuit des resultats avec Firebase

Cette option permet aux participants d'envoyer automatiquement leurs resultats dans un panneau admin, meme si le site est heberge sur GitHub Pages.

Firebase propose un plan gratuit, appele Spark. Pour un QCM de petite ou moyenne taille, Cloud Firestore et l'authentification anonyme suffisent largement.

## 1. Creer le projet Firebase

1. Va sur `https://console.firebase.google.com/`.
2. Clique sur `Add project`.
3. Donne un nom au projet, par exemple `qcm-guilde`.
4. Google Analytics est optionnel pour ce projet.

## 2. Ajouter une application Web

1. Dans Firebase, clique sur l'icone Web `</>`.
2. Donne un nom a l'application, par exemple `QCM`.
3. Firebase affiche une configuration `firebaseConfig`.
4. Copie uniquement l'objet de configuration.

## 3. Activer Firestore

1. Va dans `Build > Firestore Database`.
2. Clique sur `Create database`.
3. Choisis le mode de production.
4. Choisis une region proche de toi.

## 4. Activer la connexion anonyme

1. Va dans `Build > Authentication`.
2. Clique sur `Get started`.
3. Dans `Sign-in method`, active `Anonymous`.

## 5. Ajouter les regles Firestore

Dans `Firestore Database > Rules`, colle ces regles :

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /qcmResults/{resultId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
      allow update, delete: if false;
    }

    match /qcmQuizzes/{quizId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null;
      allow delete: if false;
    }
  }
}
```

Ces regles autorisent les participants connectes anonymement a lire les QCM actifs et a envoyer un resultat. Elles permettent aussi au panneau admin de publier et activer/desactiver les QCM. Ne stocke pas de donnees sensibles dans les QCM.

## 6. Configurer le site

Ouvre `firebase-config.js` et remplace :

```js
window.QCM_FIREBASE_CONFIG = null;
```

par la configuration Firebase :

```js
window.QCM_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "ton-projet.firebaseapp.com",
  projectId: "ton-projet",
  appId: "1:..."
};
```

Ensuite, renvoie les fichiers sur GitHub :

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`

## 7. Utilisation

1. L'admin ouvre l'adresse simple du site, par exemple `https://kitatuer.github.io/QCM/`.
2. L'admin cree le QCM, puis clique sur `Publier`.
3. Le bouton `Copier le lien` genere un lien court de type `https://kitatuer.github.io/QCM/#quiz=...`.
4. Le bouton `Portail` copie le lien de la liste des QCM actifs : `https://kitatuer.github.io/QCM/#join`.
5. Le participant ouvre le lien, entre son nom, repond question par question, puis clique sur `Terminer`.
6. Si Firebase est configure, le resultat est envoye automatiquement.
7. L'admin ouvre l'onglet `Suivi` pour voir les participants, scores et erreurs.

Si Firebase n'est pas configure ou si la connexion echoue, le participant peut toujours copier le lien de resultat ou exporter son resultat en JSON.
