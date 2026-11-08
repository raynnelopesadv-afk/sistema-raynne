# Integração com o Data Crazy — roteiro (SKU e lançamento automático)

> Objetivo: quando um negócio é **ganho** no Data Crazy (DC), o fechamento é
> lançado **automaticamente** aqui no BI, sem o closer digitar duas vezes.

## Como os modelos se conectam

- **DC**: produtos "planos", cada um com **SKU** obrigatório. Variante no DC é um
  produto separado (com SKU próprio).
- **Aqui**: produto + variantes. Cada variante tem **valor** e **SKU** próprios;
  produto sem variante tem SKU no próprio produto.
- **Ponte**: o **SKU** é a chave. SKU do DC → (produto, variante) aqui. Como no DC
  cada variante já é um produto com SKU, o casamento é **1:1** e **não precisa de
  tabela de de-para separada** — o SKU mora na própria variante/produto.
- **Closer**: casar o **atendente do DC pelo e-mail** com o e-mail do closer aqui.

## Decisões já tomadas

- Não existem negócios com mais de um produto na operação → **1 negócio = 1 produto = 1 fechamento**.
- Atendente do DC → closer **por e-mail**.
- SKU sem vínculo → o negócio vai para uma **fila de "pendente de vínculo"** (nada se perde);
  cenários: produto/SKU novo no DC ainda não cadastrado aqui, SKU alterado no DC,
  erro de digitação, ou negócios antigos na 1ª sincronização.

## O que já está pronto (feito)

- Coluna `products.sku` e `products.variantes_config` (`[{nome, valor, sku}]`).
- Tela de Produtos: SKU do produto + editor de variantes com nome/valor/SKU.
- Lançamento de venda: ao escolher a variante, o **valor é preenchido** pelo valor da variante.

## O que falta para ligar o gatilho automático

1. **Cadastrar os SKUs**: garantir que todo produto/variante aqui tenha o **mesmo SKU do DC**.
2. **E-mail dos closers**: garantir que cada closer tenha o e-mail igual ao do atendente no DC.
3. **Coluna anti-duplicidade**: adicionar `clientes_fechados.dc_business_id` (único) para
   não lançar o mesmo negócio duas vezes (upsert por esse id).
4. **Fila de pendências**: tabela `datacrazy_sync_pendentes` (negócio ganho cujo SKU ou
   atendente não casou) para resolução manual.
5. **Gatilho + sincronização** (edge function, reaproveitando o padrão do funil):
   - Fonte: **webhook** do DC no evento "ganho", **ou** varredura periódica dos negócios
     com `filter[status]=won` e `filter[lastMovedAfter]=<última sync>` (a API já tem esses filtros).
   - Para cada negócio ganho novo: ler o **SKU** do produto do negócio → achar (produto, variante);
     ler o **e-mail do atendente** → achar o closer; criar `clientes_fechados` com
     `valor`, `data_fechamento` = data do ganho, `dc_business_id` = id do negócio.
   - SKU/atendente não encontrado → grava na **fila de pendências** em vez de falhar.
   - Respeitar o **limite de 60 req/min por rota** do DC (mesmo tratamento do funil).

## Referências técnicas (DC)

- Base da API: `https://api.g1.datacrazy.io/api/v1` · Auth: Bearer (secret `DATACRAZY_TOKEN`, já configurado).
- Negócios: `GET /businesses` (filtros `status`=`won|lost|in_process`, `lastMovedAfter`, `createdAtGreaterOrEqual`…). `BusinessDto`: `id, createdAt, stageId, attendantId, total, status, lastMovedAt, products[]`.
- Produtos do negócio: `BusinessProductDto.product` (tem `id_sku`).
- Atendentes: `GET /api/v1/atendentes-crm` (para casar e-mail → closer).
- Rate limit: 60 req/min por rota (429 com header `Retry-After`).
