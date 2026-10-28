export const AI_PROVIDERS = ['openai', 'anthropic'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiSettings {
  id: string;
  name: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  /** Chave gravada. Só o ambiente local usa este valor na chamada. */
  apiKey: string;
  /** Nome do segredo na AWS. Hom e produção leem a chave por aqui. */
  secretName: string;
  enabled: boolean;
}

export interface AiSettingsRepository {
  list(): Promise<AiSettings[]>;
  get(id: string): Promise<AiSettings | null>;
  insert(settings: AiSettings): Promise<void>;
  update(settings: AiSettings): Promise<void>;
  remove(id: string): Promise<void>;
}
