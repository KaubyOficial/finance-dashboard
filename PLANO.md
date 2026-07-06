# Finance Dashboard — Plano Completo (Epics + Stories)

> **Status: ✅ IMPLEMENTADO 2026-07-06.** Todos os 9 epics construídos e validados —
> `npm test` 84 unit verdes (80 server + 4 web), Playwright e2e 5/5, lint + typecheck
> limpos, build ok, servidor real testado end-to-end (P&L bate com o seed).
> **DB = `node:sqlite` embutido** (better-sqlite3 não compila neste ambiente — Node 24 sem MSVC).
> Falta só o Kauê ligar credenciais reais (`.env`) + IDs de canais (`config/channels.json`).
> Criado 2026-07-06 a partir do questionário de alinhamento com o Kauê.

---

## 1. Visão do produto

Dashboard financeiro local que responde, por canal do YouTube e para a rede inteira:

1. **Quanto cada canal está gerando** — receita AdSense real (YouTube Analytics API, escopo monetário) + vendas Hotmart atribuídas ao canal via código de tracking (`src`/`sck`) nos links das descrições.
2. **Quanto cada canal está custando** — custos recorrentes e avulsos lançados manualmente na UI + importação por CSV, com regras de rateio para custos compartilhados.
3. **Margem de lucro** — P&L por canal / por mês / por período: receita − custos = lucro, margem %.

## 2. Decisões travadas (questionário 2026-07-06)

| Decisão | Resposta |
|---|---|
| Canais | **Todos os canais da rede** (REDE F todos os idiomas, Cortes DE, Orchestral World A) |
| Plataforma | **App local standalone** — React 19 + TS + Vite + Tailwind 4 + Zustand (família Synkra Hub / PontoFácil) + backend Node local |
| Custos | **Entrada manual na UI + importação CSV** (sem Meta Ads API por ora — plugável depois) |
| Hotmart | **API direta da Hotmart** + convenção de tracking `src`/`sck` por canal nos links das descrições |
| Contas Google | **Várias contas Google, todas acessíveis** → gestão multi-conta de tokens OAuth |
| Moeda | **Multi-moeda com toggle** — armazenar moeda nativa, converter na exibição (BRL/USD/EUR) |
| Histórico | **Backfill desde o início de cada canal** (lifetime) |
| Atualização | **Sync automático diário (Task Scheduler) + botão "Sync now"** na UI |

## 3. Arquitetura

```
finance-dashboard/
├── server/                  # Node ESM + Fastify (SÓ localhost, porta 5275)
│   ├── src/
│   │   ├── db/              # better-sqlite3 + migrations + schema
│   │   ├── auth/            # OAuth Google multi-conta (token store) + Hotmart client-credentials
│   │   ├── sync/            # youtube.js, hotmart.js, fx.js (idempotentes, incrementais)
│   │   ├── engine/          # P&L: agregação receita+custo+rateio+conversão → margem
│   │   ├── routes/          # /api/* (channels, pnl, costs CRUD, sync, health)
│   │   └── index.js
│   ├── scripts/             # register-task.ps1 (padrão MDA Monitor), sync-headless
│   └── data/                # finance.db + sync-log (gitignored)
├── web/                     # React 19 + TS + Vite + Tailwind 4 + Zustand
│   └── src/                 # pages: Overview, Channel, Costs, Settings/Sync
├── config/
│   └── channels.json        # canal → conta Google, src codes, moeda, data de início
├── .env                     # GOOGLE_CLIENT_ID/SECRET, HOTMART_CLIENT_ID/SECRET/BASIC
└── docs/stories/            # stories numeradas (este plano vira as stories)
```

Princípios:
- **SQLite (better-sqlite3)** como store: dados transacionais (vendas, dias de receita, custos, taxas de câmbio) pedem queries por período — JSON não escala pro backfill lifetime.
- **Sync idempotente**: cada job faz upsert por chave natural (`channel+date` para receita YT, `transaction_id` para Hotmart) — rodar duas vezes nunca duplica.
- **Moeda**: toda linha guarda `amount` + `currency` nativos; conversão só na leitura, usando a taxa do dia da transação (tabela `fx_rates` diária, fonte Frankfurter/ECB — grátis, sem key).
- **Backend só localhost** (mesma postura do Synkra Hub) — nada exposto.

