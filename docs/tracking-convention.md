# Convenção de tracking Hotmart → canal (S2.6)

Para atribuir cada venda ao canal certo, os links de checkout/LP nas **descrições
dos vídeos** carregam um código `src` padronizado.

## Formato
```
src=yt_<slug-do-canal>[_<videoId>]
```
- `yt_` prefixo fixo (origem YouTube).
- `<slug-do-canal>` = o mesmo dos `src_prefixes` em `config/channels.json`.
- `_<videoId>` **opcional**, para granularidade por vídeo (a atribuição usa o
  prefixo mais longo que casar, então `yt_redef_de_abc123` ainda cai em `redef_de`).

### Exemplos
| Canal | src no link |
|---|---|
| REDE F Alemão | `yt_redef_de` |
| Cortes DE | `yt_cortes_de` |
| REDE F Alemão, vídeo X | `yt_redef_de_kJ2p9` |

## Como montar o link
Hotmart aceita `src` na URL de checkout:
```
https://pay.hotmart.com/XXXXXXX?src=yt_redef_de
```
Para LPs próprias que repassam à Hotmart, propague `?src=` e, se usar `sck`,
o mesmo valor também é lido como fallback.

## Checklist para novas descrições
- [ ] Todo link de venda na descrição tem `?src=yt_<canal>`.
- [ ] O `<canal>` existe em `config/channels.json` (`src_prefixes`).
- [ ] Rodou `npm run validate-config` (sem colisão de prefixo).
- [ ] Após publicar vendas, conferir `%` de "Não atribuído" em `/settings`/overview.

## Vendas antigas sem src (R6)
Ficam no bucket "Não atribuído". Atribua em lote pela UI/So CLI:
- por produto → canal, ou seleção manual;
- a atribuição manual **sobrevive a re-sync** (não é sobrescrita).
