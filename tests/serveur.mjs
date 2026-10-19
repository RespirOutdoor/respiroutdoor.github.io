// Tests du service Google (google/Code.gs) sur un tableur simulé : node tests/serveur.mjs
import { creerServeur } from './gas-simule.mjs';

const tests = [];
const test = (nom, f) => tests.push([nom, f]);
const vrai = (c, m) => { if (!c) throw new Error(m || 'assertion fausse'); };

function preparer() {
  const s = creerServeur();
  const cle = s.installer();
  const athlete = { id: 'MORERA_SYLVAIN', prenom: 'SYLVAIN', nom: 'MORERA', code: 'K7Q2XA', motCoach: 'Bonne semaine', vma: 19.6, objectif: 'Cross' };
  const jours = {
    '2026-10-13': { corps: "5x (200M 100% RT1')", type: 'VMAC', eveil: '15' },
    '2026-10-14': { corps: 'REPOS' },
    '2026-10-16': { corps: '1H30 MAX', type: 'EF' }
  };
  const r = s.appel({ action: 'coach.publier', cle, athlete, jours });
  vrai(r.ok, JSON.stringify(r));
  return { s, cle, athlete, jours };
}

test('Installation : clé entraîneur créée et stable', () => {
  const s = creerServeur(); const k1 = s.installer(), k2 = s.installer();
  vrai(k1.length === 24 && k1 === k2);
  vrai(s.feuilles['Réglages'].cellules[0][1] === k1);
});
test('Clé incorrecte refusée ; action inconnue refusée', () => {
  const { s } = preparer();
  vrai(s.appel({ action: 'coach.lire', cle: 'faux' }).erreur === 'clé entraîneur incorrecte');
  vrai(s.appel({ action: 'pirater' }).ok === false);
});
test('Athlète : lecture par code (minuscules acceptées), fiche et plan reçus, lien marqué ouvert', () => {
  const { s } = preparer();
  const r = s.appel({ action: 'athlete.lire', code: 'k7q2xa' });
  vrai(r.ok && r.athlete.prenom === 'SYLVAIN' && r.athlete.fiche.vma === 19.6 && r.athlete.motCoach === 'Bonne semaine');
  vrai(r.jours['2026-10-13'].type === 'VMAC' && r.jours['2026-10-14'].corps === 'REPOS');
  vrai(s.feuilles.Athletes.cellules[1][7] !== '', 'lien ouvert non noté');
});
test('Athlète : code inconnu refusé', () => {
  const { s } = preparer();
  vrai(/lien inconnu/.test(s.appel({ action: 'athlete.lire', code: 'ZZZZZZ' }).erreur));
});
test('Athlète : saisie enregistrée (nombres relus comme nombres) puis visible par l\'entraîneur', () => {
  const { s, cle } = preparer();
  const r = s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 10.26, dureeSec: 2751, rpe: 9, dplus: 20, notes: 'Belle séance', majA: '2026-10-13T19:00:00.000Z' } } });
  vrai(r.ok && r.jours['2026-10-13'].km === 10.26);
  const c = s.appel({ action: 'coach.lire', cle });
  const j = c.athletes.MORERA_SYLVAIN.jours['2026-10-13'];
  vrai(j.km === 10.26 && j.dureeSec === 2751 && j.rpe === 9 && j.notes === 'Belle séance' && j.majA === '2026-10-13T19:00:00.000Z', JSON.stringify(j));
});
test('FC moyenne : enregistrée, relue comme nombre, visible par l\'entraîneur ; FC 260 refusée', () => {
  const { s, cle } = preparer();
  vrai(s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 10, fc: 152, majA: '2026-10-13T19:00:00.000Z' } } }).ok);
  vrai(s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).jours['2026-10-13'].fc === 152);
  vrai(s.appel({ action: 'coach.lire', cle }).athletes.MORERA_SYLVAIN.jours['2026-10-13'].fc === 152);
  vrai(/valeur invalide/.test(s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { fc: 260 } } }).erreur));
});
test('Onglet créé par la version 1 (16 colonnes) : données non décalées, en-tête FC ajoutée', () => {
  const { s } = preparer();
  vrai(s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 8, rpe: 4, notes: 'ok', majA: '2026-10-13T19:00:00.000Z' } } }).ok);
  const f = s.feuilles['J_MORERA_SYLVAIN'];
  f.cellules.forEach(l => { l.length = Math.min(l.length, 16); }); // retire la colonne FC comme dans un ancien onglet
  let j = s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).jours['2026-10-13'];
  vrai(j.km === 8 && j.rpe === 4 && j.notes === 'ok' && j.fc === '', JSON.stringify(j));
  vrai(s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 8, rpe: 4, notes: 'ok', fc: 148, majA: '2026-10-13T20:00:00.000Z' } } }).ok);
  j = s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).jours['2026-10-13'];
  vrai(j.km === 8 && j.rpe === 4 && j.notes === 'ok' && j.fc === 148, JSON.stringify(j));
  vrai(f.cellules[0][16] === 'FC moy. (bpm)' && f.cellules[0][13] === 'Notes', JSON.stringify(f.cellules[0]));
});
test('Nouvel appareil de l\'entraîneur : fiche, code, plan et saisies récupérés ; clé exigée', () => {
  const { s, cle } = preparer();
  vrai(s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 9, fc: 150, majA: '2026-10-13T19:00:00.000Z' } } }).ok);
  vrai(s.appel({ action: 'coach.recuperer', cle: 'faux', ids: [] }).ok === false);
  const r = s.appel({ action: 'coach.recuperer', cle, ids: ['MORERA_SYLVAIN'] });
  const a = r.athletes[0];
  vrai(r.ok && r.athletes.length === 1 && a.code === 'K7Q2XA' && a.prenom === 'SYLVAIN' && a.fiche.vma === 19.6 && a.fiche.objectif === 'Cross' && a.motCoach === 'Bonne semaine', JSON.stringify(a));
  vrai(a.jours['2026-10-13'].type === 'VMAC' && a.jours['2026-10-13'].km === 9 && a.jours['2026-10-13'].fc === 150 && a.jours['2026-10-14'].corps === 'REPOS', JSON.stringify(a.jours));
  vrai(s.appel({ action: 'coach.recuperer', cle, ids: ['AUTRE'] }).athletes.length === 0);
});
test('Messagerie : athlète et entraîneur s\'écrivent, messages lus marqués, cloisonnement par athlète', () => {
  const { s, cle } = preparer();
  vrai(s.appel({ action: 'coach.publier', cle, athlete: { id: 'AUTRE', prenom: 'B', nom: 'C', code: 'ZZZZZ2' }, jours: {} }).ok);
  const m1 = s.appel({ action: 'athlete.ecrire', code: 'K7Q2XA', texte: 'Bonjour coach' });
  vrai(m1.ok && m1.message.de === 'athlete' && m1.message.athlete === 'MORERA_SYLVAIN', JSON.stringify(m1));
  vrai(s.appel({ action: 'coach.ecrire', cle, id: 'MORERA_SYLVAIN', texte: 'Salut Sylvain' }).ok);
  vrai(s.appel({ action: 'coach.ecrire', cle, id: 'AUTRE', texte: 'Pour B' }).ok);
  vrai(s.appel({ action: 'athlete.ecrire', code: 'K7Q2XA', texte: '   ' }).ok === false);
  vrai(s.appel({ action: 'coach.ecrire', cle: 'faux', id: 'MORERA_SYLVAIN', texte: 'x' }).ok === false);
  let r = s.appel({ action: 'athlete.messages', code: 'K7Q2XA' });
  vrai(r.messages.length === 2 && r.messages[0].texte === 'Bonjour coach' && r.messages[1].texte === 'Salut Sylvain' && !r.messages[1].lu, JSON.stringify(r.messages));
  r = s.appel({ action: 'athlete.messages', code: 'K7Q2XA', lus: true });
  vrai(r.messages[1].lu !== '' && r.messages[0].lu === '', 'lecture athlète');
  let c = s.appel({ action: 'coach.messages', cle });
  vrai(c.messages.length === 3 && c.messages.filter(m => m.de === 'athlete' && !m.lu).length === 1);
  vrai(s.appel({ action: 'coach.lus', cle, id: 'MORERA_SYLVAIN' }).ok);
  c = s.appel({ action: 'coach.messages', cle });
  vrai(c.messages.filter(m => m.de === 'athlete' && !m.lu).length === 0);
  vrai(s.appel({ action: 'athlete.messages', code: 'ZZZZZ2' }).messages.length === 1);
});
test('Nouvelle publication de l\'entraîneur (nouvel Excel) : plan remplacé, saisie de l\'athlète intacte', () => {
  const { s, cle, athlete } = preparer();
  s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 10, rpe: 8, majA: '2026-10-13T19:00:00.000Z' } } });
  const nouveau = { '2026-10-13': { corps: '6x200M', type: 'VMAC', km: 99, reaction: '💪' }, '2026-10-17': { corps: '30x30' } };
  vrai(s.appel({ action: 'coach.publier', cle, athlete, jours: nouveau }).ok);
  const r = s.appel({ action: 'athlete.lire', code: 'K7Q2XA' });
  const j = r.jours['2026-10-13'];
  vrai(j.corps === '6x200M' && j.km === 10 && j.rpe === 8 && j.reaction === '💪', JSON.stringify(j));
  vrai(!r.jours['2026-10-14'] && !r.jours['2026-10-16'], 'jours retirés du plan toujours présents');
  vrai(r.jours['2026-10-17'].corps === '30x30');
});
test('Jour retiré du plan mais déjà saisi par l\'athlète : la saisie reste', () => {
  const { s, cle, athlete } = preparer();
  s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-16': { km: 15, majA: '2026-10-16T19:00:00.000Z' } } });
  s.appel({ action: 'coach.publier', cle, athlete, jours: {} });
  const j = s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).jours['2026-10-16'];
  vrai(j && j.km === 15 && !j.corps);
});
test('Publication avec valeurs athlète (ancien Excel) : ne remplit que les jours vides', () => {
  const { s, cle, athlete } = preparer();
  s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 10, majA: '2026-10-13T19:00:00.000Z' } } });
  s.appel({ action: 'coach.publier', cle, athlete, jours: { '2026-10-13': { corps: 'A', km: 50 }, '2026-10-16': { corps: 'B', km: 14.05 } } });
  const r = s.appel({ action: 'athlete.lire', code: 'K7Q2XA' });
  vrai(r.jours['2026-10-13'].km === 10 && r.jours['2026-10-16'].km === 14.05);
});
test('Deux appareils : une saisie plus ancienne ne remplace pas une plus récente', () => {
  const { s } = preparer();
  s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 12, majA: '2026-10-13T20:00:00.000Z' } } });
  const r = s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 9, majA: '2026-10-13T18:00:00.000Z' } } });
  vrai(r.refuses.length === 1 && s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).jours['2026-10-13'].km === 12);
});
test('Valeur athlète invalide refusée (RPE 11)', () => {
  const { s } = preparer();
  vrai(/valeur invalide/.test(s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { rpe: 11 } } }).erreur));
});
test('Nouveau lien : l\'ancien code ne fonctionne plus', () => {
  const { s, cle, athlete, jours } = preparer();
  s.appel({ action: 'coach.publier', cle, athlete: { ...athlete, code: 'NEW234' }, jours });
  vrai(!s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).ok && s.appel({ action: 'athlete.lire', code: 'NEW234' }).ok);
});
test('Code déjà pris par un autre athlète refusé', () => {
  const { s, cle } = preparer();
  vrai(/déjà utilisé/.test(s.appel({ action: 'coach.publier', cle, athlete: { id: 'AUTRE', code: 'K7Q2XA' }, jours: {} }).erreur));
});
test('Légende, protocoles et mot du coach à tous transmis à l\'athlète', () => {
  const { s, cle } = preparer();
  s.appel({ action: 'coach.commun', cle, legende: { types: [{ code: 'EF' }] }, protos: [{ code: 'PC5' }], motGlobal: 'Bravo à tous' });
  const c = s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).commun;
  vrai(c.legende.types[0].code === 'EF' && c.protos[0].code === 'PC5' && c.motGlobal === 'Bravo à tous');
});
test('Lecture entraîneur incrémentale : seules les saisies reçues après « depuis », même saisies hors connexion avant', () => {
  const { s, cle } = preparer();
  s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-13': { km: 10, majA: '2026-10-13T19:00:00.000Z' } } });
  const depuis = s.appel({ action: 'coach.lire', cle }).heure;
  const attendre = Date.now() + 5; while (Date.now() < attendre) { /* horloge du serveur qui avance */ }
  // Saisie faite hors connexion AVANT la dernière lecture de l'entraîneur, envoyée APRÈS
  s.appel({ action: 'athlete.saisir', code: 'K7Q2XA', jours: { '2026-10-12': { km: 8, majA: '2026-10-12T07:00:00.000Z' } } });
  const j = s.appel({ action: 'coach.lire', cle, depuis }).athletes.MORERA_SYLVAIN.jours;
  vrai(Object.keys(j).join() === '2026-10-12', Object.keys(j).join());
});
test('Suppression d\'un athlète : ligne et onglet retirés, lien inactif', () => {
  const { s, cle } = preparer();
  vrai(s.appel({ action: 'coach.supprimer', cle, id: 'MORERA_SYLVAIN' }).ok);
  vrai(!s.feuilles.J_MORERA_SYLVAIN && !s.appel({ action: 'athlete.lire', code: 'K7Q2XA' }).ok);
});
test('Tableur lisible : en-têtes en français, une ligne par jour triée par date', () => {
  const { s } = preparer();
  const f = s.feuilles.J_MORERA_SYLVAIN.cellules;
  vrai(f[0][0] === 'Date' && f[0][3] === 'Corps de séance' && f[1][0] === '2026-10-13' && f[3][0] === '2026-10-16');
});

let ko = 0;
for (const [nom, f] of tests) {
  try { f(); console.log('OK     ' + nom); } catch (e) { ko++; console.log('ÉCHEC  ' + nom + ' — ' + e.message); }
}
console.log(`\n${tests.length - ko} / ${tests.length} tests réussis`);
process.exit(ko ? 1 : 0);
