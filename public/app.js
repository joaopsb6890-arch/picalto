/* Picalta — lógica principal (versão Firebase) */
'use strict';

/* ---------- estado ---------- */
const state = {
  me: null,           // user Firebase
  profile: null,      // perfil Firestore
  posts: [],
  postCache: {},      // id -> post
  usersCache: {},      // uid -> user data
  commentsCache: {},   // postId -> comments[]
  myFollowing: [],
  chats: [],
  stories: [],
  view: 'feed',
  feedTab: 'all',
  currentChatId: null,
  currentChatPeer: null,
  chatUnsubs: [],
  notifications: [],
  myFavorites: [],
  hashtagUnsubs: [],
  player: { xp: 0, level: 1, achievements: [] },
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------- helpers ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;')
    .replace(/'/g, '&#39;');
}
function initialsOf(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function avatarOf(user) {
  if (!user) return '<div class="avatar-fallback">?</div>';
  if (user.avatarUrl) return `<img class="avatar" src="${escapeHtml(user.avatarUrl)}" alt="" crossorigin="anonymous">`;
  const bg = user.avatarColor || '#672ea4';
  return `<div class="avatar-fallback" style="background:${escapeHtml(bg)}">${escapeHtml(initialsOf(user.name))}</div>`;
}
function timeAgo(ts) {
  if (!ts) return '';
  const ms = typeof ts === 'object' && ts.toMillis ? ts.toMillis() : ts;
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}
function hhmm(ts) {
  const ms = typeof ts === 'object' && ts.toMillis ? ts.toMillis() : ts;
  const d = new Date(ms || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2400);
  // beep sintetizado (Web Audio) se o som estiver ligado
  try { if (typeof playBeep === 'function') playBeep(880, 100); } catch (e) {}
}

/* ---------- tema ---------- */
(function theme() {
  const btn = $('#theme-toggle');
  const label = $('#theme-label');
  let mode = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', mode);
  label.textContent = mode === 'dark' ? 'Modo claro' : 'Modo escuro';
  function apply() {
    document.documentElement.setAttribute('data-theme', mode);
    label.textContent = mode === 'dark' ? 'Modo claro' : 'Modo escuro';
  }
  btn.addEventListener('click', () => { mode = mode === 'dark' ? 'light' : 'dark'; apply(); });
  $('#tabbar-theme') && $('#tabbar-theme').addEventListener('click', () => { mode = mode === 'dark' ? 'light' : 'dark'; apply(); });
})();

/* ---------- arranque ---------- */
initFirebase().then(({ onAuthStateChanged }) => {
  // recupera resultado de redirect (Google login) se existir
  fbGetRedirectResult().then((r) => {
    if (!r.ok && r.error) {
      const status = $('#firebase-status');
      if (status) status.textContent = r.error;
    }
  });
  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.me = user;
      // Garante perfil (recupera contas cujo perfil falhou ao guardar)
      // e mostra erros do Firestore em vez de rejeições silenciosas
      fbEnsureProfile(user.uid, user.email, user.displayName).then((p) => {
        if (!p) {
          const status = $('#firebase-status');
          if (status) status.textContent = 'Não foi possível carregar o perfil (Firestore). Verifica as regras de segurança.';
          return;
        }
        state.profile = p;
        // aplica nome/foto do Google só em campos em falta
        fbApplyGoogleDefaults(user).then(() => {
          fbLoadProfile(user.uid).then((fresh) => {
            if (fresh) state.profile = fresh;
            enterApp();
          }).catch(() => enterApp());
        }).catch(() => enterApp());
      }).catch((e) => {
        const status = $('#firebase-status');
        if (status) status.textContent = 'Erro ao carregar perfil: ' + (e.message || e);
      });
    } else {
      state.me = null;
      state.profile = null;
      showLogin();
    }
  });
}).catch((e) => {
  const status = $('#firebase-status');
  if (status) status.textContent = 'Erro ao ligar ao Firebase: ' + (e.message || e);
});

function showLogin() {
  $('#login-view').style.display = '';
  $('#app-view').style.display = 'none';
  document.title = 'Picalta — rede social de fotos com conversas';
}
function enterApp() {
  $('#login-view').style.display = 'none';
  $('#app-view').style.display = '';
  document.title = `Picalta — ${state.profile.name || state.me.email}`;
  // conquista: coruja noturna (0h–5h)
  const hr = new Date().getHours();
  if (hr >= 0 && hr < 5) unlockAchievement('night_owl');
  startWatchers();
  startProgressWatchers();
  renderMusicView();
  renderPolls();
  renderSettings();
  // aviso se Cloudinary não estiver configurado
  if (!cloudinaryConfigured()) {
    const status = $('#firebase-status');
    console.warn('[Picalta] Cloudinary não configurado — uploads de imagens desativados. Ver public/config.example.js.');
  }
}

/* ---------- login com Google ---------- */
$('#google-login-btn').addEventListener('click', async () => {
  const err = $('#auth-error');
  err.textContent = '';
  const btn = $('#google-login-btn');
  btn.disabled = true;
  try {
    const r = await fbGoogleSignIn();
    if (!r.ok) err.textContent = r.error || 'Não foi possível entrar com o Google.';
    else if (r.user) {
      // aplica nome/foto do Google ao perfil se necessário
      await fbApplyGoogleDefaults(r.user);
    }
  } finally {
    btn.disabled = false;
  }
});
$('#forgot-password-btn').addEventListener('click', async () => {
  const email = $('#auth-email').value.trim();
  if (!email) { $('#auth-error').textContent = 'Escreve o teu email primeiro.'; return; }
  const r = await fbResetPassword(email);
  $('#auth-error').textContent = r.ok
    ? 'Email de recuperação enviado. Verifica a caixa de entrada.'
    : (r.error || 'Não foi possível enviar o email.');
});

