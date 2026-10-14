/* Picalta — Música: player YouTube (IFrame API) com favoritos, pesquisa e mini-player flutuante */
'use strict';

(function () {
  /* ---------- Carrega a IFrame API do YouTube ---------- */
  let apiReady = false;
  let apiLoading = false;
  let pendingInit = null;

  window.onYouTubeIframeAPIReady = function () {
    apiReady = true;
    if (pendingInit) { pendingInit(); pendingInit = null; }
  };
  function loadYouTubeApi(cb) {
    if (apiReady) return cb();
    pendingInit = cb;
    if (apiLoading) return;
    apiLoading = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  /* ---------- Estado ---------- */
  let player = null;          // YT.Player
  let currentPlayerVid = null; // vídeo atual
  let currentTitle = '';
  let queue = [];             // [{videoId, title, addedBy}]
  let favorites = [];          // [{videoId, title}] — PICALTA_STORAGE (localStorage com fallback em memória)
  try { favorites = JSON.parse(PICALTA_STORAGE.getItem('picalta_fav_songs') || '[]'); } catch (e) {}
  let playing = false;

  /* ---------- Helpers ---------- */
  function extractVideoId(url) {
    if (!url) return null;
    const m =
      url.match(/[?&]v=([\w-]{6,})/) ||
      url.match(/youtu\.be\/([\w-]{6,})/) ||
      url.match(/youtube\.com\/embed\/([\w-]{6,})/) ||
      url.match(/youtube\.com\/shorts\/([\w-]{6,})/);
    return m ? m[1] : null;
  }
  function saveFavorites() {
    try { PICALTA_STORAGE.setItem('picalta_fav_songs', JSON.stringify(favorites)); } catch (e) {}
  }
  function isFavorite(vid) { return favorites.some((f) => f.videoId === vid); }
  function toggleFavorite(vid, title) {
    const i = favorites.findIndex((f) => f.videoId === vid);
    if (i >= 0) favorites.splice(i, 1);
    else favorites.push({ videoId: vid, title: title || '—' });
    saveFavorites();
    renderPlayerChips();
    renderFavorites();
  }

  /* ---------- Player único (barra fixa em baixo) ---------- */
  let playerReady = false;      // true quando onReady dispara
  let pendingVideo = null;       // vídeo pedido antes do player estar pronto
  let wantsPlay = false;         // se o utilizador pediu para tocar antes do onReady

  function isMusicViewActive() {
    const v = document.getElementById('view-music');
    return !!(v && v.classList.contains('active'));
  }

  function mountPlayer() {
    const host = document.getElementById('yt-player');
    if (!host) return;
    if (player) {
      // player existe mas pode não estar pronto
      if (playerReady) { player.loadVideoById(currentPlayerVid); }
      else { pendingVideo = currentPlayerVid; wantsPlay = true; }
      return;
    }
    loadYouTubeApi(() => {
      player = new YT.Player('yt-player', {
        videoId: currentPlayerVid,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            playerReady = true;
            // aplica vídeo pendente, se houver
            if (pendingVideo) {
              e.target.loadVideoById(pendingVideo);
              pendingVideo = null;
            }
            // só reproduz se a vista Música estiver visível
            // (o YouTube IFrame API exige player visível para autoplay)
            if (wantsPlay && isMusicViewActive()) {
              e.target.playVideo();
              playing = true;
            }
            wantsPlay = false;
            updateControls();
          },
          onStateChange: (e) => {
            playing = e.data === YT.PlayerState.PLAYING;
            updateControls();
            if (e.data === YT.PlayerState.ENDED && queue.length) {
              const next = queue.shift();
              playSong(next.videoId, next.title);
              renderQueue();
            }
          },
          onError: () => {
            alertToast('Este vídeo não pode ser reproduzido (restrição do YouTube).');
          },
        },
      });
    });
  }

  function playSong(videoId, title) {
    currentPlayerVid = videoId;
    currentTitle = title || '—';
    if (player && playerReady && player.loadVideoById) {
      player.loadVideoById(videoId);
    } else {
      // player ainda não existe ou não está pronto — pede e marca intenção
      pendingVideo = videoId;
      wantsPlay = true;
      mountPlayer();
    }
    updateControls();
  }

  function updateControls() {
    const el = document.getElementById('yt-now-playing');
    const playBtn = document.getElementById('yt-play-btn');
    if (el) el.textContent = '▶ ' + (currentTitle || '—');
    if (playBtn) playBtn.textContent = playing ? '⏸' : '▶';
  }

  /* Pausa o player (chamado ao sair da vista Música) */
  function pause() {
    wantsPlay = false; // cancela qualquer intenção pendente de reproduzir
    if (player && playerReady && player.pauseVideo) { player.pauseVideo(); }
    playing = false;
    updateControls();
  }

  /* ---------- UI ---------- */
  function initMusicUi() {
    // insere a barra do player + separadores + listas, se ainda não existirem
    const view = document.getElementById('view-music');
    if (!view) return;
    if (document.getElementById('yt-player-bar')) return; // já montado

    const bar = document.createElement('div');
    bar.id = 'yt-player-bar';
    bar.style.cssText = 'margin-bottom:var(--space-6)';
    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
        <div id="yt-player" style="flex:1;min-width:220px;max-width:640px;aspect-ratio:16/9;border-radius:var(--radius-lg);background:var(--color-surface-offset);overflow:hidden"></div>
        <div style="display:flex;flex-direction:column;gap:var(--space-2);min-width:160px">
          <button class="btn small" id="yt-play-btn" style="justify-content:center">▶</button>
          <button class="btn ghost small" id="yt-next-btn" style="justify-content:center">Próxima ⏭</button>
          <button class="btn ghost small" id="yt-fav-btn" style="justify-content:center">♥ Favoritar</button>
          <button class="btn ghost small" id="yt-stop-btn" style="justify-content:center">Parar ⏹</button>
        </div>
      </div>
      <div id="yt-now-playing" style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-2)"></div>
      <div id="yt-queue-wrap" style="margin-top:var(--space-3)">
        <b style="font-size:var(--text-sm)">Fila de reprodução</b>
        <div id="yt-queue" style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-2)"></div>
      </div>
      <div style="margin-top:var(--space-4)">
        <b style="font-size:var(--text-sm)">Favoritos</b>
        <div id="yt-favorites" style="margin-top:var(--space-2)"></div>
      </div>
    `;
    view.insertBefore(bar, view.firstChild.nextSibling);

    $('#yt-play-btn').addEventListener('click', () => {
      if (!player) return;
      if (playing) player.pauseVideo();
      else player.playVideo();
    });
    $('#yt-next-btn').addEventListener('click', () => {
      if (!queue.length) { alertToast('A fila está vazia.'); return; }
      const next = queue.shift();
      playSong(next.videoId, next.title);
      renderQueue();
    });
    $('#yt-fav-btn').addEventListener('click', () => {
      if (!currentPlayerVid) return;
      toggleFavorite(currentPlayerVid, currentTitle);
    });
    $('#yt-stop-btn').addEventListener('click', () => {
      if (player) { player.stopVideo(); playing = false; updateControls(); }
    });

    // botão "ouvir" nas músicas partilhadas (substitui iframes estáticos)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-play-vid]');
      if (!b) return;
      e.preventDefault();
      playSong(b.dataset.playVid, b.dataset.playTitle || '');
      if (typeof window.PICALTA_STATE !== 'undefined' && window.PICALTA_STATE.view === 'music') {
        document.getElementById('view-music').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    // adicionar à fila
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-queue-vid]');
      if (!b) return;
      e.preventDefault();
      queue.push({ videoId: b.dataset.queueVid, title: b.dataset.queueTitle || '—' });
      renderQueue();
      alertToast('Adicionado à fila.');
    });

    renderPlayerChips();
    renderQueue();
    renderFavorites();
  }

  function renderPlayerChips() {
    const btn = document.getElementById('yt-fav-btn');
    if (!btn) return;
    btn.textContent = currentPlayerVid && isFavorite(currentPlayerVid) ? '♥ Nos favoritos' : '♥ Favoritar';
    btn.classList.toggle('ghost', !(currentPlayerVid && isFavorite(currentPlayerVid)));
  }

  function renderQueue() {
    const box = document.getElementById('yt-queue');
    if (!box) return;
    if (!queue.length) { box.textContent = 'Vazia — clica em «➕ Fila» junto a uma música.'; return; }
    box.innerHTML = queue.map((q, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-1) 0;border-bottom:1px solid var(--color-divider)">
        <span>${i + 1}. ${escapeHtml_(q.title)}</span>
        <button class="btn ghost small" data-dequeue-idx="${i}" aria-label="remover">×</button>
      </div>
    `).join('');
    box.querySelectorAll('[data-dequeue-idx]').forEach((b) =>
      b.addEventListener('click', () => { queue.splice(Number(b.dataset.dequeueIdx), 1); renderQueue(); })
    );
  }

  function renderFavorites() {
    const box = document.getElementById('yt-favorites');
    if (!box) return;
    if (!favorites.length) { box.innerHTML = '<div class="empty">Sem favoritos ainda.</div>'; return; }
    box.innerHTML = favorites.map((f) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-2);padding:var(--space-2) 0;border-bottom:1px solid var(--color-divider)">
        <button class="btn ghost small" data-play-vid="${escapeHtml_(f.videoId)}" data-play-title="${escapeHtml_(f.title)}" style="flex:1;text-align:left">▶ ${escapeHtml_(f.title)}</button>
        <button class="btn ghost small" data-unfav-vid="${escapeHtml_(f.videoId)}" aria-label="remover">×</button>
      </div>
    `).join('');
    box.querySelectorAll('[data-unfav-vid]').forEach((b) =>
      b.addEventListener('click', () => toggleFavorite(b.dataset.unfavVid, ''))
    );
  }

  function escapeHtml_(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;')
      .replace(/'/g, '&' + '#39;');
  }
  function alertToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(alertToast._t);
    alertToast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------- API ---------- */
  window.PICALTA_MUSIC = {
    init() { initMusicUi(); },
    extractVideoId,
    playSong,
    pause,
    renderQueue,
    isFavorite,
  };
})();