### Fluxos de dados

```
YouTube Analytics API ──(OAuth por conta Google)──► sync/youtube ──► revenue_daily
Hotmart Payments API ──(client credentials)───────► sync/hotmart ──► sales (+ attribution src→channel)
Frankfurter/ECB ──────────────────────────────────► sync/fx ──────► fx_rates
UI / CSV ─────────────────────────────────────────► costs CRUD ───► costs (+ allocation rules)
                                    engine/pnl ◄── tudo acima ──► API ──► Dashboard React
```

### Modelo de atribuição Hotmart → canal

- Convenção de código: `src=yt_<slug-do-canal>` (ex.: `yt_redef_de`, `yt_cortes_de`) em **todos** os links de checkout/LP nas descrições de vídeo. Opcional granular: `yt_<canal>_<videoId>`.
- `config/channels.json` mapeia prefixo `src` → canal. Venda sem `src` reconhecido → bucket **"Não atribuído"** (sempre visível no dashboard, nunca escondido).
- Receita Hotmart contabilizada = **comissão líquida recebida** (valor do producer/affiliate), não preço cheio. Reembolso/chargeback = status atualizado na venda → engine subtrai no mês do evento.

## 4. Riscos conhecidos (mitigar nas stories)

| # | Risco | Mitigação |
|---|---|---|
| R1 | OAuth consent screen em **modo Testing** expira refresh tokens em 7 dias | Story S1.1 publica o app em Production (uso pessoal; tela "unverified" é aceitável) |
| R2 | Canais em **Brand Accounts** exigem autorizar selecionando a identidade do canal | Token store keyed por identidade autorizada, não só por e-mail (S1.2) |
| R3 | Receita do YT tem **lag ~48h** e revisão até ~10º dia do mês seguinte | Sync re-busca janela deslizante de 35 dias todo dia; UI marca dias "provisórios" (S1.4, S6.3) |
| R4 | Escopo `yt-analytics-monetary.readonly` só retorna receita p/ **canal monetizado + usuário owner/manager** | Checklist por canal na S1.3; canal não monetizado cai pra "somente views" com aviso |
| R5 | Credencial Hotmart Basic hardcoded nos fluxos n8n (memória ⚠️) | Usar credenciais NOVAS no `.env` deste projeto; lembrete de rotacionar a antiga |
| R6 | Vendas antigas **sem `src`** ficam não atribuídas | Bucket explícito + story de mapeamento manual retroativo produto→canal (S2.5) |
| R7 | Quota diária das APIs Google | Analytics API é barata (1 unit/query); backfill em chunks com retry/backoff (S1.4) |

## 5. Perguntas em aberto (responder antes do Epic 0 — não bloqueiam o plano)

1. Lista exata de canais + qual conta Google é dona de cada um (preencher `config/channels.json`).
2. Credenciais Hotmart (client id/secret novos via painel de desenvolvedor Hotmart).
3. Lista inicial de categorias de custo (ex.: TTS/ElevenLabs, Suno, narração Fiverr, editores, thumbnails, ferramentas) e quais são compartilhados entre canais.

---

# EPICS & STORIES

Estimativas: **S** (≤ meia sessão) · **M** (uma sessão) · **L** (mais de uma sessão).
Toda story tem Acceptance Criteria (AC) verificáveis; stories de QA embutidas + Epic 7 dedicado.

---

## Epic 0 — Fundações (scaffold, schema, credenciais)

**Objetivo:** projeto de pé, banco criado, credenciais válidas nos dois provedores. Nada de UI ainda.

