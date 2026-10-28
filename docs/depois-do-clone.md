# Depois de clonar o SGSupport

API de tickets (Fastify + Sequelize). O front fica no repositório `school-guardian-assistente-react`, pasta `sg`. Os dois sobem separados.

Não grave senha, `JWT_SECRET`, chave HMAC nem chave AWS em arquivo versionado. O `.env` fica só na máquina. Na AWS, usuário e senha do banco e o `jwtSecret` vêm do Secrets Manager pelo `samconfig.toml`.

## O que instalar

- Node.js 22.12 ou mais recente (na Lambda o runtime é `nodejs24.x`)
- Docker, para o MySQL local
- AWS SAM CLI e AWS CLI, só para publicar
- Acesso de rede ao RDS de hom quando for migrar ou publicar. O RDS é privado. Da máquina local o caminho é o túnel que o HeidiSQL já usa (`HOM TUNNEL`), banco `BaseEscolas`

## Subir na máquina

```bash
npm install
cp .env.example .env
```

No `.env`, troque `JWT_SECRET` por um valor aleatório de pelo menos 32 caracteres e ajuste `ADMIN_PASSWORD` se for criar o admin local. `DB_*` aponta para `127.0.0.1:3306` e o banco `BaseEscolas`. Deixe `HOM_DB_HOST` e `PROD_DB_HOST` vazios no `.env` local.

```bash
npm run db:up
npm run db:migrate
npm run db:seed:admin
npm run dev
```

A API local fica em `http://127.0.0.1:3000`. `GET /health` não abre banco.

`fsfadm_Usuarios` e `fsfadm_Escolas` já existem no banco do CMS. A migration não cria nem altera essas tabelas. O login usa o usuário que já está em `fsfadm_Usuarios`. O seed só cria o admin quando esse usuário ainda não existe.

## Qual banco cada endereço usa

A API olha o host da requisição e, se precisar, o header `Origin`.

| Quem chama | Banco |
| --- | --- |
| `localhost`, `127.0.0.1` ou `::1` | `DB_*` |
| `suporte.schoolguardian.app` | `PROD_DB_*`. Se estiver vazio e `NODE_ENV=production`, cai em `DB_*` |
| `suporte-t.schoolguardian.app` e qualquer outro host publicado (CloudFront, execute-api) | `HOM_DB_*` |

No Lambda de hom, `DB_*` e `HOM_DB_*` apontam para o mesmo RDS de hom (`BaseEscolas`). `PROD_DB_*` está vazio de propósito. Não preencha produção enquanto o banco de prod não for o alvo certo: o host `suporte.schoolguardian.app` passaria a usar `DB_*`, que hoje também é hom.

O token de um ambiente não vale no outro.

## Migrations

`sam build` e `sam deploy` não rodam migration. O script lê só `DB_*` (o `loadConfig` do `.env`). Ele ignora `HOM_DB_*` e `PROD_DB_*`.

`npm run db:migrate` na pasta do projeto, sem mudar o ambiente, altera o MySQL local da porta 3306.

Para hom, deixe o túnel aberto e sobrescreva `DB_*` só naquele PowerShell. Não grave isso no `.env`. Use a porta do túnel, não a 3306 do Docker local. `DB_SSL=false` porque o túnel já é TCP simples. O `JWT_SECRET` do `.env` continua valendo e precisa ter 32 caracteres ou mais.

```powershell
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "PORTA_DO_TUNNEL"
$env:DB_NAME = "BaseEscolas"
$env:DB_USER = "USUARIO_DO_HOM"
$env:DB_PASSWORD = "SENHA_DO_HOM"
$env:DB_SSL = "false"
npm run db:migrate
```

Quando termina, o hom passa a ter `fsfadm_tickets`, `fsfadm_posts`, `fsfadm_ai_settings` e a tabela de controle `sequelize_meta`.

Não rode isso contra produção agora. Uma migration nova precisa ir para hom antes do deploy que usa as colunas novas. Produção fica para quando `PROD_DB_*` for um banco de prod de verdade.

`npm run db:migrate:undo` desfaz só a última migration na mesma conexão `DB_*`.

## Publicar a API

A stack `school-guardian-support-dev` fica em `us-west-2`. Os parâmetros de hom já estão no `samconfig.toml` (host, banco, segredos, subnets, security group, CORS e bucket de imagem). Não copie esses valores para o chat nem para o `.env`.

No Windows o `sam build` não acha o `esbuild` se o PowerShell for novo. Na pasta `SGSupport`:

```powershell
$env:Path = "$PWD\node_modules\.bin;" + $env:Path
sam build
sam deploy
```

Confirme o changeset. `disable_rollback` está ligado: se o deploy falhar, a stack não volta sozinha.

A URL pública é o output `ApiUrl`, no formato `https://<api-id>.execute-api.us-west-2.amazonaws.com/dev`. Abrir só `/dev` no navegador devolve `Missing Authentication Token`. O teste é `/dev/health`.

O segredo do Secrets Manager precisa ter `username`, `password` e `jwtSecret`. A Lambda liga TLS no RDS e aceita o certificado da Amazon (`rejectUnauthorized: false` em `src/database/sequelize.ts`).

Se o stage falhar com `CloudWatch Logs role ARN must be set in the account settings`, um admin da conta precisa, em `us-west-2`, criar um papel confiado por `apigateway.amazonaws.com`, anexar `AmazonAPIGatewayPushToCloudWatchLogs` e gravar o ARN em `aws apigateway update-account`. O usuário de deploy comum não faz isso.

`InboundApiSecretName` está vazio. Criar ticket, buscar e melhorar texto pela API de entrada respondem 503 até existir um segredo em texto puro com o molde HMAC. Não coloque esse molde dentro do JSON `test/ticket`. O contrato está em `docs/inbound-centralizador.md`.

Imagens de ticket usam o bucket privado `fsfprod`, prefixo `supportTickets/`, e a URL base do CMS. A API assina a leitura por 30 minutos.

## O que ainda não está ligado

- Banco de produção (`ProdDbHost` e `ProdDbSecretArn` vazios)
- Domínio `https://suporte-t.schoolguardian.app` (certificado e DNS ficam no projeto do front)
- Chave HMAC de entrada
- CORS publicado só com `https://suporte-t.schoolguardian.app`. No front publicado pelo CloudFront o navegador chama o mesmo domínio, então o CORS não entra no meio. Se a página e a API ficarem em hosts diferentes, inclua a origem do front em `CorsOrigins` e publique a API de novo
