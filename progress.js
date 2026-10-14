/* Picalta — progressão: XP, níveis, conquistas */
'use strict';

/* XP por ação */
const XP_RULES = {
  post: 15,
  like_received: 2,
  comment: 3,
  story: 8,
  follow: 2,
  game_score: 1, // por ponto nos jogos (mínimo 1)
  typing_wpm: 2,
};
function levelForXp(xp) {
  let lvl = 1;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i]) lvl = i + 1;
  }
  return lvl;
}
function nextLevelAt(xp) {
  const lvl = levelForXp(xp);
  if (lvl >= LEVELS.length) return null;
  return LEVELS[lvl];
}

/* Conquistas (badges) */
const ACHIEVEMENTS = {
  first_post: { label: 'Primeira publicação', icon: '📷', desc: 'Publica a tua primeira foto', xp: 20 },
  first_story: { label: 'Primeira história', icon: '✨', desc: 'Publica uma história', xp: 15 },
  first_follow: { label: 'Primeiro seguidor', icon: '👥', desc: 'Alguém começou a seguir-te', xp: 15 },
  social_butterfly: { label: 'Borboleta social', icon: '🦋', desc: 'Segue 5 pessoas', xp: 30 },
  chatterbox: { label: 'Falante', icon: '💬', desc: 'Envia 10 mensagens', xp: 25 },
  first_memory_win: { label: 'Mente afiada', icon: '🧠', desc: 'Ganha o jogo da memória', xp: 30 },
  snake_master: { label: 'Mestre da cobra', icon: '🐍', desc: '20 pontos no Snake', xp: 40 },
  flappy_legend: { label: 'Lenda do voo', icon: '🐦', desc: '15 pontos no Picalta Fly', xp: 40 },
  reached_2048: { label: '2048', icon: '🔢', desc: 'Chega ao 2048', xp: 50 },
  beat_tictactoe_ai: { label: 'Venceste o computador', icon: '❌', desc: 'Ganha o galo ao computador', xp: 35 },
  completed_typing_test: { label: 'Escritor veloz', icon: '⌨️', desc: 'Termina o teste de escrita', xp: 25 },
  explorer: { label: 'Explorador', icon: '🧭', desc: 'Pesquisa por 3 pessoas diferentes', xp: 20 },
  night_owl: { label: 'Coruja noturna', icon: '🦉', desc: 'Usa a app de madrugada', xp: 15 },
};
/* gatilhos todos implementados: first_post, first_story, first_follow,
   social_butterfly, chatterbox, first_memory_win, snake_master, flappy_legend,
   reached_2048, beat_tictactoe_ai, completed_typing_test, explorer, night_owl. */

/* progress.js não declara state — app.js é o único dono. As funções
todo referem-se a `state` quando chamadas (após enterApp). */

const LEVELS = [0, 50, 150, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000];

/* XP transacional — XP e nível são atualizados na mesma transação runTransaction(db, ...) */
async function addXp(amount, reason) {
  if (!state.me || !amount) return;
  try {
    const { doc, runTransaction } = __fsFns;
    const pr = doc(db, 'players', state.me.uid);
    await dbGetPlayer(state.me.uid);
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(pr);
      if (!snap.exists()) {
        tx.set(pr, { uid: state.me.uid, xp: amount, level: 1, achievements: [] });
        return { xp: amount, level: 1 };
      }
      const cur = snap.data();
      const newXp = (cur.xp || 0) + amount;
      const newLevel = levelForXp(newXp);
      tx.update(pr, { xp: newXp, level: newLevel });
      return { xp: newXp, level: newLevel };
    });
    const beforeLevel = state.player ? state.player.level || 1 : 1;
    state.player.xp = result.xp;
    state.player.level = result.level;
    if (result.level > beforeLevel) toast(`Subiste para o nível ${result.level}! 🎉`);
    else if (reason) toast(`+${amount} XP — ${reason}`);
    renderXpBar();
  } catch (e) {
    console.warn('[Picalta] falha ao atualizar XP', e);
  }
}

