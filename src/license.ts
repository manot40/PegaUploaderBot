import { color } from './color';
import { ApiError } from './error';
import { browserFetch } from './headers';

import { version } from '../package.json';

export interface LicenseRecord {
  name?: string;
  active?: boolean;
  additional?: { latest: string; versions: Record<string, boolean>; [key: string]: unknown };
}

export interface LicenseAuthResponse {
  record?: LicenseRecord;
  token?: string;
}

export interface LicenseInfo {
  name?: string;
  token?: string;
  active: boolean;
  version: string;
}

export interface SessionRecord {
  id?: string;
  email: string;
  token: string;
  cookies: Record<string, string> | string;
  expires_at: string;
}

export interface LicenseManagerOptions {
  url?: string;
  token?: string;
  user?: string;
  fetchFn?: typeof fetch;
}

export function getTokenExpiry(token: string, fallbackTtlMs = 12 * 60 * 60 * 1000): string {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson);
      if (typeof payload.exp === 'number' && !isNaN(payload.exp)) {
        return new Date(payload.exp * 1000).toISOString();
      }
    }
  } catch {
    // fallback
  }
  return new Date(Date.now() + fallbackTtlMs).toISOString();
}

export function isSessionValid(
  record?: Pick<SessionRecord, 'token' | 'expires_at'> | null,
  bufferMs = 60_000,
): boolean {
  if (!record || !record.token || !record.expires_at) return false;
  const expiresAtMs = Date.parse(record.expires_at);
  if (isNaN(expiresAtMs)) return false;
  return expiresAtMs > Date.now() + bufferMs;
}

export async function checkNetwork(
  targetUrl: string = process.env.BOT_URL || 'https://hcq.payrollq.id',
  options: { maxRetries?: number; timeoutMs?: number; fetchFn?: typeof fetch } = {},
): Promise<boolean> {
  const { maxRetries = 10, timeoutMs = 5000, fetchFn = fetch } = options;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await browserFetch(fetchFn, targetUrl, { signal: controller.signal }, { mode: 'navigate' });
      clearTimeout(timer);

      if (response && (response.ok || response.status === 404 || response.status === 403 || response.status === 401)) {
        // Server responded, network is reachable
        return true;
      }

      console.warn(
        color.yellow(
          `NetWarn: Server merespons dengan status ${response?.status}. Mencoba kembali (${attempt}/${maxRetries})...`,
        ),
      );
    } catch {
      clearTimeout(timer);
      console.warn(
        color.yellow(`NetWarn: Koneksi ke ${targetUrl} gagal/timeout. Mencoba kembali (${attempt}/${maxRetries})...`),
      );
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw new Error(`NetError: Tidak dapat terhubung ke ${targetUrl} setelah ${maxRetries} percobaan.`);
}

export async function checkLicense(
  options: Partial<Record<'url' | 'token' | 'user', string>> & { fetchFn?: typeof fetch } = {},
): Promise<LicenseInfo | void> {
  const authUrl = options.url ?? process.env.LICENSE_URL;
  const password = options.token ?? process.env.LICENSE_TOKEN;
  const licenseUser = options.user ?? process.env.LICENSE_USER;
  const fetchFn = options.fetchFn ?? fetch;

  if (!authUrl || authUrl === 'false' || !password || password === 'false') {
    // License check skipped when not configured
    return;
  }

  const endpoint = `${authUrl.replace(/\/+$/, '')}/api/collections/users/auth-with-password`;
  const response = await browserFetch(fetchFn, endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: licenseUser, password: password }),
  }).catch((err) => {
    throw new Error(`Gagal memverifikasi lisensi: ${err.message}`);
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new ApiError('Gagal verifikasi status bot: Kredensial lisensi tidak valid.', {
      status: response.status,
      payload,
      endpoint,
    });
  }

  const data = (await response.json()) as LicenseAuthResponse;
  const record = data?.record;
  const metadata = record?.additional;
  const isLicenseActive = Boolean(record && record.active === true && metadata?.versions?.[version]);

  if (record && isLicenseActive) return { version, active: true, name: record.name, token: data.token };
  else throw new Error('Silakan hubungi pengembang.');
}

