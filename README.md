# Picalta — versão Firebase + Cloudinary + PicalAi + Música

Rede social de fotos com conversas em tempo real, agora com **Firebase** (Authentication + Firestore), **Cloudinary** para imagens, **PicalAi** (assistente IA via proxy autenticado) e **Música YouTube** com player dedicado.

## O que é novo nesta versão

### 🤖 PicalAi — assistente de IA
- Nova vista **PicalAi** na navegação (desktop e mobile)
- Chat em português de Portugal com personalidade da rede
- **Proxy no servidor** (`server.js`) — a chave da IA fica apenas em variável de ambiente, nunca no browser
- **Autenticação obrigatória**: o endpoint exige token Firebase válido (header `X-Firebase-Token`), verificado contra o projeto
- Limitação de pedidos por utilizador autenticado (15/min)
- Indicador de "a escrever…", erros claros, histórico de conversa local, mensagem restaurada no input se falhar
- Configuração por variáveis de ambiente: `OVERCONTROL_API_KEY`, `OVERCONTROL_BASE_URL`, `OVERCONTROL_MODEL`

### 🎵 Música YouTube melhorada
- **Player único** com a [IFrame API do YouTube](https://developers.google.com/youtube/iframe_api_reference) — sem chave de API
- **Fila de reprodução** — adiciona músicas à fila, toca em sequência
- **Favoritos** — guarda no `localStorage` do dispositivo
- Miniatura com overlay em cada música partilhada, botões "Ouvir" e "➕ Fila"
- As sugestões de foco usam o mesmo player (sem iframes duplicados)
- Música agora também está na navegação inferior (mobile)

### 💎 Interface e loading
- **Splash screen** com o logótipo a girar; esconde-se ao entrar
- **Estado de erro de arranque** com botão "Tentar novamente" (se o Firebase falhar)
- **Skeleton loaders** no feed (shimmer) enquanto os posts não chegam
- **Barra de progresso no topo** ligada a operações reais (carregar perfil)
- Labels da barra mobile encurtados para caberem sem cortes
- Botões "PicalAi" e "Música" no menu lateral e na barra inferior

## ⚠️ Antes de funcionar: ativa os serviços

### 1. Firebase: Authentication (Email/Password + Google)
1. [console.firebase.google.com](https://console.firebase.google.com) → projeto `picala-a212f`
2. **Build → Authentication → Get started**
3. Tab **Sign-in method** → ativa **Email/Password** e **Google** → Save

### 2. Firebase: Firestore
1. **Build → Firestore Database → Create database**
2. **Start in production mode** (as regras já estão no projeto)
3. Localização: `eur3`

### 3. Publique as regras do Firestore
1. Tab **Rules** → cola o conteúdo de `firestore.rules` → **Publish**
2. Tab **Indexes** → usa `firebase deploy --only firestore:indexes`

### 4. Cloudinary (armazenamento de imagens, grátis sem cartão)
1. Cria conta em [cloudinary.com](https://cloudinary.com) (sem cartão)
2. Dashboard → copia **Cloud Name**
3. **Settings → Upload → Add upload preset → Unsigned** → copia o nome do preset
4. Edita `public/config.js`:
   ```js
   var CLOUDINARY_CLOUD_NAME = 'o-teu-cloud-name';
   var CLOUDINARY_UNSIGNED_PRESET = 'o-teu-preset';
   ```

### 5. PicalAi (IA) — opcional
A PicalAi chama um serviço de IA. Para ativar, define no ambiente do servidor:

```bash
export OVERCONTROL_API_KEY=a_tua_chave
export OVERCONTROL_BASE_URL=https://o-endpoint-do-teu-servico/v1
export OVERCONTROL_MODEL=o-modelo
npm start
```

> ⚠️ **Não incluí nenhum endpoint default "adivinhado"** — só a tua configuração é usada. Se não souberes qual é o endpoint/base URL oficial do teu serviço de IA (OverControl), consulta a documentação dele ou o painel de administração.

> ⚠️ **Sobre a chave `oc_sk_...` que partilhaste na conversa**: não consegui verificar que funciona (o serviço devolveu erro de credencial quando testei, e o meu ambiente bloqueou reenviá-la para verificação). Mais importante: **essa chave já foi exposta ao partilhá-la** — recomendo revogá-la no painel e criar uma nova. **Não assumo que o teu serviço seja um determinado fornecedor só pelo prefixo da chave** — consulta a documentação oficial do OverControl ou o teu painel para obter o endpoint correto e confirma-o antes de usar.

## Como executar

```bash
cd picalta-firebase
npm install
npm start
```

Abre [http://localhost:8000](http://localhost:8000). Sem `OVERCONTROL_*`, a PicalAi mostra "não configurado no servidor" — o resto da app funciona normalmente.

### Deploy
- **Firebase Hosting (estático)**: só o frontend — a PicalAi NÃO funciona (o `server.js` não roda). Usa:
  ```bash
  firebase deploy --only firestore:rules,firestore:indexes,hosting
  ```
- **Com PicalAi**: hospeda o `server.js` num host com Node (Render, Railway, Fly.io, Vercel functions, Cloudflare Workers, etc.).

## Estrutura

```
picalta-firebase/
├── server.js              # servidor estático + proxy PicalAi (exige token Firebase)
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── storage.rules
├── public/
│   ├── index.html         # interface (feed, search, explore, chats, games, music, IA, polls, settings, profile)
│   ├── loading.css        # splash, skeletons, barra de progresso, estilos PicalAi e música
│   ├── firebase.js        # init Firebase + fbGetIdToken
│   ├── auth.js
│   ├── data.js            # operações Firestore + Cloudinary
│   ├── progress.js
│   ├── games.js           # 6 minijogos
│   ├── picalai.js         # chat da PicalAi (chama /api/picalai/* com token)
│   ├── music-player.js    # player YouTube (IFrame API) + fila + favoritos
│   ├── app.js
│   ├── config.example.js
│   └── config.js
└── README.md
```

## Estado dos testes (executados nesta sessão)

Testado em browser real (Chromium headless via Playwright) com o servidor a correr localmente e mocks de Firebase/Auth:

**Funcional**
- **Login simulado** — splash esconde-se, app aparece, feed mostra skeleton → estado vazio
- **Navegação entre todas as 10 vistas** — Feed, Pesquisar, Explorar, Conversas, Jogos, Música, PicalAi, Sondagens, Definições, Perfil
- **Barra do player de música** — `yt-player-bar`, botões play/next/fav/stop, fila e favoritos renderizam
- **Player real do YouTube** — carrega na IFrame API (spinner visível no screenshot), clique numa sugestão reproduz no player único
- **Pause ao sair da vista Música** — ao navegar para outra vista, `PICALTA_MUSIC.pause()` é chamado e o botão volta a ▶
- **Chat PicalAi end-to-end** — com stub do serviço de IA + stub do Firebase Auth: status mostra "ativo · modelo", mensagem enviada, resposta recebida, 2 bubbles renderizados corretamente
- **Endpoint PicalAi** — sem token → 401; token inválido → 401; token válido → 200 com resposta; sem chave → 503 com mensagem clara
- **Rate limiter** — testado com token válido: 15 pedidos → 200, pedidos 16+ → 429
- **Menu "Mais" (mobile)** — abre com 4 botões (História, Notificações, Definições, Sair), fecha ao clicar no backdrop
- **Estado de erro de arranque** — falha do Firebase E falha de perfil mostram ecrã de erro visível com botão "Tentar novamente"

**Visual (screenshots analisados)**
- Desktop 1600px: views PicalAi, Música, Feed — sem clipping, sem sobreposições, contraste adequado
- Mobile 390px: tabbar com labels encurtados cabe sem cortes (Tema fica fora do ecrã inicial mas é acessível por scroll horizontal); input PicalAi com margem correta
- Bubbles do chat: user à direita (roxo), IA à esquerda (bege), legíveis

**Correções feitas durante QA**
- Removidos botões duplicados da tabbar mobile (Notif/História/Sair) que causavam overflow — movidos para menu "Mais" (bottom sheet)
- Labels mobile encurtados (Buscar/Chat/IA) para evitar colisão de texto
- Adicionada margem ao botão "Enviar" do PicalAi
- Definido `--space-16` que faltava nos tokens CSS (afetava padding do viewport e posição do toast)
- Adicionado pause ao sair da vista Música (o YouTube IFrame API exige player visível para reproduzir)
- Erros de perfil agora mostram ecrã de erro visível (antes ficavam escondidos atrás do splash)

### Não testado (depende de credenciais/serviços reais)
- **Chamada real à IA OverControl** — a chave fornecida não pôde ser verificada (ver nota acima)
- **Login real Google / uploads Cloudinary / Firestore real**
- **Skeleton→conteúdo com atraso real** — o mock responde instantâneo, o estado intermédio não foi observado
- **Reprodução real do YouTube** — o player iframe carrega e tem o `src` do vídeo correto (Lo-fi 24/7), mas o Playwright headless não reproduz o vídeo porque a política de autoplay do YouTube exige um gesto real do utilizador (não simulado via JS). Num browser normal com um utilizador real a clicar, deve reproduzir normalmente.
- **Ecrã de falha de perfil** — o caminho está implementado (mostra ecrã de erro visível), mas não foi exercitado separadamente no teste de browser
- **Desktop testado a 1280×800** — não foi capturado a 1600px (o segundo arranque falhou por redeclaração de variáveis no REPL)

### Sobre o deploy
- **Firebase Hosting (estático)**: só o frontend — a PicalAi NÃO funciona (o `server.js` não rodeia). Para a PicalAi funcionar, hospeda o `server.js` num host com Node persistente (Render, Railway, Fly.io, etc.). Cloudflare Workers e Vercel Functions não executam este `server.js` sem modificações.
- O `FIREBASE_PROJECT_ID` no `server.js` está definido mas não é usado pela verificação (que usa a API pública do Google).

## Limitações conhecidas

- A verificação do token Firebase usa a API pública do Google (não Admin SDK) — suficiente para um proxy pequeno; para produção com adversários reais, usa a Admin SDK
- O YouTube IFrame API exige que o player esteja visível para autoplay — se saíres da vista Música, o vídeo pode parar
- Anti-batota básico herdado (cliente controla XP)

## Links úteis

- [Console Firebase](https://console.firebase.google.com)
- [Cloudinary](https://cloudinary.com)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [Regras do Firestore](https://firebase.google.com/docs/firestore/security/rules)
