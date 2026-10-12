# Installer la synchronisation Google (à faire une seule fois, par Manu)

Durée : 15 à 20 minutes, sur un **ordinateur**, avec le compte Google de Respir Outdoor.

Ce service relie l'application de l'entraîneur aux applications « My RespirOutdoor » des athlètes. Les plans et les séances saisies sont rangés dans un tableur Google de ton Drive, que tu peux ouvrir à tout moment.

> Les libellés des menus Google peuvent changer légèrement. S'il manque un bouton, fais une capture d'écran et demande de l'aide.

## 1. Créer le tableur

1. Ouvre **Google Drive** → **Nouveau** → **Google Sheets** → **Feuille de calcul vierge**.
2. Renomme-le, en haut à gauche : **Respir Outdoor – Données**.

## 2. Coller le script

1. Dans le tableur : menu **Extensions** → **Apps Script**. Un nouvel onglet s'ouvre.
2. En haut à gauche, renomme le projet : **Respir Outdoor**.
3. Dans le fichier **Code.gs**, efface tout le contenu.
4. Ouvre https://github.com/RespirOutdoor/respiroutdoor.github.io/blob/main/google/Code.gs, clique sur l'icône **Copier** (« Copy raw file »), puis colle dans Code.gs.
5. Clique sur l'icône **Enregistrer** (disquette).

## 3. Lancer l'installation

1. Dans la barre d'outils, à côté de « Exécuter », choisis la fonction **installer**, puis clique **Exécuter**.
2. Google demande une autorisation : **Examiner les autorisations** → choisis ton compte.
3. Un écran indique « Google n'a pas validé cette application ». C'est normal pour un script personnel que tu as toi-même collé : clique **Paramètres avancés**, puis **Accéder à Respir Outdoor (non sécurisé)**, puis **Autoriser**.
4. Reviens dans le tableur : des onglets **Athletes**, **Commun** et **Réglages** sont apparus. L'onglet **Réglages** contient ta **clé entraîneur**.

⚠ La clé entraîneur permet de modifier les plans : ne la donne à personne.

## 4. Mettre le service en ligne

1. Dans Apps Script : bouton **Déployer** → **Nouveau déploiement**.
2. Clique sur la roue à côté de « Sélectionner le type » → **Application Web**.
3. Remplis :
   - Description : **Respir Outdoor**
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
4. **Déployer**, puis copie l'**URL de l'application Web**. Elle se termine par `/exec`.

« Tout le monde » veut dire que l'adresse peut être appelée sans compte Google. C'est indispensable pour que les athlètes n'aient rien à créer. Le service refuse quand même toute demande sans code d'athlète ou sans clé entraîneur valable.

## 5. Brancher les applications

1. **Adresse du service** : envoie l'URL `/exec` à Sylvain, qui la met dans le fichier `config.json` du site. Tu peux aussi le faire toi-même : sur GitHub, ouvre `config.json` → crayon → colle l'adresse entre les guillemets de `"service"` → **Commit changes**. Les applications des athlètes la lisent à chaque ouverture.
2. **Ton application** : ouvre https://respiroutdoor.github.io/ → **Réglages** → **Synchronisation**. Vérifie que l'adresse est bien remplie, colle ta **clé entraîneur**, puis clique **Enregistrer et tester**. Le message « ✓ Service joignable et clé acceptée » doit s'afficher.
3. Tous tes athlètes sont alors publiés. Pour chacun : **Plan** → **Envoyer le lien**.

## Mettre à jour le script plus tard

Quand une nouvelle version de `Code.gs` est fournie :

1. Colle-la à la place de l'ancienne dans Apps Script, puis **Enregistrer**.
2. **Déployer** → **Gérer les déploiements** → crayon → Version : **Nouvelle version** → **Déployer**.

L'adresse `/exec` ne change pas.

## Bon à savoir

- **Tes données** : tout est dans le tableur. Il y a un onglet par athlète, nommé `J_NOM_PRENOM`, avec une ligne par jour. Évite de modifier ces onglets à la main : passe par l'application.
- **Quotas** : Google limite gratuitement l'usage d'Apps Script, avec des quotas par jour. Ils n'ont pas été vérifiés pour ce projet. Le volume d'environ 25 athlètes est faible, mais consulte la page « Quotas for Google Services » de Google si un message d'erreur de quota apparaît.
- **RGPD** : les plans et les séances des athlètes (y compris leurs notes) sont hébergés dans ton compte Google. Informe tes athlètes de ce qui est conservé, où, et pendant combien de temps.
