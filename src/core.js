var Core = (function () {
  'use strict';
  var TZ = 'Europe/Paris';
  var SCHEMA_VERSION = 1;
  var JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  // Colonnes « partie entraîneur » et « partie athlète » du tableau PLAN
  var CHAMPS_COACH = ['eveil', 'educ', 'corps', 'rac', 'profil', 'type', 'consignes'];
  var CHAMPS_ATHLETE = ['km', 'dureeSec', 'dplus', 'rpe', 'notes', 'fc'];
  // Réaction de l'entraîneur à une séance saisie : écrite par l'entraîneur, conservée lors d'un import Excel
  var CHAMP_REACTION = 'reaction';
  // Champs de la fiche gardés côté entraîneur quand un classeur Excel est réimporté
  var CLES_LOCALES = ['code', 'motCoach'];
  // Échelle « Intensité de l'effort » de 1 à 10 : image insérée dans l'onglet PLAN du classeur (cellule O7).
  // Libellés et couleurs relevés sur cette image ; les niveaux sans libellé restent sans libellé.
  var ECHELLE_RPE = { 1: 'Très facile', 2: 'Facile', 4: 'Modéré', 7: 'Difficile', 9: 'Très difficile', 10: 'Effort maximal' };
  // Dégradé de la barre RPE (couleurs relevées sur l'image fournie) : bleu, cyan, vert, jaune, orange, rouge.
  // Niveau n placé à (n − 1) / 9 du dégradé ; les niveaux entre deux couleurs sont interpolés.
  var DEGRADE_RPE = ['#4879C6', '#63C6DD', '#60C462', '#FECF63', '#F2804A', '#C54135'];
  function couleurDegrade(t) {
    var n = DEGRADE_RPE.length - 1, x = Math.max(0, Math.min(1, t)) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
    var a = DEGRADE_RPE[i], b = DEGRADE_RPE[i + 1], s = '#';
    for (var k = 1; k < 7; k += 2) {
      var v = Math.round(parseInt(a.substr(k, 2), 16) * (1 - f) + parseInt(b.substr(k, 2), 16) * f);
      s += (v < 16 ? '0' : '') + v.toString(16).toUpperCase();
    }
    return s;
  }
  // Texte lisible sur une couleur : blanc ou noir selon le contraste le plus fort (WCAG)
  function texteSur(hex) {
    var c = [1, 3, 5].map(function (k) { var v = parseInt(hex.substr(k, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    var L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#FFFFFF' : '#000000';
  }
  var COULEURS_RPE = {};
  for (var nr = 1; nr <= 10; nr++) COULEURS_RPE[nr] = couleurDegrade((nr - 1) / 9);
  // Libellé du niveau entier le plus proche (6,5 -> niveau 7) ; null hors échelle
  function libelleRPE(v) { if (!isNum(v) || v < 1 || v > 10) return null; var n = Math.round(v); return { niveau: n, libelle: ECHELLE_RPE[n] || '', couleur: COULEURS_RPE[n], texte: texteSur(COULEURS_RPE[n]) }; }

  function estCourseOuMarche(j) { var a = activite(j); return !a || !!a.activite.chaussures; }
  // Kilomètres par paire de chaussures : km déjà parcourus à l'ajout + km des séances associées à la paire
  function kmChaussures(ch, jours) {
    var r = {};
    ((ch && ch.liste) || []).forEach(function (c) { r[c.id] = isNum(c.kmDepart) ? c.kmDepart : 0; });
    Object.keys((ch && ch.parDate) || {}).forEach(function (d) {
      var id = ch.parDate[d], j = (jours || {})[d];
      if (r[id] !== undefined && j && isNum(j.km) && estCourseOuMarche(j)) r[id] = Math.round((r[id] + j.km) * 1000) / 1000;
    });
    return r;
  }

  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function texte(v) { return v == null ? '' : String(v).trim(); }

  /* ---------- Nombres (décimale à virgule) ---------- */
  function parseNumberFR(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    var s = String(v).trim().replace(/[\s  ]/g, '');
    if (s === '') return null;
    if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return NaN;
    return Number(s.replace(',', '.'));
  }
  function nombreFR(x, d) {
    if (!isNum(x)) return '';
    var p = Math.pow(10, d == null ? 2 : d);
    return String(Math.round(x * p) / p).replace('.', ',');
  }

  /* ---------- Dates (AAAA-MM-JJ, calendrier Europe/Paris) ---------- */
  function isValidISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-').map(Number);
    if (p[0] < 1900 || p[0] > 2100 || p[1] < 1 || p[1] > 12 || p[2] < 1) return false;
    return p[2] <= new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  }
  // jj/mm/aaaa, jj/mm/aa (20aa) ou aaaa-mm-jj
  function parseDateFR(v) {
    var s = texte(v), m, iso;
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})$/.exec(s))) {
      var a = m[3].length === 2 ? '20' + m[3] : m[3];
      iso = a + '-' + pad2(m[2]) + '-' + pad2(m[1]);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
    else return null;
    return isValidISODate(iso) ? iso : null;
  }
  function formatDateFR(iso, court) {
    if (!isValidISODate(iso)) return '';
    var p = iso.split('-');
    return court ? p[2] + '/' + p[1] : p[2] + '/' + p[1] + '/' + p[0];
  }
  function isoToUTC(iso) { var p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function utcToISO(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(iso, n) { return utcToISO(isoToUTC(iso) + n * 86400000); }
  function daysBetween(a, b) { return Math.round((isoToUTC(b) - isoToUTC(a)) / 86400000); }
  function dayOfWeek(iso) { return (new Date(isoToUTC(iso)).getUTCDay() + 6) % 7; } // 0 = lundi
  function weekStart(iso) { return addDays(iso, -dayOfWeek(iso)); }
  function todayParis(now) {
    var o = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now || new Date()).forEach(function (p) { o[p.type] = p.value; });
    return o.year + '-' + o.month + '-' + o.day;
  }
  // Série Excel (système 1900) -> ISO. 61 = 01/03/1900 (Excel compte un faux 29/02/1900).
  function excelSerialToISO(n) {
    if (!isNum(n) || n < 1) return null;
    var j = Math.floor(n);
    if (j < 61) j += 1;
    return utcToISO(Date.UTC(1899, 11, 30) + j * 86400000);
  }

  /* ---------- Semaines du contrat ---------- */
  // Le contrat commence le lundi « debut » : semaine 1 = 7 premiers jours (S82 = lundi 03/08/2026 pour un début au 13/01/2025).
  function numSemaine(debut, iso) {
    if (!isValidISODate(debut) || !isValidISODate(iso)) return null;
    return Math.floor(daysBetween(weekStart(debut), iso) / 7) + 1;
  }
  function lundiSemaine(debut, n) { return addDays(weekStart(debut), (n - 1) * 7); }

  /* ---------- Durées et allures ---------- */
  function formatDuree(sec) {
    if (!isNum(sec)) return '';
    var t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h + ':' + pad2(m) + ':' + pad2(s);
  }
  // "1:15:45", "45:07" (mm:ss), "1h15", "1h15m45", "75" (minutes)
  function parseDuree(v) {
    var s = texte(v).toLowerCase().replace(/\s/g, ''), m;
    if (s === '') return null;
    if ((m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(s))) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    if ((m = /^(\d+):([0-5]\d)$/.exec(s))) return +m[1] * 60 + +m[2];
    if ((m = /^(\d+)h([0-5]?\d)?(?:m(?:in)?)?([0-5]?\d)?s?$/.exec(s))) return +m[1] * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    if ((m = /^(\d+)(?:mn|min|')?$/.exec(s))) return +m[1] * 60;
    return NaN;
  }
  // Temps court : < 2 min au dixième (« 36,7 s »), sinon m:ss
  function formatTemps(sec) {
    if (!isNum(sec)) return '';
    if (sec < 120) return nombreFR(Math.round(sec * 10) / 10, 1) + ' s';
    var t = Math.round(sec);
    if (t >= 3600) return formatDuree(t);
    return Math.floor(t / 60) + ':' + pad2(t % 60);
  }
  function paceFromSpeed(kmh) { return isNum(kmh) && kmh > 0 ? 3600 / kmh : null; }
  function formatAllure(secKm) {
    if (!isNum(secKm) || secKm <= 0) return '';
    var t = Math.round(secKm);
    return Math.floor(t / 60) + ':' + pad2(t % 60) + ' /km';
  }
  function allureMoyenne(dureeSec, km) { return isNum(dureeSec) && dureeSec > 0 && isNum(km) && km > 0 ? dureeSec / km : null; }
  function vitessePct(vma, pct) { return isNum(vma) && vma > 0 && isNum(pct) && pct > 0 ? vma * pct / 100 : null; }
  // Formule de l'onglet ALLURES : temps = distance / (VMA × 1000 × %) en heures
  function tempsDistancePct(distM, vma, pct) {
    var v = vitessePct(vma, pct);
    return v && distM > 0 ? distM / (v * 1000) * 3600 : null;
  }
  // Distance parcourue en « sec » secondes à « pct » % de VMA (séance 30"-30")
  function distanceTempsPct(sec, vma, pct) {
    var v = vitessePct(vma, pct);
    return v && sec > 0 ? v * 1000 * sec / 3600 : null;
  }
  function zoneVitesses(vma, zone) {
    if (!zone) return null;
    var b = vitessePct(vma, zone.bas), h = vitessePct(vma, zone.haut);
    return b && h ? { bas: b, haut: h, allureLente: paceFromSpeed(b), allureRapide: paceFromSpeed(h) } : null;
  }
  // Allure spécifique depuis un chrono de référence
  function allureChrono(chronoSec, distKm) {
    if (!isNum(chronoSec) || chronoSec <= 0 || !isNum(distKm) || distKm <= 0) return null;
    return { allure: chronoSec / distKm, vitesse: distKm / (chronoSec / 3600) };
  }

  /* ---------- Zones par défaut (en-tête du tableau PLAN) ---------- */
  var ZONES_DEFAUT = [
    { nom: 'Z1.1', bas: 58, haut: 62, usage: 'RAC' },
    { nom: 'Z1.2', bas: 63, haut: 67, usage: 'EF/SL' },
    { nom: 'Z1.3', bas: 68, haut: 72, usage: 'DVPT' },
    { nom: 'Z2', bas: 78, haut: 82, usage: 'MAR' },
    { nom: 'Z3', bas: 83, haut: 87, usage: 'SEMI' },
    { nom: 'Z4', bas: 88, haut: 92, usage: '10' }
  ];
  function normZone(s) { return texte(s).toUpperCase().replace(',', '.').replace(/\s/g, ''); }
  function trouverZone(zones, nom) {
    var n = normZone(nom);
    return (zones || []).filter(function (z) { return normZone(z.nom) === n; })[0] || null;
  }

  /* ---------- Lecture d'une séance : repères calculés ---------- */
  // Repère = { libelle, detail }. Ne devine rien : seuls les motifs explicites sont reconnus.
  function reperesSeance(jour, ctx) {
    var t = (texte(jour.corps) + ' ' + texte(jour.consignes)).toUpperCase(), out = [], vus = {}, m, re;
    var vma = ctx && ctx.vma, zones = (ctx && ctx.zones) || ZONES_DEFAUT;
    function ajout(cle, libelle, detail) { if (!vus[cle]) { vus[cle] = 1; out.push({ libelle: libelle, detail: detail }); } }
    // Zones : Z1.3, Z1,2, Z2…
    re = /\bZ\s?(\d(?:[.,]\d)?)\b/g;
    while ((m = re.exec(t))) {
      var z = trouverZone(zones, 'Z' + m[1]), v = z && zoneVitesses(vma, z);
      if (v) ajout('z' + z.nom, z.nom, nombreFR(v.bas, 1) + '–' + nombreFR(v.haut, 1) + ' km/h · ' +
        formatAllure(v.allureLente).replace(' /km', '') + '–' + formatAllure(v.allureRapide));
    }
    // Répétitions en distance à % de VMA : « 5x800M 95% VMA », « 12x200M 100% », « 12x100M 120% »
    re = /(\d{2,5})\s*M\b[^%\d]{0,12}(\d{2,3})\s*%/g;
    while ((m = re.exec(t))) {
      var d = +m[1], p = +m[2], s = tempsDistancePct(d, vma, p);
      if (s) ajout('d' + d + '-' + p, d + ' m à ' + p + ' %', formatTemps(s) + ' (' + nombreFR(vitessePct(vma, p), 1) + ' km/h)');
    }
    // Allures spécifiques
    var spe = { 'SPE10': ['10 km', 'chrono10', 10], 'SPE1/2': ['semi', 'chronoSemi', 21.1], 'SPEMAR': ['marathon', 'chronoMarathon', 42.195] };
    var compact = (t + ' ' + texte(jour.type).toUpperCase()).replace(/\s/g, '');
    Object.keys(spe).forEach(function (k) {
      if (compact.indexOf(k) < 0 || !ctx || !ctx.allures) return;
      var a = allureChrono(ctx.allures[spe[k][1]], spe[k][2]);
      if (a) ajout(k, 'Allure spé ' + spe[k][0], formatAllure(a.allure) + ' (' + nombreFR(a.vitesse, 1) + ' km/h)');
    });
    return out;
  }

  /* ---------- Légende ---------- */
  function normCode(s) { return texte(s).toUpperCase().replace(/[\s.]/g, ''); }
  // Cherche un code (« VMAC » trouve « VMA C »). Variante « EF+ » -> « EF » signalée.
  function chercherCode(liste, code) {
    var n = normCode(code);
    if (!n) return null;
    var e = (liste || []).filter(function (x) { return normCode(x.code) === n; })[0];
    if (e) return { entree: e, variante: false };
    if (/\+$/.test(n)) {
      e = (liste || []).filter(function (x) { return normCode(x.code) === n.replace(/\++$/, ''); })[0];
      if (e) return { entree: e, variante: true };
    }
    return null;
  }

  /* ---------- Bilans ---------- */
  function estRepos(j) { return /^REPOS\b/i.test(texte(j && j.corps)); }
  function aContenuCoach(j) { return !!j && CHAMPS_COACH.some(function (k) { return texte(j[k]) !== ''; }); }
  // Saisie principale du jour (les activités en plus, lignes « [+ …] » de la note, n'en font pas partie)
  function aRetour(j) { return !!j && (isNum(j.km) || isNum(j.dureeSec) || isNum(j.rpe) || isNum(j.dplus) || isNum(j.fc) || notesPrincipales(j.notes) !== ''); }
  // Somme des km et durées, moyenne des RPE renseignés (comme =SUM et =AVERAGE du tableau)
  function bilanJours(jours) {
    var r = { km: 0, dureeSec: 0, rpeMoy: null, nbRpe: 0, prevues: 0, faites: 0, autres: [] }, sRpe = 0;
    (jours || []).forEach(function (j) {
      if (!j) return;
      if (aContenuCoach(j) && !estRepos(j)) r.prevues++;
      seancesDuJour(j).forEach(function (x) {
        if (x.code !== 'course') { r.autres.push(x.nom); return; }
        if (isNum(x.km)) r.km += x.km;
        if (isNum(x.dureeSec)) r.dureeSec += x.dureeSec;
        if (isNum(x.rpe)) { sRpe += x.rpe; r.nbRpe++; }
        if (isNum(x.km) || isNum(x.dureeSec)) r.faites++;
      });
    });
    r.km = Math.round(r.km * 1000) / 1000;
    if (r.nbRpe) r.rpeMoy = sRpe / r.nbRpe;
    return r;
  }
  function joursSemaine(athlete, lundi) {
    var out = [];
    for (var i = 0; i < 7; i++) { var d = addDays(lundi, i); out.push({ date: d, jour: (athlete.jours || {})[d] || {} }); }
    return out;
  }
  function prochaineCompet(athlete, auj) {
    var dates = Object.keys(athlete.jours || {}).filter(function (d) {
      var j = athlete.jours[d];
      return d >= auj && normCode(j.type) === 'COMP';
    }).sort();
    return dates.length ? { date: dates[0], jour: athlete.jours[dates[0]], dans: daysBetween(auj, dates[0]) } : null;
  }

  /* ---------- Lettres verticales (colonnes CYCLE et SPE du tableau) ---------- */
  // [{ligne, valeur}] -> [{debut, fin, texte}] : une lettre par ligne, un mot par bloc continu,
  // mots séparés par une ligne vide maximum, phrases séparées par un écart plus grand.
  function regrouperVertical(cellules) {
    var tri = (cellules || []).filter(function (c) { return texte(c.valeur) !== ''; })
      .sort(function (a, b) { return a.ligne - b.ligne; });
    var phrases = [], cur = null, mot = '', prec = null;
    function finMot() { if (mot) { cur.mots.push(mot); mot = ''; } }
    tri.forEach(function (c) {
      var v = texte(c.valeur);
      if (cur && c.ligne - prec > 2) { finMot(); phrases.push(cur); cur = null; }
      if (!cur) cur = { debut: c.ligne, fin: c.ligne, mots: [] };
      else if (c.ligne - prec === 2) finMot();
      if (v.length > 1) { finMot(); cur.mots.push(v); } else mot += v;
      cur.fin = c.ligne; prec = c.ligne;
    });
    if (cur) { finMot(); phrases.push(cur); }
    return phrases.map(function (p) { return { debut: p.debut, fin: p.fin, texte: p.mots.join(' ') }; });
  }

  /* ---------- Modèle ---------- */
  function idAthlete(a) { return normCode((a.nom || '') + '_' + (a.prenom || '')).replace(/[^A-Z0-9_]/g, '') || 'ATHLETE'; }
  function nouvelAthlete(o) {
    var a = {
      id: '', prenom: '', nom: '', email: '', naissance: '', objectif: '', objectif2: '',
      contratSemaines: null, debut: null, fin: null, hebdo: '', contraintes: '', terrains: '',
      dispos: { L: false, M1: false, M2: false, J: false, V: false, S: false, D: false },
      vma: null, zones: ZONES_DEFAUT.map(function (z) { return Object.assign({}, z); }),
      test: { type: '', date: '', estimee: false }, historiqueVMA: [],
      allures: { chrono10: null, chronoSemi: null, chronoMarathon: null, chrono100: null, preFatPct: 75 },
      semaines: {}, jours: {}, maj: null
    };
    Object.keys(o || {}).forEach(function (k) { a[k] = o[k]; });
    if (!a.id) a.id = idAthlete(a);
    return a;
  }
  // Limites des valeurs athlète, identiques à celles du script Google (NUMERIQUES dans Code.gs) :
  // une valeur hors limites serait refusée par le service et bloquerait toute la synchronisation
  var BORNES = { km: [0, 400], dureeSec: [0, 172800], dplus: [0, 20000], rpe: [1, 10], fc: [30, 250] };
  function dansBornes(k, v) { return isNum(v) && v >= BORNES[k][0] && v <= BORNES[k][1]; }
  function nettoyerJour(j) {
    var r = {};
    CHAMPS_COACH.concat([CHAMP_REACTION], CHAMPS_ATHLETE).forEach(function (k) {
      var v = j[k];
      if (BORNES[k]) { if (dansBornes(k, v)) r[k] = v; }
      else if (texte(v) !== '') r[k] = texte(v);
    });
    if (texte(j.majA) !== '') r.majA = texte(j.majA);
    return r;
  }

  // Retire d'un athlète déjà enregistré les valeurs hors limites (anciens imports) : [{ date, champ, valeur }]
  function corrigerAthlete(a) {
    var retirees = [];
    Object.keys(a.jours || {}).forEach(function (d) {
      var j = a.jours[d];
      Object.keys(BORNES).forEach(function (k) { if (j[k] !== undefined && j[k] !== null && j[k] !== '' && !dansBornes(k, j[k])) retirees.push({ date: d, champ: k, valeur: j[k] }); });
      var c = nettoyerJour(j); if (Object.keys(c).length) a.jours[d] = c; else delete a.jours[d];
    });
    if (Array.isArray(a.resultats)) a.resultats = a.resultats.filter(function (r) { if (resultatValide(r)) return true; retirees.push({ date: r && r.date, champ: 'résultat', valeur: r && r.s }); return false; });
    return retirees;
  }

  /* ---------- Résultats de course saisis par l'entraîneur (records personnels) ---------- */
  // a.resultats = [{ id, dist, date (ISO), s (chrono en secondes), course }] ; le record d'une distance est son meilleur chrono
  var DISTANCES_RP = [{ code: 'd5', nom: '5 km', court: '5 km', km: 5 }, { code: 'd10', nom: '10 km', court: '10 km', km: 10 },
    { code: 'semi', nom: 'Semi-marathon', court: 'Semi', km: 21.0975 }, { code: 'marathon', nom: 'Marathon', court: 'Marathon', km: 42.195 },
    { code: 'd100', nom: '100 km', court: '100 km', km: 100 }];
  function distanceRP(code) { return DISTANCES_RP.filter(function (d) { return d.code === code; })[0] || null; }
  // Chrono « m:ss » sous une heure, « h:mm:ss » au-delà
  function chronoTexte(sec) {
    if (!isNum(sec)) return '';
    var t = Math.round(Math.abs(sec)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
    return (h ? h + ':' + pad2(m) : m) + ':' + pad2(t % 60);
  }
  // Résultat d'une colonne « ANNEE 2024 » du classeur : jour inconnu, annee = 2024 et date conventionnelle au 1er juillet (milieu de l'année) pour l'ordre et la courbe
  function resultatValide(r) {
    return !!(r && distanceRP(r.dist) && isValidISODate(r.date) && isNum(r.s) && r.s > 0 && r.s <= BORNES.dureeSec[1] &&
      (r.annee === undefined || (isNum(r.annee) && r.date === r.annee + '-07-01')));
  }
  function dateResultat(r) { return r.annee ? String(r.annee) : formatDateFR(r.date); }      // « 25/10/2026 » ou « 2024 »
  function quandResultat(r) { return r.annee ? 'en ' + r.annee : 'le ' + formatDateFR(r.date); } // « le 25/10/2026 » ou « en 2024 »
  // Résultats d'une distance par date ; rec : record au moment de la course ; best : record du moment
  function resultatsDistance(a, code) {
    var best = Infinity;
    return ((a && a.resultats) || []).filter(function (r) { return r.dist === code && resultatValide(r); })
      .sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : y.s - x.s; })
      .map(function (r) { var rec = r.s < best; if (rec) best = r.s; return Object.assign({}, r, { rec: rec, best: best }); });
  }
  // Par distance : record actuel (rp), record précédent (prec) et nombre de résultats
  function syntheseRP(a) {
    return DISTANCES_RP.map(function (d) {
      var l = resultatsDistance(a, d.code), recs = l.filter(function (r) { return r.rec; });
      return { distance: d, rp: recs[recs.length - 1] || null, prec: recs[recs.length - 2] || null, premier: l[0] || null, n: l.length };
    });
  }

  /* ---------- Fusion : chaque information a un seul propriétaire ---------- */
  // Partie entraîneur : CHAMPS_COACH (+ réaction). Partie athlète : CHAMPS_ATHLETE + majA (horodatage de la saisie).
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function partie(j, champs) {
    var r = {};
    champs.forEach(function (k) { if (j && j[k] !== undefined && j[k] !== null && j[k] !== '') r[k] = j[k]; });
    return r;
  }
  function aDonneesAthlete(j) { return Object.keys(partie(j, CHAMPS_ATHLETE)).length > 0; }
  function partieAthlete(j) { var r = partie(j, CHAMPS_ATHLETE); if (j && j.majA) r.majA = j.majA; return r; }
  // La saisie la plus récente gagne (majA au format ISO, comparable comme texte)
  function plusRecente(l, r) { return String((r && r.majA) || '') > String((l && l.majA) || '') ? r : l; }

  // Modes :
  // « excel »     : entraîneur, nouveau classeur sur un athlète existant. Plan et fiche du classeur ;
  //                 saisies de l'athlète, réactions, code du lien et mot du coach conservés ;
  //                 les valeurs athlète du classeur ne remplissent que les jours encore vides ;
  //                 les séances hors de la période de l'onglet importé (anciens contrats) gardent leur plan ;
  //                 si la date de début change, le contrat précédent est archivé dans « contrats ».
  // « serveur »   : athlète, état reçu en ligne. Plan, fiche et réactions du serveur ; pour les saisies,
  //                 la plus récente gagne, et une saisie locale pas encore envoyée (opts.enAttente) est toujours gardée.
  // « retours »   : entraîneur, saisies reçues en ligne. Plan local conservé ; la saisie la plus récente gagne.
  // « remplacer » : tout le contenu reçu.
  function fusionner(local, recu, mode, opts) {
    if (mode === 'remplacer' || !local) return clone(recu);
    opts = opts || {};
    var enAttente = opts.enAttente || {};
    var res = clone(local);
    if (mode === 'excel' || mode === 'serveur') {
      Object.keys(recu).forEach(function (k) {
        if (k === 'jours' || k === 'id') return;
        if (mode === 'excel' && CLES_LOCALES.indexOf(k) >= 0 && !recu[k]) return;
        if (mode === 'excel' && k === 'resultats') {
          // Résultats repris du classeur (id « x… ») remplacés à chaque import ; ceux saisis dans l'application gardés, sans doublon
          var cle = function (r) { return r.dist + '|' + r.date + '|' + r.s; }, deja = {};
          res.resultats = clone((local.resultats || []).filter(function (r) { return !/^x/.test(r.id || ''); })); res.resultats.forEach(function (r) { deja[cle(r)] = 1; });
          (recu.resultats || []).forEach(function (r) { if (!deja[cle(r)]) { res.resultats.push(clone(r)); deja[cle(r)] = 1; } });
          return;
        }
        // Chronos de base : une case vide du classeur ne remplace pas une valeur saisie dans l'application
        if (mode === 'excel' && k === 'allures' && local.allures) {
          res.allures = clone(local.allures);
          Object.keys(recu.allures || {}).forEach(function (x) { if (recu.allures[x] !== null && recu.allures[x] !== undefined && recu.allures[x] !== '') res.allures[x] = recu.allures[x]; });
          return;
        }
        res[k] = clone(recu[k]);
      });
    }
    if (mode === 'excel') res.contrats = archiverContrat(local, recu);
    // Période couverte par l'onglet importé : toutes ses lignes datées (planDu/planAu), à défaut ses jours renseignés
    var dRecues = Object.keys(recu.jours || {}).sort(), dMin = recu.planDu || dRecues[0], dMax = recu.planAu || dRecues[dRecues.length - 1], dates = {};
    Object.keys(local.jours || {}).concat(Object.keys(recu.jours || {})).forEach(function (d) { dates[d] = 1; });
    res.jours = {};
    Object.keys(dates).forEach(function (d) {
      var l = (local.jours || {})[d] || {}, r = (recu.jours || {})[d] || {};
      var horsPeriode = mode === 'excel' && (!dMin || d < dMin || d > dMax);
      var coach = mode === 'retours' || horsPeriode ? partie(l, CHAMPS_COACH) : partie(r, CHAMPS_COACH);
      var reaction = mode === 'serveur' ? r[CHAMP_REACTION] : l[CHAMP_REACTION];
      var ath;
      if (mode === 'excel') ath = aDonneesAthlete(l) || l.majA ? partieAthlete(l) : partieAthlete(r);
      else if (mode === 'serveur' && enAttente[d]) ath = partieAthlete(l);
      else ath = partieAthlete(plusRecente(l, r));
      var j = Object.assign({}, coach, ath);
      if (reaction) j[CHAMP_REACTION] = reaction;
      j = nettoyerJour(j);
      if (Object.keys(j).length) res.jours[d] = j;
    });
    return res;
  }

  /* ---------- Contrats précédents ---------- */
  // Un contrat archivé : { debut, fin, contratSemaines, objectif, objectif2, semaines } (semaines numérotées depuis son début)
  var CHAMPS_CONTRAT = ['debut', 'fin', 'contratSemaines', 'objectif', 'objectif2', 'semaines'];
  function archiverContrat(local, recu) {
    var liste = clone(local.contrats || []);
    if (local.debut && recu.debut && local.debut !== recu.debut) {
      var c = {}; CHAMPS_CONTRAT.forEach(function (k) { if (local[k] != null && local[k] !== '') c[k] = clone(local[k]); });
      liste = liste.filter(function (x) { return x.debut !== c.debut; }).concat([c]);
    }
    // Le contrat importé redevient le contrat en cours s'il était archivé
    return liste.filter(function (x) { return x.debut !== recu.debut; }).sort(function (x, y) { return x.debut < y.debut ? -1 : 1; });
  }
  // Contrat archivé qui couvre une date antérieure au contrat en cours (le plus récent qui a commencé avant)
  function contratDe(a, iso) {
    if (!iso || (a.debut && weekStart(iso) >= weekStart(a.debut))) return null;
    var res = null;
    (a.contrats || []).forEach(function (c) { if (c.debut && weekStart(c.debut) <= weekStart(iso)) res = c; });
    return res;
  }

  /* ---------- Périodes et bilans (tableau de bord) ---------- */
  function joursDansMois(iso) { var p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); }
  function debutMois(iso) { return iso.slice(0, 8) + '01'; }
  function finMois(iso) { return iso.slice(0, 8) + pad2(joursDansMois(iso)); }
  function moisPrecedent(iso) { var p = iso.split('-').map(Number), y = p[1] === 1 ? p[0] - 1 : p[0], m = p[1] === 1 ? 12 : p[1] - 1; return y + '-' + pad2(m) + '-01'; }
  // Période en cours et même durée écoulée de la période précédente (comparaison « à date »)
  function periodes(auj) {
    var lun = weekStart(auj), dm = debutMois(auj), an = auj.slice(0, 4), mp = moisPrecedent(auj);
    var jour = Number(auj.slice(8, 10)), anP = String(Number(an) - 1), memeJourAnP = anP + auj.slice(4, 10);
    if (!isValidISODate(memeJourAnP)) memeJourAnP = anP + '-02-28';
    return {
      semaine: { du: lun, au: addDays(lun, 6), precDu: addDays(lun, -7), precAu: addDays(lun, -7 + dayOfWeek(auj)) },
      mois: { du: dm, au: finMois(auj), precDu: mp, precAu: mp.slice(0, 8) + pad2(Math.min(jour, joursDansMois(mp))) },
      annee: { du: an + '-01-01', au: an + '-12-31', precDu: anP + '-01-01', precAu: memeJourAnP }
    };
  }
  // Séance « pas réalisée » : signalée par l'athlète dans la note, sous la forme « [PAS RÉALISÉE · raison] message ».
  // La note est déjà synchronisée avec le service Google : aucun changement du script de l'entraîneur n'est nécessaire.
  var RAISONS_NON_FAITE = ['Malade', 'Blessure / douleur', 'Fatigue', 'Manque de temps', 'Météo', 'Autre'];
  function nonRealisee(j) {
    var m = /^\[PAS RÉALISÉE(?: · ([^\]]*))?\]\s*([\s\S]*)$/.exec(texte(j && j.notes));
    return m ? { raison: m[1] || '', message: notesPrincipales(m[2]) } : null;
  }
  // Séance décalée : « [DÉCALÉE AU 2026-10-20 · raison] message » ; une fois faite : « [FAITE LE 2026-10-20] notes »
  function decalee(j) {
    var m = /^\[DÉCALÉE AU (\d{4}-\d{2}-\d{2})(?: · ([^\]]*))?\]\s*([\s\S]*)$/.exec(texte(j && j.notes));
    return m ? { au: m[1], raison: m[2] || '', message: notesPrincipales(m[3]) } : null;
  }
  function noteDecalee(au, raison, message) { return '[DÉCALÉE AU ' + au + (texte(raison) ? ' · ' + texte(raison).replace(/[\[\]]/g, '') : '') + '] ' + texte(message); }
  function faiteLe(j) {
    var m = /^\[FAITE LE (\d{4}-\d{2}-\d{2})\]\s*([\s\S]*)$/.exec(texte(j && j.notes));
    return m ? { le: m[1], notes: notesPrincipales(m[2]) } : null;
  }
  function noteFaiteLe(le, notes) { return '[FAITE LE ' + le + '] ' + texte(notes); }
  function noteNonRealisee(raison, message) { return '[PAS RÉALISÉE' + (texte(raison) ? ' · ' + texte(raison).replace(/[\[\]]/g, '') : '') + '] ' + texte(message); }
  function estPrevue(j) { return aContenuCoach(j) && !estRepos(j); }
  function estFaite(j) { return !!j && (isNum(j.km) || isNum(j.dureeSec)); }
  // Autre discipline saisie un jour de repos : « [ACTIVITÉ · Vélo] notes » en tête de la note (sans changement du script Google).
  // Sans ce repère, la séance est de la course à pied. Allure : « km » (min/km), « kmh » (km/h), « 100m » (min/100 m) ou rien.
  var ACTIVITES = [
    { code: 'course', nom: 'Course à pied', allure: 'km', chaussures: true },
    { code: 'mn', nom: 'Marche nordique', allure: 'km', chaussures: true },
    { code: 'marche', nom: 'Marche', allure: 'km', chaussures: true },
    { code: 'velo', nom: 'Vélo', allure: 'kmh' },
    { code: 'natation', nom: 'Natation', allure: '100m', sansDplus: true },
    { code: 'renfo', nom: 'Renforcement musculaire', court: 'Renforcement', sansDistance: true, sansDplus: true }
  ];
  function activite(j) {
    var m = /^\[ACTIVITÉ · ([^\]]+)\]\s*([\s\S]*)$/.exec(texte(j && j.notes));
    if (!m) return null;
    var a = ACTIVITES.filter(function (x) { return x.nom.toUpperCase() === m[1].trim().toUpperCase(); })[0] || { code: 'autre', nom: m[1].trim() };
    return { activite: a, notes: notesPrincipales(m[2]) };
  }
  function noteActivite(code, notes) {
    var a = ACTIVITES.filter(function (x) { return x.code === code; })[0];
    return !a || a.code === 'course' ? texte(notes) : '[ACTIVITÉ · ' + a.nom + '] ' + texte(notes);
  }
  // Course à pied : compte dans les km, durées, D+, records et chaussures ; les autres disciplines sont comptées à part
  function estCourse(j) { var a = activite(j); return !a || a.activite.code === 'course'; }

  // Activités en plus de la séance du jour (ex. footing prévu le matin, vélo l'après-midi) : une ligne lisible
  // par activité à la fin de la note, « [+ Vélo · 42,5 km · 1:30:00 · D+ 380 m · FC 131 · RPE 4] note » (sans changement du script Google)
  var RE_EXTRA = /^\[\+ ([^\]]*)\] ?(.*)$/;
  function activiteParNom(nom) { return ACTIVITES.filter(function (x) { return x.nom.toUpperCase() === texte(nom).toUpperCase(); })[0] || { code: 'autre', nom: texte(nom) }; }
  function extras(j) {
    return texte(j && j.notes).split('\n').map(function (l) {
      var m = RE_EXTRA.exec(l.trim()); if (!m) return null;
      var p = m[1].split(' · '), x = { activite: activiteParNom(p[0]), note: m[2] || '' }, v;
      p.slice(1).forEach(function (t) {
        if ((v = /^([\d.,]+) km$/.exec(t))) x.km = parseNumberFR(v[1]);
        else if ((v = /^D\+ (\d+) m$/.exec(t))) x.dplus = Number(v[1]);
        else if ((v = /^FC (\d+)$/.exec(t))) x.fc = Number(v[1]);
        else if ((v = /^RPE ([\d.,]+)$/.exec(t))) x.rpe = parseNumberFR(v[1]);
        else if (/^\d+:\d{2}(:\d{2})?$/.test(t)) x.dureeSec = parseDuree(t);
      });
      return x;
    }).filter(Boolean);
  }
  function ligneExtra(x) {
    var p = [x.activite.nom];
    if (isNum(x.km)) p.push(nombreFR(x.km, 3) + ' km');
    if (isNum(x.dureeSec)) p.push(formatDuree(x.dureeSec));
    if (isNum(x.dplus)) p.push('D+ ' + Math.round(x.dplus) + ' m');
    if (isNum(x.fc)) p.push('FC ' + Math.round(x.fc));
    if (isNum(x.rpe)) p.push('RPE ' + nombreFR(x.rpe, 1));
    return '[+ ' + p.join(' · ').replace(/[\[\]\n]/g, '') + ']' + (texte(x.note) ? ' ' + texte(x.note).replace(/\s+/g, ' ') : '');
  }
  // Profil / terrain de la séance réellement courue (saisi par l'athlète) : ligne « [TERRAIN · Voie verte] » de la note
  var RE_TERRAIN = /^\[TERRAIN · ([^\]]*)\]$/;
  function terrain(j) {
    var l = texte(j && j.notes).split('\n').map(function (x) { return RE_TERRAIN.exec(x.trim()); }).filter(Boolean)[0];
    return l ? texte(l[1]) : '';
  }
  function notesPrincipales(notes) { return texte(String(notes == null ? '' : notes).split('\n').filter(function (l) { return !RE_EXTRA.test(l.trim()) && !RE_TERRAIN.test(l.trim()); }).join('\n')); }
  // Note complète : texte de l'athlète, puis terrain, puis activités en plus
  function avecExtras(notes, liste, ter) {
    var lignes = (texte(ter) ? ['[TERRAIN · ' + texte(ter).replace(/[\[\]\n]/g, '').slice(0, 60) + ']'] : []).concat((liste || []).map(ligneExtra)), n = notesPrincipales(notes);
    return lignes.length ? (n ? n + '\n' : '') + lignes.join('\n') : n;
  }
  // Toutes les séances d'un jour : la saisie principale puis les activités en plus { code, nom, km, dureeSec, dplus, rpe, principale }
  function seancesDuJour(j) {
    var out = [];
    if (!j) return out;
    if (aRetour(j)) { var a = activite(j); out.push({ code: a ? a.activite.code : 'course', nom: a ? a.activite.nom : 'Course à pied', km: j.km, dureeSec: j.dureeSec, dplus: j.dplus, rpe: j.rpe, principale: true }); }
    extras(j).forEach(function (x) { out.push({ code: x.activite.code, nom: x.activite.nom, km: x.km, dureeSec: x.dureeSec, dplus: x.dplus, rpe: x.rpe }); });
    return out;
  }
  // Bilan du « du » au « au » inclus ; « auj » sert à compter les séances prévues déjà passées
  function bilanPeriode(athlete, du, au, auj) {
    var r = { km: 0, dureeSec: 0, dplus: 0, seances: 0, prevues: 0, prevuesADate: 0, prevuesFaites: 0, autres: 0 };
    Object.keys(athlete.jours || {}).forEach(function (d) {
      if (d < du || d > au) return;
      var j = athlete.jours[d], p = estPrevue(j);
      if (p) { r.prevues++; if (!auj || d <= auj) r.prevuesADate++; }
      seancesDuJour(j).forEach(function (x) {
        if (x.code !== 'course') { r.autres++; return; }
        if (!(isNum(x.km) || isNum(x.dureeSec))) return;
        r.seances++;
        if (p && x.principale) r.prevuesFaites++;
        if (isNum(x.km)) r.km += x.km;
        if (isNum(x.dureeSec)) r.dureeSec += x.dureeSec;
        if (isNum(x.dplus)) r.dplus += x.dplus;
      });
    });
    r.km = Math.round(r.km * 1000) / 1000;
    return r;
  }

  /* ---------- Records (calculés uniquement sur les séances saisies) ---------- */
  function records(athlete) {
    // Séances de course à pied : saisie principale et activités « en plus » (deux sorties le même jour comptent chacune)
    var seances = [], out = [], semaines = {};
    Object.keys(athlete.jours || {}).sort().forEach(function (d) {
      var j = athlete.jours[d];
      seancesDuJour(j).forEach(function (x) { if (x.code === 'course') seances.push({ date: d, km: x.km, dureeSec: x.dureeSec, dplus: x.dplus, type: x.principale ? j.type : '' }); });
    });
    function max(cle, libelle, f, format) {
      var best = null;
      seances.forEach(function (s) { var v = f(s); if (isNum(v) && v > 0 && (!best || v > best.v)) best = { v: v, date: s.date }; });
      if (best) out.push({ cle: cle, libelle: libelle, valeur: best.v, texte: format(best.v), date: best.date });
    }
    function allure(cle, libelle, filtre) {
      var best = null;
      seances.forEach(function (s) {
        if (!filtre(s)) return;
        var a = allureMoyenne(s.dureeSec, s.km);
        if (a && (!best || a < best.v)) best = { v: a, date: s.date, km: s.km, s: s };
      });
      if (best) out.push({ cle: cle, libelle: libelle, valeur: best.v, texte: formatAllure(best.v) + ' sur ' + nombreFR(best.km, 2) + ' km', date: best.date, seance: best.s });
    }
    max('distance', 'Plus longue sortie', function (s) { return s.km; }, function (v) { return nombreFR(v, 2) + ' km'; });
    max('duree', 'Plus longue durée', function (s) { return s.dureeSec; }, formatDuree);
    max('dplus', 'Plus gros D+', function (s) { return s.dplus; }, function (v) { return Math.round(v) + ' m'; });
    seances.forEach(function (s) { if (isNum(s.km)) { var l = weekStart(s.date); semaines[l] = (semaines[l] || 0) + s.km; } });
    var bs = null;
    Object.keys(semaines).forEach(function (l) { if (!bs || semaines[l] > bs.v) bs = { v: semaines[l], date: l }; });
    if (bs && bs.v > 0) out.push({ cle: 'semaine', libelle: 'Plus grosse semaine', valeur: bs.v, texte: nombreFR(bs.v, 2) + ' km', date: bs.date });
    allure('compet', 'Meilleure allure en compétition', function (s) { return normCode(s.type) === 'COMP'; });
    allure('allure10', 'Meilleure allure moyenne (séance de 10 km ou plus)', function (s) { return isNum(s.km) && s.km >= 10; });
    allure('allure5', 'Meilleure allure moyenne (séance de 5 km ou plus)', function (s) { return isNum(s.km) && s.km >= 5; });
    // Même séance que le record « 10 km ou plus » : inutile de l'afficher deux fois
    var a10 = out.filter(function (r) { return r.cle === 'allure10'; })[0];
    return out.filter(function (r) { return !(r.cle === 'allure5' && a10 && a10.seance === r.seance); }).map(function (r) { delete r.seance; return r; });
  }

  /* ---------- Suivi entraîneur ---------- */
  function derniereSaisie(athlete, auj) {
    var ds = Object.keys(athlete.jours || {}).filter(function (d) { return (!auj || d <= auj) && aRetour(athlete.jours[d]); }).sort();
    return ds.length ? ds[ds.length - 1] : null;
  }
  // Séances prévues des 14 derniers jours (avant aujourd'hui) restées sans retour depuis la dernière saisie
  function resumeCoach(athlete, auj) {
    var lun = weekStart(auj), b = bilanPeriode(athlete, lun, addDays(lun, 6), auj), der = derniereSaisie(athlete, auj);
    var depuis = addDays(auj, -14), manquees = Object.keys(athlete.jours || {}).filter(function (d) {
      var j = athlete.jours[d];
      return d < auj && d >= depuis && (!der || d > der) && estPrevue(j) && !aRetour(j);
    }).sort();
    var rpe = bilanJours(Object.keys(athlete.jours || {}).filter(function (d) { return d >= lun && d <= addDays(lun, 6); }).map(function (d) { return athlete.jours[d]; })).rpeMoy;
    var nonFaites = Object.keys(athlete.jours || {}).filter(function (d) { return d <= auj && d >= addDays(auj, -7) && nonRealisee(athlete.jours[d]); }).sort().reverse()
      .map(function (d) { var n = nonRealisee(athlete.jours[d]); return { date: d, corps: athlete.jours[d].corps || '', raison: n.raison, message: n.message }; });
    // Séances décalées pas encore faites, prévues dans les 14 derniers jours
    var decalees = Object.keys(athlete.jours || {}).filter(function (d) { return d <= auj && d >= addDays(auj, -14) && decalee(athlete.jours[d]); }).sort().reverse()
      .map(function (d) { var n = decalee(athlete.jours[d]); return { date: d, au: n.au, corps: athlete.jours[d].corps || '', raison: n.raison, message: n.message, enRetard: n.au < auj }; });
    return { semaine: b, rpeMoy: rpe, derniere: der, sansRetour: manquees, alerte: manquees.length >= 2, nonRealisees: nonFaites, decalees: decalees };
  }
  function competitionsAVenir(athletes, auj, nbJours) {
    var fin = addDays(auj, nbJours), out = [];
    (athletes || []).forEach(function (a) {
      Object.keys(a.jours || {}).forEach(function (d) {
        if (d >= auj && d <= fin && normCode(a.jours[d].type) === 'COMP') out.push({ id: a.id, prenom: a.prenom, nom: a.nom, date: d, corps: a.jours[d].corps || '' });
      });
    });
    return out.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
  }

  /* ---------- Lien personnel de l'athlète ---------- */
  var ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 signes, sans 0/O ni 1/I
  // Code secret de 6 signes (32^6 ≈ 1,07 milliard de possibilités) ; « hasard » renvoie des entiers 0..255
  function genererCode(hasard) {
    var o = hasard ? hasard(6) : (function () { var a = new Uint8Array(6); crypto.getRandomValues(a); return a; })(), s = '';
    for (var i = 0; i < 6; i++) s += ALPHABET_CODE[o[i] % 32];
    return s;
  }
  function slugNom(s) {
    return texte(s).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean)
      .map(function (m) { return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase(); }).join('-');
  }
  function lienAthlete(base, a) {
    var nom = [slugNom(a.prenom), slugNom(a.nom)].filter(Boolean).join('-');
    return base.replace(/\/?$/, '/') + 'athlete/#RespirOutdoor-' + (nom ? nom + '-' : '') + a.code;
  }
  // Accepte le lien complet, « RespirOutdoor-Prénom-Nom-CODE » ou le code seul
  function codeDepuisLien(s) {
    var t = texte(s).toUpperCase(), m = /(?:^|[-#\/\s])([A-HJ-NP-Z2-9]{6})\s*$/.exec(t);
    return m ? m[1] : null;
  }

  /* ---------- ZIP et XLSX (lecture seule, sans dépendance ; repris de l'outil de suivi trail) ---------- */
  function zipEntries(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), i, eocd = -1;
    for (i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('fichier XLSX illisible (fin de répertoire introuvable)');
    var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), res = {};
    for (i = 0; i < n; i++) {
      if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('répertoire ZIP corrompu');
      var methode = dv.getUint16(off + 10, true), taille = dv.getUint32(off + 20, true);
      var lnom = dv.getUint16(off + 28, true), lextra = dv.getUint16(off + 30, true), lcom = dv.getUint16(off + 32, true);
      var nom = new TextDecoder('utf-8').decode(bytes.subarray(off + 46, off + 46 + lnom));
      res[nom] = { methode: methode, taille: taille, local: dv.getUint32(off + 42, true) };
      off += 46 + lnom + lextra + lcom;
    }
    return res;
  }
  function zipLire(bytes, e) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), o = e.local;
    if (dv.getUint32(o, true) !== 0x04034b50) return Promise.reject(new Error('entrée ZIP corrompue'));
    var debut = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
    var data = bytes.subarray(debut, debut + e.taille);
    if (e.methode === 0) return Promise.resolve(new TextDecoder('utf-8').decode(data));
    if (e.methode !== 8) return Promise.reject(new Error('compression ZIP non prise en charge'));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('navigateur trop ancien : décompression indisponible'));
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  function xmlDecode(t) {
    return t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
    });
  }
  function xmlAttrs(tag) { var a = {}, re = /([\w:.-]+)\s*=\s*"([^"]*)"/g, m; while ((m = re.exec(tag))) a[m[1]] = xmlDecode(m[2]); return a; }
  function xmlTexte(x) {
    x = x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
    while ((m = re.exec(x))) out += xmlDecode(m[1]);
    return out;
  }
  function colIndex(l) { var n = 0; for (var i = 0; i < l.length; i++) n = n * 26 + (l.charCodeAt(i) - 64); return n - 1; }
  function refCellule(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref); return m ? { c: colIndex(m[1]), r: Number(m[2]) - 1 } : null; }
  function cheminRelatif(base, cible) {
    if (cible[0] === '/') return cible.slice(1);
    var parts = base.split('/'); parts.pop();
    cible.split('/').forEach(function (p) { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); });
    return parts.join('/');
  }
  // { feuilles: [{ nom, lignes: [[valeur…]] }] } ; formules lues par leur dernière valeur calculée
  function lireXLSX(bytes) {
    var ent = zipEntries(bytes);
    function lire(nom) { return ent[nom] ? zipLire(bytes, ent[nom]) : Promise.resolve(null); }
    return Promise.all([lire('xl/workbook.xml'), lire('xl/_rels/workbook.xml.rels'), lire('xl/sharedStrings.xml')]).then(function (t) {
      if (!t[0]) throw new Error('ce fichier n\'est pas un classeur Excel (.xlsx)');
      var rels = {}, m, re = /<Relationship\b[^>]*>/g;
      while ((m = re.exec(t[1] || ''))) { var a = xmlAttrs(m[0]); rels[a.Id] = cheminRelatif('xl/workbook.xml', a.Target); }
      var partages = [];
      re = /<si>([\s\S]*?)<\/si>/g;
      while ((m = re.exec(t[2] || ''))) partages.push(xmlTexte(m[1]));
      var feuilles = [];
      re = /<sheet\b[^>]*>/g;
      while ((m = re.exec(t[0]))) { var at = xmlAttrs(m[0]); feuilles.push({ nom: at.name, chemin: rels[at['r:id']] }); }
      return Promise.all(feuilles.map(function (f) {
        return lire(f.chemin).then(function (x) { var fe = lireFeuille(x || '', partages); fe.nom = f.nom; return fe; });
      })).then(function (fs) { return { feuilles: fs }; });
    });
  }
  function lireFeuille(xml, partages) {
    var f = { lignes: [] }, m, re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    while ((m = re.exec(xml))) {
      var a = xmlAttrs('<c ' + m[1] + '>'), ref = refCellule(a.r || ''), corps = m[2] || '', v = null;
      if (!ref) continue;
      var vm = /<v>([\s\S]*?)<\/v>/.exec(corps);
      if (a.t === 's') v = vm ? partages[Number(vm[1])] : null;
      else if (a.t === 'inlineStr') v = xmlTexte(corps);
      else if (a.t === 'str' || a.t === 'e') v = vm ? xmlDecode(vm[1]) : null;
      else if (a.t === 'b') v = vm ? vm[1] === '1' : null;
      else v = vm ? Number(vm[1]) : null;
      if (v === '' || v == null) continue;
      (f.lignes[ref.r] = f.lignes[ref.r] || [])[ref.c] = v;
    }
    for (var i = 0; i < f.lignes.length; i++) if (!f.lignes[i]) f.lignes[i] = [];
    return f;
  }

  /* ---------- Import du classeur de l'entraîneur (onglets PLAN, LEGENDE, ALLURES, PROTOS) ---------- */
  // Onglet par son nom, sans tenir compte des espaces, majuscules ni accents (« Légende » = « LEGENDE »)
  function nomOnglet(n) { return normCode(n).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  // LEGENDE, ALLURES, PROTOS : à défaut du nom exact, un onglet qui commence par ce nom (« ALLURES FLAVIEN »)
  function feuille(classeur, nom) {
    var fs = classeur.feuilles || [], n = nomOnglet(nom);
    return fs.filter(function (f) { return nomOnglet(f.nom) === n; })[0] ||
      (AUTRES_ONGLETS.indexOf(n) >= 0 ? fs.filter(function (f) { return nomOnglet(f.nom).indexOf(n) === 0; })[0] : null) || null;
  }
  function estAutreOnglet(nom) { var n = nomOnglet(nom); return AUTRES_ONGLETS.some(function (x) { return n.indexOf(x) === 0; }); }
  function cel(f, r, c) { return f && f.lignes[r] ? f.lignes[r][c] : undefined; }
  // Position de la première cellule dont le texte vérifie « re »
  function chercher(f, re, depuis) {
    if (!f) return null;
    for (var r = depuis || 0; r < f.lignes.length; r++) {
      var l = f.lignes[r] || [];
      for (var c = 0; c < l.length; c++) if (typeof l[c] === 'string' && re.test(l[c].trim())) return { r: r, c: c };
    }
    return null;
  }
  function aDroite(f, pos, max) {
    if (!pos) return undefined;
    for (var c = pos.c + 1; c <= pos.c + (max || 4); c++) { var v = cel(f, pos.r, c); if (v !== undefined) return v; }
    return undefined;
  }
  function dateCellule(v) { return isNum(v) ? excelSerialToISO(v) : parseDateFR(texte(v).replace(/^(DU|AU)\s+/i, '')); }
  function dureeCellule(v) {
    if (isNum(v)) return v >= 0 && v < 2 ? Math.round(v * 86400) : null; // fraction de jour Excel
    var d = parseDuree(v);
    return isNum(d) ? d : null;
  }

  function importerPlan(f, rapport) {
    var a = nouvelAthlete({});
    var pNom = chercher(f, /^NOM$/i);
    if (pNom) {
      var vals = [];
      for (var c = pNom.c + 1; c < pNom.c + 8; c++) { var v = cel(f, pNom.r, c); if (v !== undefined) vals.push({ c: c, v: v }); }
      var txt = vals.filter(function (x) { return typeof x.v === 'string'; });
      a.prenom = texte(txt[0] && txt[0].v); a.nom = texte(txt[1] && txt[1].v);
      vals.forEach(function (x) { if (/@/.test(String(x.v))) a.email = texte(x.v); });
      var pNe = chercher(f, /^N[ÉE]\(?E?\)? LE/i);
      if (pNe) { var n = aDroite(f, pNe, 1); if (n !== undefined && !/@/.test(String(n))) a.naissance = dateCellule(n) || texte(n); }
    }
    a.objectif = texte(aDroite(f, chercher(f, /^OBJECTIF\s*:?$/i)));
    var pObj2 = chercher(f, /^OBJECTIF .*!/i);
    if (pObj2) a.objectif2 = texte(cel(f, pObj2.r, pObj2.c));
    var pContrat = chercher(f, /^CONTRAT$/i);
    if (pContrat) {
      var ns = parseInt(texte(cel(f, pContrat.r, pContrat.c + 2)), 10);
      if (ns > 0) a.contratSemaines = ns;
      a.debut = dateCellule(cel(f, pContrat.r, pContrat.c + 3));
      a.fin = dateCellule(cel(f, pContrat.r, pContrat.c + 5));
    }
    var pVma = chercher(f, /^VMA$/i);
    if (pVma) { var vma = cel(f, pVma.r + 1, pVma.c); if (isNum(vma)) a.vma = vma; }
    a.hebdo = texte(aDroite(f, chercher(f, /^HEBDO\s*:?$/i)));
    // Zones : lignes « Z1,1 … ENTRE basse ET haute usage »
    var pZ = chercher(f, /^ZONES D'ALLURES/i);
    if (pZ && isNum(a.vma)) {
      var zones = [];
      for (var r = pZ.r + 1; r < pZ.r + 12; r++) {
        var nom = texte(cel(f, r, pZ.c));
        if (!/^Z\d/i.test(nom)) continue;
        var b = cel(f, r, pZ.c + 3), h = cel(f, r, pZ.c + 5);
        if (!isNum(b) || !isNum(h)) continue;
        zones.push({ nom: nom.replace(',', '.'), bas: Math.round(b / a.vma * 1000) / 10, haut: Math.round(h / a.vma * 1000) / 10, usage: texte(cel(f, r, pZ.c + 6)) });
      }
      if (zones.length) a.zones = zones;
    }
    var pDispo = chercher(f, /^DISPOS$/i);
    if (pDispo) {
      var cles = ['L', 'M1', 'M2', 'J', 'V', 'S', 'D'];
      for (var k = 0; k < 7; k++) a.dispos[cles[k]] = cel(f, pDispo.r + 1 + k, pDispo.c + 1) === true;
    }
    var pCont = chercher(f, /^CONTRAINTES$/i), pTer = chercher(f, /^TERRAINS$/i);
    if (pCont) a.contraintes = texte(cel(f, pCont.r + 1, pCont.c));
    if (pTer) a.terrains = texte(cel(f, pTer.r + 1, pTer.c));

    // Tableau des séances
    var pEnt = chercher(f, /^DATE$/i);
    if (!pEnt) throw new Error('onglet PLAN : ligne d\'en-tête « DATE » introuvable');
    var entetes = f.lignes[pEnt.r] || [], col = {};
    var motifs = { semaine: /^S\.?$/, eveil: /^EVEIL/, educ: /^EDUC/, corps: /^CORPS/, rac: /^RAC/, profil: /^PROFIL/, type: /^TYPE/,
      cycle: /^CYCLE/, spe: /^SPE|^SP$/, consignes: /^CONSIGNE/, km: /^KM$/, dureeSec: /^DUR[EÉ]E/, rpe: /^RPE$/, notes: /^NOTES/ };
    entetes.forEach(function (h, c) {
      var t = texte(h).toUpperCase();
      Object.keys(motifs).forEach(function (k) { if (col[k] === undefined && motifs[k].test(t)) col[k] = c; });
    });
    var verticales = { cycle: [], spe: [] }, ligneDate = {}, n = 0, ignores = 0, hors = [];
    for (var rr = pEnt.r + 1; rr < f.lignes.length; rr++) {
      var l = f.lignes[rr] || [];
      ['cycle', 'spe'].forEach(function (k) { if (col[k] !== undefined && l[col[k]] !== undefined) verticales[k].push({ ligne: rr, valeur: l[col[k]] }); });
      var d = isNum(l[pEnt.c]) ? excelSerialToISO(l[pEnt.c]) : null;
      if (!d || d < '2000-01-01') continue; // case à 1 ou 0 : pas une date de séance
      ligneDate[rr] = d;
      var j = {};
      ['eveil', 'educ', 'corps', 'rac', 'profil', 'type', 'consignes', 'notes'].forEach(function (k) {
        if (col[k] !== undefined && l[col[k]] !== undefined) j[k] = texte(l[col[k]]);
      });
      if (col.km !== undefined) {
        var km = parseNumberFR(l[col.km]);
        if (dansBornes('km', km)) j.km = km; else if (isNum(km)) hors.push(formatDateFR(d) + ' : KM = ' + nombreFR(km, 2)); else if (l[col.km] !== undefined) ignores++;
      }
      if (col.dureeSec !== undefined && l[col.dureeSec] !== undefined) {
        var du = dureeCellule(l[col.dureeSec]);
        if (dansBornes('dureeSec', du)) j.dureeSec = du; else if (isNum(du)) hors.push(formatDateFR(d) + ' : durée = ' + texte(l[col.dureeSec])); else ignores++;
      }
      if (col.rpe !== undefined) { var rp = parseNumberFR(l[col.rpe]); if (isNum(rp) && rp >= 1 && rp <= 10) j.rpe = rp; else if (l[col.rpe] !== undefined) ignores++; }
      j = nettoyerJour(j);
      if (Object.keys(j).length) { a.jours[d] = j; n++; }
    }
    // Rattache chaque libellé vertical aux semaines qu'il couvre
    var lignesDates = Object.keys(ligneDate).map(Number).sort(function (x, y) { return x - y; });
    function dateDeLigne(r) {
      var best = null;
      lignesDates.forEach(function (x) { if (x <= r) best = x; });
      if (best === null && lignesDates.length) best = lignesDates[0];
      return best === null ? null : ligneDate[best];
    }
    if (!a.debut && lignesDates.length) a.debut = weekStart(ligneDate[lignesDates[0]]);
    var toutes = lignesDates.map(function (r) { return ligneDate[r]; }).sort();
    if (toutes.length) { a.planDu = toutes[0]; a.planAu = toutes[toutes.length - 1]; }
    ['cycle', 'spe'].forEach(function (k) {
      regrouperVertical(verticales[k]).forEach(function (p) {
        var d1 = dateDeLigne(p.debut), d2 = dateDeLigne(p.fin);
        if (!d1 || !d2) return;
        for (var s = numSemaine(a.debut, d1); s <= numSemaine(a.debut, d2); s++) {
          var w = a.semaines[s] = a.semaines[s] || {};
          w[k === 'cycle' ? 'cycle' : 'phase'] = p.texte;
        }
      });
    });
    a.id = idAthlete(a);
    rapport.push(n + (n > 1 ? ' jours renseignés importés' : ' jour renseigné importé') + ' depuis l\'onglet ' + texte(f.nom) + (ignores ? ' ; ' + ignores + ' valeur(s) athlète illisible(s) ignorée(s)' : ''));
    if (hors.length) rapport.push('⚠ ' + hors.length + ' valeur' + (hors.length > 1 ? 's' : '') + ' athlète hors limites ignorée' + (hors.length > 1 ? 's' : '') +
      ' (KM de 0 à 400, durée de moins de 48 h). Vérifie ces cellules dans le classeur : ' + hors.slice(0, 6).join(' ; ') + (hors.length > 6 ? ' ; …' : ''));
    return a;
  }

  // Date de test : date Excel (nombre de jours, ex. 46235), date ISO ou texte libre (« 11/24 ») -> texte affichable
  function dateTest(v) {
    var t = texte(v);
    if (isNum(v) || /^\d{5}$/.test(t)) { var n = Number(t); if (n > 20000 && n < 80000) return formatDateFR(excelSerialToISO(n)); }
    if (isValidISODate(t)) return formatDateFR(t);
    return t;
  }
  // Chrono d'une case : durée Excel (fraction de jour), texte « 39:30 » / « 1:28:45 » ou texte libre gardé tel quel
  function texteChrono(v) {
    if (v === undefined || v === null || texte(v) === '') return '';
    if (isNum(v)) return v >= 0 && v < 2 ? formatDuree(Math.round(v * 86400)) : texte(v);
    var d = parseDuree(v); return isNum(d) && /:/.test(texte(v)) ? formatDuree(d) : texte(v);
  }
  // Chrono d'une cellule : durée Excel (fraction de jour), « 1H34'45" », « 1H42 », « 18'42 », « 0:45:45 », « 45:45 » -> secondes
  function chronoCellule(v) {
    if (isNum(v)) return v > 0 && v < 2 ? Math.round(v * 86400) : null;
    var t = texte(v).toUpperCase().replace(/[″”"]/g, '').replace(/[’′‘]/g, "'").replace(/\s+/g, '');
    if (!t) return null;
    var m = t.match(/^(?:(\d+)H)?(?:(\d+)(?:'|MIN|MN))?(?:(\d+)S?)?$/);
    if (m && (m[1] || m[2])) {
      var h = +m[1] || 0, mi = +m[2] || 0, se = +m[3] || 0;
      if (m[1] && !m[2] && m[3] && !/S$/.test(t)) { mi = se; se = 0; } // « 1H42 » = 1 h 42 min
      return mi < 60 && se < 60 && h * 3600 + mi * 60 + se > 0 ? h * 3600 + mi * 60 + se : null;
    }
    if (/:/.test(t)) { var d = parseDuree(t); return isNum(d) && d > 0 ? d : null; }
    return null;
  }
  // Distance d'une ligne du tableau des records : « 5KM », « 10 km », « SEMI », « 1/2 MARATHON », « MARATHON », « 100KM »
  function distanceLigne(t) {
    var n = normCode(t).replace(/-/g, '');
    if (/^5KMS?$/.test(n)) return 'd5'; if (/^10KMS?$/.test(n)) return 'd10';
    if (/^SEMI|^1\/2/.test(n)) return 'semi'; if (/^MARATHON$/.test(n)) return 'marathon'; if (/^100KMS?$/.test(n)) return 'd100';
    return null;
  }
  // Tableau « RECORDS PERSONNELS » de l'onglet ALLURES : une ligne par distance (5KM… 100KM), colonne RECORD puis une colonne par année
  function importerRecordsPerso(f) {
    var p = chercher(f, /^RECORDS PERSONNELS/i); if (!p) return null;
    var ph = chercher(f, /^DISTANCE$/i, p.r); if (!ph || ph.r > p.r + 5) return null;
    var ent = f.lignes[ph.r] || [], cRec = null, cols = [];
    for (var c = ph.c + 1; c < ent.length; c++) {
      if (ent[c] === undefined || texte(ent[c]) === '') continue;
      // En-tête daté (date Excel ou « 1/4/25 ») : colonne d'une course à cette date
      var dEnt = isNum(ent[c]) ? (ent[c] > 20000 && ent[c] < 80000 ? excelSerialToISO(ent[c]) : null) : parseDateFR(texte(ent[c]));
      if (/^RECORD/i.test(texte(ent[c]))) cRec = c; else cols.push({ c: c, nom: dEnt ? formatDateFR(dEnt) : texte(ent[c]), date: dEnt });
    }
    var lignes = [];
    for (var r = ph.r + 1; r < ph.r + 15; r++) {
      var d = texte(cel(f, r, ph.c)); if (!d) break;
      // Colonne « DATE » (date du record) : date Excel affichée en date ; nombre de jours Excel dans une autre colonne : date aussi
      // Record daté -> résultat de la carte Records (date complète obligatoire : « 09/25 » ne suffit pas)
      var cDate = cols.filter(function (x) { return /^DATE/i.test(x.nom); })[0], vd = cDate ? cel(f, r, cDate.c) : undefined;
      var iso = isNum(vd) ? (vd > 20000 && vd < 80000 ? excelSerialToISO(vd) : null) : parseDateFR(texte(vd));
      var dist = distanceLigne(d), sec = cRec === null ? null : chronoCellule(cel(f, r, cRec));
      var res = dist && sec && iso ? { id: 'x' + dist + iso.replace(/-/g, '') + sec, dist: dist, date: iso, s: sec, course: 'Record du classeur' } : null;
      // Colonnes datées (« 1/11/2025 ») : chrono à cette date ; colonnes « ANNEE 2024 » / « 2024 » : meilleur chrono de l'année, jour inconnu
      var parAn = dist ? cols.map(function (x) {
        if (/^DATE/i.test(x.nom)) return null;
        var v = chronoCellule(cel(f, r, x.c)); if (!v) return null;
        if (x.date) return { id: 'x' + dist + x.date.replace(/-/g, '') + v, dist: dist, date: x.date, s: v, course: 'Classeur Excel' };
        var an = (texte(x.nom).match(/(?:^|\D)((?:19|20)\d\d)(?:\D|$)/) || [])[1];
        return an ? { id: 'x' + dist + 'a' + an + v, dist: dist, date: an + '-07-01', annee: +an, s: v, course: 'Meilleur chrono de ' + an + ' (classeur)' } : null;
      }).filter(Boolean) : [];
      lignes.push({ distance: d, res: res, parAn: parAn, record: cRec === null ? '' : texteChrono(cel(f, r, cRec)), annees: cols.map(function (x) {
        var v = cel(f, r, x.c);
        return /^DATE/i.test(x.nom) || (isNum(v) && v > 20000 && v < 80000) ? (v === undefined ? '' : dateTest(v)) : texteChrono(v);
      }) });
    }
    // Colonnes d'années vides retirées ; en-tête « ANNEE » sans année précisée -> « Année 1, 2… »
    var garder = cols.map(function (x, i) { return lignes.some(function (l) { return l.annees[i]; }); });
    var noms = cols.map(function (x, i) { return /^ANN[EÉ]E$/i.test(x.nom) ? 'Année ' + (i + 1) : x.nom; }).filter(function (x, i) { return garder[i]; });
    lignes.forEach(function (l) { l.annees = l.annees.filter(function (x, i) { return garder[i]; }); });
    if (!lignes.some(function (l) { return l.record || l.annees.length; })) return null;
    return { annees: noms, lignes: lignes };
  }
  function importerAllures(f, a, rapport) {
    if (!f) return;
    var rp = importerRecordsPerso(f);
    if (rp) {
      rapport.push('Records personnels : ' + rp.lignes.filter(function (l) { return l.record; }).length + ' distance(s) renseignée(s)' + (rp.annees.length ? ', colonnes ' + rp.annees.join(', ') : ''));
      // Records datés repris dans la carte Records (ajoutés aux résultats saisis dans l'application, sans doublon)
      a.resultats = [];
      rp.lignes.forEach(function (l) {
        if (l.res && resultatValide(l.res)) a.resultats.push(l.res);
        // Même chrono que le record daté (même jour, ou même année pour une colonne ANNEE) : déjà compté
        (l.parAn || []).forEach(function (x) { if (resultatValide(x) && !(l.res && l.res.s === x.s && (x.annee ? l.res.date.slice(0, 4) === String(x.annee) : l.res.date === x.date))) a.resultats.push(x); });
      });
      if (a.resultats.length) rapport.push('Repris dans la carte Records : ' + a.resultats.map(function (x) { return distanceRP(x.dist).court + ' ' + chronoTexte(x.s) + ' ' + quandResultat(x); }).join(', '));
      var sansDate = rp.lignes.filter(function (l) { return l.record && !l.res && distanceLigne(l.distance); }).map(function (l) { return l.distance; });
      if (sansDate.length) rapport.push('⚠ Non repris dans la carte Records (il faut un chrono et une date complète, ex. 12/04/2026) : ' + sansDate.join(', '));
      rp.lignes.forEach(function (l) { delete l.res; delete l.parAn; });
      a.recordsPerso = rp;
    }
    var p = chercher(f, /^TYPE\s*:?$/i);
    if (p) {
      a.test.type = texte(cel(f, p.r, p.c + 1));
      var vma = aDroite(f, { r: p.r, c: p.c + 1 }, 6);
      if (isNum(vma) && !isNum(a.vma)) a.vma = vma;
      if (isNum(vma) && isNum(a.vma) && Math.abs(vma - a.vma) > 1e-9) rapport.push('VMA différente entre PLAN (' + nombreFR(a.vma) + ') et ALLURES (' + nombreFR(vma) + ') : celle du PLAN est gardée');
    }
    var pd = chercher(f, /^DATE\s*:$/i);
    if (pd) a.test.date = dateTest(cel(f, pd.r, pd.c + 1));
    var pe = chercher(f, /VMA ESTIM/i);
    if (pe) a.test.estimee = /^O/i.test(texte(aDroite(f, pe, 3)));
    var ph = chercher(f, /^EVOLUTION DE LA VMA/i);
    if (ph) {
      var hist = [];
      for (var r = ph.r + 2; r < ph.r + 40; r++) {
        var t = cel(f, r, ph.c), d = cel(f, r, ph.c + 1), v = cel(f, r, ph.c + 2);
        if (t === undefined && d === undefined && v === undefined) break;
        if (isNum(v)) hist.push({ test: texte(t), date: dateTest(d), vma: v });
      }
      a.historiqueVMA = hist;
    }
    // « base chrono » de chaque bloc ALLURE SPÉCIFIQUE : chrono = première durée avant le mot « distance » (après, c'est l'allure au kilo) ;
    // distance = nombre après « distance », sinon celle du titre du bloc (« ALLURE SPECIFIQUE 21,1 KM »)
    var from = 0, pc, lus = [];
    while ((pc = chercher(f, /^base\s*chrono\s*:?$/i, from))) {
      var l = f.lignes[pc.r] || [], ch = null, dist = null;
      for (var c = pc.c + 1; c < Math.min(l.length, pc.c + 14); c++) {
        var v = l[c];
        if (/^distance/i.test(texte(v))) { for (var c2 = c + 1; c2 <= c + 4 && dist === null; c2++) if (isNum(l[c2]) && l[c2] > 0) dist = l[c2]; break; }
        if (ch === null && v !== undefined && texte(v) !== '') { var du = isNum(v) ? dureeCellule(v) : (/:/.test(texte(v)) ? parseDuree(v) : null); if (isNum(du) && du > 0) ch = du; }
      }
      for (var rr = pc.r - 1; dist === null && rr >= Math.max(0, pc.r - 12); rr--) (f.lignes[rr] || []).forEach(function (x) {
        var m = dist === null && typeof x === 'string' && /ALLURE\s+SP[EÉ]CIFIQUE.*?(\d+(?:[.,]\d+)?)\s*KM/i.exec(x); if (m) dist = parseNumberFR(m[1]);
      });
      var cle = !isNum(dist) ? null : Math.abs(dist - 10) <= 0.5 ? 'chrono10' : Math.abs(dist - 21.1) <= 0.5 ? 'chronoSemi' : Math.abs(dist - 42.195) <= 0.6 ? 'chronoMarathon' : Math.abs(dist - 100) <= 1 ? 'chrono100' : null;
      if (cle) { a.allures[cle] = ch; if (ch) lus.push({ chrono10: '10 km', chronoSemi: 'semi', chronoMarathon: 'marathon', chrono100: '100 km' }[cle] + ' ' + formatDuree(ch)); }
      from = pc.r + 1;
    }
    if (lus.length) rapport.push('Base de travail à allure spécifique : ' + lus.join(', '));
    var pf = chercher(f, /^ESTIMATION PRE-FAT/i);
    if (pf) { var pct = aDroite(f, pf, 3); if (isNum(pct)) a.allures.preFatPct = pct; }
  }

  // Famille écrite en toutes lettres dans la colonne H de la légende (DIVERS, RENFO, RESP., MARCHE NORDIQUE…) ;
  // les lettres écrites une par ligne (A-E-R-O-B-I-E) sont ignorées : la famille vient alors des codes connus
  var NOMS_FAMILLES = [[/^AERO/, 'Aérobie'], [/^RECUP/, 'Récupérations'], [/^VMA/, 'VMA'], [/^FART/, 'Fartlek'], [/^COTE/, 'Côtes'],
    [/^(SPE|ALL)/, 'Spécifique / allures'], [/^DIVERS/, 'Divers'], [/^RENFO/, 'Renfo'], [/^RESP/, 'Respiration'], [/^COMP/, 'Compétition']];
  function libelleFamille(v) {
    var t = texte(v).replace(/\.+$/, ''), k = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (t.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 2) return '';
    for (var i = 0; i < NOMS_FAMILLES.length; i++) if (NOMS_FAMILLES[i][0].test(k)) return NOMS_FAMILLES[i][1];
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }
  function importerLegende(f) {
    if (!f) return null;
    var lg = { principes: [], colonnes: [], profils: [], types: [] }, section = null, dernier = null, fam = '';
    for (var r = 0; r < f.lignes.length; r++) {
      var l = f.lignes[r] || [], A = texte(l[0]), C = texte(l[2]), H = libelleFamille(l[7]);
      if (H) fam = H; else if (!A && !C) fam = '';
      if (/^\d\.\s/.test(A)) { lg.principes.push(A.replace(/^\d\.\s*/, '')); continue; }
      if (/^COLONNES DU TABLEAU/i.test(A)) { section = 'colonnes'; dernier = null; continue; }
      if (/^LEGENDE COLONNE PROFIL/i.test(A)) { section = 'profils'; dernier = null; continue; }
      if (/^LEGENDE COLONNE TYPE/i.test(A)) { section = 'types'; dernier = null; continue; }
      if (!section) continue;
      if (A) { dernier = { code: A, desc: C }; if (section === 'types' && fam) dernier.famille = fam; lg[section].push(dernier); }
      else if (C && dernier) dernier.desc += ' — ' + C;
      if (!A && !C) dernier = null;
    }
    return lg;
  }

  // Onglet des protocoles : « PROTOS », « PROTOCOLES » ou « PROTOCOLE »
  function feuilleProtos(classeur) { return feuille(classeur, 'PROTOS') || feuille(classeur, 'PROTOCOLES') || feuille(classeur, 'PROTOCOLE'); }
  // Code en colonne A : 1 à 3 lettres puis un numéro, éventuellement suivi de lettres (PC5, PC 12, PF1C, PV2…) ;
  // un titre peut suivre après un tiret ou deux-points. Tableau dans les colonnes suivantes (12 au plus).
  // Une ligne vide ne coupe pas un protocole ; 2 lignes vides de suite le terminent (encadré « CALCUL » sous PC11…).
  var RE_CODE_PROTO = /^([A-Z]{1,3})\s*(\d{1,3})([A-Z]{0,3})(?:$|\s*[-–:·]\s*(.+)$)/i;
  function importerProtos(f) {
    if (!f) return [];
    var res = [], cur = null, vides = 0;
    for (var r = 0; r < f.lignes.length; r++) {
      var l = f.lignes[r] || [], A = texte(l[0]), m = RE_CODE_PROTO.exec(A);
      var cellules = []; for (var c = 1; c <= 12; c++) cellules.push(texte(l[c]));
      var vide = !A && cellules.every(function (x) { return !x; });
      if (m) { cur = { code: (m[1] + m[2] + m[3]).toUpperCase(), titre: [], grille: [] }; res.push(cur); vides = 0; if (m[4]) cur.titre.push(texte(m[4])); }
      else if (vide) { if (++vides >= 2) cur = null; continue; }
      else if (!cur) continue;
      else { vides = 0; if (A) cur.titre.push(A); }
      while (cellules.length && !cellules[cellules.length - 1]) cellules.pop();
      if (cellules.length) cur.grille.push(cellules);
    }
    return res.map(function (p) { return { id: p.code, code: p.code, titre: p.titre.join(' '), grille: p.grille, notes: '' }; });
  }
  // Classeur « bibliothèque de protocoles » (sans onglet de plan) : tous les onglets sont lus ; les codes qui sont des types
  // de séance de la légende (SPE10…) ou des zones d'allure (Z2…) ne sont pas des protocoles. Renvoie { protos, rapport }
  function importerBibliotheque(classeur, legende) {
    var types = {}, protos = [], vus = {}, rapport = [];
    // Onglet LEGENDE éventuel (classeur de légende seule, ou légende + protocoles)
    var lg = importerLegende(feuille(classeur, 'LEGENDE'));
    if (lg && !lg.types.length && !lg.profils.length) lg = null;
    if (lg) rapport.push('Onglet « LEGENDE » : ' + lg.types.length + ' types, ' + lg.profils.length + ' profils, ' + lg.colonnes.length + ' colonnes');
    ((legende && legende.types) || []).concat(lg ? lg.types : []).forEach(function (t) { types[normCode(t.code)] = 1; });
    (classeur.feuilles || []).forEach(function (f) {
      if (['LEGENDE', 'ALLURES'].indexOf(nomOnglet(f.nom)) >= 0) return;
      var lus = importerProtos(f).filter(function (p) { return !types[normCode(p.code)] && !/^Z\d/.test(p.code) && !vus[p.code]; });
      lus.forEach(function (p) { vus[p.code] = 1; p.famille = texte(f.nom); protos.push(p); }); // famille = onglet d'origine (COTE, FARTLEK…)
      if (lus.length) rapport.push('Onglet « ' + texte(f.nom) + ' » : ' + lus.map(function (p) { return p.code; }).join(', '));
    });
    return { protos: protos, legende: lg, rapport: rapport };
  }
  // Légende commune : complétée et mise à jour par code (types, profils, colonnes), principes remplacés s'il y en a ;
  // un ancien classeur d'athlète ne peut plus ramener une légende périmée en effaçant des codes. Renvoie { legende, ajoutes, modifies }
  function fusionnerLegende(ancienne, nouvelle, ajoutSeul) {
    var res = clone(ancienne || { principes: [], colonnes: [], profils: [], types: [] }), ajoutes = 0, modifies = 0;
    if (!nouvelle) return { legende: res, ajoutes: 0, modifies: 0 };
    ['colonnes', 'profils', 'types'].forEach(function (k) {
      res[k] = res[k] || [];
      (nouvelle[k] || []).forEach(function (e) {
        var i = -1; res[k].forEach(function (x, n) { if (normCode(x.code) === normCode(e.code)) i = n; });
        if (i < 0) { res[k].push(clone(e)); ajoutes++; }
        else if (ajoutSeul) return;
        else if (res[k][i].desc !== e.desc || res[k][i].famille !== (e.famille || res[k][i].famille)) { res[k][i] = Object.assign({}, res[k][i], clone(e)); modifies++; }
      });
    });
    if ((nouvelle.principes || []).length && (!ajoutSeul || !(res.principes || []).length)) res.principes = clone(nouvelle.principes);
    return { legende: res, ajoutes: ajoutes, modifies: modifies };
  }
  // Fichier de référence (PROTOCOLES) : codes présents dans l'application mais plus dans le fichier.
  // Une section vide dans le fichier (pas de colonnes, pas de protocoles…) n'est pas comparée.
  function codesAbsents(actuels, fichier) {
    if (!(fichier || []).length) return [];
    var dans = {}; fichier.forEach(function (x) { dans[normCode(x.code)] = 1; });
    return (actuels || []).filter(function (x) { return !dans[normCode(x.code)]; }).map(function (x) { return x.code; });
  }
  function absentsLegende(actuelle, fichier) {
    var r = {}; ['types', 'profils', 'colonnes'].forEach(function (k) { r[k] = codesAbsents((actuelle || {})[k], (fichier || {})[k]); }); return r;
  }
  function retirerLegende(lg, absents) {
    var res = clone(lg);
    ['types', 'profils', 'colonnes'].forEach(function (k) {
      var a = {}; (absents[k] || []).forEach(function (c) { a[normCode(c)] = 1; });
      res[k] = (res[k] || []).filter(function (x) { return !a[normCode(x.code)]; });
    });
    return res;
  }
  // Bibliothèque commune à tous les athlètes : un import ajoute les nouveaux codes et met à jour les codes existants,
  // sans retirer les protocoles absents du classeur importé (ils peuvent servir à d'autres athlètes)
  // ajoutSeul (classeur d'athlète) : seuls les codes absents sont ajoutés, le fichier PROTOCOLES reste la référence
  function fusionnerProtos(anciens, nouveaux, ajoutSeul) {
    var liste = clone(anciens || []), ajoutes = [], modifies = [], inchanges = 0;
    (nouveaux || []).forEach(function (p) {
      var i = -1; liste.forEach(function (x, k) { if (normCode(x.code) === normCode(p.code)) i = k; });
      if (i < 0) { liste.push(clone(p)); ajoutes.push(p.code); return; }
      if (ajoutSeul) { inchanges++; return; }
      var avant = liste[i], n = Object.assign({}, clone(p), { notes: avant.notes || p.notes || '', famille: p.famille || avant.famille || '' });
      if (!n.famille) delete n.famille;
      if (JSON.stringify([avant.titre, avant.grille]) === JSON.stringify([n.titre, n.grille])) inchanges++; else { liste[i] = n; modifies.push(p.code); }
    });
    return { liste: liste, ajoutes: ajoutes, modifies: modifies, inchanges: inchanges, conserves: liste.length - (nouveaux || []).length };
  }
  // Protocoles de deux appareils : ceux d'ici d'abord (ils gagnent pour un même code), puis ceux du service absents d'ici,
  // sauf ceux supprimés ici (codes normalisés dans « supprimes »)
  function reunirProtos(ici, service, supprimes) {
    var vus = {}, sup = {}, out = [];
    (supprimes || []).forEach(function (c) { sup[normCode(c)] = 1; });
    (ici || []).forEach(function (p) { vus[normCode(p.code)] = 1; out.push(p); });
    (service || []).forEach(function (p) { var k = normCode(p.code); if (!vus[k] && !sup[k]) { vus[k] = 1; out.push(p); } });
    return out;
  }
  // Un protocole est prévu un jour si son code apparaît dans la séance (corps ou consignes) :
  // espaces et points tolérés (« PC 12 » = « PC12 »), PC1 ne correspond pas à PC11, tout caractère du code est accepté sans erreur
  function protoPrevu(j, code) {
    var k = normCode(code); if (!k) return false;
    var t = (texte(j && j.corps) + ' ' + texte(j && j.consignes)).toUpperCase();
    try {
      var motif = k.split('').map(function (ch) { return ch.replace(/[\\^$.*+?()[\]{}|\/-]/g, '\\$&'); }).join('[\\s.]*');
      var fin = /[0-9]$/.test(k) ? '(?![0-9])' : /[A-Z]$/.test(k) ? '(?![A-Z0-9])' : '';
      return new RegExp('(^|[^A-Z0-9])' + motif + fin).test(t);
    } catch (e) { return t.replace(/[\s.]/g, '').indexOf(k) >= 0; }
  }


  // Onglets qui ressemblent à un plan (en-tête « DATE » avec des lignes datées), dans l'ordre du classeur :
  // [{ nom, du, au, seances }] ; un onglet par contrat ou par objectif, quel que soit son nom
  var AUTRES_ONGLETS = ['LEGENDE', 'ALLURES', 'PROTOS', 'PROTOCOLES', 'PROTOCOLE'];
  function ongletsPlan(classeur) {
    return (classeur.feuilles || []).map(function (f) {
      if (estAutreOnglet(f.nom)) return null;
      if (!chercher(f, /^DATE$/i)) return null;
      // Même lecture que l'import : période des lignes datées, jours avec une séance ou une saisie
      var a; try { a = importerPlan(f, []); } catch (e) { return null; }
      if (!a.planDu) return null;
      return { nom: f.nom, du: a.planDu, au: a.planAu, seances: Object.keys(a.jours).length };
    }).filter(Boolean);
  }
  // Onglet proposé par défaut : celui nommé « PLAN », sinon celui dont la période est la plus récente
  function ongletParDefaut(onglets) {
    var plan = onglets.filter(function (o) { return normCode(o.nom) === 'PLAN'; })[0];
    return plan || onglets.slice().sort(function (x, y) { return x.du < y.du ? 1 : -1; })[0] || null;
  }
  // Renvoie { athlete, legende, protos, rapport: [texte…] } ; ongletChoisi : onglet du plan à importer (par défaut « PLAN »)
  function importerClasseur(classeur, ongletChoisi) {
    var rapport = [];
    var fPlan = feuille(classeur, ongletChoisi || 'PLAN');
    if (!fPlan && !ongletChoisi) { var o = ongletParDefaut(ongletsPlan(classeur)); if (o) fPlan = feuille(classeur, o.nom); }
    if (!fPlan) throw new Error('onglet ' + (ongletChoisi || 'PLAN') + ' introuvable : ce classeur ne suit pas le modèle de l\'entraîneur');
    if (normCode(fPlan.nom) !== 'PLAN') rapport.push('Plan lu dans l\'onglet « ' + texte(fPlan.nom) + ' »');
    var a = importerPlan(fPlan, rapport);
    if (!texte(a.prenom) && !texte(a.nom) && !Object.keys(a.jours).length)
      throw new Error('l\'onglet « ' + texte(fPlan.nom) + ' » n\'est pas un plan (ni nom d\'athlète ni séance). Onglets du classeur : ' + (classeur.feuilles || []).map(function (f) { return texte(f.nom); }).join(', ') +
        '. L\'onglet du plan doit contenir le nom de l\'athlète (NOM), la ligne CONTRAT et le tableau des séances (DATE, CORPS DE SÉANCE…)');
    if (a.planDu) rapport.push('Période de l\'onglet : du ' + formatDateFR(a.planDu) + ' au ' + formatDateFR(a.planAu));
    // Ligne CONTRAT pas mise à jour (onglet copié d'un ancien contrat) : la numérotation des semaines serait fausse
    if (a.planDu && ((a.fin && a.planDu > a.fin) || (a.debut && a.planAu < weekStart(a.debut))))
      rapport.push('⚠ Ces dates sont en dehors du contrat indiqué en haut de l\'onglet (du ' + formatDateFR(a.debut) + (a.fin ? ' au ' + formatDateFR(a.fin) : '') + '). Mets à jour la ligne CONTRAT puis réimporte : la numérotation des semaines en dépend.');
    importerAllures(feuille(classeur, 'ALLURES'), a, rapport);
    var lg = importerLegende(feuille(classeur, 'LEGENDE'));
    var fPr = feuilleProtos(classeur), pr = importerProtos(fPr);
    if (lg) rapport.push('Légende : ' + lg.types.length + ' types, ' + lg.profils.length + ' profils');
    if (fPr && !pr.length) rapport.push('⚠ Onglet « ' + texte(fPr.nom) + ' » : aucun protocole reconnu. Chaque protocole doit commencer par son code en colonne A (ex. PC12, PF1C, PV2).');
    ['LEGENDE', 'ALLURES'].forEach(function (n) { var f = feuille(classeur, n); if (!f) rapport.push('Onglet ' + n + ' absent'); else if (nomOnglet(f.nom) !== n) rapport.push((n === 'ALLURES' ? 'Allures lues' : 'Légende lue') + ' dans l\'onglet « ' + texte(f.nom) + ' »'); });
    if (!fPr) rapport.push('Onglet PROTOS absent : protocoles inchangés');
    return { athlete: a, legende: lg, protos: pr, rapport: rapport };
  }

  /* ---------- CSV ---------- */
  function champCSV(v) { var s = v == null ? '' : String(v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function versCSV(lignes) { return lignes.map(function (l) { return l.map(champCSV).join(';'); }).join('\r\n'); }

  /* ---------- Autotests (valeurs de référence calculées à la main) ---------- */
  function near(a, b, eps) { return isNum(a) && Math.abs(a - b) <= (eps || 1e-9); }
  var TESTS = [
    ['Records du classeur : colonnes datées (1/11/2025, « 1/4/25 », 1/11/18) reprises à leur date', function () {
      var f = { nom: 'ALLURES', lignes: [['RECORDS PERSONNELS'], ['Distance', 'RECORD', 'DATE', 45962, '1/4/25', 'ANNEE'], ['10KM', '31\'59"', '1/11/25', '32\'12"', '32\'00"', ''], ['MARATHON', '2H31\'50"', '1/10/2026', '', '', '']] };
      var a = { test: {}, allures: {} }; importerAllures(f, a, []);
      var l = resultatsDistance(a, 'd10');
      return excelSerialToISO(45962) === '2025-11-01' && l.length === 3 && l[0].date === '2025-04-01' && l[0].s === 1920 && l.filter(function (x) { return x.date === '2025-11-01'; }).length === 2 &&
        resultatsDistance(a, 'marathon').length === 1 && a.recordsPerso.annees.indexOf('01/11/2025') >= 0;
    }],
    ['Chronos de base : valeur avant « distance », distance 21,0975 ou titre du bloc, 100 km', function () {
      var f = { nom: 'ALLURES', lignes: [['ALLURE SPECIFIQUE 10 KM'], ['base chrono', '', 2220 / 86400, 'distance', 10, 222 / 86400], ['ALLURE SPECIFIQUE 21,1 KM'], ['base chrono', '', '', 4965 / 86400, '', 'distance', 21.0975],
        ['ALLURE SPECIFIQUE 42,195 KM'], ['base chrono', '', '', 'distance', '', 42.195, 255 / 86400], ['ALLURE SPECIFIQUE 100 KM'], ['', 'base chrono', '', 33600 / 86400, '', 'distance', '', 100]] };
      var a = { test: {}, allures: {} }, rap = []; importerAllures(f, a, rap);
      return a.allures.chrono10 === 2220 && a.allures.chronoSemi === 4965 && a.allures.chronoMarathon === null && a.allures.chrono100 === 33600 && /100 km 9:20:00/.test(rap.join(' '));
    }],
    ['Records du classeur : record daté + colonne ANNEE 2024 (1H42) -> 2 résultats ; « 2024 » affiché, jamais une date inventée', function () {
      var f = { nom: 'ALLURES', lignes: [['RECORDS PERSONNELS'], ['Distance', 'RECORD', 'DATE', 'ANNEE 2024', 'ANNEE 2026'], ['5KM'], ['SEMI', '1H34\'45"', 46320, '1H42', '1H34\'45"']] };
      var a = { test: {}, allures: {} }, rap = []; importerAllures(f, a, rap);
      var an = a.resultats.filter(function (x) { return x.annee; })[0], l = resultatsDistance(a, 'semi');
      return a.resultats.length === 2 && an.annee === 2024 && an.s === 6120 && an.date === '2024-07-01' && dateResultat(an) === '2024' && quandResultat(an) === 'en 2024' &&
        quandResultat(l[1]) === 'le 25/10/2026' && l[0].rec && l[1].rec && !a.recordsPerso.lignes[1].parAn && resultatValide(an) && !resultatValide({ dist: 'semi', date: '2024-05-01', annee: 2024, s: 6120 });
    }],
    ['Chrono de cellule : 1H34\'45" = 5685 s ; 1H42 = 6120 s ; 18\'42 = 1122 s ; 0:45:45 = 2745 s ; 0,0266 j = 2298 s', function () {
      return chronoCellule('1H34\'45"') === 5685 && chronoCellule('1H42') === 6120 && chronoCellule('18\'42') === 1122 && chronoCellule('0:45:45') === 2745 && chronoCellule(0.0266) === 2298 && chronoCellule('abc') === null && chronoCellule('1H75') === null;
    }],
    ['Import Excel des records : ajoutés aux résultats saisis, sans doublon', function () {
      var local = { id: 'X', jours: {}, resultats: [{ id: 'r1', dist: 'd10', date: '2026-04-12', s: 2300 }] };
      var recu = { id: 'X', jours: {}, resultats: [{ id: 'x1', dist: 'd10', date: '2026-04-12', s: 2300 }, { id: 'x2', dist: 'semi', date: '2026-10-25', s: 5685 }] };
      local.resultats.push({ id: 'xd5a20241200', dist: 'd5', date: '2024-07-01', annee: 2024, s: 1200 }); // ancien chrono du classeur, retiré depuis du fichier
      var r = fusionner(local, recu, 'excel');
      return r.resultats.length === 2 && r.resultats[0].id === 'r1' && r.resultats[1].dist === 'semi' && distanceLigne('1/2 MARATHON') === 'semi' && distanceLigne('100 KM') === 'd100' && distanceLigne('10KM') === 'd10';
    }],
    ['Onglets : « ALLURES FLAVIEN » lu comme ALLURES, jamais comme plan ; « Légende » = LEGENDE', function () {
      var cl = { feuilles: [{ nom: 'ALLURES FLAVIEN', lignes: [['TEST', 'DATE'], ['1/2 COOP', 1], ['1/2 COOP', 46320]] }, { nom: 'Légende', lignes: [] }, { nom: 'PLANNING', lignes: [] }] };
      return feuille(cl, 'ALLURES').nom === 'ALLURES FLAVIEN' && feuille(cl, 'LEGENDE').nom === 'Légende' && feuille(cl, 'PLAN') === null && ongletsPlan(cl).length === 0 && estAutreOnglet('Protos 2026') && !estAutreOnglet('PLAN FLAVIEN');
    }],
    ['Import : onglet sans nom ni séance refusé (pas d\'« Athlète sans nom »)', function () {
      var cl = { feuilles: [{ nom: 'DIVERS', lignes: [['DATE', 'CORPS'], [1, ''], [46320, '']] }] };
      try { importerClasseur(cl, 'DIVERS'); return false; } catch (e) { return /n'est pas un plan/.test(e.message) && /DIVERS/.test(e.message); }
    }],
    ['Résultats : record du moment, ancien RP, synthèse par distance', function () {
      var a = { resultats: [{ dist: 'd10', date: '2025-11-11', s: 2335 }, { dist: 'd10', date: '2024-03-17', s: 2530 }, { dist: 'd10', date: '2025-06-15', s: 2600 }, { dist: 'd10', date: '2026-04-12', s: 2300 }, { dist: 'd10', date: '2026-13-01', s: 2000 }, { dist: 'd100', date: '2026-06-01', s: 35100 }] };
      var l = resultatsDistance(a, 'd10'), syn = syntheseRP(a), d10 = syn[1];
      return l.length === 4 && l.map(function (r) { return r.rec ? 1 : 0; }).join('') === '1011' && l[2].best === 2335 &&
        d10.rp.s === 2300 && d10.prec.s === 2335 && d10.premier.s === 2530 && syn[0].rp === null && syn[4].rp.s === 35100 && syn[4].prec === null;
    }],
    ['Chrono : 38:20, 1:26:03, 9:45:00 ; résultats invalides écartés', function () {
      var a = { jours: {}, resultats: [{ dist: 'd5', date: '2026-05-10', s: 1122 }, { dist: 'd42', date: '2026-05-10', s: 1122 }, { dist: 'd5', date: '2026-05-10', s: 0 }, { dist: 'semi', date: '2026-03-29', s: 200000 }] };
      var ret = corrigerAthlete(a);
      return chronoTexte(2300) === '38:20' && chronoTexte(5163) === '1:26:03' && chronoTexte(35100) === '9:45:00' && chronoTexte(35) === '0:35' && a.resultats.length === 1 && ret.length === 3;
    }],
    ['Semaine du contrat : début 13/01/2025, lundi 03/08/2026 = S82', function () { return numSemaine('2025-01-13', '2026-08-03') === 82; }],
    ['Semaine du contrat : dimanche 02/08/2026 = S81 ; lundi 12/10/2026 = S92', function () { return numSemaine('2025-01-13', '2026-08-02') === 81 && numSemaine('2025-01-13', '2026-10-12') === 92; }],
    ['Lundi de la S156 = 03/01/2028 (dernière semaine du contrat de 156 semaines)', function () { return lundiSemaine('2025-01-13', 156) === '2028-01-03'; }],
    ['Excel : série 46236 = 02/08/2026 ; 45670 = 13/01/2025 ; 61 = 01/03/1900', function () { return excelSerialToISO(46236) === '2026-08-02' && excelSerialToISO(45670) === '2025-01-13' && excelSerialToISO(61) === '1900-03-01'; }],
    ['Date « 13/01/25 » -> 2025-01-13 ; 31/02/2026 refusée', function () { return parseDateFR('13/01/25') === '2025-01-13' && parseDateFR('31/02/2026') === null; }],
    ['Durée Excel 0:45:51 (fraction 0,031840278) = 2751 s', function () { return dureeCellule(2751 / 86400) === 2751; }],
    ['Durée saisie : "1:15:45" = 4545 s ; "45:07" = 2707 s ; "1h15" = 4500 s ; "50" = 3000 s ; "1:75" refusé', function () {
      return parseDuree('1:15:45') === 4545 && parseDuree('45:07') === 2707 && parseDuree('1h15') === 4500 && parseDuree('50') === 3000 && isNaN(parseDuree('1:75'));
    }],
    ['Zone Z1.3 (68–72 %) à VMA 19,6 : 13,328–14,112 km/h, 4:30–4:15 /km', function () {
      var v = zoneVitesses(19.6, { bas: 68, haut: 72 });
      return near(v.bas, 13.328, 1e-9) && near(v.haut, 14.112, 1e-9) && formatAllure(v.allureLente) === '4:30 /km' && formatAllure(v.allureRapide) === '4:15 /km';
    }],
    ['Onglet ALLURES : 800 m à 95 % de 19,6 = 154,67 s -> « 2:35 »', function () { var s = tempsDistancePct(800, 19.6, 95); return near(s, 154.6724, 1e-3) && formatTemps(s) === '2:35'; }],
    ['Onglet ALLURES : 200 m à 100 % = 36,7 s ; 100 m à 120 % = 15,3 s ; 500 m à 95 % = 96,7 s', function () {
      return formatTemps(tempsDistancePct(200, 19.6, 100)) === '36,7 s' && formatTemps(tempsDistancePct(100, 19.6, 120)) === '15,3 s' && formatTemps(tempsDistancePct(500, 19.6, 95)) === '96,7 s';
    }],
    ['30"-30" à VMA 19,6 : 171,5 m à 105 %, 166,6 m à 102 %, 163,3 m à 100 %', function () {
      return near(distanceTempsPct(30, 19.6, 105), 171.5, 1e-9) && near(distanceTempsPct(30, 19.6, 102), 166.6, 1e-9) && near(distanceTempsPct(30, 19.6, 100), 163.3333, 1e-3);
    }],
    ['Spé 10 km : 37:00 -> 3:42 /km, 16,216 km/h', function () { var a = allureChrono(2220, 10); return formatAllure(a.allure) === '3:42 /km' && near(a.vitesse, 16.2162, 1e-3); }],
    ['Spé semi : 1:22:45 sur 21,1 km -> 235,3 s/km (3:55 /km), 15,30 km/h', function () { var a = allureChrono(4965, 21.1); return formatAllure(a.allure) === '3:55 /km' && near(a.vitesse, 15.2991, 1e-3); }],
    ['Pré-fatigue 75 % de 19,6 = 14,7 km/h -> 1000 m en 244,9 s (4:05)', function () { return near(vitessePct(19.6, 75), 14.7, 1e-9) && formatTemps(tempsDistancePct(1000, 19.6, 75)) === '4:05'; }],
    ['Sans VMA : rien n\'est calculé', function () { return tempsDistancePct(400, null, 100) === null && zoneVitesses(null, { bas: 60, haut: 70 }) === null; }],
    ['Repères : « 5x800M 95% VMA RMT2-3\' » -> 800 m à 95 % = 2:35', function () {
      var r = reperesSeance({ corps: "5x800M 95% VMA RMT2-3'" }, { vma: 19.6 });
      return r.length === 1 && r[0].libelle === '800 m à 95 %' && r[0].detail.indexOf('2:35') === 0;
    }],
    ['Repères : « 15MN Z1.3 » -> zone Z1.3 ; « 4x1500M Z4 » -> Z4 seulement (pas de % écrit)', function () {
      var a = reperesSeance({ corps: '15MN Z1.3' }, { vma: 19.6 }), b = reperesSeance({ corps: "4x1500M Z4 RT2'" }, { vma: 19.6 });
      return a.length === 1 && a[0].libelle === 'Z1.3' && b.length === 1 && b[0].libelle === 'Z4';
    }],
    ['Repères : « 4x1500M SPE10 » avec chrono 37:00 -> 3:42 /km ; sans chrono -> rien', function () {
      var a = reperesSeance({ corps: "4x1500M SPE10 RMT2-3'" }, { vma: 19.6, allures: { chrono10: 2220 } });
      var b = reperesSeance({ corps: "4x1500M SPE10 RMT2-3'" }, { vma: 19.6, allures: {} });
      return a.length === 1 && a[0].detail.indexOf('3:42 /km') === 0 && b.length === 0;
    }],
    ['Légende : « VMAC » trouve « VMA C » ; « EF+ » trouve « EF » (variante) ; « COMP » absent', function () {
      var l = [{ code: 'VMA C' }, { code: 'EF' }];
      return chercherCode(l, 'VMAC').entree.code === 'VMA C' && chercherCode(l, 'EF+').variante === true && chercherCode(l, 'COMP') === null;
    }],
    ['Bilan semaine : 14,92 + 9,82 + 14,05 km = 38,79 km ; RPE (2 + 8 + 2) / 3 = 4 ; REPOS non compté', function () {
      var b = bilanJours([{ corps: 'REPOS' }, { corps: 'A', km: 14.92, dureeSec: 4545, rpe: 2 }, { corps: 'B', km: 9.82, dureeSec: 2707, rpe: 8 }, { corps: 'C', km: 14.05, dureeSec: 4223, rpe: 2 }]);
      return near(b.km, 38.79, 1e-9) && near(b.rpeMoy, 4) && b.dureeSec === 11475 && b.prevues === 3 && b.faites === 3;
    }],
    ['Bilan sans RPE -> RPE moyen non calculé (pas 0)', function () { return bilanJours([{ km: 10 }]).rpeMoy === null; }],
    ['Lettres verticales : R,E,M,I,S,E / vide / E,N / vide / C,H,A,R,G,E -> « REMISE EN CHARGE »', function () {
      var c = [], mot = function (s, l0) { s.split('').forEach(function (x, i) { c.push({ ligne: l0 + i, valeur: x }); }); };
      mot('REMISE', 20); mot('EN', 27); mot('CHARGE', 30); mot('ASSIMIL', 49);
      var p = regrouperVertical(c);
      return p.length === 2 && p[0].texte === 'REMISE EN CHARGE' && p[0].debut === 20 && p[0].fin === 35 && p[1].texte === 'ASSIMIL';
    }],
    ['Fusion « excel » : nouveau plan du classeur ; km, réaction, code et mot du coach conservés ; jour vide complété', function () {
      var loc = { code: 'ABC234', motCoach: 'Go', jours: { '2026-10-13': { corps: 'ancien', reaction: '👍', km: 10, majA: '2026-10-13T20:00:00Z' }, '2026-10-14': { corps: 'retiré' } } };
      var recu = { code: '', objectif: 'Cross', jours: { '2026-10-13': { corps: 'nouveau', km: 99 }, '2026-10-15': { corps: 'EF', km: 8 } } };
      var r = fusionner(loc, recu, 'excel'), j = r.jours['2026-10-13'];
      return r.code === 'ABC234' && r.motCoach === 'Go' && r.objectif === 'Cross' && j.corps === 'nouveau' && j.km === 10 && j.reaction === '👍' &&
        !r.jours['2026-10-14'] && r.jours['2026-10-15'].km === 8;
    }],
    ['Fusion « excel », nouveau contrat : l\'ancien plan est gardé hors de la période importée, le contrat précédent est archivé', function () {
      var loc = { id: 'X', debut: '2025-01-13', fin: '2026-01-11', contratSemaines: 52, objectif: 'CROSS', semaines: { 3: { cycle: 'FONCIER' } },
        jours: { '2025-03-03': { corps: '10x400', type: 'VMA', km: 8, majA: 't', reaction: '👍' }, '2025-03-04': { corps: 'FOOTING', type: 'EF' }, '2026-01-14': { corps: 'ANCIEN' } } };
      var recu = { id: 'X', debut: '2026-01-12', contratSemaines: 40, planDu: '2026-01-12', planAu: '2026-10-18', semaines: { 1: { cycle: 'PREPA' } }, jours: { '2026-01-12': { corps: 'FOOTING', type: 'EF' }, '2026-01-15': { corps: 'VMA' } } };
      var r = fusionner(loc, recu, 'excel'), c = r.contrats;
      return r.jours['2025-03-03'].corps === '10x400' && r.jours['2025-03-03'].km === 8 && r.jours['2025-03-03'].reaction === '👍' &&
        r.jours['2025-03-04'].corps === 'FOOTING' && !r.jours['2026-01-14'] && r.debut === '2026-01-12' && r.semaines[1].cycle === 'PREPA' &&
        c.length === 1 && c[0].debut === '2025-01-13' && c[0].semaines[3].cycle === 'FONCIER' &&
        contratDe(r, '2025-03-05') === c[0] && contratDe(r, '2026-01-13') === null && contratDe(r, '2024-12-30') === null;
    }],
    ['Fusion « excel », même contrat réimporté : rien n\'est archivé ; réimport d\'un ancien contrat : il redevient le contrat en cours', function () {
      var loc = { id: 'X', debut: '2026-01-12', jours: {}, contrats: [{ debut: '2025-01-13' }] };
      var r1 = fusionner(loc, { id: 'X', debut: '2026-01-12', jours: {} }, 'excel');
      var r2 = fusionner(loc, { id: 'X', debut: '2025-01-13', jours: {} }, 'excel');
      return r1.contrats.length === 1 && r2.contrats.length === 1 && r2.contrats[0].debut === '2026-01-12';
    }],
    ['Fusion « serveur » (athlète) : plan et réaction du serveur ; la saisie la plus récente gagne ; saisie en attente gardée', function () {
      var loc = { jours: { '2026-10-13': { corps: 'a', km: 10, majA: '2026-10-13T10:00:00Z' }, '2026-10-14': { km: 5, majA: '2026-10-14T08:00:00Z' }, '2026-10-15': { km: 6, majA: '2026-10-15T08:00:00Z' } } };
      var recu = { jours: { '2026-10-13': { corps: 'b', km: 12, majA: '2026-10-13T09:00:00Z', reaction: '💪' }, '2026-10-14': { corps: 'EF', km: 7, majA: '2026-10-14T09:00:00Z' }, '2026-10-15': { km: 9, majA: '2026-10-15T09:00:00Z' } } };
      var r = fusionner(loc, recu, 'serveur', { enAttente: { '2026-10-14': true } });
      return r.jours['2026-10-13'].corps === 'b' && r.jours['2026-10-13'].km === 10 && r.jours['2026-10-13'].reaction === '💪' &&
        r.jours['2026-10-14'].km === 5 && r.jours['2026-10-14'].corps === 'EF' && r.jours['2026-10-15'].km === 9;
    }],
    ['Fusion « retours » (entraîneur) : plan et réaction locaux gardés ; saisies de l\'athlète reçues', function () {
      var loc = { objectif: 'A', jours: { '2026-10-13': { corps: 'plan coach', reaction: '👍' } } };
      var recu = { objectif: 'B', jours: { '2026-10-13': { corps: 'modifié', km: 12.5, rpe: 6, dplus: 120, notes: 'dur', majA: '2026-10-13T19:00:00Z' } } };
      var r = fusionner(loc, recu, 'retours'), j = r.jours['2026-10-13'];
      return r.objectif === 'A' && j.corps === 'plan coach' && j.reaction === '👍' && j.km === 12.5 && j.rpe === 6 && j.dplus === 120 && j.majA === '2026-10-13T19:00:00Z';
    }],
    ['Fusion : une saisie effacée plus récente (champs vides) remplace l\'ancienne', function () {
      var loc = { jours: { '2026-10-13': { corps: 'EF', km: 10, majA: '2026-10-13T10:00:00Z' } } };
      var recu = { jours: { '2026-10-13': { corps: 'EF', majA: '2026-10-13T11:00:00Z' } } };
      var j = fusionner(loc, recu, 'retours').jours['2026-10-13'];
      return j.km === undefined && j.corps === 'EF';
    }],
    ['Périodes au lundi 12/10/2026 : semaine 12→18/10, comparée au lun. 05/10 ; mois comparé du 01/09 au 12/09', function () {
      var p = periodes('2026-10-12');
      return p.semaine.du === '2026-10-12' && p.semaine.au === '2026-10-18' && p.semaine.precDu === '2026-10-05' && p.semaine.precAu === '2026-10-05' &&
        p.mois.precDu === '2026-09-01' && p.mois.precAu === '2026-09-12' && p.annee.precAu === '2025-10-12';
    }],
    ['Bilan de période : 3 séances prévues (REPOS exclu), 2 faites dont 1 prévue, 1 sortie libre ; 22 km, D+ 150', function () {
      var a = { jours: { '2026-10-12': { corps: 'REPOS' }, '2026-10-13': { corps: 'EF', km: 10, dureeSec: 3000, dplus: 150 }, '2026-10-14': { corps: 'VMA' }, '2026-10-16': { corps: 'SL' }, '2026-10-17': { km: 12, dureeSec: 3600 } } };
      var b = bilanPeriode(a, '2026-10-12', '2026-10-18', '2026-10-15');
      return b.prevues === 3 && b.prevuesADate === 2 && b.seances === 2 && b.prevuesFaites === 1 && b.km === 22 && b.dureeSec === 6600 && b.dplus === 150;
    }],
    ['Records : plus longue sortie 21,1 km ; plus grosse semaine 31,1 km ; meilleure allure ≥ 10 km = 10 km en 40:00 (4:00 /km)', function () {
      var a = { jours: { '2026-10-12': { km: 10, dureeSec: 2400 }, '2026-10-14': { km: 21.1, dureeSec: 6330 }, '2026-10-20': { km: 5, dureeSec: 1150, type: 'COMP' } } };
      var r = {}; records(a).forEach(function (x) { r[x.cle] = x; });
      return r.distance.valeur === 21.1 && near(r.semaine.valeur, 31.1, 1e-9) && r.semaine.date === '2026-10-12' && r.allure10.valeur === 240 && r.allure10.date === '2026-10-12' &&
        r.compet.valeur === 230 && r.allure5.valeur === 230 && !r.dplus;
    }],
    ['Records : la meilleure allure ≥ 5 km n\'est pas répétée quand c\'est la même séance que ≥ 10 km', function () {
      var cles = records({ jours: { '2026-10-12': { km: 12, dureeSec: 2880 }, '2026-10-14': { km: 6, dureeSec: 1800 } } }).map(function (x) { return x.cle; });
      return cles.indexOf('allure10') >= 0 && cles.indexOf('allure5') < 0;
    }],
    ['Suivi entraîneur : dernière saisie 12/10 ; 13 et 14/10 prévues sans retour -> alerte ; REPOS ignoré', function () {
      var a = { jours: { '2026-10-12': { corps: 'EF', km: 8 }, '2026-10-13': { corps: 'VMA' }, '2026-10-14': { corps: 'EF' }, '2026-10-15': { corps: 'REPOS' }, '2026-10-17': { corps: 'SL' } } };
      var r = resumeCoach(a, '2026-10-16');
      return r.derniere === '2026-10-12' && r.sansRetour.length === 2 && r.alerte === true && r.semaine.prevues === 4;
    }],
    ['Compétitions des 7 prochains jours, triées par date', function () {
      var l = competitionsAVenir([{ id: 'A', jours: { '2026-10-20': { type: 'COMP', corps: '10 km' }, '2026-11-30': { type: 'COMP' } } }, { id: 'B', jours: { '2026-10-17': { type: 'COMP', corps: 'Cross' } } }], '2026-10-15', 7);
      return l.length === 2 && l[0].id === 'B' && l[1].date === '2026-10-20';
    }],
    ['Lien : « RespirOutdoor-Sylvain-Morera-K7Q2XA » ; code relu depuis le lien, l\'identifiant ou le code seul', function () {
      var a = { prenom: 'SYLVAIN', nom: 'MORERA', code: 'K7Q2XA' }, l = lienAthlete('https://respiroutdoor.github.io', a);
      return l === 'https://respiroutdoor.github.io/athlete/#RespirOutdoor-Sylvain-Morera-K7Q2XA' && codeDepuisLien(l) === 'K7Q2XA' &&
        codeDepuisLien('RespirOutdoor-Sylvain-Morera-K7Q2XA') === 'K7Q2XA' && codeDepuisLien(' k7q2xa ') === 'K7Q2XA' && codeDepuisLien('Sylvain') === null &&
        slugNom('Hélène  de la Tour') === 'Helene-De-La-Tour';
    }],
    ['Code secret : 6 signes de l\'alphabet sans 0, O, 1, I', function () {
      var c = genererCode(function (n) { var a = []; for (var i = 0; i < n; i++) a.push(i * 37 + 5); return a; });
      return c.length === 6 && /^[A-HJ-NP-Z2-9]{6}$/.test(c);
    }],
    ['Import : classeur minimal (en-tête, zones, 2 jours, cycle vertical) relu correctement', function () {
      var L = [];
      L[0] = ['NOM', undefined, 'JEAN', 'DUPONT', 'Né(e) le', 'j@d.fr', undefined, 'OBJECTIF :', 'CROSS'];
      L[1] = [undefined, undefined, undefined, undefined, undefined, undefined, 'VMA'];
      L[2] = ['CONTRAT', undefined, ' 156 SEMAINES', 'DU 13/01/25', 'AU', 46396, 18, 'HEBDO :', '4'];
      L[4] = ["ZONES D'ALLURES :"];
      L[5] = ['Z1,1', undefined, 'ENTRE', 18 * 0.58, 'ET', 18 * 0.62, 'RAC'];
      L[13] = ['S.', 'J', 'DATE', 'EVEIL (min.)', 'EDUC (min.)', 'CORPS DE SEANCE', 'RAC (min.)', 'PROFIL', 'TYPE', 'CYCLE', 'SPE', 'CONSIGNES', '-', 'A', 'KM', 'DUREE', 'RPE', '- 2', 'NOTES PERSO'];
      L[14] = ['S82', 'L', 46237, 20, undefined, "10x200M 100% RT1'", 10, 'PISTE', 'VMAC', 'A'];
      L[15] = [undefined, 'M', 46238, undefined, undefined, 'REPOS', undefined, undefined, undefined, 'S'];
      L[16] = [undefined, 'M', 46239, undefined, undefined, '1H EF', undefined, undefined, 'EF', undefined, undefined, undefined, undefined, undefined, 12.3, 3725 / 86400, 3, undefined, 'bien'];
      for (var i = 0; i < L.length; i++) L[i] = L[i] || [];
      var r = importerClasseur({ feuilles: [{ nom: 'PLAN ', lignes: L }] }), a = r.athlete;
      return a.prenom === 'JEAN' && a.nom === 'DUPONT' && a.email === 'j@d.fr' && a.objectif === 'CROSS' && a.debut === '2025-01-13' && a.fin === '2027-01-09' &&
        a.vma === 18 && a.zones.length === 1 && a.zones[0].nom === 'Z1.1' && a.zones[0].bas === 58 && a.contratSemaines === 156 &&
        a.jours['2026-08-03'].type === 'VMAC' && a.jours['2026-08-03'].eveil === '20' && a.jours['2026-08-05'].dureeSec === 3725 && a.jours['2026-08-05'].km === 12.3 &&
        a.jours['2026-08-05'].notes === 'bien' && a.semaines[82].cycle === 'AS' && a.id === 'DUPONT_JEAN';
    }],
    ['Classeur à plusieurs onglets de plan : liste avec période et séances ; « PLAN » par défaut, sinon le plus récent ; onglet choisi importé', function () {
      // 45670 = 13/01/2025 ; 46034 = 12/01/2026 ; 46035 = 13/01/2026
      var f1 = { nom: 'PLAN 2025', lignes: [['DATE', 'CORPS'], [45670, 'FOOTING'], [45671]] };
      var f2 = { nom: '10 KM', lignes: [['DATE', 'CORPS'], [46034, 'VMA'], [46035, 'EF']] };
      var lg = { nom: 'LEGENDE', lignes: [['DATE', 'X'], [45670, 'Y']] };
      var cl = { feuilles: [f1, f2, lg] }, o = ongletsPlan(cl);
      var r = importerClasseur(cl), r2 = importerClasseur(cl, 'PLAN 2025');
      // Onglet copié d'un ancien contrat : ligne CONTRAT du 06/07/2026 au 18/10/2026, dates en janvier 2027 -> avertissement
      var f3 = { nom: 'PLAN', lignes: [['CONTRAT', null, '15 SEMAINES', 'DU 6/7/26', 'AU', 'AU 18/10/26'], ['DATE', 'CORPS'], [46388, 'ESSAI PLAN']] };
      var r3 = importerClasseur({ feuilles: [f3] }), alerte = r3.rapport.filter(function (x) { return /^⚠/.test(x); });
      if (alerte.length !== 1 || r3.athlete.planDu !== '2027-01-01' || r.rapport.some(function (x) { return /^⚠/.test(x); })) return false;
      return o.length === 2 && o[0].nom === 'PLAN 2025' && o[0].du === '2025-01-13' && o[0].au === '2025-01-14' && o[0].seances === 1 && o[1].seances === 2 &&
        ongletParDefaut(o).nom === '10 KM' && ongletParDefaut([{ nom: 'Plan', du: '2020-01-01' }].concat(o)).nom === 'Plan' &&
        r.athlete.jours['2026-01-12'].corps === 'VMA' && r.athlete.planDu === '2026-01-12' && r.athlete.planAu === '2026-01-13' &&
        r2.athlete.jours['2025-01-13'].corps === 'FOOTING' && !r2.athlete.jours['2026-01-12'];
    }],
    ['Valeurs athlète hors limites (km 8100) : ignorées à l\'import avec la date, retirées d\'un athlète déjà enregistré', function () {
      // 46559 = 21/06/2027
      var f = { nom: 'PLAN', lignes: [['DATE', 'CORPS', 'KM', 'DUREE'], [46559, 'SL', 8100, 3], [46560, 'EF', 8.1, 0.5]] };
      var r = importerClasseur({ feuilles: [f] }), a = r.athlete, al = r.rapport.filter(function (x) { return /hors limites/.test(x); })[0] || '';
      var b = { jours: { '2027-06-21': { corps: 'SL', km: 8100, fc: 300, rpe: 5 }, '2027-06-22': { km: 9000 } } }, ret = corrigerAthlete(b);
      return !('km' in a.jours['2027-06-21']) && !('dureeSec' in a.jours['2027-06-21']) && a.jours['2027-06-22'].km === 8.1 && a.jours['2027-06-22'].dureeSec === 43200 &&
        /1 valeur athlète/.test(al) && /21\/06\/2027 : KM = 8100/.test(al) && ret.length === 3 && b.jours['2027-06-21'].corps === 'SL' && b.jours['2027-06-21'].rpe === 5 &&
        !('km' in b.jours['2027-06-21']) && !b.jours['2027-06-22'];
    }],
    ['Autres disciplines un jour de repos : repère lu, notes séparées ; hors km de course, records et chaussures ; comptées à part', function () {
      var a = { jours: {
        '2026-10-19': { corps: 'EF', km: 10, dureeSec: 3000, rpe: 3 },
        '2026-10-21': { corps: 'REPOS', km: 40, dureeSec: 5400, dplus: 300, rpe: 4, notes: noteActivite('velo', 'Sortie vélo') },
        '2026-10-22': { corps: 'REPOS', dureeSec: 1800, rpe: 5, notes: noteActivite('renfo', '') },
        '2026-10-23': { corps: 'REPOS', km: 6, dureeSec: 3600, notes: noteActivite('mn', '') } } };
      var v = activite(a.jours['2026-10-21']), b = bilanPeriode(a, '2026-10-19', '2026-10-25'), bj = bilanJours(Object.keys(a.jours).map(function (d) { return a.jours[d]; }));
      var rec = records(a), ch = kmChaussures({ liste: [{ id: 'p', kmDepart: 0 }], parDate: { '2026-10-19': 'p', '2026-10-21': 'p', '2026-10-23': 'p' } }, a.jours);
      return v.activite.code === 'velo' && v.notes === 'Sortie vélo' && noteActivite('course', 'x') === 'x' && activite({ notes: 'x' }) === null &&
        b.km === 10 && b.dureeSec === 3000 && b.seances === 1 && b.autres === 3 && bj.km === 10 && bj.autres.join() === 'Vélo,Renforcement musculaire,Marche nordique' &&
        rec.filter(function (r) { return r.cle === 'distance'; })[0].valeur === 10 && ch.p === 16 && estCourse(a.jours['2026-10-19']) && !estCourse(a.jours['2026-10-22']);
    }],
    ['Activité en plus le même jour (footing prévu + vélo, + 2e footing) : lignes lues et réécrites ; notes, marqueurs et saisie principale intacts ; totaux', function () {
      var v = { activite: ACTIVITES[3], km: 42.5, dureeSec: 5400, dplus: 380, fc: 131, rpe: 4, note: 'Club' }, f = { activite: ACTIVITES[0], km: 5, dureeSec: 1500 };
      var notes = avecExtras('Bonnes jambes', [v, f]), j = { corps: 'FOOTING', km: 10, dureeSec: 3000, rpe: 3, notes: notes };
      var x = extras(j), nf = { notes: avecExtras(noteNonRealisee('Fatigue', 'KO'), [v]) };
      var a = { jours: { '2026-10-21': j, '2026-10-22': { corps: 'VMA', notes: avecExtras('', [{ activite: ACTIVITES[5], dureeSec: 1800 }]) } } };
      var b = bilanPeriode(a, '2026-10-19', '2026-10-25'), bj = bilanJours([j]), rec = records(a);
      return notes === 'Bonnes jambes\n[+ Vélo · 42,5 km · 1:30:00 · D+ 380 m · FC 131 · RPE 4] Club\n[+ Course à pied · 5 km · 0:25:00]' &&
        x.length === 2 && x[0].activite.code === 'velo' && x[0].km === 42.5 && x[0].dureeSec === 5400 && x[0].dplus === 380 && x[0].fc === 131 && x[0].rpe === 4 && x[0].note === 'Club' &&
        notesPrincipales(j.notes) === 'Bonnes jambes' && avecExtras('Autre', x) === notes.replace('Bonnes jambes', 'Autre') && avecExtras('', []) === '' &&
        nonRealisee(nf).message === 'KO' && extras(nf).length === 1 && !aRetour(a.jours['2026-10-22']) &&
        b.km === 15 && b.dureeSec === 4500 && b.seances === 2 && b.prevuesFaites === 1 && b.autres === 2 && bj.faites === 2 && bj.autres.join() === 'Vélo' &&
        rec.filter(function (r) { return r.cle === 'semaine'; })[0].valeur === 15;
    }],
    ['Terrain saisi par l\'athlète : ligne lue, retirée du texte de la note, gardée avec les activités en plus', function () {
      var n = avecExtras('Bonnes jambes', [{ activite: ACTIVITES[3], km: 20 }], 'Voie verte'), j = { notes: n };
      return n === 'Bonnes jambes\n[TERRAIN · Voie verte]\n[+ Vélo · 20 km]' && terrain(j) === 'Voie verte' && notesPrincipales(n) === 'Bonnes jambes' &&
        extras(j).length === 1 && terrain({ notes: 'x' }) === '' && avecExtras('', [], 'Piste') === '[TERRAIN · Piste]' && aRetour({ notes: '[TERRAIN · Piste]' }) === false;
    }],
    ['Protocoles : onglet PROTOCOLES, code « PC 12 », 7 colonnes lus ; fusion par code (ajout, mise à jour, autres conservés) ; PC1 ≠ PC11', function () {
      var f = { nom: 'Protocoles', lignes: [['PC 12 - Côtes longues', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], ['', 'x'], [], ['PC5', 'nouveau'], ['POLISSAGE', 'y']] };
      var r = importerClasseur({ feuilles: [{ nom: 'PLAN', lignes: [['DATE', 'CORPS'], [46034, 'PC12']] }, f] }), pr = r.protos;
      var anciens = [{ code: 'PC5', titre: 'POLISSAGE', grille: [['ancien']], notes: 'n' }, { code: 'PC11', titre: 'DESCENTE', grille: [['d']] }];
      var fu = fusionnerProtos(anciens, pr);
      return pr.length === 2 && pr[0].code === 'PC12' && pr[0].titre === 'Côtes longues' && pr[0].grille[0].length === 7 && pr[1].code === 'PC5' &&
        fu.liste.length === 3 && fu.ajoutes.join() === 'PC12' && fu.modifies.join() === 'PC5' && fu.conserves === 1 && fu.liste[0].notes === 'n' && fu.liste[0].grille[0][0] === 'nouveau' &&
        protoPrevu({ corps: '2x PC1 en côte' }, 'PC1') && !protoPrevu({ corps: 'PC11' }, 'PC1') && protoPrevu({ corps: 'voir pc 11' }, 'PC11') && !protoPrevu({ corps: 'APC12' }, 'PC12') &&
        protoPrevu({ corps: 'PROTO A en côte' }, 'PROTO A') && protoPrevu({ corps: 'P12' }, 'P12') && protoPrevu({ corps: 'PC5 bis' }, 'PC 5 bis') &&
        protoPrevu({ corps: 'x PC* y' }, 'PC*') === true && protoPrevu({ corps: 'PC5 (court)' }, 'PC5 (court)') && !protoPrevu({ corps: 'PC5' }, 'PC5+') && protoPrevu({ corps: 'a' }, '') === false;
    }],
    ['Protocoles de deux appareils réunis : ajouts des deux gardés, version d\'ici pour un même code, suppression d\'ici respectée', function () {
      var ici = [{ code: 'PC5', titre: 'ici' }, { code: 'PC20', titre: 'nouveau' }], serv = [{ code: 'PC5', titre: 'service' }, { code: 'PC11' }, { code: 'PC14' }];
      var r = reunirProtos(ici, serv, ['PC14']);
      return r.map(function (p) { return p.code; }).join() === 'PC5,PC20,PC11' && r[0].titre === 'ici' && reunirProtos([], serv, []).length === 3 && reunirProtos(ici, null).length === 2;
    }],
    ['Protocoles de Seb (PF1C, PV2, PV3) : codes lus, ligne vide dans un protocole gardée, 2 lignes vides terminent, mots en colonne A non pris pour des codes', function () {
      var L = [['bannière'], [], ['PF1C', '30" ALLURE LENTE'], ['', '4/5 BLOCS DE 5MIN'], ['METHODE', 'RECUP 3\''], ['30/20/10'], [], ['BLOC DE 5 MIN'],
        ['PV2', '1 BLOC'], [], ['MONEGHETTI', '2 x 90 s', 'FRACTIONS RAPIDES'], ['FORMAT COURT 20MN', '4 x 60 s'],
        ['PV3'], ['', 'BLOC 1 = 3KM'], ['SEANCE COMBO', 'RECUP'], ['', 'BLOC 2A', 'OU', 'BLOC2B'], [], [], [], ['NOTE DE BAS DE PAGE', 'x'], ['PC 12 - Côtes', 'a']];
      var p = importerProtos({ nom: 'PROTOS', lignes: L });
      return p.map(function (x) { return x.code; }).join() === 'PF1C,PV2,PV3,PC12' && p[0].titre === 'METHODE 30/20/10 BLOC DE 5 MIN' && p[0].grille.length === 3 &&
        p[1].titre === 'MONEGHETTI FORMAT COURT 20MN' && p[1].grille[1][1] === 'FRACTIONS RAPIDES' && p[2].titre === 'SEANCE COMBO' && p[2].grille[2].join('|') === 'BLOC 2A|OU|BLOC2B' &&
        p[3].titre === 'Côtes' && protoPrevu({ corps: 'PV2 en fin de séance' }, 'PV2') && protoPrevu({ corps: 'PF1C' }, 'PF1C') && !protoPrevu({ corps: 'PF1' }, 'PF1C');
    }],
    ['Bibliothèque de protocoles (classeur sans plan) : tous les onglets lus ; SPE10 (type de la légende) et Z2 (zone) écartés ; encadré après 2 lignes vides non rattaché', function () {
      var cl = { feuilles: [
        { nom: 'COTE', lignes: [['PC11', 'ECHAUFFEMENT'], ['DESCENTE', 'x'], ['TECHNIQUE'], [], [], ['CALCUL', 'Pente en %'], [], ['PC12', 'FAUX-PLAT']] },
        { nom: 'VMA', lignes: [['PV1', '2 BLOCS'], ['VMA']] }, { nom: 'SPE type', lignes: [['SPE 10', '5x1000']] }, { nom: 'Allures', lignes: [['Z2', 'MAR']] }] };
      var r = importerBibliotheque(cl, { types: [{ code: 'SPE10' }] });
      return r.protos.map(function (p) { return p.code; }).join() === 'PC11,PC12,PV1' && r.protos[0].titre === 'DESCENTE TECHNIQUE' && r.rapport.length === 2;
    }],
    ['Légende : classeur de légende seule importé ; fusion par code (ajout, mise à jour, rien d\'effacé), principes remplacés', function () {
      var L = [['1. Principe un'], ['LEGENDE COLONNE TYPE'], ['EF', '', 'ENDURANCE FONDAMENTALE NOUVELLE'], ['NOUV', '', 'NOUVEAU TYPE'], ['LEGENDE COLONNE PROFIL'], ['PLAT', '', 'TRES PLAT']];
      var r = importerBibliotheque({ feuilles: [{ nom: 'Légende', lignes: L }] }, null);
      var anc = { principes: ['ancien'], colonnes: [{ code: 'RPE', desc: 'x' }], profils: [], types: [{ code: 'EF', desc: 'ancien', famille: 'Aérobie' }, { code: 'SL', desc: 'sortie' }] };
      var f = fusionnerLegende(anc, r.legende), t = f.legende.types;
      return r.protos.length === 0 && r.legende.types.length === 2 && t.length === 3 && t[0].desc === 'ENDURANCE FONDAMENTALE NOUVELLE' && t[0].famille === 'Aérobie' &&
        t[1].code === 'SL' && t[2].code === 'NOUV' && f.ajoutes === 2 && f.modifies === 1 && f.legende.principes[0] === 'Principe un' && f.legende.colonnes.length === 1;
    }],
    ['Familles de la légende : mot de la colonne H (BIP → Marche nordique, RESP. → Respiration) appliqué jusqu\'à la ligne vide ; lettres verticales ignorées ; fichier d\'athlète = ajout seul', function () {
      var H = function (a, c, h) { var l = [a, '', c, '', '', '', '', h]; return l; };
      var L = [['LEGENDE COLONNE TYPE'], H('EF', 'ENDURANCE', 'A'), H('SL', 'SORTIE LONGUE', 'E'), [], H('RSP', 'RESPIRATOIRE', 'RESP.'), H('COCA', 'COHERENCE', ''), [], H('BIP', 'SEANCE BIPEDE MARCHE NORDIQUE', 'MARCHE NORDIQUE'), [], H('ZZ', 'SANS FAMILLE', '')];
      var lg = importerLegende({ nom: 'LEGENDE', lignes: L }), t = {}; lg.types.forEach(function (x) { t[x.code] = x.famille || ''; });
      var anc = { types: [{ code: 'EF', desc: 'maître', famille: 'Aérobie' }] }, f = fusionnerLegende(anc, { types: [{ code: 'EF', desc: 'vieux' }, { code: 'BIP', desc: 'b' }] }, true);
      var fp = fusionnerProtos([{ code: 'PC5', titre: 'maître', grille: [] }], [{ code: 'PC5', titre: 'vieux', grille: [] }, { code: 'PV9', titre: 'n', grille: [] }], true);
      return t.EF === '' && t.SL === '' && t.RSP === 'Respiration' && t.COCA === 'Respiration' && t.BIP === 'Marche nordique' && t.ZZ === '' &&
        f.legende.types[0].desc === 'maître' && f.legende.types.length === 2 && f.ajoutes === 1 && f.modifies === 0 &&
        fp.liste[0].titre === 'maître' && fp.ajoutes.join() === 'PV9' && fp.modifies.length === 0;
    }],
    ['Fichier de référence : codes supprimés du fichier repérés (ESSAI), section vide du fichier ignorée, retrait appliqué', function () {
      var app = { types: [{ code: 'EF' }, { code: 'ESSAI' }], profils: [{ code: 'PLAT' }], colonnes: [{ code: 'RPE' }] };
      var fic = { types: [{ code: 'EF' }], profils: [{ code: 'PLAT' }, { code: 'PISTE' }], colonnes: [] };
      var a = absentsLegende(app, fic), lg = retirerLegende(app, a);
      return a.types.join() === 'ESSAI' && a.profils.length === 0 && a.colonnes.length === 0 && lg.types.length === 1 && lg.colonnes.length === 1 &&
        codesAbsents([{ code: 'PC1' }, { code: 'PC 2' }], [{ code: 'PC2' }]).join() === 'PC1' && codesAbsents([{ code: 'PC1' }], []).length === 0;
    }],
    ['ALLURES : dates de test Excel (46235) lues en date ; records personnels lus (RECORD + années) ; chrono de base saisi gardé si la case du classeur est vide', function () {
      var L2 = [['RECORDS PERSONNELS'], ['Distance', 'RECORD', 'DATE', 'ANNEE 2024'], ['SEMI', '1H34\'45"', 46320, '1H42'], ['5KM']];
      var a2 = nouvelAthlete({}); importerAllures({ nom: 'ALLURES', lignes: L2 }, a2, []);
      var r2 = a2.recordsPerso;
      if (!(r2.annees.join() === 'DATE,ANNEE 2024' && r2.lignes[0].record === '1H34\'45"' && r2.lignes[0].annees.join() === '25/10/2026,1H42')) return false;
      var L = [['TEST VMA', 'TYPE :', '1/2 COOPER', '', '', '', 17], ['', 'DATE :', 46235], [], ['RECORDS PERSONNELS'], ['Distance', 'RECORD', 'ANNEE', 2024, 'ANNEE'],
        ['5KM', 0.0137152777, '0:20:30', '0:19:45'], ['10KM', '39:30', 0.0291666666, ''], ['100KM', '', '', ''], []];
      var a = nouvelAthlete({}), rap = []; importerAllures({ nom: 'ALLURES', lignes: L }, a, rap);
      var rp = a.recordsPerso, loc = { id: 'X', jours: {}, allures: { chrono10: 2400, chronoSemi: 5000 } };
      var m = fusionner(loc, { id: 'X', jours: {}, allures: { chrono10: null, chronoSemi: 5100, chronoMarathon: null } }, 'excel');
      return a.test.date === '01/08/2026' && dateTest('46320') === '25/10/2026' && dateTest('11/24') === '11/24' && rp.annees.join() === 'Année 1,2024' &&
        rp.lignes[0].record === '0:19:45' && rp.lignes[0].annees[0] === '0:20:30' && rp.lignes[0].annees[1] === '0:19:45' && rp.lignes[1].record === '0:39:30' && rp.lignes[1].annees[0] === '0:42:00' &&
        rp.lignes[2].record === '' && rp.lignes.length === 3 && m.allures.chrono10 === 2400 && m.allures.chronoSemi === 5100;
    }],
    ['Dégradé RPE : 1 = bleu #4879C6, 10 = rouge #C54135 (texte blanc), 2 interpolé, 4 entre cyan et vert', function () {
      // 6 couleurs, niveau n à (n − 1) / 9 : 2 -> 5/9 du chemin bleu -> cyan : 72 + 27×5/9 = 87 (0x57) ; 121 + 77×5/9 = 163,8 -> 164 (0xA4) ; 198 + 23×5/9 = 210,8 -> 211 (0xD3)
      // 4 -> 1/3 × 5 = 1,667 : 2/3 du chemin cyan -> vert : 99 − 3×2/3 = 97 (0x61) ; 198 − 2×2/3 = 196,7 -> 197 (0xC5) ; 221 − 123×2/3 = 139 (0x8B)
      return libelleRPE(1).couleur === '#4879C6' && libelleRPE(10).couleur === '#C54135' && libelleRPE(10).texte === '#FFFFFF' &&
        libelleRPE(2).couleur === '#57A4D3' && libelleRPE(4).couleur === '#61C58B' && libelleRPE(4).texte === '#000000';
    }],
    ['Séance pas réalisée : note « [PAS RÉALISÉE · Malade] Fièvre » lue ; sans raison ; note ordinaire ignorée ; non comptée comme faite', function () {
      var n = noteNonRealisee('Malade', 'Fièvre'), a = nonRealisee({ notes: n }), b = nonRealisee({ notes: noteNonRealisee('', '') }), j = { corps: 'VMA', notes: n };
      return n === '[PAS RÉALISÉE · Malade] Fièvre' && a.raison === 'Malade' && a.message === 'Fièvre' && b.raison === '' && b.message === '' &&
        nonRealisee({ notes: 'Bonne séance' }) === null && !estFaite(j) && aRetour(j);
    }],
    ['Suivi entraîneur : séance pas réalisée des 7 derniers jours remontée avec sa raison', function () {
      var a = { jours: { '2026-10-12': { corps: 'VMA', type: 'VMA', notes: noteNonRealisee('Fatigue', 'Trop de travail') }, '2026-10-01': { corps: 'EF', notes: noteNonRealisee('Météo', '') } } };
      var r = resumeCoach(a, '2026-10-15');
      return r.nonRealisees.length === 1 && r.nonRealisees[0].date === '2026-10-12' && r.nonRealisees[0].raison === 'Fatigue' && r.nonRealisees[0].message === 'Trop de travail';
    }],
    ['FC moyenne : gardée sur le téléphone si le service (version 1) la renvoie sans FC pour la même saisie', function () {
      var local = { id: 'x', jours: { '2026-10-13': { corps: 'EF', km: 10, fc: 150, majA: '2026-10-13T19:00:00Z' } } };
      var recu = { id: 'x', jours: { '2026-10-13': { corps: 'EF', km: 10, majA: '2026-10-13T19:00:00Z' } } };
      var r = fusionner(local, recu, 'serveur', {});
      return r.jours['2026-10-13'].fc === 150 && aRetour({ fc: 140 });
    }],
    ['Séance décalée : « [DÉCALÉE AU …] » et « [FAITE LE …] » lus ; pas « pas réalisée » ; pas comptée tant qu\'elle n\'est pas faite', function () {
      var n = noteDecalee('2026-10-20', 'Manque de temps', 'Anniversaire'), d = decalee({ notes: n }), j = { corps: 'VMA', notes: n };
      var f = faiteLe({ notes: noteFaiteLe('2026-10-20', 'Bonnes jambes'), km: 10 });
      return n === '[DÉCALÉE AU 2026-10-20 · Manque de temps] Anniversaire' && d.au === '2026-10-20' && d.raison === 'Manque de temps' && d.message === 'Anniversaire' &&
        nonRealisee(j) === null && !estFaite(j) && aRetour(j) && f.le === '2026-10-20' && f.notes === 'Bonnes jambes' && decalee({ notes: 'ok' }) === null && faiteLe({ notes: 'ok' }) === null;
    }],
    ['Suivi entraîneur : séance décalée remontée avec sa nouvelle date, « en retard » si la date est passée', function () {
      var a = { jours: { '2026-10-19': { corps: 'VMA', notes: noteDecalee('2026-10-20', 'Manque de temps', '') }, '2026-10-12': { corps: 'EF', notes: noteDecalee('2026-10-13', '', '') } } };
      var r1 = resumeCoach(a, '2026-10-19'), r2 = resumeCoach(a, '2026-10-22');
      return r1.decalees.length === 2 && r1.decalees[0].au === '2026-10-20' && !r1.decalees[0].enRetard && r1.decalees[1].enRetard && r2.decalees[0].enRetard && r1.nonRealisees.length === 0;
    }],
    ['Chaussures : km = km de départ + km des séances associées ; séance sans km ou paire inconnue ignorée', function () {
      var ch = { liste: [{ id: 'c1', nom: 'A', kmDepart: 120 }, { id: 'c2', nom: 'B', kmDepart: 0 }], parDate: { '2026-10-01': 'c1', '2026-10-02': 'c1', '2026-10-03': 'c2', '2026-10-04': 'c9', '2026-10-05': 'c2' } };
      var jours = { '2026-10-01': { km: 10.5 }, '2026-10-02': { km: 8 }, '2026-10-03': { km: 12.25 }, '2026-10-04': { km: 30 }, '2026-10-05': { dureeSec: 1800 } };
      var r = kmChaussures(ch, jours);
      return r.c1 === 138.5 && r.c2 === 12.25 && r.c9 === undefined;
    }],
    ['Échelle RPE : 1 = Très facile, 4 = Modéré, 10 = Effort maximal ; 3 sans libellé ; 6,5 -> niveau 7 ; 0 et 11 hors échelle', function () {
      return libelleRPE(1).libelle === 'Très facile' && libelleRPE(4).libelle === 'Modéré' && libelleRPE(10).libelle === 'Effort maximal' && libelleRPE(3).libelle === '' &&
        libelleRPE(6.5).niveau === 7 && libelleRPE(0) === null && libelleRPE(11) === null;
    }],
    ['CSV : « ; », guillemets et retour à la ligne échappés', function () { return versCSV([['a;b', 'c"d', 'e\nf', 1]]) === '"a;b";"c""d";"e\nf";1'; }]
  ];
  function runTests() {
    return TESTS.map(function (t) {
      var ok = false, err = null;
      try { ok = t[1]() === true; } catch (ex) { err = String(ex); }
      return { nom: t[0], ok: ok, err: err };
    });
  }

  return {
    TZ: TZ, SCHEMA_VERSION: SCHEMA_VERSION, JOURS: JOURS, JOURS_LONGS: JOURS_LONGS, CHAMPS_COACH: CHAMPS_COACH, CHAMPS_ATHLETE: CHAMPS_ATHLETE,
    ZONES_DEFAUT: ZONES_DEFAUT, CHAMP_REACTION: CHAMP_REACTION, aDonneesAthlete: aDonneesAthlete, periodes: periodes, bilanPeriode: bilanPeriode,
    estPrevue: estPrevue, estFaite: estFaite, records: records, derniereSaisie: derniereSaisie, resumeCoach: resumeCoach, competitionsAVenir: competitionsAVenir,
    genererCode: genererCode, slugNom: slugNom, lienAthlete: lienAthlete, codeDepuisLien: codeDepuisLien, ECHELLE_RPE: ECHELLE_RPE, DEGRADE_RPE: DEGRADE_RPE, libelleRPE: libelleRPE, kmChaussures: kmChaussures, RAISONS_NON_FAITE: RAISONS_NON_FAITE, nonRealisee: nonRealisee, noteNonRealisee: noteNonRealisee, decalee: decalee, noteDecalee: noteDecalee, faiteLe: faiteLe, noteFaiteLe: noteFaiteLe, pad2: pad2, isNum: isNum, texte: texte, parseNumberFR: parseNumberFR, nombreFR: nombreFR,
    isValidISODate: isValidISODate, parseDateFR: parseDateFR, formatDateFR: formatDateFR, addDays: addDays, daysBetween: daysBetween,
    dayOfWeek: dayOfWeek, weekStart: weekStart, todayParis: todayParis, excelSerialToISO: excelSerialToISO,
    numSemaine: numSemaine, lundiSemaine: lundiSemaine, formatDuree: formatDuree, parseDuree: parseDuree, formatTemps: formatTemps,
    paceFromSpeed: paceFromSpeed, formatAllure: formatAllure, allureMoyenne: allureMoyenne, vitessePct: vitessePct,
    tempsDistancePct: tempsDistancePct, distanceTempsPct: distanceTempsPct, zoneVitesses: zoneVitesses, allureChrono: allureChrono,
    trouverZone: trouverZone, reperesSeance: reperesSeance, normCode: normCode, chercherCode: chercherCode,
    estRepos: estRepos, aContenuCoach: aContenuCoach, aRetour: aRetour, bilanJours: bilanJours, joursSemaine: joursSemaine, prochaineCompet: prochaineCompet,
    regrouperVertical: regrouperVertical, nouvelAthlete: nouvelAthlete, nettoyerJour: nettoyerJour, idAthlete: idAthlete, fusionner: fusionner, contratDe: contratDe, dateTest: dateTest, ACTIVITES: ACTIVITES, activite: activite, noteActivite: noteActivite, estCourse: estCourse,
    extras: extras, avecExtras: avecExtras, terrain: terrain, notesPrincipales: notesPrincipales, seancesDuJour: seancesDuJour, corrigerAthlete: corrigerAthlete, DISTANCES_RP: DISTANCES_RP, distanceRP: distanceRP, chronoTexte: chronoTexte, resultatValide: resultatValide, dateResultat: dateResultat, quandResultat: quandResultat, resultatsDistance: resultatsDistance, syntheseRP: syntheseRP,
    lireXLSX: lireXLSX, importerClasseur: importerClasseur, importerBibliotheque: importerBibliotheque, fusionnerLegende: fusionnerLegende, codesAbsents: codesAbsents, absentsLegende: absentsLegende, retirerLegende: retirerLegende, fusionnerProtos: fusionnerProtos, reunirProtos: reunirProtos, protoPrevu: protoPrevu, ongletsPlan: ongletsPlan, estAutreOnglet: estAutreOnglet, ongletParDefaut: ongletParDefaut, versCSV: versCSV, TESTS: TESTS, runTests: runTests
  };
})();
