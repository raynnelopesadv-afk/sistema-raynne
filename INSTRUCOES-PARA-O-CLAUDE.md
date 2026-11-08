# Instruções para o assistente (Claude) — implantação e manutenção autônoma

> **Como usar:** copie o bloco "PROMPT INICIAL" e cole na primeira mensagem para
> o seu assistente. Ele passa a trabalhar sozinho: edita o código, testa,
> publica e (se você liberar) aplica banco e funções.

---

## Parte 1 — O que preparar ANTES (uma vez, ~15 min)

### 1. Repositório no GitHub
- Crie um repositório (pode ser privado) e suba o conteúdo deste pacote.
- Gere um token: GitHub → foto → Settings → Developer settings → Personal access
  tokens → **Tokens (classic)** → Generate new token (classic) → marque o escopo
  **`repo`** → copie (`ghp_...`).
- Anote: **URL do repositório** + **token**.

### 2. Vercel conectada ao GitHub
- Vercel → Add New → Project → importe o repositório.
- Em **Environment Variables**, cadastre as 4 chaves do `.env.example`.
- Deploy. A partir daqui, **todo push na `main` publica sozinho** — é o que dá
  autonomia ao assistente sem ele precisar de acesso à Vercel.

### 3. Projeto na Supabase
- Crie e anote: **Project URL**, **anon key** (Project Settings → API) e o
  **Project ref**.

### 4. (Opcional — elimina o trabalho manual) Automação da Supabase
Se o assistente roda **na sua máquina** (ex.: Claude Code no terminal), ele
aplica banco e funções sozinho. Prepare:
- Instale a **Supabase CLI**: https://supabase.com/docs/guides/cli
- Gere um **Access Token**: Supabase → foto → Account → Access Tokens (`sbp_...`).
- Anote a **senha do banco** (definida na criação do projeto).

> Se o assistente roda em ambiente isolado (sem rede até a Supabase), ele
> **não** aplica SQL nem funções — entrega os arquivos prontos e você cola no
> painel (SQL Editor e Edge Functions). Funciona igual, só exige esses cliques.

---

## Parte 2 — PROMPT INICIAL (copie tudo abaixo)

```
Você vai me ajudar a implantar e evoluir um sistema de BI/CRM comercial
(React + Vite + TypeScript + Supabase). Trabalhe de forma autônoma seguindo
as regras abaixo.

## Meus acessos
- Repositório GitHub: <COLE A URL>
- Token do GitHub (escopo repo): <COLE O TOKEN>
- Supabase Project ref: <COLE>
- Supabase Project URL: <COLE>
- Supabase anon key: <COLE>
- Supabase Access Token (opcional, para automação): <COLE OU DEIXE VAZIO>
- Senha do banco Supabase (opcional): <COLE OU DEIXE VAZIO>
- A Vercel já está conectada ao repositório: todo push na main publica sozinho.

## Como você deve trabalhar
1. Clone o repositório uma vez usando o token:
   git clone https://<TOKEN>@github.com/<usuario>/<repo>.git /tmp/proj
   cd /tmp/proj && npm install
2. Para cada pedido meu: edite os arquivos e SEMPRE antes de subir rode
   npx tsc -p tsconfig.app.json --noEmit    (checagem de tipos)
   npm test                                  (testes das regras de negócio)
   Só suba se os dois passarem.
3. Faça commit com mensagem descritiva em português e push na main.
   A Vercel publica sozinha. Me diga o commit e o que mudou.
4. Se o ambiente reiniciar e a pasta sumir, clone de novo e siga.

## Banco de dados e funções (Supabase)
- Toda alteração de banco vira um arquivo NOVO em supabase/migrations/ no padrão
  AAAAMMDDHHMMSS_descricao.sql. Nunca edite migrations antigas.
- SE eu tiver dado o Access Token e a senha do banco, aplique você mesmo:
    supabase login --token <ACCESS_TOKEN>
    supabase link --project-ref <PROJECT_REF>
    supabase db push
    supabase functions deploy <nome-da-funcao> --no-verify-jwt
    supabase secrets set NOME=valor
  Confirme comigo antes de qualquer comando destrutivo (db reset, drop table).
- SE eu NÃO tiver dado, ou a rede do seu ambiente não alcançar a Supabase:
  me entregue o .sql pronto (e o código da função) com instruções curtas.

## Regras importantes
- Nunca versione segredos. O .env fica local; na Vercel use Environment Variables.
- Antes de mexer em regra de negócio (comissão, metas, status), leia
  src/lib/comissaoRegras.ts e os testes em src/test/ para não quebrar nada.
- Migrations devem ser idempotentes (if not exists / create or replace /
  drop ... if exists), porque posso rodar o arquivo mais de uma vez.
- Colunas geradas (generated always as) falham no Postgres com expressões não
  imutáveis (ex.: cast de enum). Nesses casos use trigger.
- Prefira mudanças pequenas e testáveis; se algo quebrar, me diga como reverter
  (git revert <commit>).
- Leia COMECE-AQUI.md e README.md antes de começar.

Comece assim: clone o repositório, rode npm install, confirme que
`npx tsc --noEmit` e `npm test` passam, e me diga que está pronto.
```

---

## Parte 3 — O que dizer no dia a dia

Depois do prompt inicial, peça em linguagem normal:

- "Adicione um filtro por produto no painel."
- "A comissão não está saindo para o closer X, investigue e me explique."
- "Crie um relatório de contratos por estado e publique."
- "Reverta a última mudança, quebrou algo."

O assistente edita, testa, sobe e a Vercel publica. Se mexer no banco, ele aplica
(com o Access Token) ou entrega o SQL para você colar.

---

## Parte 4 — Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Push falha com erro de autenticação | Token expirado ou sem escopo `repo` | Gerar novo token |
| Alteração não aparece no site | Build ainda não publicou, ou cache | Ver Deployments na Vercel; depois **Ctrl/Cmd+Shift+R** |
| "Failed to send a request to the Edge Function" | Função não publicada, ou nome diferente do chamado no código | Conferir o nome exato e o `functions.invoke(...)` |
| Tela reclama de coluna inexistente | Migration não aplicada | `supabase db push` ou colar o SQL no painel |
| Deploy não dispara | Instabilidade do GitHub ou webhook | Esperar e dar push novo; ou "Redeploy" na Vercel |
| Erro "generation expression is not immutable" | Coluna gerada com expressão não imutável | Trocar por trigger |

---

## Parte 5 — O que dá para automatizar

| Tarefa | Automatizável? |
|---|---|
| Editar código, testar, versionar, publicar site | **Sim** (token do GitHub + Vercel conectada) |
| Aplicar migrations no banco | **Sim**, com Supabase CLI + Access Token (se houver rede) |
| Publicar edge functions e secrets | **Sim**, mesmas condições |
| Criar o projeto Supabase, conectar a Vercel, gerar tokens | **Não** — feito uma vez por você (Parte 1) |
