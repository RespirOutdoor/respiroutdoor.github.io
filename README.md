# Respir Outdoor : plans d'entraînement course à pied

Deux applications, sans serveur à gérer, reliées par un service Google installé dans le compte de l'entraîneur.

| Application | Adresse | Pour qui |
|---|---|---|
| **Respir Outdoor Coach** | https://respiroutdoor.github.io/ | L'entraîneur : tous ses athlètes, import Excel, plan, réactions, mot du coach |
| **My RespirOutdoor** | lien personnel `https://respiroutdoor.github.io/athlete/#RespirOutdoor-Prenom-Nom-CODE` | Chaque athlète : son plan, la saisie de ses séances, son tableau de bord, ses records |

L'application sert à toute la course à pied (route, piste, cross, nature, trail), selon ce que l'entraîneur écrit dans le plan.

## Fonctionnement

1. L'entraîneur importe son classeur Excel (onglets PLAN, LEGENDE, ALLURES, PROTOS) ou crée l'athlète.
2. Il clique **Envoyer le lien** (WhatsApp, SMS, e-mail ou partage du téléphone). L'athlète touche le lien : son plan s'affiche. Il ajoute l'application à son écran d'accueil.
3. Ensuite, tout se synchronise seul, via le service Google :
   - à chaque ouverture et après chaque enregistrement, côté athlète ;
   - toutes les 2 minutes et après chaque modification, côté entraîneur.
4. **Rien n'est écrasé.** Chaque information a un seul propriétaire :
   - l'entraîneur possède la séance, l'éveil, l'éduc, le RAC, le profil, le type, les consignes, la fiche et ses réactions ;
   - l'athlète possède les km, la durée, le D+, le RPE et les notes.

   Conséquences :
   - un nouvel import Excel remplace le plan, jamais les séances déjà saisies ;
   - les valeurs athlète d'un classeur ne remplissent que les jours encore vides ;
   - entre deux appareils d'un même athlète, la saisie la plus récente gagne ;
   - une saisie faite hors connexion part à la connexion suivante.

## Contenu

- **Entraîneur** :
  - tableau « Mes athlètes » : séances réalisées / prévues, km, RPE moyen, dernière saisie, lien ouvert ou non, et ⚠ quand au moins 2 séances prévues des 14 derniers jours sont restées sans retour ;
  - compétitions des 7 prochains jours ;
  - mot du coach à tous, et mot propre à chaque athlète ;
  - plan semaine par semaine, réactions aux séances (👍 💪 🔥… et un mot) ;
  - allures, légende, protocoles ;
  - réglages : synchronisation, import Excel, export CSV, sauvegarde et restauration.
- **Athlète** :
  - accueil : mot du coach, séance du jour avec ses repères calculés, rappel de la séance d'hier non saisie, prochaine compétition ;
  - tableau de bord semaine, mois et année (volume, D+, durée, séances, écart avec la période précédente, prévu sur la période) ;
  - records ;
  - plan, allures, légende, protocoles, en lecture seule ;
  - saisie : distance, durée, D+, RPE sur l'échelle colorée de l'entraîneur, notes.

## Mise en service

Voir [google/GUIDE-INSTALLATION.md](google/GUIDE-INSTALLATION.md). Une fois le service Google installé par l'entraîneur, son adresse `/exec` se met dans `config.json`.

## Développement

- Sources dans `src/`. Les fichiers publiés `index.html` et `athlete/index.html` sont assemblés par `node outils/assembler.mjs` : un seul fichier par application, logo et légende inclus.
- `google/Code.gs` : le service Google (Apps Script).
- Tests :
  - `node tests/run.mjs` : calculs, fusion, bilans, records, liens (exécutés sur les deux fichiers publiés) ;
  - `node tests/serveur.mjs` : service Google sur un tableur simulé.
  - `node outils/verifier-alignement.mjs` : mise en page de toutes les vues sur téléphone (390 et 320 px) : cartes alignées, espacées, sans débordement. `CAPTURES=dossier` enregistre une capture de chaque vue. À lancer à chaque mise à jour de l'affichage.
- Hors connexion : `sw.js` (entraîneur) et `athlete/sw.js` (athlète). Chacun ne supprime que ses propres caches.

## À vérifier sur de vrais téléphones

- **iPhone** : l'icône ajoutée à l'écran d'accueil doit rouvrir le plan sans redemander le lien. Le manifeste athlète ne fixe pas d'adresse de départ, pour garder celle du lien. Si l'iPhone ne la garde pas, l'application propose de coller le lien.
- **iPhone** : le nom « My RespirOutdoor » peut être raccourci sous l'icône.
- **Google Apps Script** : réponse réelle du service (temps, quotas). Les tests utilisent un tableur simulé.

## Charte

Couleurs mesurées sur le logo Respir Outdoor : `#0A322A`, `#3A8376`, `#39564E`. Elles ne viennent pas d'une charte officielle. Les libellés de l'échelle RPE (1 très facile, 2 facile, 4 modéré, 7 difficile, 9 très difficile, 10 effort maximal) viennent de l'image insérée dans l'onglet PLAN du classeur de l'entraîneur. La saisie se fait sur une barre à glisser de 1 à 10 (la barre et les chiffres, sans emoji), avec un dégradé bleu → vert → jaune → orange → rouge → violet → noir (`#4D83C3`, `#519C57`, `#EBC443`, `#E5913B`, `#C53A35`, `#7342AF`, `#111111`, couleurs relevées sur une capture fournie). Les niveaux intermédiaires sont interpolés, et le texte des pastilles passe en blanc ou en noir selon le contraste.

Les protocoles sont la propriété de Respir Outdoor (« utilisation et reproduction interdites ») : ils ne sont pas inclus dans le code et n'arrivent que par l'import du classeur.