/* ---------- auth UI ---------- */
let authMode = 'login'; // 'login' | 'signup'
function setAuthMode(mode) {
  authMode = mode;
  if (mode === 'login') {
    $('#tab-login').className = 'btn';
    $('#tab-signup').className = 'btn ghost';
    $('#field-name').style.display = 'none';
    $('#auth-submit').textContent = 'Entrar';
  } else {
    $('#tab-login').className = 'btn ghost';
    $('#tab-signup').className = 'btn';
    $('#field-name').style.display = '';
    $('#auth-submit').textContent = 'Criar conta';
  }
}
$('#tab-login').addEventListener('click', () => setAuthMode('login'));
$('#tab-signup').addEventListener('click', () => setAuthMode('signup'));
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const name = $('#auth-name').value.trim();
  const err = $('#auth-error');
  err.textContent = '';
  if (!email || !password) { err.textContent = 'Preenche email e palavra-passe.'; return; }
  $('#auth-submit').disabled = true;
  try {
    let r;
    if (authMode === 'signup') {
      if (!name) { err.textContent = 'Escreve o teu nome.'; return; }
      r = await doSignUp(email, password, name);
    } else {
      r = await doLogin(email, password);
    }
    if (!r.ok) err.textContent = r.error;
  } finally {
    $('#auth-submit').disabled = false;
  }
});
$('#logout-btn').addEventListener('click', async () => {
  await fbSignOut();
  location.reload();
});

/* ---------- watchers ---------- */
let started = false;
function startWatchers() {
  if (started) return;
  started = true;

  // posts (feed)
  dbWatchPosts((snap) => {
    state.posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // loadMissingUsers é async; renderiza depois de carregar os utilizadores
    loadMissingUsers();
  });

  // following
  dbListFollowing(state.me.uid).then((list) => {
    state.myFollowing = list;
    renderFeed();
    renderPeopleBar();
  });

  // favoritos
  dbWatchFavorites(state.me.uid, (snap) => {
    state.myFavorites = snap.docs.map((d) => d.data().postId);
    renderFeed();
  });

  // chats
  dbWatchChats(state.me.uid, async (snap) => {
    state.chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    loadMissingUsers();
  });

  // stories
  dbWatchStories((snap) => {
    state.storiesRaw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    filterStories();
  });
  // reavalia expiração das stories a cada minuto
  setInterval(filterStories, 60000);

  // notificações: escuta follows de quem me segue
  dbWatchFollowers(state.me.uid, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'added') {
        const data = ch.doc.data();
        const uid = data.follower;
        if (uid !== state.me.uid) {
          loadUser(uid).then((u) => {
            addNotification(`${u ? u.name : 'Alguém'} começou a seguir-te`, timeAgo(Date.now()));
          });
        }
      }
    });
  });
}

function filterStories() {
  const now = Date.now();
  state.stories = (state.storiesRaw || []).filter((s) => {
    const ms = s.createdAt && s.createdAt.toMillis ? s.createdAt.toMillis() : 0;
    return now - ms < 24 * 3600 * 1000; // 24h
  });
  renderPeopleBar();
}
async function loadUser(uid) {
  if (state.usersCache[uid]) return state.usersCache[uid];
  const { doc, getDoc } = __fsFns;
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  if (data) state.usersCache[uid] = data;
  return data;
}
async function loadMissingUsers() {
  const uids = new Set();
  for (const p of state.posts) uids.add(p.uid);
  for (const c of state.chats || []) (c.participants || []).forEach((x) => uids.add(x));
  for (const cms of Object.values(state.commentsCache || {})) {
    for (const cm of cms) uids.add(cm.uid);
  }
  for (const s of state.stories || []) uids.add(s.uid);
  // espera todas as leituras e só depois renderiza
  await Promise.all(Array.from(uids).map((uid) => loadUser(uid)));
  renderFeed();
  renderChatList();
  renderPeopleBar();
}
function addNotification(text, when) {
  state.notifications.unshift({ text, when });
  renderNotifications();
  // conquista: primeiro seguidor
  if (/começou a seguir-te/.test(text)) unlockAchievement('first_follow');
}
function renderNotifications() {
  const box = $('#notifications-list');
  if (!state.notifications.length) {
    box.innerHTML = '<div class="empty">Sem notificações ainda.</div>';
    return;
  }
  box.innerHTML = state.notifications.slice(0, 30).map((n) => `
    <div class="notif-item"><b>${escapeHtml(n.text)}</b><span>${escapeHtml(n.when)}</span></div>
  `).join('');
}
$('#notif-btn').addEventListener('click', () => $('#notifications-panel').classList.add('open'));
$('#close-notifs').addEventListener('click', () => $('#notifications-panel').classList.remove('open'));
$('#tabbar-notif').addEventListener('click', () => $('#notifications-panel').classList.add('open'));
$('#tabbar-notif-mobile').addEventListener('click', () => $('#notifications-panel').classList.add('open'));
$('#tabbar-story').addEventListener('click', () => $('#new-story-btn').click());
$('#tabbar-logout') && $('#tabbar-logout').addEventListener('click', () => $('#logout-btn').click());

