import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const JSON_KEYS = ['apiKey', 'api_key', 'key', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const;

/** O segredo pode ser o texto da chave ou um JSON com um desses campos. */
export function readSecretString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const json = JSON.parse(trimmed) as unknown;
    if (!json || typeof json !== 'object') return '';
    const record = json as Record<string, unknown>;
    for (const key of JSON_KEYS) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  } catch {
    return trimmed;
  }
}

export interface AiSecretReader {
  read(secretName: string): Promise<string>;
}

let client: SecretsManagerClient | undefined;
let clientKey = '';

function secretsClient(): SecretsManagerClient {
  const region = process.env.AWS_REGION?.trim() || process.env.AWS_S3_REGION?.trim() || 'us-west-2';
  const accessKeyId = process.env.AWS_S3_KEY?.trim() || '';
  const secretAccessKey = process.env.AWS_S3_SECRET?.trim() || '';
  const key = `${region}:${accessKeyId}`;
  if (!client || clientKey !== key) {
    client = new SecretsManagerClient({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
    clientKey = key;
  }
  return client;
}

export async function readAwsSecret(secretName: string): Promise<string> {
  const response = await secretsClient().send(new GetSecretValueCommand({ SecretId: secretName }));
  const key = readSecretString(response.SecretString ?? '');
  if (!key) throw new Error('empty secret');
  return key;
}
