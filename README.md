# Picalta — versão Firebase + Cloudinary

Rede social de fotos com conversas em tempo real, agora com **Firebase** (Authentication + Firestore) e **Cloudinary** para imagens (grátis, sem cartão). O frontend continua em HTML, CSS e JavaScript puro — sem build tools, sem frameworks.

## O que tem de novo nesta versão

### 🔐 Autenticação
- **Login com Google** — botão "Entrar com Google" no ecrã de entrada
- Email/palavra-passe (como antes)
- **Recuperação de palavra-passe** ("Esqueceste-te da palavra-passe?")
- Sessão persistente (localStorage) com fallback para memória em iframes sandboxed

### 🗄️ Armazenamento de imagens sem cartão de crédito
- **Cloudinary** (grátis, sem cartão, 25 créditos/mês — ver [preços Cloudinary](https://cloudinary.com/pricing))
- Substitui o Firebase Storage (que desde 2026 exige o plano Blaze com cartão)
- Upload unsigned (client-side, sem servidor)
- **Configuração necessária** — ver secção abaixo

### 🎮 Jogos (6)
1. **Jogo da Memória** — encontra pares de emojis
2. **Snake** — a cobra clássica
3. **Picalta Fly** — flappy bird
4. **2048** — combina números até 2048
5. **Galo** — tic-tac-toe contra o computador
6. **Teste de Escrita** — 60 segundos, mede palavras/min e precisão

Cada jogo tem leaderboard próprio (top 20) guardado no Firestore.

### 🏆 Progressão
- **XP** por ação (publicar, gostar, comentar, seguir, jogar)
- **Níveis** (1 a 13) com barra de progresso no feed
- **Conquistas** (badges) — 13 desbloqueáveis
- **Ranking global** por XP

### 📱 Mais sistemas sociais
- **Posts de texto** ("Novo estado") com mood picker (emoji)
- **Hashtags** — clica numa hashtag para filtrar o feed
- **Favoritos** — marca posts com um coração/estrela
- **Sondagens** — cria perguntas com 2-3 opções, vota, vê percentagens
- **Música** — partilha links do YouTube, toca direto na app
- **Definições** — vê estado do Cloudinary, som on/off, reposição de password

## ⚠️ Antes de funcionar: ativa os serviços

### 1. Firebase: Authentication (Email/Password + Google)
1. [console.firebase.google.com](https://console.firebase.google.com) → projeto `picala-a212f`
2. **Build → Authentication → Get started**
3. Tab **Sign-in method** → ativa **Email/Password** → Save
4. Ativa também **Google** → Save
5. (Opcional) Se usares domínio próprio: **Settings → Authorized domains**

### 2. Firebase: Firestore
1. **Build → Firestore Database → Create database**
2. **Start in production mode** (as regras já estão no projeto)
3. Localização: `eur3` (Europa)

### 3. Publique as regras do Firestore
1. Tab **Rules** → cola o conteúdo de `firestore.rules`
2. **Publish**
3. Tab **Indexes** → cria os índices compostos de `firestore.indexes.json` (ou usa `firebase deploy --only firestore:indexes` com o `firebase.json` incluído)

### 4. Cloudinary (armazenamento de imagens, grátis sem cartão)
1. Cria conta gratuita em [cloudinary.com](https://cloudinary.com) — **sem cartão**
2. No Dashboard, copia o **Cloud Name**
3. **Settings → Upload → Add upload preset** → escolhe **Unsigned** → copia o nome do preset
4. Edita o ficheiro `public/config.js`:
   ```js
   var CLOUDINARY_CLOUD_NAME = 'o-teu-cloud-name';
   var CLOUDINARY_UNSIGNED_PRESET = 'o-teu-preset';
   ```
5. Recarrega a app — os uploads de imagens passam a funcionar

**Sobre o nome que te esqueceste:** era quase certamente **Cloudinary** (grátis, sem cartão, só para imagens/vídeo) ou **Supabase Storage** (1 GB grátis, também sem cartão). Escolhemos Cloudinary porque se integra só no frontend (não precisas de servidor) e é especialista em imagens. O plano Free dá 25 créditos/mês (1 crédito ≈ 1 GB de armazenamento OU 1 GB de banda OU 1000 transformações) — suficiente para uma rede social pequena.

### 5. (Opcional) Firebase Storage — apenas se quiseres Blaze
O Cloud Storage para Firebase **exige plano Blaze** desde fevereiro 2026. Se não quiseres ligar cartão, usa só Cloudinary e ignora o `storage.rules`.

## Como executar

```bash
cd picalta-firebase
npm install
npm start        # ou: node server.js
```

Abre http://localhost:8000.

### Deploy opcional (Firebase Hosting)

O projeto inclui `firebase.json` configurado. Se tiveres o CLI do Firebase:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

Isto publica as regras, os índices compostos e o site estático de uma só vez.

## Estrutura

```
picalta-firebase/
├── server.js              # servidor estático (dev local)
├── firestore.rules        # regras Firestore (posts, players, gameScores, polls, songs, favorites…)
├── firestore.indexes.json # índices compostos (ranking por jogo, feed por hashtag/uid)
├── firebase.json          # config CLI (rules + indexes + hosting)
├── storage.rules          # (opcional, se usares Firebase Storage/Blaze)
├── public/
│   ├── index.html         # interface (views: feed, search, explore, chats, games, music, polls, settings, profile)
│   ├── firebase.js        # init Firebase + login Google + reset password
│   ├── auth.js            # login/signup + perfil Firestore
│   ├── data.js            # operações Firestore + Cloudinary (posts, chats, follow, stories, XP, jogos, polls, songs)
│   ├── progress.js         # XP, níveis, conquistas
│   ├── games.js            # 6 minijogos
│   ├── app.js              # lógica principal da UI
│   ├── config.example.js   # modelo para configurar o Cloudinary
│   └── config.js           # Cloudinary credentials (edita tu)
└── README.md
```

## Sobre o armazenamento de imagens

- **Cloudinary** substitui o Firebase Storage nos uploads
- As URLs de imagens (antigas do Storage ou novas do Cloudinary) continuam a funcionar
- O Firestore guarda só a URL de download (barato)
- O upload é **unsigned** (sem API secret no frontend)
- ⚠️ O preset unsigned é público — restringe formatos e tamanho no painel do Cloudinary
- ⚠️ Apagar um documento no Firestore **não apaga** o ficheiro no Cloudinary (terias de o fazer manualmente no painel)

## Estado dos testes

### O que foi efetivamente testado (executado neste histórico)

Testado em DOM real (jsdom, com os scripts carregados na ordem real do HTML e um mock de Firebase):

- **Arranque sem erros de sintaxe ou de consola** — todos os ficheiros (firebase, auth, data, progress, games, app) carregam e avaliam sem exceptions
- **Navegação entre vistas** (feed → jogos → chats → música → sondagens → definições → perfil) sem erros
- **Todos os 6 jogos criam os seus elementos DOM** (memory-grid, snake-canvas, flappy-canvas, grid2048, ttt-grid, typing-input)
- **Cleanup de listeners** — sair da vista de jogos chama `closeGame()` que remove handlers de teclado (testado disparando keydown após close)
- **`renderPolls`, `renderMusicView`, `renderSettings`** executam sem erros (com mock de Firestore vazio)
- **`submitGameScore` + `addXp` + `unlockAchievement`** com mock de Firestore (runTransaction, addDoc) — XP atualiza de 0 → 20, conquista desbloqueada
- **`dbCreatePoll`, `dbVotePoll`, `dbShareSong`, `dbCreateTextPost`, `dbToggleFavorite`** executam sem erros com mock
- **`renderPolls` re-entrante** — segunda chamada limpa watchers antigos corretamente
- **Regras de gostos validadas em 8 casos limite** (adicionar/remover próprio, adicionar/remover terceiro, duplicado, reordenar, neutro, substituir)

### Não testado (depende de conta/credenciais reais)

- **Login real com Google** — precisa de ativar o provider no console Firebase
- **Uploads reais para Cloudinary** — precisa de cloud name + unsigned preset
- **Regras de segurança contra o Firestore real** — as regras estão escritas e validadas em lógica, mas não foram avaliadas contra o servidor Firebase
- **Quotas, limites e faturação**

### Limitações conhecidas (documentadas)

- **Anti-batota básico**: o cliente calcula XP e pontuações. Um utilizador mal-intencionado pode escrever diretamente no Firestore para inflar XP/pontuações. As regras validam campos e tipos, mas o valor é controlado pelo cliente.
- Stories expiram no cliente após 24h — ficheiros no Cloudinary não são apagados automaticamente (precisaria de Cloud Function ou tarefa agendada)
- Cloudinary Free tem 25 créditos/mês partilhados entre armazenamento/banda/transformações — monitoriza no Dashboard
- Analytics (`measurementId`) não ativo por defeito
- 3 conquistas (first_follow, explorer, night_owl) agora têm gatilho implementado mas não foram testadas contra Firestore real

## Links úteis

- [Console Firebase](https://console.firebase.google.com)
- [Cloudinary](https://cloudinary.com) — Dashboard e preços
- [Regras do Firestore](https://firebase.google.com/docs/firestore/security/rules)
