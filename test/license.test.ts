import { describe, expect, it } from 'bun:test';
import {
  checkLicense,
  checkNetwork,
  getCachedSession,
  getTokenExpiry,
  isSessionValid,
  LicenseManager,
  saveCachedSession,
  sendTelemetry,
} from '../src/license';

describe('License & Network Verification', () => {
  it('should skip license check when LICENSE_URL or LICENSE_TOKEN is absent or false', async () => {
    const res1 = await checkLicense({ url: '', token: '' });
    expect(res1).toBeUndefined();

    const res2 = await checkLicense({ url: 'false', token: 'false' });
    expect(res2).toBeUndefined();
  });

  it('should succeed when license server returns active === true and version is supported', async () => {
    let capturedBody: string | undefined;
    const mockFetch = async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify({
          token: 'jwt-bearer-token',
          record: {
            name: 'License User A',
            active: true,
            additional: {
              latest: '3.0.0',
              versions: { '3.0.0': true },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await checkLicense({
      url: 'https://auth.example.com',
      token: 'secret-token',
      user: 'custom-user',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result).toBeDefined();
    expect(result?.active).toBe(true);
    expect(result?.name).toBe('License User A');
    expect(result?.version).toBe('3.0.0');
    expect(result?.token).toBe('jwt-bearer-token');
    expect(JSON.parse(capturedBody!)).toEqual({
      identity: 'custom-user',
      password: 'secret-token',
    });
  });

  it('should use LICENSE_USER from process.env when user option is omitted', async () => {
    let capturedBody: string | undefined;
    const prevUser = process.env.LICENSE_USER;
    process.env.LICENSE_USER = 'env-license-user';
    try {
      const mockFetch = async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            token: 'jwt-token',
            record: {
              name: 'Env User',
              active: true,
              additional: {
                latest: '3.0.0',
                versions: { '3.0.0': true },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      await checkLicense({
        url: 'https://auth.example.com',
        token: 'secret-token',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(JSON.parse(capturedBody!)).toEqual({
        identity: 'env-license-user',
        password: 'secret-token',
      });
    } finally {
      process.env.LICENSE_USER = prevUser;
    }
  });

  it('should throw ApiError with status when license credentials are rejected', async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ message: 'Failed to authenticate.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });

    expect(
      checkLicense({
        url: 'https://auth.example.com',
        token: 'invalid-token',
        user: 'invalid-user',
        fetchFn: mockFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Gagal verifikasi status bot: Kredensial lisensi tidak valid.');
  });

  it('should throw error when bot version is not supported in license versions', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          record: {
            name: 'License User C',
            active: true,
            additional: {
              latest: '4.0.0',
              versions: { '3.0.0': false },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    expect(
      checkLicense({
        url: 'https://auth.example.com',
        token: 'secret-token',
        fetchFn: mockFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Silakan hubungi pengembang.');
  });

  it('should throw error when license additional metadata or versions is missing', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          record: {
            name: 'License User D',
            active: true,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    expect(
      checkLicense({
        url: 'https://auth.example.com',
        token: 'secret-token',
        fetchFn: mockFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Silakan hubungi pengembang.');
  });

  it('should send telemetry with bearer token when license is valid', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response('{}', { status: 200 });
    };

    await sendTelemetry(
      { user: 'user@example.com', job_name: 'Input Data', job_count: 5 },
      { url: 'https://auth.example.com/', token: 'jwt-bearer-token', fetchFn: mockFetch as unknown as typeof fetch },
    );

    expect(capturedUrl).toBe('https://auth.example.com/api/collections/mitrabot_tracing/records');
    expect(capturedInit?.method).toBe('POST');
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer jwt-bearer-token');
    expect(headers.get('user-agent')).toContain('Mozilla/5.0');
    expect(headers.get('sec-ch-ua')).toContain('Google Chrome');
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      user: 'user@example.com',
      job_name: 'Input Data',
      job_count: 5,
    });
  });

  it('should throw error when license server returns active !== true', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          record: {
            name: 'License User B',
            active: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    expect(
      checkLicense({
        url: 'https://auth.example.com',
        token: 'secret-token',
        fetchFn: mockFetch as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Silakan hubungi pengembang.');
  });

  it('should check network reachability successfully', async () => {
    const mockFetch = async () => new Response('OK', { status: 200 });
    const ok = await checkNetwork('https://hcq.payrollq.id', {
      maxRetries: 1,
      timeoutMs: 1000,
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
  });

  it('should retry network check on failure', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls++;
      if (calls === 1) throw new Error('Timeout');
      return new Response('OK', { status: 200 });
    };

    const ok = await checkNetwork('https://hcq.payrollq.id', {
      maxRetries: 2,
      timeoutMs: 1000,
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    expect(ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('should decode exp from JWT token correctly in getTokenExpiry', () => {
    const futureSec = Math.floor(Date.now() / 1000) + 3600;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: futureSec, sub: 'user123' })).toString('base64url');
    const dummyJwt = `${header}.${payload}.signature`;

    const expiryIso = getTokenExpiry(dummyJwt);
    expect(expiryIso).toBe(new Date(futureSec * 1000).toISOString());
  });

  it('should fallback to TTL in getTokenExpiry when token is invalid or lacks exp', () => {
    const before = Date.now();
    const expiryIso = getTokenExpiry('not-a-jwt', 5000);
    const after = Date.now();
    const parsed = Date.parse(expiryIso);
    expect(parsed).toBeGreaterThanOrEqual(before + 5000);
    expect(parsed).toBeLessThanOrEqual(after + 5000);
  });

  it('should correctly check isSessionValid with safety buffer', () => {
    const now = Date.now();
    expect(isSessionValid(null)).toBe(false);
    expect(isSessionValid({ token: '', expires_at: new Date(now + 100000).toISOString() })).toBe(false);
    expect(isSessionValid({ token: 'tok', expires_at: 'invalid-date' })).toBe(false);

    // Expired
    expect(isSessionValid({ token: 'tok', expires_at: new Date(now - 1000).toISOString() })).toBe(false);

    // Within buffer (e.g. expires in 30s when buffer is 60s)
    expect(isSessionValid({ token: 'tok', expires_at: new Date(now + 30000).toISOString() }, 60000)).toBe(false);

    // Valid (expires in 120s when buffer is 60s)
    expect(isSessionValid({ token: 'tok', expires_at: new Date(now + 120000).toISOString() }, 60000)).toBe(true);
  });

  it('should query getCachedSession and return session record or null', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> | undefined;

    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers as Record<string, string>;
      if (url.includes('target%40example.com') || url.includes('target@example.com')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'rec_123',
                email: 'target@example.com',
                token: 'cached-token-abc',
                cookies: { session_id: 'sess-xyz' },
                expires_at: '2026-11-06T00:00:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const empty = await getCachedSession('user@example.com', { url: '', token: '' });
    expect(empty).toBeNull();

    const notFound = await getCachedSession('notfound@example.com', {
      url: 'https://auth.example.com',
      token: 'jwt-bearer',
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    expect(notFound).toBeNull();
    expect(capturedUrl).toContain('/api/collections/mitrabot_sessions/records');
    expect(capturedHeaders?.Authorization).toBe('Bearer jwt-bearer');

    const found = await getCachedSession('target@example.com', {
      url: 'https://auth.example.com',
      token: 'jwt-bearer',
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    expect(found).toBeDefined();
    expect(found?.id).toBe('rec_123');
    expect(found?.token).toBe('cached-token-abc');
    expect(found?.cookies).toEqual({ session_id: 'sess-xyz' });
  });

  it('should saveCachedSession using PATCH when existingId is provided', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: any;

    const mockFetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedMethod = init?.method || '';
      capturedBody = JSON.parse(init?.body as string);
      return new Response('{}', { status: 200 });
    };

    await saveCachedSession(
      {
        email: 'user@example.com',
        token: 'new-token',
        cookies: '{"sess":"abc"}',
        expires_at: '2026-11-06T00:00:00.000Z',
      },
      'rec_123',
      {
        url: 'https://auth.example.com',
        token: 'jwt-bearer',
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    );

    expect(capturedUrl).toBe('https://auth.example.com/api/collections/mitrabot_sessions/records/rec_123');
    expect(capturedMethod).toBe('PATCH');
    expect(capturedBody).toEqual({
      email: 'user@example.com',
      token: 'new-token',
      cookies: { sess: 'abc' },
      expires_at: '2026-11-06T00:00:00.000Z',
    });
  });

  it('should saveCachedSession using POST when no existing record exists', async () => {
    let calls = 0;
    let postUrl = '';
    let postMethod = '';
    let postBody: any;

    const mockFetch = async (url: string, init?: RequestInit) => {
      calls++;
      if (init?.method === 'GET' || !init?.method) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      postUrl = url;
      postMethod = init?.method || '';
      postBody = JSON.parse(init?.body as string);
      return new Response('{}', { status: 200 });
    };

    await saveCachedSession(
      {
        email: 'newuser@example.com',
        token: 'first-token',
        cookies: { auth: 'val' },
        expires_at: '2026-11-06T00:00:00.000Z',
      },
      undefined,
      {
        url: 'https://auth.example.com',
        token: 'jwt-bearer',
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    );

    expect(calls).toBe(2); // 1 GET check, 1 POST
    expect(postUrl).toBe('https://auth.example.com/api/collections/mitrabot_sessions/records');
    expect(postMethod).toBe('POST');
    expect(postBody.email).toBe('newuser@example.com');
    expect(postBody.cookies).toEqual({ auth: 'val' });
  });

  it('should manage license verification, session record ID caching, and telemetry via LicenseManager', async () => {
    const requests: { url: string; method: string; body?: any }[] = [];
    const expiredIso = new Date(Date.now() - 60_000).toISOString();

    const mockFetch = async (url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      requests.push({ url, method, body });

      if (url.endsWith('/api/collections/users/auth-with-password')) {
        return new Response(
          JSON.stringify({
            token: 'pb-auth-token',
            record: {
              name: 'Licensed Org',
              active: true,
              additional: { latest: '3.0.0', versions: { '3.0.0': true } },
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes('/api/collections/mitrabot_sessions/records') && method === 'GET') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'existing_rec_99',
                email: 'user@example.com',
                token: 'old-expired-token',
                cookies: { sid: 'old' },
                expires_at: expiredIso,
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ id: 'existing_rec_99' }), { status: 200 });
    };

    const manager = new LicenseManager({
      url: 'https://auth.example.com',
      token: 'secret-key',
      user: 'manager-user',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(manager.isActive).toBe(false);
    const info = await manager.verify();
    expect(manager.isActive).toBe(true);
    expect(info?.name).toBe('Licensed Org');
    const authReq = requests.find((r) => r.url.endsWith('/auth-with-password'));
    expect(authReq?.body).toEqual({ identity: 'manager-user', password: 'secret-key' });

    // Expired session returns null, but caches existing_rec_99 internally
    const validSession = await manager.getValidSession('user@example.com');
    expect(validSession).toBeNull();

    // Subsequent saveSession uses PATCH on existing_rec_99 without another GET
    await manager.saveSession('user@example.com', 'new-jwt-token', { sid: 'new' });
    const patchReq = requests.find((r) => r.method === 'PATCH');
    expect(patchReq).toBeDefined();
    expect(patchReq?.url).toBe('https://auth.example.com/api/collections/mitrabot_sessions/records/existing_rec_99');
    expect(patchReq?.body.token).toBe('new-jwt-token');

    // Telemetry uses the stored token
    await manager.sendTelemetry('user@example.com', 'Job A', 3);
    const telemetryReq = requests.find((r) => r.url.includes('/mitrabot_tracing/records'));
    expect(telemetryReq).toBeDefined();
    expect(telemetryReq?.body).toEqual({ user: 'user@example.com', job_name: 'Job A', job_count: 3 });
  });
});
