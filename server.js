// Escala Pão com Linguiça — servidor
// Requisitos: Node 18+ (fetch nativo). Banco: arquivo JSON em data/db.json.
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PIN = process.env.ADMIN_PIN || '';            // opcional: protege edição/sync
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const SYNC_MIN = Number(process.env.SYNC_MINUTES || 5);

/* ---------------- Banco (arquivo JSON) ---------------- */
function dbLoad() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { config: { sheetUrl: '', lastSync: null }, respostas: [], removidos: [] }; }
}
function dbSave(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
let db = dbLoad();
// Permite fixar o link da planilha por variável de ambiente (ex.: cPanel).
// Só é usado quando ainda não há um link salvo no banco.
if (!db.config.sheetUrl && process.env.SHEET_URL) {
  db.config.sheetUrl = String(process.env.SHEET_URL).trim();
}

/* ---------------- Utilidades ---------------- */
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

// Parser de CSV com suporte a campos entre aspas (vírgulas internas)
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Identifica colunas pelo conteúdo (tolera cabeçalho, carimbo de data/hora, ordem diferente)
function mapearLinha(cels) {
  cels = cels.map(c => String(c || '').trim());
  if (cels.filter(Boolean).length < 2) return null;
  const usados = new Set();
  const p = { nome: '', fone: '', pastoral: '', funcTexto: '', diasTexto: '' };
  cels.forEach((c, i) => { if (!usados.has(i) && c && /vinagrete|montagem|atendimento|final da festa/i.test(c)) { p.funcTexto = c; usados.add(i); } });
  cels.forEach((c, i) => { if (!usados.has(i) && c && /s[áa]b|s[áa]d|domingo/i.test(c) && /\d/.test(c)) { p.diasTexto = c; usados.add(i); } });
  cels.forEach((c, i) => {
    if (usados.has(i) || !c) return;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(c)) { usados.add(i); return; } // carimbo do Forms
    const dig = (c.match(/\d/g) || []).length;
    if (!p.fone && dig >= 8 && dig / c.length > 0.5) { p.fone = c; usados.add(i); }
  });
  cels.forEach((c, i) => { if (!usados.has(i) && c && /pascom|pastoral|juventude|missio|vocacional|catequese|liturgia|d[íi]zimo/i.test(c)) { p.pastoral = c; usados.add(i); } });
  cels.forEach((c, i) => { if (!usados.has(i) && c && !p.nome) { p.nome = c; usados.add(i); } });
  cels.forEach((c, i) => { if (!usados.has(i) && c && !p.pastoral) { p.pastoral = c; usados.add(i); } });
  if (!p.nome || (!p.funcTexto && !p.diasTexto)) return null;
  if (/^nome$/i.test(p.nome)) return null;
  return p;
}

async function sincronizar() {
  const url = db.config.sheetUrl;
  if (!url) throw new Error('Nenhum link de planilha configurado.');
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error('A planilha respondeu com erro ' + resp.status + '. Confira se está publicada na web em formato CSV.');
  const texto = await resp.text();
  if (/<html/i.test(texto.slice(0, 200))) throw new Error('O link devolveu uma página, não um CSV. Use Arquivo → Compartilhar → Publicar na web → CSV.');
  const linhas = parseCSV(texto);
  const respostas = [];
  linhas.forEach((cels, i) => { const p = mapearLinha(cels); if (p) respostas.push({ ...p, ordem: i }); });
  if (!respostas.length) throw new Error('Nenhuma resposta reconhecida no CSV.');
  // Preserva entradas adicionadas manualmente que não estejam no CSV
  const nomesSyncados = new Set(respostas.map(p => norm(p.nome)));
  const manuais = (db.respostas || []).filter(p => p.manual && !nomesSyncados.has(norm(p.nome)));
  db.respostas = [...respostas, ...manuais.map((p, i) => ({ ...p, ordem: respostas.length + i }))];
  db.config.lastSync = new Date().toISOString();
  dbSave(db);
  return respostas.length;
}