async function unlockAchievement(key) {
  if (!state.me) return false;
  const a = ACHIEVEMENTS[key];
  if (!a) return false;
  try {
    const p = await dbGetPlayer(state.me.uid);
    if ((p.achievements || []).includes(key)) return false;
    await dbUnlockAchievement(state.me.uid, key);
    toast(`${a.icon} Conquista desbloqueada: ${a.label}! (+${a.xp} XP)`);
    await addXp(a.xp, null);
    renderAchievements();
    return true;
  } catch (e) { return false; }
}

function renderXpBar() {
  const bar = $('#xp-bar');
  const lvl = $('#xp-level');
  const txt = $('#xp-text');
  if (!bar || !lvl || !txt) return;
  const xp = state.player.xp || 0;
  const lvlN = state.player.level || 1;
  const next = nextLevelAt(xp);
  const base = LEVELS[lvlN - 1] || 0;
  const pct = next ? Math.min(100, Math.round((xp - base) / (next - base) * 100)) : 100;
  lvl.textContent = 'Lv ' + lvlN;
  txt.textContent = next ? `${xp} / ${next} XP` : `${xp} XP (máx)`;
  bar.style.width = pct + '%';
}

function renderAchievements() {
  const box = $('#achievements-list');
  if (!box) return;
  const mine = state.player.achievements || [];
  const html = Object.entries(ACHIEVEMENTS).map(([k, a]) => {
    const got = mine.includes(k);
    return `<div class="achievement ${got ? 'got' : ''}" title="${escapeHtml(a.desc)}">
      <span class="achievement-icon">${a.icon}</span>
      <div><b>${escapeHtml(a.label)}</b><span class="achievement-desc">${got ? 'Desbloqueada' : escapeHtml(a.desc)}</span></div>
    </div>`;
  }).join('');
  box.innerHTML = `<h3>🏅 Conquistas (${mine.length}/${Object.keys(ACHIEVEMENTS).length})</h3><div class="achievements-grid">${html}</div>`;
}

/* watchers de XP: escuta alterações ao perfil do jogador */
function startProgressWatchers() {
  if (state.progressStarted) return;
  state.progressStarted = true;
  dbWatchPlayer(state.me.uid, (p) => {
    if (p && p.uid !== undefined) {
      const before = state.player ? state.player.xp : 0;
      state.player = { ...(state.player || {}), ...p };
      if ((p.xp || 0) > before) {
        // nível subiu
        const newLvl = levelForXp(p.xp || 0);
        if (newLvl > (state.player.level || 1)) {
          toast(`Subiste para o nível ${newLvl}! 🎉`);
        }
      }
      renderXpBar();
      renderAchievements();
    }
  });
  renderXpBar();
  renderAchievements();
}

/* Hook para desbloquear conquistas de XP em ações sociais */
function xpOnPost() { addXp(XP_RULES.post, 'publicação'); }
function xpOnStory() { addXp(XP_RULES.story, 'história'); unlockAchievement('first_story'); }
function xpOnFollow() { addXp(XP_RULES.follow, 'novo seguido'); }
function xpOnComment() { addXp(XP_RULES.comment, 'comentário'); }
function xpOnChat() {
  state._chatCount = (state._chatCount || 0) + 1;
  addXp(XP_RULES.comment, 'mensagem');
  if (state._chatCount >= 10) unlockAchievement('chatterbox');
}
function xpOnGameScore(game, score) {
  const amount = Math.max(1, Math.round(score * XP_RULES.game_score / 10));
  addXp(amount, 'pontuação nos jogos');
  if (game === 'snake' && score >= 20) unlockAchievement('snake_master');
  if (game === 'flappy' && score >= 15) unlockAchievement('flappy_legend');
}
