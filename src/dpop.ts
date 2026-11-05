export interface DPoPProofOptions {
  htm: string;
  htu: string;
  accessToken?: string;
  iat?: number;
  jti?: string;
}

export function base64UrlEncode(input: Uint8Array | ArrayBuffer | string): string {
  if (typeof input === 'string') {
    return Buffer.from(input, 'utf8').toString('base64url');
  }
  if (input instanceof ArrayBuffer) {
    return Buffer.from(input).toString('base64url');
  }
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength).toString('base64url');
}

export async function computeAth(accessToken: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
  return base64UrlEncode(hash);
}

export interface DPoPClient {
  readonly keyPair: CryptoKeyPair;
  getPublicJwk(): Promise<{ kty: string; crv: string; x: string; y: string }>;
  generateProof(options: DPoPProofOptions): Promise<string>;
}

export async function createDPoPClient(): Promise<DPoPClient> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

  const exported = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const jwk = { kty: exported.kty!, crv: exported.crv!, x: exported.x!, y: exported.y! };

  return {
    keyPair,
    async getPublicJwk() {
      return jwk;
    },
    async generateProof(options: DPoPProofOptions): Promise<string> {
      const header = {
        typ: 'dpop+jwt',
        alg: 'ES256',
        jwk,
      };

      const payload: Record<string, unknown> = {
        jti: options.jti || crypto.randomUUID(),
        htm: options.htm.toUpperCase(),
        htu: options.htu,
        iat: options.iat ?? Math.floor(Date.now() / 1000),
      };

      if (options.accessToken) {
        payload.ath = await computeAth(options.accessToken);
      }

      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const encodedPayload = base64UrlEncode(JSON.stringify(payload));
      const signingInput = `${encodedHeader}.${encodedPayload}`;

      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        keyPair.privateKey,
        new TextEncoder().encode(signingInput),
      );

      const encodedSignature = base64UrlEncode(signature);
      return `${signingInput}.${encodedSignature}`;
    },
  };
}
