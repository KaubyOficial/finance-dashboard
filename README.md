# Finance Dashboard

Dashboard financeiro **local** por canal do YouTube. Responde, por canal e para a
rede inteira:

1. **Quanto cada canal gera** — receita AdSense (YouTube Analytics API, escopo
   monetário) + vendas Hotmart atribuídas por `src`/`sck` nos links das descrições.
2. **Quanto cada canal custa** — custos recorrentes/avulsos (UI + CSV) com rateio
   de compartilhados.
3. **Margem de lucro** — P&L por canal / mês / período, multi-moeda.

> App 100% local: backend Fastify **só em `127.0.0.1`** + SQLite; front React/Vite.
> Nada exposto à internet.

## Stack
- **server/** — Node ESM + Fastify + better-sqlite3 (WAL) + google-auth-library + zod
- **web/** — React 19 + TypeScript + Vite + Tailwind 4 + Zustand + Recharts
- **config/channels.json** — canal → conta Google, `src_prefixes`, moeda, data de início

## Começar
```bash
npm install
cp .env.example .env      # preencha as credenciais (docs/setup-*.md)
npm run migrate           # cria/atualiza o banco
npm run seed              # (opcional) dados de demonstração determinísticos
npm run dev               # backend 5275 + front 5273
```
Ou no Windows: dê duplo-clique em **`iniciar.bat`**.

Abra <http://localhost:5273>.

## Configurar as integrações
1. **Google/YouTube** — `docs/setup-google.md`, depois `npm run auth -- --account <nome>` por conta.
2. **Hotmart** — `docs/setup-hotmart.md`.
3. **Canais** — preencha `config/channels.json` e valide: `npm run validate-config`.
4. **Cobertura** — `npm run channels-check`.

## Sincronizar
```bash
npm run sync-all                 # incremental (YT 35d, Hotmart 90d, FX)
npm run sync-all -- --backfill   # backfill lifetime
npm run register-task            # agenda o sync diário (Task Scheduler) + backup
```
Ou o botão **Sync now** em `/settings`.

## Testes
```bash
npm run lint
npm run typecheck
npm test          # unit (server + web): migrations, engine (golden + property), APIs
npm run e2e       # Playwright contra banco seed
```

## Arquitetura (resumo)
```
YouTube Analytics ─(OAuth por conta)─► sync/youtube ─► revenue_daily ┐
Hotmart Payments  ─(client creds)────► sync/hotmart ─► sales ────────┤► engine/pnl ─► /api ─► React
Frankfurter/ECB   ──────────────────► sync/fx ──────► fx_rates ──────┤
UI / CSV ───────────────────────────► costs CRUD ──► costs ─────────┘
```
- Toda linha guarda **moeda nativa**; conversão só na leitura (taxa do dia da transação).
- Sync **idempotente** (upsert por chave natural). Reembolso = receita negativa no mês do evento.
- Motor de P&L é **função pura** travada por suíte de ouro + property tests.

## Riscos tratados
R1 OAuth em Production (refresh não expira em 7d) · R2 token por identidade
(Brand Accounts) · R3 janela deslizante 35d + dias provisórios · R4 canal sem
receita monetária vira "somente views" · R5 credencial Hotmart NOVA (não a do n8n)
· R6 bucket "Não atribuído" + atribuição manual sticky · **R/S7.3 o dia do
YouTube é America/Los_Angeles** (cutoff em LA, testado).

## Documentação
`docs/setup-google.md` · `docs/setup-hotmart.md` · `docs/tracking-convention.md`
· `docs/adding-a-source.md` · `docs/costs-template.csv` ·
`docs/reconciliation-TEMPLATE.md` · `docs/release-checklist.md`