/* ---------- navegação ---------- */
function navigate(view) {
  // se sairmos da vista dos jogos, limpa listeners/timers do jogo ativo
  if (view !== 'games' && state.view === 'games') {
    closeGame();
  }
  state.view = view;
  $$('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  $$('.nav a, .tabbar button[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === view));
  if (view !== 'chats') {
    $('#chat-window') && $('#chat-window').classList.remove('active');
    document.querySelector('.chat-layout') && document.querySelector('.chat-layout').classList.remove('has-open-chat');
    document.body.classList.remove('chat-open');
    state.currentChatId = null;
  }
  // só muda a vista; carregar dados é responsabilidade do chamador
}
document.addEventListener('click', (e) => {
  // VER A HISTÓRIA tem prioridade sobre ir ao perfil (chips com story têm ambos os atributos)
  const viewStory = e.target.closest('[data-view-story]');
  if (viewStory) { e.preventDefault(); openStory(viewStory.dataset.viewStory); return; }
  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    e.preventDefault();
    const v = navEl.dataset.nav;
    navigate(v);
    // carregar dados da vista alvo (navigate já não faz isso, para evitar ciclos)
    if (v === 'profile') renderMyProfile();
    if (v === 'explore') renderSuggestions();
    if (v === 'search') $('#search-input') && $('#search-input').focus();
    if (v === 'games') renderGamesHome();
    if (v === 'music') renderMusicView();
    if (v === 'polls') renderPolls();
    if (v === 'settings') renderSettings();
    return;
  }
  const likeEl = e.target.closest('[data-like]');
  if (likeEl) { e.preventDefault(); likePost(likeEl.dataset.like); return; }
  const delEl = e.target.closest('[data-delete-post]');
  if (delEl) { e.preventDefault(); deletePost(delEl.dataset.deletePost); return; }
  const chatEl = e.target.closest('[data-start-chat]');
  if (chatEl) { e.preventDefault(); startChatWith(chatEl.dataset.startChat); return; }
  const followEl = e.target.closest('[data-follow-target]');
  if (followEl) { e.preventDefault(); toggleFollow(followEl.dataset.followTarget, followEl); return; }
  const profEl = e.target.closest('[data-goto-profile]');
  if (profEl) { e.preventDefault(); renderProfile(profEl.dataset.gotoProfile); return; }
  const favEl = e.target.closest('[data-fav]');
  if (favEl) { e.preventDefault(); toggleFavorite(favEl.dataset.fav, favEl); return; }
  const tagEl = e.target.closest('[data-hashtag]');
  if (tagEl) { e.preventDefault(); showHashtag(tagEl.dataset.hashtag); return; }
  const voteEl = e.target.closest('[data-vote-poll]');
  if (voteEl) { e.preventDefault(); votePoll(voteEl.dataset.votePoll, parseInt(voteEl.dataset.votePollIdx)); return; }
});

/* ---------- favoritos ---------- */
async function toggleFavorite(postId, btn) {
  try {
    const cur = state.myFavorites.includes(postId);
    const nowFav = await dbToggleFavorite(state.me.uid, postId, cur);
    const idx = state.myFavorites.indexOf(postId);
    if (nowFav && idx < 0) state.myFavorites.push(postId);
    if (!nowFav && idx >= 0) state.myFavorites.splice(idx, 1);
    renderFeed();
  } catch (e) { toast('Não foi possível guardar nos favoritos'); }
}

/* ---------- hashtag ---------- */
async function showHashtag(tag) {
  // mostra posts com essa hashtag no feed com filtro
  state.feedTab = 'hashtag';
  state.currentHashtag = tag;
  navigate('feed');
  renderFeed();
  toast('A mostrar #' + tag);
  // volta ao feed "Para ti" ao clicar na tab
  const reset = () => { state.feedTab = 'all'; state.currentHashtag = null; renderFeed(); };
  $('#tab-feed-all').addEventListener('click', reset, { once: true });
}

