# Spec do frontend — API de tickets

Este repositório é só backend. O frontend é outro projeto e fala com esta API por JSON. Contrato gerado: [`openapi.json`](openapi.json). Collection para testar: [`school-guardian-support.postman_collection.json`](school-guardian-support.postman_collection.json).

Base local: `http://127.0.0.1:3000`. A origem do frontend precisa estar em `CORS_ORIGINS`. Não há cookie de sessão.

O banco muda com o endereço:

| Endereço | Banco |
| --- | --- |
| `http://localhost` ou `http://127.0.0.1` | conexão local (`DB_*`, hoje `BaseEscolas`) |
| `https://suporte-t.schoolguardian.app` | homologação (`HOM_DB_*`) |
| `https://suporte.schoolguardian.app` | produção (`PROD_DB_*`) |

Se a API estiver em outro host, a `Origin` do frontend decide. No localhost a Origin não troca o banco. O token do login só vale no ambiente em que foi emitido: um token de hom recebe `401` em prod.

## O que o frontend precisa

- Guardar `accessToken` depois do login e enviar `Authorization: Bearer <accessToken>` em toda rota que não seja pública.
- Em **toda resposta autenticada**, ler o header `X-Access-Token` e **substituir** o token guardado. O header `X-Access-Token-Expires-In` traz a nova validade em segundos (padrão `600`). Sem isso a sessão cai após 10 minutos, mesmo com o usuário ativo. No browser esses headers só aparecem porque a API os expõe no CORS.
- Tratar `401` como sessão inválida: apagar o token e voltar para o login.
- Esconder tickets, posts e a lista de escolas de quem tem papel `requester`. Essas rotas exigem `admin` ou `agent` e respondem `403`.
- Não cadastrar usuário nem escola por aqui. Usuários vêm de `fsfadm_Usuarios` e escolas de `fsfadm_Escolas`, do outro sistema. O `schoolId` do ticket é o `id` numérico de `GET /schools`. Esta API só lê `id` e nome; não grava na tabela de escolas.
- Exibir rótulos a partir de `GET /tickets/options`. A API grava e devolve **códigos** (`em_analise`), não o texto da tela.

## Formato comum

`Content-Type: application/json`. Corpo com campo a mais é rejeitado (`400`). Datas entram e saem em ISO 8601 com fuso (`2026-10-02T18:00:00.000Z`).

Listas paginadas:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 20, "total": 0 }
}
```

`page` começa em 1. `pageSize` máximo é 100. Se omitir, a API usa `page=1` e `pageSize=20`.

Erro:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Dados inválidos",
  "details": [{ "field": "email", "message": "..." }]
}
```

`details` só vem em validação. Códigos: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `UNPROCESSABLE_ENTITY` (422), `RATE_LIMIT` / limite (429), `INTERNAL_SERVER_ERROR` (500).

## Papéis

O papel não está na tabela legada. A API traduz `fsfadm_Usuarios.tipo`:

| `tipo` | `role` na API | O que o frontend faz |
| --- | --- | --- |
| `1` | `admin` | tickets, posts e exclusão de ticket |
| `4` | `agent` | tickets e posts; não exclui ticket |
| outro valor preenchido | `requester` | só a própria sessão; tickets respondem 403 |
| `null` ou `0` | inativo | login responde 401 |

`id` de usuário é número (`fsfadm_Usuarios.id`), não UUID. No objeto público, `login` repete o e-mail: a tabela não tem coluna de login.

## Sessão

### `POST /auth/login` — público

```json
{ "email": "ana@escola.com", "password": "senha" }
```

