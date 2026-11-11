import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

const ACCESS_TOKEN_ISSUER = 'ravero-backend';
const ACCESS_TOKEN_AUDIENCE = 'ravero-customer';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

interface AccessTokenClaims {
  sub: string;
  sid: string;
  role: 'CUSTOMER';
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtp(phone: string, otp: string, secret: string): string {
  return createHmac('sha256', secret).update(`${phone}:${otp}`).digest('hex');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken(sessionId: string = randomUUID()): { id: string; token: string } {
  return { id: sessionId, token: `${sessionId}.${randomBytes(32).toString('base64url')}` };
}

export function safeEqualHex(left: string, right: string): boolean {
  if (!/^[\da-f]{64}$/i.test(left) || !/^[\da-f]{64}$/i.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function issueAccessToken(
  userId: string,
  sessionId: string,
  secret: string,
  now: Date,
): { token: string; expiresIn: number } {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims: AccessTokenClaims = {
    sub: userId,
    sid: sessionId,
    role: 'CUSTOMER',
    iss: ACCESS_TOKEN_ISSUER,
    aud: ACCESS_TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
  };
  const content = `${encodeJson({ alg: 'HS256', typ: 'JWT' })}.${encodeJson(claims)}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return { token: `${content}.${signature}`, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(
  token: string,
  secret: string,
  now: Date,
): AccessTokenClaims | null {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }

  const [headerPart, claimsPart, signature] = segments;
  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }

    const expected = createHmac('sha256', secret)
      .update(`${headerPart}.${claimsPart}`)
      .digest();
    const provided = Buffer.from(signature, 'base64url');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    const claims = JSON.parse(
      Buffer.from(claimsPart, 'base64url').toString('utf8'),
    ) as Partial<AccessTokenClaims>;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      typeof claims.sub !== 'string' ||
      typeof claims.sid !== 'string' ||
      claims.role !== 'CUSTOMER' ||
      claims.iss !== ACCESS_TOKEN_ISSUER ||
      claims.aud !== ACCESS_TOKEN_AUDIENCE ||
      typeof claims.iat !== 'number' ||
      typeof claims.exp !== 'number' ||
      claims.exp <= nowSeconds ||
      claims.iat > nowSeconds + 60
    ) {
      return null;
    }

    return claims as AccessTokenClaims;
  } catch {
    return null;
  }
}

export const accessTokenLifetimeSeconds = ACCESS_TOKEN_TTL_SECONDS;
