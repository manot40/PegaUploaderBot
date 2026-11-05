import { describe, expect, it } from 'bun:test';
import { checkLicense, checkNetwork } from '../src/license';

describe('License & Network Verification', () => {
  it('should skip license check when LICENSE_URL or LICENSE_TOKEN is absent or false', async () => {
    const res1 = await checkLicense({ url: '', token: '' });
    expect(res1).toBeUndefined();

    const res2 = await checkLicense({ url: 'false', token: 'false' });
    expect(res2).toBeUndefined();
  });

  it('should succeed when license server returns active === true', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          record: {
            name: 'License User A',
            active: true,
            additional: { version: '3.0.0' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const result = await checkLicense({
      url: 'https://auth.example.com',
      token: 'secret-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(result).toBeDefined();
    expect(result?.active).toBe(true);
    expect(result?.name).toBe('License User A');
    expect(result?.version).toBe('3.0.0');
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
    ).rejects.toThrow('Bot Kedaluwarsa. Silakan hubungi pengembang.');
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
});
