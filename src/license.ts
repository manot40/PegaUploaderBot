import { color } from './color';
import { ApiError } from './error';

export interface LicenseRecord {
  name?: string;
  active?: boolean;
  additional?:
    | {
        version?: string;
        [key: string]: unknown;
      }
    | string;
}

export interface LicenseAuthResponse {
  record?: LicenseRecord;
  token?: string;
}

export interface SessionRecord {
  id?: string;
  email: string;
  token: string;
  cookies: Record<string, string> | string;
  expires_at: string;
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
      const response = await fetchFn(targetUrl, { signal: controller.signal });
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
  options: { url?: string; token?: string; fetchFn?: typeof fetch } = {},
): Promise<{ active: boolean; name?: string; version?: string; token?: string } | void> {
  const authUrl = options.url ?? process.env.LICENSE_URL;
  const token = options.token ?? process.env.LICENSE_TOKEN;
  const fetchFn = options.fetchFn ?? fetch;

  if (!authUrl || authUrl === 'false' || !token || token === 'false') {
    // License check skipped when not configured
    return;
  }

  const endpoint = `${authUrl.replace(/\/+$/, '')}/api/collections/users/auth-with-password`;
  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'pega_bot', password: token }),
  }).catch((err) => {
    throw new Error(`Gagal memverifikasi lisensi: ${err.message}`);
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new ApiError('Gagal verifikasi lisensi: Kredensial lisensi tidak valid.', {
      status: response.status,
      payload,
      endpoint,
    });
  }

  const data = (await response.json()) as LicenseAuthResponse;
  const record = data?.record;

  if (record && record.active === true) {
    const version =
      typeof record.additional === 'object'
        ? record.additional?.version || 'unknown version'
        : record.additional || 'unknown version';
    return {
      active: true,
      name: record.name,
      version: String(version),
      token: data.token,
    };
  }

  throw new Error('Bot Kedaluwarsa. Silakan hubungi pengembang.');
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
  await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
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
    const res = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
): Promise<void> {
  const authUrl = options.url ?? process.env.LICENSE_URL;
  const token = options.token;
  const fetchFn = options.fetchFn ?? fetch;

  if (!authUrl || authUrl === 'false' || !token) return;

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
    await fetchFn(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    });
  } catch {
    // Non-fatal
  }
}
