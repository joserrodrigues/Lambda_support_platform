# APIs de entrada do suporte

Estas rotas são para o projeto que centraliza e-mail, WhatsApp e a melhoria de texto. Elas não usam login de usuário. A autenticação é a mesma das três, e é a mesma do `ApiAuthVerifier` do FSFAPI.

A coleção para importar no Postman está em `docs/sg-support-inbound.postman_collection.json`. Ela calcula `date` e `hash` sozinha. Antes de enviar, preencha a variável `inboundSecret` com o molde da chave. A chave não fica neste repositório.

## Endereços

| Ambiente | URL |
| --- | --- |
| Local | `http://127.0.0.1:3000` |
| Homologação | `https://suporte-t.schoolguardian.app` |
| Produção | `https://suporte.schoolguardian.app` |

No local, a API lê a chave da variável `INBOUND_API_SECRET`. Em homologação e produção, lê o segredo da AWS cujo nome está em `INBOUND_API_SECRET_NAME`. Se a chave não estiver configurada, as três rotas respondem **503** com a mensagem `A chave de entrada não está configurada.`

Cada rota aceita 30 chamadas por minuto.

## Autenticação

Toda chamada é `POST` com `Content-Type: application/json`. O corpo traz os campos da operação mais dois campos de autenticação:

- `date`: data e hora UTC, no formato `Y-m-d H:i:s` (`2026-10-09 19:24:00`) ou compacto `YmdHis` (`20261009192400`). A diferença para o relógio do servidor pode ser de no máximo 300 segundos.
- `hash`: HMAC-SHA256 em hexadecimal minúsculo (64 caracteres).

O molde da chave pode conter estes marcadores, substituídos pela data UTC da requisição:

| Marcador | Valor |
| --- | --- |
| `%Y%` | ano, 4 dígitos |
| `%m%` | mês, 2 dígitos |
| `%d%` | dia, 2 dígitos |
| `%H%` | hora, 2 dígitos |
| `%i%` | minuto, 2 dígitos |
| `%s%` | segundo, 2 dígitos |

Exemplo: o molde `chave-teste-%Y%-%m%` com a data `20261002123045` vira a chave `chave-teste-2026-10`.

O hash é calculado sobre o JSON canônico de **todos os campos enviados, menos `hash`**. `date` entra nesse JSON. A ordem das chaves no HTTP não importa: os dois lados ordenam as chaves antes de assinar.

O JSON canônico segue o `json_encode` do PHP:

- chaves em ordem alfabética
- sem espaços
- barras `/` literais
- letras fora do ASCII como `\uXXXX` minúsculo
- número, booleano e `null` permanecem com o tipo JSON

Um número enviado como string (`"schoolId": "7"`) gera outro hash e a API responde **401** `Chave inválida.` O mesmo vale para um booleano enviado como texto.

Vetor de conferência, o mesmo do teste de licença do FSFAPI:

- molde: `chave-teste-%Y%-%m%`
- data: `20261002123045`
- corpo sem hash: `date`, `environment` = `model_1`, `fingerprint` = 64 letras `a`
- JSON canônico: `{"date":"20261002123045","environment":"model_1","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}`
- hash: `9e5240bebd17d79ca077d2726fda63cbc425bacd94e74b0335eb547563891853`

Esse vetor serve para testar o cálculo. A data é antiga, então a API recusa a chamada por estar fora da janela de 300 segundos. O hash em si está correto.

Erro de autenticação:

```json
{ "statusCode": 401, "code": "UNAUTHORIZED", "message": "Chave inválida." }
```

Quando a data passa e o corpo é válido, a API ignora `date`, `hash` e qualquer campo que não esteja documentado abaixo.

## Criar chamado

`POST /inbound/tickets`

Cria o card e o primeiro registro público. O autor do registro fica vazio, porque a mensagem veio de fora do suporte. A escola enxerga esse texto no CMS.

Obrigatórios:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `schoolId` | número | escola que já existe na base |
| `title` | texto | opcional, 1 a 191 caracteres |
| `entryType` | texto | `email`, `cms`, `reuniao` ou `whatsapp` |
| `content` | texto | 1 a 10.000 caracteres, texto puro ou HTML |

Opcionais. Se faltarem, o card nasce aguardando, sem prioridade e sem nível 2:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `status` | texto | `aguardando`, `em_analise`, `aguardando_suporte_n2`, `resposta_n2_realizada`, `done` |
| `devStatus` | texto ou `null` | `aguardando`, `em_analise`, `em_desenvolvimento`, `em_teste`, `aguardando_cliente`, `aguardando_importacao`, `aguardando_producao`, `aguardando_loja`, `proxima_sprint`, `nao_necessita_desenvolvimento`, `concluido` |
| `errorType` | texto ou `null` | 1 a 50 caracteres |
| `supportLevel2` | booleano | |
| `priority` | booleano | |
| `slaType` | texto ou `null` | `critico`, `alto`, `medio`, `baixo` |
| `responseAt` | texto ou `null` | data ISO com fuso, por exemplo `2026-10-10T15:00:00Z` |
| `technicalResponseAt` | texto ou `null` | mesmo formato |
| `schoolResponsible` | texto ou `null` | 1 a 120 caracteres |
| `schoolUserId` | número ou `null` | usuário da escola, quando a origem for o CMS |
| `schoolUserName` | texto ou `null` | 1 a 191 caracteres, nome desse usuário no momento do envio |

