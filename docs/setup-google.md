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
- Use **o `id` do canal (`config/channels.json`) como `--account`**. O resolvedor casa `account = channel.id` **antes** de tentar por e-mail — e-mail não é chave única (um canal Brand delegado não tem e-mail próprio: herda o do delegado, que já é o e-mail de outro canal).

## 5. Conferir a cobertura
```
npm run channels-check
```
Imprime uma tabela `canal → conta → OK / FALTA AUTH`. Preencha `config/channels.json` (`youtube_channel_id` = o `UC...` de cada canal; `google_account` = e-mail dono).

Além de "tem token?", esse comando **compara o `UC...` que o token enxerga** com o do config: se a identidade errada for escolhida no consentimento, ele acusa `TOKEN OK, mas canal não visível` e lista os IDs visíveis. Rode sempre depois de autorizar.

> **`launch_date`**: é de onde o backfill começa. Um valor "chutado" **corta o histórico em silêncio**. Pegue o real:
> `GET https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true` → `snippet.publishedAt`.

## 6. Uma conta bloqueada: OAuth client próprio (override por conta)
**Sintoma:** uma conta Google leva **"Este app está bloqueado"** *sem* opção de prosseguir, enquanto **outras contas passam normalmente no mesmo app** (só a tela "app não verificado → Advanced → prosseguir").

**Causa:** app não verificado + escopo sensível (`yt-analytics-monetary.readonly`) faz o Google aplicar proteções por risco. O escore é do **par conta × app** — não adianta mexer na conta (não há chave), e verificar o app é caro.

**Conserto (~10 min):** dê **um OAuth client próprio** a essa conta.
1. Logado **naquela conta**, crie um projeto GCloud novo e repita os passos §1–§3 (APIs, consent **External + Production**, client **Desktop app**).
2. No `.env`, sem tocar no client compartilhado:
   ```
   GOOGLE_CLIENT_ID__MINHA_CONTA=...
   GOOGLE_CLIENT_SECRET__MINHA_CONTA=...
   ```
   O sufixo é o `--account` em **MAIÚSCULAS**. Só essa conta usa esse client; as outras seguem no compartilhado.
3. `npm run auth -- --account minha-conta` — ele imprime qual client está usando antes de abrir o navegador.

> ⚠️ **NUNCA teste um client novo trocando o `GOOGLE_CLIENT_ID` global.** Um refresh token só vale no client que o emitiu: se um sync rodar com o client trocado, todas as contas dão `invalid_grant` e são marcadas como revogadas — obrigando a reautorizar **todas**. O override por conta existe justamente para isolar isso.

> Defina **os dois** (id + secret) ou **nenhum**: meia-config lança erro em vez de cair no client compartilhado em silêncio (o que só reproduziria o bloqueio).

## Notas
- Canal **não monetizado** ou sem acesso de owner/manager cai para "somente views" (R4) — o dashboard mostra "sem dados de receita", nunca R$ 0,00 falso.
- Chave de criptografia: defina `FINANCE_ENCRYPTION_KEY` (32 bytes base64) no `.env`, ou o app gera uma keyfile local automaticamente.