### S0.1 — Scaffold do monorepo (M)
Estrutura `server/` + `web/` + `config/`, TypeScript no front, Node ESM no back, ESLint + Prettier, scripts npm (`dev`, `sync`, `test`, `lint`, `typecheck`), `iniciar.bat` (padrão da casa), git init + `.gitignore` (`data/`, `.env`, tokens).
- **AC:** `npm run dev` sobe web + server juntos; lint/typecheck limpos; repo commitado.

### S0.2 — Schema SQLite + migrations (M)
Tabelas: `channels`, `google_accounts`, `oauth_tokens`, `revenue_daily` (channel, date, currency, gross/ad/estimated revenue, views, provisional flag), `sales` (transaction_id PK, product, src, channel_id nullable, status, commission_amount, currency, dates), `costs` (tipo recorrente/avulso, categoria, canal ou shared, allocation_rule, amount, currency, período), `fx_rates` (date, base, quote, rate), `sync_log`. Migration runner simples (arquivos numerados).
- **AC:** `npm run migrate` cria o banco do zero; rodar 2× é no-op; teste unit do runner.

### S0.3 — Google Cloud project + OAuth consent (S, manual c/ Kauê)
Criar projeto GCP, ativar **YouTube Data API v3** + **YouTube Analytics API**, criar OAuth Client (Desktop/loopback), **publicar consent screen em Production** (mitiga R1), escopos: `yt-analytics-monetary.readonly`, `yt-analytics.readonly`, `youtube.readonly`.
- **AC:** client id/secret no `.env`; doc `docs/setup-google.md` com passo a passo reproduzível.

### S0.4 — Credenciais Hotmart (S, manual c/ Kauê)
Criar credencial de desenvolvedor Hotmart (client_id/secret/basic), validar `POST /security/oauth/token` + 1 chamada a `/payments/api/v1/sales/history`. Registrar lembrete de rotacionar a credencial antiga hardcoded no n8n (R5).
- **AC:** token obtido e chamada de teste retorna vendas reais; credenciais só no `.env`.

### S0.5 — `config/channels.json` + validador (S)
Schema do arquivo (id, nome, youtube_channel_id, google_account, src_prefixes[], launch_date, moeda de referência) + script `npm run validate-config` que confere unicidade e formatos.
- **AC:** arquivo preenchido com TODOS os canais da rede; validador acusa erro claro em config quebrada; teste unit do validador.

---

## Epic 1 — Integração YouTube (multi-conta, receita, backfill lifetime)

**Objetivo:** receita AdSense diária real de todos os canais, do lançamento até D-2, atualizada diariamente.

### S1.1 — Fluxo OAuth loopback multi-conta (M)
`npm run auth -- --account <nome>`: abre browser, usuário loga na conta (ou seleciona Brand Account do canal — R2), callback loopback salva refresh token criptografado em `oauth_tokens` keyed pela identidade autorizada. Refresh automático de access tokens com retry.
- **AC:** autorizar 2 contas diferentes funciona; token sobrevive a restart; token revogado gera erro acionável no `sync_log` (não crash).

### S1.2 — Descoberta e vínculo de canais (S)
Para cada token, `channels.list(mine=true)` confirma o channel_id e casa com `config/channels.json`. Divergência (canal no config sem token que o alcance) = erro de setup listado.
- **AC:** comando `npm run channels-check` imprime tabela canal → conta → OK/FALTA AUTH; todos os canais da rede cobertos.

### S1.3 — Checklist de monetização por canal (S)
Query de sanidade na Analytics API pedindo `estimatedRevenue` de 1 dia; canal que retornar 403/sem dado monetário é marcado `monetized: false` (cai pra views-only com aviso na UI — R4).
- **AC:** flag persistida por canal; dashboard nunca mostra R$ 0,00 falso para canal sem acesso monetário — mostra "sem dados de receita".

