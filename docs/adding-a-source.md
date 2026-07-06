# Adicionar uma fonte nova (S8.4)

O pipeline segue o padrão pluggable do MDA Monitor: cada fonte é um módulo em
`server/src/sync/` que faz **upsert idempotente** por chave natural e escreve no
`sync_log`. O motor de P&L não precisa saber da fonte — ele só lê as tabelas.

## Fonte de RECEITA nova (ex.: outra plataforma de vendas)
1. Crie `server/src/sync/<fonte>.js` com:
   - um mapper puro `map<Fonte>Item(raw) → linha` (testável);
   - `upsert<Fonte>(db, rows)` idempotente (`ON CONFLICT` por id natural);
   - `sync<Fonte>(db, {mode, transport})` que pagina, mapeia, faz upsert e loga.
2. Se a receita for por canal, reaproveite o resolver de atribuição
   (`buildAttributionResolver`) ou grave `channel_id` direto.
3. Some a nova receita no motor: em `engine/pnl.js`, adicione o campo ao cell
   (ex.: `revenue_<fonte>`) e inclua no `revenue_total`. Atualize a suíte de ouro.
4. Plugue no `runSyncAll` (`server/src/sync/syncAll.js`).

## Fonte de CUSTO automática (ex.: Meta Ads spend como custo)
O hook já está pronto: **Meta Ads não tem API aqui por ora** (decisão do plano),
mas o gasto pode entrar como custo automático:
1. Crie `server/src/sync/metaAdsCost.js` que busca o spend por dia/campanha.
2. Mapeie campanha → canal (por naming ou tabela de config).
3. Faça `createCost`/upsert com `source: 'meta_ads'` e `kind: 'one_off'` por dia
   (ou agregado mensal `recurring`). O motor rateia/soma como qualquer custo.
4. Adicione ao `runSyncAll`.

## Regras invioláveis
- **Idempotência**: rodar 2× nunca duplica (teste isso).
- **Nada de segredo em log** (S7.4).
- **Registrar no `sync_log`** para aparecer em `/settings`.
- **Cobrir com teste** usando um `transport` fake (sem rede).
