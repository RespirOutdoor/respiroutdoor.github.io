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
        return sauver().then(function () { rendreStatut(); if (!boite.open && (ok || !A.athlete || A.lienInvalide)) rendre(); });
      });
    return enCours;
  }
  function rendreStatut(etat) {
    var el = $('#statutSync');
    if (!el) return;
    var n = Object.keys(A.enAttente || {}).length, t, cls = '';
    if (etat === 'en cours') t = 'Mise à jour…';
    else if (A.sync.erreur) { t = (navigator.onLine === false ? 'Hors connexion' : 'Pas de connexion au service') + (n ? ' · ' + n + ' saisie(s) en attente d\'envoi' : ''); cls = 'attention'; }
    else t = 'À jour ' + UI.ilYa(A.sync.derniere) + (n ? ' · ' + n + ' saisie(s) en attente' : '');
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
    if (A.lienInvalide) main.innerHTML = '<p class="alerte">Ce lien a été remplacé par ton entraîneur. Ouvre le nouveau lien qu\'il t\'a envoyé.</p>';
    else main.innerHTML = '';
    var cont = document.createElement('div'); main.appendChild(cont);
    ({ accueil: vueAccueil, plan: vuePlan, allures: function (m) { UI.vueAllures(m, a, false); }, legende: function (m) { UI.vueLegende(m); }, protos: function (m) { UI.vueProtos(m, a, false); } }[vue] || vueAccueil)(cont);
  }

  function vueBienvenue() {
    return '<section class="carte vide"><img src="' + $('header.app img').src + '" alt=""><h2>Bienvenue sur My RespirOutdoor</h2>' +
      (A.lienInvalide ? '<p class="alerte">Ce lien n\'est plus valable : ton entraîneur en a créé un nouveau.</p>' : '') +
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
    if (c !== A.code) { A.code = c; A.athlete = null; A.enAttente = {}; A.sync = { derniere: '', erreur: '' }; }
    A.lienInvalide = false;
    sauver().then(function () { rendre(); synchroniser(false); });
  }

  /* ---------- ACCUEIL : tableau de bord ---------- */
  function prochaineSeance(a, apres) {
    var ds = Object.keys(a.jours || {}).filter(function (d) { return d > apres && C.estPrevue(a.jours[d]); }).sort();
    return ds.length ? ds[0] : null;
  }
  function carteBilan(titre, b, p, aj) {
    var duree = function (s) { return C.formatDuree(s); };
    return '<section class="carte"><h3>' + titre + '</h3><p class="muet petit">' + C.formatDateFR(b.du) + ' → ' + C.formatDateFR(b.au) + ' · écart vs ' + C.formatDateFR(b.precDu) + ' → ' + C.formatDateFR(b.precAu) + '</p>' +
      '<div class="kpis kpis2">' +
      '<div class="kpi"><span class="etiq">Volume</span><b>' + C.nombreFR(b.cur.km, 1) + ' km</b>' + UI.ecart(b.cur.km, b.prec.km, function (x) { return C.nombreFR(x, 1) + ' km'; }) + '</div>' +
      '<div class="kpi"><span class="etiq">D+</span><b>' + Math.round(b.cur.dplus) + ' m</b>' + UI.ecart(b.cur.dplus, b.prec.dplus, function (x) { return Math.round(x) + ' m'; }) + '</div>' +
      '<div class="kpi"><span class="etiq">Durée</span><b>' + (b.cur.dureeSec ? duree(b.cur.dureeSec) : '0:00:00') + '</b>' + UI.ecart(b.cur.dureeSec, b.prec.dureeSec, duree) + '</div>' +
      '<div class="kpi"><span class="etiq">Séances</span><b>' + b.cur.seances + '</b>' + UI.ecart(b.cur.seances, b.prec.seances, String) + '</div>' +
      '</div><p class="petit" style="margin:10px 0 0">Prévu sur la période : ' + b.cur.prevues + ' séance(s)' + (b.cur.prevuesADate ? ' · plan suivi : ' + b.cur.prevuesFaites + ' / ' + b.cur.prevuesADate + ' jusqu\'à aujourd\'hui' : '') + '.</p></section>';
  }
  function vueAccueil(m) {
    var a = A.athlete, aj = auj(), j = a.jours[aj] || {}, h = '';
    var mots = [A.commun.motGlobal, a.motCoach].filter(function (x) { return C.texte(x); });
    if (mots.length) h += '<section class="carte mot"><h3>💬 Le mot de ton coach</h3>' + mots.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</section>';
    // Séance d'hier pas encore saisie
    var hier = C.addDays(aj, -1), jh = a.jours[hier];
    if (jh && C.estPrevue(jh) && !C.aRetour(jh)) h += '<section class="alerte ligne"><span class="espace">Ta séance d\'hier (' + esc(jh.corps) + ') n\'est pas encore saisie.</span><button data-act="saisir" data-date="' + hier + '">Saisir</button></section>';
    // Séance du jour
    h += '<h2 class="titre-section">Aujourd\'hui</h2>';
    if (C.estPrevue(j) || C.aRetour(j)) h += UI.carteJour(a, aj, j, aj, { role: 'athlete' });
    else {
      var p = prochaineSeance(a, aj);
      h += '<section class="carte"><p style="margin:0"><b>' + (C.estRepos(j) ? 'Repos aujourd\'hui 😌' : 'Pas de séance prévue aujourd\'hui') + '</b></p>' +
        (p ? '<p class="muet" style="margin:6px 0 0">Prochaine séance : ' + esc(UI.jourCourt(p)) + ' · ' + esc(a.jours[p].corps) + '</p>' : '') +
        '<div class="ligne" style="justify-content:flex-end"><button class="discret" data-act="saisir" data-date="' + aj + '">J\'ai couru quand même</button></div></section>';
    }
    var compet = C.prochaineCompet(a, aj);
    if (compet) h += '<section class="carte compet"><span class="jx">' + (compet.dans === 0 ? 'Jour J' : 'J-' + compet.dans) + '</span><div><b>' + esc(compet.jour.corps) + '</b><br><span class="muet">' + esc(UI.jourCourt(compet.date)) + '</span></div></section>';
    // Tableau de bord
    var per = C.periodes(aj);
    h += '<h2 class="titre-section">Tableau de bord</h2>';
    [['Cette semaine', per.semaine], ['Ce mois', per.mois], ['Cette année', per.annee]].forEach(function (x) {
      var p = x[1];
      h += carteBilan(x[0], { du: p.du, au: p.au, precDu: p.precDu, precAu: p.precAu, cur: C.bilanPeriode(a, p.du, p.au, aj), prec: C.bilanPeriode(a, p.precDu, p.precAu) }, p, aj);
    });
    // Records
    var rec = C.records(a);
    h += '<section class="carte"><h3>🏅 Mes records</h3>' + (rec.length ? '<ul class="records">' + rec.map(function (r) {
      return '<li><span>' + esc(r.libelle) + '</span><b>' + esc(r.texte) + '</b><span class="muet petit">' + (r.cle === 'semaine' ? 'semaine du ' : 'le ') + C.formatDateFR(r.date) + '</span></li>';
    }).join('') + '</ul><p class="muet petit">Calculés uniquement à partir de tes séances saisies. Les allures sont des allures moyennes de séance.</p>' : '<p class="muet">Tes records apparaîtront ici dès tes premières séances saisies.</p>') + '</section>';
    m.innerHTML = h;
  }

  /* ---------- PLAN ---------- */
  function vuePlan(m) {
    var a = A.athlete, aj = auj();
    if (!a.debut) a.debut = C.weekStart(aj);
    if (semaineAffichee === null) semaineAffichee = Math.max(1, UI.semaineDe(a, aj));
    m.innerHTML = UI.htmlFiche(a, aj, '') + UI.htmlSemaine(a, semaineAffichee, aj, { role: 'athlete' }) + UI.htmlEnsemble(a, semaineAffichee);
    UI.brancherGraph(a, semaineAffichee, function (n) { semaineAffichee = n; rendre(); window.scrollTo(0, 0); });
  }

  /* ---------- Saisie d'une séance ---------- */
  function saisir(date) {
    var a = A.athlete, j = a.jours[date] || {};
    var h = '<form class="boite"><h2>' + C.JOURS_LONGS[C.dayOfWeek(date)] + ' ' + C.formatDateFR(date) + '</h2>' +
      (j.corps ? '<p class="muet">Prévu : <b>' + esc(j.corps) + '</b></p>' : '') +
      '<div class="champs"><label>Distance (km)<input name="km" inputmode="decimal" value="' + (C.isNum(j.km) ? C.nombreFR(j.km, 3) : '') + '" placeholder="12,5"></label>' +
      '<label>Durée<input name="duree" inputmode="numeric" value="' + (C.isNum(j.dureeSec) ? C.formatDuree(j.dureeSec) : '') + '" placeholder="1:15:45"></label>' +
      '<label>D+ (m, facultatif)<input name="dplus" inputmode="numeric" value="' + (C.isNum(j.dplus) ? Math.round(j.dplus) : '') + '" placeholder="150"></label></div>' +
      '<fieldset><legend>Ressenti (RPE)</legend><div class="rpe-choix" role="radiogroup">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { var l = C.libelleRPE(n); return '<label style="--rpe:' + l.couleur + '"><input type="radio" name="rpe" value="' + n + '"' + (j.rpe === n ? ' checked' : '') + '><span><b>' + n + '</b>' + esc(l.libelle) + '</span></label>'; }).join('') +
      '</div><p class="muet petit">À noter 30 min après la séance : 1 très facile → 10 effort maximal.</p></fieldset>' +
      '<label>Notes (ressenti, douleurs, conditions…)<textarea name="notes" maxlength="2000">' + esc(j.notes) + '</textarea></label>' +
      '<p class="alerte" id="erreurSaisie" hidden></p><div class="pied">' + (C.aRetour(j) ? '<button type="button" class="danger" data-x="effacer">Effacer ma saisie</button>' : '') +
      '<button type="button" class="sec" data-x="annuler">Annuler</button><button>Enregistrer</button></div></form>';
    boite.innerHTML = h; boite.showModal();
    var f = $('form', boite);
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    var ef = $('[data-x="effacer"]', f);
    if (ef) ef.onclick = function () {
      if (!confirm('Effacer ta saisie du ' + C.formatDateFR(date) + ' ?')) return;
      var n = Object.assign({}, j); C.CHAMPS_ATHLETE.forEach(function (k) { delete n[k]; });
      enregistrer(date, n); boite.close();
    };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), err = [];
      var km = C.parseNumberFR(d.get('km')), du = C.parseDuree(d.get('duree')), dp = C.parseNumberFR(d.get('dplus')), rpe = d.get('rpe') ? Number(d.get('rpe')) : null;
      if (km !== null && !(km >= 0 && km < 400)) err.push('Distance : nombre attendu, ex. 12,5');
      if (du !== null && !(du > 0 && du < 172800)) err.push('Durée : format h:mm:ss, mm:ss, 1h15 ou minutes');
      if (dp !== null && !(dp >= 0 && dp < 20000)) err.push('D+ : nombre de mètres');
      if (km === null && du === null && rpe === null && !C.texte(d.get('notes'))) err.push('Renseigne au moins la distance ou la durée');
      if (err.length) { var e = $('#erreurSaisie'); e.hidden = false; e.textContent = err.join(' · '); return; }
      var n = Object.assign({}, j, { km: km, dureeSec: du, dplus: dp, rpe: rpe, notes: d.get('notes') });
      enregistrer(date, n); boite.close();
    };
  }
  function enregistrer(date, j) {
    var a = A.athlete;
    j.majA = UI.maintenant();
    var n = C.nettoyerJour(j);
    a.jours[date] = n;
    A.enAttente[date] = true;
    sauver().then(function () { toast('Séance enregistrée 👏'); rendre(); synchroniser(false); });
  }

  /* ---------- Actions ---------- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act], nav.onglets button');
    if (!b) return;
    if (b.dataset.v) { vue = b.dataset.v; rendre(); window.scrollTo(0, 0); return; }
    var act = b.dataset.act, a = A.athlete;
    if (act === 'saisir') saisir(b.dataset.date);
    else if (act === 'sync') synchroniser(true);
    else if (act === 'semPrec') { semaineAffichee = Math.max(1, semaineAffichee - 1); rendre(); }
    else if (act === 'semSuiv') { semaineAffichee++; rendre(); }
    else if (act === 'semAuj') { semaineAffichee = Math.max(1, UI.semaineDe(a, auj())); rendre(); }
    else if (act === 'allerSem') { semaineAffichee = +b.dataset.n; rendre(); window.scrollTo(0, 0); }
    else if (act === 'imprimer') window.print();
  });
  $('#statutSync').addEventListener('click', function () { synchroniser(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') synchroniser(false); });
  window.addEventListener('online', function () { synchroniser(false); });
  window.addEventListener('hashchange', function () { var c = C.codeDepuisLien(decodeURIComponent(location.hash.slice(1))); if (c && c !== A.code) changerCode(c); });
  setInterval(rendreStatut, 30000);

  Promise.all([Store.charger(), UI.chargerConfig('../config.json')]).then(function (r) {
    var d = r[0]; config = r[1] || {};
    if (d) { A = Object.assign(A, d); A.enAttente = A.enAttente || {}; }
    UI.appliquerTheme(A.reglages && A.reglages.theme);
    var c = C.codeDepuisLien(decodeURIComponent(location.hash.slice(1)));
    if (c && c !== A.code) { A.code = c; A.athlete = null; A.enAttente = {}; A.lienInvalide = false; }
    rendre();
    synchroniser(false);
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
