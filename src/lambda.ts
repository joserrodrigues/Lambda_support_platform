import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { buildApp } from './app';
import { loadConfig } from './config/env';
import { getSequelize } from './database/sequelize';

// Inicialização fora do handler: reaproveitada entre invocações (warm start).
const bootstrap = (async () => {
  const config = loadConfig();
  getSequelize(config);
  const app = await buildApp({ config });
  const proxy = awsLambdaFastify(app, { decorateRequest: false });
  await app.ready();
  return proxy;
})();

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  // Não aguarda o event loop esvaziar (pool de conexões do Sequelize permanece aberto).
  context.callbackWaitsForEmptyEventLoop = false;
  const proxy = await bootstrap;
  return proxy(event, context);
};
