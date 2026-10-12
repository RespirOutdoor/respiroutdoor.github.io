# Respir Outdoor : plans d'entraînement course à pied

Application proposée à l'entraîneur Respir Outdoor pour remplacer le classeur Excel de suivi (onglets **Plan**, **Légende**, **Allures**, **Protos**). Elle sert à la course à pied en général : route (10 km, semi, marathon), piste, cross, nature ou trail, selon ce que l'entraîneur écrit dans le plan ; rien n'y est propre à une discipline. Elle reprend les principes de l'outil de suivi My Running Lab : un seul fichier `index.html`, aucun serveur, aucune dépendance externe, données stockées uniquement sur l'appareil (IndexedDB, repli localStorage), installable sur téléphone et utilisable hors connexion.

## Ce que fait l'application

| Onglet | Contenu | Équivalent Excel |
|---|---|---|
| **Plan** | Fiche athlète (objectif, contrat S x / 156, VMA, hebdo, dispos, prochaine compétition), semaine par semaine : éveil, éduc, corps de séance, RAC, profil, type, consignes, phase et cycle. Repères calculés automatiquement (zones Z1.1 à Z4, temps par répétition « 5x800M 95% », allure SPE10). Partie athlète : km, durée, RPE, notes. Bilan hebdo (KM hebdo, durée, RPE moyen) et graphique des km par semaine. | Onglet PLAN (colonnes A à S, lignes « KM HEBDO » et « RPE RESSENTI SEMAINE ») |
| **Légende** | Principes, colonnes, profils et types regroupés par famille, avec recherche. Les définitions s'affichent aussi sous chaque séance. | Onglet LEGENDE |
| **Allures** | Zones, évolution de la VMA, tableau VMA / PAL (100 à 500 m, 95 à 120 %), allures spécifiques 10 km / semi / marathon, pré-fatigue, 30"-30". | Onglet ALLURES |
| **Protos** | Bibliothèque de protocoles (commune à tous les athlètes), dates où ils sont prévus, alerte si le plan cite un protocole non décrit. | Onglet PROTOS |
| **Données** | Rôle (entraîneur / athlète), import du classeur Excel, fichier d'échange, export CSV, sauvegarde, thème, autotests. | — |

## Circuit entraîneur ↔ athlète