O HTML de `content` fica restrito às tags `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `ul`, `ol`, `li`, `a`, `img` e `span`. Link e imagem precisam ser `http` ou `https`.

Resposta **201**: a ficha do card. O `id` é o identificador usado nas outras chamadas. `viewedAt` nasce `null`, então o card aparece como novo no suporte até alguém da equipe abri-lo.

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "schoolId": 7,
  "status": "aguardando",
  "devStatus": null,
  "entryType": "whatsapp",
  "errorType": null,
  "supportLevel2": false,
  "priority": true,
  "slaType": null,
  "responseAt": null,
  "technicalResponseAt": null,
  "schoolResponsible": "Maria",
  "schoolUserId": null,
  "schoolUserName": null,
  "viewedAt": null,
  "createdAt": "2026-10-09T19:24:00.000Z",
  "updatedAt": "2026-10-09T19:24:00.000Z"
}
```

Escola inexistente: **422** `Escola não encontrada`. Campo inválido: **422** no formato `campo: mensagem`.

## Buscar chamados

`POST /inbound/tickets/search`

Devolve uma página de cards. A busca não marca o card como visto.

Sem filtros, a primeira página traz até 100 cards, os mais novos primeiro. Dá para mandar só `date` e `hash`.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `page` | número | a partir de 1; padrão 1 |
| `pageSize` | número | 1 a 100; padrão 100 |
| `schoolId` | número | |
| `status` | texto | os mesmos códigos da criação |
| `devStatus` | texto | os mesmos códigos da criação |
| `entryType` | texto | `email`, `cms`, `reuniao`, `whatsapp` |
| `slaType` | texto | `critico`, `alto`, `medio`, `baixo` |
| `priority` | booleano | |
| `supportLevel2` | booleano | |
| `since` | texto | data ISO com fuso |

`since` devolve o card se ele foi **criado ou atualizado** a partir daquele instante. Serve para a próxima consulta não baixar a lista inteira: guarde a hora da última busca e mande esse valor. Abrir o card no suporte grava `viewedAt` e não muda `updatedAt`, então só a visualização não faz o card reaparecer por causa de `since`.

Cada item repete a ficha da criação e acrescenta:

- `unseen`: `true` enquanto `viewedAt` for `null`
- `firstContent`: texto do primeiro registro público, ou `null` se o card ainda não tiver registro

```json
{
  "data": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "schoolId": 7,
      "status": "aguardando",
      "devStatus": null,
      "entryType": "email",
      "errorType": null,
      "supportLevel2": false,
      "priority": false,
      "slaType": null,
      "responseAt": null,
      "technicalResponseAt": null,
      "schoolResponsible": null,
      "schoolUserId": null,
      "schoolUserName": null,
      "viewedAt": null,
      "createdAt": "2026-10-09T19:24:00.000Z",
      "updatedAt": "2026-10-09T19:24:00.000Z",
      "unseen": true,
      "firstContent": "<p>Primeira mensagem</p>"
    }
  ],
  "meta": { "page": 1, "pageSize": 100, "total": 1 }
}
```

Filtro inválido: **422** `campo: mensagem`.

## Melhorar texto

`POST /inbound/text/improve`

Recebe o texto que está no campo e devolve o texto melhorado. Não cria card, não cria registro e não substitui nada no banco. Quem chamou coloca o texto de volta no campo.

No suporte, o mesmo comportamento já existe no botão **Melhorar texto**, em Novo registro, no primeiro registro e em Corrigir. Esta rota é esse botão para o outro projeto.

| Campo | Tipo | Regra |
| --- | --- | --- |
| `text` | texto | obrigatório, 1 a 10.000 caracteres |
| `aiId` | texto | opcional; 1 a 32 caracteres, letras, números, `_` e `-` |
| `ticketId` | texto | opcional; entra na autenticação se for enviado, e não é gravado |

Se só existir uma IA habilitada, omita `aiId`. Se existir mais de uma, a resposta é **422** `Informe qual IA deve melhorar o texto.` e o corpo precisa trazer o `aiId` escolhido. Sem IA pronta: **422** `A IA não está configurada.`

A IA usada é a que o suporte configurou. Uma LM em máquina interna entra nessa configuração quando responde no formato de chat da OpenAI (`POST {endereco}/chat/completions`, com modelo e chave) ou no formato Messages da Anthropic. Não há um protocolo separado nesta rota.

```json
{ "text": "<p>A catraca parou. Podem verificar?</p>" }
```

Se a IA não responder: **503** `A IA não respondeu. Confira o modelo e o segredo da IA.`
