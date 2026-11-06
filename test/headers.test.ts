import { describe, expect, it } from 'bun:test';
import {
  BROWSER_ACCEPT_LANGUAGE,
  BROWSER_SEC_CH_UA,
  BROWSER_USER_AGENT,
  browserFetch,
  createBrowserHeaders,
} from '../src/headers';

describe('Browser Headers Payload', () => {
  it('should generate standard Chrome desktop browser headers by default', () => {
    const headers = createBrowserHeaders();

    expect(headers['user-agent']).toBe(BROWSER_USER_AGENT);
    expect(headers['sec-ch-ua']).toBe(BROWSER_SEC_CH_UA);
    expect(headers['sec-ch-ua-mobile']).toBe('?0');
    expect(headers['sec-ch-ua-platform']).toBe('"Windows"');
    expect(headers['sec-fetch-dest']).toBe('empty');
    expect(headers['sec-fetch-mode']).toBe('cors');
    expect(headers['sec-fetch-site']).toBe('same-origin');
    expect(headers['accept-language']).toBe(BROWSER_ACCEPT_LANGUAGE);
    expect(headers['accept']).toBe('application/json, text/plain, */*');
    expect(headers['priority']).toBe('u=1, i');
  });

  it('should derive origin and referer from url', () => {
    const headers = createBrowserHeaders({
      url: 'https://hcq.payrollq.id/api/uniport/create-session',
    });

    expect(headers['origin']).toBe('https://hcq.payrollq.id');
    expect(headers['referer']).toBe('https://hcq.payrollq.id/');
  });

  it('should support custom referer and override defaults', () => {
    const headers = createBrowserHeaders({
      url: 'https://hcq.payrollq.id/api/mitra/v1/aktivitas-mitra/mulai/context',
      origin: 'https://hcq.payrollq.id',
      referer: 'https://hcq.payrollq.id/mitra/input-aktivitas-mitra',
      headers: {
        'x-active-tenant': 'MITRA',
        'x-page': '/mitra/input-aktivitas-mitra',
        Authorization: 'Bearer test-token',
      },
    });

    expect(headers['origin']).toBe('https://hcq.payrollq.id');
    expect(headers['referer']).toBe('https://hcq.payrollq.id/mitra/input-aktivitas-mitra');
    expect(headers['x-active-tenant']).toBe('MITRA');
    expect(headers['x-page']).toBe('/mitra/input-aktivitas-mitra');
    expect(headers['Authorization']).toBe('Bearer test-token');
    expect(headers['user-agent']).toBe(BROWSER_USER_AGENT);
  });

  it('should format headers for navigate mode when checking network', () => {
    const headers = createBrowserHeaders({
      url: 'https://hcq.payrollq.id',
      mode: 'navigate',
    });

    expect(headers['sec-fetch-dest']).toBe('document');
    expect(headers['sec-fetch-mode']).toBe('navigate');
    expect(headers['sec-fetch-site']).toBe('none');
    expect(headers['accept']).toContain('text/html');
    expect(headers['priority']).toBe('u=0, i');
  });

  it('should inject browser headers into fetch requests via browserFetch', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response('ok', { status: 200 });
    };

    await browserFetch(mockFetch as unknown as typeof fetch, 'https://hcq.payrollq.id/test-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(capturedUrl).toBe('https://hcq.payrollq.id/test-endpoint');
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('user-agent')).toBe(BROWSER_USER_AGENT);
    expect(headers.get('sec-ch-ua')).toBe(BROWSER_SEC_CH_UA);
    expect(headers.get('sec-fetch-mode')).toBe('cors');
    expect(headers.get('origin')).toBe('https://hcq.payrollq.id');
    expect(headers.get('content-type')).toBe('application/json');
  });
});
