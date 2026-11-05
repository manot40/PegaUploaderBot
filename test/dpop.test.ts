import { describe, expect, it } from 'bun:test';
import { computeAth, createDPoPClient } from '../src/dpop';

describe('DPoP Client', () => {
  it('should generate a valid RFC 9449 DPoP proof without access token', async () => {
    const client = await createDPoPClient();
    const proof = await client.generateProof({
      htm: 'POST',
      htu: 'https://hcq.payrollq.id/api/uniport/consume-session',
    });

    const parts = proof.split('.');
    expect(parts.length).toBe(3);

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    expect(header.typ).toBe('dpop+jwt');
    expect(header.alg).toBe('ES256');
    expect(header.jwk).toBeDefined();
    expect(header.jwk.kty).toBe('EC');
    expect(header.jwk.crv).toBe('P-256');
    expect(header.jwk.x).toBeDefined();
    expect(header.jwk.y).toBeDefined();
    expect(header.jwk.d).toBeUndefined(); // MUST NOT leak private key

    expect(payload.htm).toBe('POST');
    expect(payload.htu).toBe('https://hcq.payrollq.id/api/uniport/consume-session');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.jti).toBe('string');
    expect(payload.ath).toBeUndefined();

    // Verify signature with public key
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = new Uint8Array(Buffer.from(parts[2], 'base64url'));
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      client.keyPair.publicKey,
      signature,
      new TextEncoder().encode(signingInput),
    );
    expect(verified).toBe(true);
  });

  it('should generate a proof with ath claim when accessToken is provided', async () => {
    const client = await createDPoPClient();
    const token = 'dummy-single-use-token-xyz123';
    const expectedAth = await computeAth(token);

    const proof = await client.generateProof({
      htm: 'POST',
      htu: 'https://hcq.payrollq.id/api/uniport/handoff-token',
      accessToken: token,
    });

    const parts = proof.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    expect(payload.ath).toBe(expectedAth);

    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = new Uint8Array(Buffer.from(parts[2], 'base64url'));
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      client.keyPair.publicKey,
      signature,
      new TextEncoder().encode(signingInput),
    );
    expect(verified).toBe(true);
  });
});
