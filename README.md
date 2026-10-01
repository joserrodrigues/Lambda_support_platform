# School Guardian — Support Platform

API de gerenciamento de tickets da School Guardian.

| Camada     | Tecnologia                                                  |
| ---------- | ----------------------------------------------------------- |
| Runtime    | Node.js 24 LTS (`nodejs24.x` no Lambda; local ≥ 22.12)      |
| HTTP       | Fastify 5 + Zod (`fastify-type-provider-zod`)               |
| Banco      | MySQL 8 (Amazon RDS) via Sequelize 6 + `mysql2`             |
| Migrations | Umzug                                                       |
| Auth       | JWT HS256 (`@fastify/jwt`) com renovação deslizante         |
| Infra      | AWS Lambda + API Gateway (REST) com AWS SAM (build esbuild) |
| Testes     | Jest 30 + ts-jest                                           |

## Arquitetura

```
Cliente ──HTTPS──> API Gateway (throttling, access logs, WAF opcional)
                        │  proxy /{proxy+}
                        ▼
                 AWS Lambda (Fastify via @fastify/aws-lambda)
                        │  Sequelize (pool pequeno, TLS)
                        ▼
                 Amazon RDS MySQL (VPC privada / RDS Proxy)
```

```
src/
├── app.ts                  # buildApp(): plugins + rotas (dependências injetáveis)
├── server.ts               # execução local (npm run dev)
├── lambda.ts               # handler do Lambda
├── config/env.ts           # variáveis de ambiente validadas com Zod
├── database/               # Sequelize, Umzug e migrations
├── plugins/                # auth (JWT), security (helmet/cors/rate-limit), error-handler
├── modules/
│   ├── auth/               # login, me, logout
│   └── users/              # CRUD de usuários
├── shared/                 # erros e hash de senha (scrypt)
└── scripts/                # migrate e seed do admin
tests/
├── helpers/                # factories, fakes (repositório em memória), createTestApp
└── unit/                   # testes espelhando src/
```

## Rodando localmente

```bash
nvm use                    # Node 24
npm install
cp .env.example .env       # ajuste JWT_SECRET e ADMIN_PASSWORD
npm run db:up              # MySQL 8.4 no Docker (127.0.0.1:3306)
npm run db:migrate
npm run db:seed:admin      # cria o primeiro admin (ADMIN_EMAIL / ADMIN_PASSWORD)
npm run dev                # http://127.0.0.1:3000
```

Para simular o Lambda + API Gateway: `cp env.local.json.example env.local.json` e
`npm run sam:local` (requer AWS SAM CLI e Docker; usa a rede `school-guardian-net` do compose).

## Modelo de dados

Migrations em `src/database/migrations/` (Umzug), aplicadas com `npm run db:migrate`.

| Migration                           | Descrição                                    |
| ----------------------------------- | -------------------------------------------- |
| `20261001000000-create-users`       | tabela `users`                               |
| `20261001000100-add-login-to-users` | coluna `login` (única) em `users`            |
| `20261001000200-create-tickets`     | tabela `tickets`                             |
| `20261001000300-create-posts`       | tabela `posts` (FK para `tickets` e `users`) |

**users** — `id` (UUID), `name`, `email` (único), `login` (único), `password_hash`, `role`,
`active`, `token_version`, `last_login_at`, `created_at`, `updated_at`, `deleted_at`.

**tickets**

| Coluna                  | Tipo         | Campo de negócio      |
| ----------------------- | ------------ | --------------------- |
| `id`                    | UUID         | id                    |
| `school_id`             | INT UNSIGNED | id escola             |
| `status`                | VARCHAR(30)  | status                |
| `dev_status`            | VARCHAR(30)  | status dev            |
| `entry_type`            | VARCHAR(30)  | tipo entrada          |
| `error_type`            | VARCHAR(50)  | tipo erro             |
| `support_level_2`       | TINYINT      | suporte nível 2 (0/1) |
| `priority`              | VARCHAR(20)  | prioridade            |
| `sla_type`              | VARCHAR(30)  | tipo SLA              |
| `response_at`           | DATETIME     | data resposta         |
| `technical_response_at` | DATETIME     | data resposta técnica |
| `school_responsible`    | VARCHAR(120) | resp. escola          |
| `created_at`            | DATETIME     | data criação          |
| `updated_at`            | DATETIME     | data alteração        |