### S1.4 — Sync de receita diária + backfill lifetime (L)
`reports.query` com `dimensions=day`, métricas `estimatedRevenue, estimatedAdRevenue, grossRevenue, views, estimatedMinutesWatched, cpm`, `ids=channel==<id>`, moeda USD nativa. Backfill em chunks de 90 dias desde `launch_date` com backoff exponencial (R7). Sync incremental diário re-busca **janela deslizante de 35 dias** (pega revisões do YouTube — R3) e marca `provisional=true` para os últimos 3 dias.
- **AC:** backfill completo de todos os canais roda até o fim (retomável se interrompido — cursor em `sync_log`); upsert idempotente provado por teste (rodar 2× = mesmas linhas); soma mensal bate com o YouTube Studio de 1 canal-amostra (verificação manual documentada).

### S1.5 — Testes da integração YouTube (M)
Client da API mockado (fixtures de respostas reais); unit: chunking do backfill, janela deslizante, upsert, tratamento de 401/403/429/500, canal não monetizado.
- **AC:** suíte roda sem rede; cobertura das branches de erro; CI local (`npm test`) verde.

---

## Epic 2 — Integração Hotmart (vendas, atribuição por canal, reembolsos)

**Objetivo:** toda venda Hotmart no banco, atribuída ao canal certo (ou ao bucket "não atribuído"), com comissão líquida e status vivo.

### S2.1 — Client Hotmart + auth client-credentials (S)
Módulo com refresh de token (expira ~48h), rate-limit friendly, paginação por `page_token`.
- **AC:** paginação completa de um período grande sem perder página; token renovado automático; testes com mock.

### S2.2 — Sync de vendas + backfill (M)
`GET /payments/api/v1/sales/history` filtrando por período; extrai `transaction`, produto, status, `purchase.price`, comissões (valor do papel do Kauê — producer/affiliate/co-producer conforme o produto), `tracking.source_sck`/`source` (src). Upsert por `transaction_id`. Backfill desde a primeira venda; incremental diário busca janela de 90 dias (status muda tarde).
- **AC:** total de vendas de 1 mês-amostra bate com o painel Hotmart; comissão gravada = líquida recebida, não preço cheio; idempotente (teste).

### S2.3 — Motor de atribuição src → canal (M)
Resolve `src`/`sck` contra `src_prefixes` do config (match por prefixo, case-insensitive). Sem match → `channel_id = null` (bucket "Não atribuído"). Re-atribuição retroativa: mudar config e rodar `npm run reattribute` recalcula tudo (vendas não são imutáveis na atribuição).
- **AC:** testes unit com matriz de casos (match exato, prefixo, sem src, src desconhecido, colisão de prefixo = erro de config); % de vendas não atribuídas visível no sync summary.

### S2.4 — Reembolsos, chargebacks e status (M)
Vendas com status `REFUNDED/CHARGEBACK/PARTIALLY_REFUNDED/PROTESTED` (mesma taxonomia dos fluxos n8n do MDA): engine lança o estorno como receita negativa **no mês do evento de estorno**, não apaga a venda original.
- **AC:** teste: venda em jan + reembolso em mar → jan mantém a venda, mar mostra o estorno; P&L dos dois meses correto.

### S2.5 — Mapeamento retroativo manual (S)
Ferramenta na UI (ou CLI na v1) para atribuir em lote vendas do bucket "não atribuído": por produto → canal, ou seleção manual. Grava `attribution_source: manual` para auditoria.
- **AC:** atribuição manual sobrevive a re-sync (upsert não sobrescreve atribuição manual); reversível.

### S2.6 — Guia de convenção de tracking (S, doc + ação do Kauê)
`docs/tracking-convention.md`: formato `src=yt_<canal>[_<videoId>]`, como montar os links de descrição, checklist para atualizar as descrições dos canais daqui pra frente.
- **AC:** doc escrito; config já contém os prefixos combinados; pelo menos 1 link real de cada canal validado contra o parser.

---

## Epic 3 — Módulo de Custos (manual + CSV + rateio)

**Objetivo:** todo custo da operação registrado, com moeda própria e regra clara de rateio para custos compartilhados.

