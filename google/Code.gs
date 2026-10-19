/**
 * Respir Outdoor : service de synchronisation entre l'application de l'entraîneur
 * et les applications « My RespirOutdoor » des athlètes.
 *
 * Il s'installe dans un tableur Google de l'entraîneur (Extensions → Apps Script) :
 * voir google/GUIDE-INSTALLATION.md.
 *
 * Données (dans le tableur) :
 *  - onglet « Athletes » : un athlète par ligne (identifiant, nom, code du lien, fiche, mot du coach, dates) ;
 *  - un onglet par athlète « J_<identifiant> » : un jour par ligne (partie entraîneur, partie athlète) ;
 *  - onglet « Commun » : légende, protocoles, mot du coach à tous ;
 *  - onglet « Réglages » : la clé entraîneur à copier dans l'application.
 *
 * Règle de fusion : chaque information a un seul propriétaire.
 *  - L'entraîneur écrit la partie entraîneur (séance, éveil, éduc, RAC, profil, type, consignes, réaction).
 *  - L'athlète écrit la partie athlète (km, durée, D+, RPE, FC moyenne, notes). Une publication de l'entraîneur
 *    ne l'écrase jamais : elle ne peut que remplir un jour encore vide.
 */

var VERSION_SERVICE = 5; // 2 : FC moyenne ; 3 : récupération des athlètes sur un nouvel appareil ; 4 : plan et mot du coach partagés entre les appareils de l'entraîneur ; 5 : messagerie
var COL_MESSAGES = ['id', 'athlete', 'de', 'texte', 'envoye', 'lu'];
var ENTETES_MESSAGES = ['Identifiant', 'Athlète', 'De', 'Message', 'Envoyé le', 'Lu le'];
var TAILLE_MAX_MESSAGE = 2000;
var CHAMPS_COACH = ['eveil', 'educ', 'corps', 'rac', 'profil', 'type', 'consignes', 'reaction'];
var CHAMPS_ATHLETE = ['km', 'dureeSec', 'dplus', 'rpe', 'notes', 'fc'];
var NUMERIQUES = { km: [0, 400], dureeSec: [0, 172800], dplus: [0, 20000], rpe: [1, 10], fc: [30, 250] };
// Colonnes des onglets J_… : les nouvelles colonnes sont ajoutées à la fin pour ne pas décaler les données déjà enregistrées
var COL_JOURS = ['date'].concat(CHAMPS_COACH, ['km', 'dureeSec', 'dplus', 'rpe', 'notes'], ['majA', 'recu'], ['fc']);
var ENTETES_JOURS = ['Date', 'Éveil (min)', 'Éduc (min)', 'Corps de séance', 'RAC (min)', 'Profil', 'Type', 'Consignes',
  'Réaction du coach', 'KM', 'Durée (s)', 'D+ (m)', 'RPE', 'Notes', 'Saisi le', 'Reçu le', 'FC moy. (bpm)'];
var COL_ATHLETES = ['id', 'prenom', 'nom', 'code', 'fiche', 'mot', 'majPlan', 'lienOuvert', 'derniereSync'];
var ENTETES_ATHLETES = ['Identifiant', 'Prénom', 'Nom', 'Code du lien', 'Fiche (technique)', 'Mot du coach',
  'Plan publié le', 'Lien ouvert le', 'Dernière synchro'];
var TAILLE_MAX_CELLULE = 50000; // limite d'une cellule Google Sheets

/* ---------- Installation (à lancer une fois depuis l'éditeur) ---------- */
function installer() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  feuilleAvecEntetes_(ss, 'Athletes', ENTETES_ATHLETES);
  feuilleAvecEntetes_(ss, 'Commun', ['Clé', 'Valeur']);
  var props = PropertiesService.getScriptProperties();
  var cle = props.getProperty('CLE_COACH');
  if (!cle) {
    cle = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
    props.setProperty('CLE_COACH', cle);
  }
  var reg = ss.getSheetByName('Réglages') || ss.insertSheet('Réglages');
  reg.getRange(1, 1, 3, 2).setValues([
    ['Clé entraîneur', cle],
    ['À quoi elle sert', 'À copier une fois dans l\'application Respir Outdoor (Réglages → Synchronisation). Ne la donne à personne.'],
    ['Version du service', VERSION_SERVICE]
  ]);
  return cle;
}

