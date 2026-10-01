# School Guardian — Support Platform (tickets)

API de gerenciamento de tickets em Node.js + TypeScript, Fastify 5, Sequelize 6 (MySQL/RDS),
executada em AWS Lambda atrás de API Gateway (deploy com AWS SAM).

## Agentes do projeto

- `backend-fastify-security` (`.claude/agents/`) — implementação/revisão de backend com foco OWASP.
- `unit-test-specialist` (`.claude/agents/`) — testes unitários com Jest.
- Equivalentes para o Cursor em `.cursor/rules/*.mdc`.

Use o agente de backend para código em `src/` e o de testes logo em seguida para cobrir a mudança.

## Comandos

- `npm run dev` — servidor local (lê `.env`)
- `npm run db:up` / `npm run db:migrate` / `npm run db:seed:admin`
- `npm run typecheck && npm run lint && npm test` — obrigatórios antes de commitar
- `npm run test:coverage` — cobertura mínima 85% (80% branches)
- `npm run sam:build` / `npm run sam:local` / `npm run sam:deploy`

## Convenções

- Módulos em `src/modules/<dominio>/` (model → repository → service → routes/schemas).
- Configuração somente via `src/config/env.ts`; dependências injetadas em `buildApp()`.
- Toda rota com schemas Zod de entrada (`z.strictObject`) e resposta.
- Autorização no service; erros via `Errors.*`.
- Schema do banco somente por migrations (`src/database/migrations/`).