export async function sendTelemetry(
  payload: { user: string; job_name: string; job_count: number },
  options: { url?: string; token?: string; fetchFn?: typeof fetch } = {},
): Promise<void> {
  const authUrl = options.url ?? process.env.LICENSE_URL;
  const token = options.token;
  const fetchFn = options.fetchFn ?? fetch;

  if (!authUrl || authUrl === 'false' || !token) return;

  const endpoint = `${authUrl.replace(/\/+$/, '')}/api/collections/mitrabot_tracing/records`;
  await browserFetch(fetchFn, endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getCachedSession(
  email: string,
  options: { url?: string; token?: string; fetchFn?: typeof fetch } = {},
): Promise<SessionRecord | null> {
  const authUrl = options.url ?? process.env.LICENSE_URL;
  const token = options.token;
  const fetchFn = options.fetchFn ?? fetch;

  if (!authUrl || authUrl === 'false' || !token || !email) return null;

  const filterParam = encodeURIComponent(`email='${email.replace(/'/g, "\\'")}'`);
  const endpoint = `${authUrl.replace(/\/+$/, '')}/api/collections/mitrabot_sessions/records?filter=${filterParam}&perPage=1`;

  try {
    const res = await browserFetch(fetchFn, endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { items?: SessionRecord[] };
    return data?.items?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function saveCachedSession(
  session: Omit<SessionRecord, 'id'>,
  existingId?: string,
  options: { url?: string; token?: string; fetchFn?: typeof fetch } = {},
): Promise<string | undefined> {
  const authUrl = options.url ?? process.env.LICENSE_URL;
  const token = options.token;
  const fetchFn = options.fetchFn ?? fetch;

  if (!authUrl || authUrl === 'false' || !token) return undefined;

  let targetId = existingId;
  if (!targetId) {
    const existing = await getCachedSession(session.email, options);
    targetId = existing?.id;
  }

  let cookiesPayload = session.cookies;
  if (typeof cookiesPayload === 'string') {
    try {
      cookiesPayload = JSON.parse(cookiesPayload);
    } catch {
      // keep as string if not JSON
    }
  }

  const body = JSON.stringify({
    email: session.email,
    token: session.token,
    cookies: cookiesPayload,
    expires_at: session.expires_at,
  });

  const baseEndpoint = `${authUrl.replace(/\/+$/, '')}/api/collections/mitrabot_sessions/records`;
  const endpoint = targetId ? `${baseEndpoint}/${targetId}` : baseEndpoint;
  const method = targetId ? 'PATCH' : 'POST';

  try {
    const res = await browserFetch(fetchFn, endpoint, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
    if (res.ok) {
      const saved = (await res.json().catch(() => null)) as { id?: string } | null;
      return saved?.id ?? targetId;
    }
  } catch {
    // Non-fatal
  }
  return targetId;
}

export class LicenseManager {
  private readonly url?: string;
  private readonly licenseKey?: string;
  private readonly user?: string;
  private readonly fetchFn?: typeof fetch;
  private licenseInfo?: LicenseInfo;
  private readonly sessionRecordIds = new Map<string, string>();

  constructor(options: LicenseManagerOptions = {}) {
    this.url = options.url ?? process.env.LICENSE_URL;
    this.licenseKey = options.token ?? process.env.LICENSE_TOKEN;
    this.user = options.user ?? process.env.LICENSE_USER;
    this.fetchFn = options.fetchFn;
  }

  get info(): LicenseInfo | undefined {
    return this.licenseInfo;
  }

  get isActive(): boolean {
    return Boolean(this.licenseInfo?.active && this.licenseInfo?.token);
  }

  async verify(): Promise<LicenseInfo | undefined> {
    const res = await checkLicense({
      url: this.url,
      token: this.licenseKey,
      user: this.user,
      fetchFn: this.fetchFn,
    });
    this.licenseInfo = res || undefined;
    return this.licenseInfo;
  }

  async getValidSession(email: string): Promise<SessionRecord | null> {
    if (!this.isActive || !email) return null;

    const cached = await getCachedSession(email, {
      url: this.url,
      token: this.licenseInfo?.token,
      fetchFn: this.fetchFn,
    });

    if (cached?.id) {
      this.sessionRecordIds.set(email, cached.id);
    }

    if (cached && isSessionValid(cached)) {
      return cached;
    }
    return null;
  }

  async saveSession(email: string, token: string, cookies: Record<string, string> | string): Promise<void> {
    if (!this.isActive || !email || !token) return;

    const expires_at = getTokenExpiry(token);
    const existingId = this.sessionRecordIds.get(email);

    const recordId = await saveCachedSession({ email, token, cookies, expires_at }, existingId, {
      url: this.url,
      token: this.licenseInfo?.token,
      fetchFn: this.fetchFn,
    });

    if (recordId) {
      this.sessionRecordIds.set(email, recordId);
    }
  }

  async sendTelemetry(user: string, jobName: string, jobCount: number): Promise<void> {
    if (!this.isActive) return;

    await sendTelemetry(
      { user, job_name: jobName, job_count: jobCount },
      { url: this.url, token: this.licenseInfo?.token, fetchFn: this.fetchFn },
    );
  }
}