### S3.1 — CRUD de custos (M)
API + modelo: custo **recorrente** (mensal, com vigência início/fim — ex.: ElevenLabs $99/mês) e **avulso** (data única — ex.: narração Fiverr €40). Campos: categoria, descrição, valor, moeda, canal OU `shared`, vigência.
- **AC:** CRUD completo via API com validação (moeda ISO, valores > 0, vigência coerente); testes de validação.

### S3.2 — Regras de rateio de custos compartilhados (M)
Custo `shared` carrega `allocation_rule`: `equal` (divide igual entre canais ativos no mês), `by_revenue` (proporcional à receita do mês), ou `custom` (percentuais fixos que somam 100%). Engine materializa o rateio por canal/mês na hora do cálculo (não persiste duplicado).
- **AC:** testes unit das 3 regras incluindo edge cases (canal sem receita no mês com `by_revenue`, canal criado no meio do mês, percentuais ≠ 100% = erro).

### S3.3 — Importação CSV (M)
Template CSV documentado (`docs/costs-template.csv`); import com prévia (dry-run mostra o que vai entrar, duplicatas detectadas por hash de linha), moedas mistas ok.
- **AC:** importar o mesmo arquivo 2× não duplica; linha inválida é reportada com número da linha e motivo, sem abortar as válidas; testes do parser (BOM, separador `;` vs `,`, decimal `,` brasileiro).

### S3.4 — UI de custos (M)
Página Costs: tabela por mês com filtro por canal/categoria, formulário de lançamento rápido, edição inline, botão de import CSV com tela de prévia.
- **AC:** lançar, editar e excluir custo reflete no P&L imediatamente; import com prévia funcional.

---

## Epic 4 — Câmbio e Motor de P&L (o coração)

**Objetivo:** números certos. Este epic é onde erro é mais caro — cobertura de teste máxima.

### S4.1 — Serviço de taxas de câmbio (S)
Sync diário da Frankfurter API (ECB, grátis): pares USD/BRL/EUR. Backfill histórico desde o primeiro dado do sistema. Fim de semana/feriado = última taxa disponível (regra documentada).
- **AC:** tabela `fx_rates` completa sem buracos no range do sistema; função `convert(amount, from, to, date)` com testes (mesma moeda, data sem taxa → última anterior, data futura = erro).

### S4.2 — Motor de P&L (L)
Função pura (input: canal(is) + período + moeda de exibição → output: linhas de P&L): receita YT + comissões Hotmart − estornos − custos diretos − custos rateados = lucro; margem %. Agregações: por canal/mês, por canal/período, rede/mês, rede/período. Conversão na taxa do dia de cada transação/lançamento.
- **AC:** **suíte de testes de ouro** — cenário sintético completo (2 canais, 3 meses, receita nas 2 fontes, reembolso, custo shared `by_revenue`, moedas mistas) com valores esperados calculados à mão em fixture; qualquer refactor futuro precisa manter esses números.

### S4.3 — API de consulta (S)
Endpoints: `/api/pnl?channels=&from=&to=&currency=&groupBy=month|channel`, `/api/channels`, `/api/sync/status`. Respostas tipadas (contrato compartilhado com o front via types).
- **AC:** contrato documentado; testes de integração dos endpoints contra banco seed.

### S4.4 — Testes de propriedade do motor (M)
Property-based (fast-check): soma dos canais = total da rede; mudar moeda de exibição não muda margem %; período particionado em sub-períodos soma igual ao todo; custo shared rateado soma exatamente o custo original.
- **AC:** 4 propriedades rodando com centenas de casos gerados; nenhuma violação.

---

## Epic 5 — Dashboard UI

**Objetivo:** ver tudo em segundos. Seguir a skill `dataviz` para todos os gráficos.

### S5.1 — Shell + navegação + stores (M)
Layout da família Synkra Hub: sidebar (Overview / Canais / Costs / Settings), Zustand stores (filtros globais: período, moeda), dark/light, roteamento.
- **AC:** navegação fluida; filtros globais persistem entre páginas (e em localStorage).

