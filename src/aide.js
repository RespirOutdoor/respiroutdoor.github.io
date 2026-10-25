/* ======================================================================
   ASSISTANT D'AIDE (application de l'entraîneur)
   Répond aux questions sur l'utilisation des deux applications, sans
   connexion ni service extérieur : la question est comparée aux mots-clés
   d'une base de réponses rédigée d'après le fonctionnement de l'application.
   ====================================================================== */
var Aide = (function () {
  'use strict';
  // a : bouton facultatif [libellé, adresse de la vue]
  var BASE = [
    { id: 'lien', q: 'Envoyer le lien à un athlète', m: 'lien envoyer envoi partager whatsapp sms mail email inviter acces installer telecharger donner athlete', r:
      '<ol><li>Choisis l\'athlète dans la liste en haut, ou touche sa ligne dans « Semaine en cours ».</li><li>Onglet <b>Plan</b>, puis <b>Envoyer le lien</b>.</li><li>Attends « ✓ Lien actif », puis choisis WhatsApp, SMS, E-mail ou Copier.</li></ol><p>Le message contient le lien et la façon d\'ajouter l\'application à l\'écran d\'accueil. Le lien est personnel : il ne donne accès qu\'au plan de cet athlète.</p>', a: ['Ouvrir le plan', '#/plan'] },
    { id: 'nonreconnu', q: 'L\'athlète voit « Lien non reconnu »', m: 'reconnu marche fonctionne pas erreur invalide valable ouvre ouvrir bloque plan vide connexion service', r:
      '<p>Le service Google ne connaît pas encore ce lien : la fiche de l\'athlète n\'a pas été envoyée depuis ton appareil.</p><ol><li>Regarde la pastille en haut : si elle indique « Synchronisation non configurée », saisis ta clé dans Réglages.</li><li>Touche <b>Synchroniser</b> dans l\'onglet Athlètes.</li><li>Rouvre <b>Envoyer le lien</b> : quand « ✓ Lien actif » s\'affiche, l\'athlète peut toucher « Réessayer ».</li></ol><p>Si tu as créé un nouveau lien entre-temps, renvoie le nouveau.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'appareils', q: 'L\'athlète sur plusieurs appareils', m: 'fichier fichiers trouver trouvent pc portable plusieurs appareils deux ordinateur telephone meme athlete athletes', r:
      '<p>L\'athlète n\'a aucun fichier à chercher. Il ouvre son lien personnel sur chaque appareil voulu (téléphone, ordinateur) : c\'est le même lien partout. Ses séances saisies sur un appareil apparaissent sur l\'autre, et chez toi, après synchronisation.</p>' },
    { id: 'messages', q: 'Échanger des messages avec un athlète', m: 'message messages messagerie ecrire discuter conversation repondre chat question notification non lu', r:
      '<p>Onglet <b>Messages</b> : choisis l\'athlète dans la liste, écris, puis <b>Envoyer</b>. L\'athlète a lui aussi un onglet Messages dans son application.</p><ul><li>Un nombre rouge sur l\'onglet indique les messages non lus ; le tableau « Semaine en cours » affiche ✉ à côté du nom.</li><li>« lu » sous ton message : l\'athlète l\'a ouvert.</li><li>Les messages arrivent quand l\'application est ouverte ; il n\'y a pas de notification sur le téléphone quand elle est fermée.</li></ul><p>La messagerie demande le script Google à jour (version 5).</p>', a: ['Ouvrir les messages', '#/messages'] },
    { id: 'nouveaulien', q: 'Remplacer un lien perdu ou partagé', m: 'nouveau lien perdu remplacer desactiver changer code securite partage vole', r:
      '<p>Onglet <b>Plan</b> → <b>Envoyer le lien</b> → <b>Nouveau lien</b>. L\'ancien lien cesse de fonctionner. Envoie ensuite le nouveau lien à l\'athlète : ses séances déjà saisies sont conservées.</p>', a: ['Ouvrir le plan', '#/plan'] },
    { id: 'excel', q: 'Importer un plan Excel', m: 'importer import excel xlsx classeur fichier plan charger ajouter nouveau tableau', r:
      '<ol><li>Onglet <b>Athlètes</b> → <b>Importer un Excel</b>, puis choisis le fichier .xlsx (onglets PLAN, LEGENDE, ALLURES, PROTOS).</li><li>Si le classeur contient plusieurs onglets de plan (un par contrat ou par objectif), l\'application te demande lequel importer.</li><li>Athlète déjà connu : seule la partie entraîneur des dates de l\'onglet est remplacée. Ses séances saisies, tes réactions, son lien et le plan des autres périodes sont conservés.</li><li>Nouvel athlète : touche <b>Envoyer le lien</b> à la fin de l\'import.</li></ol><p>Le plan part vers le service Google à la synchronisation suivante, qui se lance toute seule.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'contrat', q: 'Passer à un nouveau contrat (nouvel onglet)', m: 'nouveau contrat onglet onglets objectif saison fin ancien anciennes donnees perdre effacer archive historique precedent renouveler', r:
      '<ol><li>Dans ton classeur, crée l\'onglet du nouveau contrat, avec le nom que tu veux (ex. « PLAN 2027 », « 10 KM »). Garde l\'ancien onglet.</li><li>Onglet <b>Athlètes</b> → <b>Importer un Excel</b> → choisis l\'onglet du nouveau contrat.</li></ol><p>Rien n\'est perdu : les séances de l\'ancien contrat (ton plan, ses saisies, tes réactions) restent dans l\'application. Le contrat précédent est archivé : dans le plan, la flèche ◀ depuis la S1 remonte dans ses semaines, avec leur numérotation d\'origine. Les totaux et records de l\'athlète tiennent compte de tout son historique.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'disciplines', q: 'Vélo, natation, marche… saisis par un athlète', m: 'velo natation marche nordique renforcement musculaire discipline sport autre activite activites plus deux seances double repos cross training', r:
      '<p>Un jour de repos (ou sans séance prévue), l\'athlète peut saisir une autre discipline : marche nordique, marche, vélo, natation ou renforcement musculaire. Elle apparaît sur la carte du jour avec son nom (ex. Vélo), avec la vitesse en km/h pour le vélo et l\'allure aux 100 m pour la natation.</p><p>Ces activités ne comptent pas dans les km, durées et records de course à pied : elles sont listées à part dans le bilan de la semaine et dans le tableau de bord de l\'athlète. L\'export CSV a une colonne « Discipline ».</p><p>Un jour avec une séance, l\'athlète peut aussi ajouter une <b>autre activité</b> (ex. footing le matin, renforcement ou vélo l\'après-midi) : elle apparaît sous la séance avec un « + ». Une 2e sortie de course à pied compte dans ses km. Dans le tableur Google, elle figure en fin de note, ex. « [+ Vélo · 25 km · 1:00:00] ».</p>', a: ['Ouvrir le plan', '#/plan'] },
    { id: 'creer', q: 'Créer un athlète sans Excel', m: 'creer nouvel nouveau athlete ajouter fiche manuel main inscrire', r:
      '<p>Onglet <b>Athlètes</b> → <b>Nouvel athlète</b>. Remplis prénom, nom et date de début du contrat (un lundi), puis <b>Enregistrer</b>. Ajoute ensuite les séances depuis l\'onglet Plan avec « Ajouter une séance », puis envoie le lien.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'seance', q: 'Modifier une séance du plan', m: 'modifier seance jour changer corps consigne ajouter supprimer vider eveil educ rac type profil corriger', r:
      '<p>Onglet <b>Plan</b> → choisis la semaine avec les flèches → <b>Modifier</b> sur le jour → <b>Enregistrer</b>. « Vider la séance » retire la partie entraîneur.</p><p>Ce que l\'athlète a saisi (km, durée, RPE, notes) n\'est pas modifiable depuis ton application.</p>', a: ['Ouvrir le plan', '#/plan'] },
    { id: 'reagir', q: 'Réagir à une séance', m: 'reagir reaction emoji commentaire feedback repondre feliciter encourager pouce', r:
      '<p>Onglet <b>Plan</b> → sur une séance saisie par l\'athlète, touche <b>Réagir</b> → choisis un emoji, ajoute un mot si tu veux → <b>Envoyer</b>. L\'athlète le voit sous sa séance à sa prochaine ouverture de l\'application.</p>', a: ['Ouvrir le plan', '#/plan'] },
    { id: 'mot', q: 'Écrire un mot aux athlètes', m: 'mot message tous annonce communiquer ecrire coach motivation information', r:
      '<p><b>À tous :</b> onglet Athlètes → « Mot du coach à tous » → <b>Publier le mot</b>.</p><p><b>À un seul athlète :</b> onglet Plan → <b>Modifier la fiche</b> → « Mot du coach pour cet athlète ».</p><p>Le mot s\'affiche en haut de leur accueil.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'sync', q: 'Synchroniser et lire la pastille d\'état', m: 'synchroniser synchro synchronisation mise jour actualiser rafraichir hors ligne attente envoi recevoir pastille statut', r:
      '<p>La synchronisation se fait seule à l\'ouverture et après chaque modification. Pour la forcer : <b>Synchroniser</b> dans l\'onglet Athlètes.</p><ul><li>« Synchronisé il y a … » : tout est à jour.</li><li>« … envoi(s) en attente » : des changements partiront à la prochaine synchronisation.</li><li>« Hors ligne : … » : pas de connexion au service, réessaie plus tard.</li><li>« Synchronisation non configurée » : saisis ta clé dans Réglages.</li></ul>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'cle', q: 'Utiliser un nouvel ordinateur ou téléphone', m: 'cle entraineur configurer reglages change changer mon appareil pc telephone deux mise jour plan modifie autre apparait pas ordinateur tablette nouveau vide aucun plan apparait retrouver recuperer', r:
      '<ol><li>Ouvre l\'application coach sur le nouvel appareil, onglet <b>Réglages</b>.</li><li>Colle ta clé entraîneur (cellule B1 de l\'onglet « Réglages » de ton tableur Google), puis <b>Enregistrer et tester</b>.</li><li>Touche <b>Synchroniser</b> : tes athlètes, leurs plans et leurs liens sont récupérés depuis le tableur.</li></ol><p>Ensuite, tes appareils restent d\'accord entre eux : une modification du plan ou du mot du coach faite sur l\'un apparaît sur l\'autre à la synchronisation, sans effacer ce qui a été modifié ailleurs. Cela demande le script Google à jour (version 4). Ne partage jamais ta clé.</p>', a: ['Ouvrir les réglages', '#/reglages'] },
    { id: 'script', q: 'Mettre à jour le script Google', m: 'script google apps mettre jour deployer deploiement version code gs service tableur', r:
      '<ol><li>Dans ton tableur Google : <b>Extensions → Apps Script</b>.</li><li>Remplace tout le contenu par le nouveau Code.gs, puis <b>Enregistrer</b>.</li><li><b>Déployer → Gérer les déploiements</b> → crayon → Version : <b>Nouvelle version</b> → <b>Déployer</b>.</li></ol><p>L\'adresse du service et ta clé ne changent pas.</p>' },
    { id: 'nonfaite', q: 'Séances « pas réalisées »', m: 'pas realisee realise non faite manquee annulee absent malade blesse blessure raison', r:
      '<p>Quand un athlète signale une séance « pas réalisée », tu reçois un message à la synchronisation. L\'onglet Athlètes affiche aussi la section « Séances pas réalisées (7 derniers jours) », avec la raison et son message. Tu peux y réagir depuis son plan comme pour une autre séance.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'decalee', q: 'Séances décalées', m: 'decaler decalee decale reporter reportee reporte lendemain demain autre jour plus tard', r:
      '<p>Un athlète qui ne peut pas faire sa séance le jour prévu touche <b>Pas réalisée</b>, puis <b>Je la décale au…</b> et choisit un jour (jusqu\'à 7 jours). Tu le vois dans la section « Séances pas réalisées ou décalées » de l\'onglet Athlètes, avec « pas encore saisie » si la nouvelle date est passée.</p><p>Le jour venu, l\'athlète saisit sa séance depuis son accueil. Elle reste rattachée au jour prévu dans le plan, avec la mention « Faite le … ».</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'alerte', q: 'Que signifie l\'alerte ⚠ ?', m: 'alerte triangle attention sans retour oubli relance retard rouge', r:
      '<p>Le ⚠ devant un athlète signifie qu\'au moins 2 séances prévues des 14 derniers jours n\'ont pas de retour depuis sa dernière saisie. C\'est le moment de le relancer.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'rpe', q: 'Le RPE (ressenti)', m: 'rpe ressenti effort intensite echelle couleur difficulte', r:
      '<p>Le RPE est l\'intensité perçue de la séance, de 1 (très facile) à 10 (effort maximal), noté par l\'athlète environ 30 minutes après la séance avec une barre de couleur. Tu vois le RPE de chaque séance et le RPE moyen de la semaine dans le tableau « Semaine en cours ». L\'échelle est dans l\'onglet Légende.</p>', a: ['Ouvrir la légende', '#/legende'] },
    { id: 'fc', q: 'La fréquence cardiaque moyenne', m: 'fc frequence cardiaque coeur bpm pulsation cardio', r:
      '<p>L\'athlète peut saisir sa FC moyenne (en battements par minute) avec sa séance. Tu la vois sur la séance et dans l\'export CSV. Elle demande le script Google version 2 ou plus.</p>' },
    { id: 'chaussures', q: 'Les chaussures des athlètes', m: 'chaussure chaussures km usure paire baskets', r:
      '<p>Chaque athlète peut ajouter ses paires et suivre leurs kilomètres depuis son accueil. Ces informations restent sur son téléphone : tu ne les vois pas dans ton application.</p>' },
    { id: 'installer', q: 'Installer l\'application sur téléphone', m: 'installer icone ecran accueil application telephone iphone android ordinateur logo raccourci app store', r:
      '<ul><li><b>iPhone</b> (Safari) : bouton Partager → « Sur l\'écran d\'accueil ».</li><li><b>Android</b> (Chrome) : menu ⋮ → « Installer l\'application ».</li></ul><p>L\'icône ouvre l\'application en plein écran et elle fonctionne hors connexion. Ce n\'est pas une application de l\'App Store : elle se met à jour toute seule.</p>' },
    { id: 'export', q: 'Exporter ou sauvegarder', m: 'export exporter csv sauvegarde sauvegarder restaurer json copie backup telecharger', r:
      '<p>Onglet <b>Réglages</b> → « Exports et sauvegarde » :</p><ul><li><b>Plan en CSV</b> : le plan de l\'athlète choisi, lisible dans Excel.</li><li><b>Sauvegarde complète</b> : tous les athlètes, la légende, les protos et les réglages, sauf la clé.</li><li><b>Restaurer une sauvegarde</b> : recharge un fichier de sauvegarde.</li></ul>', a: ['Ouvrir les réglages', '#/reglages'] },
    { id: 'supprimer', q: 'Supprimer un athlète', m: 'supprimer effacer retirer enlever athlete arreter fin', r:
      '<p>Choisis l\'athlète dans la liste en haut, puis onglet <b>Réglages</b> → section Athlètes → <b>Supprimer …</b>. Il est aussi retiré du tableur Google à la synchronisation et son lien ne fonctionne plus.</p>', a: ['Ouvrir les réglages', '#/reglages'] },
    { id: 'compet', q: 'Les compétitions', m: 'competition competitions course comp jour j prochaine dossard', r:
      '<p>Les séances de type <b>COMP</b> sont des compétitions. Celles des 7 prochains jours sont listées dans l\'onglet Athlètes, et l\'athlète voit le compte à rebours (J-…) sur son accueil.</p>', a: ['Ouvrir les athlètes', '#/athletes'] },
    { id: 'allures', q: 'VMA et allures', m: 'allure allures vma zone zones vitesse test chrono demi cooper calcul rp record records', r:
      '<p>Onglet <b>Allures</b> : modifie la VMA, le test et les chronos, les calculs se mettent à jour. Les zones (% de VMA) se règlent dans <b>Modifier la fiche</b>. L\'athlète voit sa VMA (carte « Ma VMA »), les zones et les allures calculées, sans pouvoir les changer. Il saisit lui-même ses records 5 km, 10 km, semi et marathon (« Mes RP ») : ils restent sur son téléphone, tu ne les vois pas.</p>', a: ['Ouvrir les allures', '#/allures'] },
    { id: 'semaine', q: 'Copier une semaine, cycle et phase', m: 'copier semaine cycle phase dupliquer reproduire planif', r:
      '<p>Onglet <b>Plan</b>, sous la semaine affichée : <b>Cycle / phase</b> pour nommer la situation de la semaine, <b>Copier vers…</b> pour recopier la partie entraîneur de cette semaine sur une autre.</p>', a: ['Ouvrir le plan', '#/plan'] },
    { id: 'imprimer', q: 'Imprimer le plan', m: 'imprimer impression pdf papier feuille', r:
      '<p>Onglet <b>Plan</b> → bouton <b>Imprimer</b> sous la semaine. La fenêtre d\'impression de ton appareil s\'ouvre ; elle permet aussi d\'enregistrer en PDF.</p>', a: ['Ouvrir le plan', '#/plan'] },
    { id: 'theme', q: 'Mode sombre ou clair', m: 'theme sombre clair nuit noir blanc affichage couleur', r:
      '<p>Onglet <b>Réglages</b> → Affichage → Thème : « Selon l\'appareil », « Clair » ou « Sombre ».</p>', a: ['Ouvrir les réglages', '#/reglages'] },
    { id: 'donnees', q: 'Où sont stockées les données ?', m: 'donnees confidentialite rgpd stockage securite stockees serveur prive vie privee', r:
      '<p>Les données sont dans ton tableur Google (ton Drive) et sur les appareils où les applications sont ouvertes. Il n\'y a pas d\'autre serveur. Chaque lien d\'athlète ne donne accès qu\'à son propre plan, et seule ta clé entraîneur permet de lire ou modifier l\'ensemble.</p>' },
    { id: 'version', q: 'Voir la dernière version de l\'application', m: 'nouvelle version mise jour application ancienne affiche changement ancien', r:
      '<p>Ferme complètement l\'application, puis rouvre-la. Si l\'ancienne version s\'affiche encore, rouvre-la une seconde fois. C\'est la même chose pour les athlètes.</p>' },
    { id: 'legende', q: 'Légende et protocoles', m: 'legende proto protos protocole protocoles abreviation code signification nouveau actualise mise a jour bibliotheque commun athletes', r:
      '<p>Les onglets <b>Légende</b> et <b>Protos</b> viennent de ton classeur Excel et sont envoyés aux athlètes. Les protocoles se modifient dans l\'onglet Protos.</p>' +
      '<p>Les protocoles forment une <b>bibliothèque commune</b> à tous tes athlètes. À chaque import, l\'onglet PROTOS (ou PROTOCOLES) du classeur ajoute les nouveaux codes et met à jour ceux qui existent ; les autres sont conservés. Chaque protocole commence par son code en colonne A (ex. PC12, PF1C, PV2). Le rapport d\'import indique les protocoles ajoutés et mis à jour. Un classeur ne contenant que tes protocoles (ex. PROTOCOLES.xlsx téléchargé depuis Google Sheets) ou que ta légende s\'importe de la même façon : onglet Protos → <b>Importer des protocoles</b>. La légende est elle aussi complétée et mise à jour code par code ; la famille d\'un type se lit dans la colonne H (en toutes lettres, ex. MARCHE NORDIQUE). Ton fichier PROTOCOLES est la référence : un classeur d\'athlète ne fait qu\'ajouter les codes absents, sans modifier les existants ; à l\'import du fichier PROTOCOLES, les codes que tu en as supprimés sont retirés de l\'application, après confirmation. Les onglets LEGENDE et PROTOS ne sont donc plus nécessaires dans les classeurs d\'athlètes.</p><p>Dans l\'onglet Protos, la barre de recherche trouve un protocole par son code, son titre, sa famille (COTE, FARTLEK…) ou son contenu.</p>' +
      '<p>Dans l\'onglet Protos, ceux prévus dans le plan de l\'athlète choisi s\'affichent en premier, avec leurs dates. L\'athlète voit de même « Dans ton plan » puis les autres.</p>', a: ['Ouvrir les protos', '#/protos'] }
  ];
  var VIDES = ' le la les un une des de du d l au aux et ou a en pour sur dans par avec comment faire fait que quoi qui est je j me mon ma mes on il elle ils ce cette ces se sa son ses peut peux pourquoi quand ou quel quelle quels est-ce y ne pas plus tu te ton ta tes '.replace('pas ', '');
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function racine(m) { return m.length > 4 ? m.replace(/(es|s|x)$/, '').replace(/(e)$/, '') : m; }
  function mots(s) { return norm(s).split(' ').filter(function (m) { return m && VIDES.indexOf(' ' + m + ' ') < 0; }).map(racine); }
  BASE.forEach(function (e) { e._m = mots(e.m); e._q = mots(e.q); });
  // Mots présents dans beaucoup de sujets : ils comptent moins
  var GENERIQUES = mots('athlete athletes seance seances plan application appli');
  // Entrées classées par pertinence : 2 points par mot-clé trouvé (1 pour un mot général), 1 par mot du titre
  function chercher(question) {
    var qm = mots(question);
    return BASE.map(function (e) {
      var s = 0;
      qm.forEach(function (m) { if (e._m.indexOf(m) >= 0) s += GENERIQUES.indexOf(m) >= 0 ? 1 : 2; else if (e._q.indexOf(m) >= 0) s += 1; });
      return { e: e, s: s };
    }).filter(function (x) { return x.s >= 2; }).sort(function (a, b) { return b.s - a.s; });
  }

  var SUGGESTIONS = ['lien', 'excel', 'cle', 'reagir', 'nonfaite', 'sync'];
  var panneau, liste, champ;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function puces(ids) { return '<div class="aide-puces">' + ids.map(function (id) { var e = BASE.filter(function (x) { return x.id === id; })[0]; return '<button type="button" class="aide-puce sec" data-aide="' + id + '">' + esc(e.q) + '</button>'; }).join('') + '</div>'; }
  function ajouter(qui, html) {
    var d = document.createElement('div'); d.className = 'aide-msg ' + qui; d.innerHTML = html;
    liste.appendChild(d); liste.scrollTop = liste.scrollHeight;
  }
  function repondre(e) {
    ajouter('bot', '<b>' + esc(e.q) + '</b>' + e.r + (e.a ? '<p><a class="aide-aller" href="' + e.a[1] + '">' + esc(e.a[0]) + ' →</a></p>' : ''));
  }
  function poser(question) {
    question = String(question || '').trim();
    if (!question) return;
    ajouter('moi', esc(question));
    var r = chercher(question);
    if (!r.length) { ajouter('bot', '<p>Je n\'ai pas de réponse à cette question. Voici les sujets que je connais :</p>' + puces(BASE.map(function (e) { return e.id; }))); return; }
    repondre(r[0].e);
    var autres = r.slice(1, 3).filter(function (x) { return x.s >= r[0].s - 2; }).map(function (x) { return x.e.id; });
    if (autres.length) ajouter('bot', '<p class="aide-voir">Voir aussi :</p>' + puces(autres));
  }
  function ouvrir() {
    panneau.hidden = false; document.getElementById('aideBouton').setAttribute('aria-expanded', 'true');
    if (!liste.children.length) ajouter('bot', '<p>Bonjour ! Pose ta question sur l\'application, avec tes mots. Par exemple :</p>' + puces(SUGGESTIONS));
    setTimeout(function () { champ.focus(); }, 50);
  }
  function fermer() { panneau.hidden = true; document.getElementById('aideBouton').setAttribute('aria-expanded', 'false'); }
  function installer() {
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'aideBouton'; b.className = 'aide-bouton noprint'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'aidePanneau'); b.setAttribute('aria-label', 'Aide');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4V14M12 17h.01"/></svg><span class="aide-txt">Aide</span>';
    panneau = document.createElement('section');
    panneau.id = 'aidePanneau'; panneau.className = 'aide-panneau noprint'; panneau.hidden = true; panneau.setAttribute('role', 'dialog'); panneau.setAttribute('aria-label', 'Aide');
    panneau.innerHTML = '<div class="aide-tete"><b>Aide Respir Outdoor</b><button type="button" class="discret" data-aide-fermer aria-label="Fermer l\'aide">Fermer</button></div>' +
      '<div class="aide-liste" aria-live="polite"></div><form class="aide-form"><label class="sr" for="aideChamp">Ta question</label><input id="aideChamp" autocomplete="off" placeholder="ex. Comment envoyer le lien ?" maxlength="200"><button>Envoyer</button></form>';
    // Bouton dans l'en-tête (à droite du titre) : un bouton flottant masquait « Envoyer » et les boutons en bas des écrans
    var tete = document.querySelector('header.app');
    if (tete) { b.classList.add('aide-entete'); tete.insertBefore(b, tete.querySelector('.titre').nextSibling); } else document.body.appendChild(b);
    document.body.appendChild(panneau);
    liste = panneau.querySelector('.aide-liste'); champ = panneau.querySelector('#aideChamp');
    b.onclick = function () { if (panneau.hidden) ouvrir(); else fermer(); };
    panneau.querySelector('[data-aide-fermer]').onclick = fermer;
    panneau.querySelector('form').onsubmit = function (ev) { ev.preventDefault(); poser(champ.value); champ.value = ''; };
    panneau.addEventListener('click', function (ev) {
      var p = ev.target.closest('[data-aide]');
      if (p) { var e = BASE.filter(function (x) { return x.id === p.dataset.aide; })[0]; ajouter('moi', esc(e.q)); repondre(e); }
      if (ev.target.closest('.aide-aller') && window.matchMedia('(max-width: 700px)').matches) fermer();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !panneau.hidden) fermer(); });
  }
  return { BASE: BASE, chercher: chercher, installer: installer };
})();
Aide.installer();
