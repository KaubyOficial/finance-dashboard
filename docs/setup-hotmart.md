# Setup — Hotmart API (S0.4)

## 1. Criar credencial de desenvolvedor
1. Painel Hotmart → **Ferramentas → Credenciais Hotmart** (ou *Developers* / API).
2. Crie uma credencial e copie **Client ID**, **Client Secret** e o **Basic** (base64 de `client_id:client_secret`).
3. No `.env`:
   ```
   HOTMART_CLIENT_ID=...
   HOTMART_CLIENT_SECRET=...
   HOTMART_BASIC=...            # opcional: o app calcula se ficar vazio
   HOTMART_ENV=production
   HOTMART_ROLE=PRODUCER        # seu papel de comissão (PRODUCER | AFFILIATE | CO_PRODUCER)
   ```

> ⚠️ **R5** — NÃO reutilizar a credencial antiga hardcoded nos fluxos n8n do MDA. Use credenciais NOVAS aqui e, idealmente, **rotacione a antiga**.

## 2. Validar
Após preencher o `.env`:
```
npm run sync-all -- --only hotmart
```
Deve puxar as vendas reais. Confira em **Sync & Config** (`/settings`) o status e a contagem.

## Como a comissão é contabilizada
- Gravamos a **comissão líquida** do seu papel (`HOTMART_ROLE`), não o preço cheio. Entradas `MARKETPLACE` (taxa da Hotmart) são ignoradas.
- **Reembolsos / chargebacks** (`REFUNDED`, `CHARGEBACK`, `PARTIALLY_REFUNDED`, `PROTESTED`): a venda original é mantida; o estorno entra como **receita negativa no mês do evento de estorno** (S2.4).
- Vendas sem `src` reconhecido caem no bucket **"Não atribuído"** (sempre visível). Atribua em lote depois se quiser.
