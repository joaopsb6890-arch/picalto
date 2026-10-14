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

/* ---------- Storage (imagens) ---------- */
async function stUploadImage(uid, file) {
  const { ref, uploadBytes, getDownloadURL } = __stFns;
  const ext = (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '');
  const path = `posts/${uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
async function stUploadAvatar(uid, file) {
  const { ref, uploadBytes, getDownloadURL } = __stFns;
  const ext = (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '');
  const path = `avatars/${uid}/avatar.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
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
