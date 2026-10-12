// Autotests du cœur de calcul : node tests/run.mjs
// Le bloc <script id="core"> est extrait de index.html : on teste exactement le code livré.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
let ko = 0, total = 0;
for (const fichier of ['index.html', 'athlete/index.html']) {
  const html = readFileSync(join(ici, '..', fichier), 'utf8');
  const m = /<script id="core">([\s\S]*?)<\/script>/.exec(html);
  if (!m) { console.error('Bloc <script id="core"> introuvable dans ' + fichier); process.exit(2); }
  const Core = new Function(m[1] + '\nreturn Core;')();
  const res = Core.runTests();
  console.log(`--- ${fichier}`);
  for (const r of res) {
    total++;
    if (!r.ok) ko++;
    console.log(`${r.ok ? 'OK   ' : 'ÉCHEC'}  ${r.nom}${r.err ? ' — ' + r.err : ''}`);
  }
}
console.log(`\n${total - ko} / ${total} tests réussis`);
process.exit(ko ? 1 : 0);
