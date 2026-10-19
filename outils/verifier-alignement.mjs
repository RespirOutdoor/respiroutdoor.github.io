// Contrôle de mise en page des deux applications : node outils/verifier-alignement.mjs
// Ouvre chaque vue (athlète et entraîneur) sur des écrans de téléphone de 390 et 320 px, avec un plan d'exemple
// (séance du jour saisie, course, protocole, séance pas réalisée, décalée, réaction, message, mot du coach), puis vérifie :
//  - que toutes les cartes de premier niveau ont les mêmes bords gauche et droit, contours et ombres compris ;
//  - qu'aucune carte n'en touche ou n'en chevauche une autre (au moins 8 px d'écart) ;
//  - qu'aucune vue ne déborde en largeur.
// Option : CAPTURES=dossier enregistre une capture de chaque vue (mode sombre) pour un contrôle à l'œil.
// Demande Playwright (Chromium). Les données passent par le service Google simulé de tests/gas-simule.mjs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright')); }
const { creerServeur } = await import('../tests/gas-simule.mjs');

// Petit serveur de fichiers pour les deux applications
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const http = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  try { const d = await readFile(join(racine, p)); res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(d); }
  catch (e) { res.writeHead(404); res.end(); }
}).listen(0);
const BASE = 'http://localhost:' + http.address().port + '/';

// Plan d'exemple autour d'aujourd'hui
const srv = creerServeur(); const CLE = srv.installer();
const aj = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
const j = n => { const x = new Date(aj + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const lundi = (() => { const x = new Date(aj + 'T12:00:00Z'), d = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - d - 14); return x.toISOString().slice(0, 10); })();
const jours = {};
jours[j(-3)] = { corps: '5x1000M', type: 'VMA', notes: '[PAS RÉALISÉE · Fatigue] Grosse semaine', majA: '2026-01-01T10:00:00Z' };
jours[j(-2)] = { corps: 'FOOTING', type: 'EF', notes: '[DÉCALÉE AU ' + j(1) + ' · Manque de temps] ', majA: '2026-01-01T10:00:00Z' };
jours[j(-1)] = { corps: 'SORTIE LONGUE', type: 'EF' };
jours[aj] = { corps: '45 MIN FOOTING', type: 'EF', eveil: '15', km: 8.4, dureeSec: 2550, dplus: 60, fc: 140, rpe: 3, notes: 'Bonnes jambes', reaction: '👍 Bien', majA: '2026-01-01T10:00:00Z' };
jours[j(1)] = { corps: '10x400M', type: 'VMA', eveil: '15', educ: '10', rac: '10' };
jours[j(2)] = { corps: 'PROTOCOLE PRE-COMPET', type: 'PROTO' };
jours[j(3)] = { corps: '10 KM ROUTE', type: 'COMP' };
srv.appel({ action: 'coach.publier', cle: CLE, athlete: { id: 'DEMO_CAMILLE', prenom: 'Camille', nom: 'Demo', code: 'K7Q2XA', motCoach: 'Bonne semaine', vma: 17, debut: lundi, contratSemaines: 20, objectif: 'Objectif 10 km' }, jours });
srv.appel({ action: 'coach.commun', cle: CLE, motGlobal: 'Semaine importante : on soigne la récup.', legende: null, protos: [] });
srv.appel({ action: 'athlete.ecrire', code: 'K7Q2XA', texte: 'Bonjour Manu, tout va bien.' });
srv.appel({ action: 'coach.ecrire', cle: CLE, id: 'DEMO_CAMILLE', texte: 'Parfait, continue comme ça.' });
const SERVICE = 'https://script.google.com/macros/s/TEST/exec';

const nav = await chromium.launch();
const problemes = [];
async function contexte(largeur) {
  const ctx = await nav.newContext({ viewport: { width: largeur, height: 844 }, deviceScaleFactor: process.env.CAPTURES ? 2 : 1, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: process.env.CAPTURES ? 'dark' : 'light' });
  await ctx.route('**/config.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ service: SERVICE }) }));
  await ctx.route(SERVICE, async r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(srv.appel(JSON.parse(r.request().postData() || '{}'))) }));
  return ctx;
}
// Mesure dans la page : bords visuels (avec contour/ombre extérieurs) des cartes de premier niveau, écarts verticaux
async function auditer(p, app, vue, largeur) {
  const r = await p.evaluate(largeur => {
    const main = document.getElementById('contenu');
    const sel = 'section.carte, article.jour, section.alerte, p.alerte, .carte';
    const blocs = [...main.querySelectorAll(sel)].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0 && !e.parentElement.closest(sel));
    const etendue = e => {
      const r = e.getBoundingClientRect(); let ext = 0;
      (getComputedStyle(e).boxShadow || '').split(/,(?![^(]*\))/).forEach(s => {
        if (/inset/.test(s) || s === 'none') return;
        const n = (s.replace(/rgba?\([^)]*\)/g, '').match(/-?\d+(\.\d+)?px/g) || []).map(parseFloat);
        if (n.length >= 4 && n[0] === 0 && n[1] === 0 && n[2] === 0) ext = Math.max(ext, n[3]); // contour plein (sans flou)
      });
      return { g: r.left - ext, d: r.right + ext, h: r.top, b: r.bottom, nom: (e.className || e.tagName) + ' « ' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + ' »' };
    };
    // Sur téléphone, une page trop large élargit la fenêtre : on compare à la largeur réelle de l'écran
    return { blocs: blocs.map(etendue), debord: Math.max(document.documentElement.scrollWidth, window.innerWidth) > largeur + 1 };
  }, largeur);
  if (process.env.CAPTURES) await p.screenshot({ path: `${process.env.CAPTURES}/${app}-${vue}-${largeur}.png`, fullPage: true });
  if (r.debord) problemes.push(`${app}/${vue} ${largeur}px : la page déborde en largeur`);
  const b = r.blocs; if (!b.length) return;
  const mode = arr => { const c = {}; arr.forEach(v => { const k = Math.round(v); c[k] = (c[k] || 0) + 1; }); return +Object.keys(c).sort((x, y) => c[y] - c[x])[0]; };
  const G = mode(b.map(x => x.g)), D = mode(b.map(x => x.d));
  b.forEach(x => { if (Math.abs(x.g - G) > 1 || Math.abs(x.d - D) > 1) problemes.push(`${app}/${vue} ${largeur}px : ${x.nom} bords ${Math.round(x.g)}–${Math.round(x.d)} au lieu de ${G}–${D}`); });
  const tri = b.slice().sort((x, y) => x.h - y.h);
  for (let i = 1; i < tri.length; i++) { const e = tri[i].h - tri[i - 1].b; if (e < 8) problemes.push(`${app}/${vue} ${largeur}px : ${tri[i - 1].nom} et ${tri[i].nom} séparées de ${Math.round(e)} px`); }
}

