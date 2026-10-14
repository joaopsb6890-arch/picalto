/* Picalta — PicalAi: assistente de IA via proxy do servidor (server.js)
 * O browser nunca vê a chave da IA — apenas chama /api/picalai/* no mesmo servidor.
 * Requer um token Firebase (header X-Firebase-Token) — o servidor valida.
 */
'use strict';

(function () {
  /* estado local do módulo (histórico e status), não usa o state global do app */
  let history = [];
  let status = null; // { configured, model }
  let sending = false;

  const $ = (s) => document.querySelector(s);

  function ensureUi() {
    // A vista "IA" já existe no index.html; liga os listeners uma vez.
    if (ensureUi._done) return;
    ensureUi._done = true;
    $('#ai-form').addEventListener('submit', onSubmit);
    $('#ai-clear-btn').addEventListener('click', () => {
      history = [];
      renderMessages();
      $('#ai-intro').style.display = '';
    });
  }

  /* ---------- Firebase ID token (auth, exigido pelo servidor) ---------- */
  async function getIdToken() {
    try {
      // fbGetIdToken é definido em firebase.js
      if (typeof fbGetIdToken === 'function') return await fbGetIdToken();
    } catch (e) {}
    return null;
  }

  /* ---------- API base (funciona local e no preview via proxy) ---------- */
  // 'port/8000' é substituído por 'port/8000' no deploy; em local dev é localhost:8000
  const API_BASE = (typeof __PICALTA_API_BASE !== 'undefined') ? __PICALTA_API_BASE :
    ('port/8000'.startsWith('__') ? '' : 'port/8000');
  function apiUrl(path) { return API_BASE + path; }

  async function refreshStatus() {
    const el = $('#ai-status');
    if (!el) return;
    try {
      const token = await getIdToken();
      const r = await fetch(apiUrl('/api/picalai/status'), {
        method: 'GET',
        headers: { 'X-Firebase-Token': token || '' },
      });
      status = await r.json();
      if (!status.configured) {
        el.textContent = 'não configurado no servidor';
        el.style.color = 'var(--color-accent)';
      } else {
        el.textContent = 'ativo · ' + status.model;
        el.style.color = 'var(--color-primary)';
      }
    } catch (e) {
      el.textContent = 'servidor offline';
      el.style.color = 'var(--color-text-faint)';
      status = null;
    }
  }

  function renderMessages() {
    const box = $('#ai-messages');
    if (!box) return;
    if (!history.length) { box.innerHTML = ''; return; }
    box.innerHTML = history.map((m) => `
      <div class="bubble ${m.role === 'user' ? 'mine' : 'theirs'}">${escapeHtml_(m.content)}</div>
    `).join('');
    box.scrollTop = box.scrollHeight;
  }

  function showTyping() {
    const box = $('#ai-messages');
    const div = document.createElement('div');
    div.className = 'bubble theirs ai-typing';
    div.id = 'ai-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }
  function hideTyping() {
    const el = document.getElementById('ai-typing');
    if (el) el.remove();
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const input = $('#ai-input');
    const text = input.value.trim();
    if (!text) return;

    if (!status || !status.configured) {
      // tenta recarregar estado antes de reclamar
      await refreshStatus();
      if (!status || !status.configured) {
        toast_('O PicalAi não está configurado no servidor (defini OVERCONTROL_API_KEY).');
        return;
      }
    }

    // guarda o texto do input para restaurar em caso de falha
    const originalText = text;
    input.value = '';
    $('#ai-intro').style.display = 'none';
    history.push({ role: 'user', content: text });
    renderMessages();
    showTyping();
    sending = true;
    const btn = $('#ai-send-btn');
    btn.disabled = true; btn.textContent = '…';

    try {
      const token = await getIdToken();
      const state = window.PICALTA_STATE; // lido agora (app.js já correu)
      const userName = state && state.profile && state.profile.name ? state.profile.name : '';
      const r = await fetch(apiUrl('/api/picalai/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firebase-Token': token || '',
        },
        body: JSON.stringify({ messages: history, userName }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'Falha');
      history.push({ role: 'assistant', content: j.reply });
      renderMessages();
    } catch (err) {
      hideTyping();
      // remove a mensagem do utilizador do histórico E restaura no input, para ele reenviar
      if (history.length && history[history.length - 1].role === 'user') history.pop();
      renderMessages();
      input.value = originalText; // mantém o texto
      input.focus();
      toast_('PicalAi: ' + (err.message || 'erro'));
    } finally {
      hideTyping();
      sending = false;
      btn.disabled = false; btn.textContent = 'Enviar';
    }
  }

  /* helpers */
  function escapeHtml_(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;')
      .replace(/'/g, '&' + '#39;');
  }
  function toast_(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast_._t);
    toast_._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* API exposta ao app.js */
  window.PICALAI = {
    init() {
      ensureUi();
      refreshStatus();
    },
    refreshStatus,
  };
})();
