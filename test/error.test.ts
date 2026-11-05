import { describe, expect, it } from 'bun:test';
import { ApiError, extractApiError, formatErrorMessage, isVerbose } from '../src/error';

describe('Error Handling & Verbose Flag', () => {
  it('should instantiate ApiError with status, payload, and endpoint', () => {
    const err = new ApiError('Gagal request', {
      status: 400,
      payload: '{"error": "bad_request"}',
      endpoint: '/api/test',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('Gagal request');
    expect(err.status).toBe(400);
    expect(err.payload).toBe('{"error": "bad_request"}');
    expect(err.endpoint).toBe('/api/test');
  });

  it('should detect verbose mode correctly from argv and env', () => {
    expect(isVerbose(['node', 'script.js', '--verbose'], {})).toBe(true);
    expect(isVerbose(['node', 'script.js', '-v'], {})).toBe(true);
    expect(isVerbose(['node', 'script.js'], { VERBOSE: 'true' })).toBe(true);
    expect(isVerbose(['node', 'script.js'], { VERBOSE: '1' })).toBe(true);
    expect(isVerbose(['node', 'script.js'], { VERBOSE: 'false' })).toBe(false);
    expect(isVerbose(['node', 'script.js'], {})).toBe(false);
  });

  it('should extract ApiError directly or from cause', () => {
    const direct = new ApiError('Direct', { status: 500, payload: 'err body' });
    expect(extractApiError(direct)).toBe(direct);

    const wrapped = new Error('Wrapped', { cause: direct });
    expect(extractApiError(wrapped)).toBe(direct);

    const generic = new Error('Normal error');
    expect(extractApiError(generic)).toBeNull();
    expect(extractApiError('a string')).toBeNull();
  });

  it('should hide API error payload when verbose is false', () => {
    const apiErr = new ApiError('Kredensial login tidak valid (401)', {
      status: 401,
      payload: '{"error": "invalid_grant", "trace": "secret stack trace"}',
      endpoint: '/api/uniport/login-password',
    });

    const formatted = formatErrorMessage(apiErr, false);
    expect(formatted).toBe('Kredensial login tidak valid (401)');
    expect(formatted).not.toContain('invalid_grant');
    expect(formatted).not.toContain('secret stack trace');
    expect(formatted).not.toContain('[Detail API]');
  });

  it('should show API error payload when verbose is true', () => {
    const apiErr = new ApiError('Kredensial login tidak valid (401)', {
      status: 401,
      payload: '{"error": "invalid_grant"}',
      endpoint: '/api/uniport/login-password',
    });

    const formatted = formatErrorMessage(apiErr, true);
    expect(formatted).toContain('Kredensial login tidak valid (401)');
    expect(formatted).toContain('[Detail API]');
    expect(formatted).toContain('{"error": "invalid_grant"}');
  });

  it('should format generic errors cleanly', () => {
    const err = new Error('Generic failure');
    expect(formatErrorMessage(err, false)).toBe('Generic failure');
    expect(formatErrorMessage('Custom text', false)).toBe('Custom text');
  });
});
