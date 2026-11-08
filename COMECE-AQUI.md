# Comece aqui — BI Suite

Sistema completo de **BI e CRM comercial**, pronto para instalar e usar. Inicia
**vazio** (sem dados de ninguém) e sem credenciais: você conecta o seu banco,
cadastra seus produtos e seu time.

> Ordem de leitura: **este arquivo** → `INSTALL_CHECKLIST.md` (passo a passo
> marcável) → `README.md` (detalhes técnicos).
>
> **Vai instalar com a ajuda de um assistente de IA (Claude)?** Leia
> `INSTRUCOES-PARA-O-CLAUDE.md`: tem um prompt pronto para colar, que deixa o
> assistente editando, testando e publicando o sistema de forma autônoma.

---

## O que o sistema faz

| Área | Para que serve |
|---|---|
| **Painel** | Receita, fechamentos (mês/semana/dia), taxa de protocolo, projeção de êxito, mapa de calor dia a dia (com ciclo de venda), mapa do Brasil por estado e gráfico de *pace* (realizado × projeção). Filtros de squad, closer e produto. |
| **Fechamento** | Lançar e acompanhar vendas: cliente, CPF (validado), telefone com UF pelo DDD, produto/variante, valor, origem do lead, status e tempo de ciclo. Pendências destacadas em vermelho. |
| **Processos / Protocolos** | Andamento dos contratos, linha do tempo, parcelas do contrato, campos personalizados por produto, ranking por protocolados e taxa de protocolo. |
| **Aproveitamento** | Taxa de protocolo, perdas e motivos de desqualificação. |
| **Funil de Vendas** | Cone integrado a um CRM externo (Data Crazy): ganho/perdido configurável por pipe, conversão, evolução no período e mapa de calor. |
| **Comissões** | Motor configurável: produto × nível × etapa, variantes, piso de meta proporcional, fim de semana 1,5×, operação mista, bônus de combo e **estorno** por desqualificação. |
| **Produtos** | Catálogo com variantes (valor e SKU próprios), regras de comissão, projeção de êxito e **campos personalizados** por produto. |
| **Config** | Metas, squads, usuários e papéis, colaboradores e fila de solicitações (aprovações do gestor). |

Também inclui: celebração de vendas em modo TV, controle de **parcelas** por
contrato (ao quitar a última, libera o recebimento e a comissão), proteção
anti-fraude (datas de meses comissionados travadas), fila de aprovação para
alterações e exclusões, e **histórico de alterações** (quem mudou o quê e quando).

---

## Instalação em 6 passos

1. **Dependências**
   ```bash
   npm install
   ```

2. **Crie um projeto na Supabase** (plano free serve): https://supabase.com

3. **Configure o `.env`**
   ```bash
   cp .env.example .env
   ```
   Preencha com os dados do seu projeto (Supabase → Project Settings → API):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

4. **Crie o banco** — a pasta `supabase/migrations` tem todo o schema, em ordem:
   ```bash
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push
   ```
   *Sem a CLI?* Cole o conteúdo dos arquivos `.sql` no SQL Editor, **na ordem do nome**.

5. **Rode local**
   ```bash
   npm run dev
   ```
   Crie sua conta na tela de login e depois dê a si mesmo o papel de gestor
   (SQL Editor da Supabase):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'gestor' from auth.users where email = 'seu@email.com';
   ```

6. **Publique** (opcional) — Vercel: importe o repositório, cadastre as mesmas
   variáveis do `.env` em Environment Variables e faça o deploy.

---

## Primeiros cadastros (nesta ordem)

1. **Config → Squads**: crie ao menos um squad.
2. **Config → Usuários**: convide o time e defina papéis (gestor, closer, SDR,
   full cycle, operador técnico). Quem vende precisa de papel de vendas + squad.
3. **Produtos**: produtos, variantes (valor e SKU), grade de comissionamento por
   nível/etapa e, se quiser, os campos personalizados.
4. **Config → Metas** e **Comissões**: metas por produto/nível e regras gerais
   (piso, proporcional, multiplicador de fim de semana).
5. Comece a lançar em **Fechamento**.

---

## Integrações opcionais

Todas opcionais — o sistema funciona 100% sem elas.

**CRM Data Crazy** (espelhamento automático): quando um negócio é ganho no CRM,
o fechamento é criado aqui sozinho, casando **produto pelo SKU** e **vendedor
pelo e-mail**. Passo a passo em `docs/integracao-datacrazy.md`. Resumo: publique
as edge functions `datacrazy-funil` e `datacrazy-webhook`, crie os secrets
`DATACRAZY_TOKEN` e `DATACRAZY_WEBHOOK_SECRET`, e configure uma automação no CRM
apontando para a URL do webhook.

**Meta Ads** e **Liderhub**: funções `sync-meta` e `sync-liderhub`.

> Para adaptar a **outro CRM**, use `supabase/functions/datacrazy-webhook` como
> modelo: ele recebe o id do negócio, busca os dados na API do CRM, casa produto
> e vendedor, e grava o fechamento sem duplicar.

---

## Estrutura do projeto

```
src/pages/          telas (Dashboard, Fechamento, Processos, Comissões...)
src/components/     componentes reutilizáveis e UI (shadcn)
src/lib/            regras de negócio (comissaoRegras.ts, dashboard-queries.ts, duracao.ts...)
supabase/migrations schema do banco, em ordem cronológica
supabase/functions  edge functions (integrações)
docs/               documentação das integrações
```

O coração das regras de comissão está em `src/lib/comissaoRegras.ts`, com testes
em `src/test/`. Rode `npm test` depois de qualquer alteração nelas.

---

## Personalização

- **Marca**: `src/config/brand.ts` (nome do app e da empresa).
- **Cores/tema**: `src/index.css` e `tailwind.config.ts`.
- **Divisões**: o sistema separa dados em duas divisões (por padrão "advogados"
  e "educação") — renomeie conforme a sua operação.

---

## Comandos úteis

```bash
npm run dev       # desenvolvimento
npm run build     # build de produção
npm test          # testes das regras de negócio
npx tsc --noEmit  # checagem de tipos
```

---

## Licença e uso

Template funcional para você adaptar à sua operação. Nenhum dado, credencial ou
identidade de terceiros acompanha os arquivos — confira o `.env.example`.
