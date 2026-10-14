/* Picalta — camada Firebase (SDK modular, persistência em memória) */
'use strict';

/* Configuração do projeto Firebase do utilizador */
const firebaseConfig = {
  apiKey: 'AIzaSyDtSLwYJDiL-1AOnwLDh-jxOQzG1xsDsHs',
  authDomain: 'picala-a212f.firebaseapp.com',
  projectId: 'picala-a212f',
  storageBucket: 'picala-a212f.firebasestorage.app',
  messagingSenderId: '535197365034',
  appId: '1:535197365034:web:ddea795d1206534f53a453',
};

var auth = null;
var db = null;
var storage = null;
var __authFns = null;
var __fsFns = null;
var __stFns = null;

/* Cloudinary config vem de public/config.js (carregado antes deste ficheiro) */
function cloudinaryConfigured() {
  return !!(typeof CLOUDINARY_CLOUD_NAME !== 'undefined' && CLOUDINARY_CLOUD_NAME &&
            typeof CLOUDINARY_UNSIGNED_PRESET !== 'undefined' && CLOUDINARY_UNSIGNED_PRESET);
}

/* Carrega (uma vez) os módulos do SDK. O mock de testes pode substituir
   window.__loadFirebaseModules antes de initFirebase() ser chamado. */
async function loadFirebaseModules() {
  if (typeof window !== 'undefined' && typeof window.__loadFirebaseModules === 'function') {
    return window.__loadFirebaseModules();
  }
  const [authMod, fsMod, stMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'),
  ]);
  return [authMod, fsMod, stMod];
}

async function initFirebase() {
  const [authMod, fsMod, stMod] = await loadFirebaseModules();
  __authFns = authMod;
  __fsFns = fsMod;
  __stFns = stMod;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const app = initializeApp(firebaseConfig);
  // Auth: popupRedirectResolver explícito (necessário para Google popup/redirect).
  // Tenta persistência local; se indisponível (iframes sandboxed), cai para memória.
  const initAuth = (persistence) => authMod.initializeAuth(app, {
    persistence,
    popupRedirectResolver: authMod.browserPopupRedirectResolver,
  });
  try {
    auth = initAuth(authMod.browserLocalPersistence);
  } catch (e) {
    console.warn('[Picalta] persistência local indisponível, a usar memória:', e);
    auth = initAuth(authMod.inMemoryPersistence);
  }
  // Firestore com cache em memória
  try {
    db = fsMod.initializeFirestore(app, { localCache: fsMod.memoryLocalCache() });
  } catch (e) {
    db = fsMod.getFirestore(app);
  }
  storage = stMod.getStorage(app);
  return { auth, db, storage, onAuthStateChanged: authMod.onAuthStateChanged };
}

/* ---------- auth helpers ---------- */
async function fbSignUp(email, password, displayName) {
  const m = __authFns;
  const cred = await m.createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await m.updateProfile(cred.user, { displayName });
  return cred.user;
}
async function fbSignIn(email, password) {
  const m = __authFns;
  const cred = await m.signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}
async function fbSignOut() {
  const m = __authFns;
  await m.signOut(auth);
}

/* ---------- login com Google ---------- */
async function fbGoogleSignIn() {
  const m = __authFns;
  const provider = new m.GoogleAuthProvider();
  try {
    const cred = await m.signInWithPopup(auth, provider);
    return { ok: true, user: cred.user };
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try {
        await m.signInWithRedirect(auth, provider);
        return { ok: true, pending: true };
      } catch (e2) {
        return { ok: false, error: fbAuthError(e2) };
      }
    }
    return { ok: false, error: fbAuthError(e) };
  }
}
async function fbGetRedirectResult() {
  const m = __authFns;
  try {
    const res = await m.getRedirectResult(auth);
    return res && res.user ? { ok: true, user: res.user } : { ok: true, user: null };
  } catch (e) {
    return { ok: false, error: fbAuthError(e) };
  }
}
/* recuperação de palavra-passe por email */
async function fbResetPassword(email) {
  const m = __authFns;
  try {
    await m.sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fbAuthError(e) };
  }
}
/* aplica nome/foto da conta Google ao perfil Firestore — só se o campo estiver vazio */
async function fbApplyGoogleDefaults(user) {
  try {
    if (!user) return;
    const existing = await fbLoadProfile(user.uid);
    if (!existing) return;
    const patch = {};
    if (!existing.name && user.displayName) patch.name = user.displayName;
    if (!existing.avatarUrl && user.photoURL) patch.avatarUrl = user.photoURL;
    if (Object.keys(patch).length) await dbUpdateProfile(user.uid, patch);
  } catch (e) {
    console.warn('[Picalta] não foi possível aplicar dados do Google ao perfil:', e);
  }
}

async function fbGetIdToken() {
  const m = __authFns;
  if (!m || !auth) throw new Error('auth não inicializado');
  return await m.getIdToken(auth.currentUser);
}

/* Perfil para contas Google (aplica nome/foto só em campos em falta) */
async function fbEnsureProfileForGoogle(user) {
  const existing = await fbLoadProfile(user.uid);
  if (existing) {
    const patch = {};
    if (!existing.name && user.displayName) patch.name = user.displayName;
    if (!existing.avatarUrl && user.photoURL) patch.avatarUrl = user.photoURL;
    if (Object.keys(patch).length) {
      try { await dbUpdateProfile(user.uid, patch); } catch (e) {}
    }
    return fbLoadProfile(user.uid);
  }
  await fbCreateProfile(user.uid, user.displayName || '', user.email || '');
  if (user.photoURL) {
    try { await dbUpdateProfile(user.uid, { avatarUrl: user.photoURL }); } catch (e) {}
  }
  return fbLoadProfile(user.uid);
}
