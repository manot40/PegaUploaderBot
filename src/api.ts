import { createDPoPClient } from './dpop';
import { ApiError, type ApiErrorOptions } from './error';
import { createBrowserHeaders } from './headers';

export { ApiError, type ApiErrorOptions };

export interface UserContextOption {
  pyCompany: string;
  divisionId: number;
  divisionCode?: string;
  departmentId: number;
  departmentCode?: string;
  sectionId: number;
  sectionCode?: string;
}

export interface ActivityItem {
  id: number;
  activityName: string;
}

export interface FinishActivityInput {
  caseNumber: string;
  keterangan: string;
  file: Blob;
  fileName: string;
}

export interface SessionUpdateEvent {
  username: string;
  token: string;
  cookies: Record<string, string>;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  onSessionUpdate?: (event: SessionUpdateEvent) => void | Promise<void>;
}

export interface ApiRequestOptions extends RequestInit {
  isRetry?: boolean;
  skipAuthRetry?: boolean;
  skipAuthToken?: boolean;
  referer?: string;
}

export class UniportApiClient {
  public baseUrl: string;
  private fetchFn: typeof fetch;
  public onSessionUpdate?: (event: SessionUpdateEvent) => void | Promise<void>;

  private credentials: { username: string; password: string } | null = null;
  public identityToken: string | null = null;
  private cookies: Map<string, string> = new Map();

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.BOT_URL || 'https://hcq.payrollq.id').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn || fetch;
    this.onSessionUpdate = options.onSessionUpdate;
  }

  getCookiesObject(): Record<string, string> {
    return Object.fromEntries(this.cookies.entries());
  }

  restoreSession(token: string, cookies?: Record<string, string> | string): void {
    this.identityToken = token;
    this.cookies.clear();
    if (cookies) {
      if (typeof cookies === 'string') {
        try {
          const parsed = JSON.parse(cookies);
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'string') this.cookies.set(k, v);
            }
          }
        } catch {
          // ignore invalid json
        }
      } else if (typeof cookies === 'object') {
        for (const [k, v] of Object.entries(cookies)) {
          if (typeof v === 'string') this.cookies.set(k, v);
        }
      }
    }
  }

  private updateCookies(response: Response) {
    const rawCookies = response.headers.get('set-cookie');
    if (!rawCookies) return;

    // Split on comma only if followed by cookie-name= pattern
    const splitCookies = rawCookies.split(/,(?=[^;]+=[^;]+)/g);
    for (const c of splitCookies) {
      const parts = c.trim().split(';')[0]!.split('=');
      if (parts.length >= 2) {
        const name = parts[0]?.trim();
        const value = parts.slice(1).join('=').trim();
        if (name && value) {
          this.cookies.set(name, value);
        }
      }
    }
  }

  private getCookieHeader(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private async request(endpoint: string, options: ApiRequestOptions = {}): Promise<Response> {
    const {
      isRetry = false,
      skipAuthRetry = false,
      skipAuthToken = false,
      referer,
      headers: initHeaders,
      ...fetchInit
    } = options;

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const customHeaders: Record<string, string> = {};
    if (initHeaders) {
      if (initHeaders instanceof Headers) {
        initHeaders.forEach((val, key) => {
          customHeaders[key] = val;
        });
      } else if (Array.isArray(initHeaders)) {
        for (const [key, val] of initHeaders) {
          if (typeof val == 'string') customHeaders[key!] = val;
        }
      } else {
        Object.assign(customHeaders, initHeaders);
      }
    }

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader && !customHeaders['cookie']) {
      customHeaders['cookie'] = cookieHeader;
    }

    if (!skipAuthToken && this.identityToken && !customHeaders['authorization']) {
      customHeaders['authorization'] = `Bearer ${this.identityToken}`;
    }

    const headers = createBrowserHeaders({
      url,
      origin: this.baseUrl,
      referer: referer ?? `${this.baseUrl}/mitra/input-aktivitas-mitra`,
      headers: customHeaders,
    });

    const response = await this.fetchFn(url, {
      ...fetchInit,
      headers,
    });

    this.updateCookies(response);

    if (response.status === 401 && !isRetry && !skipAuthRetry && this.credentials) {
      // Token expired, re-authenticate and retry once
      await this.login(this.credentials.username, this.credentials.password);
      return this.request(endpoint, { ...options, isRetry: true });
    }

    return response;
  }

  private async assertOk(res: Response, endpoint: string, message: string): Promise<void> {
    if (res.ok) return;
    const payload = await res.text().catch(() => '');
    throw new ApiError(message, {
      status: res.status,
      payload,
      endpoint,
    });
  }

  async login(username: string, password: string): Promise<string> {
    this.credentials = { username, password };
    const dpopClient = await createDPoPClient();
    const loginReferer = `${this.baseUrl}/login`;

    // 1. Create session
    const createSessEndpoint = '/api/uniport/create-session';
    const createSessRes = await this.request(createSessEndpoint, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
      },
      body: null,
      skipAuthRetry: true,
      skipAuthToken: true,
      referer: loginReferer,
    });

    await this.assertOk(createSessRes, createSessEndpoint, `Gagal membuat sesi Uniport: HTTP ${createSessRes.status}`);
    const sessData = (await createSessRes.json()) as { sessionId: string };
    const sessionId = sessData.sessionId;

    // 2. Check session
    const checkSessEndpoint = '/api/uniport/check-session';
    const checkSessRes = await this.request(`${checkSessEndpoint}?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { accept: '*/*' },
      skipAuthRetry: true,
      skipAuthToken: true,
      referer: loginReferer,
    });

    await this.assertOk(
      checkSessRes,
      checkSessEndpoint,
      `Gagal memeriksa status sesi Uniport: HTTP ${checkSessRes.status}`,
    );

    // 3. Login password
    const loginEndpoint = '/api/uniport/login-password';
    const loginRes = await this.request(loginEndpoint, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        login: username,
        password,
      }),
      skipAuthRetry: true,
      skipAuthToken: true,
      referer: loginReferer,
    });

    await this.assertOk(
      loginRes,
      loginEndpoint,
      `Kredensial login tidak valid (${loginRes.status}): Username atau password salah`,
    );

    const loginData = (await loginRes.json()) as { status: string };
    if (loginData.status !== 'verified') {
      const message = `Autentikasi gagal: status sesi '${loginData.status}'`;
      throw new ApiError(message, {
        status: 200,
        payload: JSON.stringify(loginData),
        endpoint: loginEndpoint,
      });
    }

    // 4. Consume session with DPoP
    const consumeEndpoint = '/api/uniport/consume-session';
    const consumeHtu = `${this.baseUrl}${consumeEndpoint}`;
    const consumeProof = await dpopClient.generateProof({
      htm: 'POST',
      htu: consumeHtu,
    });

    const consumeRes = await this.request(consumeEndpoint, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        dpop: consumeProof,
      },
      body: JSON.stringify({ sessionId }),
      skipAuthRetry: true,
      skipAuthToken: true,
      referer: loginReferer,
    });

    await this.assertOk(consumeRes, consumeEndpoint, `Gagal mengonsumsi sesi: HTTP ${consumeRes.status}`);
    const consumeData = (await consumeRes.json()) as { identityToken: string };
    const handoffToken = consumeData.identityToken;

    // 5. Handoff token with DPoP + ath
    const endpoint = '/api/uniport/handoff-token';
    const handoffHtu = `${this.baseUrl}${endpoint}`;
    const handoffProof = await dpopClient.generateProof({
      htm: 'POST',
      htu: handoffHtu,
      accessToken: handoffToken,
    });

    const handoffRes = await this.request(endpoint, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        authorization: `Bearer ${handoffToken}`,
        dpop: handoffProof,
      },
      body: JSON.stringify({ as: 'token', tenantId: 'MITRA', monolithKey: 'hcqxpayrollq' }),
      skipAuthRetry: true,
      skipAuthToken: true,
      referer: loginReferer,
    });

    await this.assertOk(handoffRes, endpoint, `Gagal menukarkan token handoff Mitra: HTTP ${handoffRes.status}`);
    const handoffData = (await handoffRes.json()) as { identityToken: string };
    this.identityToken = handoffData.identityToken;

    if (this.onSessionUpdate && this.identityToken) {
      await Promise.resolve(
        this.onSessionUpdate({
          username,
          token: this.identityToken,
          cookies: this.getCookiesObject(),
        }),
      );
    }

    return this.identityToken;
  }

  async getUserContext(): Promise<UserContextOption[]> {
    const endpoint = '/api/mitra/v1/aktivitas-mitra/mulai/context';
    const res = await this.withRetry(() =>
      this.request(endpoint, {
        method: 'GET',
        headers: {
          accept: '*/*',
          'x-action': 'Masuk',
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
      }),
    );

    await this.assertOk(res, endpoint, `Gagal mengambil konteks pengguna: HTTP ${res.status}`);

    const data = (await res.json()) as { options: UserContextOption[] };
    return data.options || [];
  }

  async getActivities(ctx: UserContextOption): Promise<ActivityItem[]> {
    const params = new URLSearchParams({
      pyCompany: ctx.pyCompany,
      divisionId: String(ctx.divisionId),
      departmentId: String(ctx.departmentId),
      sectionId: String(ctx.sectionId),
    });

    const endpoint = `/api/mitra/v1/aktivitas-mitra/mulai/activities?${params.toString()}`;
    const res = await this.withRetry(() =>
      this.request(endpoint, {
        method: 'GET',
        headers: {
          accept: '*/*',
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
      }),
    );

    await this.assertOk(res, endpoint, `Gagal mengambil daftar aktivitas: HTTP ${res.status}`);

    const data = (await res.json()) as { items: ActivityItem[] };
    return data.items || [];
  }

  async startActivity(ctx: UserContextOption, activityId: number): Promise<string> {
    const endpoint = '/api/mitra/v1/aktivitas-mitra/mulai';
    const res = await this.withRetry(() =>
      this.request(endpoint, {
        method: 'POST',
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          'x-action': 'Mulai',
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
        body: JSON.stringify({ ...ctx, activityId }),
      }),
    );

    await this.assertOk(res, endpoint, `Gagal memulai aktivitas: HTTP ${res.status}`);

    const data = (await res.json()) as { caseNumber: string };
    return data.caseNumber;
  }

  async finishActivity(input: FinishActivityInput): Promise<{ id: string; caseId: string }> {
    const endpoint = '/api/mitra/v1/aktivitas-mitra/selesai';
    const res = await this.withRetry(() => {
      const formData = new FormData();
      formData.set('caseNumber', input.caseNumber);
      formData.set('keterangan', input.keterangan);
      formData.set('file', input.file, input.fileName);

      return this.request(endpoint, {
        method: 'POST',
        headers: {
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
        body: formData,
      });
    });

    await this.assertOk(res, endpoint, `Gagal menyelesaikan aktivitas (${input.caseNumber}): HTTP ${res.status}`);

    const data = (await res.json()) as { id: string; caseId: string };
    return data;
  }

  async uploadSingleFile(
    ctx: UserContextOption,
    activityId: number,
    keterangan: string,
    fileBlob: Blob,
    fileName: string,
  ): Promise<{ caseNumber: string; id: string }> {
    // Acquire caseNumber first
    const caseNumber = await this.startActivity(ctx, activityId);

    // If finishActivity fails, withRetry inside finishActivity reuses the existing caseNumber!
    const finishResult = await this.finishActivity({
      caseNumber,
      keterangan,
      file: fileBlob,
      fileName,
    });

    return { caseNumber, id: finishResult.id };
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const result = await fn();
        if (result instanceof Response && result.status >= 500) {
          const payload = await result.text().catch(() => '');
          const message = `HTTP ${result.status}`;
          throw new ApiError(message, {
            status: result.status,
            payload,
            endpoint: result.url,
          });
        }
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 500));
        }
      }
    }

    throw lastError;
  }
}