**posts** — `id` (UUID), `ticket_id` (FK `tickets`, `ON DELETE CASCADE`), `user_id`
(FK `users`, autor), `content` (TEXT), `created_at`, `updated_at`.

## Endpoints

| Método | Rota           | Acesso                 | Descrição                               |
| ------ | -------------- | ---------------------- | --------------------------------------- |
| GET    | `/health`      | público                | health check                            |
| POST   | `/auth/login`  | público (rate limited) | retorna Bearer token (10 min)           |
| GET    | `/auth/me`     | autenticado            | usuário atual                           |
| POST   | `/auth/logout` | autenticado            | revoga todos os tokens do usuário       |
| POST   | `/users`       | admin                  | cria usuário                            |
| GET    | `/users`       | admin                  | lista paginada (`page`, `pageSize≤100`) |
| GET    | `/users/:id`   | admin ou o próprio     | detalhe                                 |
| PATCH  | `/users/:id`   | admin ou o próprio     | atualiza (role/active só admin)         |
| DELETE | `/users/:id`   | admin                  | exclusão lógica (soft delete)           |

Papéis: `admin`, `agent`, `requester`.

### Autenticação e renovação do token

1. `POST /auth/login` → `{ accessToken, tokenType: "Bearer", expiresIn: 600, user }`.
2. Envie `Authorization: Bearer <token>` nas requisições.
3. **Toda resposta autenticada traz um novo token** no header `X-Access-Token`
   (com `X-Access-Token-Expires-In: 600`). O cliente deve substituir o token armazenado por esse
   valor — assim a sessão se mantém enquanto houver atividade e expira após 10 min de inatividade.
4. A sessão tem limite absoluto (`SESSION_MAX_AGE_SECONDS`, padrão 8h) a partir do login,
   mesmo com renovações.
5. Logout, troca de senha e desativação incrementam `tokenVersion`, invalidando todos os tokens
   já emitidos daquele usuário.

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@schoolguardian.local","password":"..."}' | jq -r .accessToken)
curl -i localhost:3000/users -H "authorization: Bearer $TOKEN"   # veja o header x-access-token
```

## Segurança (OWASP)

- **Controle de acesso** (A01 / API1 / API5): checagem de dono e papel no service; IDs UUID.
- **Mass assignment** (API3): `z.strictObject` nas entradas e schema explícito nas respostas.
- **Criptografia** (A04): scrypt com salt + `timingSafeEqual`; JWT com algoritmo fixado,
  `iss`/`aud` validados; TLS com o RDS (`DB_SSL=true`).
- **Autenticação** (A07 / API2): mensagem genérica, hash dummy contra timing attack, rate limit
  no login, revogação por versão, sessão com tempo máximo.
- **Configuração** (A02 / API8): helmet (CSP `default-src 'none'`, HSTS, nosniff), CORS por
  allowlist, `bodyLimit` de 100 KB, `cache-control: no-store` em respostas com token.
- **Consumo de recursos** (API4): throttling no API Gateway, rate limit no app, paginação máxima.
- **Logs** (A09): pino com `redact` de `authorization`, senhas e tokens.
- **Erros** (A10): handler central que nunca expõe stack/SQL.
- **Supply chain** (A03): dependências mínimas, sem binários nativos, `npm audit` limpo.

## Deploy (AWS SAM)

Pré-requisitos: segredo do banco (`username`/`password`) e segredo `jwtSecret` no Secrets
Manager, RDS MySQL acessível pelas subnets informadas.

```bash
npm run sam:build
sam deploy --guided \
  --parameter-overrides Stage=dev DbHost=<rds-endpoint> DbSecretArn=<arn> JwtSecretArn=<arn> \
  SubnetIds=<subnet-a,subnet-b> SecurityGroupIds=<sg> CorsOrigins=https://app.schoolguardian.app
```

As migrations não rodam dentro do Lambda da API; execute `npm run db:migrate` apontando para o
RDS (ex.: via bastion/CI) antes do deploy de versões que alteram o schema.

## Qualidade

```bash
npm run typecheck
npm run lint
npm run test:coverage
```