### S5.2 — Página Overview (rede) (L)
KPI row: receita total, custo total, lucro, margem % do período (com comparação vs período anterior). Gráfico de linha receita vs custo mensal da rede; tabela ranqueada de canais (receita YT, receita Hotmart, custos, lucro, margem) com sort; bucket "Não atribuído" visível com valor.
- **AC:** números batem com `/api/pnl` (teste e2e compara célula vs API); troca de moeda/período re-renderiza tudo consistente.

### S5.3 — Página de detalhe do canal (L)
P&L mensal do canal (tabela mês a mês), gráfico empilhado receita por fonte (AdSense vs Hotmart), linha de custos, breakdown de custos por categoria, indicador de dias provisórios, drill nas vendas Hotmart do canal (lista com src, produto, status).
- **AC:** todo canal do config abre sem erro (inclusive não monetizado = estado "views only"); reembolsos aparecem como negativos no mês do evento.

### S5.4 — Página Settings/Sync (M)
Status por integração (última execução, duração, erros — leitura do `sync_log`), botão **Sync now** por fonte e geral (com progresso via polling), status dos tokens OAuth por conta (dias desde refresh, botão re-autorizar), saúde do câmbio.
- **AC:** Sync now dispara e reporta resultado sem travar a UI; token expirado aparece em vermelho com instrução.

### S5.5 — Estados vazios, loading e erro (S)
Skeletons, mensagens de vazio úteis ("nenhum custo lançado neste mês — lançar agora"), erro de API com retry.
- **AC:** cortar o server com a UI aberta degrada com mensagem clara, não tela branca.

---

## Epic 6 — Automação e operação

**Objetivo:** funcionar sozinho todo dia, e avisar quando não funcionar.

### S6.1 — Sync headless + Task Scheduler (M)
`npm run sync-all` roda YT (janela 35d) + Hotmart (janela 90d) + FX sem UI; `npm run register-task` cria tarefa diária (padrão MDA Monitor, script PS1 com log). Lock file impede execuções sobrepostas.
- **AC:** tarefa registrada roda de verdade num boot real; log em `data/sync-log/`; execução dupla simultânea = segunda sai limpa com aviso.

### S6.2 — Alerta de falha de sync (S)
Sync com erro (ou 2 dias sem sync bem-sucedido) → toast Windows (reusar helper do MDA Monitor) + banner na UI.
- **AC:** simular token revogado gera alerta em ≤1 ciclo; recovery limpa o banner.

### S6.3 — Indicadores de frescor e proveniência (S)
Cada número no dashboard sabe de quando é: badge "dados até DD/MM" no header, dias provisórios de YT marcados, aviso quando Hotmart não sincroniza há >48h.
- **AC:** manipular `sync_log` em teste muda os badges corretamente.

### S6.4 — Backup do banco (S)
Cópia diária do `finance.db` (rotação de 14 dias) no fim do sync; `npm run restore` documentado.
- **AC:** backup gerado no sync; restore testado de verdade uma vez.

---

## Epic 7 — QA, hardening e bug QC (gate de qualidade)

**Objetivo:** confiança nos números e no app antes de considerar "pronto". Este epic é um **gate**: nada é "done" sem passar aqui.

### S7.1 — Suíte e2e Playwright (M)
Fluxos: abrir overview com banco seed → conferir KPIs; lançar custo → margem muda; importar CSV → prévia → confirmar; trocar moeda → valores convertem; sync now → status atualiza.
- **AC:** 5+ specs verdes headless; rodam com banco seed determinístico (sem rede).

### S7.2 — Auditoria de reconciliação (M, manual assistida)
Comparação formal de 1 mês fechado: YouTube Studio vs dashboard (por canal), painel Hotmart vs dashboard (contagem + valor de comissão), com relatório `docs/reconciliation-YYYY-MM.md` das divergências e causas.
- **AC:** divergência ≤1% ou explicada (lag, taxa de câmbio de data diferente); relatório escrito.

