// Assemble les deux applications en fichiers uniques (sans dépendance) : node outils/assembler.mjs
//  - index.html          : Respir Outdoor Coach (entraîneur)
//  - athlete/index.html  : My RespirOutdoor (athlète)
// Sources : src/ (core.js, commun.js, coach.js, athlete.js, styles.css, defauts.json, *.html) et icons/logo.png.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = p => readFileSync(join(racine, p), 'utf8');
const logo = 'data:image/png;base64,' + readFileSync(join(racine, 'icons', 'logo.png')).toString('base64');
const defauts = JSON.stringify(JSON.parse(lire('src/defauts.json'))).replace(/<\//g, '<\\/');
const commun = { __STYLES__: lire('src/styles.css').trim(), __CORE__: lire('src/core.js').trim(), __DEFAUTS__: defauts, __COMMUN__: lire('src/commun.js').trim(), __AIDE__: lire('src/aide.js').trim(), __LOGO__: logo };

function assembler(modele, app, sortie) {
  let html = lire(modele);
  const valeurs = { ...commun, __APP__: lire(app).trim() };
  for (const [cle, val] of Object.entries(valeurs)) html = html.split(cle).join(val);
  if (/__[A-Z]+__/.test(html)) throw new Error('marqueur non remplacé dans ' + sortie);
  mkdirSync(dirname(join(racine, sortie)), { recursive: true });
  writeFileSync(join(racine, sortie), html);
  console.log(sortie + ' : ' + Math.round(html.length / 1024) + ' Ko');
}
assembler('src/coach.html', 'src/coach.js', 'index.html');
assembler('src/athlete.html', 'src/athlete.js', 'athlete/index.html');
