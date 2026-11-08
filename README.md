# BI Suite

Painel de BI/CRM para operacoes de vendas: dashboards de faturamento, funil
comercial, agendamentos, fechamentos, protocolos, qualificacao de leads,
comissoes e uma aba de Meta Ads com CPL e CAC por criativo (via integracoes
com Meta Ads e Liderhub).

Este repositorio e um TEMPLATE limpo: nao contem nenhum dado, credencial ou
identidade de nenhuma empresa. Voce clona, conecta as suas integracoes, insere
os seus dados e usa. O sistema inicia completamente vazio.

Stack: Vite + React 18 + TypeScript + Tailwind + shadcn/ui + React Router +
TanStack Query + Recharts no frontend; Supabase (Postgres + Auth + RLS + Edge
Functions em Deno) no backend.

---

## Requisitos

- **Node.js** 18 ou superior (recomendado 20 LTS).
- **npm** 9+ (vem com o Node). O projeto tambem funciona com pnpm/bun, mas os
  exemplos usam npm.
- **Conta na Supabase** (plano free serve): https://supabase.com
- **Supabase CLI** (para migrations e deploy das edge functions):
  https://supabase.com/docs/guides/cli
- **Git**.
- Opcional para publicar: conta na **Vercel** (ou Netlify).
- Opcional para as integracoes: **Meta Ads** (token de API) e **Liderhub**
  (company key).

Confira as versoes:

```bash
node -v   # deve mostrar v18+ (ideal v20+)
npm -v    # 9+
git --version
supabase --version
```

---

## Instalacao (passo a passo)

```bash
# 1. Clone o repositorio
git clone <URL_DO_SEU_FORK> bi-suite
cd bi-suite

# 2. Instale as dependencias
npm install

# 3. Crie o arquivo de ambiente a partir do exemplo
cp .env.example .env
#   (no Windows PowerShell: Copy-Item .env.example .env)

# 4. Preencha o .env com as chaves do SEU projeto Supabase (ver secao abaixo)

# 5. Prepare o banco (migrations) — ver "Como alterar banco"
supabase link --project-ref SEU_PROJECT_REF
supabase db push

# 6. Rode em desenvolvimento
npm run dev
```

Ou use o script de setup, que automatiza os passos locais:

```bash
node scripts/setup.mjs
```

---

## Como instalar dependencias

```bash
npm install
```

Isso le o `package.json` e instala tudo em `node_modules`. Para uma instalacao
limpa e reproduzivel (CI, por exemplo), use `npm ci`.

---

## Como criar o .env

