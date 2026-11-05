import { createDPoPClient } from './dpop';

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

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class MitraApiClient {
  public baseUrl: string;
  private fetchFn: typeof fetch;

  private credentials: { username: string; password: string } | null = null;
  public identityToken: string | null = null;
  private cookies: Map<string, string> = new Map();

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.BOT_URL || 'https://hcq.payrollq.id').replace(/\/+$/, '');
    this.fetchFn = options.fetchFn || fetch;
  }

  private updateCookies(response: Response) {
    const rawCookies = response.headers.get('set-cookie');
    if (!rawCookies) return;

    // Split on comma only if followed by cookie-name= pattern
    const splitCookies = rawCookies.split(/,(?=[^;]+=[^;]+)/g);
    for (const c of splitCookies) {
      const parts = c.trim().split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
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

  private async request(endpoint: string, init: RequestInit, isRetry = false): Promise<Response> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const headers = new Headers(init.headers);

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader && !headers.has('cookie')) {
      headers.set('cookie', cookieHeader);
    }

    if (this.identityToken && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${this.identityToken}`);
    }

    const response = await this.fetchFn(url, {
      ...init,
      headers,
    });

    this.updateCookies(response);

    if (response.status === 401 && !isRetry && this.credentials) {
      // Token expired, re-authenticate and retry once
      await this.login(this.credentials.username, this.credentials.password);
      return this.request(endpoint, init, true);
    }

    return response;
  }

  async login(username: string, password: string): Promise<string> {
    this.credentials = { username, password };
    const dpopClient = await createDPoPClient();

    // 1. Create session
    const createSessRes = await this.fetchFn(`${this.baseUrl}/api/uniport/create-session`, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
      },
      body: null,
    });
    if (!createSessRes.ok) {
      throw new Error(`Gagal membuat sesi Uniport: HTTP ${createSessRes.status}`);
    }
    const sessData = (await createSessRes.json()) as { sessionId: string };
    const sessionId = sessData.sessionId;

    // 2. Check session
    const checkSessRes = await this.fetchFn(
      `${this.baseUrl}/api/uniport/check-session?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: { accept: '*/*' },
      },
    );
    if (!checkSessRes.ok) {
      throw new Error(`Gagal memeriksa status sesi Uniport: HTTP ${checkSessRes.status}`);
    }

    // 3. Login password
    const loginRes = await this.fetchFn(`${this.baseUrl}/api/uniport/login-password`, {
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
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text().catch(() => '');
      throw new Error(
        `Kredensial login tidak valid (${loginRes.status}): ${errText || 'Username atau password salah'}`,
      );
    }

    const loginData = (await loginRes.json()) as { status: string };
    if (loginData.status !== 'verified') {
      throw new Error(`Autentikasi gagal: status sesi '${loginData.status}'`);
    }

    // 4. Consume session with DPoP
    const consumeHtu = `${this.baseUrl}/api/uniport/consume-session`;
    const consumeProof = await dpopClient.generateProof({
      htm: 'POST',
      htu: consumeHtu,
    });

    const consumeRes = await this.fetchFn(consumeHtu, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        dpop: consumeProof,
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!consumeRes.ok) {
      throw new Error(`Gagal mengonsumsi sesi: HTTP ${consumeRes.status}`);
    }
    this.updateCookies(consumeRes);
    const consumeData = (await consumeRes.json()) as { identityToken: string };
    const handoffToken = consumeData.identityToken;

    // 5. Handoff token with DPoP + ath
    const handoffHtu = `${this.baseUrl}/api/uniport/handoff-token`;
    const handoffProof = await dpopClient.generateProof({
      htm: 'POST',
      htu: handoffHtu,
      accessToken: handoffToken,
    });

    const handoffRes = await this.fetchFn(handoffHtu, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        authorization: `Bearer ${handoffToken}`,
        dpop: handoffProof,
      },
      body: JSON.stringify({
        tenantId: 'MITRA',
        monolithKey: 'hcqxpayrollq',
        as: 'token',
      }),
    });

    if (!handoffRes.ok) {
      throw new Error(`Gagal menukarkan token handoff Mitra: HTTP ${handoffRes.status}`);
    }
    this.updateCookies(handoffRes);
    const handoffData = (await handoffRes.json()) as { identityToken: string };
    this.identityToken = handoffData.identityToken;
    return this.identityToken;
  }

  async getUserContext(): Promise<UserContextOption[]> {
    const res = await this.withRetry(() =>
      this.request('/api/mitra/v1/aktivitas-mitra/mulai/context', {
        method: 'GET',
        headers: {
          accept: '*/*',
          'x-action': 'Masuk',
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
      }),
    );

    if (!res.ok) {
      throw new Error(`Gagal mengambil konteks pengguna: HTTP ${res.status}`);
    }

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

    const res = await this.withRetry(() =>
      this.request(`/api/mitra/v1/aktivitas-mitra/mulai/activities?${params.toString()}`, {
        method: 'GET',
        headers: {
          accept: '*/*',
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
      }),
    );

    if (!res.ok) {
      throw new Error(`Gagal mengambil daftar aktivitas: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { items: ActivityItem[] };
    return data.items || [];
  }

  async startActivity(ctx: UserContextOption, activityId: number): Promise<string> {
    const res = await this.withRetry(() =>
      this.request('/api/mitra/v1/aktivitas-mitra/mulai', {
        method: 'POST',
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          'x-action': 'Mulai',
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
        body: JSON.stringify({
          ...ctx,
          activityId,
        }),
      }),
    );

    if (!res.ok) {
      throw new Error(`Gagal memulai aktivitas: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { caseNumber: string };
    return data.caseNumber;
  }

  async finishActivity(input: FinishActivityInput): Promise<{ id: string; caseId: string }> {
    const res = await this.withRetry(() => {
      const formData = new FormData();
      formData.set('caseNumber', input.caseNumber);
      formData.set('keterangan', input.keterangan);
      formData.set('file', input.file, input.fileName);

      return this.request('/api/mitra/v1/aktivitas-mitra/selesai', {
        method: 'POST',
        headers: {
          'x-active-tenant': 'MITRA',
          'x-page': '/mitra/input-aktivitas-mitra',
        },
        body: formData,
      });
    });

    if (!res.ok) {
      throw new Error(`Gagal menyelesaikan aktivitas (${input.caseNumber}): HTTP ${res.status}`);
    }

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
          throw new Error(`HTTP ${result.status}`);
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
