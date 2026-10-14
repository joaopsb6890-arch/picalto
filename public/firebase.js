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
  // Auth com persistência em memória (funciona em iframes sandboxed sem IndexedDB)
  auth = authMod.initializeAuth(app, { persistence: authMod.inMemoryPersistence });
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
