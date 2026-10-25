# Formules utilisées

Toutes reprennent les formules de l'onglet ALLURES ou PLAN du classeur de l'entraîneur (cellule indiquée). Tests associés : bloc `<script id="core">` de `index.html`, tableau `TESTS` (`node tests/run.mjs`).

| Grandeur | Formule | Cellule Excel | Test (calculé à la main) |
|---|---|---|---|
| Vitesse d'une zone | VMA × % / 100 | PLAN!D6 `=G3*58/100` | Z1.3 : 19,6 × 68 % = 13,328 km/h ; × 72 % = 14,112 km/h |
| Allure (s/km) | 3600 / vitesse (km/h), arrondie à la seconde | — | 13,328 km/h → 270,1 s → 4:30 /km |
| Temps sur une distance à x % de VMA | distance (m) / (VMA × 1000 × x) en heures | ALLURES!G18 `=$E$15*$B18/($C$15*1000*G$17)` | 800 m à 95 % de 19,6 → 154,67 s → 2:35 |
| Distance en 30 s à x % | VMA × 1000 × 30 s × x / 1 h | ALLURES!D95 | 105 % de 19,6 → 171,5 m |
| Allure spécifique | chrono / distance ; vitesse = distance / chrono | ALLURES!F35, F36 | 37:00 / 10 km → 3:42 /km, 16,22 km/h |
| Repère spécifique | VMA × 90 % (10 km), 85 % (semi), 80 % (marathon) | ALLURES!H36, H50, H64 | 19,6 × 90 % = 17,64 km/h |
| Pré-fatigue | VMA × % (75 par défaut) ; temps = distance / vitesse | ALLURES!E77, C83 | 14,7 km/h → 1000 m en 4:05 |
| KM hebdo | somme des km de la semaine | PLAN!P24 `=SUM(O17:O23)` | 14,92 + 9,82 + 14,05 = 38,79 |
| RPE moyen | moyenne des RPE renseignés (les vides sont ignorés, comme AVERAGE) | PLAN!R24 `=AVERAGE(Q17:Q23)` | (2 + 8 + 2) / 3 = 4 |
| Numéro de semaine | ⌊(date − lundi de début) / 7⌋ + 1 | colonne A (S82…) | début 13/01/2025 : 03/08/2026 = S82 |
| Allure moyenne d'une séance | durée / km | — (ajout de l'application) | — |

## Conventions de l'application

- **Arrondis d'affichage** : temps < 2 min au dixième de seconde (« 36,7 s »), sinon m:ss ; allures à la seconde ; 30"-30" au mètre.
- **Pourcentages des zones à l'import** : relus depuis les vitesses calculées par Excel (vitesse / VMA × 100, arrondi au dixième), car le fichier ne conserve que les valeurs.
- **Repères dans une séance** : seuls les motifs écrits explicitement sont reconnus (`Z1.3`, `800M 95%`, `SPE10` / `SPE1/2` / `SPE MAR` avec un chrono renseigné). « 4x1500M Z4 » donne la zone Z4, pas de temps par 1500 m (aucun % écrit). Rien n'est deviné.
- **RPE** : échelle « Intensité de l'effort » de 1 à 10, relevée sur l'image insérée dans l'onglet PLAN (sous « ECHELLE RPE* ») : 1 très facile, 2 facile, 4 modéré, 7 difficile, 9 très difficile, 10 effort maximal ; 3, 5, 6 et 8 n'ont pas de libellé sur l'image. Couleurs des pastilles relevées sur la même image (1-2 vert, 3-5 bleu, 6-8 jaune-orange, 9-10 rouge). Définition reprise de la légende : « niveau d'intensité perçu de la séance, à noter 30 min après la séance ».
- **Date du jour** : calendrier Europe/Paris.

## Tableau de bord, suivi et records

| Grandeur | Règle | Statut |
|---|---|---|
| Périodes | Semaine (lundi → dimanche), mois, année civile, en heure de Paris | convention de l'outil |
| Écart | Période en cours jusqu'à aujourd'hui, comparée à la même durée écoulée de la période précédente (ex. lundi 12/10 comparé au lundi 05/10) | convention de l'outil |
| Séance prévue | Jour avec une partie entraîneur qui n'est pas « REPOS » | convention de l'outil |
| Séance réalisée | Jour avec une distance ou une durée saisie | convention de l'outil |
| Plan suivi | Séances prévues réalisées / séances prévues jusqu'à aujourd'hui | convention de l'outil |
| ⚠ sans retour | Au moins 2 séances prévues des 14 derniers jours, après la dernière saisie, sans saisie | convention de l'outil, modifiable |
| Records | Plus longue sortie, plus longue durée, plus gros D+, plus grosse semaine (lundi → dimanche), meilleure allure moyenne de séance (≥ 10 km, ≥ 5 km), meilleure allure en compétition (type COMP) | définition, calculée sur les seules saisies |
| Records personnels (RP) | Résultats saisis par l'entraîneur (5 km, 10 km, semi 21,0975 km, marathon 42,195 km, 100 km) ; RP = meilleur chrono de la distance ; « ancien RP » = résultat meilleur que tous les précédents à sa date | définition |
| Allure, vitesse, % VMA d'un RP | Allure = chrono / distance ; vitesse = distance / chrono ; % VMA = vitesse / VMA × 100 (VMA actuelle de la fiche) | calcul |
| Progression totale, dernier gain | Premier chrono − RP actuel (et en % du premier chrono) ; RP précédent − RP actuel | calcul |
| Fusion des données | La partie entraîneur vient de l'entraîneur ; la partie athlète vient de l'athlète ; entre deux saisies, la plus récente (horodatage) gagne | convention de l'outil |
| Couleur RPE | Niveau n placé à (n − 1) / 9 du dégradé à 7 couleurs, interpolation linéaire en RVB ; texte blanc ou noir selon le meilleur contraste WCAG | convention de l'outil |
