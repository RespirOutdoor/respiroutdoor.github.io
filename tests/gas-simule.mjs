// Simulation minimale de Google Apps Script (tableur, propriétés, verrou, réponses web)
// pour tester google/Code.gs sous Node, sans compte Google.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

class Feuille {
  constructor(nom) { this.nom = nom; this.cellules = []; this.texte = false; }
  getLastRow() {
    for (let r = this.cellules.length - 1; r >= 0; r--) if ((this.cellules[r] || []).some(v => v !== '' && v != null)) return r + 1;
    return 0;
  }
  getRange(r, c, nr = 1, nc = 1) {
    const f = this;
    return {
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const l = []; for (let j = 0; j < nc; j++) { const v = (f.cellules[r - 1 + i] || [])[c - 1 + j]; l.push(v == null ? '' : v); } out.push(l); }
        return out;
      },
      setValues(vals) {
        if (vals.length !== nr || vals.some(l => l.length !== nc)) throw new Error('dimensions incorrectes');
        // Format « texte brut » : le tableur garde le texte saisi (les nombres deviennent du texte)
        vals.forEach((l, i) => l.forEach((v, j) => { (f.cellules[r - 1 + i] = f.cellules[r - 1 + i] || [])[c - 1 + j] = f.texte && v !== '' ? String(v) : v; }));
        return this;
      },
      setNumberFormat(fmt) { if (fmt === '@') f.texte = true; return this; },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (f.cellules[r - 1 + i]) f.cellules[r - 1 + i][c - 1 + j] = ''; return this; }
    };
  }
  deleteRow(r) { this.cellules.splice(r - 1, 1); }
}

export function creerServeur() {
  const feuilles = {}, props = {};
  const ss = {
    getSheetByName: n => feuilles[n] || null,
    insertSheet: n => (feuilles[n] = new Feuille(n)),
    deleteSheet: f => { delete feuilles[f.nom]; }
  };
  const g = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ contenu: s, setMimeType() { return this; }, getContent() { return s; } })
    },
    Utilities: { getUuid: () => randomUUID(), formatDate: d => d.toISOString().slice(0, 10) }
  };
  const ici = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(ici, '..', 'google', 'Code.gs'), 'utf8');
  const mod = new Function(...Object.keys(g), src + '\nreturn { doPost, doGet, installer };')(...Object.values(g));
  return {
    feuilles, installer: mod.installer, doGet: mod.doGet,
    appel(corps) { return JSON.parse(mod.doPost({ postData: { contents: JSON.stringify(corps) } }).getContent()); }
  };
}
