# Checklist de instalacao — BI Suite

Marque cada item conforme for concluindo. Detalhes de cada passo estao no
`README.md`.

## 1. Pre-requisitos
- [ ] Node.js 18+ instalado (`node -v`)
- [ ] npm 9+ (`npm -v`)
- [ ] Git instalado
- [ ] Supabase CLI instalado (`supabase --version`)
- [ ] Conta criada na Supabase

## 2. Projeto local
- [ ] Repositorio clonado
- [ ] `npm install` rodou sem erros
- [ ] `.env` criado a partir do `.env.example` (`cp .env.example .env`)

## 3. Banco de dados (Supabase)
- [ ] Projeto criado no dashboard da Supabase
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
      `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` preenchidos no `.env`
- [ ] `supabase link --project-ref SEU_PROJECT_REF` executado
- [ ] `supabase db push` aplicou as migrations (schema criado, banco vazio)

## 4. Primeiro acesso
- [ ] `npm run dev` sobe em http://localhost:8080
- [ ] Consegui me cadastrar (o primeiro usuario vira gestor)
- [ ] Login funciona e as telas abrem (vazias, por enquanto)

## 5. Integracoes (opcional — pule se nao for usar Meta/Liderhub agora)
- [ ] Secrets setados na Supabase (`supabase secrets set ...`):
      `LIDERHUB_COMPANY_KEY`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`,
      `CRON_SECRET`, `ATTRIBUTION_WEBHOOK_SECRET`
- [ ] Edge functions publicadas (`supabase functions deploy ...`)
- [ ] `ingest-attribution` publicada com `--no-verify-jwt`
- [ ] Sincronizacao Meta/Liderhub rodada (botoes no topo da aba Meta Ads)

## 6. Dados iniciais
- [ ] Produtos cadastrados (aba Produtos)
- [ ] Squads e closers cadastrados
- [ ] Metas configuradas (aba Config)

## 7. Publicacao (opcional)
- [ ] Repositorio importado na Vercel
- [ ] Variaveis `VITE_*` configuradas no painel da Vercel
- [ ] Deploy concluido e app abrindo na URL de producao

Se todos os itens de 1 a 4 estao marcados, o sistema esta instalado e
funcionando (vazio). Os blocos 5 a 7 sao para integracoes, dados e publicacao.