`200`:

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 600,
  "user": {
    "id": 1,
    "name": "Ana",
    "email": "ana@escola.com",
    "login": "ana@escola.com",
    "role": "admin",
    "active": true,
    "lastLoginAt": null,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

`401` com mensagem genérica se o e-mail ou a senha não batem, ou se o usuário está inativo. Não dá para distinguir os casos. Há limite de tentativas por minuto.

O token dura 10 minutos. Cada requisição autenticada emite outro, no header. A sessão também tem teto absoluto de 8 horas a partir do login (`SESSION_MAX_AGE_SECONDS`). Passou disso, `401` com pedido para entrar de novo, mesmo renovando o token.

### `GET /auth/me` — autenticado

Devolve o mesmo objeto `user`. Serve para reidratar a tela depois do refresh, se o frontend ainda tiver um token válido.

### `POST /auth/logout` — autenticado

`204` sem corpo. O frontend apaga o token local. A tabela de usuários não guarda versão de token, então o logout não invalida um JWT que outra aba ainda tenha; ele só deixa de valer quando expirar.

## Usuários

Leitura funciona. Escrita nesta API responde `403` (`fsfadm_Usuarios é usada por outro sistema e esta API não grava nela`). O frontend não deve oferecer criar, editar ou excluir usuário daqui.

| Método | Rota | Quem | Resposta |
| --- | --- | --- | --- |
| `GET` | `/users?page&pageSize` | `admin` | `200` lista |
| `GET` | `/users/:id` | `admin` ou o próprio | `200` usuário, `404` se não existe, `403` se outro papel tenta ver terceiro |
| `POST` | `/users` | `admin` | `403` nesta base |
| `PATCH` | `/users/:id` | `admin` ou o próprio | `403` nesta base |
| `DELETE` | `/users/:id` | `admin` | `403` nesta base |

## Escolas

`admin` e `agent`. Só leitura de `id` e `name` (coluna `nomeEscola`). Nenhuma outra coluna da escola sai nesta resposta.

### `GET /schools`

Query opcional: `page`, `pageSize`, `name` (trecho do nome, sem diferenciar maiúsculas).

`200`:

```json
{
  "data": [{ "id": 1, "name": "Escola Alfa" }],
  "meta": { "page": 1, "pageSize": 20, "total": 1 }
}
```

Use `id` como `schoolId` ao criar ou editar ticket.

## Tickets

`admin` e `agent`. `requester` recebe `403` antes mesmo de a API validar o corpo.

Códigos aceitos (rótulo em `GET /tickets/options`):

- **status:** `aguardando` (padrão), `em_analise`, `aguardando_suporte_n2`, `resposta_n2_realizada`, `done`
- **devStatus:** `aguardando`, `em_analise`, `em_desenvolvimento`, `em_teste`, `aguardando_cliente`, `aguardando_importacao`, `aguardando_producao`, `aguardando_loja`, `proxima_sprint`, `nao_necessita_desenvolvimento`, `concluido`
- **entryType:** `email`, `cms`, `reuniao`, `whatsapp`
- **slaType:** `critico`, `alto`, `medio`, `baixo`

### `GET /tickets/options`

`200` com `{ status, devStatus, entryType, slaType }`. Cada item é `{ "value": "em_analise", "label": "Em análise" }`. Carregar isso uma vez ao abrir o módulo e usar `value` no payload e `label` na tela.

### `POST /tickets`

`201` com o ticket. `schoolId` é obrigatório e tem de existir (`422` se não existir). `entryType` é obrigatório.

```json
{
  "schoolId": 1,
  "entryType": "email",
  "status": "aguardando",
  "priority": false,
  "supportLevel2": false,
  "devStatus": null,
  "errorType": null,
  "slaType": "medio",
  "schoolResponsible": null
}
```

`status`, `priority` e `supportLevel2` podem ser omitidos (viram `aguardando`, `false` e `false`). `errorType` até 50 caracteres. `schoolResponsible` até 120. `responseAt` e `technicalResponseAt` são datas opcionais.

Ticket devolvido:

```json
{
  "id": "uuid",
  "schoolId": 1,
  "status": "aguardando",
  "devStatus": null,
  "entryType": "email",
  "errorType": null,
  "supportLevel2": false,
  "priority": false,
  "slaType": "medio",
  "responseAt": null,
  "technicalResponseAt": null,
  "schoolResponsible": null,
  "createdAt": "2026-10-02T18:00:00.000Z",
  "updatedAt": "2026-10-02T18:00:00.000Z"
}
```

O `id` do ticket é UUID. O `schoolId` é número.

### `GET /tickets`

Query opcional, além da paginação: `schoolId`, `status`, `devStatus`, `entryType`, `slaType`, `priority` (`true` ou `false`), `supportLevel2` (`true` ou `false`). A string `"false"` é falsa de verdade; não mandar `1`/`0`.

### `GET /tickets/:id`

`200` ticket ou `404`.

### `PATCH /tickets/:id`

Só os campos que mudaram. Pelo menos um campo. `null` limpa opcional: `devStatus`, `errorType`, `slaType`, `responseAt`, `technicalResponseAt`, `schoolResponsible`. Trocar `schoolId` para uma escola inexistente responde `422`.

### `DELETE /tickets/:id`

Só `admin`. `204`. Apaga o ticket e os posts juntos. `agent` recebe `403`.

## Posts

Mesmo acesso dos tickets (`admin` e `agent`). O autor gravado é sempre quem está logado; o frontend não envia `userId`.

### `POST /tickets/:id/posts`

```json
{ "content": "Primeiro contato com a escola." }
```

`201`. `content` de 1 a 10.000 caracteres, texto puro. `404` se o ticket não existe.

```json
{
  "id": "uuid",
  "ticketId": "uuid",
  "content": "Primeiro contato com a escola.",
  "author": { "id": 1, "name": "Ana" },
  "createdAt": "2026-10-02T18:00:00.000Z",
  "updatedAt": "2026-10-02T18:00:00.000Z"
}
```

`author` pode ser `null` se o usuário não for encontrado. Não vem e-mail nem papel do autor.

### `GET /tickets/:id/posts?page&pageSize`

`200` lista paginada, do mais antigo para o mais novo.

### `PATCH /tickets/:id/posts/:postId`

```json
{ "content": "Texto corrigido." }
```

Autor do post ou `admin`. Os outros recebem `403`. Post de outro ticket na URL responde `404`.

### `DELETE /tickets/:id/posts/:postId`

Mesma regra de quem pode editar. `204`.

## Fluxo sugerido na tela

1. Login. Guardar token e `user.role`.
2. Se `role` for `requester`, não montar o módulo de tickets.
3. `GET /tickets/options` para os selects.
4. `GET /schools` para o seletor de escola (`id` e `name`). O `schoolId` do ticket é esse `id`.
5. `GET /tickets` na lista. Ao abrir um item, `GET /tickets/:id` e `GET /tickets/:id/posts`.
6. Criar e editar ticket com os **códigos**. Mostrar os **rótulos**.
7. Em cada resposta, trocar o token pelo `X-Access-Token` antes da próxima chamada.
8. Logout: `POST /auth/logout` e apagar o token no cliente.
