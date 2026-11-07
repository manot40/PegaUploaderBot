import { describe, expect, it } from 'bun:test';
import { ApiError, UniportApiClient } from '../src/api';
import { MainBot } from '../src/bot';
import { LicenseManager } from '../src/license';

function createMockPrompts(inputs: { texts?: string[]; passwords?: string[] } = {}) {
  const textQueue = [...(inputs.texts ?? [])];
  const passQueue = [...(inputs.passwords ?? [])];

  return {
    intro: () => {},
    outro: () => {},
    cancel: () => {},
    isCancel: () => false,
    spinner: () => ({
      start: () => {},
      stop: () => {},
      message: () => {},
    }),
    log: {
      info: () => {},
      success: () => {},
      warn: () => {},
      error: () => {},
      message: () => {},
      step: () => {},
    },
    text: async () => textQueue.shift() ?? 'interactive@example.com',
    password: async () => passQueue.shift() ?? 'interactive-pass',
    select: async ({ options }: { options: { value: unknown }[] }) => options[0]?.value,
    confirm: async () => false,
  } as any;
}

describe('MainBot Authentication & Token Reuse Flow', () => {
  it('should auto-login using cached session when BOT_USERNAME is set and cache is valid', async () => {
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    let loginCalled = false;

    const license = new LicenseManager({
      url: 'https://auth.example.com',
      token: 'lic-secret',
      fetchFn: (async (url: string) => {
        if (url.includes('auth-with-password')) {
          return new Response(
            JSON.stringify({
              token: 'pb-jwt',
              record: {
                active: true,
                name: 'Test',
                additional: { latest: '3.0.0', versions: { '3.0.0': true } },
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('mitrabot_sessions')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'rec_1',
                  email: 'env@example.com',
                  token: 'cached-mitra-jwt',
                  cookies: { JSESSIONID: 's1' },
                  expires_at: futureIso,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await license.verify();

    const client = new UniportApiClient();
    client.login = async () => {
      loginCalled = true;
      return 'new-token';
    };
    client.getUserContext = async () => [{ pyCompany: 'ASM', divisionId: 1, departmentId: 2, sectionId: 3 }];

    const bot = new MainBot({
      client,
      license,
      prompts: createMockPrompts(),
      env: { BOT_USERNAME: 'env@example.com' },
      logErrorFn: async () => {},
    });

    const contexts = await bot.authenticateAndFetchContext();
    expect(loginCalled).toBe(false);
    expect(bot.currentUser).toBe('env@example.com');
    expect(bot.usingCachedSession).toBe(true);
    expect(client.identityToken).toBe('cached-mitra-jwt');
    expect(contexts.length).toBe(1);
  });

  it('should skip password prompt during interactive login when a valid cached session exists', async () => {
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    let passwordPrompted = false;

    const license = new LicenseManager({
      url: 'https://auth.example.com',
      token: 'lic-secret',
      fetchFn: (async (url: string) => {
        if (url.includes('auth-with-password')) {
          return new Response(
            JSON.stringify({
              token: 'pb-jwt',
              record: {
                active: true,
                name: 'Test',
                additional: { latest: '3.0.0', versions: { '3.0.0': true } },
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('mitrabot_sessions')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'rec_2',
                  email: 'interactive@example.com',
                  token: 'cached-interactive-jwt',
                  cookies: { JSESSIONID: 's2' },
                  expires_at: futureIso,
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await license.verify();

    const mockPrompts = createMockPrompts({ texts: ['interactive@example.com'] });
    mockPrompts.password = async () => {
      passwordPrompted = true;
      return 'should-not-be-called';
    };

    const client = new UniportApiClient();
    client.getUserContext = async () => [{ pyCompany: 'ASM', divisionId: 1, departmentId: 2, sectionId: 3 }];

    const bot = new MainBot({
      client,
      license,
      prompts: mockPrompts,
      env: {},
      logErrorFn: async () => {},
    });

    const contexts = await bot.authenticateAndFetchContext();
    expect(passwordPrompted).toBe(false);
    expect(bot.currentUser).toBe('interactive@example.com');
    expect(client.identityToken).toBe('cached-interactive-jwt');
    expect(contexts.length).toBe(1);
  });

  it('should fallback to password prompt and update PocketBase when cached session fails with 401 on getUserContext', async () => {
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    let savedSessions = 0;
    let contextCalls = 0;

    const license = new LicenseManager({
      url: 'https://auth.example.com',
      token: 'lic-secret',
      fetchFn: (async (url: string, init?: RequestInit) => {
        if (url.includes('auth-with-password')) {
          return new Response(
            JSON.stringify({
              token: 'pb-jwt',
              record: {
                active: true,
                name: 'Test',
                additional: { latest: '3.0.0', versions: { '3.0.0': true } },
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('mitrabot_sessions') && (!init?.method || init.method === 'GET')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'rec_stale',
                  email: 'stale@example.com',
                  token: 'stale-jwt',
                  cookies: {},
                  expires_at: futureIso,
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('mitrabot_sessions/records/rec_stale') && init?.method === 'PATCH') {
          savedSessions++;
          return new Response(JSON.stringify({ id: 'rec_stale' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await license.verify();

    const client = new UniportApiClient();
    client.login = async (username: string) => {
      client.identityToken = 'fresh-jwt';
      if (client.onSessionUpdate) {
        await client.onSessionUpdate({ username, token: 'fresh-jwt', cookies: { SID: 'fresh' } });
      }
      return 'fresh-jwt';
    };
    client.getUserContext = async () => {
      contextCalls++;
      if (contextCalls === 1) {
        throw new ApiError('Unauthorized', { status: 401, endpoint: '/context' });
      }
      return [{ pyCompany: 'ASM', divisionId: 10, departmentId: 20, sectionId: 30 }];
    };

    const bot = new MainBot({
      client,
      license,
      prompts: createMockPrompts({ passwords: ['fresh-password'] }),
      env: { BOT_USERNAME: 'stale@example.com' },
      logErrorFn: async () => {},
    });

    const contexts = await bot.authenticateAndFetchContext();
    expect(contextCalls).toBe(2);
    expect(savedSessions).toBe(1);
    expect(bot.usingCachedSession).toBe(false);
    expect(client.identityToken).toBe('fresh-jwt');
    expect(contexts[0].divisionId).toBe(10);
  });
});
