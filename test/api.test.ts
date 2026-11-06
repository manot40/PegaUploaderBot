import { describe, expect, it } from 'bun:test';
import { ApiError, UniportApiClient } from '../src/api';

describe('UniportApiClient', () => {
  it('should successfully authenticate through Uniport with DPoP', async () => {
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/uniport/create-session')) {
        return new Response(JSON.stringify({ sessionId: 'sess-1234' }), { status: 200 });
      }
      if (url.includes('/api/uniport/check-session')) {
        return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
      }
      if (url.includes('/api/uniport/login-password')) {
        const body = JSON.parse(String(init?.body));
        if (body.password === 'correct-pass') {
          return new Response(JSON.stringify({ status: 'verified' }), { status: 200 });
        }
        return new Response('Password salah', { status: 400 });
      }
      if (url.includes('/api/uniport/consume-session')) {
        const dpop = new Headers(init?.headers).get('dpop');
        expect(dpop).toBeDefined();
        return new Response(JSON.stringify({ identityToken: 'handoff-tok-abc' }), { status: 200 });
      }
      if (url.includes('/api/uniport/handoff-token')) {
        const auth = new Headers(init?.headers).get('authorization');
        const dpop = new Headers(init?.headers).get('dpop');
        expect(auth).toBe('Bearer handoff-tok-abc');
        expect(dpop).toBeDefined();
        return new Response(JSON.stringify({ identityToken: 'mitra-jwt-xyz789' }), {
          status: 200,
          headers: { 'set-cookie': 'JSESSIONID=sess_abc; Path=/; HttpOnly' },
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      baseUrl: 'https://hcq.payrollq.id',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const token = await client.login('testuser@example.com', 'correct-pass');
    expect(token).toBe('mitra-jwt-xyz789');
    expect(client.identityToken).toBe('mitra-jwt-xyz789');
  });

  it('should reject invalid login credentials with descriptive error and attach payload', async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/uniport/create-session')) {
        return new Response(JSON.stringify({ sessionId: 'sess-1234' }), { status: 200 });
      }
      if (url.includes('/api/uniport/check-session')) {
        return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
      }
      if (url.includes('/api/uniport/login-password')) {
        return new Response('Invalid username or password', { status: 401 });
      }
      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    let caughtError: unknown;
    try {
      await client.login('user', 'wrong-pass');
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiError);
    const apiErr = caughtError as ApiError;
    expect(apiErr.status).toBe(401);
    expect(apiErr.payload).toBe('Invalid username or password');
    expect(apiErr.message).toBe('Kredensial login tidak valid (401): Username atau password salah');
    expect(apiErr.message).not.toContain('Invalid username or password');
  });

  it('should fetch user context and activities', async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/mitra/v1/aktivitas-mitra/mulai/context')) {
        return new Response(
          JSON.stringify({
            options: [
              {
                pyCompany: 'ASM',
                divisionId: 76,
                departmentId: 525,
                sectionId: 176,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/mitra/v1/aktivitas-mitra/mulai/activities')) {
        expect(url).toContain('pyCompany=ASM');
        expect(url).toContain('divisionId=76');
        return new Response(
          JSON.stringify({
            items: [
              { id: 101, activityName: 'Aktivitas 1' },
              { id: 102, activityName: 'Aktivitas 2' },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    client.identityToken = 'valid-token';

    const contexts = await client.getUserContext();
    expect(contexts.length).toBe(1);
    expect(contexts[0].pyCompany).toBe('ASM');

    const activities = await client.getActivities(contexts[0]);
    expect(activities.length).toBe(2);
    expect(activities[0].activityName).toBe('Aktivitas 1');
  });

  it('should preserve caseNumber and retry finishActivity on transient failure', async () => {
    let mulaiCalls = 0;
    let selesaiCalls = 0;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        url.includes('/api/mitra/v1/aktivitas-mitra/mulai') &&
        !url.includes('context') &&
        !url.includes('activities')
      ) {
        mulaiCalls++;
        return new Response(JSON.stringify({ caseNumber: 'CASE-999' }), { status: 200 });
      }
      if (url.includes('/api/mitra/v1/aktivitas-mitra/selesai')) {
        selesaiCalls++;
        if (selesaiCalls === 1) {
          return new Response('Gateway Timeout', { status: 504 });
        }
        const formData = init?.body as FormData;
        expect(formData.get('caseNumber')).toBe('CASE-999');
        expect(formData.get('keterangan')).toBe('Test Keterangan');
        return new Response(JSON.stringify({ id: 'rec-uuid-1', caseId: 'CASE-999' }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    client.identityToken = 'valid-token';

    const userCtx = { pyCompany: 'ASM', divisionId: 76, departmentId: 525, sectionId: 176 };
    const dummyBlob = new Blob(['test'], { type: 'image/jpeg' });

    const result = await client.uploadSingleFile(userCtx, 101, 'Test Keterangan', dummyBlob, 'photo.jpg');

    expect(mulaiCalls).toBe(1); // Only called once!
    expect(selesaiCalls).toBe(2); // Retried once with same caseNumber
    expect(result.caseNumber).toBe('CASE-999');
    expect(result.id).toBe('rec-uuid-1');
  });

  it('should automatically re-authenticate and retry request on 401 Unauthorized', async () => {
    let requestCalls = 0;
    let loginCalls = 0;

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/uniport/')) {
        if (url.includes('create-session')) return new Response(JSON.stringify({ sessionId: 's1' }), { status: 200 });
        if (url.includes('check-session')) return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
        if (url.includes('login-password'))
          return new Response(JSON.stringify({ status: 'verified' }), { status: 200 });
        if (url.includes('consume-session'))
          return new Response(JSON.stringify({ identityToken: 'h1' }), { status: 200 });
        if (url.includes('handoff-token')) {
          loginCalls++;
          return new Response(JSON.stringify({ identityToken: `new-mitra-token-${loginCalls}` }), { status: 200 });
        }
      }

      if (url.includes('/api/mitra/v1/aktivitas-mitra/mulai/context')) {
        requestCalls++;
        if (requestCalls === 1) {
          // Token expired!
          return new Response('Unauthorized', { status: 401 });
        }
        return new Response(JSON.stringify({ options: [] }), { status: 200 });
      }

      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    // Initial login
    await client.login('user@test.com', 'pass');
    expect(loginCalls).toBe(1);

    // Call context which returns 401, triggers re-login, and retries successfully
    const ctx = await client.getUserContext();
    expect(ctx).toEqual([]);
    expect(loginCalls).toBe(2); // Re-authenticated
    expect(requestCalls).toBe(2); // Retried request
  });

  it('should throw ApiError with payload when finishActivity fails', async () => {
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/mitra/v1/aktivitas-mitra/selesai')) {
        return new Response('{"error": "CASE_CLOSED", "message": "Case has already been submitted"}', {
          status: 400,
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    client.identityToken = 'valid-token';

    let caught: unknown;
    try {
      await client.finishActivity({
        caseNumber: 'CASE-101',
        keterangan: 'Kunjungan',
        file: new Blob(['data']),
        fileName: 'test.jpg',
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as ApiError;
    expect(apiErr.status).toBe(400);
    expect(apiErr.payload).toContain('CASE_CLOSED');
    expect(apiErr.message).toBe('Gagal menyelesaikan aktivitas (CASE-101): HTTP 400');
    expect(apiErr.message).not.toContain('CASE_CLOSED');
  });

  it('should restore session and send Authorization and Cookie headers on subsequent requests', async () => {
    let capturedHeaders: Headers | undefined;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ options: [] }), { status: 200 });
    };

    const client = new UniportApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    // Test restoring from object
    client.restoreSession('restored-jwt-token', { JSESSIONID: 'abc-session', token: 'xyz' });
    expect(client.identityToken).toBe('restored-jwt-token');
    expect(client.getCookiesObject()).toEqual({ JSESSIONID: 'abc-session', token: 'xyz' });

    await client.getUserContext();
    expect(capturedHeaders?.get('authorization')).toBe('Bearer restored-jwt-token');
    expect(capturedHeaders?.get('cookie')).toBe('JSESSIONID=abc-session; token=xyz');

    // Test restoring from JSON string
    client.restoreSession('new-jwt-token', JSON.stringify({ custom_cookie: '123' }));
    expect(client.identityToken).toBe('new-jwt-token');
    expect(client.getCookiesObject()).toEqual({ custom_cookie: '123' });

    await client.getUserContext();
    expect(capturedHeaders?.get('authorization')).toBe('Bearer new-jwt-token');
    expect(capturedHeaders?.get('cookie')).toBe('custom_cookie=123');
  });

  it('should invoke onSessionUpdate when login or mid-session 401 refresh succeeds', async () => {
    const events: { username: string; token: string; cookies: Record<string, string> }[] = [];
    let handoffCount = 0;

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/uniport/create-session')) {
        return new Response(JSON.stringify({ sessionId: 's1' }), { status: 200 });
      }
      if (url.includes('/api/uniport/check-session')) {
        return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
      }
      if (url.includes('/api/uniport/login-password')) {
        return new Response(JSON.stringify({ status: 'verified' }), { status: 200 });
      }
      if (url.includes('/api/uniport/consume-session')) {
        return new Response(JSON.stringify({ identityToken: 'h1' }), { status: 200 });
      }
      if (url.includes('/api/uniport/handoff-token')) {
        handoffCount++;
        return new Response(JSON.stringify({ identityToken: `jwt-${handoffCount}` }), {
          status: 200,
          headers: { 'set-cookie': `SID=cookie-${handoffCount}; Path=/` },
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      onSessionUpdate: (ev) => {
        events.push(ev);
      },
    });

    await client.login('alice@example.com', 'secret');
    expect(events).toEqual([
      {
        username: 'alice@example.com',
        token: 'jwt-1',
        cookies: { SID: 'cookie-1' },
      },
    ]);
  });

  it('should include full real browser headers in every request made by UniportApiClient', async () => {
    const capturedHeadersList: Headers[] = [];

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      capturedHeadersList.push(new Headers(init?.headers));

      if (url.includes('/api/uniport/create-session'))
        return new Response(JSON.stringify({ sessionId: 's1' }), { status: 200 });
      if (url.includes('/api/uniport/check-session'))
        return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
      if (url.includes('/api/uniport/login-password'))
        return new Response(JSON.stringify({ status: 'verified' }), { status: 200 });
      if (url.includes('/api/uniport/consume-session'))
        return new Response(JSON.stringify({ identityToken: 'h1' }), { status: 200 });
      if (url.includes('/api/uniport/handoff-token'))
        return new Response(JSON.stringify({ identityToken: 'tok123' }), { status: 200 });
      if (url.includes('/api/mitra/v1/aktivitas-mitra/mulai/context'))
        return new Response(JSON.stringify({ options: [] }), { status: 200 });

      return new Response('Not found', { status: 404 });
    };

    const client = new UniportApiClient({
      baseUrl: 'https://hcq.payrollq.id',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.login('user@test.com', 'pass123');
    await client.getUserContext();

    expect(capturedHeadersList.length).toBe(6); // 5 login steps + 1 context call

    for (const headers of capturedHeadersList) {
      expect(headers.get('user-agent')).toContain('Mozilla/5.0');
      expect(headers.get('user-agent')).toContain('Chrome/');
      expect(headers.get('sec-ch-ua')).toContain('Google Chrome');
      expect(headers.get('sec-ch-ua-mobile')).toBe('?0');
      expect(headers.get('sec-ch-ua-platform')).toBe('"Windows"');
      expect(headers.get('sec-fetch-dest')).toBe('empty');
      expect(headers.get('sec-fetch-mode')).toBe('cors');
      expect(headers.get('sec-fetch-site')).toBe('same-origin');
      expect(headers.get('accept-language')).toBe('id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7');
      expect(headers.get('origin')).toBe('https://hcq.payrollq.id');
    }

    // Login steps should refer to /login
    for (let i = 0; i < 5; i++) {
      expect(capturedHeadersList[i].get('referer')).toBe('https://hcq.payrollq.id/login');
    }

    // Mitra steps should refer to /mitra/input-aktivitas-mitra
    expect(capturedHeadersList[5].get('referer')).toBe('https://hcq.payrollq.id/mitra/input-aktivitas-mitra');
  });
});