### S7.3 — Bug hunt adversarial (M)
Passada hostil (self-review + /code-review): edge cases — canal lançado ontem, mês sem nenhuma venda, custo com vigência aberta, venda `PARTIALLY_REFUNDED`, dois canais com mesmo prefixo src (deve ser erro de config), timezone (dia do YT é America/Los_Angeles! — verificar tratamento), DST, ano bissexto.
- **AC:** lista de bugs encontrados + todos corrigidos com teste de regressão; item timezone explicitamente resolvido e documentado.

### S7.4 — Hardening de erros e segurança local (S)
Tokens criptografados at-rest (DPAPI ou chave em `.env`), nenhum segredo em log, server recusa conexão não-localhost, inputs da API validados (zod), SQLite em WAL.
- **AC:** grep de segredos nos logs = zero; teste de request externa recusada.

### S7.5 — Gate final de release (S)
Checklist: lint + typecheck + unit + e2e verdes; reconciliação assinada; backfill completo; task agendada rodando 3 dias seguidos sem erro; docs completos.
- **AC:** checklist 100% em `docs/release-checklist.md` preenchido com evidências.

---

## Epic 8 — Otimização e polish (pós-release)

**Objetivo:** rápido, agradável, e preparado pro futuro.

### S8.1 — Performance de queries e render (M)
Índices SQLite nas queries do P&L (medir com `EXPLAIN QUERY PLAN`), cache do P&L por (período, moeda) invalidado por sync/custo, virtualização de tabelas longas no front.
- **AC:** overview carrega <500ms com banco lifetime completo; troca de período <200ms percebido.

### S8.2 — Sync incremental otimizado (S)
Reduzir chamadas: pular canais sem mudança esperada, ETag/If-Modified quando disponível, paralelizar canais com limite de concorrência.
- **AC:** sync diário completo <2min; log mostra chamadas economizadas.

### S8.3 — UX polish + insights (M)
Sparklines na tabela de canais, deltas mês-a-mês com setas, "custo por 1k views" e "RPM efetivo (AdSense+Hotmart)" como métricas derivadas, export CSV de qualquer tabela.
- **AC:** métricas derivadas com teste unit; export abre certo no Excel BR (`;` + BOM).

### S8.4 — Extensibilidade documentada (S)
`docs/adding-a-source.md`: como plugar fonte nova de receita (ex.: Meta Ads spend como custo automático — hook deixado pronto) ou custo automático, seguindo o padrão pluggable do MDA Monitor.
- **AC:** doc permite adicionar fonte fake de exemplo em <1h seguindo só o doc.

### S8.5 — Registro no Synkra Hub + memória (S)
Bloco `hub:` no arquivo de memória do projeto (`memory/projects/finance_dashboard.md`) para aparecer no Synkra Hub; README final.
- **AC:** projeto visível no Hub com tasks dos epics; memória criada.

---

## 6. Sequência e dependências

```
Epic 0 ──► Epic 1 (YouTube) ──┐
      └──► Epic 2 (Hotmart) ──┼──► Epic 4 (FX + P&L) ──► Epic 5 (UI) ──► Epic 6 (Automação)
      └──► Epic 3 (Custos) ───┘                                              │
                                                        Epic 7 (QA gate) ◄───┘
                                                        Epic 8 (Otimização) — pós-gate
```

- Epics 1, 2 e 3 são **paralelizáveis** após o Epic 0.
- Epic 4 é o caminho crítico de correção — não começar UI de números antes do S4.2 com a suíte de ouro verde.
- Epic 7 roda como gate contínuo (testes por story) + passada final dedicada.

**Ordem de valor entregue cedo:** ao fim do Epic 1 já dá pra responder "quanto cada canal gera de AdSense" via CLI/API mesmo sem UI — primeiro marco visível.

## 7. Contagem

**9 epics · 38 stories** (0:5 · 1:5 · 2:6 · 3:4 · 4:4 · 5:5 · 6:4 · 7:5 · 8:5) — cobrindo estruturação → integração → motor financeiro → UI → automação → QA/bug QC → otimização.
