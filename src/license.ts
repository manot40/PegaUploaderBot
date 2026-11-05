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
): Promise<{ active: boolean; name?: string; version?: string } | void> {
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
    };
  }

  throw new Error('Bot Kedaluwarsa. Silakan hubungi pengembang.');
}