/* ---------------- App ---------------- */
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// PIN opcional para rotas que alteram dados
function exigePin(req, res, next) {
  if (!PIN) return next();
  if (req.headers['x-pin'] === PIN) return next();
  res.status(401).json({ erro: 'PIN incorreto ou ausente.' });
}

app.get('/api/dados', (_req, res) => {
  res.json({
    respostas: db.respostas,
    removidos: db.removidos,
    sheetConfigurada: Boolean(db.config.sheetUrl),
    lastSync: db.config.lastSync,
    pinAtivo: Boolean(PIN)
  });
});

app.post('/api/config', exigePin, (req, res) => {
  const url = String(req.body.sheetUrl || '').trim();
  if (url && !/^https:\/\//.test(url)) return res.status(400).json({ erro: 'O link precisa começar com https://' });
  db.config.sheetUrl = url; dbSave(db);
  res.json({ ok: true });
});

app.post('/api/sync', exigePin, async (_req, res) => {
  try { const n = await sincronizar(); res.json({ ok: true, respostas: n, lastSync: db.config.lastSync }); }
  catch (e) { res.status(400).json({ erro: e.message }); }
});

// Importação manual (colar TSV) — continua disponível como alternativa
app.post('/api/importar', exigePin, (req, res) => {
  const { texto, substituir } = req.body;
  if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Nada para importar.' });
  if (substituir) db.respostas = [];
  let base = db.respostas.length, ok = 0;
  String(texto).split(/\r?\n/).forEach(l => {
    if (!l.trim()) return;
    const p = mapearLinha(l.split('\t'));
    if (p) { db.respostas.push({ ...p, ordem: base + ok }); ok++; }
  });
  if (!ok) return res.status(400).json({ erro: 'Nenhuma linha reconhecida.' });
  dbSave(db);
  res.json({ ok: true, importadas: ok });
});

app.post('/api/remover', exigePin, (req, res) => {
  const { nome, turno, dia } = req.body;
  if (!nome || !turno || !dia) return res.status(400).json({ erro: 'Informe nome, turno e dia.' });
  const chave = { nome: norm(nome), turno, dia };
  if (!db.removidos.some(r => r.nome === chave.nome && r.turno === turno && r.dia === dia)) {
    db.removidos.push({ ...chave, nomeOriginal: nome, em: new Date().toISOString() });
    dbSave(db);
  }
  res.json({ ok: true });
});

app.post('/api/restaurar', exigePin, (req, res) => {
  const { nome, turno, dia } = req.body;
  db.removidos = db.removidos.filter(r => !(r.nome === norm(nome) && r.turno === turno && r.dia === dia));
  dbSave(db);
  res.json({ ok: true });
});

app.post('/api/adicionar', exigePin, (req, res) => {
  const { nome, fone, pastoral, turnos, dias } = req.body;
  if (!nome || !String(nome).trim()) return res.status(400).json({ erro: 'Nome é obrigatório.' });
  const TURNO_TEXTO = { tarde: 'vinagrete', noite: 'montagem', fim: 'final da festa' };
  const funcTexto = (Array.isArray(turnos) ? turnos : []).map(t => TURNO_TEXTO[t] || t).join(', ');
  const diasTexto = (Array.isArray(dias) ? dias : []).join(', ');
  db.respostas.push({
    nome: String(nome).trim(),
    fone: String(fone || '').trim(),
    pastoral: String(pastoral || '').trim(),
    funcTexto, diasTexto,
    manual: true,
    ordem: db.respostas.length
  });
  dbSave(db);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Escala no ar: http://localhost:${PORT}` + (PIN ? ' (PIN de edição ativo)' : ''));
  // Sincronização automática
  if (SYNC_MIN > 0) setInterval(() => {
    if (db.config.sheetUrl) sincronizar().then(n => console.log(`[sync] ${n} respostas`)).catch(e => console.log('[sync] ' + e.message));
  }, SYNC_MIN * 60 * 1000);
  if (db.config.sheetUrl) sincronizar().catch(e => console.log('[sync inicial] ' + e.message));
});
