# Setup — Google Cloud / YouTube Analytics (S0.3)

Passo a passo reproduzível para habilitar a leitura de receita AdSense por canal.

## 1. Projeto + APIs
1. Acesse <https://console.cloud.google.com> e crie um projeto (ou reuse um).
2. **APIs & Services → Library**, ative:
   - **YouTube Data API v3**
   - **YouTube Analytics API**

## 2. OAuth consent screen — publicar em PRODUCTION (mitiga R1)
1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (uso pessoal serve).
3. Preencha nome do app, e-mail de suporte, e-mail do desenvolvedor.
4. Em **Scopes**, adicione:
   - `https://www.googleapis.com/auth/yt-analytics-monetary.readonly`
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
   - `https://www.googleapis.com/auth/youtube.readonly`
5. **PUBLIQUE o app (Publishing status → In production).** Em modo *Testing* o refresh token expira em 7 dias. A tela "Google hasn't verified this app" é aceitável para uso pessoal — clique **Advanced → Go to (unsafe)**.

## 3. OAuth Client (Desktop / loopback)
1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Copie **Client ID** e **Client secret** para o `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_OAUTH_REDIRECT_PORT=5277
   ```
   > O redirect loopback `http://127.0.0.1:5277/oauth2callback` é aberto pelo próprio app; não precisa cadastrar nada extra para "Desktop app".

## 4. Autorizar cada conta (Brand Accounts — R2)
Para cada conta Google que possui canais:
```
npm run auth -- --account minha-conta
```
- O navegador abre. **Se o canal for Brand Account, selecione a IDENTIDADE do canal** na tela de consentimento (não só o e-mail).
- Repita para cada conta. Os refresh tokens ficam **criptografados** em `server/data/finance.db`.

## 5. Conferir a cobertura
```
npm run channels-check
```
Imprime uma tabela `canal → conta → OK / FALTA AUTH`. Preencha `config/channels.json` (`youtube_channel_id` = o `UC...` de cada canal; `google_account` = e-mail dono).

## Notas
- Canal **não monetizado** ou sem acesso de owner/manager cai para "somente views" (R4) — o dashboard mostra "sem dados de receita", nunca R$ 0,00 falso.
- Chave de criptografia: defina `FINANCE_ENCRYPTION_KEY` (32 bytes base64) no `.env`, ou o app gera uma keyfile local automaticamente.
