/* Picalta — lógica de autenticação (Entrar / Criar conta) */
'use strict';

/* o utilizador autenticado atual (null se não autenticado) */
var currentUser = null;
/* dados do perfil do Firestore */
var myProfile = null;

/* ---------- login / signup ---------- */
async function doLogin(email, password) {
  try {
    const user = await fbSignIn(email, password);
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: fbAuthError(e) };
  }
}
async function doSignUp(email, password, name) {
  try {
    const user = await fbSignUp(email, password, name);
    // cria perfil no Firestore; se falhar, a conta existe mas o perfil pode não existir
    // (recupera no próximo login porque fbEnsureProfile trata isso)
    try {
      await fbCreateProfile(user.uid, name, email);
    } catch (profileErr) {
      console.warn('[Picalta] conta criada mas perfil não guardado:', profileErr);
      // continua: o observador vai chamar fbEnsureProfile
    }
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: fbAuthError(e) };
  }
}
function fbAuthError(e) {
  const code = (e && e.code) || '';
  if (code.includes('email-already-in-use')) return 'Este email já tem conta. Tenta entrar.';
  if (code.includes('invalid-email')) return 'Email inválido.';
  if (code.includes('weak-password')) return 'Palavra-passe fraca (mínimo 6 caracteres).';
  if (code.includes('user-not-found') || code.includes('invalid-credential')) return 'Email ou palavra-passe errados.';
  if (code.includes('wrong-password')) return 'Email ou palavra-passe errados.';
  if (code.includes('too-many-requests')) return 'Demasiadas tentativas. Espera um pouco.';
  if (code.includes('network-request-failed')) return 'Sem ligação ao Firebase.';
  if (code.includes('configuration-not-found')) return 'O Firebase ainda não tem o login por email ativado (ativa Email/Password no console).';
  if (code.includes('api-key-not-valid')) return 'A apiKey não é válida.';
  if (code.includes('operation-not-allowed')) return 'Login por email/password está desativado no projeto.';
  return 'Erro: ' + (e && e.message ? e.message.split('.')[0] : 'desconhecido');
}

/* ---------- perfil (Firestore) ---------- */
async function fbCreateProfile(uid, name, email) {
  const { doc, setDoc, serverTimestamp } = __fsFns;
  const username = (email || '').split('@')[0].replace(/[^a-z0-9._]/g, '') || ('user' + uid.slice(0, 6));
  await setDoc(doc(db, 'users', uid), {
    uid,
    username,
    name: name || username,
    email,
    bio: '',
    avatarUrl: null,
    createdAt: serverTimestamp(),
  }, { merge: true });
}
async function fbLoadProfile(uid) {
  const { doc, getDoc } = __fsFns;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}
/* Garante que existe perfil; cria-o se não existir (recuperação de contas
   criadas mas cujo perfil falhou ao guardar) */
async function fbEnsureProfile(uid, email, displayName) {
  const existing = await fbLoadProfile(uid);
  if (existing) return existing;
  await fbCreateProfile(uid, displayName || '', email || '');
  return fbLoadProfile(uid);
}