1. Copie o modelo: `cp .env.example .env`
2. Crie um projeto na Supabase (https://supabase.com/dashboard).
3. Em **Project Settings > API**, copie:
   - **Project URL** para `VITE_SUPABASE_URL`
   - **anon public** key para `VITE_SUPABASE_ANON_KEY` e
     `VITE_SUPABASE_PUBLISHABLE_KEY`
   - o **Reference ID** do projeto para `VITE_SUPABASE_PROJECT_ID`

As variaveis `VITE_*` sao chaves publicas (seguras no frontend). As chaves
sensiveis (service role, tokens de API) NUNCA entram no `.env` do frontend:
elas vao como secrets das edge functions (ver secao seguinte).

---

## Como configurar APIs

As integracoes sao opcionais. O BI funciona sem elas (a aba Meta Ads so fica
vazia). Para ativar, configure os secrets das edge functions na Supabase:

```bash
# Liderhub (WhatsApp/atendimento)
supabase secrets set LIDERHUB_COMPANY_KEY=xxx --project-ref SEU_PROJECT_REF

# Meta Ads
supabase secrets set META_ACCESS_TOKEN=xxx --project-ref SEU_PROJECT_REF
supabase secrets set META_AD_ACCOUNT_ID=act_123 --project-ref SEU_PROJECT_REF

# Seguranca dos jobs agendados e do webhook de atribuicao
supabase secrets set CRON_SECRET=$(openssl rand -hex 24) --project-ref SEU_PROJECT_REF
supabase secrets set ATTRIBUTION_WEBHOOK_SECRET=$(openssl rand -hex 24) --project-ref SEU_PROJECT_REF

# Depois, publique as functions
supabase functions deploy sync-liderhub --project-ref SEU_PROJECT_REF
supabase functions deploy sync-meta --project-ref SEU_PROJECT_REF
supabase functions deploy invite-user --project-ref SEU_PROJECT_REF
supabase functions deploy ingest-attribution --no-verify-jwt --project-ref SEU_PROJECT_REF
```

Onde conseguir cada credencial:
- **Meta**: crie um app em developers.facebook.com, gere um token de system user
  com `ads_read` e `read_insights`, e pegue o ID da conta de anuncios
  (`act_...`).
- **Liderhub**: painel do Liderhub > integracoes/API > company key.
- A lista completa de variaveis esta em `.env.example`.
- O passo a passo do webhook de atribuicao para a agencia de trafego esta em
  `docs/atribuicao-leads-agencia.md`.

---

## Como iniciar o projeto

```bash
npm run dev
```

Sobe em http://localhost:8080. O primeiro usuario que se cadastrar vira
**gestor** (admin) automaticamente; os demais entram como usuario comum.

---

## Como fazer build

```bash
npm run build      # gera a pasta dist/ (producao)
npm run preview    # serve o build localmente para conferir
```

---

## Como publicar

**Vercel (recomendado):**
1. Importe o repositorio na Vercel.
2. Framework: Vite. Build command: `npm run build`. Output: `dist`.
3. Em Settings > Environment Variables, adicione as mesmas `VITE_*` do seu
   `.env`.
4. Deploy. O arquivo `vercel.json` ja configura o rewrite de SPA.

**Netlify:** build `npm run build`, publish `dist`, e adicione um redirect
`/* /index.html 200` (SPA). Configure as `VITE_*` no painel.

As edge functions e o banco ficam na Supabase (publicados via `supabase db push`
e `supabase functions deploy`), independentemente de onde o frontend e hospedado.

---

## Como atualizar

```bash
git pull                 # traz as mudancas do codigo
npm install              # atualiza dependencias se o package.json mudou
supabase db push         # aplica migrations novas ao banco
npm run build            # rebuild (ou deixe o deploy automatico da Vercel fazer)
```

Para atualizar uma edge function: `supabase functions deploy <nome>`.

---

## Estrutura das pastas

```
.
├── public/                 Arquivos estaticos servidos como estao (favicon, robots).
├── src/
│   ├── assets/             Imagens usadas no app (mascotes de squad, etc.).
│   ├── components/
│   │   ├── bi/             Componentes de BI reutilizaveis (KPICard, funil, sparkline).
│   │   ├── layout/         Casca do app: sidebar, topo, navegacao inferior.
│   │   └── ui/             Biblioteca shadcn/ui (botao, dialog, select, tabela...).
│   ├── config/
│   │   └── brand.ts        Identidade da marca (nome, empresa, rotulos). EDITE AQUI.
│   ├── contexts/           Contextos React (ex.: AuthContext).
│   ├── hooks/              Hooks reutilizaveis (useUserRole, useTvMode...).
│   ├── integrations/
│   │   └── supabase/       Cliente Supabase e tipos do banco (types.ts).
│   ├── lib/                Regras de negocio e queries (dashboard, comissao, status...).
│   ├── pages/              Uma tela por arquivo (Dashboard, MetaAds, Fechamento...).
│   ├── test/               Setup de testes (vitest).
│   ├── App.tsx             Rotas e providers globais.
│   └── main.tsx            Ponto de entrada.
├── supabase/
│   ├── config.toml         Config do projeto Supabase (ref + verify_jwt das functions).
│   ├── migrations/         Schema do banco em SQL, versionado. Rodam em ordem.
│   └── functions/          Edge functions (Deno): sync-meta, sync-liderhub,
│                           ingest-attribution, invite-user.
├── docs/                   Documentacao auxiliar (instrucoes da agencia, etc.).
├── scripts/                Scripts utilitarios (setup.mjs).
├── .env.example            Modelo das variaveis de ambiente.
├── index.html              HTML base (titulo/meta tags).
├── vercel.json             Config de deploy (SPA rewrite).
└── vite.config.ts          Config do bundler.
```

---

## Fluxo do sistema (arquitetura)

1. **Frontend (Vite/React)** roda no navegador e fala direto com a Supabase
   usando a chave anon. Toda leitura/escrita passa por **RLS** (Row Level
   Security): as policies no banco decidem o que cada papel (gestor, usuario,
   operador_tecnico, agencia) pode ver e fazer. Nao existe backend proprio de
   API; a Supabase e o backend.

2. **Autenticacao** e via Supabase Auth (email + senha). Ao criar um usuario, um
   trigger (`handle_new_user`) cria o `profile` e atribui o papel. O primeiro
   usuario vira `gestor`.

3. **Dados** ficam em tabelas Postgres (clientes_fechados, agendamentos,
   closers, squads, products, faturamento_mensal, processos, config, etc.). Os
   dashboards leem essas tabelas via TanStack Query e renderizam com Recharts.

4. **Integracoes** rodam em **edge functions** (Deno) na Supabase:
   - `sync-meta`: puxa campanhas, conjuntos, anuncios e metricas diarias da Meta
     Ads para as tabelas `meta_*`.
   - `sync-liderhub`: puxa leads e rotulos do Liderhub para `lh_leads`/`lh_labels`.
   - `ingest-attribution`: webhook que recebe leads de formulario (telefone +
     anuncio) e alimenta a central de atribuicao por telefone.
   - `invite-user`: cria/convida usuarios.
   Um agendador (pg_cron) dispara os syncs periodicamente, autenticando com
   `CRON_SECRET`.

5. **Atribuicao por anuncio**: a tabela `lead_attribution` liga telefone ->
   anuncio (via CTWA do Liderhub e via webhook de formulario). Triggers carimbam
   `meta_ad_id` nos contratos, e a aba Meta Ads calcula CPL e CAC por criativo.

---

## Como adicionar novos dashboards

1. Crie a pagina em `src/pages/MinhaAba.tsx` (copie uma existente, ex.:
   `Protocolos.tsx`, como base).
2. Registre a rota em `src/App.tsx` (`<Route path="/minha-aba" .../>`).
3. Adicione o item de menu em `src/components/layout/AppSidebar.tsx` (e, se
   quiser no mobile, em `BottomNav.tsx`).
4. Busque os dados com `useQuery` da TanStack Query, lendo do `supabase` client.
5. Reaproveite os componentes de `src/components/bi/` (KPICard, funil, etc.).

---

## Como adicionar novas metricas

- **Metrica derivada de dados que ja existem**: calcule dentro de um `useMemo`
  na pagina e exiba num `KPICard`. Veja exemplos em `Dashboard.tsx` e
  `MetaAds.tsx`.
- **Metrica que precisa de campo novo no banco**: crie uma migration nova
  (ver "Como alterar banco"), adicione a coluna, regenere/edite os tipos em
  `src/integrations/supabase/types.ts`, e use o campo na query.

---

## Como conectar novas APIs

1. Crie uma edge function: `supabase functions new minha-integracao`.
2. Leia os segredos com `Deno.env.get('MINHA_CHAVE')` e configure com
   `supabase secrets set MINHA_CHAVE=...`.
3. Escreva os dados em tabelas suas (crie via migration).
4. Publique: `supabase functions deploy minha-integracao`.
5. Dispare pelo frontend (`supabase.functions.invoke('minha-integracao')`) ou
   por cron (pg_cron + pg_net), como fazem os syncs existentes.

---

## Como personalizar

- **Textos e rotulos de marca**: `src/config/brand.ts`.
- **Cores e tema**: `tailwind.config.ts` e as variaveis CSS em `src/index.css`.
- **Componentes visuais**: `src/components/ui/` (shadcn) e `src/components/bi/`.
- **Metas padrao, produtos, squads**: cadastrados pela propria interface (aba
  Config e afins) depois que o sistema estiver rodando.

---

## Como trocar identidade visual

1. Abra `src/config/brand.ts` e ajuste `appName`, `companyName`,
   `loginSubtitle` e `divisionLabels`.
2. Troque o favicon em `public/favicon.ico`.
3. Ajuste titulo e meta tags em `index.html`.
4. Cores da marca: edite as variaveis CSS (ex.: `--primary`) em `src/index.css`
   e/ou `tailwind.config.ts`.
5. Imagens (ex.: mascotes de squad) ficam em `src/assets/`.

---

## Como alterar banco

O schema e versionado em `supabase/migrations/` (SQL puro, aplicado em ordem).

```bash
# Vincular seu projeto (uma vez)
supabase link --project-ref SEU_PROJECT_REF

# Aplicar todas as migrations ao banco
supabase db push

# Criar uma migration nova
supabase migration new minha_mudanca
#   edite o arquivo .sql gerado em supabase/migrations/ e rode db push de novo
```

Trocar de banco = criar outro projeto Supabase, rodar `supabase db push` nele e
apontar as `VITE_*` do `.env` para o novo projeto. Nenhum dado e copiado: o novo
banco nasce vazio, so com a estrutura.

---

## Solucao de problemas

**Tela branca / erro "supabaseUrl is required"**
O `.env` nao foi carregado. Confirme que existe um `.env` (nao so `.env.example`)
com as `VITE_*` preenchidas e reinicie `npm run dev`.

**Login funciona mas nao aparece nada / "permission denied"**
E RLS. Confirme que as migrations foram aplicadas (`supabase db push`) e que seu
usuario tem papel. O primeiro usuario cadastrado vira gestor; se voce se
cadastrou depois de outro, peca a um gestor para ajustar seu papel.

**"Sem dados ainda" em todas as telas**
Normal num sistema novo e vazio. Cadastre produtos, squads, closers e
fechamentos pela interface para os paineis se preencherem.

**Aba Meta Ads vazia**
As integracoes nao foram configuradas ou sincronizadas. Configure os secrets,
publique `sync-meta`/`sync-liderhub` e rode uma sincronizacao (botoes no topo da
aba, visiveis para gestor).

**Edge function retorna 401/500**
Verifique se os secrets estao setados (`supabase secrets list`) e se a function
foi publicada apos setar. O `ingest-attribution` deve ser publicado com
`--no-verify-jwt` (e um webhook publico, protegido pelo proprio segredo).

**Erro de tipo no build apos mexer no banco**
Os tipos em `src/integrations/supabase/types.ts` ficaram desatualizados. Regenere
com `supabase gen types typescript --project-ref SEU_PROJECT_REF > src/integrations/supabase/types.ts`
ou ajuste manualmente.

**Porta 8080 ocupada**
Mude a porta em `vite.config.ts` (`server.port`).

---

## Checklist de instalacao

Veja `INSTALL_CHECKLIST.md` para confirmar que voce fez todos os passos.