1. L'entraîneur importe son classeur Excel (Données → « Importer un classeur Excel ») ou crée l'athlète, puis écrit le plan.
2. Il clique « Envoyer le plan à l'athlète » : un fichier `AAAAMMJJ_NOM_PRENOM.json` est produit (partage natif sur téléphone, téléchargement sur ordinateur).
3. L'athlète l'ouvre (« Ouvrir un fichier d'échange » → « Mettre à jour le plan ») : ses retours déjà saisis sont conservés.
4. L'athlète saisit km, durée, RPE et notes, puis « Envoyer mes retours à l'entraîneur ».
5. L'entraîneur l'ouvre (« Récupérer les retours de l'athlète ») : son plan n'est pas écrasé.

Le rôle choisi sur l'appareil ne fait qu'ouvrir la bonne partie de la saisie : **ce n'est pas une protection**, les deux parties sont dans le même fichier.

## Import du classeur Excel

- Lecture seule : le fichier n'est ni modifié ni envoyé sur internet.
- Les cellules sont repérées par leurs libellés (« NOM », « OBJECTIF : », « CONTRAT », « VMA », « ZONES D'ALLURES : », « DISPOS », ligne d'en-tête « DATE »…). Un classeur qui change ces libellés ne sera pas lu correctement.
- Les colonnes CYCLE et SPE, écrites en lettres verticales (« ASSIMIL », « REMISE EN CHARGE PROGRESSIVE »…), sont reconstituées en libellés de semaine. Règle : une lettre par ligne, une ligne vide sépare deux mots, un écart plus grand sépare deux libellés.
- Formules Excel : la dernière valeur calculée enregistrée dans le fichier est lue (les formules ne sont pas recalculées).
- Testé sur le classeur `20261108_MORERA_SYLVAIN.xlsx` : 108 jours renseignés, 6 zones, 3 phases et 4 cycles, 2 tests VMA, chronos 10 km et semi, 45 types, 9 profils, 3 protocoles.

### Écarts constatés dans le classeur (signalés, pas corrigés)

- La VMA utilisée (19,6 km/h, PLAN!G3 et ALLURES!G8) diffère du dernier test de l'historique (19,91 km/h le 11/24). L'application garde 19,6, comme le classeur.
- Certains codes du plan n'existent pas dans la légende : types `EF+`, `FOOT+` (rattachés à EF et FOOT et signalés comme variantes), `VMAC`, `VMAL` (reconnus comme « VMA C » et « VMA L »), `COMP`, `PROTO` ; profils `VARIE`, `SELON SPOT`, `NAT+PLAT`, `FAUX PLAT 5%`, `PLAT BITUME`.
- « PROTOCOLE PRE-COMPET » est prévu les 09/10/2026 et 07/11/2026 mais n'est pas décrit dans l'onglet PROTOS.

## Utilisation

- **Ordinateur** : ouvrir `index.html` dans un navigateur récent (Chrome, Edge, Firefox, Safari).
- **Téléphone, installable** : ouvrir https://respiroutdoor.github.io/ puis l'ajouter à l'écran d'accueil (iPhone : Safari → Partager → « Sur l'écran d'accueil » ; Android : Chrome → menu → « Installer l'application »).
- **Envoyer le projet à Manu sans hébergement** : envoyer le seul fichier `index.html` (le logo y est intégré). Il s'ouvre par double-clic ; seule l'installation sur l'écran d'accueil demande l'HTTPS.

## Tests

- `node tests/run.mjs` : 27 tests du cœur de calcul, valeurs de référence calculées à la main, aucune donnée personnelle.
- Dans l'application : Données → « Lancer les autotests », qui vérifie aussi que chaque bilan hebdo égale la somme directe des séances.

## Charte graphique

Logo : version haute définition insérée dans l'onglet PLAN du classeur. Couleurs mesurées sur le logo fourni (moyenne des pixels, ce ne sont pas des codes officiels) ; elles se changent dans les variables CSS de `index.html`.

| Rôle | Variable | Valeur | Contraste sur blanc |
|---|---|---|---|
| Vert sombre du logo : en-tête, titres, texte | `--sapin` | `#0A322A` | 14,0:1 |
| Vert du lettrage : barres du graphique, filets | `--vert` | `#3A8376` | 4,5:1 |
| Vert du lettrage assombri : boutons, liens | `--vert-fonce` | `#2E6B60` | 6,2:1 |
| Gris-vert du dragon : badges RPE | `--dragon` | `#39564E` | 8,0:1 |

Le graphique n'a qu'une série (km par semaine), donc pas de légende de couleurs. Le vert du logo échoue au critère « saturation minimale » du validateur de palette (il est peu saturé) : choix conservé pour la fidélité au logo, sans conséquence de lisibilité pour une série unique. Les couleurs de familles de types (bordure gauche des séances) sont toujours accompagnées du code écrit.

## Fichiers

- `index.html` : l'application (HTML, CSS et JS, logo intégré, légende par défaut).
- Les protocoles ne sont **pas** intégrés à l'application : l'onglet PROTOS du classeur porte la mention « Protocoles réfléchis et mis sur pied par Respir Outdoor - utilisation et reproduction interdite ». Ils arrivent par l'import du classeur ou le fichier d'échange envoyé par l'entraîneur, et la mention est rappelée dans l'onglet Protos.
- `manifest.json`, `sw.js`, `icons/` : mode installable et hors connexion.
- `FORMULES.md` : formules et correspondance avec les cellules Excel.
- `tests/run.mjs` : tests du cœur de calcul sous Node.

## Pistes non réalisées

- Export au format .xlsx (aujourd'hui : CSV lisible par Excel).
- Synchronisation en ligne entre entraîneur et athlète (aujourd'hui : fichier d'échange).
- Édition de la légende dans l'application (aujourd'hui : par réimport du classeur).
