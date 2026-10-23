/* ======================================================================
   Briques communes aux deux applications (entraîneur et athlète) :
   stockage local, service en ligne, rendu du plan, légende, allures, protos.
   ====================================================================== */
var UI = (function () {
  'use strict';
  var C = Core;
  var FAMILLES = {
    'Aérobie': '#3A8376', 'Récupérations': '#7AA59C', 'VMA': '#B5443A', 'Fartlek': '#C2702E', 'Côtes': '#8A5A2B',
    'Spécifique / allures': '#6B4FA0', 'Divers': '#5B6B73', 'Renfo': '#3D5A80', 'Respiration': '#4E8FB0', 'Compétition': '#D9A21B'
  };
  var REACTIONS = ['👍', '💪', '🔥', '👏', '❤️', '😮'];
  var ctx = { legende: function () { return null; }, protos: function () { return []; } };

  /* ---------- Utilitaires ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function toast(t) { var x = $('#toast'); x.textContent = t; x.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { x.style.display = 'none'; }, 3500); }
  function auj() { return C.todayParis(); }
  function maintenant() { return new Date().toISOString(); }
  function nomComplet(a) { return [a.prenom, a.nom].filter(Boolean).join(' ') || 'Athlète sans nom'; }
  function prenom(a) { var p = C.texte(a.prenom); return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; }
  function famille(code) {
    if (C.normCode(code) === 'COMP' || C.normCode(code) === 'PROTO') return 'Compétition';
    var r = C.chercherCode((ctx.legende() || {}).types, code);
    return r && r.entree.famille ? r.entree.famille : null;
  }
  // Famille ajoutée par l'entraîneur (ex. Marche nordique) : couleur stable tirée de son nom
  var PALETTE_FAM = ['#2F7D5C', '#9C4F96', '#A0522D', '#2E6F95', '#7B6D2A', '#B0476B'];
  function couleurNouvelle(f) { var h = 0; for (var i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) >>> 0; return PALETTE_FAM[h % PALETTE_FAM.length]; }
  function couleurFam(code) { var f = famille(code); return f ? FAMILLES[f] || couleurNouvelle(f) : null; }
  function minutes(v) { var t = C.texte(v); return /^\d+([.,]\d+)?$/.test(t) ? t + ' min' : t; }
  function badgeRPE(v) {
    var l = C.libelleRPE(v);
    return '<span class="rpe"' + (l ? ' style="--rpe:' + l.couleur + ';--rpe-t:' + l.texte + '"' : '') + '>' + C.nombreFR(v, 1) + '</span>' + (l && l.libelle ? ' <span class="petit muet">' + esc(l.libelle) + '</span>' : '');
  }
  function jourCourt(iso) { return C.JOURS_LONGS[C.dayOfWeek(iso)].slice(0, 3) + '. ' + C.formatDateFR(iso, true); }
  function semaineDe(a, iso) { return a.debut ? C.numSemaine(a.debut, iso) : null; }
  function lundiDe(a, n) { return C.lundiSemaine(a.debut, n); }
  // Semaines antérieures au contrat en cours (n < 1) : numérotées dans le contrat archivé qui les couvre
  function nomSemaine(a, n) {
    if (n >= 1) return { nom: 'S' + n, info: (a.semaines || {})[n] || {}, contrat: null };
    var lundi = lundiDe(a, n), c = C.contratDe(a, lundi);
    if (!c) return { nom: 'Avant S1', info: {}, contrat: null };
    var k = C.numSemaine(c.debut, lundi);
    return { nom: 'S' + k, info: (c.semaines || {})[k] || {}, contrat: c };
  }
  // Première semaine consultable : S1, ou plus tôt s'il reste des séances d'un contrat précédent
  function semaineMin(a) {
    var dates = Object.keys(a.jours || {}).sort(), s = dates.length ? semaineDe(a, dates[0]) : null;
    return C.isNum(s) && s < 1 ? s : 1;
  }
  function ilYa(iso) {
    if (!iso) return 'jamais';
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (!isFinite(s)) return '—';
    if (s < 60) return 'à l\'instant';
    if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
    return 'le ' + C.formatDateFR(C.todayParis(new Date(iso)));
  }
  function ecart(v, prec, format) {
    var d = v - prec;
    if (!d) return '<span class="ecart">= période préc.</span>';
    return '<span class="ecart">' + (d > 0 ? '+' : '−') + format(Math.abs(d)) + '</span>';
  }

  /* ---------- Stockage local : IndexedDB, repli localStorage puis mémoire ---------- */
  function creerStore(nom) {
    var db = null, api = { mode: null };
    function ouvrir() {
      return new Promise(function (ok, ko) {
        if (!window.indexedDB) return ko(new Error('IndexedDB indisponible'));
        var r = indexedDB.open(nom, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { ko(r.error); };
      });
    }
    api.charger = function () {
      return ouvrir().then(function (d) {
        db = d; api.mode = 'IndexedDB';
        return new Promise(function (ok, ko) { var q = db.transaction('kv').objectStore('kv').get('etat'); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ko(q.error); }; });
      }).catch(function () {
        try { api.mode = 'localStorage'; var b = localStorage.getItem(nom); return b ? JSON.parse(b) : null; }
        catch (e) { api.mode = 'mémoire (non enregistré)'; return null; }
      });
    };
    api.enregistrer = function (etat) {
      if (api.mode === 'IndexedDB') return new Promise(function (ok, ko) {
        var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(JSON.parse(JSON.stringify(etat)), 'etat');
        t.oncomplete = function () { ok(); }; t.onerror = function () { ko(t.error); };
      });
      if (api.mode === 'localStorage') { try { localStorage.setItem(nom, JSON.stringify(etat)); } catch (e) { return Promise.reject(e); } }
      return Promise.resolve();
    };
    return api;
  }

  /* ---------- Service en ligne (script Google de l'entraîneur) ---------- */
  // Adresse du service : fichier config.json publié avec l'application (modifiable dans les réglages entraîneur)
  function chargerConfig(chemin) {
    return fetch(chemin, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
  }
  // Requête « simple » (texte brut) : pas de requête préalable CORS, acceptée par Google Apps Script
  function appelService(url, corps) {
    if (!url) return Promise.reject(new Error('service en ligne non configuré'));
    return fetch(url, { method: 'POST', body: JSON.stringify(corps), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('service injoignable (' + r.status + ')'); return r.json(); })
      .then(function (d) { if (!d || !d.ok) throw new Error((d && d.erreur) || 'réponse inattendue du service'); return d; });
  }

  /* ---------- Carte d'un jour ---------- */
  // Allure selon la discipline : min/km (course, marche), km/h (vélo), min/100 m (natation), rien (renforcement)
  function texteAllure(type, j) {
    if (!C.isNum(j.km) || !C.isNum(j.dureeSec) || j.km <= 0 || j.dureeSec <= 0) return '';
    if (type === 'kmh') return C.nombreFR(j.km / (j.dureeSec / 3600), 1) + ' km/h';
    if (type === '100m') { var s = Math.round(j.dureeSec / (j.km * 10)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + ' /100 m'; }
    if (type === 'km') { var a = C.allureMoyenne(j.dureeSec, j.km); return a ? C.formatAllure(a) : ''; }
    return '';
  }
  // opts.role : 'coach' ou 'athlete'
  function carteJour(a, date, j, aj, opts) {
    var lg = ctx.legende() || {}, role = opts.role;
    var repos = C.estRepos(j), vide = !C.aContenuCoach(j), coul = couleurFam(j.type);
    var lp = C.chercherCode(lg.profils, j.profil), lt = C.chercherCode(lg.types, j.type);
    var rep = C.reperesSeance(j, { vma: a.vma, zones: a.zones, allures: a.allures });
    var act = C.activite(j), allure = texteAllure(act ? act.activite.allure : 'km', j);
    var tc = C.normCode(j.type), h = '<article class="jour' + (repos || vide ? ' repos' : '') + (date === aj ? ' auj' : '') + (tc === 'COMP' ? ' course' : tc === 'PROTO' ? ' proto' : '') + '"' + (coul ? ' style="--fam:' + coul + '"' : '') + ' id="j-' + date + '">';
    h += '<div class="tete"><span class="date">' + (date === aj ? 'Aujourd\'hui' : jourCourt(date)) + '</span><span class="corps">' + (vide ? '<span class="muet">' + (role === 'athlete' ? 'Pas de séance prévue' : '—') + '</span>' : esc(j.corps || '')) + '</span></div>';
    var puces = [];
    if (j.eveil) puces.push('<span class="puce" title="Échauffement / éveil musculaire">Éveil ' + esc(minutes(j.eveil)) + '</span>');
    if (j.educ) puces.push('<span class="puce" title="Éducatifs / gammes athlétiques">Éduc ' + esc(minutes(j.educ)) + '</span>');
    if (j.rac) puces.push('<span class="puce" title="Retour au calme">RAC ' + esc(minutes(j.rac)) + '</span>');
    if (j.profil) puces.push('<span class="puce" title="Profil">' + esc(j.profil) + '</span>');
    if (j.type) puces.push('<span class="puce type" title="Type' + (famille(j.type) ? ' · ' + esc(famille(j.type)) : '') + '">' + esc(j.type) + '</span>');
    if (puces.length) h += '<div class="puces">' + puces.join('') + '</div>';
    if (j.consignes) h += '<div class="consigne">⚑ ' + esc(j.consignes) + '</div>';
    if (rep.length) h += '<div class="reperes">' + rep.map(function (r) { return '<span class="repere"><b>' + esc(r.libelle) + '</b> · ' + esc(r.detail) + '</span>'; }).join('') + '</div>';
    if (lp || lt) {
      h += '<details class="def"><summary>Définitions</summary>' +
        (lt ? '<div><b>' + esc(lt.entree.code) + '</b>' + (lt.variante ? ' (variante « ' + esc(j.type) + ' »)' : '') + ' : ' + esc(lt.entree.desc) + '</div>' : '') +
        (lp ? '<div><b>' + esc(lp.entree.code) + '</b> : ' + esc(lp.entree.desc) + '</div>' : '') + '</details>';
    }
    var aRet = C.aRetour(j), passe = date <= aj, nf = C.nonRealisee(j), dc = C.decalee(j), fl = C.faiteLe(j);
    if (aRet || (!repos && !vide)) {
      h += '<div class="retour">';
      if (nf) h += '<span class="pas-faite">Pas réalisée</span>' + (nf.raison ? '<span class="muet">' + esc(nf.raison) + '</span>' : '');
      else if (dc) h += '<span class="decalee">Décalée au ' + esc(jourCourt(dc.au)) + '</span>' + (dc.raison ? '<span class="muet">' + esc(dc.raison) + '</span>' : '');
      else if (aRet) {
        if (fl) h += '<span class="muet">Faite le ' + esc(jourCourt(fl.le)) + '</span>';
        if (act) h += '<span class="activite">' + esc(act.activite.nom) + '</span>';
        h += (C.isNum(j.km) ? '<span><b>' + C.nombreFR(j.km, 2) + '</b> km</span>' : '') +
          (C.isNum(j.dureeSec) ? '<span><b>' + C.formatDuree(j.dureeSec) + '</b></span>' : '') +
          (allure ? '<span>' + allure + '</span>' : '') +
          (C.isNum(j.dplus) ? '<span>D+ ' + Math.round(j.dplus) + ' m</span>' : '') +
          (C.isNum(j.fc) ? '<span>FC moy. <b>' + Math.round(j.fc) + '</b> bpm</span>' : '') +
          (C.isNum(j.rpe) ? '<span>RPE ' + badgeRPE(j.rpe) + '</span>' : '') +
          (C.terrain(j) ? '<span class="terrain">' + esc(C.terrain(j)) + '</span>' : '');
      } else h += '<span class="muet petit">' + (role === 'athlete' ? (passe ? 'Pas encore saisie' : 'À venir') : 'Pas encore de retour') + '</span>';
      h += '<span class="espace"></span>';
      if (role === 'coach') {
        if (aRet) h += '<button class="discret noprint" data-act="reagir" data-date="' + date + '">' + (j.reaction ? 'Ma réaction' : 'Réagir') + '</button>';
        h += '<button class="discret noprint" data-act="editJour" data-date="' + date + '">Modifier</button>';
      } else if (passe || aRet) {
        if (nf || dc) h += '<button class="discret noprint" data-act="pasFaite" data-date="' + date + '">Modifier</button><button class="discret noprint" data-act="saisir" data-date="' + date + '">' + (dc ? 'Saisir ma séance' : 'Je l\'ai faite') + '</button>';
        else {
          if (!aRet && C.estPrevue(j)) h += '<button class="discret noprint" data-act="pasFaite" data-date="' + date + '">Pas réalisée</button>';
          h += '<button class="discret noprint" data-act="saisir" data-date="' + date + '">' + (aRet ? 'Modifier ma saisie' : 'Saisir ma séance') + '</button>';
        }
      }
      var note = nf ? nf.message : dc ? dc.message : fl ? fl.notes : act ? act.notes : C.notesPrincipales(j.notes);
      if (C.texte(note)) h += '<div class="note">« ' + esc(note) + ' »</div>';
      if (j.reaction) h += '<div class="reaction">' + (role === 'coach' ? 'Ta réaction' : 'Ton entraîneur') + ' : ' + esc(j.reaction) + '</div>';
      h += '</div>';
    }
    h += htmlExtras(j, date, role, passe, aRet || (!repos && !vide));
    if (!aRet && (repos || vide)) {
      if (role === 'coach') {
        h += '<div class="ligne noprint" style="justify-content:flex-end"><button class="discret" data-act="editJour" data-date="' + date + '">' + (vide ? 'Ajouter une séance' : 'Modifier') + '</button></div>';
      } else if (passe) {
        h += '<div class="ligne noprint" style="justify-content:flex-end"><button class="discret" data-act="saisir" data-date="' + date + '">Ajouter une sortie</button></div>';
      }
    }
    return h + '</article>';
  }

  // Activités en plus de la séance du jour (ex. vélo l'après-midi) ; l'athlète en ajoute une sur un jour passé ou aujourd'hui
  function htmlExtras(j, date, role, passe, ajout) {
    var ex = C.extras(j), h = '';
    if (ex.length) h += '<ul class="extras">' + ex.map(function (x, i) {
      var mes = [C.isNum(x.km) ? '<b>' + C.nombreFR(x.km, 2) + '</b> km' : '', C.isNum(x.dureeSec) ? '<b>' + C.formatDuree(x.dureeSec) + '</b>' : '', texteAllure(x.activite.allure, x),
        C.isNum(x.dplus) ? 'D+ ' + Math.round(x.dplus) + ' m' : '', C.isNum(x.fc) ? 'FC moy. ' + Math.round(x.fc) + ' bpm' : '', C.isNum(x.rpe) ? 'RPE ' + badgeRPE(x.rpe) : ''].filter(Boolean);
      return '<li><span class="activite">+ ' + esc(x.activite.nom) + '</span><span class="mesures">' + mes.join('<span class="sep"> · </span>') + '</span>' +
        (role === 'athlete' ? '<button class="discret noprint" data-act="extra" data-date="' + date + '" data-i="' + i + '">Modifier</button>' : '') +
        (C.texte(x.note) ? '<div class="note">« ' + esc(x.note) + ' »</div>' : '') + '</li>';
    }).join('') + '</ul>';
    if (role === 'athlete' && passe && ajout) h += '<div class="ligne noprint" style="justify-content:flex-end"><button class="discret" data-act="extra" data-date="' + date + '">+ Autre activité</button></div>';
    return h;
  }

  /* ---------- Fiche (en-tête du plan) ---------- */
  function htmlFiche(a, aj, boutons) {
    var sNow = semaineDe(a, aj), compet = C.prochaineCompet(a, aj);
    var dispo = [['L', 'L'], ['M1', 'M'], ['M2', 'M'], ['J', 'J'], ['V', 'V'], ['S', 'S'], ['D', 'D']];
    return '<section class="carte fiche"><div class="ligne"><div class="espace"><h2>' + esc(nomComplet(a)) + '</h2>' +
      (a.objectif ? '<div class="objectif">' + esc(a.objectif) + '</div>' : '') +
      (a.objectif2 ? '<div class="muet petit">' + esc(a.objectif2) + '</div>' : '') + '</div>' + (boutons || '') + '</div>' +
      '<div class="kpis">' +
      '<div class="kpi"><b>' + (sNow ? 'S' + sNow : '—') + (a.contratSemaines ? ' / ' + a.contratSemaines : '') + '</b><span>Semaine du contrat' + (a.fin ? ' (fin ' + C.formatDateFR(a.fin) + ')' : '') + '</span></div>' +
      '<div class="kpi"><b>' + (C.isNum(a.vma) ? C.nombreFR(a.vma) + ' km/h' : '—') + '</b><span>VMA de référence</span></div>' +
      '<div class="kpi"><b>' + esc(a.hebdo || '—') + '</b><span>Séances par semaine</span></div>' +
      '<div class="kpi"><b>' + (compet ? (compet.dans === 0 ? 'Aujourd\'hui' : 'J-' + compet.dans) : '—') + '</b><span>' + (compet ? esc(compet.jour.corps) + ' · ' + C.formatDateFR(compet.date) : 'Prochaine compétition') + '</span></div>' +
      '</div>' +
      '<div class="ligne petit muet" style="margin-top:10px"><span>Dispos :</span><span class="dispos">' + dispo.map(function (d, i) { return '<span class="' + (a.dispos && a.dispos[d[0]] ? 'oui' : '') + '" title="' + C.JOURS_LONGS[i] + (a.dispos && a.dispos[d[0]] ? ' : disponible' : ' : non') + '">' + d[1] + '</span>'; }).join('') + '</span>' +
      (a.contraintes ? '<span>· Contraintes : ' + esc(a.contraintes) + '</span>' : '') + (a.terrains ? '<span>· Terrains : ' + esc(a.terrains) + '</span>' : '') + '</div>' +
      '</section>';
  }

  /* ---------- Semaine du plan ---------- */
  function htmlSemaine(a, n, aj, opts) {
    var lundi = lundiDe(a, n), dim = C.addDays(lundi, 6), ns = nomSemaine(a, n), info = ns.info, ct = ns.contrat;
    var jours = C.joursSemaine(a, lundi), bil = C.bilanJours(jours.map(function (x) { return x.jour; }));
    var h = '<section class="carte"><div class="nav-semaine">' +
      '<button class="sec" data-act="semPrec" aria-label="Semaine précédente">◀</button>' +
      '<h2>' + ns.nom + '<small>du ' + C.formatDateFR(lundi) + ' au ' + C.formatDateFR(dim) + '</small></h2>' +
      '<button class="sec" data-act="semSuiv" aria-label="Semaine suivante">▶</button></div>' +
      '<div class="ligne noprint" style="justify-content:center;margin-top:8px">' +
      '<button class="discret" data-act="semAuj">Cette semaine</button>' +
      '<button class="discret" data-act="imprimer">Imprimer</button>' + (opts.boutonsSemaine || '') + '</div>' +
      (n < 1 ? '<p class="ancien-contrat">' + (ct ? 'Contrat précédent · débuté le ' + C.formatDateFR(ct.debut) + (ct.objectif ? ' · ' + esc(ct.objectif) : '') : 'Avant le début du contrat') + '</p>' : '') +
      ((info.phase || info.cycle) ? '<div class="ruban">' + (info.phase ? '<span title="Situation planif">' + esc(info.phase) + '</span>' : '') + (info.cycle ? '<span class="cycle" title="Type de cycle">' + esc(info.cycle) + '</span>' : '') + '</div>' : '') +
      '</section>';
    h += '<section class="jours" aria-label="Séances de la semaine">' + jours.map(function (x) { return carteJour(a, x.date, x.jour, aj, opts); }).join('') + '</section>';
    h += '<section class="carte" style="margin-top:14px"><h3>Bilan ' + ns.nom + '</h3><div class="bilan">' +
      '<div class="kpi"><b>' + C.nombreFR(bil.km, 2) + ' km</b><span>KM hebdo</span></div>' +
      '<div class="kpi"><b>' + (bil.dureeSec ? C.formatDuree(bil.dureeSec) : '—') + '</b><span>Durée</span></div>' +
      '<div class="kpi"><b>' + (bil.rpeMoy !== null ? C.nombreFR(bil.rpeMoy, 1) : '—') + '</b><span>RPE moyen' + (bil.nbRpe ? ' (' + bil.nbRpe + ' séance' + (bil.nbRpe > 1 ? 's' : '') + ')' : '') + '</span></div>' +
      '<div class="kpi"><b>' + bil.faites + ' / ' + bil.prevues + '</b><span>Séances renseignées / prévues</span></div>' +
      '</div>' + (bil.autres.length ? '<p class="muet petit" style="margin:10px 0 0">Autres activités (hors course à pied) : ' + esc(bil.autres.join(', ')) + '</p>' : '') + '</section>';
    return h;
  }

  /* ---------- Km par semaine (graphique + tableau) ---------- */
  function semainesAvecDonnees(a) {
    var dates = Object.keys(a.jours || {}).sort();
    if (!dates.length || !a.debut) return [];
    var s1 = semaineDe(a, dates[0]), s2 = semaineDe(a, dates[dates.length - 1]), out = [];
    for (var s = s1; s <= s2; s++) {
      var l = lundiDe(a, s), jr = C.joursSemaine(a, l).map(function (x) { return x.jour; });
      var b = C.bilanJours(jr);
      var ns = nomSemaine(a, s);
      b.n = s; b.nom = ns.nom; b.lundi = l; b.info = ns.info;
      b.compet = jr.filter(function (j) { return C.normCode(j.type) === 'COMP'; }).map(function (j) { return j.corps; });
      out.push(b);
    }
    return out;
  }
  function htmlEnsemble(a, n) {
    var sem = semainesAvecDonnees(a);
    if (!sem.length) return '';
    return '<section class="carte noprint"><h3>KM réalisés par semaine</h3>' +
      '<p class="muet petit">Somme des km saisis. Touchez une barre pour ouvrir la semaine.</p>' +
      '<div class="graph" id="graph"></div>' +
      '<details><summary>Tableau des semaines</summary><div class="tableau"><table><thead><tr><th>Sem.</th><th>Lundi</th><th>Phase / cycle</th><th class="num">Prévues</th><th class="num">KM</th><th class="num">Durée</th><th class="num">RPE moy.</th><th>Compétition</th></tr></thead><tbody>' +
      sem.map(function (b) {
        return '<tr class="cliquable' + (b.n === n ? ' cour' : '') + '" data-act="allerSem" data-n="' + b.n + '"><td>' + b.nom + '</td><td>' + C.formatDateFR(b.lundi) + '</td><td>' + esc([b.info.phase, b.info.cycle].filter(Boolean).join(' · ')) + '</td>' +
          '<td class="num">' + b.prevues + '</td><td class="num">' + (b.km ? C.nombreFR(b.km, 2) : '') + '</td><td class="num">' + (b.dureeSec ? C.formatDuree(b.dureeSec) : '') + '</td>' +
          '<td class="num">' + (b.rpeMoy !== null ? C.nombreFR(b.rpeMoy, 1) : '') + '</td><td>' + esc(b.compet.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div></details></section>';
  }
  function brancherGraph(a, nCourant, allerA) {
    var zone = $('#graph');
    if (!zone) return;
    var sem = semainesAvecDonnees(a), W = Math.max(320, zone.clientWidth || 600), H = 200, g = 34, d = 10, hh = 18, bas = 24;
    var max = Math.max.apply(null, sem.map(function (b) { return b.km; }).concat([10]));
    // Pas de graduation choisi pour garder au plus 6 lignes, quelle que soit la valeur maximale
    var pas = [10, 20, 50, 100, 200, 500, 1000].filter(function (p) { return max / p <= 6; })[0] || Math.ceil(max / 6), top = Math.ceil(max / pas) * pas, lw = (W - g - d) / sem.length, bw = Math.max(2, Math.min(28, lw - 2));
    var y = function (v) { return H - bas - (H - bas - hh) * v / top; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Kilomètres réalisés par semaine, de ' + sem[0].nom + ' à ' + sem[sem.length - 1].nom + '">';
    for (var v = 0; v <= top; v += pas) s += '<line class="grille" x1="' + g + '" x2="' + (W - d) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="axe" x="' + (g - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    var pasLab = Math.ceil(sem.length / 8);
    sem.forEach(function (b, i) {
      var x = g + i * lw + (lw - bw) / 2, yy = y(b.km), hb = H - bas - yy;
      if (b.km > 0) {
        var r = Math.min(4, bw / 2, hb), cour = b.n === nCourant;
        s += '<path fill="' + (cour ? 'var(--sapin)' : 'var(--vert)') + '" d="M' + x + ' ' + (H - bas) + 'V' + (yy + r) + 'Q' + x + ' ' + yy + ' ' + (x + r) + ' ' + yy + 'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + yy + ' ' + (x + bw) + ' ' + (yy + r) + 'V' + (H - bas) + 'Z"/>';
      }
      s += '<rect class="cible" data-i="' + i + '" x="' + (g + i * lw) + '" y="' + hh + '" width="' + lw + '" height="' + (H - bas - hh) + '" tabindex="0" aria-label="' + b.nom + ' : ' + C.nombreFR(b.km, 1) + ' km"/>';
      if (i % pasLab === 0) s += '<text class="axe" x="' + (g + i * lw + lw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + b.nom + '</text>';
    });
    s += '<line x1="' + g + '" x2="' + (W - d) + '" y1="' + (H - bas) + '" y2="' + (H - bas) + '" stroke="var(--texte-2)"/></svg><div class="infobulle" role="tooltip"></div>';
    zone.innerHTML = s;
    var bulle = $('.infobulle', zone);
    function montrer(e) {
      var b = sem[+e.target.dataset.i]; if (!b) return;
      bulle.innerHTML = '<b>' + b.nom + '</b> · ' + C.formatDateFR(b.lundi) + '<br>' + C.nombreFR(b.km, 2) + ' km' + (b.dureeSec ? ' · ' + C.formatDuree(b.dureeSec) : '') + (b.rpeMoy !== null ? ' · RPE ' + C.nombreFR(b.rpeMoy, 1) : '') + (b.info.phase ? '<br>' + esc(b.info.phase) : '');
      bulle.style.display = 'block';
      var rz = zone.getBoundingClientRect(), rr = e.target.getBoundingClientRect();
      bulle.style.left = Math.max(0, Math.min(rz.width - bulle.offsetWidth, rr.left - rz.left + rr.width / 2 - bulle.offsetWidth / 2)) + 'px';
      bulle.style.top = '0px';
    }
    $$('rect.cible', zone).forEach(function (r) {
      r.addEventListener('mouseenter', montrer); r.addEventListener('focus', montrer);
      r.addEventListener('mouseleave', function () { bulle.style.display = 'none'; }); r.addEventListener('blur', function () { bulle.style.display = 'none'; });
      r.addEventListener('click', function () { allerA(sem[+r.dataset.i].n); });
      r.addEventListener('keydown', function (e) { if (e.key === 'Enter') allerA(sem[+r.dataset.i].n); });
    });
  }

  /* ---------- Légende ---------- */
  var rechercheLegende = '';
  function surligner(t, q) {
    var s = esc(t); if (!q) return s;
    var i = s.toUpperCase().indexOf(esc(q).toUpperCase());
    return i < 0 ? s : s.slice(0, i) + '<mark>' + s.slice(i, i + esc(q).length) + '</mark>' + s.slice(i + esc(q).length);
  }
  function vueLegende(main) {
    var lg = ctx.legende() || { principes: [], colonnes: [], profils: [], types: [] }, q = rechercheLegende.trim();
    function filtre(l) { return (l || []).filter(function (x) { return !q || (x.code + ' ' + x.desc).toUpperCase().indexOf(q.toUpperCase()) >= 0; }); }
    function liste(l) { return l.length ? '<dl class="codes">' + l.map(function (x) { return '<dt>' + surligner(x.code, q) + '</dt><dd>' + surligner(x.desc, q) + '</dd>'; }).join('') + '</dl>' : '<p class="muet">Aucun résultat.</p>'; }
    var h = '<section class="carte"><h2>Légende &amp; abréviations</h2><label for="rechLeg">Rechercher un code ou un mot</label><input id="rechLeg" type="search" value="' + esc(rechercheLegende) + '" placeholder="ex. VMA, RTDESC, côte"></section>';
    if (!q && (lg.principes || []).length) h += '<section class="carte"><h3>Principes</h3><ol>' + lg.principes.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></section>';
    h += '<div class="grille2"><section class="carte"><h3>Colonnes du tableau</h3>' + liste(filtre(lg.colonnes)) + '</section>' +
      '<section class="carte"><h3>Colonne PROFIL</h3>' + liste(filtre(lg.profils)) + '</section></div>';
    var types = filtre(lg.types), fams = {};
    types.forEach(function (t) { var f = t.famille || 'Autres'; (fams[f] = fams[f] || []).push(t); });
    h += '<section class="carte"><h3>Colonne TYPE</h3>' + (types.length ? '' : '<p class="muet">Aucun résultat.</p>') +
      Object.keys(fams).map(function (f) {
        return '<h3 style="margin-top:14px;font-size:.95rem"><span class="fam" style="--fam:' + (FAMILLES[f] || (f === 'Autres' ? 'var(--bord)' : couleurNouvelle(f))) + '"></span>' + esc(f) + '</h3>' + liste(fams[f]);
      }).join('') +
      (q ? '' : '<p class="muet petit" style="margin-top:14px">Les familles reprennent les regroupements de la colonne H de l\'onglet LEGENDE. « COMP » (compétition) et « PROTO » sont utilisés dans le plan mais ne figurent pas dans la légende.</p>') + '</section>';
    h += '<section class="carte"><h3>Échelle RPE</h3><p class="muet petit">Niveau d\'intensité perçu de la séance, à noter 30 min après la séance.</p><div class="echelle">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { var l = C.libelleRPE(n); return '<span style="--rpe:' + l.couleur + ';--rpe-t:' + l.texte + '"><b>' + n + '</b>' + esc(l.libelle) + '</span>'; }).join('') + '</div></section>';
    main.innerHTML = h;
    var r = $('#rechLeg');
    r.oninput = function () { rechercheLegende = r.value; var pos = r.selectionStart; vueLegende(main); var n = $('#rechLeg'); n.focus(); n.setSelectionRange(pos, pos); };
  }

  /* ---------- Allures ---------- */
  // modifiable : formulaire actif (entraîneur) ou lecture seule (athlète) ; enregistrer(a) appelé après modification
  function vueAllures(main, a, modifiable, enregistrer) {
    var vma = a.vma, al = a.allures || {}, dis = modifiable ? '' : ' disabled';
    var h;
    if (!modifiable) {
      // Lecture seule (athlète) : valeurs en cases, pas de champs grisés
      var vals = [['VMA', C.isNum(vma) ? C.nombreFR(vma) + ' km/h' : ''], ['Type de test', (a.test || {}).type], ['Date du test', (a.test || {}).date],
        ['Chrono 10 km', C.isNum(al.chrono10) ? C.formatDuree(al.chrono10) : ''], ['Chrono semi', C.isNum(al.chronoSemi) ? C.formatDuree(al.chronoSemi) : ''],
        ['Chrono marathon', C.isNum(al.chronoMarathon) ? C.formatDuree(al.chronoMarathon) : ''], ['Pré-fatigue', C.isNum(al.preFatPct) ? C.nombreFR(al.preFatPct, 1) + ' % VMA' : '']];
      h = '<section class="carte"><h2>VMA &amp; allures</h2><div class="kpis kpis2 valeurs">' + vals.map(function (x) { return '<div class="kpi"><span class="etiq">' + x[0] + '</span><b>' + (C.texte(x[1]) ? esc(x[1]) : '—') + '</b></div>'; }).join('') +
        '</div><p class="muet petit" style="margin:12px 0 0">Valeurs fixées par ton entraîneur. Formules de l\'onglet ALLURES du tableau de l\'entraîneur.</p></section>';
    } else h = '<section class="carte"><h2>VMA &amp; allures</h2><form id="fAll" class="champs">' +
      '<label>VMA (km/h)<input name="vma" inputmode="decimal"' + dis + ' value="' + (C.isNum(vma) ? C.nombreFR(vma) : '') + '"></label>' +
      '<label>Type de test<input name="ttype"' + dis + ' value="' + esc((a.test || {}).type) + '" placeholder="1/2 COOPER"></label>' +
      '<label>Date du test<input name="tdate"' + dis + ' value="' + esc((a.test || {}).date) + '" placeholder="11/24"></label>' +
      '<label>Chrono 10 km<input name="c10"' + dis + ' value="' + (C.isNum(al.chrono10) ? C.formatDuree(al.chrono10) : '') + '" placeholder="0:37:00"></label>' +
      '<label>Chrono semi<input name="cs"' + dis + ' value="' + (C.isNum(al.chronoSemi) ? C.formatDuree(al.chronoSemi) : '') + '" placeholder="1:22:45"></label>' +
      '<label>Chrono marathon<input name="cm"' + dis + ' value="' + (C.isNum(al.chronoMarathon) ? C.formatDuree(al.chronoMarathon) : '') + '" placeholder="2:59:00"></label>' +
      '<label>Pré-fatigue (% VMA)<input name="pf" inputmode="decimal"' + dis + ' value="' + C.nombreFR(al.preFatPct, 1) + '"></label>' +
      '</form><p class="alerte" id="erreurAll" hidden></p><p class="muet petit">' + (modifiable ? 'Les calculs se mettent à jour à chaque modification.' : 'Valeurs fixées par ton entraîneur.') + ' Formules de l\'onglet ALLURES du tableau de l\'entraîneur.</p></section>';
    if (!C.isNum(vma)) { main.innerHTML = h + '<p class="alerte">' + (modifiable ? 'Renseigne la VMA pour afficher les allures.' : 'Ton entraîneur n\'a pas encore renseigné ta VMA.') + '</p>'; brancher(); return; }
    h += '<div class="grille2"><section class="carte"><h3>Zones d\'allures</h3><div class="tableau"><table class="compact"><thead><tr><th>Zone</th><th class="num">% VMA</th><th class="num">km/h</th><th class="num">min/km</th><th>Usage</th></tr></thead><tbody>' +
      (a.zones || []).map(function (z) { var v = C.zoneVitesses(vma, z); return '<tr><td><b>' + esc(z.nom) + '</b></td><td class="num">' + C.nombreFR(z.bas, 1) + '–' + C.nombreFR(z.haut, 1) + '</td><td class="num">' + (v ? C.nombreFR(v.bas, 1) + '–' + C.nombreFR(v.haut, 1) : '') + '</td><td class="num">' + (v ? C.formatAllure(v.allureLente).replace(' /km', '') + '–' + C.formatAllure(v.allureRapide).replace(' /km', '') : '') + '</td><td>' + esc(z.usage) + '</td></tr>'; }).join('') +
      '</tbody></table></div></section>';
    var hist = a.historiqueVMA || [];
    h += '<section class="carte"><h3>Évolution de la VMA</h3>' + (hist.length ? '<div class="tableau"><table><thead><tr><th>Test</th><th>Date</th><th class="num">VMA</th>' + (modifiable ? '<th></th>' : '') + '</tr></thead><tbody>' +
      hist.map(function (x, i) { return '<tr><td>' + esc(x.test) + '</td><td>' + esc(x.date) + '</td><td class="num">' + C.nombreFR(x.vma, 2) + ' km/h</td>' + (modifiable ? '<td><button class="discret" data-act="supprVma" data-i="' + i + '" aria-label="Supprimer">✕</button></td>' : '') + '</tr>'; }).join('') +
      '</tbody></table></div>' : '<p class="muet">Aucun test enregistré.</p>') +
      (modifiable ? '<form id="fHist" class="champs" style="margin-top:10px"><label>Test<input name="t" placeholder="1/2 COOP"></label><label>Date<input name="d" placeholder="11/24"></label><label>VMA<input name="v" inputmode="decimal"></label><label>&nbsp;<button>Ajouter</button></label></form>' : '') + '</section></div>';
    var pcts = [120, 115, 110, 105, 100, 95], dists = [500, 400, 300, 200, 100];
    h += '<section class="carte"><h3>Valeurs du travail en VMA ou PAL</h3><div class="tableau"><table><thead><tr><th>Distance</th>' + pcts.map(function (p) { return '<th class="num">' + p + ' %<br><span class="muet petit">' + C.nombreFR(C.vitessePct(vma, p), 1) + ' km/h</span></th>'; }).join('') + '</tr></thead><tbody>' +
      dists.map(function (d) { return '<tr><td><b>' + d + ' m</b></td>' + pcts.map(function (p) { return '<td class="num">' + C.formatTemps(C.tempsDistancePct(d, vma, p)) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><p class="muet petit">PAL : puissance anaérobie lactique (résistance-intensité) ; effort proche du maximum d\'une durée de 20 s à 1 min. Récupération incomplète et passive ; 3 à 6 répétitions. 100 % = VMA courte, 95 % = VMA longue.</p></section>';
    var specs = [['10 km', al.chrono10, 10, 90], ['semi-marathon (21,1 km)', al.chronoSemi, 21.1, 85], ['marathon (42,195 km)', al.chronoMarathon, 42.195, 80]];
    h += '<div class="grille2">' + specs.map(function (s) {
      var x = C.allureChrono(s[1], s[2]), rep = C.vitessePct(vma, s[3]);
      var t = '<section class="carte"><h3>Allure spécifique ' + s[0] + '</h3>';
      if (!x) t += '<p class="muet">Pas de chrono de référence.</p>';
      else t += '<p><b>' + C.formatAllure(x.allure) + '</b> · ' + C.nombreFR(x.vitesse, 2) + ' km/h <span class="muet petit">(chrono ' + C.formatDuree(s[1]) + ')</span></p>' +
        '<div class="tableau"><table><thead><tr><th>Distance</th><th class="num">Temps</th></tr></thead><tbody>' + [1000, 2000, 3000, 4000, 5000].map(function (d) { return '<tr><td>' + d + ' m</td><td class="num">' + C.formatTemps(x.allure * d / 1000) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      return t + '<p class="muet petit">Repère : ' + s[3] + ' % de VMA = ' + C.nombreFR(rep, 2) + ' km/h (' + C.formatAllure(C.paceFromSpeed(rep)) + ')</p></section>';
    }).join('');
    var vpf = C.vitessePct(vma, al.preFatPct);
    h += '<section class="carte"><h3>Travail en pré-fatigue</h3><p><b>' + C.nombreFR(al.preFatPct, 1) + ' %</b> de VMA = ' + C.nombreFR(vpf, 2) + ' km/h · ' + C.formatAllure(C.paceFromSpeed(vpf)) + '</p>' +
      '<div class="tableau"><table><thead><tr><th>Distance</th><th class="num">Temps</th></tr></thead><tbody>' + [1000, 2000, 3000, 4000, 5000].map(function (d) { return '<tr><td>' + d + ' m</td><td class="num">' + C.formatTemps(C.tempsDistancePct(d, vma, al.preFatPct)) + '</td></tr>'; }).join('') + '</tbody></table></div></section></div>';
    h += '<section class="carte"><h3>Séance 30"-30" sur piste</h3><p class="muet petit">Distance en mètres à parcourir en 30 secondes.</p><div class="tableau"><table class="compact"><thead><tr>' + [105, 102, 100].map(function (p) { return '<th class="num">' + p + ' % VMA</th>'; }).join('') + '</tr></thead><tbody><tr>' +
      [105, 102, 100].map(function (p) { return '<td class="num"><b>' + Math.round(C.distanceTempsPct(30, vma, p)) + ' m</b></td>'; }).join('') + '</tr></tbody></table></div></section>';
    main.innerHTML = h;
    brancher();
    function brancher() {
      if (!modifiable) return;
      var f = $('#fAll');
      f.onchange = function () {
        var d = new FormData(f), err = [];
        var v = C.parseNumberFR(d.get('vma'));
        if (v !== null && !(v > 5 && v < 30)) err.push('VMA entre 5 et 30 km/h');
        var ch = {}; [['c10', 'chrono10'], ['cs', 'chronoSemi'], ['cm', 'chronoMarathon']].forEach(function (k) {
          var x = C.parseDuree(d.get(k[0])); if (x !== null && !(x > 0)) err.push('Chrono invalide (format h:mm:ss)'); else ch[k[1]] = x;
        });
        var pf = C.parseNumberFR(d.get('pf'));
        if (!(pf > 0 && pf <= 120)) err.push('Pré-fatigue : % entre 1 et 120');
        if (err.length) { var e = $('#erreurAll'); e.hidden = false; e.textContent = err.join(' · '); return; }
        a.vma = v; a.allures = Object.assign({}, a.allures, ch, { preFatPct: pf });
        a.test = Object.assign({}, a.test, { type: C.texte(d.get('ttype')), date: C.texte(d.get('tdate')) });
        enregistrer(a);
      };
      var fh = $('#fHist');
      if (fh) fh.onsubmit = function (ev) {
        ev.preventDefault();
        var d = new FormData(fh), v = C.parseNumberFR(d.get('v'));
        if (!(v > 5 && v < 30)) { toast('VMA entre 5 et 30 km/h'); return; }
        a.historiqueVMA = (a.historiqueVMA || []).concat([{ test: C.texte(d.get('t')), date: C.texte(d.get('d')), vma: v }]);
        enregistrer(a);
      };
    }
  }

  /* ---------- Protos ---------- */
  // Bibliothèque commune à tous les athlètes ; ceux prévus dans le plan de l'athlète affiché passent en premier.
  // Recherche par code, titre ou contenu (sans tenir compte des majuscules ni des accents)
  var rechercheProtos = '';
  function simplifier(t) { return C.texte(t).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function vueProtos(main, a, modifiable) {
    var protos = ctx.protos() || [], q = simplifier(rechercheProtos.trim());
    var h = '<section class="carte"><div class="ligne"><h2 class="espace">Protocoles</h2>' + (modifiable ? '<button class="sec" data-act="importXlsx">Importer des protocoles</button><button data-act="editProto" data-i="-1">Nouveau protocole</button>' : '') + '</div>' +
      '<p class="petit"><b>Protocoles réfléchis et mis sur pied par Respir Outdoor : utilisation et reproduction interdites.</b></p>' +
      (protos.length ? '<label for="rechProto" style="margin:12px 0 0">Rechercher un protocole<input id="rechProto" type="search" value="' + esc(rechercheProtos) + '" placeholder="ex. PC12, fartlek, côte, VMA"></label>' : '') +
      (modifiable ? '<p class="muet petit" style="margin:6px 0 0">Bibliothèque commune à tous tes athlètes : chaque import (classeur d\'athlète ou classeur de protocoles) ajoute les nouveaux codes et met à jour les existants.</p>' : '') + '</section>' +
      (protos.length ? '' : '<section class="carte vide"><p class="muet">Aucun protocole pour le moment.</p></section>');
    // Un protocole mal formé ne doit jamais empêcher l'affichage des autres
    function carte(p, i) {
      try { return carteProto(p, i); } catch (e) { return '<section class="carte proto"><h3><span class="code">' + esc(p && p.code) + '</span>' + esc(p && p.titre) + '</h3></section>'; }
    }
    function carteProto(p, i) {
      var g = (Array.isArray(p.grille) ? p.grille : []).map(function (l) { return Array.isArray(l) ? l : [l]; }), nc = Math.max.apply(null, g.map(function (l) { return l.length; }).concat([0]));
      var cols = []; for (var c = 0; c < nc; c++) if (g.some(function (l) { return C.texte(l[c]); })) cols.push(c);
      var usages = a ? Object.keys(a.jours || {}).filter(function (d) { return C.protoPrevu(a.jours[d], p.code); }).sort() : [];
      return '<section class="carte proto"><h3><span class="code">' + esc(p.code) + '</span>' + esc(p.titre) + (p.famille ? '<span class="famille-proto">' + esc(p.famille) + '</span>' : '') + '</h3>' +
        (cols.length ? '<div class="tableau"><table><tbody>' + g.map(function (l) { return '<tr>' + cols.map(function (c) { return '<td>' + esc(l[c] || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '') +
        (p.notes ? '<p style="white-space:pre-wrap">' + esc(p.notes) + '</p>' : '') +
        (usages.length ? '<p class="petit muet">Prévu le : ' + usages.map(function (d) { return C.formatDateFR(d); }).join(', ') + '</p>' : '') +
        (modifiable ? '<div class="ligne noprint" style="justify-content:flex-end"><button class="discret" data-act="editProto" data-i="' + i + '">Modifier</button></div>' : '') + '</section>';
    }
    // Tri par code : lettres, puis numéro, puis suffixe (PC1, PC2… PC8, PC8B, PC10… PF1A, PP1, PV1)
    function cle(code) { var m = /^([A-Z]*)\s*(\d*)(.*)$/.exec(C.normCode(code)) || []; return [m[1] || '', m[2] ? Number(m[2]) : -1, m[3] || '']; }
    var idx = protos.map(function (p, i) { return { p: p, i: i, k: cle(p.code), prevu: !!a && Object.keys(a.jours || {}).some(function (d) { return C.protoPrevu(a.jours[d], p.code); }) }; })
      .sort(function (x, y) { return x.k[0] < y.k[0] ? -1 : x.k[0] > y.k[0] ? 1 : x.k[1] - y.k[1] || (x.k[2] < y.k[2] ? -1 : x.k[2] > y.k[2] ? 1 : 0); });
    if (q) {
      var qc = q.replace(/[\s.]/g, '');
      idx = idx.filter(function (x) {
        var p = x.p, tout = simplifier([p.code, p.titre, p.famille, p.notes].concat([].concat.apply([], (Array.isArray(p.grille) ? p.grille : []).map(function (l) { return Array.isArray(l) ? l : [l]; }))).join(' '));
        return tout.indexOf(q) >= 0 || simplifier(p.code).replace(/[\s.]/g, '') === qc;
      });
      h += '<p class="muet petit titre-groupe">' + (idx.length ? idx.length + ' protocole' + (idx.length > 1 ? 's' : '') + ' pour « ' + esc(rechercheProtos.trim()) + ' »' : 'Aucun protocole ne correspond à « ' + esc(rechercheProtos.trim()) + ' ».') + '</p>';
    }
    var dans = idx.filter(function (x) { return x.prevu; }), autres = idx.filter(function (x) { return !x.prevu; });
    if (a && dans.length && autres.length) {
      h += '<h3 class="titre-groupe">' + (modifiable ? 'Dans le plan de ' + esc(prenom(a)) : 'Dans ton plan') + ' (' + dans.length + ')</h3>' + dans.map(function (x) { return carte(x.p, x.i); }).join('');
      h += '<h3 class="titre-groupe">Autres protocoles (' + autres.length + ')</h3>' + autres.map(function (x) { return carte(x.p, x.i); }).join('');
    } else h += idx.map(function (x) { return carte(x.p, x.i); }).join('');
    main.innerHTML = h;
    var r = $('#rechProto');
    if (r) r.oninput = function () { rechercheProtos = r.value; var pos = r.selectionStart; vueProtos(main, a, modifiable); var n = $('#rechProto'); n.focus(); n.setSelectionRange(pos, pos); };
  }


  /* ---------- Barre RPE (saisie) : la barre et les chiffres ---------- */
  function degradeCSS() {
    var d = C.DEGRADE_RPE;
    return 'linear-gradient(90deg,' + d.map(function (c, i) { return c + ' ' + Math.round(i / (d.length - 1) * 100) + '%'; }).join(',') + ')';
  }
  function htmlBarreRPE(valeur) {
    var v = C.isNum(valeur) ? Math.round(valeur) : null;
    return '<div class="barre-rpe' + (v ? '' : ' vide') + '" id="barreRPE">' +
      '<div class="rpe-valeur" aria-hidden="true">' + texteRPE(v) + '</div>' +
      '<input type="range" id="rpeCurseur" min="1" max="10" step="1" value="' + (v || 5) + '" aria-label="Ressenti RPE de 1 (très facile) à 10 (effort maximal)" style="--degrade:' + degradeCSS() + '">' +
      '<div class="graduations" aria-hidden="true">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<span' + (n === v ? ' class="choisi"' : '') + '>' + n + '</span>'; }).join('') + '</div>' +
      '<div class="ligne" style="justify-content:flex-end"><button type="button" class="discret" id="rpeEffacer"' + (v ? '' : ' hidden') + '>Effacer le RPE</button></div>' +
      '<input type="hidden" name="rpe" value="' + (v || '') + '"></div>';
  }
  // Valeur choisie, affichée à droite du titre « Ressenti (RPE) »
  function texteRPE(v) { return v && C.libelleRPE(v) ? badgeRPE(v) : '<span>Non noté</span>'; }
  function brancherBarreRPE(form) {
    var z = $('#barreRPE', form), cur = $('#rpeCurseur', z), cache = $('input[name="rpe"]', z), eff = $('#rpeEffacer', z);
    function maj(v) {
      cache.value = v || '';
      z.classList.toggle('vide', !v);
      $$('.graduations span', z).forEach(function (s, i) { s.classList.toggle('choisi', i + 1 === v); });
      var l = v ? C.libelleRPE(v) : null;
      if (l) { z.style.setProperty('--rpe', l.couleur); cur.setAttribute('aria-valuetext', v + (l.libelle ? ' : ' + l.libelle : '')); }
      eff.hidden = !v;
      $('.rpe-valeur', z).innerHTML = texteRPE(v);
    }
    cur.addEventListener('input', function () { maj(Number(cur.value)); });
    cur.addEventListener('pointerdown', function () { if (!cache.value) maj(Number(cur.value)); });
    eff.onclick = function () { maj(null); };
    if (cache.value) maj(Number(cache.value));
  }

  /* ---------- Thème ---------- */
  function appliquerTheme(theme) { if (theme) document.documentElement.setAttribute('data-theme', theme); else document.documentElement.removeAttribute('data-theme'); }

  return {
    init: function (o) { Object.assign(ctx, o); },
    FAMILLES: FAMILLES, REACTIONS: REACTIONS, esc: esc, $: $, $$: $$, toast: toast, auj: auj, maintenant: maintenant, nomComplet: nomComplet, prenom: prenom,
    famille: famille, couleurFam: couleurFam, badgeRPE: badgeRPE, jourCourt: jourCourt, semaineDe: semaineDe, lundiDe: lundiDe, semaineMin: semaineMin, nomSemaine: nomSemaine, ilYa: ilYa, ecart: ecart,
    creerStore: creerStore, chargerConfig: chargerConfig, appelService: appelService,
    carteJour: carteJour, htmlFiche: htmlFiche, htmlSemaine: htmlSemaine, htmlEnsemble: htmlEnsemble, brancherGraph: brancherGraph,
    vueLegende: vueLegende, vueAllures: vueAllures, htmlBarreRPE: htmlBarreRPE, brancherBarreRPE: brancherBarreRPE, vueProtos: vueProtos, appliquerTheme: appliquerTheme
  };
})();
