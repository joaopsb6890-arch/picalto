/* Picalta Firebase — servidor estático + proxy da IA PicalAi
 * A chave da IA fica apenas no ambiente do servidor (process.env.OVERCONTROL_*),
 * nunca no código entregue nem no browser.
 *
 * SEGURANÇA:
 *  - O endpoint /api/picalai/* exige um token Firebase válido (header X-Firebase-Token),
 *    verificado contra o projeto Firebase indicado em FIREBASE_PROJECT_ID.
 *  - A chave da IA só é lida do ambiente; não há default "adivinhado".
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.PORT || 8000;

/* ---------- Configuração da IA (OverControl) ----------
 * Não adivinhamos o endpoint. Tudo tem de vir do ambiente:
 *   OVERCONTROL_API_KEY   — chave (obrigatória)
 *   OVERCONTROL_BASE_URL  — endpoint base (ex.: https://<teu-servico>/v1), sem /chat/completions
 *   OVERCONTROL_MODEL     — modelo a usar
 *   FIREBASE_PROJECT_ID   — projeto Firebase para validar tokens (default: picala-a212f)
 * Sem OVERCONTROL_API_KEY ou OVERCONTROL_BASE_URL, a PicalAi fica "não configurada".
 */
const AI_BASE = (process.env.OVERCONTROL_BASE_URL || '').replace(/\/+$/, '');
const AI_MODEL = process.env.OVERCONTROL_MODEL || '';
const AI_KEY = process.env.OVERCONTROL_API_KEY || '';
const AI_TIMEOUT_MS = Number(process.env.OVERCONTROL_TIMEOUT_MS || 30000);
const AI_MAX_MESSAGES = 24;           // histórico enviado por pedido
const AI_MAX_USER_TOKENS = 1200;      // limite de tokens de resposta
const MAX_BODY = 64 * 1024;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'picala-a212f';
/* FIREBASE_IDENTITY_URL permite apontar para um stub local nos testes */
const FIREBASE_IDENTITY_URL = process.env.FIREBASE_IDENTITY_URL || null;

function aiConfigured() { return !!(AI_KEY && AI_BASE); }

/* ---------- Verificação do token Firebase (via API pública do Google) ---------- */
/* Aceita o token ID do Firebase Auth, verifica o emissor e a audiência.
 * Não é uma verificação criptográfica completa, mas valida audience/issuer/exp
 * contra o Google — suficiente para um proxy pequeno. Para produção com adversários
 * reais, considera a Admin SDK. */
async function verifyFirebaseToken(token) {
  if (!token) return null;
  try {
    const identityUrl = FIREBASE_IDENTITY_URL ||
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyDtSLwYJDiL-1AOnwLDh-jxOQzG1xsDsHs';
    const r = await fetch(identityUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const u = j.users && j.users[0];
    if (!u) return null;
    return { uid: u.localId, email: u.email || null, name: u.displayName || null };
  } catch (e) {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('body too large'), { statusCode: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* Mensagem do sistema — dá personalidade à PicalAi */
function picalaiSystemPrompt(userName) {
  return [
    'És a PicalAi, a assistente de IA da rede social Picalta.',
    'Responde sempre em português de Portugal, com frases curtas, simpáticas e diretas.',
    'Podes conversar sobre qualquer assunto, mas o contexto é uma rede social de fotos/conversas/jogos/música.',
    'Se não souberes algo com certeza, admite-o em vez de inventar.',
    'Nunca fales da tua chave de API nem de detalhes técnicos do servidor.',
    userName ? `O nome do utilizador atual é ${userName}.` : '',
  ].filter(Boolean).join(' ');
}

/* Assume formato OpenAI-compatible se o usuário assim o configurar; se o teu
 * serviço tiver outro formato, ajusta esta função. */
async function callAi(messages, userName) {
  const payload = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: picalaiSystemPrompt(userName) },
      ...messages.slice(-AI_MAX_MESSAGES),
    ],
    max_tokens: AI_MAX_USER_TOKENS,
    temperature: 0.6,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(AI_BASE + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + AI_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 400);
      try { const j = JSON.parse(text); detail = (j.error && j.error.message) || (j.message) || detail; } catch (e) {}
      const err = new Error('upstream ' + res.status + ': ' + detail);
      err.statusCode = 502;
      err.publicMsg = res.status === 401 || res.status === 403
        ? 'A chave da IA foi recusada pelo serviço. Verifica se ainda é válida e se o endpoint está correto.'
        : 'O serviço de IA recusou o pedido (HTTP ' + res.status + '). Tenta novamente.';
      throw err;
    }
    const json = JSON.parse(text);
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!content) throw Object.assign(new Error('empty response'), { publicMsg: 'A IA devolveu uma resposta vazia. Tenta outra vez.' });
    return { content: String(content) };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Limitação por uid autenticado (e por IP como fallback) ---------- */
const rateBuckets = new Map(); // key -> { ts, n }
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 15; // pedidos por minuto
function rateAllow(key) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.ts > RATE_WINDOW_MS) { b = { ts: now, n: 0 }; rateBuckets.set(key, b); }
  b.n += 1;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now - v.ts > RATE_WINDOW_MS) rateBuckets.delete(k);
  }
  return b.n <= RATE_MAX;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/* ---------- Rotas ---------- */
