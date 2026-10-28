import { readSecretString } from '../../../../src/modules/ai/ai.secrets';
import { AiService } from '../../../../src/modules/ai/ai.service';
import { readImproveResponse, stripModelText } from '../../../../src/modules/ai/ai.client';
import type { AiSettings, AiSettingsRepository } from '../../../../src/modules/ai/ai.types';
import type { AuthenticatedUser } from '../../../../src/modules/users/user.types';

const admin: AuthenticatedUser = { id: 1, role: 'admin' };
const agent: AuthenticatedUser = { id: 2, role: 'agent' };

function repo(items: AiSettings[]): AiSettingsRepository & { items: AiSettings[] } {
  const box = { items: items.map((item) => ({ ...item })) };
  return {
    get items() {
      return box.items;
    },
    list: () => Promise.resolve(box.items.map((item) => ({ ...item }))),
    get: (id) => Promise.resolve(box.items.find((item) => item.id === id) ?? null),
    insert: (settings) => {
      box.items.push({ ...settings });
      return Promise.resolve();
    },
    update: (settings) => {
      const index = box.items.findIndex((item) => item.id === settings.id);
      if (index >= 0) box.items[index] = { ...settings };
      return Promise.resolve();
    },
    remove: (id) => {
      box.items = box.items.filter((item) => item.id !== id);
      return Promise.resolve();
    },
  };
}

const claude: AiSettings = {
  id: 'claude01',
  name: 'Claude',
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiKey: 'sk-ant-9876',
  secretName: '',
  enabled: true,
};

const openai: AiSettings = {
  id: 'openai01',
  name: 'GPT',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'sk-test-1234',
  secretName: '',
  enabled: true,
};

describe('stripModelText', () => {
  it('should drop a markdown fence', () => {
    expect(stripModelText('```html\n<p>Oi</p>\n```')).toBe('<p>Oi</p>');
  });
});

describe('readImproveResponse', () => {
  it('should read an OpenAI chat completion', () => {
    expect(
      readImproveResponse('openai', { choices: [{ message: { content: '<p>Olá</p>' } }] }),
    ).toBe('<p>Olá</p>');
  });

  it('should read an Anthropic message', () => {
    expect(readImproveResponse('anthropic', { content: [{ text: '<p>Olá</p>' }] })).toBe('<p>Olá</p>');
  });
});

describe('AiService', () => {
  it('should hide the api key and keep the last four characters', async () => {
    const service = new AiService(repo([openai]));
    await expect(service.list(admin)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'openai01',
          name: 'GPT',
          hasKey: true,
          keyHint: '••••1234',
        }),
      ],
    });
    const listed = await service.list(admin);
    expect(JSON.stringify(listed)).not.toContain('sk-test-1234');
    await expect(service.list(agent)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('should list only enabled assistants that have a key', async () => {
    const service = new AiService(
      repo([openai, { ...claude, enabled: false }, { ...openai, id: 'semchave', name: 'Sem chave', apiKey: '' }]),
    );
    await expect(service.status(agent)).resolves.toEqual({
      options: [{ id: 'openai01', name: 'GPT' }],
    });
  });

  it('should refuse to enable an assistant without a key', async () => {
    const service = new AiService(repo([]));
    await expect(
      service.create(
        {
          name: 'Claude',
          enabled: true,
          provider: 'anthropic',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-5',
        },
        admin,
      ),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('should refuse a duplicated name', async () => {
    const service = new AiService(repo([claude]));
    await expect(
      service.create(
        {
          name: 'claude',
          enabled: false,
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
        admin,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should call the selected provider and leave the other key unused', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '<p>Texto claro.</p>' } }] }),
    });
    const service = new AiService(repo([claude, openai]), fetchImpl as unknown as typeof fetch);
    await expect(service.improve('<p>texto</p>', 'openai01', agent)).resolves.toEqual({
      text: '<p>Texto claro.</p>',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(String(init.body)).not.toContain('sk-test-1234');
    expect(String(init.body)).not.toContain('sk-ant-9876');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-1234');
  });

  it('should stay off for the ticket button when there is no key', async () => {
    const service = new AiService(repo([{ ...openai, apiKey: '', enabled: true }]));
    await expect(service.status(agent)).resolves.toEqual({ options: [] });
  });

  it('should keep the saved local key and ignore the secret name', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '<p>Texto claro.</p>' } }] }),
    });
    const secrets = { read: jest.fn().mockResolvedValue('sk-from-aws') };
    const service = new AiService(
      repo([{ ...openai, secretName: 'support/openai' }]),
      fetchImpl as unknown as typeof fetch,
      secrets,
      () => 'local',
    );
    await service.improve('<p>texto</p>', 'openai01', agent);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-1234');
    expect(secrets.read).not.toHaveBeenCalled();
  });

  it('should read the hom key from the secret and leave the stored key unused', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '<p>Texto claro.</p>' } }] }),
    });
    const secrets = { read: jest.fn().mockResolvedValue('sk-from-aws') };
    const service = new AiService(
      repo([{ ...openai, secretName: 'support/openai' }]),
      fetchImpl as unknown as typeof fetch,
      secrets,
      () => 'hom',
    );
    await expect(service.status(agent)).resolves.toEqual({ options: [{ id: 'openai01', name: 'GPT' }] });
    await service.improve('<p>texto</p>', 'openai01', agent);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-from-aws');
    expect(String(init.headers)).not.toContain('sk-test-1234');
    expect(secrets.read).toHaveBeenCalledWith('support/openai');
  });

  it('should hide a hom assistant that only has a stored key', async () => {
    const service = new AiService(repo([openai]), fetch, { read: jest.fn() }, () => 'prod');
    await expect(service.status(agent)).resolves.toEqual({ options: [] });
  });

  it('should accept a secret name without storing a new key', async () => {
    const store = repo([]);
    const service = new AiService(store, fetch, { read: jest.fn() }, () => 'hom');
    const created = await service.create(
      {
        name: 'Claude',
        enabled: true,
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        secretName: 'support/claude',
      },
      admin,
    );
    expect(created.secretName).toBe('support/claude');
    expect(created.hasKey).toBe(true);
    expect(created.keyHint).toBe('');
    expect(store.items[0]?.apiKey).toBe('');
    expect(JSON.stringify(created)).not.toContain('sk-');
  });
});

describe('readSecretString', () => {
  it('should read a plain secret and a json api key', () => {
    expect(readSecretString('sk-plain')).toBe('sk-plain');
    expect(readSecretString('{"apiKey":"sk-json"}')).toBe('sk-json');
    expect(readSecretString('{"outro":"valor"}')).toBe('');
  });
});
