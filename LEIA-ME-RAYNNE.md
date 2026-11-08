# Sistema Raynne Lopes Advocacia

Base: BI Suite (comercial: fechamentos, comissões, funil) + módulo jurídico novo.

## O que o módulo jurídico faz

| Tela | O que mostra | De onde vem |
|---|---|---|
| **Painel Jurídico** (página inicial) | Atrasados, vencendo hoje, próximos 7 dias, audiências, publicações não lidas, exigências do INSS | Tudo abaixo |
| **Prazos e Audiências** | Agenda jurídica com filtros; marcar como concluído | Tramitação Inteligente + Google Agenda + manual |
| **Publicações** | Intimações de todos os tribunais pela OAB/MG 160.914; marcar como tratada | DJEN (CNJ) + Tramitação Inteligente |
| **INSS** | Requerimentos com exigência, prazo estimado (30 dias corridos), despacho completo | E-mails noreply@inss.gov.br (Outlook) |
| **Equipe** | O que cada colaborador fez (tratou, concluiu, cumpriu) e contratos fechados por pessoa | Registro automático + Tramitação + Fechamento |

## Como os dados chegam (sem ninguém digitar)

1. **DJEN** — GitHub Actions consulta o CNJ às 07:10 e 13:10 (dias úteis).
2. **Tramitação, Agenda e INSS** — tarefa agendada do Claude às 06:40 lê os
   conectores e envia um lote; o GitHub Actions grava no banco e apaga o arquivo.
3. **Ações da equipe** — gravadas sozinhas quando alguém marca algo no sistema.

## Segurança

- Quem se cadastra sozinho **não vê nada** do jurídico até o gestor definir o
  papel em **Config → Usuários**.
- Depois que você e a equipe estiverem cadastradas, desligue cadastro aberto no
  Supabase: **Authentication → Sign In / Providers → Allow new users to sign up = off**.
- Chaves secretas ficam só em **GitHub → Settings → Secrets and variables → Actions**:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
- O prazo do INSS é **estimado**. Confirme sempre no Meu INSS / GERID.

## Comandos (para quem for mexer no código)

```bash
npm install
npm test                      # testes (comissões + jurídico)
npm run dev                   # rodar local (precisa do .env)
node scripts/importar.mjs djen --dias 7
node scripts/importar.mjs lote dados/importar/arquivo.json
```
