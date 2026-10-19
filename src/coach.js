/* ======================================================================
   APPLICATION ENTRAÎNEUR (Respir Outdoor Coach)
   ====================================================================== */
(function () {
  'use strict';
  var C = Core, esc = UI.esc, $ = UI.$, $$ = UI.$$, toast = UI.toast, auj = UI.auj, nomComplet = UI.nomComplet;
  var Store = UI.creerStore('respir-outdoor');
  var E = {
    athletes: [], courant: null, legende: DEFAUTS.legende, protos: [], motGlobal: '',
    reglages: { theme: '', cle: '', service: '', seuilAlerte: 2 },
    sync: { depuis: '', derniere: '', erreur: '' }, aPublier: {}, aSupprimer: [], communAPublier: false, version: 2
  };
  var config = {}, vue = 'athletes', semaineAffichee = null;
  var main = document.getElementById('contenu'), boite = document.getElementById('boite');
  UI.init({ legende: function () { return E.legende; }, protos: function () { return E.protos; } });

  function athlete() { return E.athletes.filter(function (a) { return a.id === E.courant; })[0] || null; }
  function parId(id) { return E.athletes.filter(function (a) { return a.id === id; })[0] || null; }
  function sauver() { return Store.enregistrer(E).catch(function (e) { toast('Enregistrement impossible : ' + e.message); }); }
  function horodatage() { return auj().replace(/-/g, ''); }
  function baseUrl() { return new URL('./', location.href).href; }
  function assurerCode(a) { if (!a.code) a.code = C.genererCode(); }
  function telecharger(nom, contenu, type) {
    var blob = new Blob([contenu], { type: type }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- Synchronisation avec le service Google ---------- */
  function urlService() { return E.reglages.service || config.service || ''; }
  function syncConfiguree() { return !!(urlService() && E.reglages.cle); }
  function marquer(a) { E.aPublier[a.id] = UI.maintenant(); a.maj = UI.maintenant(); planifierSync(); }
  // Jours modifiés ici et pas encore envoyés : ils ne sont pas remplacés par un plan modifié sur un autre appareil ('*' : tout le plan, après un import)
  function marquerJour(a, date) { E.joursModifies = E.joursModifies || {}; (E.joursModifies[a.id] = E.joursModifies[a.id] || {})[date] = 1; }
  function marquerCommun() { E.communAPublier = true; planifierSync(); }
  var minuteur = null, enCours = null;
  function planifierSync() { clearTimeout(minuteur); minuteur = setTimeout(function () { synchroniser(false); }, 1500); }
  function ficheAEnvoyer(a) { var x = JSON.parse(JSON.stringify(a)); delete x.jours; delete x.suivi; delete x.planVu; return x; }
  function appel(corps) { corps.cle = E.reglages.cle; return UI.appelService(urlService(), corps); }

  // Ajoute les athlètes renvoyés par le service (fiche, code du lien, plan et saisies) ; légende et protocoles s'ils manquent ici
  function recupererAthletes(r) {
    var n = 0;
    (r.athletes || []).forEach(function (x) {
      if (parId(x.id)) return;
      var jours = {};
      Object.keys(x.jours || {}).forEach(function (d) { var j = C.nettoyerJour(x.jours[d]); if (Object.keys(j).length) jours[d] = j; });
      var a = Object.assign({}, x.fiche || {}, { id: x.id, prenom: x.prenom, nom: x.nom, code: x.code, motCoach: x.motCoach || '', jours: jours, suivi: x.suivi || {} });
      E.athletes.push(a); n++;
    });
    var cm = r.commun || {};
    if (cm.legende && cm.legende.types && cm.legende.types.length && !(E.legende && E.legende.types && E.legende.types.length)) E.legende = cm.legende;
    if (cm.protos && cm.protos.length && !(E.protos && E.protos.length)) E.protos = cm.protos;
    if (cm.motGlobal && !E.motGlobal) E.motGlobal = cm.motGlobal;
    if (n) {
      if (!parId(E.courant)) E.courant = E.athletes[0].id;
      toast(n + ' athlète(s) récupéré(s) depuis ton tableur Google');
      rendre();
    }
    return n;
  }
  // Plan modifié sur un autre appareil de l'entraîneur : partie entraîneur et fiche du service, saisies de l'athlète gardées.
  // Si cet appareil a des changements pas encore envoyés, sa fiche et ses jours modifiés sont gardés, puis envoyés.
  function appliquerPlanDistant(x, majPlan) {
    var a = parId(x.id); if (!a) return;
    var mod = (E.joursModifies || {})[a.id] || {}, attente = !!E.aPublier[a.id];
    if (attente && mod['*']) { a.planVu = majPlan; return; }
    var jours = {};
    Object.keys(x.jours || {}).forEach(function (d) { var j = C.nettoyerJour(x.jours[d]); if (Object.keys(j).length) jours[d] = j; });
    var res = C.fusionner(a, Object.assign({}, x.fiche || {}, { id: x.id, prenom: x.prenom, nom: x.nom, code: x.code, motCoach: x.motCoach || '', jours: jours }), 'excel');
    if (attente) {
      Object.keys(a).forEach(function (k) { if (k !== 'jours') res[k] = a[k]; });
      Object.keys(mod).forEach(function (d) {
        var l = a.jours[d] || {}, r = res.jours[d] || {}, n = {};
        C.CHAMPS_ATHLETE.concat(['majA']).forEach(function (k) { if (r[k] !== undefined) n[k] = r[k]; });
        C.CHAMPS_COACH.concat([C.CHAMP_REACTION]).forEach(function (k) { if (l[k] !== undefined) n[k] = l[k]; });
        n = C.nettoyerJour(n);
        if (Object.keys(n).length) res.jours[d] = n; else delete res.jours[d];
      });
    }
    res.suivi = a.suivi; res.planVu = majPlan;
    E.athletes[E.athletes.indexOf(a)] = res;
    return true;
  }
  function synchroniser(manuel) {
    if (!syncConfiguree()) { if (manuel) toast('Synchronisation non configurée : Réglages → Synchronisation'); rendreStatut(); return Promise.resolve(); }
    if (enCours) return enCours;
    rendreStatut('en cours');
    enCours = Promise.resolve()
      .then(function () {
        return E.aSupprimer.reduce(function (p, id) {
          return p.then(function () { return appel({ action: 'coach.supprimer', id: id }); }).then(function () { E.aSupprimer = E.aSupprimer.filter(function (x) { return x !== id; }); });
        }, Promise.resolve());
      })
      .then(function () {
        if (!E.communAPublier) return;
        return appel({ action: 'coach.commun', legende: E.legende, protos: E.protos, motGlobal: E.motGlobal }).then(function () { E.communAPublier = false; });
      })
      .then(function () { return appel({ action: 'coach.lire', depuis: E.sync.depuis }); })
      .then(function (res) {
        // Mot du coach, légende et protocoles modifiés sur un autre appareil
        var cm = res.commun;
        if (cm && !E.communAPublier) {
          if (cm.legende && cm.legende.types && cm.legende.types.length) E.legende = cm.legende;
          if (cm.protos && cm.protos.length) E.protos = cm.protos;
          E.motGlobal = cm.motGlobal || '';
        }
        // Athlètes absents de cet appareil, et plans modifiés sur un autre appareil depuis la dernière synchronisation
        var manquants = Object.keys(res.athletes || {}).filter(function (id) { return !parId(id) && E.aSupprimer.indexOf(id) < 0; });
        var modifies = Object.keys(res.athletes || {}).filter(function (id) { var a = parId(id), m = res.athletes[id].majPlan; return a && m && String(m) > String(a.planVu || ''); });
        if (!manquants.length && !modifies.length) return res;
        return appel({ action: 'coach.recuperer', ids: manquants.concat(modifies) }).then(function (r) {
          E.sync.serviceAncien = false; E.sync.planAncien = 0;
          recupererAthletes(r);
          var maj = 0;
          (r.athletes || []).forEach(function (x) {
            if (modifies.indexOf(x.id) >= 0 && appliquerPlanDistant(x, res.athletes[x.id].majPlan)) maj++;
            else if (manquants.indexOf(x.id) >= 0) { var a = parId(x.id); if (a) a.planVu = res.athletes[x.id].majPlan; }
          });
          if (maj && (vue === 'plan' || vue === 'athletes') && !boite.open) rendre();
          return res;
        }, function (e) {
          if (/action inconnue/.test(e.message)) { E.sync.serviceAncien = manquants.length; E.sync.planAncien = modifies.length; return res; }
          throw e;
        });
      })
      .then(function (res) {
        // Envoi des changements de cet appareil, après avoir intégré ceux des autres appareils
        return Object.keys(E.aPublier).reduce(function (p, id) {
          return p.then(function () {
            var a = parId(id), marque = E.aPublier[id];
            if (!a) { delete E.aPublier[id]; return; }
            assurerCode(a);
            return appel({ action: 'coach.publier', athlete: ficheAEnvoyer(a), jours: a.jours }).then(function (r) {
              if (r && r.majPlan) a.planVu = r.majPlan;
              if (E.aPublier[id] === marque) { delete E.aPublier[id]; if (E.joursModifies) delete E.joursModifies[id]; } // modifié pendant l'envoi : sera renvoyé
            });
          });
        }, Promise.resolve()).then(function () { return res; });
      })
      .then(function (res) {
        var nouveaux = 0, nonFaites = [];
        Object.keys(res.athletes || {}).forEach(function (id) {
          var a = parId(id), info = res.athletes[id];
          if (!a) return;
          a.suivi = { lienOuvert: info.lienOuvert, derniereSync: info.derniereSync, majPlan: info.majPlan };
          Object.keys(info.jours || {}).forEach(function (d) {
            var nf = C.nonRealisee(info.jours[d]);
            if (nf && !C.nonRealisee((a.jours || {})[d])) nonFaites.push(UI.prenom(a) + ' : ' + UI.jourCourt(d) + (nf.raison ? ' (' + nf.raison + ')' : ''));
          });
          var n = Object.keys(info.jours || {}).length;
          if (n) { a.jours = C.fusionner(a, { jours: info.jours }, 'retours').jours; nouveaux += n; }
        });
        E.sync.depuis = res.heure; E.sync.derniere = UI.maintenant(); E.sync.erreur = '';
        if (nonFaites.length) toast('⚠ Séance pas réalisée — ' + nonFaites.join(' · '));
        else if (manuel) toast(nouveaux ? nouveaux + ' saisie(s) reçue(s)' : 'Tout est à jour');
        return nouveaux;
      })
      .catch(function (e) { E.sync.erreur = e.message; if (manuel) toast('Synchronisation impossible : ' + e.message); return 0; })
      .then(function (nouveaux) {
        enCours = null;
        return sauver().then(function () {
          rendreStatut();
          if (nouveaux && !boite.open && (vue === 'athletes' || vue === 'plan')) rendre();
        });
      });
    return enCours;
  }
  function rendreStatut(etat) {
    var el = $('#statutSync');
    if (!el) return;
    var attente = Object.keys(E.aPublier).length + (E.communAPublier ? 1 : 0);
    var t, cls = '';
    if (!syncConfiguree()) { t = 'Synchronisation non configurée'; cls = 'attention'; }
    else if (etat === 'en cours') t = 'Synchronisation…';
    else if (E.sync.erreur) { t = 'Hors ligne : ' + E.sync.erreur; cls = 'attention'; }
    else t = 'Synchronisé ' + UI.ilYa(E.sync.derniere) + (attente ? ' · ' + attente + ' envoi(s) en attente' : '');
    el.textContent = t; el.className = 'statut ' + cls;
  }

  /* ---------- Rendu général ---------- */
  function rendreEntete() {
    var s = $('#choixAthlete');
    s.innerHTML = E.athletes.length
      ? E.athletes.slice().sort(function (x, y) { return nomComplet(x).localeCompare(nomComplet(y)); }).map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === E.courant ? ' selected' : '') + '>' + esc(nomComplet(a)) + '</option>'; }).join('')
      : '<option value="">Aucun athlète</option>';
    rendreStatut();
  }
  function rendre() {
    rendreEntete();
    $$('nav.onglets a').forEach(function (a) { if (a.dataset.v === vue) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var a = athlete();
    ({
      athletes: vueAthletes, plan: vuePlan, legende: function () { UI.vueLegende(main); },
      allures: function () { if (!a) { main.innerHTML = vueVide(); return; } UI.vueAllures(main, a, true, function (x) { marquer(x); sauver().then(rendre); }); },
      protos: function () { UI.vueProtos(main, a, true); }, reglages: vueReglages, tests: vueTests
    }[vue] || vueAthletes)();
  }
  function route() { vue = (location.hash || '#/athletes').slice(2).split('/')[0] || 'athletes'; rendre(); }
  function vueVide() {
    return '<div class="carte vide"><img src="' + $('header.app img').src + '" alt=""><h2>Bienvenue</h2>' +
      '<p class="muet">Importe un classeur Excel (onglets PLAN, LEGENDE, ALLURES, PROTOS) ou crée un athlète.</p>' +
      '<div class="ligne" style="justify-content:center"><button data-act="importXlsx">Importer un classeur Excel</button>' +
      '<button class="sec" data-act="nouvelAthlete">Créer un athlète</button></div></div>';
  }

  /* ---------- ATHLÈTES (tableau de bord entraîneur) ---------- */
  function vueAthletes() {
    var aj = auj();
    var h = '<section class="carte"><div class="ligne"><h2 class="espace">Mes athlètes</h2>' +
      '<button class="sec" data-act="sync">Synchroniser</button><button class="sec" data-act="importXlsx">Importer un Excel</button><button data-act="nouvelAthlete">Nouvel athlète</button></div>' +
      (syncConfiguree() ? '' : '<p class="alerte">La synchronisation n\'est pas configurée : les athlètes ne reçoivent pas encore leur plan. <a href="#/reglages">Configurer</a></p>') +
      (E.sync.planAncien && !E.sync.serviceAncien ? '<p class="alerte">Des plans ont été modifiés sur un autre de tes appareils. Pour les voir ici, mets à jour le script Google (Extensions → Apps Script, nouveau Code.gs, puis Déployer → Gérer les déploiements → Nouvelle version), puis touche « Synchroniser ». En attendant, évite de modifier ces plans sur cet appareil.</p>' : '') +
      (E.sync.serviceAncien ? '<p class="alerte">' + E.sync.serviceAncien + ' athlète(s) de ton tableur Google ne sont pas encore sur cet appareil. Pour les récupérer, mets à jour le script Google (Extensions → Apps Script, nouveau Code.gs, puis Déployer → Gérer les déploiements → Nouvelle version), puis touche « Synchroniser ».</p>' : '') + '</section><!--alertes-->';
    h += '<section class="carte"><h3>Mot du coach à tous</h3><p class="muet petit">Affiché en haut de l\'application de chaque athlète.</p>' +
      '<form id="fMot"><label class="sr" for="motGlobal">Mot du coach</label><textarea id="motGlobal" maxlength="500" placeholder="ex. Semaine de récupération pour tout le monde : on lève le pied !">' + esc(E.motGlobal) + '</textarea>' +
      '<div class="ligne" style="justify-content:flex-end;margin-top:8px"><button>Publier le mot</button></div></form></section>';
    var compets = C.competitionsAVenir(E.athletes, aj, 7);
    h += '<section class="carte"><h3>Compétitions des 7 prochains jours</h3>' + (compets.length ? '<ul class="liste">' + compets.map(function (c) {
      return '<li><b>' + esc(UI.jourCourt(c.date)) + '</b> · ' + esc(nomComplet(c)) + ' · ' + esc(c.corps) + '</li>';
    }).join('') + '</ul>' : '<p class="muet">Aucune compétition prévue.</p>') + '</section>';
    if (!E.athletes.length) { main.innerHTML = h + vueVide(); brancherMot(); return; }
    var lignes = E.athletes.map(function (a) { return { a: a, r: C.resumeCoach(a, aj) }; });
    lignes.sort(function (x, y) { return (y.r.alerte - x.r.alerte) || nomComplet(x.a).localeCompare(nomComplet(y.a)); });
    var nbAlertes = lignes.filter(function (l) { return l.r.alerte; }).length;
    // Séances signalées « pas réalisées » par les athlètes (7 derniers jours)
    var nf = [];
    lignes.forEach(function (l) { l.r.nonRealisees.forEach(function (x) { nf.push(Object.assign({ a: l.a }, x)); }); });
    nf.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : 0; });
    if (nf.length) h = h.replace('<!--alertes-->', '<section class="carte alerte-nf"><h3>⚠ Séances pas réalisées (7 derniers jours)</h3><ul class="liste-nf">' + nf.map(function (x) {
      return '<li><div class="ligne"><b class="espace">' + esc(nomComplet(x.a)) + '</b><button class="discret" data-act="ouvrirAthlete" data-id="' + esc(x.a.id) + '">Voir le plan</button></div>' +
        '<div class="petit">' + esc(UI.jourCourt(x.date)) + (x.corps ? ' · ' + esc(x.corps) : '') + (x.raison ? ' · <b>' + esc(x.raison) + '</b>' : '') + '</div>' +
        (x.message ? '<div class="note">« ' + esc(x.message) + ' »</div>' : '') + '</li>';
    }).join('') + '</ul></section>');
    h += '<section class="carte"><h3>Semaine en cours</h3>' + (nbAlertes ? '<p class="alerte petit">⚠ ' + nbAlertes + ' athlète(s) sans retour sur au moins 2 séances prévues des 14 derniers jours.</p>' : '') +
      '<div class="tableau"><table><thead><tr><th>Athlète</th><th class="num">Séances</th><th class="num">KM</th><th class="num">RPE moy.</th><th>Dernière saisie</th><th>Lien</th></tr></thead><tbody>' +
      lignes.map(function (l) {
        var a = l.a, r = l.r, s = a.suivi || {};
        return '<tr class="cliquable" data-act="ouvrirAthlete" data-id="' + esc(a.id) + '"><td>' + (r.alerte ? '<span class="voyant" title="' + r.sansRetour.length + ' séance(s) prévue(s) sans retour">⚠</span> ' : '') + (r.nonRealisees.length ? '<span class="pas-faite" title="Séance(s) pas réalisée(s) cette semaine">' + r.nonRealisees.length + ' non faite' + (r.nonRealisees.length > 1 ? 's' : '') + '</span> ' : '') + '<b>' + esc(nomComplet(a)) + '</b></td>' +
          '<td class="num">' + r.semaine.prevuesFaites + ' / ' + r.semaine.prevuesADate + '</td>' +
          '<td class="num">' + (r.semaine.km ? C.nombreFR(r.semaine.km, 1) : '') + '</td>' +
          '<td class="num">' + (r.rpeMoy !== null ? C.nombreFR(r.rpeMoy, 1) : '') + '</td>' +
          '<td>' + (r.derniere ? esc(UI.jourCourt(r.derniere)) : '<span class="muet">aucune</span>') + '</td>' +
          '<td>' + (s.lienOuvert ? 'ouvert ' + esc(UI.ilYa(s.lienOuvert)) : (E.aPublier[a.id] ? '<span class="muet">à publier</span>' : '<span class="muet">pas encore ouvert</span>')) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="muet petit">Séances : prévues réalisées / prévues jusqu\'à aujourd\'hui. Touchez une ligne pour ouvrir le plan.</p></section>';
    main.innerHTML = h;
    brancherMot();
  }
  function brancherMot() {
    var f = $('#fMot');
    if (f) f.onsubmit = function (ev) { ev.preventDefault(); E.motGlobal = C.texte($('#motGlobal').value); marquerCommun(); sauver().then(function () { toast('Mot du coach enregistré'); }); };
  }

  /* ---------- PLAN d'un athlète ---------- */
  function vuePlan() {
    var a = athlete();
    if (!a) { main.innerHTML = vueVide(); return; }
    var aj = auj();
    if (!a.debut) a.debut = C.weekStart(aj);
    if (semaineAffichee === null) semaineAffichee = Math.max(1, UI.semaineDe(a, aj));
    var s = a.suivi || {};
    var h = UI.htmlFiche(a, aj, '<div class="ligne noprint"><button class="sec" data-act="ficheAthlete">Modifier la fiche</button><button data-act="envoyerLien">Envoyer le lien</button></div>');
    h += '<section class="carte petit"><div class="ligne"><span>Lien : ' + (s.lienOuvert ? 'ouvert ' + esc(UI.ilYa(s.lienOuvert)) + (s.derniereSync ? ' · dernière visite ' + esc(UI.ilYa(s.derniereSync)) : '') : 'pas encore ouvert') + '</span>' +
      '<span class="espace"></span><span class="muet">' + (E.aPublier[a.id] ? 'Modifications en attente d\'envoi' : (s.majPlan ? 'Plan publié ' + esc(UI.ilYa(s.majPlan)) : '')) + '</span></div>' +
      (a.motCoach ? '<p style="margin:8px 0 0"><b>Mot du coach :</b> ' + esc(a.motCoach) + '</p>' : '') + '</section>';
    h += UI.htmlSemaine(a, semaineAffichee, aj, { role: 'coach', boutonsSemaine: '<button class="discret" data-act="semInfo">Cycle / phase</button><button class="discret" data-act="semCopier">Copier vers…</button>' });
    h += UI.htmlEnsemble(a, semaineAffichee);
    main.innerHTML = h;
    UI.brancherGraph(a, semaineAffichee, function (n) { semaineAffichee = n; vuePlan(); window.scrollTo(0, 0); });
  }

  function datalist(id, liste) { return '<datalist id="' + id + '">' + (liste || []).map(function (x) { return '<option value="' + esc(x.code) + '">' + esc(x.desc) + '</option>'; }).join('') + '</datalist>'; }
  function editJour(date) {
    var a = athlete(), j = a.jours[date] || {};
    var h = '<form class="boite" method="dialog"><h2>' + C.JOURS_LONGS[C.dayOfWeek(date)] + ' ' + C.formatDateFR(date) + ' · S' + UI.semaineDe(a, date) + '</h2>' +
      '<label>Corps de séance<input name="corps" value="' + esc(j.corps) + '" placeholder="ex. 5x800M 95% VMA RMT2-3\' ou REPOS"></label>' +
      '<div class="champs"><label>Éveil (min.)<input name="eveil" value="' + esc(j.eveil) + '"></label><label>Éduc (min.)<input name="educ" value="' + esc(j.educ) + '"></label><label>RAC (min.)<input name="rac" value="' + esc(j.rac) + '"></label>' +
      '<label>Profil<input name="profil" list="dlProfils" value="' + esc(j.profil) + '"></label><label>Type<input name="type" list="dlTypes" value="' + esc(j.type) + '"></label></div>' +
      '<label>Consignes<input name="consignes" value="' + esc(j.consignes) + '"></label>' +
      (C.aRetour(j) ? '<p class="muet petit">Saisie de l\'athlète (non modifiable ici) : ' + [C.isNum(j.km) ? C.nombreFR(j.km, 2) + ' km' : '', C.isNum(j.dureeSec) ? C.formatDuree(j.dureeSec) : '', C.isNum(j.rpe) ? 'RPE ' + j.rpe : '', C.isNum(j.fc) ? 'FC moy. ' + Math.round(j.fc) + ' bpm' : ''].filter(Boolean).join(' · ') + '</p>' : '') +
      datalist('dlProfils', (E.legende || {}).profils) + datalist('dlTypes', (E.legende || {}).types) +
      '<div class="pied">' + (C.aContenuCoach(j) ? '<button type="button" class="danger" data-x="vider">Vider la séance</button>' : '') +
      '<button type="button" class="sec" data-x="annuler">Annuler</button><button value="ok">Enregistrer</button></div></form>';
    boite.innerHTML = h; boite.showModal();
    var f = $('form', boite);
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    var vid = $('[data-x="vider"]', f);
    if (vid) vid.onclick = function () { var n = Object.assign({}, j); C.CHAMPS_COACH.forEach(function (k) { delete n[k]; }); majJour(a, date, n); boite.close(); };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), n = Object.assign({}, j);
      C.CHAMPS_COACH.forEach(function (k) { n[k] = d.get(k); });
      majJour(a, date, n); boite.close();
    };
  }
  function majJour(a, date, j) {
    marquerJour(a, date);
    var n = C.nettoyerJour(j);
    if (Object.keys(n).length) a.jours[date] = n; else delete a.jours[date];
    marquer(a);
    sauver().then(function () { toast('Enregistré'); rendre(); });
  }
  function reagir(date) {
    var a = athlete(), j = a.jours[date] || {};
    var actuel = C.texte(j.reaction), emo = UI.REACTIONS.filter(function (e) { return actuel.indexOf(e) === 0; })[0] || '';
    boite.innerHTML = '<form class="boite"><h2>Réagir à la séance du ' + C.formatDateFR(date) + '</h2>' +
      '<p class="muet petit">' + esc(nomComplet(a)) + ' verra ta réaction à sa prochaine ouverture de l\'application.</p>' +
      '<div class="emojis" role="radiogroup" aria-label="Réaction">' + UI.REACTIONS.map(function (e) { return '<label><input type="radio" name="emo" value="' + e + '"' + (e === emo ? ' checked' : '') + '><span>' + e + '</span></label>'; }).join('') + '</div>' +
      '<label>Un mot (facultatif)<input name="mot" maxlength="140" value="' + esc(actuel.replace(emo, '').trim()) + '" placeholder="ex. Bien géré !"></label>' +
      '<div class="pied">' + (actuel ? '<button type="button" class="danger" data-x="effacer">Retirer</button>' : '') + '<button type="button" class="sec" data-x="annuler">Annuler</button><button>Envoyer</button></div></form>';
    boite.showModal();
    var f = $('form', boite);
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    var ef = $('[data-x="effacer"]', f);
    if (ef) ef.onclick = function () { var n = Object.assign({}, j); delete n.reaction; majJour(a, date, n); boite.close(); };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), r = [d.get('emo') || '', C.texte(d.get('mot'))].filter(Boolean).join(' ');
      var n = Object.assign({}, j); if (r) n.reaction = r; else delete n.reaction;
      majJour(a, date, n); boite.close();
    };
  }

  /* ---------- Lien de l'athlète ---------- */
  function envoyerLien() {
    var a = athlete();
    assurerCode(a);
    var lien = C.lienAthlete(baseUrl(), a), p = UI.prenom(a) || nomComplet(a);
    var message = 'Bonjour ' + p + ', voici ton application My RespirOutdoor avec ton plan d\'entraînement : ' + lien +
      '\nTouche le lien, puis ajoute l\'application à ton écran d\'accueil (iPhone : Partager → « Sur l\'écran d\'accueil » ; Android : menu ⋮ → « Installer l\'application »).';
    var enc = encodeURIComponent(message);
    boite.innerHTML = '<form class="boite"><h2>Envoyer le lien à ' + esc(nomComplet(a)) + '</h2>' +
      (syncConfiguree() ? '' : '<p class="alerte">La synchronisation n\'est pas configurée : le lien ne fonctionnera qu\'une fois le service Google installé (Réglages → Synchronisation).</p>') +
      '<p class="lien-athlete">' + esc(lien) + '</p>' +
      '<p class="petit" id="etatLien">' + (syncConfiguree() ? 'Activation du lien…' : '') + '</p>' +
      '<div class="ligne">' + (navigator.share ? '<button type="button" data-x="partager">Partager…</button>' : '') +
      '<a class="bouton sec" href="https://wa.me/?text=' + enc + '" target="_blank" rel="noopener">WhatsApp</a>' +
      '<a class="bouton sec" href="sms:?&body=' + enc + '">SMS</a>' +
      '<a class="bouton sec" href="mailto:?subject=' + encodeURIComponent('Ton plan Respir Outdoor') + '&body=' + enc + '">E-mail</a>' +
      '<button type="button" class="sec" data-x="copier">Copier</button></div>' +
      '<p class="muet petit">Le lien est personnel : il ne donne accès qu\'au plan de ' + esc(p) + '. En cas de besoin, « Nouveau lien » désactive l\'ancien.</p>' +
      '<div class="pied"><button type="button" class="danger" data-x="nouveau">Nouveau lien</button><button type="button" class="sec" data-x="fermer">Fermer</button></div></form>';
    boite.showModal();
    marquer(a); sauver();
    var f = $('form', boite);
    // Le lien ne fonctionne qu'une fois l'athlète publié sur le service : on l'indique à l'entraîneur
    if (syncConfiguree()) synchroniser(false).then(function () { return E.aPublier[a.id] ? synchroniser(false) : null; }).then(function () {
      var el = $('#etatLien', f);
      if (!el || !boite.open) return;
      if (!E.aPublier[a.id]) el.innerHTML = '<strong>✓ Lien actif :</strong> ' + esc(p) + ' peut l\'ouvrir dès maintenant.';
      else { el.className = 'alerte'; el.textContent = 'Lien pas encore actif : l\'envoi au service a échoué' + (E.sync.erreur ? ' (' + E.sync.erreur + ')' : '') + '. Vérifie la connexion puis touche « Synchroniser » avant d\'envoyer le lien.'; }
    });
    $('[data-x="fermer"]', f).onclick = function () { boite.close(); };
    var sh = $('[data-x="partager"]', f);
    if (sh) sh.onclick = function () { navigator.share({ title: 'My RespirOutdoor', text: message }).catch(function () {}); };
    $('[data-x="copier"]', f).onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(message) : Promise.reject()).then(function () { toast('Message copié'); }, function () { toast('Copie impossible : sélectionne le lien à la main'); });
    };
    $('[data-x="nouveau"]', f).onclick = function () {
      if (!confirm('Créer un nouveau lien pour ' + nomComplet(a) + ' ? L\'ancien ne fonctionnera plus.')) return;
      a.code = C.genererCode(); a.suivi = {}; boite.close(); marquer(a); sauver().then(envoyerLien);
    };
  }

  /* ---------- Fiche athlète ---------- */
  function ficheAthlete(nouveau) {
    var a = nouveau ? C.nouvelAthlete({ debut: C.weekStart(auj()) }) : athlete();
    var dispo = [['L', 'Lun.'], ['M1', 'Mar.'], ['M2', 'Mer.'], ['J', 'Jeu.'], ['V', 'Ven.'], ['S', 'Sam.'], ['D', 'Dim.']];
    var h = '<form class="boite" method="dialog"><h2>' + (nouveau ? 'Nouvel athlète' : 'Fiche athlète') + '</h2><div class="champs">' +
      '<label>Prénom<input name="prenom" required value="' + esc(a.prenom) + '"></label><label>Nom<input name="nom" required value="' + esc(a.nom) + '"></label>' +
      '<label>E-mail<input name="email" type="email" value="' + esc(a.email) + '"></label>' +
      '<label>Début du contrat (lundi)<input name="debut" type="date" required value="' + esc(a.debut || '') + '"></label>' +
      '<label>Nombre de semaines<input name="contratSemaines" inputmode="numeric" value="' + esc(a.contratSemaines || '') + '"></label>' +
      '<label>Fin du contrat<input name="fin" type="date" value="' + esc(a.fin || '') + '"></label>' +
      '<label>VMA (km/h)<input name="vma" inputmode="decimal" value="' + (C.isNum(a.vma) ? C.nombreFR(a.vma) : '') + '"></label>' +
      '<label>Hebdo (séances)<input name="hebdo" value="' + esc(a.hebdo) + '"></label></div>' +
      '<label>Objectif<input name="objectif" value="' + esc(a.objectif) + '"></label>' +
      '<label>Objectif (accroche)<input name="objectif2" value="' + esc(a.objectif2) + '"></label>' +
      '<label>Mot du coach pour cet athlète<textarea name="motCoach" maxlength="500" placeholder="Affiché en haut de son application">' + esc(a.motCoach) + '</textarea></label>' +
      '<div class="champs"><label>Contraintes<input name="contraintes" value="' + esc(a.contraintes) + '"></label><label>Terrains<input name="terrains" value="' + esc(a.terrains) + '"></label></div>' +
      '<fieldset><legend>Disponibilités</legend><div class="ligne">' + dispo.map(function (d) { return '<label class="ligne" style="margin:0 8px 10px 0"><input type="checkbox" name="d_' + d[0] + '"' + (a.dispos[d[0]] ? ' checked' : '') + '> ' + d[1] + '</label>'; }).join('') + '</div></fieldset>' +
      '<fieldset><legend>Zones d\'allures (% de VMA)</legend><div class="tableau"><table><thead><tr><th>Zone</th><th>Basse %</th><th>Haute %</th><th>Usage</th></tr></thead><tbody>' +
      a.zones.map(function (z, i) { return '<tr><td><input name="zn' + i + '" value="' + esc(z.nom) + '"></td><td><input name="zb' + i + '" inputmode="decimal" value="' + C.nombreFR(z.bas, 1) + '"></td><td><input name="zh' + i + '" inputmode="decimal" value="' + C.nombreFR(z.haut, 1) + '"></td><td><input name="zu' + i + '" value="' + esc(z.usage) + '"></td></tr>'; }).join('') +
      '</tbody></table></div></fieldset>' +
      '<p class="alerte" id="erreurFiche" hidden></p><div class="pied"><button type="button" class="sec" data-x="annuler">Annuler</button><button value="ok">Enregistrer</button></div></form>';
    boite.innerHTML = h; boite.showModal();
    var f = $('form', boite);
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), err = [];
      ['prenom', 'nom', 'email', 'hebdo', 'objectif', 'objectif2', 'contraintes', 'terrains', 'motCoach'].forEach(function (k) { a[k] = C.texte(d.get(k)); });
      var deb = d.get('debut');
      if (!C.isValidISODate(deb)) err.push('Début du contrat invalide');
      else if (C.dayOfWeek(deb) !== 0) err.push('Le début du contrat doit être un lundi (les semaines S1, S2… partent de ce lundi)');
      a.fin = C.isValidISODate(d.get('fin')) ? d.get('fin') : null;
      var ns = parseInt(d.get('contratSemaines'), 10); a.contratSemaines = ns > 0 ? ns : null;
      var vma = C.parseNumberFR(d.get('vma'));
      if (vma !== null && !(vma > 5 && vma < 30)) err.push('VMA : entre 5 et 30 km/h');
      var zones = a.zones.map(function (z, i) {
        var b = C.parseNumberFR(d.get('zb' + i)), hh = C.parseNumberFR(d.get('zh' + i));
        if (!C.isNum(b) || !C.isNum(hh) || b > hh) err.push('Zone ' + (i + 1) + ' : bornes invalides');
        return { nom: C.texte(d.get('zn' + i)), bas: b, haut: hh, usage: C.texte(d.get('zu' + i)) };
      });
      if (err.length) { var e = $('#erreurFiche'); e.hidden = false; e.textContent = err.join(' · '); return; }
      a.debut = deb; a.vma = vma; a.zones = zones;
      Object.keys(a.dispos).forEach(function (k) { a.dispos[k] = d.get('d_' + k) === 'on'; });
      if (nouveau) {
        a.id = C.idAthlete(a);
        if (E.athletes.some(function (x) { return x.id === a.id; })) a.id += '_' + Date.now().toString(36).toUpperCase();
        assurerCode(a);
        E.athletes.push(a); E.courant = a.id; semaineAffichee = null;
      }
      marquer(a);
      boite.close(); sauver().then(function () { location.hash = '#/plan'; rendre(); });
    };
  }

  function semInfo() {
    var a = athlete(), n = semaineAffichee, w = (a.semaines || {})[n] || {};
    boite.innerHTML = '<form class="boite"><h2>S' + n + ' : situation planif et cycle</h2>' +
      '<label>Situation planif (phase)<input name="phase" value="' + esc(w.phase) + '" placeholder="ex. CYCLE DEVELOPPEMENT VMAC"></label>' +
      '<label>Type de cycle<input name="cycle" value="' + esc(w.cycle) + '" placeholder="ex. ASSIMIL, RELACH."></label>' +
      '<div class="pied"><button type="button" class="sec" data-x="annuler">Annuler</button><button>Enregistrer</button></div></form>';
    boite.showModal();
    var f = $('form', boite);
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), p = C.texte(d.get('phase')), c = C.texte(d.get('cycle'));
      a.semaines = a.semaines || {};
      if (p || c) a.semaines[n] = { phase: p || undefined, cycle: c || undefined }; else delete a.semaines[n];
      marquer(a); boite.close(); sauver().then(rendre);
    };
  }
  function semCopier() {
    var a = athlete(), n = semaineAffichee;
    boite.innerHTML = '<form class="boite"><h2>Copier la partie entraîneur de S' + n + '</h2>' +
      '<p class="muet petit">Les séances de la semaine cible sont remplacées ; les saisies de l\'athlète sont conservées.</p>' +
      '<label>Vers la semaine n°<input name="cible" type="number" min="1" value="' + (n + 1) + '"></label>' +
      '<div class="pied"><button type="button" class="sec" data-x="annuler">Annuler</button><button>Copier</button></div></form>';
    boite.showModal();
    var f = $('form', boite);
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var c = parseInt(new FormData(f).get('cible'), 10);
      if (!(c >= 1) || c === n) return;
      var l1 = UI.lundiDe(a, n), l2 = UI.lundiDe(a, c);
      for (var i = 0; i < 7; i++) {
        var src = a.jours[C.addDays(l1, i)] || {}, d2 = C.addDays(l2, i), dst = Object.assign({}, a.jours[d2] || {});
        C.CHAMPS_COACH.forEach(function (k) { if (src[k] !== undefined) dst[k] = src[k]; else delete dst[k]; });
        marquerJour(a, d2);
        var nn = C.nettoyerJour(dst);
        if (Object.keys(nn).length) a.jours[d2] = nn; else delete a.jours[d2];
      }
      marquer(a); boite.close(); semaineAffichee = c; sauver().then(function () { toast('S' + n + ' copiée vers S' + c); rendre(); });
    };
  }

  function editProto(i) {
    var p = i >= 0 ? E.protos[i] : { code: '', titre: '', grille: [], notes: '' };
    var txt = (p.grille || []).map(function (l) { return l.join(' | '); }).join('\n');
    boite.innerHTML = '<form class="boite"><h2>' + (i >= 0 ? 'Modifier ' + esc(p.code) : 'Nouveau protocole') + '</h2><div class="champs"><label>Code<input name="code" required value="' + esc(p.code) + '" placeholder="PC17"></label></div>' +
      '<label>Titre<input name="titre" value="' + esc(p.titre) + '"></label>' +
      '<label>Grille (une ligne par rangée, colonnes séparées par « | »)<textarea name="grille" rows="6">' + esc(txt) + '</textarea></label>' +
      '<label>Notes<textarea name="notes">' + esc(p.notes) + '</textarea></label>' +
      '<div class="pied">' + (i >= 0 ? '<button type="button" class="danger" data-x="suppr">Supprimer</button>' : '') + '<button type="button" class="sec" data-x="annuler">Annuler</button><button>Enregistrer</button></div></form>';
    boite.showModal();
    var f = $('form', boite);
    $('[data-x="annuler"]', f).onclick = function () { boite.close(); };
    var s = $('[data-x="suppr"]', f);
    if (s) s.onclick = function () { if (confirm('Supprimer ' + p.code + ' ?')) { E.protos.splice(i, 1); marquerCommun(); boite.close(); sauver().then(rendre); } };
    f.onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(f), code = C.texte(d.get('code')).toUpperCase(), n = {
        id: code, code: code, titre: C.texte(d.get('titre')), notes: C.texte(d.get('notes')),
        grille: C.texte(d.get('grille')).split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return l.split('|').map(function (c) { return c.trim(); }); })
      };
      if (i >= 0) E.protos[i] = n; else E.protos.push(n);
      marquerCommun(); boite.close(); sauver().then(rendre);
    };
  }

  /* ---------- RÉGLAGES ---------- */
  function vueReglages() {
    var a = athlete();
    var h = '<section class="carte"><h2>Synchronisation</h2>' +
      '<p class="muet petit">Le service Google de Respir Outdoor relie cette application aux applications « My RespirOutdoor » des athlètes. Installation : voir le guide google/GUIDE-INSTALLATION.md.</p>' +
      '<form id="fSync"><label>Adresse du service' + (config.service ? ' (fournie par la publication de l\'application)' : '') + '<input name="service" type="url" value="' + esc(urlService()) + '" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
      '<label>Clé entraîneur (onglet « Réglages » du tableur Google)<input name="cle" type="password" autocomplete="off" value="' + esc(E.reglages.cle) + '"></label>' +
      '<div class="ligne"><button>Enregistrer et tester</button><button type="button" class="sec" data-act="sync">Synchroniser maintenant</button></div></form>' +
      '<p class="petit" id="statutSync2" style="margin-top:10px"></p></section>';
    h += '<section class="carte"><h2>Classeur Excel</h2>' +
      '<p class="muet petit">Lit un classeur .xlsx au format du tableau (onglets PLAN, LEGENDE, ALLURES, PROTOS). Pour un athlète existant, seule la partie entraîneur est mise à jour : ses séances déjà saisies sont conservées.</p>' +
      '<button data-act="importXlsx">Importer un classeur Excel</button></section>';
    h += '<section class="carte"><h2>Exports et sauvegarde</h2><div class="ligne">' +
      '<button class="sec" data-act="exportCsv"' + (a ? '' : ' disabled') + '>Plan en CSV (Excel)</button>' +
      '<button class="sec" data-act="sauvegarde">Sauvegarde complète (.json)</button><button class="sec" data-act="restaurer">Restaurer une sauvegarde</button></div>' +
      '<p class="muet petit">La sauvegarde contient tous les athlètes, la légende, les protos et les réglages (sauf la clé entraîneur).</p></section>';
    h += '<section class="carte"><h2>Athlètes</h2><div class="ligne"><button class="sec" data-act="nouvelAthlete">Créer un athlète</button>' +
      (a ? '<button class="danger" data-act="supprAthlete">Supprimer ' + esc(nomComplet(a)) + '</button>' : '') + '</div></section>';
    h += '<section class="carte"><h2>Affichage</h2><label>Thème<select id="theme"><option value="">Selon l\'appareil</option><option value="light">Clair</option><option value="dark">Sombre</option></select></label></section>';
    h += '<section class="carte"><h2>À propos</h2><p class="petit muet">Stockage : ' + esc(Store.mode) + ' sur cet appareil, et copie dans le tableur Google de l\'entraîneur si la synchronisation est configurée.</p>' +
      '<div class="ligne"><a class="bouton sec" href="#/tests">Lancer les autotests</a><button class="danger" data-act="toutEffacer">Tout effacer sur cet appareil</button></div></section>';
    main.innerHTML = h;
    var t = $('#theme'); t.value = E.reglages.theme || '';
    t.onchange = function () { E.reglages.theme = t.value; UI.appliquerTheme(t.value); sauver(); };
    var st = $('#statutSync2'), rs = $('#statutSync'); if (rs) st.textContent = rs.textContent;
    $('#fSync').onsubmit = function (ev) {
      ev.preventDefault();
      var d = new FormData(ev.target), avant = syncConfiguree();
      E.reglages.service = C.texte(d.get('service')) === (config.service || '') ? '' : C.texte(d.get('service'));
      E.reglages.cle = C.texte(d.get('cle'));
      st.textContent = 'Test en cours…';
      appel({ action: 'coach.verifier' }).then(function () {
        st.textContent = '✓ Service joignable et clé acceptée.';
        if (!avant) { E.athletes.forEach(function (x) { assurerCode(x); E.aPublier[x.id] = UI.maintenant(); }); E.communAPublier = true; E.sync.depuis = ''; }
        return sauver().then(function () { return synchroniser(true); });
      }, function (e) { st.textContent = '✗ ' + e.message; return sauver(); });
    };
  }

  function choisirFichier(accept, cb) {
    var i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = function () { if (i.files[0]) cb(i.files[0]); };
    i.click();
  }
  function enrichirFamilles(lg) {
    lg.types.forEach(function (t) { var r = C.chercherCode(DEFAUTS.legende.types, t.code); if (r && !r.variante) t.famille = r.entree.famille; });
    return lg;
  }
  function importXlsx() {
    choisirFichier('.xlsx', function (f) {
      f.arrayBuffer().then(function (buf) { return C.lireXLSX(new Uint8Array(buf)); }).then(function (cl) {
        var r = C.importerClasseur(cl), recu = r.athlete, local = parId(recu.id);
        var res = local ? C.fusionner(local, recu, 'excel') : recu;
        res.id = recu.id; assurerCode(res);
        if (local) E.athletes[E.athletes.indexOf(local)] = res; else E.athletes.push(res);
        if (r.legende && r.legende.types.length) E.legende = enrichirFamilles(r.legende);
        if (r.protos && r.protos.length) E.protos = r.protos;
        E.courant = res.id; semaineAffichee = null;
        marquerJour(res, '*'); marquer(res); marquerCommun();
        return sauver().then(function () {
          boite.innerHTML = '<form class="boite"><h2>' + (local ? 'Plan mis à jour' : 'Athlète ajouté') + ' : ' + esc(nomComplet(res)) + '</h2>' +
            '<ul class="petit">' + r.rapport.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
            (local ? '<p>Seule la partie entraîneur a été remplacée. Les séances déjà saisies par l\'athlète, tes réactions et son lien sont conservés.</p>' : '<p>Envoie-lui son lien pour qu\'il reçoive son plan.</p>') +
            '<div class="pied">' + (local ? '' : '<button type="button" class="sec" data-x="lien">Envoyer le lien</button>') + '<button type="button" data-x="ok">Voir le plan</button></div></form>';
          boite.showModal();
          $('[data-x="ok"]', boite).onclick = function () { boite.close(); location.hash = '#/plan'; rendre(); };
          var l = $('[data-x="lien"]', boite);
          if (l) l.onclick = function () { boite.close(); location.hash = '#/plan'; rendre(); envoyerLien(); };
        });
      }).catch(function (e) { toast('Import impossible : ' + e.message); });
    });
  }
  function restaurer() {
    choisirFichier('.json,application/json', function (f) {
      f.text().then(function (t) {
        var d = JSON.parse(t);
        if (d.format !== 'respir-sauvegarde' || !d.etat) throw new Error('fichier non reconnu');
        if (!confirm('Restaurer la sauvegarde du ' + C.formatDateFR(String(d.date).slice(0, 10)) + ' ? Les données de cet appareil seront remplacées.')) return;
        var cle = E.reglages.cle;
        E = Object.assign(E, d.etat); E.reglages.cle = cle;
        E.athletes.forEach(function (a) { assurerCode(a); E.aPublier[a.id] = UI.maintenant(); });
        E.communAPublier = true; E.courant = E.athletes[0] ? E.athletes[0].id : null; semaineAffichee = null;
        return sauver().then(function () { toast('Sauvegarde restaurée'); rendre(); planifierSync(); });
      }).catch(function (e) { toast('Restauration impossible : ' + e.message); });
    });
  }
  function exportCsv() {
    var a = athlete(), dates = Object.keys(a.jours).sort();
    var l = [['Semaine', 'Jour', 'Date', 'Éveil (min.)', 'Éduc (min.)', 'Corps de séance', 'RAC (min.)', 'Profil', 'Type', 'Phase', 'Cycle', 'Consignes', 'KM', 'Durée', 'D+ (m)', 'RPE', 'FC moy. (bpm)', 'Notes perso', 'Réaction du coach']];
    dates.forEach(function (d) {
      var j = a.jours[d], s = UI.semaineDe(a, d), w = (a.semaines || {})[s] || {};
      l.push(['S' + s, C.JOURS[C.dayOfWeek(d)], C.formatDateFR(d), j.eveil || '', j.educ || '', j.corps || '', j.rac || '', j.profil || '', j.type || '', w.phase || '', w.cycle || '', j.consignes || '',
        C.isNum(j.km) ? C.nombreFR(j.km, 3) : '', C.isNum(j.dureeSec) ? C.formatDuree(j.dureeSec) : '', C.isNum(j.dplus) ? Math.round(j.dplus) : '', C.isNum(j.rpe) ? C.nombreFR(j.rpe, 1) : '', C.isNum(j.fc) ? Math.round(j.fc) : '', j.notes || '', j.reaction || '']);
    });
    telecharger(horodatage() + '_PLAN_' + (a.nom || '').toUpperCase() + '.csv', '﻿' + C.versCSV(l), 'text/csv;charset=utf-8');
  }

  /* ---------- Autotests ---------- */
  function vueTests() {
    var r = C.runTests(), ko = r.filter(function (x) { return !x.ok; }).length;
    var h = '<section class="carte"><h2>Autotests : ' + (r.length - ko) + ' / ' + r.length + ' réussis</h2><p class="muet petit">Valeurs de référence calculées à la main (voir FORMULES.md).</p><ul>' +
      r.map(function (x) { return '<li>' + (x.ok ? '✓' : '<b style="color:var(--alerte)">✗ ÉCHEC</b>') + ' ' + esc(x.nom) + (x.err ? ' — ' + esc(x.err) : '') + '</li>'; }).join('') + '</ul></section>';
    main.innerHTML = h;
  }

  /* ---------- Actions ---------- */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act, a = athlete();
    if (act === 'semPrec') { semaineAffichee = Math.max(1, semaineAffichee - 1); vuePlan(); }
    else if (act === 'semSuiv') { semaineAffichee++; vuePlan(); }
    else if (act === 'semAuj') { semaineAffichee = Math.max(1, UI.semaineDe(a, auj())); vuePlan(); }
    else if (act === 'allerSem') { semaineAffichee = +b.dataset.n; vuePlan(); window.scrollTo(0, 0); }
    else if (act === 'imprimer') window.print();
    else if (act === 'semInfo') semInfo();
    else if (act === 'semCopier') semCopier();
    else if (act === 'editJour') editJour(b.dataset.date);
    else if (act === 'reagir') reagir(b.dataset.date);
    else if (act === 'ficheAthlete') ficheAthlete(false);
    else if (act === 'nouvelAthlete') ficheAthlete(true);
    else if (act === 'envoyerLien') envoyerLien();
    else if (act === 'ouvrirAthlete') { E.courant = b.dataset.id; semaineAffichee = null; sauver(); location.hash = '#/plan'; }
    else if (act === 'editProto') editProto(+b.dataset.i);
    else if (act === 'importXlsx') importXlsx();
    else if (act === 'restaurer') restaurer();
    else if (act === 'exportCsv') exportCsv();
    else if (act === 'sync') synchroniser(true);
    else if (act === 'sauvegarde') {
      var copie = JSON.parse(JSON.stringify(E)); copie.reglages.cle = '';
      telecharger(horodatage() + '_RESPIR_SAUVEGARDE.json', JSON.stringify({ format: 'respir-sauvegarde', version: E.version, date: UI.maintenant(), etat: copie }), 'application/json');
    }
    else if (act === 'supprVma') { if (confirm('Supprimer ce test ?')) { a.historiqueVMA.splice(+b.dataset.i, 1); marquer(a); sauver().then(rendre); } }
    else if (act === 'supprAthlete') {
      if (confirm('Supprimer ' + nomComplet(a) + ', son plan et ses saisies (sur cet appareil et dans le tableur Google) ? Son lien ne fonctionnera plus.')) {
        E.athletes = E.athletes.filter(function (x) { return x !== a; }); delete E.aPublier[a.id]; E.aSupprimer.push(a.id);
        E.courant = E.athletes[0] ? E.athletes[0].id : null; semaineAffichee = null; sauver().then(function () { rendre(); planifierSync(); });
      }
    }
    else if (act === 'toutEffacer') {
      if (confirm('Effacer toutes les données de cet appareil ? Le tableur Google n\'est pas touché. Pense à faire une sauvegarde avant.')) {
        E.athletes = []; E.courant = null; E.legende = DEFAUTS.legende; E.protos = []; E.aPublier = {}; E.sync.depuis = ''; semaineAffichee = null; sauver().then(rendre);
      }
    }
  });
  $('#choixAthlete').onchange = function (e) { E.courant = e.target.value; semaineAffichee = null; sauver(); if (vue === 'athletes') location.hash = '#/plan'; else rendre(); };
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') synchroniser(false); });
  window.addEventListener('online', function () { synchroniser(false); });
  setInterval(function () { if (document.visibilityState === 'visible') synchroniser(false); }, 120000);
  setInterval(rendreStatut, 30000);

  Promise.all([Store.charger(), UI.chargerConfig('config.json')]).then(function (r) {
    var d = r[0]; config = r[1] || {};
    if (d && d.athletes) {
      var reglages = Object.assign({}, E.reglages, d.reglages);
      E = Object.assign(E, d);
      E.reglages = reglages; delete E.reglages.role;
      E.aPublier = E.aPublier || {}; E.aSupprimer = E.aSupprimer || []; E.sync = E.sync || { depuis: '', derniere: '', erreur: '' };
      E.athletes.forEach(assurerCode);
    }
    UI.appliquerTheme(E.reglages.theme);
    route();
    synchroniser(false);
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
