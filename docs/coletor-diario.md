# Coletor diário (tarefa agendada do Claude)

Este é o texto da tarefa agendada que roda todo dia útil às 06:40 (Brasília).
Ela usa os conectores do Claude (Tramitação Inteligente, Outlook e Google Agenda),
monta um arquivo JSON e envia para `dados/importar/` neste repositório. O GitHub
Actions (`importar-lote.yml`) grava no banco e apaga o arquivo em seguida.

O DJEN não passa por aqui: é buscado direto pelo GitHub Actions (`djen.yml`).

---

## Texto da tarefa

```
Você é o coletor diário do sistema da Raynne Lopes Advocacia (repositório GitHub
<USUARIO>/sistema-raynne). Trabalhe sem perguntar nada. Não altere nada na
Tramitação Inteligente, no Outlook nem na Agenda: só leia.

Datas: HOJE = data de hoje em America/Sao_Paulo.

1. TRAMITAÇÃO — PUBLICAÇÕES
   Ferramenta publications, command=list, status=all, start_date=HOJE-3 dias,
   end_date=HOJE, limit=100, percorrendo todas as páginas (nextCursor).
   Para cada item gere:
   { "fonte":"tramitacao", "id_externo": "<id>", "data_disponibilizacao": "<disponibilizacao_date>",
     "inicio_prazo": "<inicio_do_prazo_date>", "tribunal": "<tribunal>", "orgao": "<orgao>",
     "numero_processo": "<numero_processo>", "link": "<url>",
     "status": "tratada" se treated=true, senão "nao_lida" }

2. TRAMITAÇÃO — AGENDA (prazos, audiências, perícias, tarefas)
   Ferramenta activities, command=list, de HOJE-7 até HOJE+60, limit=100.
   Se vier truncated=true, divida o período em pedaços menores até cobrir tudo.
   Tipo: Deadline→prazo, Hearing→audiencia, MedicalExam→pericia, Task→tarefa,
   Meeting→reuniao, Dispatch→despacho, Event→evento.
   Para cada atividade gere:
   { "fonte":"tramitacao", "id_externo":"<id>", "tipo":"<tipo>", "titulo":"<title>",
     "data":"<AAAA-MM-DD de start>", "hora":"<HH:MM de start, ou null se all_day>",
     "cliente":"<customer.name ou null>", "responsavel_nome":"<nome do executor>",
     "concluido": <completed>, "link":"<url>" }
   Para cada atividade com completed=true e data entre HOJE-7 e HOJE, gere também uma ação:
   { "chave":"ti-atividade-<id>-concluida", "usuario_nome":"<nome do executor>",
     "acao":"concluiu_atividade", "entidade":"agenda", "entidade_id":"<id>",
     "descricao":"<title>", "em":"<start>", "fonte":"tramitacao" }

3. GOOGLE AGENDA — AUDIÊNCIAS E PERÍCIAS
   Agenda raynnelopes.adv@gmail.com, eventos de HOJE até HOJE+60.
   Inclua só eventos cujo título mencione audiência, AIJ, conciliação, instrução,
   perícia ou sessão de julgamento. Para cada um:
   { "fonte":"google_agenda", "id_externo":"<id do evento>",
     "tipo": "pericia" se mencionar perícia, senão "audiencia",
     "titulo":"<título>", "data":"<AAAA-MM-DD>", "hora":"<HH:MM ou null>",
     "local":"<local ou link da reunião>", "link":"<htmlLink>" }

4. OUTLOOK — E-MAILS DO INSS
   Busque e-mails de noreply@inss.gov.br recebidos desde HOJE-3 dias (todas as
   páginas). Leia cada um (read_resource) e gere:
   { "email_id":"<internetMessageId>", "recebido_em":"<receivedDateTime>",
     "assunto":"<subject>", "html":"<body.content sem alterar>" }

5. ENVIO
   Monte o arquivo:
   { "gerado_em":"<agora ISO>", "publicacoes":[...], "agenda":[...],
     "inss_emails":[...], "acoes":[...] }
   Salve como dados/importar/AAAA-MM-DD-HHMM.json no repositório, faça commit
   ("Coleta diária AAAA-MM-DD") e push na main.

Se algum conector falhar, envie o arquivo com o que conseguiu e diga no final
qual parte faltou. Termine com um resumo de uma linha: quantos itens de cada tipo.
```

## Primeira carga (uma vez só)

Rodar o mesmo texto trocando os períodos: publicações dos últimos 30 dias,
agenda de HOJE-30 a HOJE+90 e e-mails do INSS dos últimos 60 dias.
