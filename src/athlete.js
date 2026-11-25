/* ======================================================================
   APPLICATION ATHLÈTE (My RespirOutdoor)
   Le lien envoyé par l'entraîneur contient le code personnel de l'athlète :
   …/athlete/#RespirOutdoor-Prenom-Nom-CODE. L'adresse n'est jamais modifiée
   par l'application, pour que l'icône de l'écran d'accueil garde le code.
   ====================================================================== */
(function () {
  'use strict';
  var C = Core, esc = UI.esc, $ = UI.$, $$ = UI.$$, toast = UI.toast, auj = UI.auj;
  var Store = UI.creerStore('my-respiroutdoor');
  var A = { code: '', athlete: null, commun: { legende: null, protos: [], motGlobal: '' }, enAttente: {}, sync: { derniere: '', erreur: '' }, lienInvalide: false, reglages: { theme: '' } };
  var config = {}, vue = 'accueil', semaineAffichee = null, enCours = null;
  var main = document.getElementById('contenu'), boite = document.getElementById('boite');
  UI.init({ legende: function () { return A.commun.legende || DEFAUTS.legende; }, protos: function () { return A.commun.protos || []; } });

  function sauver() { return Store.enregistrer(A).catch(function (e) { toast('Enregistrement impossible : ' + e.message); }); }

  /* ---------- Synchronisation ---------- */
  function synchroniser(manuel) {
    if (!A.code) return Promise.resolve();
    if (enCours) return enCours;
    var url = config.service;
    rendreStatut('en cours');
    enCours = Promise.resolve()
      .then(function () {
        var dates = Object.keys(A.enAttente || {});
        if (!dates.length || !A.athlete) return;
        var jours = {};
        dates.forEach(function (d) {
          var j = A.athlete.jours[d] || {}, p = {};
          C.CHAMPS_ATHLETE.forEach(function (k) { p[k] = j[k] === undefined ? null : j[k]; });
          p.majA = j.majA || UI.maintenant();
          jours[d] = p;
        });
        return UI.appelService(url, { action: 'athlete.saisir', code: A.code, jours: jours }).then(function (r) {
          dates.forEach(function (d) { if (A.enAttente[d] && (r.jours[d] || r.refuses.indexOf(d) >= 0)) delete A.enAttente[d]; });
        });
      })
      .then(function () { return UI.appelService(url, { action: 'athlete.lire', code: A.code }); })
      .then(function (res) {
        var recu = Object.assign({}, res.athlete.fiche || {}, { id: res.athlete.id, prenom: res.athlete.prenom, nom: res.athlete.nom, motCoach: res.athlete.motCoach, jours: res.jours || {} });
        A.athlete = A.athlete && A.athlete.id === recu.id ? C.fusionner(A.athlete, recu, 'serveur', { enAttente: A.enAttente }) : C.fusionner(null, recu, 'remplacer');
        A.commun = res.commun || A.commun;
        A.sync = { derniere: UI.maintenant(), erreur: '' }; A.lienInvalide = false;
        if (manuel) toast('Plan à jour');
        return true;
      })
      .catch(function (e) {
        A.sync.erreur = e.message;
        if (/lien inconnu/.test(e.message)) A.lienInvalide = true;
        if (manuel) toast('Synchronisation impossible : ' + e.message);
        return false;
      })
      .then(function (ok) {
        enCours = null;
        if (ok) verifierReactions();
        return sauver().then(function () { rendreStatut(); if (!boite.open && (ok || !A.athlete || A.lienInvalide)) rendre(); if (ok) chargerMessages(vue === 'messages'); });
      });
    return enCours;
  }
  function rendreStatut(etat) {
    var el = $('#statutSync');
    if (!el) return;
    var n = Object.keys(A.enAttente || {}).length, t, cls = '';
    if (!A.code) { el.hidden = true; return; }
    el.hidden = false;
    if (etat === 'en cours') t = 'Mise à jour…';
    else if (A.lienInvalide) { t = 'Lien non reconnu'; cls = 'attention'; }
    else if (A.sync.erreur) { t = (navigator.onLine === false ? 'Hors connexion' : 'Pas de connexion au service') + (n ? ' · ' + n + ' saisie(s) en attente d\'envoi' : ''); cls = 'attention'; }
    else t = (A.sync.derniere ? 'À jour ' + UI.ilYa(A.sync.derniere) : 'Pas encore synchronisé') + (n ? ' · ' + n + ' saisie(s) en attente' : '');
    el.textContent = t; el.className = 'statut ' + cls;
  }

  /* ---------- Rendu ---------- */
  function rendre() {
    var a = A.athlete;
    $('#bonjour').textContent = a ? 'Bonjour ' + UI.prenom(a) + ' !' : '';
    $$('nav.onglets button').forEach(function (b) { if (b.dataset.v === vue) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('nav.onglets').hidden = !a;
    rendreStatut();
    if (!A.code || (A.lienInvalide && !a)) { main.innerHTML = vueBienvenue(); brancherBienvenue(); return; }
    if (!a) {
      main.innerHTML = '<section class="carte vide"><h2>Chargement de ton plan…</h2><p class="muet">' + (A.sync.erreur ? 'Impossible de joindre le service : ' + esc(A.sync.erreur) + '. Vérifie ta connexion puis réessaie.' : 'Un instant.') + '</p>' +
        (A.sync.erreur ? '<button data-act="sync">Réessayer</button>' : '') + '</section>';
      return;
    }
    if (A.lienInvalide) main.innerHTML = '<p class="alerte">Ce lien n\'est plus reconnu : ton entraîneur a peut-être créé un nouveau lien. Ouvre le dernier lien qu\'il t\'a envoyé.</p>';
    else main.innerHTML = '';
    var cont = document.createElement('div'); main.appendChild(cont);
    majPastilles();
    ({ accueil: vueAccueil, plan: vuePlan, messages: vueMessages, allures: function (m) { UI.vueAllures(m, a, false, null, { rp: enregistrerRP }); }, legende: function (m) { UI.vueLegende(m); }, protos: function (m) { UI.vueProtos(m, a, false); } }[vue] || vueAccueil)(cont);
  }

  function vueBienvenue() {
    return '<section class="carte vide"><img src="' + $('header.app img').src + '" alt=""><h2>Bienvenue sur My RespirOutdoor</h2>' +
      (A.lienInvalide ? '<p class="alerte">Ce lien n\'est pas reconnu. Soit ton entraîneur n\'a pas encore envoyé ton plan (son application doit être synchronisée), soit il a créé un nouveau lien. Réessaie dans un moment, ou demande-lui de te renvoyer le lien.</p><p><button type="button" data-act="sync">Réessayer</button></p>' : '') +
      '<p class="muet">Ouvre le lien personnel envoyé par ton entraîneur. Tu peux aussi le coller ici :</p>' +
      '<form id="fCode" class="ligne" style="justify-content:center"><label class="sr" for="code">Lien ou code</label><input id="code" style="max-width:420px" placeholder="https://respiroutdoor.github.io/athlete/#RespirOutdoor-…" autocomplete="off"><button>Ouvrir mon plan</button></form></section>';
  }
  function brancherBienvenue() {
    var f = $('#fCode');
    if (f) f.onsubmit = function (ev) {
      ev.preventDefault();
      var c = C.codeDepuisLien($('#code').value);
      if (!c) { toast('Lien ou code non reconnu'); return; }
      changerCode(c);
    };
  }
  function changerCode(c) {
    if (c !== A.code) { A.code = c; A.athlete = null; A.enAttente = {}; A.sync = { derniere: '', erreur: '' }; A.messages = []; A.messagesConnus = false; A.reactionsVues = null; A.reactionsSignalees = {}; }
    A.lienInvalide = false;
    sauver().then(function () { rendre(); synchroniser(false); });
  }

  /* ---------- Réactions de l'entraîneur pas encore vues ---------- */
  function reactionsNouvelles() {
    var a = A.athlete, vues = A.reactionsVues || {};
    if (!a) return [];
    return Object.keys(a.jours || {}).filter(function (d) { var r = C.texte(a.jours[d].reaction); return r && vues[d] !== r; }).sort().reverse();
  }
  function verifierReactions() {
    var a = A.athlete; if (!a) return;
    if (!A.reactionsVues) { A.reactionsVues = {}; Object.keys(a.jours || {}).forEach(function (d) { if (a.jours[d].reaction) A.reactionsVues[d] = a.jours[d].reaction; }); return; }
    var n = reactionsNouvelles(), dejaSignalees = A.reactionsSignalees || {};
    var inedites = n.filter(function (d) { return dejaSignalees[d] !== a.jours[d].reaction; });
    if (inedites.length) {
      toast('💬 Ton entraîneur a réagi à ' + (inedites.length > 1 ? inedites.length + ' séances' : 'ta séance du ' + UI.jourCourt(inedites[0])));
      A.reactionsSignalees = A.reactionsSignalees || {};
      inedites.forEach(function (d) { A.reactionsSignalees[d] = a.jours[d].reaction; });
    }
  }
  function marquerReactionsVues() {
    var a = A.athlete; A.reactionsVues = A.reactionsVues || {};
    reactionsNouvelles().forEach(function (d) { A.reactionsVues[d] = a.jours[d].reaction; });
    sauver().then(rendre);
  }
  function carteReactions() {
    var a = A.athlete, n = reactionsNouvelles();
    if (!n.length) return '';
    return '<section class="carte nouveau"><div class="ligne"><h3 class="espace" style="margin:0">💬 Ton entraîneur a réagi</h3><button class="sec" data-act="reactionsVues">Vu</button></div><ul class="liste-nf">' +
      n.slice(0, 5).map(function (d) { var j = a.jours[d]; return '<li><div class="petit">' + esc(UI.jourCourt(d)) + (j.corps ? ' · ' + esc(j.corps) : '') + '</div><div class="reaction">' + esc(j.reaction) + '</div></li>'; }).join('') +
      '</ul></section>';
  }

  /* ---------- MESSAGES avec l'entraîneur ---------- */
  var chargementMessages = null;
  function nonLus() { return (A.messages || []).filter(function (m) { return m.de === 'coach' && !m.lu; }).length; }
  function majPastilles() {
    [['accueil', reactionsNouvelles().length], ['messages', nonLus()]].forEach(function (x) {
      var b = $('nav.onglets button[data-v="' + x[0] + '"]'); if (!b) return;
      var p = b.querySelector('.pastille');
      if (!x[1]) { if (p) p.remove(); return; }
      if (!p) { p = document.createElement('span'); p.className = 'pastille'; b.appendChild(p); }
      p.textContent = x[1] > 9 ? '9+' : x[1]; p.setAttribute('aria-label', x[1] + ' nouveau(x)');
    });
  }
  function chargerMessages(lus) {
    if (!A.code || !config.service || chargementMessages) return chargementMessages || Promise.resolve();
    var avant = {}; (A.messages || []).forEach(function (m) { avant[m.id] = 1; });
    chargementMessages = UI.appelService(config.service, { action: 'athlete.messages', code: A.code, lus: !!lus }).then(function (r) {
      var nouveaux = (r.messages || []).filter(function (m) { return m.de === 'coach' && !avant[m.id] && !m.lu; });
      A.messages = r.messages || []; A.messagerie = 'ok';
      if (nouveaux.length && A.messagesConnus && vue !== 'messages') toast('✉ Nouveau message de ton entraîneur');
      A.messagesConnus = true;
    }, function (e) { if (/action inconnue/.test(e.message)) A.messagerie = 'indispo'; })
      .then(function () { chargementMessages = null; return sauver(); })
      .then(function () { majPastilles(); if (vue === 'messages' && !boite.open) dessinerFil(); });
    return chargementMessages;
  }
  function heureMsg(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function dessinerFil() {
    var fil = $('#fil'); if (!fil) return;
    var ms = A.messages || [];
    fil.innerHTML = ms.length ? ms.map(function (m) {
      return '<div class="bulle ' + (m.de === 'athlete' ? 'moi' : 'lui') + '"><div class="txt">' + esc(m.texte) + '</div><div class="quand">' + heureMsg(m.envoye) + (m.de === 'athlete' && m.lu ? ' · lu' : '') + '</div></div>';
    }).join('') : '<p class="muet" style="text-align:center">Pas encore de message. Écris à ton entraîneur ici : il le verra dans son application.</p>';
    fil.scrollTop = fil.scrollHeight;
  }
  function vueMessages(m) {
    if (A.messagerie === 'indispo') { m.innerHTML = '<section class="carte"><h2>Messages</h2><p class="muet">La messagerie sera disponible dès que ton entraîneur aura mis à jour son service Google.</p></section>'; return; }
    m.innerHTML = '<section class="carte messagerie"><h2>Messages avec ton entraîneur</h2><div id="fil" class="fil" aria-live="polite"></div>' +
      '<form id="fMsg" class="envoi"><label class="sr" for="msgTexte">Ton message</label><textarea id="msgTexte" maxlength="2000" rows="2" placeholder="Écris ton message…"></textarea><button>Envoyer</button></form></section>';
    dessinerFil();
    if (nonLus() || !A.messagesConnus) chargerMessages(true);
    $('#fMsg').onsubmit = function (ev) {
      ev.preventDefault();
      var t = $('#msgTexte'), texte = t.value.trim(), btn = $('#fMsg button');
      if (!texte) return;
      btn.disabled = true;
      UI.appelService(config.service, { action: 'athlete.ecrire', code: A.code, texte: texte }).then(function (r) {
        A.messages = (A.messages || []).concat([r.message]); t.value = ''; dessinerFil(); sauver();
      }, function (e) { toast(/action inconnue/.test(e.message) ? 'Messagerie pas encore disponible' : 'Message non envoyé : vérifie ta connexion'); })
        .then(function () { btn.disabled = false; });
    };
  }

  /* ---------- ACCUEIL : tableau de bord ---------- */
  function prochaineSeance(a, apres) {
    var ds = Object.keys(a.jours || {}).filter(function (d) { return d > apres && C.estPrevue(a.jours[d]); }).sort();
    return ds.length ? ds[0] : null;
  }
  // Tableau de bord : une colonne par période (semaine, mois, année), une ligne par mesure, écart avec la période précédente
  function tableauBilan(a, aj) {
    var per = C.periodes(aj), duree = function (x) { return C.formatDuree(x); };
    var cols = [['Semaine', per.semaine], ['Mois', per.mois], ['Année', per.annee]].map(function (x) {
      var p = x[1];
      return { titre: x[0], p: p, cur: C.bilanPeriode(a, p.du, p.au, aj), prec: C.bilanPeriode(a, p.precDu, p.precAu) };
    });
    function ec(v, prec, f) { var d = (v || 0) - (prec || 0); return '<span class="ecart">' + (!d ? '=' : (d > 0 ? '+' : '−') + f(Math.abs(d))) + '</span>'; }
    var lignes = [
      ['Volume', function (c) { return C.nombreFR(c.cur.km, 1) + ' km' + ec(c.cur.km, c.prec.km, function (x) { return C.nombreFR(x, 1); }); }],
      ['D+', function (c) { return Math.round(c.cur.dplus) + ' m' + ec(c.cur.dplus, c.prec.dplus, function (x) { return Math.round(x); }); }],
      ['Durée', function (c) { return (c.cur.dureeSec ? duree(c.cur.dureeSec) : '0:00:00') + ec(c.cur.dureeSec, c.prec.dureeSec, duree); }],
      ['Séances', function (c) { return c.cur.seances + ec(c.cur.seances, c.prec.seances, String); }],
      ['Plan suivi', function (c) { return c.cur.prevuesADate ? c.cur.prevuesFaites + ' / ' + c.cur.prevuesADate : '—'; }]
    ];
    // Vélo, natation, marche… : comptés à part, hors volume de course à pied
    if (cols.some(function (c) { return c.cur.autres || c.prec.autres; }))
      lignes.splice(4, 0, ['Autres activités', function (c) { return c.cur.autres + ec(c.cur.autres, c.prec.autres, String); }]);
    return '<section class="carte"><h3>Tableau de bord</h3><div class="tableau"><table class="bilan-tab"><thead><tr><th></th>' +
      cols.map(function (c, i) {
        var sous = i === 0 ? C.formatDateFR(c.p.du).slice(0, 5) + '–' + C.formatDateFR(c.p.au).slice(0, 5) : i === 1 ? new Date(c.p.du + 'T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' }) : c.p.du.slice(0, 4);
        return '<th class="num">' + c.titre + '<small>' + sous + '</small></th>';
      }).join('') +
      '</tr></thead><tbody>' + lignes.map(function (l) { return '<tr><th scope="row">' + l[0] + '</th>' + cols.map(function (c) { return '<td class="num">' + l[1](c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muet petit" style="margin:10px 0 0">Écarts par rapport à la période précédente de même durée. Plan suivi : séances prévues réalisées / prévues jusqu\'à aujourd\'hui.' + (cols.some(function (c) { return c.cur.autres || c.prec.autres; }) ? ' Volume, D+, durée et séances : course à pied uniquement.' : '') + '</p></section>';
  }

  /* ---------- Chaussures (enregistrées sur ce téléphone) ---------- */
  function chaussures() { A.chaussures = A.chaussures || { liste: [], parDate: {}, defaut: '' }; A.chaussures.parDate = A.chaussures.parDate || {}; return A.chaussures; }
  function carteChaussures(a) {
    var ch = chaussures(), km = C.kmChaussures(ch, a.jours), actives = ch.liste.filter(function (c) { return !c.retiree; });
    var h = '<section class="carte"><div class="ligne"><h3 class="espace" style="margin:0">Mes chaussures</h3><button class="sec" data-act="chaussures">' + (ch.liste.length ? 'Gérer' : 'Ajouter une paire') + '</button></div>';
    if (!actives.length) return h + '<p class="muet petit" style="margin:10px 0 0">Ajoute tes paires pour suivre les kilomètres parcourus avec chacune. Tu choisiras la paire à chaque séance saisie.</p></section>';
    return h + '<ul class="paires" style="margin-top:12px">' + actives.map(function (c) { return htmlPaire(c, km[c.id] || 0, ch.defaut === c.id, false); }).join('') + '</ul>' +
      '<p class="muet petit" style="margin:0">Enregistré sur ce téléphone uniquement : ton entraîneur ne le voit pas.</p></section>';
  }
  // Une paire : nom (et « Par défaut »), km parcourus / seuil, jauge ; bouton Modifier dans la fenêtre de gestion
  function htmlPaire(c, k, defaut, modifiable) {
    var lim = C.isNum(c.limite) && c.limite > 0 ? c.limite : null, pct = lim ? Math.min(100, Math.round(k / lim * 100)) : 0;
    return '<li class="paire' + (c.retiree ? ' retiree' : '') + '"><div class="paire-info"><div class="paire-nom"><b>' + esc(c.nom) + '</b>' + (defaut ? '<span class="etiquette">Par défaut</span>' : '') + '</div>' +
      '<div class="paire-km"><b>' + C.nombreFR(k, 1) + ' km</b>' + (lim ? '<span class="muet"> / ' + C.nombreFR(lim, 0) + ' km</span>' + (k >= lim && !c.retiree ? '<span class="a-changer">à changer ?</span>' : '') : '') + '</div>' +
      (lim && !c.retiree ? '<div class="jauge' + (k >= lim ? ' pleine' : '') + '"><span style="width:' + pct + '%"></span></div>' : '') + '</div>' +
      (modifiable ? '<button type="button" class="discret" data-ch="modif" data-id="' + esc(c.id) + '">Modifier</button>' : '') + '</li>';
  }
  // Gestion des paires : liste (km, seuil, jauge), paires retirées à part, formulaire ouvert seulement pour ajouter ou modifier
  function gererChaussures(edition) {
    var ch = chaussures(), km = C.kmChaussures(ch, (A.athlete || {}).jours);
    var enService = ch.liste.filter(function (c) { return !c.retiree; }), retirees = ch.liste.filter(function (c) { return c.retiree; });
    var c0 = edition && edition !== 'nouvelle' ? ch.liste.filter(function (x) { return x.id === edition; })[0] : null;
    function ligne(c) { return htmlPaire(c, km[c.id] || 0, ch.defaut === c.id, true); }
    var h = '<form class="boite saisie chaussures" novalidate><h2>Mes chaussures</h2><p class="sous-titre">Choisis la paire utilisée à chaque séance : ses kilomètres s\'ajoutent ici.</p>';
    if (!edition) {
      h += (enService.length ? '<ul class="paires">' + enService.map(ligne).join('') + '</ul>' : '<p class="muet">Aucune paire en service.</p>') +
        (retirees.length ? '<details class="retirees"><summary>Paires retirées (' + retirees.length + ')</summary><ul class="paires">' + retirees.map(ligne).join('') + '</ul></details>' : '') +
        '<button type="button" class="sec plein" data-ch="ajouter">+ Ajouter une paire</button>' +
        '<p class="muet petit" style="margin:12px 0 0">Enregistré sur ce téléphone uniquement : ton entraîneur ne le voit pas.</p>' +
        '<div class="pied"><button type="button" data-ch="fermer">Fermer</button></div>';
    } else {
      h += '<h3>' + (c0 ? 'Modifier « ' + esc(c0.nom) + ' »' : 'Nouvelle paire') + '</h3>' +
        '<label>Nom<input name="nom" maxlength="60" placeholder="ex. Pegasus 41" autocomplete="off" value="' + esc(c0 ? c0.nom : '') + '"></label>' +
        '<div class="champs"><label>Km déjà parcourus<input name="kmDepart" inputmode="decimal" placeholder="0" value="' + (c0 && C.isNum(c0.kmDepart) && c0.kmDepart ? C.nombreFR(c0.kmDepart) : '') + '"></label>' +
        '<label>Seuil d\'alerte (km)<input name="limite" inputmode="decimal" placeholder="800" value="' + (c0 && C.isNum(c0.limite) ? C.nombreFR(c0.limite) : '') + '"></label></div>' +
        '<label class="choix"><input type="checkbox" name="defaut"' + (c0 ? (ch.defaut === c0.id ? ' checked' : '') : (enService.length ? '' : ' checked')) + '><span>Paire proposée par défaut à la saisie</span></label>' +
        (c0 ? '<label class="choix"><input type="checkbox" name="retiree"' + (c0.retiree ? ' checked' : '') + '><span>Paire retirée (plus proposée à la saisie, km conservés)</span></label>' : '') +
        '<p class="alerte" id="erreurCh" hidden></p><div class="pied">' + (c0 ? '<button type="button" class="danger" data-ch="suppr">Supprimer</button>' : '') +
        '<button type="button" class="sec" data-ch="retour">Annuler</button><button>Enregistrer</button></div>';
    }
    h += '</form>';
    boite.innerHTML = h; if (!boite.open) boite.showModal();
    var f = $('form', boite);
    if (edition && !c0) f.elements.nom.focus();
    f.onclick = function (ev) {
      var b = ev.target.closest('[data-ch]'); if (!b) return;
      var act = b.dataset.ch;
      if (act === 'fermer') { boite.close(); rendre(); }
      else if (act === 'ajouter') gererChaussures('nouvelle');
      else if (act === 'modif') gererChaussures(b.dataset.id);
      else if (act === 'retour') gererChaussures();
      else if (act === 'suppr') {
        if (!confirm('Supprimer « ' + c0.nom + ' » ? Les séances associées n\'auront plus de paire.')) return;
        ch.liste = ch.liste.filter(function (x) { return x.id !== c0.id; });
        Object.keys(ch.parDate).forEach(function (d) { if (ch.parDate[d] === c0.id) delete ch.parDate[d]; });
        if (ch.defaut === c0.id) ch.defaut = '';
        sauver().then(function () { gererChaussures(); });
      }
    };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var nom = String(f.elements.nom.value || '').trim(), kd = C.parseNumberFR(f.elements.kmDepart.value), li = C.parseNumberFR(f.elements.limite.value), err = [];
      if (!nom) err.push('Donne un nom à la paire');
      if (kd !== null && !(kd >= 0 && kd < 20000)) err.push('Km déjà parcourus : nombre attendu');
      if (li !== null && !(li > 0 && li < 20000)) err.push('Seuil : nombre de km attendu');
      if (err.length) { var e = $('#erreurCh', f); e.hidden = false; e.textContent = err.join(' · '); return; }
      var c = c0;
      if (!c) { c = { id: 'ch' + Date.now().toString(36) }; ch.liste.push(c); }
      c.nom = nom; c.kmDepart = kd || 0; c.limite = li === null ? 800 : li; c.retiree = !!(f.elements.retiree && f.elements.retiree.checked);
      if (f.elements.defaut.checked) ch.defaut = c.id; else if (ch.defaut === c.id) ch.defaut = '';
      if (c.retiree && ch.defaut === c.id) ch.defaut = '';
      sauver().then(function () { toast('Paire enregistrée'); gererChaussures(); });
    };
  }
  /* ---------- ACCUEIL : tableau de bord en tuiles (« bento ») ----------
     Bannière (bonjour, mot du coach), semaine en pastilles, tuiles chiffrées (km, durée, plan suivi, VMA),
     séance du jour, compétition, messages, puis tableau détaillé, stats et chaussures. */
  function kmCourse(j) { return C.seancesDuJour(j).reduce(function (t, x) { return t + (x.code === 'course' && C.isNum(x.km) ? x.km : 0); }, 0); }
  function vueAccueil(m) {
    var a = A.athlete, aj = auj(), j = a.jours[aj] || {}, lun = C.weekStart(aj), sem = UI.semaineDe(a, aj);
    var bil = C.bilanPeriode(a, lun, C.addDays(lun, 6), aj);
    var vient = vientDeFaire && Date.now() - vientDeFaire.t < 400 ? Math.max(1, Date.now() - vientDeFaire.t) : 0;
    var h = '<div class="bento">';

    // Bannière : bonjour, objectif, mot du coach (à tous puis personnel), actions
    var motTous = C.texte(A.commun.motGlobal), motPerso = C.texte(a.motCoach);
    h += '<section class="carte b-hero"><div class="b-hero-txt"><p class="b-sur">' + (sem > 0 ? 'Semaine ' + sem + (a.contratSemaines ? ' / ' + a.contratSemaines : '') : 'Ton plan') + (C.texte(a.objectif) ? ' · ' + esc(a.objectif) : '') + '</p>' +
      '<h2>Bonjour ' + esc(UI.prenom(a) || '') + ' !</h2>' +
      (motTous || motPerso ? '<div class="b-mot"><span class="b-mot-titre">Le mot de ton coach</span>' + (motTous ? '<p>' + esc(A.commun.motGlobal) + '</p>' : '') + (motPerso ? '<p class="mot-perso">' + esc(a.motCoach) + '</p>' : '') + '</div>' : '') +
      '<div class="b-actions"><button data-act="saisir" data-date="' + aj + '">' + (C.aRetour(j) ? 'Modifier ma séance' : 'Saisir ma séance') + '</button><button class="sec" data-act="allerJour" data-date="' + aj + '">Voir mon plan</button></div></div></section>';

    // Semaine en pastilles : une par jour, couleur du type de séance, état (faite, pas réalisée, repos)
    h += '<section class="carte b-semaine"><div class="ligne"><h3 class="espace" style="margin:0">' + (sem > 0 ? 'Semaine ' + sem : 'Cette semaine') + '</h3><span class="muet petit">' + C.formatDateFR(lun).slice(0, 5) + ' – ' + C.formatDateFR(C.addDays(lun, 6)).slice(0, 5) + '</span></div><div class="b-jours">' +
      [0, 1, 2, 3, 4, 5, 6].map(function (k) {
        var d = C.addDays(lun, k), x = a.jours[d] || {}, coul = UI.couleurFam(x.type);
        var etat = C.nonRealisee(x) ? 'non' : C.aRetour(x) ? 'fait' : C.estRepos(x) || !C.aContenuCoach(x) ? 'repos' : 'prevu';
        var titre = UI.jourCourt(d) + ' · ' + (C.aContenuCoach(x) ? C.texte(x.corps) : 'pas de séance') + ({ fait: ' · faite', non: ' · pas réalisée', repos: '', prevu: '' })[etat];
        return '<button type="button" class="b-jour ' + etat + (d === aj ? ' auj' : '') + (vient && d === vientDeFaire.date && etat === 'fait' ? ' vient' : '') + '" data-act="allerJour" data-date="' + d + '" title="' + esc(titre) + '" aria-label="' + esc(titre) + '"' + (coul ? ' style="--fam:' + coul + '"' : '') + '>' +
          '<span class="b-j">' + C.JOURS[k].charAt(0) + '</span><span class="b-n">' + Number(d.slice(8)) + '</span><span class="b-pt" aria-hidden="true"' + (vient && d === vientDeFaire.date ? ' style="animation-delay:' + (120 - vient) + 'ms"' : '') + '>' + (etat === 'fait' ? '✓' : etat === 'non' ? '✕' : '') + '</span></button>';
      }).join('') + '</div>' +
      '<p class="muet petit b-legende"><span class="b-l fait">✓</span> faite <span class="b-l non">✕</span> pas réalisée <span class="b-l prevu"></span> prévue</p></section>';

    // Tuiles chiffrées de la semaine (course à pied)
    var kms = [0, 1, 2, 3, 4, 5, 6].map(function (k) { return kmCourse(a.jours[C.addDays(lun, k)]); }), kmax = Math.max.apply(null, kms.concat([1]));
    var pct = bil.prevuesADate ? Math.round(bil.prevuesFaites / bil.prevuesADate * 100) : null;
    h += '<section class="carte b-tuile b-km"><span class="etiq">Volume semaine</span><b class="b-val">' + C.nombreFR(bil.km, 1) + '<small>km</small></b>' +
      '<div class="b-barres" aria-hidden="true">' + kms.map(function (v, k) { return '<span class="' + (C.addDays(lun, k) === aj ? 'auj' : '') + '" style="height:' + Math.max(4, Math.round(v / kmax * 100)) + '%"></span>'; }).join('') + '</div></section>';
    h += '<section class="carte b-tuile"><span class="etiq">Durée</span><b class="b-val">' + (bil.dureeSec ? C.formatDuree(bil.dureeSec) : '0:00:00') + '</b>' +
      '<span class="b-sous">D+ ' + Math.round(bil.dplus) + ' m · ' + bil.seances + ' séance' + (bil.seances > 1 ? 's' : '') + (bil.autres ? ' · ' + bil.autres + ' autre' + (bil.autres > 1 ? 's' : '') + ' activité' + (bil.autres > 1 ? 's' : '') : '') + '</span></section>';
    h += '<section class="carte b-tuile b-suivi"><span class="etiq">Plan suivi</span><div class="b-anneau" style="--p:' + (pct || 0) + '"><b>' + (pct === null ? '—' : pct + '%') + '</b></div>' +
      '<span class="b-sous">' + (bil.prevuesADate ? bil.prevuesFaites + ' / ' + bil.prevuesADate + ' séances prévues' : 'Aucune séance prévue à ce jour') + '</span></section>';
    h += '<section class="carte b-tuile b-vma" role="button" tabindex="0" data-act="ouvrirAllures"><span class="etiq">Ma VMA</span><b class="b-val">' + (C.isNum(a.vma) ? C.nombreFR(a.vma) + '<small>km/h</small>' : '—') + '</b>' +
      '<span class="b-sous">Voir mes allures →</span></section>';

    // Séance du jour (avec les alertes qui la concernent)
    h += '<div class="b-jour-col">' + carteReactions() + carteDecalees();
    var hier = C.addDays(aj, -1), jh = a.jours[hier];
    if (jh && C.estPrevue(jh) && !C.aRetour(jh)) h += '<section class="alerte ligne"><span class="espace">Ta séance d\'hier (' + esc(jh.corps) + ') n\'est pas encore saisie.</span><button class="sec" data-act="pasFaite" data-date="' + hier + '">Pas réalisée</button><button data-act="saisir" data-date="' + hier + '">Saisir</button></section>';
    h += '<h2 class="titre-section">Aujourd\'hui</h2>';
    if (C.estPrevue(j) || C.aRetour(j)) h += UI.carteJour(a, aj, j, aj, { role: 'athlete' });
    else {
      var p = prochaineSeance(a, aj);
      h += '<section class="carte"><p style="margin:0"><b>' + (C.estRepos(j) ? 'Repos aujourd\'hui 😌' : 'Pas de séance prévue aujourd\'hui') + '</b></p>' +
        (p ? '<p class="muet" style="margin:6px 0 0">Prochaine séance : ' + esc(UI.jourCourt(p)) + ' · ' + esc(a.jours[p].corps) + '</p>' : '') +
        '<div class="ligne" style="justify-content:flex-end"><button class="discret" data-act="saisir" data-date="' + aj + '">J\'ai couru quand même</button></div></section>';
    }
    h += '</div>';

    // Colonne de droite : compétition, messages
    h += '<div class="b-cote">';
    var compet = C.prochaineCompet(a, aj);
    if (compet) h += '<section class="carte b-compet"><span class="etiq">Prochaine compétition</span><div class="b-compet-l"><span class="jx">' + (compet.dans === 0 ? 'Jour J' : 'J-' + compet.dans) + '</span><div><b>' + esc(compet.jour.corps) + '</b><span class="b-sous">' + esc(UI.jourCourt(compet.date)) + '</span></div></div></section>';
    var msgs = (A.messages || []).slice().sort(function (x, y) { return String(y.envoye).localeCompare(String(x.envoye)); }).slice(0, 3), nl = nonLus();
    h += '<section class="carte b-msg"><div class="ligne"><h3 class="espace" style="margin:0">Messages' + (nl ? ' <span class="pastille">' + nl + '</span>' : '') + '</h3><button class="discret" data-act="ouvrirMessages">Tout voir</button></div>' +
      (msgs.length ? '<ul class="b-msgs">' + msgs.map(function (x) {
        return '<li class="' + (x.de === 'coach' && !x.lu ? 'nonlu' : '') + '"><span class="b-qui">' + (x.de === 'coach' ? 'Ton coach' : 'Toi') + '</span><span class="b-txt">' + esc(x.texte) + '</span><span class="b-quand">' + heureMsg(x.envoye) + '</span></li>';
      }).join('') + '</ul>' : '<p class="muet petit" style="margin:10px 0 0">Aucun message pour le moment.</p>') +
      '<button class="sec plein" data-act="ouvrirMessages">Écrire à mon coach</button></section>';
    h += '</div>';

    // Détail : tableau semaine / mois / année, records, chaussures
    h += '<div class="b-detail">' + tableauBilan(a, aj) + '</div>';
    var rec = C.records(a);
    h += '<section class="carte b-stats"><h3>Mes Stats</h3>' + (rec.length ? '<div class="tableau"><table><thead><tr><th>Record</th><th class="num">Valeur</th><th class="num">Date</th></tr></thead><tbody>' + rec.map(function (r) {
      return '<tr><td>' + esc(r.libelle) + '</td><td class="num"><b>' + esc(r.texte).replace(' sur ', '</b><span class="ecart">sur ') + (r.texte.indexOf(' sur ') >= 0 ? '</span>' : '</b>') + '</td><td class="num">' + (r.cle === 'semaine' ? '<span class="ecart">sem. du</span>' : '') + C.formatDateFR(r.date).slice(0, 5) + '</td></tr>';
    }).join('') + '</tbody></table></div><p class="muet petit">Calculés uniquement à partir de tes séances saisies. Les allures sont des allures moyennes de séance.</p>' : '<p class="muet">Tes records apparaîtront ici dès tes premières séances saisies.</p>') + '</section>';
    h += '<div class="b-chaussures">' + carteChaussures(a) + '</div>';
    m.innerHTML = h + '</div>';
  }

  /* ---------- PLAN ---------- */
  function vuePlan(m) {
    var a = A.athlete, aj = auj();
    if (!a.debut) a.debut = C.weekStart(aj);
    if (semaineAffichee === null) semaineAffichee = Math.max(1, UI.semaineDe(a, aj));
    m.innerHTML = '<div class="plan-grille">' + UI.htmlFiche(a, aj, '') + UI.htmlSemaine(a, semaineAffichee, aj, { role: 'athlete' }) + UI.htmlEnsemble(a, semaineAffichee) + '</div>';
    UI.brancherGraph(a, semaineAffichee, function (n) { semaineAffichee = n; rendre(); window.scrollTo(0, 0); });
  }

  /* ---------- Saisie d'une séance ---------- */
  // Durée en secondes depuis les cases h / min / s ; null si tout est vide, NaN si une valeur est invalide
  function lireDuree(d) {
    var v = ['dh', 'dm', 'ds'].map(function (k) { return String(d.get(k) || '').trim(); });
    if (!v.join('')) return null;
    var n = v.map(function (x) { return x === '' ? 0 : /^\d{1,2}$/.test(x) ? Number(x) : NaN; });
    if (n.some(isNaN) || n[1] > 59 || n[2] > 59) return NaN;
    return n[0] * 3600 + n[1] * 60 + n[2];
  }
  // Activité en plus de la séance du jour (ex. footing prévu le matin, renforcement ou vélo l'après-midi) ; i : activité modifiée
  function autreActivite(date, i) {
    var a = A.athlete, j = a.jours[date] || {}, liste = C.extras(j), x = i != null ? liste[i] : null, code = x ? x.activite.code : 'renfo';
    var aDuree = x && C.isNum(x.dureeSec) && x.dureeSec > 0, ds = aDuree ? Math.round(x.dureeSec) : 0;
    var h = '<form class="boite saisie"><h2>' + (x ? 'Modifier l\'activité' : 'Autre activité') + '</h2>' +
      '<p class="sous-titre">' + C.JOURS_LONGS[C.dayOfWeek(date)] + ' ' + C.formatDateFR(date).slice(0, 5) + (C.aContenuCoach(j) && !C.estRepos(j) ? ' · en plus de <b>' + esc(j.corps) + '</b>' : ' · en plus de ta saisie du jour') + '</p>' +
      '<fieldset class="disciplines"><legend>Discipline</legend><div class="raisons">' + C.ACTIVITES.map(function (y) {
        return '<label><input type="radio" name="activite" value="' + y.code + '"' + (y.code === code ? ' checked' : '') + '><span>' + esc(y.court || y.nom) + '</span></label>';
      }).join('') + '</div></fieldset>' +
      '<div class="champs"><label data-champ="km">Distance (km)<input name="km" inputmode="decimal" value="' + (x && C.isNum(x.km) ? C.nombreFR(x.km, 3) : '') + '" placeholder="20"></label>' +
      '<label data-champ="dplus">D+ (m, facultatif)<input name="dplus" inputmode="numeric" value="' + (x && C.isNum(x.dplus) ? Math.round(x.dplus) : '') + '" placeholder="150"></label>' +
      '<div class="duree-hms"><span class="etiq-champ" id="lblDureeX">Durée</span><div class="hms" role="group" aria-labelledby="lblDureeX">' +
      [['dh', 'h', Math.floor(ds / 3600), '0'], ['dm', 'min', Math.floor(ds % 3600 / 60), '45'], ['ds', 's', ds % 60, '00']].map(function (y) {
        return '<label><input name="' + y[0] + '" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="' + (aDuree ? y[2] : '') + '" placeholder="' + y[3] + '" aria-label="' + ({ h: 'heures', min: 'minutes', s: 'secondes' })[y[1]] + '"><span>' + y[1] + '</span></label>';
      }).join('') + '</div></div>' +
      '<label>FC moyenne (bpm)<input name="fc" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="' + (x && C.isNum(x.fc) ? Math.round(x.fc) : '') + '" placeholder="120"></label></div>' +
      '<fieldset class="ressenti"><legend>Ressenti (RPE)</legend>' + UI.htmlBarreRPE(x ? x.rpe : null) + '</fieldset>' +
      '<label>Note (facultatif)<input name="note" maxlength="200" value="' + esc(x ? x.note : '') + '" placeholder="ex. gainage et squats"></label>' +
      '<p class="alerte" id="erreurExtra" hidden></p><div class="pied">' + (x ? '<button type="button" class="danger" data-x="supprimer">Supprimer</button>' : '') +
      '<button type="button" class="sec" data-x="annuler">Annuler</button><button>Enregistrer</button></div></form>';
    boite.innerHTML = h; boite.showModal();
    var f = $('form', boite);
    UI.brancherBarreRPE(f);
    function discipline() { var c = f.querySelector('input[name="activite"]:checked'); return C.ACTIVITES.filter(function (y) { return y.code === (c ? c.value : 'renfo'); })[0]; }
    function majChamps() { var y = discipline(); $$('[data-champ]', f).forEach(function (l) { l.hidden = (l.dataset.champ === 'km' && y.sansDistance) || (l.dataset.champ === 'dplus' && y.sansDplus); }); }
    $$('input[name="activite"]', f).forEach(function (r) { r.onchange = majChamps; });
    majChamps();
    ['dh', 'dm'].forEach(function (n, k) { var el = f.elements[n], suiv = f.elements[['dm', 'ds'][k]]; el.oninput = function () { el.value = el.value.replace(/\D/g, ''); if (el.value.length >= 2) suiv.focus(); }; });
    f.elements.ds.oninput = function () { this.value = this.value.replace(/\D/g, ''); };
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    var sp = $('[data-x="supprimer"]', f);
    if (sp) sp.onclick = function () {
      if (!confirm('Supprimer cette activité (' + x.activite.nom + ') ?')) return;
      var l = liste.slice(); l.splice(i, 1);
      enregistrer(date, Object.assign({}, j), 'Activité supprimée', l); boite.close();
    };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), y = discipline(), err = [];
      var km = y.sansDistance ? null : C.parseNumberFR(d.get('km')), du = lireDuree(d), dp = y.sansDplus ? null : C.parseNumberFR(d.get('dplus')), fc = C.parseNumberFR(d.get('fc')), rpe = d.get('rpe') ? Number(d.get('rpe')) : null;
      if (km !== null && !(km > 0 && km < 400)) err.push('Distance : nombre attendu, ex. 20 ou 1,5');
      if (du !== null && !(du > 0 && du < 172800)) err.push('Durée : heures, minutes (0 à 59) et secondes (0 à 59)');
      if (dp !== null && !(dp >= 0 && dp < 20000)) err.push('D+ : nombre de mètres');
      if (fc !== null && !(fc >= 30 && fc <= 250 && Math.round(fc) === fc)) err.push('FC moyenne : nombre entier entre 30 et 250');
      if (km === null && du === null) err.push('Renseigne au moins la distance ou la durée');
      if (err.length) { var e = $('#erreurExtra', f); e.hidden = false; e.textContent = err.join(' · '); return; }
      var n = { activite: y, km: km, dureeSec: du, dplus: dp, fc: fc, rpe: rpe, note: C.texte(d.get('note')) };
      var l = liste.slice(); if (x) l[i] = n; else l.push(n);
      enregistrer(date, Object.assign({}, j), x ? 'Activité modifiée' : 'Activité ajoutée 👏', l); boite.close();
    };
  }
  // Séance prévue non faite : raison + message pour l'entraîneur (envoyés avec la synchronisation, dans la note)
  // Séance prévue non faite ce jour-là : pas faite du tout, ou décalée à un autre jour ; raison et message pour l'entraîneur
  function pasFaite(date) {
    var a = A.athlete, j = a.jours[date] || {}, aj = auj(), nf = C.nonRealisee(j), dc = C.decalee(j), x = nf || dc || { raison: '', message: '' };
    var min = date >= aj ? C.addDays(date, 1) : aj, max = C.addDays(aj, 7), au = dc && dc.au >= min && dc.au <= max ? dc.au : min;
    var h = '<form class="boite"><h2>Séance pas faite ce jour-là</h2><p class="muet">' + C.JOURS_LONGS[C.dayOfWeek(date)] + ' ' + C.formatDateFR(date) + (j.corps ? ' · <b>' + esc(j.corps) + '</b>' : '') + '</p>' +
      '<fieldset><legend>Que veux-tu faire ?</legend>' +
      '<label class="choix"><input type="radio" name="quoi" value="decale"' + (nf ? '' : ' checked') + '> <span><b>Je la décale</b> au <input type="date" name="au" value="' + au + '" min="' + min + '" max="' + max + '" aria-label="Nouvelle date"></span></label>' +
      '<label class="choix"><input type="radio" name="quoi" value="pas"' + (nf ? ' checked' : '') + '> <span><b>Je ne la ferai pas</b></span></label></fieldset>' +
      '<fieldset><legend>Raison</legend><div class="raisons">' + C.RAISONS_NON_FAITE.map(function (r) {
        return '<label><input type="radio" name="raison" value="' + esc(r) + '"' + (r === x.raison ? ' checked' : '') + '><span>' + esc(r) + '</span></label>';
      }).join('') + '</div></fieldset>' +
      '<label>Message pour ton entraîneur (facultatif)<textarea name="message" maxlength="1500" placeholder="ex. Pas le temps ce soir, je la fais demain.">' + esc(x.message) + '</textarea></label>' +
      '<p class="alerte" id="erreurNf" hidden></p><p class="muet petit">Ton entraîneur le verra dans son application, dans les alertes de son tableau de suivi.</p>' +
      '<div class="pied">' + (nf || dc ? '<button type="button" class="danger" data-x="annulerNf">Retirer</button>' : '') +
      '<button type="button" class="sec" data-x="annuler">Annuler</button><button>Envoyer</button></div></form>';
    boite.innerHTML = h; boite.showModal();
    var f = $('form', boite);
    f.elements.au.onfocus = f.elements.au.onchange = function () { f.querySelector('input[name="quoi"][value="decale"]').checked = true; };
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    var an = $('[data-x="annulerNf"]', f);
    if (an) an.onclick = function () {
      var n = Object.assign({}, j); C.CHAMPS_ATHLETE.forEach(function (k) { delete n[k]; });
      enregistrer(date, n, 'Séance remise à saisir', undefined, ''); boite.close();
    };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), n = Object.assign({}, j), decale = d.get('quoi') === 'decale', jour = String(d.get('au') || '');
      if (decale && !(jour >= min && jour <= max)) { var e = $('#erreurNf', f); e.hidden = false; e.textContent = 'Choisis une date entre le ' + C.formatDateFR(min) + ' et le ' + C.formatDateFR(max) + '.'; return; }
      C.CHAMPS_ATHLETE.forEach(function (k) { delete n[k]; });
      n.notes = decale ? C.noteDecalee(jour, d.get('raison') || '', d.get('message') || '') : C.noteNonRealisee(d.get('raison') || '', d.get('message') || '');
      delete chaussures().parDate[date];
      enregistrer(date, n, decale ? 'Séance décalée au ' + UI.jourCourt(jour) : 'Envoyé à ton entraîneur', undefined, ''); boite.close();
    };
  }
  // Séances décalées à aujourd'hui (ou à un jour déjà passé) et pas encore saisies
  function carteDecalees() {
    var a = A.athlete, aj = auj(), l = Object.keys(a.jours || {}).filter(function (d) { var x = C.decalee(a.jours[d]); return x && x.au <= aj; }).sort();
    if (!l.length) return '';
    return '<section class="carte nouveau"><h3>Séance' + (l.length > 1 ? 's' : '') + ' décalée' + (l.length > 1 ? 's' : '') + ' à faire</h3><ul class="liste-nf">' + l.map(function (d) {
      var j = a.jours[d], x = C.decalee(j);
      return '<li><div class="ligne"><div class="espace"><b>' + esc(j.corps || 'Séance') + '</b><div class="petit muet">Prévue ' + esc(UI.jourCourt(d)) + ' · décalée au ' + esc(UI.jourCourt(x.au)) + '</div></div><button data-act="saisir" data-date="' + d + '">Saisir</button></div></li>';
    }).join('') + '</ul></section>';
  }
  function saisir(date) {
    var a = A.athlete, j = a.jours[date] || {}, aj = auj();
    // Séance décalée ou déjà faite un autre jour : on demande la date réelle, gardée dans la note
    var dc = C.decalee(j), fl = C.faiteLe(j), autreJour = dc || fl, le = fl ? fl.le : (dc && dc.au <= aj ? dc.au : aj);
    if (C.nonRealisee(j) || dc) j = Object.assign({}, j, { notes: '' }); // saisir la séance finalement faite remplace « pas réalisée » ou « décalée »
    else if (fl) j = Object.assign({}, j, { notes: fl.notes });
    // Jour de repos ou sans séance prévue : l'athlète choisit sa discipline (course à pied par défaut)
    var choixAct = C.estRepos(j) || !C.aContenuCoach(j), actJ = C.activite(j), codeAct = actJ ? actJ.activite.code : 'course';
    if (actJ) j = Object.assign({}, j, { notes: actJ.notes });
    j = Object.assign({}, j, { notes: C.notesPrincipales(j.notes) }); // les activités en plus se modifient à part
    var aDuree = C.isNum(j.dureeSec) && j.dureeSec > 0, ds = aDuree ? Math.round(j.dureeSec) : 0;
    var h = '<form class="boite saisie"><h2>' + (C.aRetour(a.jours[date]) ? 'Modifier ma séance' : 'Ma séance') + '</h2>' +
      '<p class="sous-titre">' + C.JOURS_LONGS[C.dayOfWeek(date)] + ' ' + C.formatDateFR(date).slice(0, 5) + (j.corps ? ' · prévu : <b>' + esc(j.corps) + '</b>' : '') + '</p>' +
      (choixAct ? '<fieldset class="disciplines"><legend>Discipline</legend><div class="raisons">' + C.ACTIVITES.map(function (x) {
        return '<label><input type="radio" name="activite" value="' + x.code + '"' + (x.code === codeAct ? ' checked' : '') + '><span>' + esc(x.court || x.nom) + '</span></label>';
      }).join('') + '</div></fieldset>' : '') +
      (autreJour ? '<label>Faite le<input type="date" name="le" value="' + le + '" min="' + date + '" max="' + aj + '"></label>' : '') +
      '<div class="champs"><label data-champ="km">Distance (km)<input name="km" inputmode="decimal" value="' + (C.isNum(j.km) ? C.nombreFR(j.km, 3) : '') + '" placeholder="12,5"></label>' +
      '<label data-champ="dplus">D+ (m, facultatif)<input name="dplus" inputmode="numeric" value="' + (C.isNum(j.dplus) ? Math.round(j.dplus) : '') + '" placeholder="150"></label>' +
      // Durée en trois cases chiffrées : le pavé numérique de l'iPhone n'a pas de « : »
      '<div class="duree-hms"><span class="etiq-champ" id="lblDuree">Durée</span><div class="hms" role="group" aria-labelledby="lblDuree">' +
      [['dh', 'h', Math.floor(ds / 3600), '1'], ['dm', 'min', Math.floor(ds % 3600 / 60), '15'], ['ds', 's', ds % 60, '45']].map(function (x) {
        return '<label><input name="' + x[0] + '" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="' + (aDuree ? x[2] : '') + '" placeholder="' + x[3] + '" aria-label="' + ({ h: 'heures', min: 'minutes', s: 'secondes' })[x[1]] + '"><span>' + x[1] + '</span></label>';
      }).join('') + '</div></div>' +
      '<label>FC moyenne (bpm)<input name="fc" inputmode="numeric" pattern="[0-9]*" maxlength="3" value="' + (C.isNum(j.fc) ? Math.round(j.fc) : '') + '" placeholder="145"></label>' +
      // Profil / terrain réellement couru (suggestions : profils de la légende de l'entraîneur)
      '<label data-champ="terrain">Profil / terrain<input name="terrain" list="dlTerrains" maxlength="60" autocomplete="off" value="' + esc(C.terrain(a.jours[date])) + '" placeholder="' + esc(j.profil || 'ex. Voie verte') + '"></label>' +
      '<datalist id="dlTerrains">' + ((A.commun.legende || DEFAUTS.legende).profils || []).map(function (p) { return '<option value="' + esc(p.code) + '">' + esc(p.desc) + '</option>'; }).join('') + '</datalist>' +
      // Paire utilisée : menu des paires en service (course et marche)
      (function () {
        var ch = chaussures(), act = ch.liste.filter(function (c) { return !c.retiree || ch.parDate[date] === c.id; });
        if (!act.length) return '';
        var sel = ch.parDate[date] || (C.aRetour(j) ? '' : ch.defaut);
        return '<label data-champ="chaussure" class="large">Chaussures<select name="chaussure"><option value="">—</option>' +
          act.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.nom) + '</option>'; }).join('') + '</select></label>';
      })() +
      '</div>' +
      '<fieldset class="ressenti"><legend>Ressenti (RPE)</legend>' + UI.htmlBarreRPE(j.rpe) +
      '<p class="muet petit">À noter 30 min après la séance : 1 très facile → 10 effort maximal.</p></fieldset>' +
      '<label>Notes (ressenti, douleurs, conditions…)<textarea name="notes" maxlength="2000">' + esc(j.notes) + '</textarea></label>' +
      '<p class="alerte" id="erreurSaisie" hidden></p><div class="pied">' + (C.aRetour(j) ? '<button type="button" class="danger" data-x="effacer">Effacer</button>' : '') +
      '<button type="button" class="sec" data-x="annuler">Annuler</button><button>Enregistrer</button></div></form>';
    boite.innerHTML = h; boite.showModal();
    var f = $('form', boite);
    UI.brancherBarreRPE(f);
    // Champs sans objet selon la discipline : distance (renforcement), D+ (natation, renforcement), chaussures (vélo, natation, renforcement)
    function discipline() { var c = f.querySelector('input[name="activite"]:checked'); return C.ACTIVITES.filter(function (x) { return x.code === (c ? c.value : 'course'); })[0]; }
    function majChamps() {
      var x = discipline();
      $$('[data-champ]', f).forEach(function (l) { var k = l.dataset.champ; l.hidden = (k === 'km' && x.sansDistance) || (k === 'terrain' && x.sansDistance) || (k === 'dplus' && x.sansDplus) || (k === 'chaussure' && !x.chaussures); });
    }
    $$('input[name="activite"]', f).forEach(function (r) { r.onchange = majChamps; });
    majChamps();
    // Passage automatique à la case suivante après deux chiffres (minutes, secondes)
    ['dh', 'dm'].forEach(function (n, i) {
      var el = f.elements[n], suiv = f.elements[['dm', 'ds'][i]];
      el.oninput = function () { el.value = el.value.replace(/\D/g, ''); if (el.value.length >= 2) suiv.focus(); };
    });
    f.elements.ds.oninput = function () { this.value = this.value.replace(/\D/g, ''); };
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    var ef = $('[data-x="effacer"]', f);
    if (ef) ef.onclick = function () {
      if (!confirm('Effacer ta saisie du ' + C.formatDateFR(date) + ' ?')) return;
      var n = Object.assign({}, j); C.CHAMPS_ATHLETE.forEach(function (k) { delete n[k]; });
      delete chaussures().parDate[date];
      enregistrer(date, n, undefined, undefined, ''); boite.close();
    };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), err = [];
      var disc = discipline();
      var km = disc.sansDistance ? null : C.parseNumberFR(d.get('km')), du = lireDuree(d), dp = disc.sansDplus ? null : C.parseNumberFR(d.get('dplus')), fc = C.parseNumberFR(d.get('fc')), rpe = d.get('rpe') ? Number(d.get('rpe')) : null;
      if (km !== null && !(km >= 0 && km < 400)) err.push('Distance : nombre attendu, ex. 12,5');
      if (du !== null && !(du > 0 && du < 172800)) err.push('Durée : heures, minutes (0 à 59) et secondes (0 à 59)');
      if (dp !== null && !(dp >= 0 && dp < 20000)) err.push('D+ : nombre de mètres');
      if (fc !== null && !(fc >= 30 && fc <= 250 && Math.round(fc) === fc)) err.push('FC moyenne : nombre entier de battements par minute, entre 30 et 250');
      if (km === null && du === null && rpe === null && !C.texte(d.get('notes'))) err.push('Renseigne au moins la distance ou la durée');
      if (err.length) { var e = $('#erreurSaisie'); e.hidden = false; e.textContent = err.join(' · '); return; }
      var leJour = String(d.get('le') || '');
      if (autreJour && !(leJour >= date && leJour <= aj)) err.push('Date de la séance : entre le ' + C.formatDateFR(date) + ' et aujourd\'hui');
      if (err.length) { var e2 = $('#erreurSaisie'); e2.hidden = false; e2.textContent = err.join(' · '); return; }
      var notes = choixAct ? C.noteActivite(disc.code, d.get('notes')) : d.get('notes');
      var n = Object.assign({}, j, { km: km, dureeSec: du, dplus: dp, rpe: rpe, fc: fc, notes: autreJour && leJour !== date ? C.noteFaiteLe(leJour, notes) : notes });
      var chx = disc.chaussures ? d.get('chaussure') : '', ch = chaussures();
      if (chx) ch.parDate[date] = chx; else delete ch.parDate[date];
      enregistrer(date, n, undefined, undefined, C.texte(d.get('terrain'))); boite.close();
    };
  }
  // extras : nouvelle liste des activités en plus du jour ; sans elle, celles déjà enregistrées sont gardées
  // ter : terrain de la séance (sans lui, celui déjà enregistré est gardé)
  var vientDeFaire = null;
  function enregistrer(date, j, message, extras, ter) {
    var a = A.athlete;
    j.notes = C.avecExtras(j.notes, extras || C.extras(a.jours[date]), ter !== undefined ? ter : C.terrain(a.jours[date]), C.lignesRP(a.jours[date]));
    j.majA = UI.maintenant();
    var n = C.nettoyerJour(j);
    // La pastille du jour s'anime une seule fois quand la séance passe à « faite » (si l'écran se redessine pendant
    // l'animation, elle reprend là où elle en était au lieu de recommencer)
    vientDeFaire = !C.aRetour(a.jours[date] || {}) && C.aRetour(n) ? { date: date, t: Date.now() } : null;
    a.jours[date] = n;
    A.enAttente[date] = true;
    sauver().then(function () { toast(message || 'Séance enregistrée 👏'); if (vientDeFaire) vientDeFaire.t = Date.now(); rendre(); synchroniser(false); });
  }

  // RP de l'athlète : ligne « [RP · …] » dans les notes du jour de la course, envoyée comme une saisie (le coach la voit)
  function enregistrerRP(r0, r) {
    var a = A.athlete;
    function ecrire(d, f) {
      var j = Object.assign({}, a.jours[d] || {});
      j.notes = C.avecExtras(j.notes, C.extras(j), C.terrain(j), f(C.lignesRP(j)));
      j.majA = UI.maintenant();
      a.jours[d] = C.nettoyerJour(j); A.enAttente[d] = true;
    }
    if (r0) { var i = Number(String(r0.id).split('-').pop()); ecrire(r0.date, function (l) { return l.filter(function (x, k) { return k !== i; }); }); }
    if (r) ecrire(r.date, function (l) { return l.concat([C.ligneRP(r)]); });
    sauver().then(function () { toast(r ? 'RP enregistré' : 'RP supprimé'); rendre(); synchroniser(false); });
  }

  /* ---------- Actions ---------- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act], nav.onglets button');
    if (!b) return;
    if (b.dataset.v) { vue = b.dataset.v; rendre(); window.scrollTo(0, 0); return; }
    var act = b.dataset.act, a = A.athlete;
    if (act === 'saisir') saisir(b.dataset.date);
    else if (act === 'extra') autreActivite(b.dataset.date, b.dataset.i != null ? Number(b.dataset.i) : null);
    else if (act === 'pasFaite') pasFaite(b.dataset.date);
    else if (act === 'sync') synchroniser(true);
    else if (act === 'semPrec') { semaineAffichee = Math.max(UI.semaineMin(a), semaineAffichee - 1); rendre(); }
    else if (act === 'semSuiv') { semaineAffichee++; rendre(); }
    else if (act === 'semAuj') { semaineAffichee = Math.max(1, UI.semaineDe(a, auj())); rendre(); }
    else if (act === 'allerSem') { semaineAffichee = +b.dataset.n; rendre(); window.scrollTo(0, 0); }
    else if (act === 'imprimer') window.print();
    else if (act === 'chaussures') gererChaussures();
    else if (act === 'reactionsVues') marquerReactionsVues();
    else if (act === 'allerJour') { semaineAffichee = Math.max(UI.semaineMin(a), UI.semaineDe(a, b.dataset.date)); vue = 'plan'; rendre(); var cible = document.getElementById('j-' + b.dataset.date); if (cible) cible.scrollIntoView({ block: 'center' }); else window.scrollTo(0, 0); }
    else if (act === 'ouvrirAllures') { vue = 'allures'; rendre(); window.scrollTo(0, 0); }
    else if (act === 'ouvrirMessages') { vue = 'messages'; rendre(); window.scrollTo(0, 0); }
  });
  $('#statutSync').addEventListener('click', function () { synchroniser(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') synchroniser(false); });
  window.addEventListener('online', function () { synchroniser(false); });
  window.addEventListener('hashchange', function () { var c = C.codeDepuisLien(decodeURIComponent(location.hash.slice(1))); if (c && c !== A.code) changerCode(c); });
  setInterval(rendreStatut, 30000);
  setInterval(function () { if (vue === 'messages' && document.visibilityState === 'visible') chargerMessages(true); }, 30000);

  Promise.all([Store.charger(), UI.chargerConfig('../config.json')]).then(function (r) {
    var d = r[0]; config = r[1] || {};
    if (d) { A = Object.assign(A, d); A.enAttente = A.enAttente || {}; }
    UI.appliquerTheme(A.reglages && A.reglages.theme);
    var c = C.codeDepuisLien(decodeURIComponent(location.hash.slice(1)));
    if (c && c !== A.code) { A.code = c; A.athlete = null; A.enAttente = {}; A.lienInvalide = false; A.messages = []; A.messagesConnus = false; A.reactionsVues = null; A.reactionsSignalees = {}; }
    rendre();
    synchroniser(false);
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