/* ---------- Points d'entrée web ---------- */
function doGet() {
  return ContentService.createTextOutput('Respir Outdoor : service en marche (version ' + VERSION_SERVICE + ').');
}

function doPost(e) {
  var res;
  try {
    var corps = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = traiter_(corps);
  } catch (err) {
    res = { ok: false, erreur: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

function traiter_(c) {
  var actions = {
    'athlete.lire': function () { return athleteLire_(c.code); },
    'athlete.saisir': function () { return athleteSaisir_(c.code, c.jours); },
    'coach.verifier': function () { verifierCle_(c.cle); return { ok: true, version: VERSION_SERVICE }; },
    'coach.publier': function () { verifierCle_(c.cle); return coachPublier_(c.athlete, c.jours); },
    'coach.lire': function () { verifierCle_(c.cle); return coachLire_(c.depuis); },
    'coach.recuperer': function () { verifierCle_(c.cle); return coachRecuperer_(c.ids); },
    'coach.commun': function () { verifierCle_(c.cle); return coachCommun_(c); },
    'coach.supprimer': function () { verifierCle_(c.cle); return coachSupprimer_(c.id); },
    'athlete.messages': function () { var a = athleteParCode_(c.code); if (c.lus) marquerLus_(a.id, 'coach'); return { ok: true, messages: lireMessages_(a.id) }; },
    'athlete.ecrire': function () { var a = athleteParCode_(c.code); return { ok: true, message: ecrireMessage_(a.id, 'athlete', c.texte) }; },
    'coach.messages': function () { verifierCle_(c.cle); return { ok: true, messages: lireMessages_(null) }; },
    'coach.ecrire': function () { verifierCle_(c.cle); if (!trouverAthlete_('id', c.id)) throw new Error('athlète inconnu'); return { ok: true, message: ecrireMessage_(c.id, 'coach', c.texte) }; },
    'coach.lus': function () { verifierCle_(c.cle); marquerLus_(c.id, 'athlete'); return { ok: true }; }
  };
  if (!actions[c.action]) throw new Error('action inconnue');
  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try { return actions[c.action](); } finally { verrou.releaseLock(); }
}

/* ---------- Athlète ---------- */
function athleteLire_(code) {
  var a = trouverAthlete_('code', normCode_(code));
  if (!a) throw new Error('lien inconnu ou remplacé : demande un nouveau lien à ton entraîneur');
  var maintenant = new Date().toISOString();
  if (!a.lienOuvert) a.lienOuvert = maintenant;
  a.derniereSync = maintenant;
  ecrireAthlete_(a);
  return {
    ok: true,
    athlete: { id: a.id, prenom: a.prenom, nom: a.nom, motCoach: a.mot || '', fiche: lireJSON_(a.fiche, {}) },
    jours: lireJours_(a.id),
    commun: lireCommun_(),
    heure: maintenant
  };
}

function athleteSaisir_(code, jours) {
  var a = trouverAthlete_('code', normCode_(code));
  if (!a) throw new Error('lien inconnu ou remplacé : demande un nouveau lien à ton entraîneur');
  var tous = lireJours_(a.id), acceptes = {}, refuses = [];
  Object.keys(jours || {}).forEach(function (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('date invalide : ' + d);
    var p = jours[d] || {}, row = tous[d] || {};
    // Une saisie plus récente déjà enregistrée (autre appareil) n'est pas écrasée
    if (row.majA && p.majA && String(row.majA) > String(p.majA)) { refuses.push(d); return; }
    CHAMPS_ATHLETE.forEach(function (k) { row[k] = valeurAthlete_(k, p[k]); });
    row.majA = p.majA || new Date().toISOString();
    row.recu = new Date().toISOString(); // heure du serveur : sert au suivi de l'entraîneur, même si le téléphone était hors connexion
    tous[d] = row;
    acceptes[d] = partie_(row, CHAMPS_ATHLETE.concat(['majA']));
  });
  ecrireJours_(a.id, tous);
  a.derniereSync = new Date().toISOString();
  ecrireAthlete_(a);
  return { ok: true, jours: acceptes, refuses: refuses };
}

/* ---------- Messagerie (onglet « Messages ») ---------- */
function athleteParCode_(code) {
  var a = trouverAthlete_('code', normCode_(code));
  if (!a) throw new Error('lien inconnu ou remplacé : demande un nouveau lien à ton entraîneur');
  return a;
}
function feuilleMessages_() { return feuilleAvecEntetes_(SpreadsheetApp.getActiveSpreadsheet(), 'Messages', ENTETES_MESSAGES); }
// Messages d'un athlète (tous les athlètes si id est vide), du plus ancien au plus récent
function lireMessages_(id) {
  var sh = feuilleMessages_(), n = sh.getLastRow() - 1, res = [];
  if (n <= 0) return res;
  sh.getRange(2, 1, n, COL_MESSAGES.length).getValues().forEach(function (l, i) {
    var m = { _ligne: i + 2 };
    COL_MESSAGES.forEach(function (k, c) { m[k] = texteCellule_(l[c], k); });
    if (m.id && (!id || m.athlete === id)) res.push(m);
  });
  return res.sort(function (x, y) { return x.envoye < y.envoye ? -1 : x.envoye > y.envoye ? 1 : 0; })
    .map(function (m) { delete m._ligne; return m; });
}
function ecrireMessage_(id, de, texte) {
  texte = String(texte == null ? '' : texte).trim();
  if (!texte) throw new Error('message vide');
  if (texte.length > TAILLE_MAX_MESSAGE) throw new Error('message trop long');
  var sh = feuilleMessages_(), m = { id: Utilities.getUuid(), athlete: id, de: de, texte: texte, envoye: new Date().toISOString(), lu: '' };
  sh.getRange(Math.max(sh.getLastRow(), 1) + 1, 1, 1, COL_MESSAGES.length).setValues([COL_MESSAGES.map(function (k) { return m[k]; })]);
  return m;
}
// Marque comme lus les messages reçus par l'autre personne : de = auteur des messages concernés
function marquerLus_(id, de) {
  var sh = feuilleMessages_(), n = sh.getLastRow() - 1;
  if (n <= 0) return;
  var r = sh.getRange(2, 1, n, COL_MESSAGES.length), v = r.getValues(), maintenant = new Date().toISOString(), change = false;
  v.forEach(function (l) { if (l[1] === id && l[2] === de && !l[5]) { l[5] = maintenant; change = true; } });
  if (change) r.setValues(v);
}

/* ---------- Entraîneur ---------- */
function coachPublier_(athlete, jours) {
  if (!athlete || !athlete.id) throw new Error('athlète sans identifiant');
  var code = normCode_(athlete.code);
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error('code de lien invalide');
  var autre = trouverAthlete_('code', code);
  if (autre && autre.id !== athlete.id) throw new Error('ce code est déjà utilisé par un autre athlète');
  var fiche = {};
  Object.keys(athlete).forEach(function (k) { if (['jours', 'code', 'motCoach', 'id', 'prenom', 'nom'].indexOf(k) < 0) fiche[k] = athlete[k]; });
  var ficheJSON = JSON.stringify(fiche);
  if (ficheJSON.length > TAILLE_MAX_CELLULE) throw new Error('fiche trop volumineuse');
  var a = trouverAthlete_('id', athlete.id) || { id: athlete.id };
  a.prenom = athlete.prenom || ''; a.nom = athlete.nom || ''; a.code = code;
  a.fiche = ficheJSON; a.mot = athlete.motCoach || ''; a.majPlan = new Date().toISOString();
  ecrireAthlete_(a);

  var tous = lireJours_(a.id), recus = jours || {}, dates = {};
  Object.keys(tous).concat(Object.keys(recus)).forEach(function (d) { dates[d] = 1; });
  Object.keys(dates).forEach(function (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('date invalide : ' + d);
    var row = tous[d] || { date: d }, p = recus[d] || {};
    CHAMPS_COACH.forEach(function (k) { row[k] = p[k] == null ? '' : String(p[k]); });
    // Partie athlète : seulement si le jour est encore vide côté serveur (jamais d'écrasement)
    var vide = !row.majA && CHAMPS_ATHLETE.every(function (k) { return row[k] === '' || row[k] == null; });
    if (vide && CHAMPS_ATHLETE.some(function (k) { return p[k] != null && p[k] !== ''; })) {
      CHAMPS_ATHLETE.forEach(function (k) { row[k] = valeurAthlete_(k, p[k]); });
      row.majA = p.majA || '';
      row.recu = new Date().toISOString();
    }
    tous[d] = row;
  });
  ecrireJours_(a.id, tous);
  return { ok: true, majPlan: a.majPlan };
}

function coachLire_(depuis) {
  var res = { ok: true, heure: new Date().toISOString(), athletes: {}, commun: lireCommun_() };
  lireAthletes_().forEach(function (a) {
    var jours = {}, tous = lireJours_(a.id);
    Object.keys(tous).forEach(function (d) {
      var r = tous[d];
      if (!r.majA && !r.recu) return;
      if (depuis && String(r.recu || '') <= String(depuis)) return;
      jours[d] = partie_(r, CHAMPS_ATHLETE.concat(['majA']));
    });
    res.athletes[a.id] = { lienOuvert: a.lienOuvert || '', derniereSync: a.derniereSync || '', majPlan: a.majPlan || '', jours: jours };
  });
  return res;
}

// Fiche et plan complet des athlètes demandés (tous si ids est vide) : pour retrouver ses athlètes sur un nouvel appareil
function coachRecuperer_(ids) {
  var res = { ok: true, athletes: [], commun: lireCommun_() };
  lireAthletes_().forEach(function (a) {
    if (ids && ids.length && ids.indexOf(a.id) < 0) return;
    var jours = {}, tous = lireJours_(a.id);
    Object.keys(tous).forEach(function (d) { jours[d] = partie_(tous[d], CHAMPS_COACH.concat(CHAMPS_ATHLETE, ['majA'])); });
    res.athletes.push({ id: a.id, prenom: a.prenom, nom: a.nom, code: a.code, motCoach: a.mot || '', fiche: lireJSON_(a.fiche, {}), jours: jours,
      suivi: { lienOuvert: a.lienOuvert || '', derniereSync: a.derniereSync || '', majPlan: a.majPlan || '' } });
  });
  return res;
}

function coachCommun_(c) {
  var sh = feuilleAvecEntetes_(SpreadsheetApp.getActiveSpreadsheet(), 'Commun', ['Clé', 'Valeur']);
  var valeurs = { legende: JSON.stringify(c.legende || null), protos: JSON.stringify(c.protos || []), motGlobal: String(c.motGlobal || '') };
  Object.keys(valeurs).forEach(function (k) { if (valeurs[k].length > TAILLE_MAX_CELLULE) throw new Error(k + ' trop volumineux'); });
  sh.getRange(2, 1, 3, 2).setValues([['legende', valeurs.legende], ['protos', valeurs.protos], ['motGlobal', valeurs.motGlobal]]);
  return { ok: true };
}

function coachSupprimer_(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Athletes');
  var a = trouverAthlete_('id', id);
  if (a) sh.deleteRow(a._ligne);
  var j = ss.getSheetByName('J_' + id);
  if (j) ss.deleteSheet(j);
  return { ok: true };
}

/* ---------- Outils ---------- */
function verifierCle_(cle) {
  var attendue = PropertiesService.getScriptProperties().getProperty('CLE_COACH');
  if (!attendue) throw new Error('service pas encore installé (lancer la fonction installer)');
  if (String(cle || '') !== attendue) throw new Error('clé entraîneur incorrecte');
}
function normCode_(c) { return String(c || '').trim().toUpperCase(); }
function partie_(row, champs) {
  var r = {};
  champs.forEach(function (k) { if (row[k] !== '' && row[k] != null) r[k] = row[k]; });
  return r;
}
function valeurAthlete_(k, v) {
  if (v == null || v === '') return '';
  if (NUMERIQUES[k]) {
    var n = Number(v);
    if (!isFinite(n) || n < NUMERIQUES[k][0] || n > NUMERIQUES[k][1]) throw new Error('valeur invalide pour ' + k);
    return n;
  }
  return String(v).slice(0, 2000);
}
function lireJSON_(s, defaut) { try { return s ? JSON.parse(s) : defaut; } catch (e) { return defaut; } }
// Relit une cellule : le tableur peut avoir converti une date ou un nombre saisi sous forme de texte
function texteCellule_(v, k) {
  if (v instanceof Date) return k === 'date' ? Utilities.formatDate(v, 'Europe/Paris', 'yyyy-MM-dd') : v.toISOString();
  if (v == null || v === '') return '';
  if (NUMERIQUES[k]) { var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : ''; }
  return typeof v === 'number' ? v : String(v);
}

function feuilleAvecEntetes_(ss, nom, entetes) {
  var sh = ss.getSheetByName(nom);
  if (!sh) {
    sh = ss.insertSheet(nom);
    sh.getRange(1, 1, 1, entetes.length).setValues([entetes]);
    sh.getRange(1, 1, 5000, entetes.length).setNumberFormat('@'); // texte brut : pas de conversion automatique des dates
  }
  return sh;
}

function lireAthletes_() {
  var sh = feuilleAvecEntetes_(SpreadsheetApp.getActiveSpreadsheet(), 'Athletes', ENTETES_ATHLETES);
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  return sh.getRange(2, 1, n, COL_ATHLETES.length).getValues().map(function (l, i) {
    var a = { _ligne: i + 2 };
    COL_ATHLETES.forEach(function (k, c) { a[k] = texteCellule_(l[c], k); });
    return a;
  }).filter(function (a) { return a.id; });
}
function trouverAthlete_(champ, valeur) {
  if (!valeur) return null;
  return lireAthletes_().filter(function (a) { return String(a[champ]) === String(valeur); })[0] || null;
}
function ecrireAthlete_(a) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Athletes');
  var ligne = a._ligne || (trouverAthlete_('id', a.id) || {})._ligne || sh.getLastRow() + 1;
  sh.getRange(ligne, 1, 1, COL_ATHLETES.length).setValues([COL_ATHLETES.map(function (k) { return a[k] == null ? '' : a[k]; })]);
  a._ligne = ligne;
}

function lireJours_(id) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('J_' + id), res = {};
  if (!sh) return res;
  var n = sh.getLastRow() - 1;
  if (n <= 0) return res;
  sh.getRange(2, 1, n, COL_JOURS.length).getValues().forEach(function (l) {
    var r = {};
    COL_JOURS.forEach(function (k, c) { r[k] = texteCellule_(l[c], k); });
    if (r.date) res[r.date] = r;
  });
  return res;
}
// Réécrit l'onglet de l'athlète en une seule opération, trié par date ; les jours entièrement vides sont retirés
function ecrireJours_(id, tous) {
  var sh = feuilleAvecEntetes_(SpreadsheetApp.getActiveSpreadsheet(), 'J_' + id, ENTETES_JOURS);
  var avant = Math.max(0, sh.getLastRow() - 1);
  var lignes = Object.keys(tous).sort().map(function (d) {
    var r = tous[d]; r.date = d;
    return COL_JOURS.map(function (k) { return r[k] == null ? '' : r[k]; });
  }).filter(function (l) { return l.slice(1).some(function (v) { return v !== ''; }); });
  // Onglet créé avec une version précédente du service : compléter la ligne d'en-têtes
  var tete = sh.getRange(1, 1, 1, ENTETES_JOURS.length).getValues()[0];
  if (tete.some(function (v) { return v === '' || v == null; })) sh.getRange(1, 1, 1, ENTETES_JOURS.length).setValues([ENTETES_JOURS]);
  if (lignes.length) sh.getRange(2, 1, lignes.length, COL_JOURS.length).setValues(lignes);
  if (avant > lignes.length) sh.getRange(lignes.length + 2, 1, avant - lignes.length, COL_JOURS.length).clearContent();
}

function lireCommun_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Commun'), res = { legende: null, protos: [], motGlobal: '' };
  if (!sh || sh.getLastRow() < 2) return res;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (l) {
    if (l[0] === 'legende') res.legende = lireJSON_(l[1], null);
    else if (l[0] === 'protos') res.protos = lireJSON_(l[1], []);
    else if (l[0] === 'motGlobal') res.motGlobal = String(l[1] || '');
  });
  return res;
}