for (const largeur of [390, 320]) {
  // Athlète
  const ca = await contexte(largeur), a = await ca.newPage();
  await a.goto(BASE + 'athlete/#RespirOutdoor-Camille-Demo-K7Q2XA'); await a.waitForSelector('h2.titre-section'); await a.waitForTimeout(3200);
  for (const v of ['accueil', 'plan', 'messages', 'allures', 'legende', 'protos']) {
    await a.evaluate(v => document.querySelector(`nav.onglets button[data-v="${v}"]`).click(), v); await a.waitForTimeout(500);
    await auditer(a, 'athlète', v, largeur);
  }
  await ca.close();
  // Entraîneur (récupère l'athlète depuis le service simulé)
  const cc = await contexte(largeur), c = await cc.newPage(); c.on('dialog', d => d.accept());
  await c.goto(BASE + 'index.html#/reglages'); await c.waitForTimeout(2600);
  await c.fill('input[name="cle"]', CLE); await c.click('#fSync button:has-text("Enregistrer et tester")'); await c.waitForTimeout(2500);
  for (const v of ['athletes', 'plan', 'messages', 'allures', 'legende', 'protos', 'reglages']) {
    await c.goto(BASE + 'index.html#/' + v); await c.waitForTimeout(700);
    await auditer(c, 'entraîneur', v, largeur);
  }
  await cc.close();
}
await nav.close(); http.close();
if (problemes.length) { console.log(problemes.length + ' problème(s) de mise en page :'); problemes.forEach(x => console.log(' - ' + x)); process.exit(1); }
console.log('Mise en page : cartes alignées et espacées dans toutes les vues (390 et 320 px)');