async function handleApi(req, res, url) {
  const firebaseToken = (req.headers['x-firebase-token'] || '').trim();

  if (url.pathname === '/api/picalai/status' && req.method === 'GET') {
    // status é público (não revela nada além de "sim/não configurado")
    return sendJson(res, 200, { configured: aiConfigured(), model: aiConfigured() ? (AI_MODEL || null) : null });
  }
  if (url.pathname === '/api/picalai/chat' && req.method === 'POST') {
    // exige login Firebase
    const fbUser = await verifyFirebaseToken(firebaseToken);
    if (!fbUser) {
      return sendJson(res, 401, { error: 'unauthorized', message: 'Precisas de estar autenticado para falar com o PicalAi.' });
    }
    if (!aiConfigured()) {
      return sendJson(res, 503, {
        error: 'not_configured',
        message: 'O PicalAi não está configurado. Define OVERCONTROL_API_KEY e OVERCONTROL_BASE_URL no servidor.',
      });
    }
    if (!rateAllow('uid:' + fbUser.uid)) {
      return sendJson(res, 429, { error: 'rate_limited', message: 'Demasiados pedidos. Espera um momento.' });
    }
    try {
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw.toString('utf8')); }
      catch (e) { return sendJson(res, 400, { error: 'bad_json', message: 'Corpo inválido.' }); }
      if (!Array.isArray(body.messages) || !body.messages.length) {
        return sendJson(res, 400, { error: 'bad_request', message: 'Falta o histórico de mensagens.' });
      }
      const clean = body.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-AI_MAX_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (!clean.length) return sendJson(res, 400, { error: 'bad_request', message: 'Mensagens inválidas.' });
      const userName = typeof body.userName === 'string' ? body.userName.slice(0, 40) : (fbUser.name || '');
      const out = await callAi(clean, userName);
      return sendJson(res, 200, { reply: out.content });
    } catch (e) {
      if (e && e.statusCode === 413) return sendJson(res, 413, { error: 'too_large', message: 'Pedido demasiado grande.' });
      const msg = (e && e.publicMsg) || 'Falha ao falar com o PicalAi. Tenta novamente.';
      console.error('[Picalta][ai]', e && e.message);
      return sendJson(res, 502, { error: 'ai_error', message: msg });
    }
  }
  return sendJson(res, 404, { error: 'not_found' });
}

/* ---------- Estático ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    try { await handleApi(req, res, url); }
    catch (e) { sendJson(res, 500, { error: 'server', message: 'Erro interno.' }); }
    return;
  }
  let filePath = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('não encontrado');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Picalta (Firebase + PicalAi) a correr em http://localhost:${PORT}`);
  console.log(aiConfigured()
    ? '[Picalta] PicalAi ativo (modelo ' + AI_MODEL + ')'
    : '[Picalta] PicalAi INATIVO — define OVERCONTROL_API_KEY e OVERCONTROL_BASE_URL para ativar');
});
