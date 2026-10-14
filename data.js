/* Picalta — operações de dados (Firestore + Storage) */
'use strict';

const FS = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const ST = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

/* ---------- publicações ---------- */
async function dbCreatePost(uid, imageUrl, caption) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  return addDoc(collection(db, 'posts'), {
    uid,
    imageUrl,          // URL do Storage (download URL)
    caption: caption || '',
    likes: [],         // array de uids
    createdAt: serverTimestamp(),
  });
}
async function dbDeletePost(postId) {
  const { doc, deleteDoc } = __fsFns;
  await deleteDoc(doc(db, 'posts', postId));
}
async function dbToggleLike(postId, uid, currentlyLiked) {
  const { doc, updateDoc, arrayUnion, arrayRemove } = __fsFns;
  await updateDoc(doc(db, 'posts', postId), {
    likes: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
  });
}
async function dbAddComment(postId, uid, text) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  return addDoc(collection(db, 'posts', postId, 'comments'), {
    uid,
    text,
    createdAt: serverTimestamp(),
  });
}
/* escuta em tempo real de posts (ordem por createdAt desc) */
function dbWatchPosts(callback) {
  return (async () => {
    const { collection, onSnapshot, orderBy, query, limit } = __fsFns;
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(60));
    return onSnapshot(q, callback);
  })();
}
async function dbGetPost(postId) {
  const { doc, getDoc } = __fsFns;
  const snap = await getDoc(doc(db, 'posts', postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
function dbWatchComments(postId, callback) {
  return (async () => {
    const { collection, onSnapshot, orderBy, query } = __fsFns;
    const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, callback);
  })();
}

/* ---------- seguir ---------- */
async function dbToggleFollow(targetUid, uid, currentlyFollowing) {
  const { doc, setDoc, deleteDoc, serverTimestamp } = __fsFns;
  if (currentlyFollowing) {
    await deleteDoc(doc(db, 'follows', uid + '_' + targetUid));
    return false;
  } else {
    await setDoc(doc(db, 'follows', uid + '_' + targetUid), {
      follower: uid,
      following: targetUid,
      createdAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }
}
async function dbIsFollowing(uid, targetUid) {
  const { doc, getDoc } = __fsFns;
  const snap = await getDoc(doc(db, 'follows', uid + '_' + targetUid));
  return snap.exists();
}
function dbWatchFollowers(targetUid, callback) {
  return (async () => {
    const { collection, onSnapshot, query, where } = __fsFns;
    const q = query(collection(db, 'follows'), where('following', '==', targetUid));
    return onSnapshot(q, callback);
  })();
}
async function dbListFollowing(uid) {
  const { collection, getDocs, query, where } = __fsFns;
  const q = query(collection(db, 'follows'), where('follower', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().following);
}
/* posts de quem eu sigo (feed "A seguir") */
function dbWatchFollowingFeed(uid, callback) {
  return (async () => {
    const { collection, onSnapshot, query, where, orderBy, limit, documentId } = __fsFns;
    const following = await dbListFollowing(uid);
    if (!following.length) { callback([]); return () => {}; }
    // Firestore não suporta IN com orderBy serverTimestamp na mesma query em todos os planos;
    // usamos query por autor + filtro local
    const q = query(collection(db, 'posts'), where('uid', 'in', following.slice(0, 10)), orderBy('createdAt', 'desc'), limit(40));
    return onSnapshot(q, callback);
  })();
}

/* ---------- conversas ---------- */
async function dbGetOrCreateChat(uidA, uidB) {
  const { collection, getDocs, query, where, addDoc, doc, getDoc } = __fsFns;
  // procura conversa existente entre os dois (participant array contém ambos)
  const q1 = query(collection(db, 'chats'), where('participants', 'array-contains', uidA));
  const snap = await getDocs(q1);
  for (const d of snap.docs) {
    const data = d.data();
    if (Array.isArray(data.participants) && data.participants.includes(uidB)) return d.id;
  }
  const ref = await addDoc(collection(db, 'chats'), {
    participants: [uidA, uidB],
    createdAt: (__fsFns).serverTimestamp(),
  });
  return ref.id;
}
function dbWatchChats(uid, callback) {
  return (async () => {
    const { collection, onSnapshot, query, where } = __fsFns;
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', uid));
    return onSnapshot(q, callback);
  })();
}
function dbWatchMessages(chatId, callback) {
  return (async () => {
    const { collection, onSnapshot, orderBy, query, limit } = __fsFns;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(200));
    return onSnapshot(q, callback);
  })();
}
async function dbSendMessage(chatId, uid, text) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    uid,
    text,
    createdAt: serverTimestamp(),
  });
}

/* ---------- pesquisa de pessoas ---------- */
async function dbSearchUsers(term) {
  const { collection, getDocs, query, where, orderBy, limit } = __fsFns;
  const t = (term || '').toLowerCase().trim();
  if (!t) return [];
  try {
    const q = query(collection(db, 'users'), where('username', '>=', t), where('username', '<=', t + '\uf8ff'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }
}
async function dbListUsers(limitN) {
  const { collection, getDocs, query, limit: l } = __fsFns;
  const snap = await getDocs(query(collection(db, 'users'), l(limitN || 20)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function dbUpdateProfile(uid, fields) {
  const { doc, updateDoc } = __fsFns;
  await updateDoc(doc(db, 'users', uid), fields);
}

/* ---------- Cloudinary (upload de imagens, plano gratuito sem cartão) ----------
   Config vem de public/config.js. */
function cloudinaryConfigured() {
  return !!(typeof CLOUDINARY_CLOUD_NAME !== 'undefined' && CLOUDINARY_CLOUD_NAME &&
            typeof CLOUDINARY_UNSIGNED_PRESET !== 'undefined' && CLOUDINARY_UNSIGNED_PRESET);
}
async function cdnUploadImage(uid, file, folder) {
  if (!cloudinaryConfigured()) {
    throw new Error('Armazenamento de imagens não configurado. Pede ao dono da app para configurar o Cloudinary (ver config.example.js).');
  }
  if (!/^image\//.test(file.type)) throw new Error('Só imagens são permitidas');
  if (file.size > 4 * 1024 * 1024) throw new Error('Imagem demasiado grande (máx 4MB)');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_UNSIGNED_PRESET);
  fd.append('folder', folder || 'picalta/' + uid);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload', {
    method: 'POST', body: fd,
  });
  if (!res.ok) {
    let msg = 'Erro no upload';
    try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
    throw new Error(msg);
  }
  const json = await res.json();
  return json.secure_url;
}
async function stUploadImage(uid, file) {
  return cdnUploadImage(uid, file, 'picalta/posts');
}
async function stUploadAvatar(uid, file) {
  return cdnUploadImage(uid, file, 'picalta/avatars');
}
async function stUploadStoryImage(uid, file) {
  return cdnUploadImage(uid, file, 'picalta/stories');
}

/* ---------- stories (24h) ---------- */
async function dbAddStory(uid, imageUrl) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  await addDoc(collection(db, 'stories'), {
    uid,
    imageUrl,
    createdAt: serverTimestamp(),
  });
}
function dbWatchStories(callback) {
  return (async () => {
    const { collection, onSnapshot, orderBy, query, limit } = __fsFns;
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, callback);
  })();
}

/* ---------- XP / níveis / conquistas ---------- */
async function dbGetPlayer(uid) {
  const { doc, getDoc, setDoc, serverTimestamp } = __fsFns;
  const snap = await getDoc(doc(db, 'players', uid));
  if (snap.exists()) return { id: uid, ...snap.data() };
  const fresh = { uid, xp: 0, level: 1, achievements: [], lastActive: serverTimestamp() };
  await setDoc(doc(db, 'players', uid), fresh, { merge: true });
  return { id: uid, ...fresh };
}
async function dbUpdatePlayer(uid, patch) {
  const { doc, updateDoc } = __fsFns;
  await updateDoc(doc(db, 'players', uid), patch);
}
function dbWatchPlayer(uid, callback) {
  return (async () => {
    const { doc, onSnapshot } = __fsFns;
    await dbGetPlayer(uid);
    return onSnapshot(doc(db, 'players', uid), (s) => callback({ id: s.id, ...s.data() }));
  })();
}
/* top global por XP */
function dbWatchLeaderboard(callback) {
  return (async () => {
    const { collection, onSnapshot, query, orderBy, limit } = __fsFns;
    const q = query(collection(db, 'players'), orderBy('xp', 'desc'), limit(50));
    return onSnapshot(q, callback);
  })();
}

/* ---------- jogos ---------- */
const GAMES = {
  memory: { label: 'Jogo da Memória', icon: '🧠' },
  snake: { label: 'Snake', icon: '🐍' },
  flappy: { label: 'Picalta Fly', icon: '🐦' },
  g2048: { label: '2048', icon: '🔢' },
  tictactoe: { label: 'Galo', icon: '❌' },
  typing: { label: 'Teste de Escrita', icon: '⌨️' },
};
async function dbSaveScore(uid, game, score, extra) {
  const { addDoc, collection, doc, runTransaction, serverTimestamp } = __fsFns;
  const ref = await addDoc(collection(db, 'gameScores'), {
    uid, game, score, extra: extra || {}, createdAt: serverTimestamp(),
  });
  // atualiza melhor pontuação no perfil do jogador (via transação,
  // tolerante a pontuações paralelas)
  const pr = doc(db, 'players', uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(pr);
    if (!snap.exists()) {
      tx.set(pr, { uid, xp: 0, level: 1, achievements: [], ['best_' + game]: score });
      return;
    }
    const cur = snap.data();
    const key = 'best_' + game;
    const best = cur[key];
    if (!(typeof best === 'number') || score > best) {
      tx.update(pr, { [key]: score });
    }
  });
  return ref.id;
}
/* devolve diretamente a função de cancelamento (onSnapshot é síncrono) */
function dbWatchGameScores(game, callback) {
  const { collection, onSnapshot, query, where, orderBy, limit } = __fsFns;
  const q = query(collection(db, 'gameScores'), where('game', '==', game), orderBy('score', 'desc'), limit(20));
  return onSnapshot(q, callback);
}
function dbWatchMyScores(uid, callback) {
  return (async () => {
    const { collection, onSnapshot, query, where, orderBy, limit } = __fsFns;
    const q = query(collection(db, 'gameScores'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, callback);
  })();
}

/* ---------- conquistas ---------- */
async function dbUnlockAchievement(uid, key) {
  const { doc, updateDoc, arrayUnion } = __fsFns;
  try {
    await updateDoc(doc(db, 'players', uid), { achievements: arrayUnion(key) });
    return true;
  } catch (e) { return false; }
}

/* ---------- favoritos ---------- */
async function dbToggleFavorite(uid, postId, currently) {
  const { doc, setDoc, deleteDoc, serverTimestamp } = __fsFns;
  if (currently) {
    await deleteDoc(doc(db, 'favorites', uid + '_' + postId));
    return false;
  } else {
    await setDoc(doc(db, 'favorites', uid + '_' + postId), {
      uid, postId, createdAt: serverTimestamp(),
    }, { merge: true });
    return true;
  }
}
function dbWatchFavorites(uid, callback) {
  return (async () => {
    const { collection, onSnapshot, query, where } = __fsFns;
    const q = query(collection(db, 'favorites'), where('uid', '==', uid));
    return onSnapshot(q, callback);
  })();
}

/* ---------- posts de texto (sem foto) + hashtags ---------- */
async function dbCreateTextPost(uid, text, mood) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  // extrai hashtags da legenda
  const hashtags = (text || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return addDoc(collection(db, 'posts'), {
    uid,
    text: text || '',
    mood: mood || null,
    imageUrl: null,
    hashtags,
    likes: [],
    createdAt: serverTimestamp(),
  });
}
async function dbCreatePhotoPost(uid, imageUrl, caption) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  const hashtags = (caption || '').match(/#[\p{L}\p{N}_]+/gu) || [];
  return addDoc(collection(db, 'posts'), {
    uid,
    imageUrl,
    caption: caption || '',
    hashtags,
    likes: [],
    createdAt: serverTimestamp(),
  });
}
function dbWatchHashtag(tag, callback) {
  return (async () => {
    const { collection, onSnapshot, query, where, orderBy, limit } = __fsFns;
    const q = query(collection(db, 'posts'), where('hashtags', 'array-contains', tag), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(q, callback);
  })();
}

/* ---------- mood / status ---------- */
const MOODS = ['😄', '🙂', '😴', '😮', '😢', '😡', '🥳', '🤔', '❤️', '🔥'];
async function dbSetMood(uid, mood) {
  const { doc, updateDoc } = __fsFns;
  await updateDoc(doc(db, 'users', uid), { mood });
}

/* ---------- polls (sondagens) ---------- */
async function dbCreatePoll(uid, question, options) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  return addDoc(collection(db, 'polls'), {
    uid,
    question,
    options: options.map((o) => ({ text: o, votes: [] })),
    createdAt: serverTimestamp(),
  });
}
/* voto: documento polls/{pollId}/votes/{uid} — apenas optionIdx é atualizado,
   createdAt é imutável (só é definido na criação). */
async function dbVotePoll(pollId, optionIdx, uid) {
  const { doc, setDoc, updateDoc, getDoc, serverTimestamp } = __fsFns;
  const ref = doc(db, 'polls', pollId, 'votes', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { optionIdx });
  } else {
    await setDoc(ref, {
      uid,
      optionIdx,
      createdAt: serverTimestamp(),
    });
  }
}
/* devolve diretamente a função de cancelamento (onSnapshot é síncrono) */
function dbWatchPolls(callback) {
  const { collection, onSnapshot, query, orderBy, limit } = __fsFns;
  const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(30));
  return onSnapshot(q, callback);
}
/* escuta os votos de uma sondagem — devolve função de cancelamento */
function dbWatchPollVotes(pollId, callback) {
  const { collection, onSnapshot } = __fsFns;
  return onSnapshot(collection(db, 'polls', pollId, 'votes'), (snap) => {
    const votes = {};
    snap.forEach((d) => {
      const data = d.data();
      votes[d.id] = data.optionIdx;
    });
    callback(votes);
  });
}

/* ---------- música (YouTube embed) ---------- */
const MUSIC_SUGGESTIONS = [
  { title: 'Lo-fi Beats para Estudar', id: 'jfKfPfyJRdk' },
  { title: 'Jazz Relaxante', id: 'Dx5qFachd3A' },
  { title: 'Chillhop Café', id: '5yx6BWlEVcY' },
  { title: 'Piano Calmo', id: 'lTRiuFIWV54' },
  { title: 'Ambient Focus', id: 'n61ULEU7CO0' },
];
async function dbShareSong(uid, videoId, title) {
  const { addDoc, collection, serverTimestamp } = __fsFns;
  return addDoc(collection(db, 'songs'), {
    uid, videoId, title: title || '', createdAt: serverTimestamp(),
  });
}
function dbWatchSongs(callback) {
  return (async () => {
    const { collection, onSnapshot, query, orderBy, limit } = __fsFns;
    const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(q, callback);
  })();
}
