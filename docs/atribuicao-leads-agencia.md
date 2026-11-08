# Atribuição de leads por anúncio — instruções para a agência de tráfego

O CRM agora identifica de qual anúncio veio cada lead/contrato automaticamente,
cruzando pelo telefone. Existem duas fontes:

- **Clique-para-WhatsApp (CTWA):** já é 100% automático. O Liderhub entrega o ID
  do anúncio e o CRM carimba sozinho. Nada a fazer.
- **Formulário instantâneo:** é o que precisa de vocês. A automação que hoje já
  preenche a planilha de leads deve enviar cada lead também para o CRM, por um
  webhook (uma requisição HTTP). É um passo só.

## O que adicionar na automação (Make / Zapier / n8n)

Depois do passo que grava o lead na planilha, adicionem um passo **HTTP POST**:

- **URL:** `https://SEU_PROJECT_REF.supabase.co/functions/v1/ingest-attribution`
- **Método:** `POST`
- **Headers:**
  - `Content-Type: application/json`
  - `x-webhook-secret: COLOCAR_O_SEGREDO_AQUI`
- **Body (JSON):**

```json
{
  "phone": "{{telefone do lead}}",
  "ad_id": "{{id do anúncio}}",
  "ad_name": "{{nome do anúncio}}",
  "adset_name": "{{nome do conjunto}}",
  "campaign_name": "{{nome da campanha}}"
}
```

## Regras

- **`phone` é obrigatório.** Pode vir em qualquer formato (com ou sem 55, com ou
  sem parênteses); o CRM normaliza.
- **Mande o `ad_id` sempre que tiver** — é o mais preciso. Se só tiver o nome do
  anúncio, mande `ad_name` que o CRM tenta resolver pelo nome.
- Podem mandar **um lead por requisição** ou uma **lista** de leads (array JSON).
- Reenviar o mesmo telefone não duplica: o CRM atualiza a atribuição.

## Como testar

Um POST de teste com um telefone real de lead já deve responder
`{"ok":true,"upserted":1}`. Em seguida esse telefone aparece atribuído no CRM.

## Observação sobre o código no nome do anúncio

Vocês já usam código no nome (ex.: `AD09`). Mantenham esse padrão: além de ajudar
na leitura, é o que garante a atribuição correta por criativo mesmo nos leads de
clique-para-WhatsApp.
