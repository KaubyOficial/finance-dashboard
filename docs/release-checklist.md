# Gate de release (S7.5)

Nada é "done" sem 100% disto — com evidência.

## Qualidade de código
- [ ] `npm run lint` verde
- [ ] `npm run typecheck` verde
- [ ] `npm test` (unit server + web) verde — inclui suíte de OURO do P&L e property tests
- [ ] `npm run e2e` (Playwright) verde com banco seed

## Dados
- [ ] Backfill lifetime completo de todos os canais (`npm run sync-all -- --backfill`)
- [ ] `npm run channels-check` → todos OK (ou pendências conhecidas documentadas)
- [ ] Reconciliação de 1 mês fechado assinada (`docs/reconciliation-YYYY-MM.md`), Δ ≤ 1%

## Operação
- [ ] Tarefa agendada registrada (`npm run register-task`) e rodou 3 dias seguidos sem erro
- [ ] Backup diário gerando arquivos em `server/data/backups/` (rotação 14 dias)
- [ ] `npm run restore -- --latest` testado uma vez

## Segurança (S7.4)
- [ ] Tokens criptografados at-rest (AES-256-GCM / keyfile 0600 ou `FINANCE_ENCRYPTION_KEY`)
- [ ] Grep de segredos nos logs = zero
- [ ] Servidor recusa host não-localhost (teste `api.test.js`)
- [ ] SQLite em WAL

## Docs
- [ ] `docs/setup-google.md`, `docs/setup-hotmart.md`, `docs/tracking-convention.md`, `docs/adding-a-source.md` revisados
- [ ] README atualizado

_Data de assinatura:_ ______  _Por:_ ______