/* ---------- feed ---------- */
function renderPeopleBar() {
  const box = $('#people-bar');
  const stories = state.stories || [];
  const uids = new Set(stories.map((s) => s.uid));
  const meHasStory = uids.has(state.me.uid);
  const people = [{ uid: state.me.uid, name: state.profile.name, username: state.profile.username, avatarUrl: state.profile.avatarUrl, isMe: true, hasStory: meHasStory }];
  // adiciona quem tem story (exceto eu)
  for (const uid of uids) {
    if (uid === state.me.uid) continue;
    const u = state.usersCache[uid];
    if (u) people.push({ ...u, hasStory: true });
  }
  // adiciona quem sigo (sem story) até 8
  for (const uid of state.myFollowing) {
    if (people.find((p) => p.uid === uid)) continue;
    const u = state.usersCache[uid];
    if (u) people.push({ ...u });
    if (people.length >= 8) break;
  }
  box.innerHTML = people.map((u) => `
    <button class="person-chip ${u.isMe ? 'me' : ''} ${u.hasStory ? 'has-story' : ''}" data-goto-profile="${escapeHtml(u.uid)}" ${u.hasStory ? `data-view-story="${escapeHtml(u.uid)}"` : ''}>
      <span class="person-ring"><span class="inner">${avatarOf(u)}</span></span>
      <span class="person-name">${escapeHtml(u.isMe ? 'Tu' : (u.username || '?'))}</span>
    </button>
  `).join('');
}
function renderFeed() {
  const box = $('#feed');
  let posts = state.posts;
  if (state.feedTab === 'following') {
    posts = posts.filter((p) => state.myFollowing.includes(p.uid));
  }
  if (state.feedTab === 'hashtag') {
    posts = posts.filter((p) => (p.hashtags || []).includes('#' + state.currentHashtag));
  }
  if (!posts.length) {
    box.innerHTML = `<div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>
      ${state.feedTab === 'following' ? 'Ainda não segues ninguém ou não há publicações. Vai a "Explorar"!' : 'Ainda não há publicações. Sê o primeiro a partilhar uma foto!'}
    </div>`;
    return;
  }
  box.innerHTML = posts.map((p) => {
    const u = state.usersCache[p.uid] || { name: 'desconhecido', username: '?' };
    const liked = (p.likes || []).includes(state.me.uid);
    const isMine = p.uid === state.me.uid;
    const isFav = state.myFavorites ? state.myFavorites.includes(p.id) : false;
    const moodBadge = p.mood ? `<span class="mood-badge">${escapeHtml(p.mood)}</span>` : '';
    const imageOrText = p.imageUrl
      ? `<img class="post-image" src="${escapeHtml(p.imageUrl)}" alt="publicação" loading="lazy" crossorigin="anonymous" />`
      : `<div class="post-text-content">${escapeHtml(p.text || '')} ${moodBadge}</div>`;
    const caption = p.imageUrl
      ? `<p class="post-caption"><b>${escapeHtml(u.username || '?')}</b> ${escapeHtml(p.caption || '')}</p>`
      : '';
    const hashtags = (p.hashtags || []).length
      ? `<div class="post-hashtags">${p.hashtags.map((h) => `<a href="#" data-hashtag="${escapeHtml(h.slice(1))}">${escapeHtml(h)}</a>`).join(' ')}</div>`
      : '';
    return `
    <article class="post" data-post-id="${escapeHtml(p.id)}">
      <div class="post-head">
        ${avatarOf(u)}
        <div class="post-user">
          <a href="#" data-goto-profile="${escapeHtml(p.uid)}">${escapeHtml(u.username || '?')}</a>
          <span>${timeAgo(p.createdAt)}</span>
        </div>
        <button class="icon-btn fav-btn ${isFav ? 'liked' : ''}" data-fav="${escapeHtml(p.id)}" aria-label="favorito" style="margin-left:auto;color:${isFav ? 'var(--color-primary)' : 'var(--color-text-faint)'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
        ${isMine ? `<button class="icon-btn delete-post" data-delete-post="${escapeHtml(p.id)}" aria-label="apagar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>` : ''}
      </div>
      ${imageOrText}
      <div class="post-actions">
        <button class="icon-btn like-btn ${liked ? 'liked' : ''}" data-like="${escapeHtml(p.id)}" aria-label="gostar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-9.5-9C.9 8.6 2.6 5 6 5c2.2 0 3.6 1.2 4.5 2.5h3C14.4 6.2 15.8 5 18 5c3.4 0 5.1 3.6 3.5 7-2 4.4-9.5 9-9.5 9z" transform="translate(0 -1)"/></svg>
        </button>
        <span class="likes-count">${(p.likes || []).length} gostos</span>
      </div>
      <div class="post-meta">
        ${caption}
        ${hashtags}
        <div class="comments-list" data-comments="${escapeHtml(p.id)}">
          ${(state.commentsCache[p.id] || []).map((c) => {
            const cu = state.usersCache[c.uid] || { username: '?' };
            return `<div class="comment"><b>${escapeHtml(cu.username || '?')}</b> ${escapeHtml(c.text)}</div>`;
          }).join('')}
        </div>
        <form class="comment-form" data-comment-form="${escapeHtml(p.id)}">
          <input type="text" placeholder="Adiciona um comentário…" data-comment-input="${escapeHtml(p.id)}" />
          <button type="submit">Publicar</button>
        </form>
      </div>
    </article>`;
  }).join('');
  // escuta comentários de cada post visível
  for (const p of posts) watchPostComments(p.id);
}
const watchedComments = new Set();
function watchPostComments(postId) {
  if (watchedComments.has(postId)) return;
  watchedComments.add(postId);
  dbWatchComments(postId, (snap) => {
    state.commentsCache[postId] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    loadMissingUsers();
    renderFeed();
  });
}
$('#tab-feed-all').addEventListener('click', () => {
  state.feedTab = 'all';
  $('#tab-feed-all').classList.add('active');
  $('#tab-feed-following').classList.remove('active');
  renderFeed();
});
$('#tab-feed-following').addEventListener('click', () => {
  state.feedTab = 'following';
  $('#tab-feed-following').classList.add('active');
  $('#tab-feed-all').classList.remove('active');
  renderFeed();
});

/* ---------- publicações ---------- */
$('#new-post-btn').addEventListener('click', openPostModal);
$('#new-post-btn-mobile').addEventListener('click', openPostModal);
function openPostModal() {
  state.imagePicked = null;
  state.imageFile = null;
  $('#post-file').value = '';
  $('#file-hint').textContent = 'Toca para escolher uma foto (JPG/PNG, até 3MB)';
  $('#new-post-modal').style.display = 'grid';
}
$('#cancel-post').addEventListener('click', () => { $('#new-post-modal').style.display = 'none'; });
$('#post-file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!/^image\//.test(f.type)) { toast('Só imagens são permitidas'); return; }
  if (f.size > 3 * 1024 * 1024) { toast('Imagem demasiado grande (máx 3MB)'); return; }
  state.imageFile = f;
  const rd = new FileReader();
  rd.onload = () => { state.imagePicked = rd.result; $('#file-hint').innerHTML = `<img src="${state.imagePicked}" alt="pré-visualização" />`; };
  rd.readAsDataURL(f);
});
$('#publish-post').addEventListener('click', async () => {
  if (!state.imageFile) { toast('Escolhe uma foto primeiro'); return; }
  const caption = $('#post-caption').value.trim();
  const btn = $('#publish-post');
  btn.disabled = true;
  btn.textContent = 'A enviar…';
  try {
    const url = await stUploadImage(state.me.uid, state.imageFile);
    await dbCreatePhotoPost(state.me.uid, url, caption);
    $('#new-post-modal').style.display = 'none';
    $('#post-caption').value = '';
    toast('Publicado!');
    xpOnPost();
    unlockAchievement('first_post');
  } catch (e) {
    toast('Falha ao publicar: ' + (e.message || 'erro do Storage'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publicar';
  }
});
async function likePost(postId) {
  const p = state.posts.find((x) => x.id === postId);
  if (!p) return;
  const liked = (p.likes || []).includes(state.me.uid);
  try {
    await dbToggleLike(postId, state.me.uid, liked);
  } catch (e) { toast('Não foi possível gostar'); }
}
async function deletePost(postId) {
  if (!confirm('Apagar esta publicação?')) return;
  try {
    await dbDeletePost(postId);
    toast('Publicação apagada');
  } catch (e) { toast('Não foi possível apagar'); }
}
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-comment-form]');
  if (!form) return;
  e.preventDefault();
  const postId = form.dataset.commentForm;
  const input = form.querySelector('[data-comment-input]');
  const text = input.value.trim();
  if (!text) return;
  try {
    await dbAddComment(postId, state.me.uid, text);
    input.value = '';
    xpOnComment();
  } catch (err) { toast('Falha ao comentar'); }
});

/* ---------- stories ---------- */
$('#new-story-btn').addEventListener('click', () => {
  state.storyFile = null;
  $('#story-file').value = '';
  $('#story-file-hint').textContent = 'Toca para escolher uma foto (desaparece após 24h)';
  $('#new-story-modal').style.display = 'grid';
});
$('#cancel-story').addEventListener('click', () => { $('#new-story-modal').style.display = 'none'; });
$('#story-file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!/^image\//.test(f.type)) { toast('Só imagens'); return; }
  if (f.size > 3 * 1024 * 1024) { toast('Imagem demasiado grande (máx 3MB)'); return; }
  state.storyFile = f;
  $('#story-file-hint').textContent = f.name;
});
$('#publish-story').addEventListener('click', async () => {
  if (!state.storyFile) { toast('Escolhe uma foto'); return; }
  try {
    const url = await stUploadStoryImage(state.me.uid, state.storyFile);
    await dbAddStory(state.me.uid, url);
    $('#new-story-modal').style.display = 'none';
    toast('História publicada (24h)');
    xpOnStory();
  } catch (e) { toast('Falha: ' + (e.message || 'erro')); }
});
function openStory(uid) {
  const stories = (state.stories || []).filter((s) => s.uid === uid);
  if (!stories.length) return;
  const s = stories[0];
  $('#story-img').src = s.imageUrl;
  $('#story-viewer').style.display = 'grid';
}
$('#close-story').addEventListener('click', () => { $('#story-viewer').style.display = 'none'; });
$('#story-viewer').addEventListener('click', (e) => { if (e.target === $('#story-viewer')) $('#story-viewer').style.display = 'none'; });

/* ---------- pesquisa ---------- */
let searchTimer = null;
$('#search-input').addEventListener('input', (e) => {
  const t = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(t), 300);
});
async function doSearch(term) {
  const box = $('#search-results');
  if (!term) { box.innerHTML = ''; return; }
  const users = await dbSearchUsers(term);
  // conquista: pesquisa por 3 pessoas diferentes
  state._searchedUsers = state._searchedUsers || new Set();
  for (const u of users) if (u.id !== state.me.uid) state._searchedUsers.add(u.id);
  if (state._searchedUsers.size >= 3) unlockAchievement('explorer');
  if (!users.length) {
    box.innerHTML = '<div class="empty">Ninguém encontrado com esse nome.</div>';
    return;
  }
  box.innerHTML = users.filter((u) => u.id !== state.me.uid).map((u) => `
    <div class="search-result">
      ${avatarOf(u)}
      <div class="meta">
        <b>${escapeHtml(u.name || '?')}</b>
        <span>@${escapeHtml(u.username || '?')}</span>
      </div>
      <button class="btn small" data-goto-profile="${escapeHtml(u.id)}">Ver</button>
      <button class="btn small ghost" data-start-chat="${escapeHtml(u.id)}">Conversar</button>
    </div>
  `).join('');
}

/* ---------- explorar ---------- */
async function renderSuggestions() {
  const box = $('#suggestions');
  const users = await dbListUsers(20);
  const list = users.filter((u) => u.id !== state.me.uid);
  if (!list.length) { box.innerHTML = '<div class="empty">Ninguém mais por aqui…</div>'; return; }
  for (const u of list) state.usersCache[u.id] = u;
  box.innerHTML = list.map((u) => `
    <div class="suggestion-card">
      ${avatarOf(u)}
      <div>
        <b>${escapeHtml(u.name || '?')}</b>
        <span>@${escapeHtml(u.username || '?')}</span>
      </div>
      <button class="btn small" data-goto-profile="${escapeHtml(u.id)}">Ver perfil</button>
      <button class="btn small ghost" data-start-chat="${escapeHtml(u.id)}">Conversar</button>
    </div>
  `).join('');
}

/* ---------- perfil ---------- */
async function renderProfile(uid) {
  const u = await loadUser(uid);
  if (!u) { toast('Perfil não encontrado'); return; }
  const avatarEl = $('#profile-avatar');
  if (u.avatarUrl) {
    avatarEl.outerHTML = `<img class="avatar" id="profile-avatar" src="${escapeHtml(u.avatarUrl)}" alt="" crossorigin="anonymous">`;
  } else {
    avatarEl.outerHTML = `<div class="avatar-fallback" id="profile-avatar">${escapeHtml(initialsOf(u.name))}</div>`;
  }
  $('#profile-name').textContent = `${u.name || '?'} (@${u.username || '?'})`;
  $('#profile-bio').textContent = u.bio || '';
  // stats
  const userPosts = state.posts.filter((p) => p.uid === uid);
  $('#stat-posts').textContent = userPosts.length;
  $('#stat-followers').textContent = await countFollowers(uid);
  const following = await dbListFollowing(uid);
  $('#stat-following').textContent = following.length;
  // ações
  const actionsBox = $('#profile-actions');
  const isMe = uid === state.me.uid;
  if (isMe) {
    actionsBox.innerHTML = `
      <button class="btn small" id="edit-profile-btn">Editar perfil</button>
    `;
    $('#edit-profile-btn').addEventListener('click', openEditProfile);
  } else {
    const isFollowing = state.myFollowing.includes(uid);
    actionsBox.innerHTML = `
      <button class="btn small ${isFollowing ? 'ghost' : ''}" data-follow-target="${escapeHtml(uid)}">${isFollowing ? 'A seguir ✓' : 'Seguir'}</button>
      <button class="btn small ghost" data-start-chat="${escapeHtml(uid)}">Conversar</button>
    `;
  }
  // grelha — posts de foto apenas (posts de texto não têm imagem)
  const grid = $('#profile-grid');
  const photoPosts = userPosts.filter((p) => p.imageUrl);
  if (!photoPosts.length && !userPosts.length) {
    grid.innerHTML = '<div class="empty">Sem publicações ainda.</div>';
  } else if (!photoPosts.length) {
    grid.innerHTML = '<div class="empty">Só publicações de texto (sem fotos).</div>';
  } else {
    grid.innerHTML = photoPosts.map((p) => `<button><img src="${escapeHtml(p.imageUrl)}" alt="publicação" loading="lazy" crossorigin="anonymous" /></button>`).join('');
  }
  // conquistas do utilizador visitado (só na vista de perfil do próprio)
  const achBox = $('#achievements-list');
  if (achBox) {
    if (isMe) {
      achBox.style.display = '';
      renderAchievements();
    } else {
      achBox.style.display = 'none';
      achBox.innerHTML = '';
    }
  }
  navigate('profile');
}
async function countFollowers(uid) {
  const { collection, getDocs, query, where } = __fsFns;
  const q = query(collection(db, 'follows'), where('following', '==', uid));
  const snap = await getDocs(q);
  return snap.size;
}
function renderMyProfile() { renderProfile(state.me.uid); }
async function toggleFollow(targetUid, btn) {
  try {
    const currently = state.myFollowing.includes(targetUid);
    const nowFollowing = await dbToggleFollow(targetUid, state.me.uid, currently);
    const idx = state.myFollowing.indexOf(targetUid);
    if (nowFollowing && idx < 0) state.myFollowing.push(targetUid);
    if (!nowFollowing && idx >= 0) state.myFollowing.splice(idx, 1);
    const isFollowing = state.myFollowing.includes(targetUid);
    btn.textContent = isFollowing ? 'A seguir ✓' : 'Seguir';
    btn.className = 'btn small' + (isFollowing ? ' ghost' : '');
    toast(isFollowing ? 'A seguir!' : 'Deixaste de seguir');
    if (nowFollowing) {
      xpOnFollow();
      if (state.myFollowing.length >= 5) unlockAchievement('social_butterfly');
    }
  } catch (e) { toast('Não foi possível seguir'); }
}

/* ---------- editar perfil ---------- */
let avatarFile = null;
function openEditProfile() {
  avatarFile = null;
  $('#avatar-file').value = '';
  $('#avatar-file-hint').textContent = 'Toca para escolher uma foto de perfil';
  $('#edit-name').value = state.profile.name || '';
  $('#edit-bio').value = state.profile.bio || '';
  $('#edit-profile-modal').style.display = 'grid';
}
$('#cancel-edit').addEventListener('click', () => { $('#edit-profile-modal').style.display = 'none'; });
$('#avatar-file').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { toast('Foto demasiado grande (máx 2MB)'); return; }
  avatarFile = f;
  $('#avatar-file-hint').textContent = f.name;
});
$('#save-edit').addEventListener('click', async () => {
  const name = $('#edit-name').value.trim();
  const bio = $('#edit-bio').value.trim();
  const fields = { name, bio };
  try {
    if (avatarFile) {
      const url = await stUploadAvatar(state.me.uid, avatarFile);
      fields.avatarUrl = url;
    }
    await dbUpdateProfile(state.me.uid, fields);
    state.profile = { ...state.profile, ...fields };
    $('#edit-profile-modal').style.display = 'none';
    toast('Perfil atualizado');
    renderMyProfile();
  } catch (e) { toast('Falha ao guardar: ' + (e.message || 'erro')); }
});

/* ---------- conversas ---------- */
function renderChatList() {
  const list = $('#chat-list');
  const chats = state.chats || [];
  if (!chats.length) {
    list.innerHTML = '<div class="empty">Sem conversas ainda. Vai a "Pesquisar" ou "Explorar" para começar.</div>';
    return;
  }
  list.innerHTML = chats.map((c) => {
    const other = (c.participants || []).find((p) => p !== state.me.uid);
    const u = state.usersCache[other] || { name: other || '?', username: '?' };
    return `
      <button class="chat-card ${state.currentChatId === c.id ? 'active' : ''}" data-open-chat="${escapeHtml(c.id)}" data-peer="${escapeHtml(other || '')}">
        ${avatarOf(u)}
        <div class="meta">
          <b>${escapeHtml(u.name || '?')}</b>
        </div>
      </button>
    `;
  }).join('');
}
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-open-chat]');
  if (!btn) return;
  e.preventDefault();
  await openChat(btn.dataset.openChat, btn.dataset.peer);
});
async function startChatWith(uid) {
  if (uid === state.me.uid) { toast('Não podes conversar contigo'); return; }
  const chatId = await dbGetOrCreateChat(state.me.uid, uid);
  navigate('chats');
  await openChat(chatId, uid);
}
async function openChat(chatId, peerId) {
  state.currentChatId = chatId;
  state.currentChatPeer = peerId;
  document.querySelector('.chat-layout').classList.add('has-open-chat');
  document.body.classList.add('chat-open');
  $$('.chat-card').forEach((c) => c.classList.toggle('active', c.dataset.openChat === chatId));
  $('#chat-window').classList.add('active');
  const u = await loadUser(peerId);
  $('#chat-name').textContent = (u && u.name) || peerId || '—';
  const av = $('#chat-avatar');
  if (u && u.avatarUrl) {
    av.outerHTML = `<img class="avatar" id="chat-avatar" src="${escapeHtml(u.avatarUrl)}" alt="" crossorigin="anonymous">`;
  } else {
    av.outerHTML = `<div class="avatar-fallback" id="chat-avatar">${escapeHtml(initialsOf(u && u.name))}</div>`;
  }
  // escuta mensagens
  for (const un of state.chatUnsubs) { try { un(); } catch (e) {} }
  state.chatUnsubs = [];
  const unsub = await dbWatchMessages(chatId, (snap) => {
    const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const box = $('#chat-messages');
    box.innerHTML = '';
    for (const m of msgs) {
      const div = document.createElement('div');
      div.className = 'bubble ' + (m.uid === state.me.uid ? 'mine' : 'theirs');
      const span = document.createElement('span');
      span.textContent = m.text;
      span.className = 'text';
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = hhmm(m.createdAt);
      div.appendChild(span);
      div.appendChild(time);
      box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
  });
  state.chatUnsubs.push(unsub);
  updateBackBtn();
}
$('#chat-back').addEventListener('click', () => {
  $('#chat-window').classList.remove('active');
  document.querySelector('.chat-layout').classList.remove('has-open-chat');
  document.body.classList.remove('chat-open');
  state.currentChatId = null;
  renderChatList();
});
function updateBackBtn() {
  const b = $('#chat-back');
  if (b) b.style.display = window.innerWidth < 900 ? '' : 'none';
}
window.addEventListener('resize', updateBackBtn);
$('#chat-input-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !state.currentChatId) return;
  input.value = '';
  try {
    await dbSendMessage(state.currentChatId, state.me.uid, text);
    xpOnChat();
  } catch (err) { toast('Falha ao enviar'); }
});

/* ---------- Novo estado (post de texto + mood) ---------- */
let pickedMood = null;
$('#new-text-btn').addEventListener('click', () => {
  pickedMood = null;
  $('#text-post-input').value = '';
  const picker = $('#mood-picker');
  picker.innerHTML = MOODS.map((m) => `<button type="button" class="mood-btn" data-mood="${m}">${m}</button>`).join('');
  picker.querySelectorAll('.mood-btn').forEach((b) => b.addEventListener('click', () => {
    picker.querySelectorAll('.mood-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    pickedMood = b.dataset.mood;
  }));
  $('#new-text-modal').style.display = 'grid';
});
$('#cancel-text').addEventListener('click', () => { $('#new-text-modal').style.display = 'none'; });
$('#publish-text').addEventListener('click', async () => {
  const text = $('#text-post-input').value.trim();
  if (!text) { toast('Escreve algo primeiro'); return; }
  const btn = $('#publish-text');
  btn.disabled = true;
  try {
    await dbCreateTextPost(state.me.uid, text, pickedMood);
    $('#new-text-modal').style.display = 'none';
    toast('Estado publicado!');
    xpOnPost();
    unlockAchievement('first_post');
  } catch (e) { toast('Falha ao publicar: ' + (e.message || '')); }
  finally { btn.disabled = false; }
});

/* ---------- Sondagens ---------- */
let pollsUnsub = null;
let pollVotesUnsubs = [];
renderPolls._token = 0;
function renderPolls() {
  if (pollsUnsub) { try { pollsUnsub(); } catch (e) {} }
  for (const u of pollVotesUnsubs) { try { u(); } catch (e) {} }
  pollVotesUnsubs = [];
  pollsUnsub = dbWatchPolls(async (snap) => {
    const box = $('#polls-list');
    if (!box) return;
    // invalida renders anteriores (snapshot novo substitui lista antiga)
    const myToken = ++renderPolls._token;
    const polls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const uids = new Set(polls.map((p) => p.uid));
    await Promise.all(Array.from(uids).map((u) => loadUser(u)));
    if (myToken !== renderPolls._token) return; // snapshot ultrapassado
    if (!polls.length) {
      // limpa watchers de votos antigos
      for (const u of pollVotesUnsubs) { try { u(); } catch (e) {} }
      pollVotesUnsubs = [];
      box.innerHTML = '<div class="empty">Sem sondagens ainda. Cria a primeira!</div>';
      return;
    }
    const votesByPoll = {};
    const render = () => {
      if (myToken !== renderPolls._token) return;
      box.innerHTML = polls.map((p) => {
        const u = state.usersCache[p.uid] || { username: '?' };
        const votes = votesByPoll[p.id] || {};
        const counts = (p.options || []).map((_, i) => Object.values(votes).filter((v) => v === i).length);
        const total = counts.reduce((a, b) => a + b, 0);
        const myVote = votes[state.me.uid];
        return `<div class="poll-card">
          <div class="meta">${avatarOf(u)} <b>@${escapeHtml(u.username || '?')}</b> <span style="color:var(--color-text-faint);font-size:var(--text-xs)">${timeAgo(p.createdAt)}</span></div>
          <div class="poll-question">${escapeHtml(p.question || '')}</div>
          ${(p.options || []).map((o, i) => {
            const pct = total ? Math.round(counts[i] / total * 100) : 0;
            return `<button class="poll-option ${myVote === i ? 'voted' : ''}" data-vote-poll="${escapeHtml(p.id)}" data-vote-poll-idx="${i}">
              <span>${escapeHtml(o.text)} ${myVote === i ? '✓' : ''}</span>
              <span class="bar" style="width:${Math.max(8, pct)}%"></span>
              <span>${pct}%</span>
            </button>`;
          }).join('')}
        </div>`;
      }).join('');
    };
    render();
    // cancela watchers de votos da lista anterior antes de reconstruir
    for (const u of pollVotesUnsubs) { try { u(); } catch (e) {} }
    pollVotesUnsubs = [];
    for (const p of polls) {
      const unsub = dbWatchPollVotes(p.id, (votes) => {
        if (myToken !== renderPolls._token) return;
        votesByPoll[p.id] = votes;
        render();
      });
      pollVotesUnsubs.push(unsub);
    }
  });
}
async function votePoll(pollId, idx) {
  if (!pollId || isNaN(idx) || idx < 0) return;
  try {
    await dbVotePoll(pollId, idx, state.me.uid);
    toast('Voto registado!');
  } catch (e) { toast('Falha ao votar: ' + (e.message || '')); }
}
$('#new-poll-btn').addEventListener('click', () => {
  $('#poll-question').value = '';
  $('#poll-opt-1').value = '';
  $('#poll-opt-2').value = '';
  $('#poll-opt-3').value = '';
  $('#new-poll-modal').style.display = 'grid';
});
$('#cancel-poll').addEventListener('click', () => { $('#new-poll-modal').style.display = 'none'; });
$('#publish-poll').addEventListener('click', async () => {
  const q = $('#poll-question').value.trim();
  const o1 = $('#poll-opt-1').value.trim();
  const o2 = $('#poll-opt-2').value.trim();
  const o3 = $('#poll-opt-3').value.trim();
  if (!q || !o1 || !o2) { toast('Preenche a pergunta e pelo menos duas opções'); return; }
  const opts = [o1, o2];
  if (o3) opts.push(o3);
  try {
    await dbCreatePoll(state.me.uid, q, opts);
    $('#new-poll-modal').style.display = 'none';
    toast('Sondagem criada!');
  } catch (e) { toast('Falha ao criar: ' + (e.message || '')); }
});

/* ---------- Música ---------- */
function renderMusicView() {
  dbWatchSongs(async (snap) => {
    const box = $('#music-list');
    if (!box) return;
    const songs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const uids = new Set(songs.map((s) => s.uid));
    await Promise.all(Array.from(uids).map((u) => loadUser(u)));
    if (!songs.length) box.innerHTML = '<div class="empty">Ninguém partilhou música ainda. Sê o primeiro!</div>';
    else {
      box.innerHTML = songs.map((s) => {
        const u = state.usersCache[s.uid] || { username: '?' };
        return `<div class="music-item">
          <div class="meta">${avatarOf(u)} <b>@${escapeHtml(u.username || '?')}</b> <span style="color:var(--color-text-faint);font-size:var(--text-xs)">${timeAgo(s.createdAt)}</span></div>
          <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(s.videoId)}" title="${escapeHtml(s.title || '')}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>`;
      }).join('');
    }
  });
  // sugestões
  const sg = $('#music-suggestions-grid');
  if (sg && !sg.innerHTML.trim()) {
    sg.innerHTML = MUSIC_SUGGESTIONS.map((s) => `<button class="music-suggestion-card" data-play-suggestion="${escapeHtml(s.id)}">🎵 ${escapeHtml(s.title)}</button>`).join('');
    sg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-play-suggestion]');
      if (b) {
        const id = b.dataset.playSuggestion;
        const box = $('#music-list');
        box.insertAdjacentHTML('afterbegin', `<div class="music-item"><iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`);
      }
    });
  }
}
$('#share-song-btn').addEventListener('click', () => {
  $('#song-url').value = '';
  $('#song-title').value = '';
  $('#share-song-modal').style.display = 'grid';
});
$('#cancel-song').addEventListener('click', () => { $('#share-song-modal').style.display = 'none'; });
$('#publish-song').addEventListener('click', async () => {
  const url = $('#song-url').value.trim();
  const title = $('#song-title').value.trim();
  const m = url.match(/[?&]v=([\w-]{6,})/) || url.match(/youtu\.be\/([\w-]{6,})/);
  if (!m) { toast('Link do YouTube inválido'); return; }
  try {
    await dbShareSong(state.me.uid, m[1], title);
    $('#share-song-modal').style.display = 'none';
    toast('Música partilhada!');
  } catch (e) { toast('Falha ao partilhar: ' + (e.message || '')); }
});

/* ---------- Definições ---------- */
function renderSettings() {
  const status = $('#cloudinary-status');
  if (status) {
    status.innerHTML = cloudinaryConfigured()
      ? '✅ Cloudinary configurado — uploads de imagens funcionais.'
      : '⚠️ Cloudinary <b>não configurado</b>. Os uploads de imagens estão desativados até editares o ficheiro <code>public/config.js</code>. Passos: 1) cria conta em <a href="https://cloudinary.com" target="_blank">cloudinary.com</a> (grátis, sem cartão); 2) copia o Cloud Name do Dashboard; 3) Settings → Upload → Add upload preset → Unsigned → copia o nome; 4) cola os dois valores em <code>public/config.js</code>.';
  }
  if ($('#settings-email')) $('#settings-email').textContent = state.me.email || '—';
  if ($('#settings-level')) $('#settings-level').textContent = state.player.level || 1;
  if ($('#settings-xp')) $('#settings-xp').textContent = state.player.xp || 0;
}
$('#reset-password-settings').addEventListener('click', async () => {
  const email = state.me.email;
  if (!email) { toast('Sem email associado à conta'); return; }
  const r = await fbResetPassword(email);
  toast(r.ok ? 'Email de recuperação enviado' : (r.error || 'Falha'));
});
// guardar a escolha do som (Web Audio API — beep sintetizado, sem ficheiros)
let soundsOn = true;
let audioCtx = null;
function playBeep(freq, ms) {
  if (!soundsOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq || 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (ms || 120) / 1000);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (ms || 120) / 1000);
  } catch (e) { /* áudio indisponível — silencioso */ }
}
$('#sound-toggle').addEventListener('change', (e) => {
  soundsOn = e.target.checked;
  try { localStorage.setItem('picalta_sounds', soundsOn ? '1' : '0'); } catch (err) {}
  if (soundsOn) playBeep(880, 120);
});
try { soundsOn = localStorage.getItem('picalta_sounds') !== '0'; $('#sound-toggle').checked = soundsOn; } catch (e) {}

/* ---------- XP hooks nas ações existentes ---------- */
(function hookXpOnActions() {
  // gosto recebido: quando o número de likes de um post meu aumenta
  let lastLikesByPost = {};
  setInterval(() => {
    for (const p of state.posts) {
      const before = lastLikesByPost[p.id];
      if (before !== undefined && (p.likes || []).length > before) {
        if (p.uid === state.me.uid) addXp(XP_RULES.like_received, 'gosto recebido');
      }
      lastLikesByPost[p.id] = (p.likes || []).length;
    }
  }, 3000);
})();
