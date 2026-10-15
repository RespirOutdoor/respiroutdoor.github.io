var Core = (function () {
  'use strict';
  var TZ = 'Europe/Paris';
  var SCHEMA_VERSION = 1;
  var JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  var JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  // Colonnes « partie entraîneur » et « partie athlète » du tableau PLAN
  var CHAMPS_COACH = ['eveil', 'educ', 'corps', 'rac', 'profil', 'type', 'consignes'];
  var CHAMPS_ATHLETE = ['km', 'dureeSec', 'dplus', 'rpe', 'notes'];
  // Réaction de l'entraîneur à une séance saisie : écrite par l'entraîneur, conservée lors d'un import Excel
  var CHAMP_REACTION = 'reaction';
  // Champs de la fiche gardés côté entraîneur quand un classeur Excel est réimporté
  var CLES_LOCALES = ['code', 'motCoach'];
  // Échelle « Intensité de l'effort » de 1 à 10 : image insérée dans l'onglet PLAN du classeur (cellule O7).
  // Libellés et couleurs relevés sur cette image ; les niveaux sans libellé restent sans libellé.
  var ECHELLE_RPE = { 1: 'Très facile', 2: 'Facile', 4: 'Modéré', 7: 'Difficile', 9: 'Très difficile', 10: 'Effort maximal' };
  // Dégradé de la barre RPE, en tons pastel : bleu, vert, jaune, orange, rouge, violet, ardoise (effort maximal).
  // Niveau n placé à (n − 1) / 9 du dégradé ; les niveaux entre deux couleurs sont interpolés.
  var DEGRADE_RPE = ['#9EC1E8', '#A6D6B4', '#F3DE95', '#F5BE8F', '#EE9E9A', '#C2A9E0', '#6E6584'];
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

  // Kilomètres par paire de chaussures : km déjà parcourus à l'ajout + km des séances associées à la paire
  function kmChaussures(ch, jours) {
    var r = {};
    ((ch && ch.liste) || []).forEach(function (c) { r[c.id] = isNum(c.kmDepart) ? c.kmDepart : 0; });
    Object.keys((ch && ch.parDate) || {}).forEach(function (d) {
      var id = ch.parDate[d], j = (jours || {})[d];
      if (r[id] !== undefined && j && isNum(j.km)) r[id] = Math.round((r[id] + j.km) * 1000) / 1000;
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
  function aRetour(j) { return !!j && (isNum(j.km) || isNum(j.dureeSec) || isNum(j.rpe) || isNum(j.dplus) || texte(j.notes) !== ''); }
  // Somme des km et durées, moyenne des RPE renseignés (comme =SUM et =AVERAGE du tableau)
  function bilanJours(jours) {
    var r = { km: 0, dureeSec: 0, rpeMoy: null, nbRpe: 0, prevues: 0, faites: 0 }, sRpe = 0;
    (jours || []).forEach(function (j) {
      if (!j) return;
      if (aContenuCoach(j) && !estRepos(j)) r.prevues++;
      if (isNum(j.km)) r.km += j.km;
      if (isNum(j.dureeSec)) r.dureeSec += j.dureeSec;
      if (isNum(j.rpe)) { sRpe += j.rpe; r.nbRpe++; }
      if (isNum(j.km) || isNum(j.dureeSec)) r.faites++;
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
      allures: { chrono10: null, chronoSemi: null, chronoMarathon: null, preFatPct: 75 },
      semaines: {}, jours: {}, maj: null
    };
    Object.keys(o || {}).forEach(function (k) { a[k] = o[k]; });
    if (!a.id) a.id = idAthlete(a);
    return a;
  }
  function nettoyerJour(j) {
    var r = {};
    CHAMPS_COACH.concat([CHAMP_REACTION], CHAMPS_ATHLETE).forEach(function (k) {
      var v = j[k];
      if (k === 'km' || k === 'dureeSec' || k === 'rpe' || k === 'dplus') { if (isNum(v)) r[k] = v; }
      else if (texte(v) !== '') r[k] = texte(v);
    });
    if (texte(j.majA) !== '') r.majA = texte(j.majA);
    return r;
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
  //                 les valeurs athlète du classeur ne remplissent que les jours encore vides.
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
        res[k] = clone(recu[k]);
      });
    }
    var dates = {};
    Object.keys(local.jours || {}).concat(Object.keys(recu.jours || {})).forEach(function (d) { dates[d] = 1; });
    res.jours = {};
    Object.keys(dates).forEach(function (d) {
      var l = (local.jours || {})[d] || {}, r = (recu.jours || {})[d] || {};
      var coach = mode === 'retours' ? partie(l, CHAMPS_COACH) : partie(r, CHAMPS_COACH);
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
  function estPrevue(j) { return aContenuCoach(j) && !estRepos(j); }
  function estFaite(j) { return !!j && (isNum(j.km) || isNum(j.dureeSec)); }
  // Bilan du « du » au « au » inclus ; « auj » sert à compter les séances prévues déjà passées
  function bilanPeriode(athlete, du, au, auj) {
    var r = { km: 0, dureeSec: 0, dplus: 0, seances: 0, prevues: 0, prevuesADate: 0, prevuesFaites: 0 };
    Object.keys(athlete.jours || {}).forEach(function (d) {
      if (d < du || d > au) return;
      var j = athlete.jours[d], p = estPrevue(j);
      if (p) { r.prevues++; if (!auj || d <= auj) r.prevuesADate++; }
      if (estFaite(j)) {
        r.seances++;
        if (p) r.prevuesFaites++;
        if (isNum(j.km)) r.km += j.km;
        if (isNum(j.dureeSec)) r.dureeSec += j.dureeSec;
        if (isNum(j.dplus)) r.dplus += j.dplus;
      }
    });
    r.km = Math.round(r.km * 1000) / 1000;
    return r;
  }

  /* ---------- Records (calculés uniquement sur les séances saisies) ---------- */
  function records(athlete) {
    var dates = Object.keys(athlete.jours || {}).sort(), out = [], semaines = {};
    function max(cle, libelle, f, format) {
      var best = null;
      dates.forEach(function (d) { var v = f(athlete.jours[d]); if (isNum(v) && v > 0 && (!best || v > best.v)) best = { v: v, date: d }; });
      if (best) out.push({ cle: cle, libelle: libelle, valeur: best.v, texte: format(best.v), date: best.date });
    }
    function allure(cle, libelle, filtre) {
      var best = null;
      dates.forEach(function (d) {
        var j = athlete.jours[d];
        if (!filtre(j)) return;
        var a = allureMoyenne(j.dureeSec, j.km);
        if (a && (!best || a < best.v)) best = { v: a, date: d, km: j.km };
      });
      if (best) out.push({ cle: cle, libelle: libelle, valeur: best.v, texte: formatAllure(best.v) + ' sur ' + nombreFR(best.km, 2) + ' km', date: best.date });
    }
    max('distance', 'Plus longue sortie', function (j) { return j.km; }, function (v) { return nombreFR(v, 2) + ' km'; });
    max('duree', 'Plus longue durée', function (j) { return j.dureeSec; }, formatDuree);
    max('dplus', 'Plus gros D+', function (j) { return j.dplus; }, function (v) { return Math.round(v) + ' m'; });
    dates.forEach(function (d) { var j = athlete.jours[d]; if (isNum(j.km)) { var l = weekStart(d); semaines[l] = (semaines[l] || 0) + j.km; } });
    var bs = null;
    Object.keys(semaines).forEach(function (l) { if (!bs || semaines[l] > bs.v) bs = { v: semaines[l], date: l }; });
    if (bs && bs.v > 0) out.push({ cle: 'semaine', libelle: 'Plus grosse semaine', valeur: bs.v, texte: nombreFR(bs.v, 2) + ' km', date: bs.date });
    allure('compet', 'Meilleure allure en compétition', function (j) { return normCode(j.type) === 'COMP'; });
    allure('allure10', 'Meilleure allure moyenne (séance de 10 km ou plus)', function (j) { return isNum(j.km) && j.km >= 10; });
    allure('allure5', 'Meilleure allure moyenne (séance de 5 km ou plus)', function (j) { return isNum(j.km) && j.km >= 5; });
    // Même séance que le record « 10 km ou plus » : inutile de l'afficher deux fois
    var a10 = out.filter(function (r) { return r.cle === 'allure10'; })[0];
    return out.filter(function (r) { return !(r.cle === 'allure5' && a10 && a10.date === r.date); });
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
    return { semaine: b, rpeMoy: rpe, derniere: der, sansRetour: manquees, alerte: manquees.length >= 2 };
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
  function feuille(classeur, nom) {
    return (classeur.feuilles || []).filter(function (f) { return normCode(f.nom) === normCode(nom); })[0] || null;
  }
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
    var verticales = { cycle: [], spe: [] }, ligneDate = {}, n = 0, ignores = 0;
    for (var rr = pEnt.r + 1; rr < f.lignes.length; rr++) {
      var l = f.lignes[rr] || [];
      ['cycle', 'spe'].forEach(function (k) { if (col[k] !== undefined && l[col[k]] !== undefined) verticales[k].push({ ligne: rr, valeur: l[col[k]] }); });
      var d = isNum(l[pEnt.c]) ? excelSerialToISO(l[pEnt.c]) : null;
      if (!d) continue;
      ligneDate[rr] = d;
      var j = {};
      ['eveil', 'educ', 'corps', 'rac', 'profil', 'type', 'consignes', 'notes'].forEach(function (k) {
        if (col[k] !== undefined && l[col[k]] !== undefined) j[k] = texte(l[col[k]]);
      });
      if (col.km !== undefined) { var km = parseNumberFR(l[col.km]); if (isNum(km)) j.km = km; else if (l[col.km] !== undefined) ignores++; }
      if (col.dureeSec !== undefined && l[col.dureeSec] !== undefined) { var du = dureeCellule(l[col.dureeSec]); if (isNum(du)) j.dureeSec = du; else ignores++; }
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
    rapport.push(n + ' jours renseignés importés depuis l\'onglet PLAN' + (ignores ? ' ; ' + ignores + ' valeur(s) athlète illisible(s) ignorée(s)' : ''));
    return a;
  }

  function importerAllures(f, a, rapport) {
    if (!f) return;
    var p = chercher(f, /^TYPE\s*:?$/i);
    if (p) {
      a.test.type = texte(cel(f, p.r, p.c + 1));
      var vma = aDroite(f, { r: p.r, c: p.c + 1 }, 6);
      if (isNum(vma) && !isNum(a.vma)) a.vma = vma;
      if (isNum(vma) && isNum(a.vma) && Math.abs(vma - a.vma) > 1e-9) rapport.push('VMA différente entre PLAN (' + nombreFR(a.vma) + ') et ALLURES (' + nombreFR(vma) + ') : celle du PLAN est gardée');
    }
    var pd = chercher(f, /^DATE\s*:$/i);
    if (pd) a.test.date = texte(cel(f, pd.r, pd.c + 1));
    var pe = chercher(f, /VMA ESTIM/i);
    if (pe) a.test.estimee = /^O/i.test(texte(aDroite(f, pe, 3)));
    var ph = chercher(f, /^EVOLUTION DE LA VMA/i);
    if (ph) {
      var hist = [];
      for (var r = ph.r + 2; r < ph.r + 40; r++) {
        var t = cel(f, r, ph.c), d = cel(f, r, ph.c + 1), v = cel(f, r, ph.c + 2);
        if (t === undefined && d === undefined && v === undefined) break;
        if (isNum(v)) hist.push({ test: texte(t), date: texte(d), vma: v });
      }
      a.historiqueVMA = hist;
    }
    // « base chrono » : 10 km, semi, marathon (dans l'ordre, distance lue à côté)
    var cles = { 10: 'chrono10', 21.1: 'chronoSemi', 42.195: 'chronoMarathon' }, from = 0, pc;
    while ((pc = chercher(f, /^base chrono$/i, from))) {
      var dist = aDroite(f, { r: pc.r, c: pc.c + 3 }, 2), ch = cel(f, pc.r, pc.c + 2);
      var cle = cles[dist];
      if (cle) a.allures[cle] = isNum(ch) ? dureeCellule(ch) : null;
      from = pc.r + 1;
    }
    var pf = chercher(f, /^ESTIMATION PRE-FAT/i);
    if (pf) { var pct = aDroite(f, pf, 3); if (isNum(pct)) a.allures.preFatPct = pct; }
  }

  function importerLegende(f) {
    if (!f) return null;
    var lg = { principes: [], colonnes: [], profils: [], types: [] }, section = null, dernier = null;
    for (var r = 0; r < f.lignes.length; r++) {
      var l = f.lignes[r] || [], A = texte(l[0]), C = texte(l[2]);
      if (/^\d\.\s/.test(A)) { lg.principes.push(A.replace(/^\d\.\s*/, '')); continue; }
      if (/^COLONNES DU TABLEAU/i.test(A)) { section = 'colonnes'; dernier = null; continue; }
      if (/^LEGENDE COLONNE PROFIL/i.test(A)) { section = 'profils'; dernier = null; continue; }
      if (/^LEGENDE COLONNE TYPE/i.test(A)) { section = 'types'; dernier = null; continue; }
      if (!section) continue;
      if (A) { dernier = { code: A, desc: C }; lg[section].push(dernier); }
      else if (C && dernier) dernier.desc += ' — ' + C;
      if (!A && !C) dernier = null;
    }
    return lg;
  }

  function importerProtos(f) {
    if (!f) return [];
    var res = [], cur = null;
    for (var r = 0; r < f.lignes.length; r++) {
      var l = f.lignes[r] || [], A = texte(l[0]);
      var cellules = [1, 2, 3, 4, 5].map(function (c) { return texte(l[c]); });
      var vide = !A && cellules.every(function (x) { return !x; });
      if (/^PC\d+/i.test(A)) { cur = { code: A.toUpperCase(), titre: [], grille: [] }; res.push(cur); }
      else if (vide) { cur = null; continue; }
      else if (!cur) continue;
      else if (A) cur.titre.push(A);
      while (cellules.length && !cellules[cellules.length - 1]) cellules.pop();
      if (cellules.length) cur.grille.push(cellules);
    }
    return res.map(function (p) { return { id: p.code, code: p.code, titre: p.titre.join(' '), grille: p.grille, notes: '' }; });
  }

  // Renvoie { athlete, legende, protos, rapport: [texte…] }
  function importerClasseur(classeur) {
    var rapport = [];
    var fPlan = feuille(classeur, 'PLAN');
    if (!fPlan) throw new Error('onglet PLAN introuvable : ce classeur ne suit pas le modèle de l\'entraîneur');
    var a = importerPlan(fPlan, rapport);
    importerAllures(feuille(classeur, 'ALLURES'), a, rapport);
    var lg = importerLegende(feuille(classeur, 'LEGENDE'));
    var pr = importerProtos(feuille(classeur, 'PROTOS'));
    if (lg) rapport.push('Légende : ' + lg.types.length + ' types, ' + lg.profils.length + ' profils');
    rapport.push('Protos : ' + pr.length + ' protocole(s)');
    ['LEGENDE', 'ALLURES', 'PROTOS'].forEach(function (n) { if (!feuille(classeur, n)) rapport.push('Onglet ' + n + ' absent'); });
    return { athlete: a, legende: lg, protos: pr, rapport: rapport };
  }

  /* ---------- CSV ---------- */
  function champCSV(v) { var s = v == null ? '' : String(v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function versCSV(lignes) { return lignes.map(function (l) { return l.map(champCSV).join(';'); }).join('\r\n'); }

  /* ---------- Autotests (valeurs de référence calculées à la main) ---------- */
  function near(a, b, eps) { return isNum(a) && Math.abs(a - b) <= (eps || 1e-9); }
  var TESTS = [
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
    ['Dégradé RPE pastel : 1 = bleu #9EC1E8, 4 = jaune #F3DE95, 7 = rouge #EE9E9A, 10 = ardoise #6E6584 (texte blanc), 2 interpolé', function () {
      // 2 -> t = 1/9 -> 2/3 du chemin bleu -> vert : 158 + (166−158)×2/3 = 163,3 -> 163 (0xA3) ; 193 + (214−193)×2/3 = 207 (0xCF) ; 232 + (180−232)×2/3 = 197,3 -> 197 (0xC5)
      return libelleRPE(1).couleur === '#9EC1E8' && libelleRPE(4).couleur === '#F3DE95' && libelleRPE(7).couleur === '#EE9E9A' &&
        libelleRPE(10).couleur === '#6E6584' && libelleRPE(10).texte === '#FFFFFF' && libelleRPE(4).texte === '#000000' && libelleRPE(2).couleur === '#A3CFC5';
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
    genererCode: genererCode, slugNom: slugNom, lienAthlete: lienAthlete, codeDepuisLien: codeDepuisLien, ECHELLE_RPE: ECHELLE_RPE, DEGRADE_RPE: DEGRADE_RPE, libelleRPE: libelleRPE, kmChaussures: kmChaussures, pad2: pad2, isNum: isNum, texte: texte, parseNumberFR: parseNumberFR, nombreFR: nombreFR,
    isValidISODate: isValidISODate, parseDateFR: parseDateFR, formatDateFR: formatDateFR, addDays: addDays, daysBetween: daysBetween,
    dayOfWeek: dayOfWeek, weekStart: weekStart, todayParis: todayParis, excelSerialToISO: excelSerialToISO,
    numSemaine: numSemaine, lundiSemaine: lundiSemaine, formatDuree: formatDuree, parseDuree: parseDuree, formatTemps: formatTemps,
    paceFromSpeed: paceFromSpeed, formatAllure: formatAllure, allureMoyenne: allureMoyenne, vitessePct: vitessePct,
    tempsDistancePct: tempsDistancePct, distanceTempsPct: distanceTempsPct, zoneVitesses: zoneVitesses, allureChrono: allureChrono,
    trouverZone: trouverZone, reperesSeance: reperesSeance, normCode: normCode, chercherCode: chercherCode,
    estRepos: estRepos, aContenuCoach: aContenuCoach, aRetour: aRetour, bilanJours: bilanJours, joursSemaine: joursSemaine, prochaineCompet: prochaineCompet,
    regrouperVertical: regrouperVertical, nouvelAthlete: nouvelAthlete, nettoyerJour: nettoyerJour, idAthlete: idAthlete, fusionner: fusionner,
    lireXLSX: lireXLSX, importerClasseur: importerClasseur, versCSV: versCSV, TESTS: TESTS, runTests: runTests
  };
})();
