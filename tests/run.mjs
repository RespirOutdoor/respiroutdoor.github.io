// Exécute les autotests du cœur de calcul hors navigateur : node tests/run.mjs
// Le bloc <script id="core"> est extrait de index.html : on teste exactement le code livré.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ici = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(ici, '..', 'index.html'), 'utf8');
const m = /<script id="core">([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.error('Bloc <script id="core"> introuvable'); process.exit(2); }
const Core = new Function(m[1] + '\nreturn Core;')();
const res = Core.runTests();
let ko = 0;
for (const r of res) {
  if (!r.ok) ko++;
  console.log(`${r.ok ? 'OK   ' : 'ÉCHEC'}  ${r.nom}${r.err ? ' — ' + r.err : ''}`);
}
console.log(`\n${res.length - ko} / ${res.length} tests réussis`);
process.exit(ko ? 1 : 0);
