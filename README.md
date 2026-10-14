# Picalta — versão Firebase

Rede social de fotos com conversas em tempo real, agora com **Firebase** (Authentication + Firestore + Storage) como backend. O frontend continua em HTML, CSS e JavaScript puro — sem build tools, sem frameworks.

## O que tem de novo

- **Autenticação real** com Firebase Auth (email + palavra-passe), com ecrãs separados Entrar / Criar conta
- **Feed em tempo real** via Firestore `onSnapshot` — publicações novas aparecem sem recarregar
- **Conversas em tempo real** com escuta Firestore (substitui o WebSocket)
- **Imagens no Firebase Storage** (URLs de download guardados no Firestore)
- **Feed "A seguir"** — só publicações de quem segues
- **Pesquisa de pessoas** por nome de utilizador
- **Histórias (24h)** com visualizador e expiração automática no cliente
- **Editar perfil** (nome, bio, foto de perfil no Storage)
- **Apagar publicação** própria
- **Notificações in-app** quando alguém começa a seguir-te
- **Comentários** em tempo real por publicação

## ⚠️ Antes de funcionar: ativa os serviços no console

O teu projeto Firebase (`picala-a212f`) ainda não tem os serviços ativados. Sem isto a app não conecta. Faz estes passos:

### 1. Ativa Authentication (Email/Password)
1. Abre [console.firebase.google.com](https://console.firebase.google.com), entra no projeto `picala-a212f`
2. Menu esquerdo → **Build** → **Authentication** → **Get started**
3. Tab **Sign-in method** → ativa **Email/Password** → Save

### 2. Cria a base de dados Firestore
1. **Build** → **Firestore Database** → **Create database**
2. Escolhe **Start in production mode** (as regras já estão neste projeto)
3. Localização: `eur3` (Europa) ou o mais próximo

### 3. Publica as regras de segurança do Firestore
1. Na mesma página Firestore, tab **Rules**
2. Apaga o conteúdo e cola o ficheiro `firestore.rules` deste projeto
3. Clica **Publish**

### 4. Ativa Storage (⚠️ requer plano Blaze)

> **Importante:** desde 3 de fevereiro de 2026, o Cloud Storage para Firebase **exige o plano Blaze (pay-as-you-go)** — o plano gratuito Spark já não dá acesso a Storage. Para usar Storage tens de ligar uma conta de faturação do Google Cloud, mas o Blaze mantém as quotas gratuitas do Spark, pelo que uso leve (até ~5 GB armazenados) continua sem custo. Ver [requisitos de billing do Cloud Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

1. **Usage and billing** → faz upgrade do plano Spark para **Blaze** (requer cartão, mas uso leve mantém-se grátis)
2. **Build** → **Storage** → **Get started**
3. Tab **Rules** → cola o ficheiro `storage.rules` → **Publish**

### 5. (Opcional) Regista o domínio para Auth
Se a app for servida num domínio próprio, adiciona-o em **Authentication → Settings → Authorized domains**.

## Como entrar na app

1. Abre a app no browser
2. No ecrã de entrada, carrega em **"Criar conta"** (não em "Entrar")
3. Preenche **nome**, **email** e **palavra-passe** (mínimo 6 caracteres)
4. Carrega em **"Criar conta"** — ficas autenticado e entras na app
5. Para voltar mais tarde, carrega em **"Entrar"** e usa o mesmo email e palavra-passe

> Nota: a autenticação usa persistência em memória, por isso após recarregares a página tens de voltar a entrar com email e palavra-passe.

## Como executar

O frontend é estático (só HTML/CSS/JS), mas mantemos um servidor Node para desenvolvimento local:

```bash
cd picalta-firebase
npm install
npm start        # ou: node server.js
```

Abre http://localhost:8000.

## Estrutura

```
picalta-firebase/
├── server.js              # servidor estático (para dev local)
├── firestore.rules        # regras de segurança Firestore (publicar no console)
├── storage.rules          # regras de segurança Storage (publicar no console)
├── public/
│   ├── index.html         # interface completa
│   ├── firebase.js        # init Firebase (SDK via CDN, persistência em memória)
│   ├── auth.js            # login/signup + perfil Firestore
│   ├── data.js            # operações Firestore + Storage (posts, chats, follow, stories)
│   └── app.js             # lógica principal da UI
├── package.json
└── README.md
```

## Como funciona

- **Auth**: Firebase Authentication com email/password, usando `initializeAuth` + `inMemoryPersistence` (funciona em iframes sandboxed sem IndexedDB)
- **Dados**: Firestore com `onSnapshot` para tempo real (posts, comentários, mensagens de chat, stories, follows)
- **Imagens**: Firebase Storage — upload com `uploadBytes`, URL de download com `getDownloadURL`, só a referência no Firestore
- **Regras**: acesso baseado em `request.auth.uid` (identidade autenticada), não em IDs enviados pelo cliente; atualizações de publicações só alteram o campo `likes` (gostos)

## Sobre as imagens (a tua pergunta)

**Firebase Storage** é o certo para o teu caso — já tens o bucket na config (`picala-a212f.firebasestorage.app`). Alternativa seria guardar base64 dentro do documento Firestore, mas tem limite de ~1MB e cobrado por bytes armazenados no Firestore (mais caro). Com Storage:

- cada foto vai para `posts/{uid}/{timestamp}.jpg`
- o Firestore guarda só a URL de download (barato)
- as regras limitam a 5MB e só imagens
- o download URL é público (funciona em `<img crossorigin="anonymous">`)

⚠️ Requer plano Blaze (ver secção "Antes de funcionar", passo 4).

## Estado dos testes

O que foi **implementado e testado localmente** (com um mock do Firebase que simula Auth, Firestore e Storage em memória — não contra o Firebase real):

- Fluxo completo de cadastro → feed → publicação de foto → gosto → comentário
- Pesquisa de pessoas, seguir/deixar de seguir, perfil próprio e de outros
- Conversa em tempo real entre duas contas (mensagens + hora)
- História (24h) publicada e visualizada
- Editar perfil, apagar publicação, notificações in-app
- Acessos no telemóvel (nova história, notificações, tema, logout na tabbar)
- Mensagem de erro clara quando o Firebase Auth não está ativado

O que **não foi possível testar** contra o Firebase real (o projeto `picala-a212f` não tem Auth/Firestore/Storage ativados):

- Uploads reais para Firebase Storage (funcionamento real do bucket)
- Regras de segurança reais (as regras estão escritas mas não foram testadas contra o Firestore real)
- Quotas e faturação

Assim que ativar os serviços no console (secção acima), a app deve funcionar imediatamente com a configuração já incluída em `public/firebase.js`.

## Limitações

- As histórias (stories) expiram no cliente após 24h — os ficheiros no Storage não são apagados automaticamente (precisaria de uma Cloud Function ou TTL policy)
- Cloud Functions também requerem Blaze — expiração automática de stories ficaria para depois
- O Analytics (`measurementId` na config) não está ativo por defeito; ativa-o só se quiseres analytics
- Autenticação em memória: após recarregar a página tens de voltar a entrar

## Alternativa sem cartão (se não quiseres Blaze)

Se não quiseres ligar cartão de crédito, podes manter as imagens como **base64 no Firestore** (limite ~1MB por documento) ou usar um serviço gratuito de imagens (Cloudinary free tier). O código atual usa Storage; a mudança afetaria só `stUploadImage`/`stUploadAvatar` em `data.js`.
