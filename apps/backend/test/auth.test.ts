import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { test } from 'node:test';
import { createAuthRouter } from '../src/routes/auth.js';
import { createCustomerRouter } from '../src/routes/customer/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { generateOtp } from '../src/auth/crypto.js';
import { CustomerAuthService } from '../src/auth/service.js';
import type {
  AuthRepository,
  CustomerAuthUser,
  CustomerProfileUpdate,
  CustomerSessionResult,
  OtpChallengeCreationResult,
  OtpChallengeRecord,
  SessionRecord,
} from '../src/auth/types.js';
import type { OtpDeliveryResult, OtpProvider } from '../src/auth/otpProvider.js';

class FakeOtpProvider implements OtpProvider {
  code = '';

  async send(_phone: string, code: string): Promise<OtpDeliveryResult> {
    this.code = code;
    return { developmentCode: code };
  }
}

class InMemoryAuthRepository implements AuthRepository {
  readonly challenges: OtpChallengeRecord[] = [];
  readonly users = new Map<string, CustomerAuthUser>();
  readonly sessions = new Map<string, SessionRecord>();

  async getActiveOtpChallenge(phone: string): Promise<OtpChallengeRecord | null> {
    return this.challenges
      .filter((challenge) => challenge.phone === phone && !challenge.consumedAt)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
  }

  async createOtpChallenge(data: {
    phone: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMilliseconds: number;
    sendWindowStart: Date;
    maxSends: number;
  }): Promise<OtpChallengeCreationResult> {
    const latest = this.challenges
      .filter((challenge) => challenge.phone === data.phone)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (latest && data.now.getTime() - latest.createdAt.getTime() < data.cooldownMilliseconds) {
      return { kind: 'cooldown' };
    }
    const recentSends = this.challenges.filter(
      (challenge) => challenge.phone === data.phone && challenge.createdAt >= data.sendWindowStart,
    ).length;
    if (recentSends >= data.maxSends) return { kind: 'limit' };

    for (const challenge of this.challenges) {
      if (challenge.phone === data.phone && !challenge.consumedAt) {
        challenge.consumedAt = data.now;
      }
    }

    const challenge: OtpChallengeRecord = {
      id: randomUUID(),
      phone: data.phone,
      codeHash: data.codeHash,
      expiresAt: data.expiresAt,
      attempts: 0,
      maxAttempts: 5,
      consumedAt: null,
      createdAt: data.now,
    };
    this.challenges.push(challenge);
    return { kind: 'created', challenge };
  }

  async cancelOtpChallenge(id: string, now: Date): Promise<void> {
    const challenge = this.challenges.find((entry) => entry.id === id);
    if (challenge && !challenge.consumedAt) challenge.consumedAt = now;
  }

  async incrementOtpAttempts(id: string, now: Date): Promise<boolean> {
    const challenge = this.challenges.find((entry) => entry.id === id);
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= challenge.maxAttempts
    ) {
      return false;
    }
    challenge.attempts += 1;
    return true;
  }

  async consumeOtpChallenge(id: string, codeHash: string, now: Date): Promise<boolean> {
    const challenge = this.challenges.find((entry) => entry.id === id);
    if (
      !challenge ||
      challenge.codeHash !== codeHash ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= challenge.maxAttempts
    ) {
      return false;
    }
    challenge.consumedAt = now;
    return true;
  }

  async getCustomerByPhone(phone: string): Promise<CustomerAuthUser | null> {
    return [...this.users.values()].find((user) => user.phone === phone) ?? null;
  }

  async createCustomerSession(data: {
    phone: string;
    fullName?: string;
    email?: string;
    sessionId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<CustomerSessionResult> {
    let user = await this.getCustomerByPhone(data.phone);
    if (!user) {
      if (!data.fullName) return { kind: 'missing-name' };
      const [firstName, ...rest] = data.fullName.trim().split(/\s+/);
      user = {
        id: randomUUID(),
        phone: data.phone,
        email: data.email ?? null,
        status: 'ACTIVE',
        isPhoneVerified: true,
        firstName,
        lastName: rest.join(' ') || null,
        profileImageUrl: null,
      };
      this.users.set(user.id, user);
    } else if (user.status !== 'ACTIVE') {
      return { kind: 'inactive' };
    } else if (!user.firstName && data.fullName) {
      const [firstName, ...rest] = data.fullName.trim().split(/\s+/);
      user.firstName = firstName;
      user.lastName = rest.join(' ') || null;
    }

    const session: SessionRecord = {
      id: data.sessionId,
      userId: user.id,
      refreshTokenHash: data.refreshTokenHash,
      expiresAt: data.expiresAt,
      revokedAt: null,
      user,
    };
    this.sessions.set(session.id, session);
    return { kind: 'created', session };
  }

  async getSessionById(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async rotateSession(data: {
    id: string;
    oldTokenHash: string;
    newTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<SessionRecord | null> {
    const session = this.sessions.get(data.id);
    if (
      !session ||
      session.refreshTokenHash !== data.oldTokenHash ||
      session.revokedAt ||
      session.expiresAt <= data.now ||
      session.user.status !== 'ACTIVE'
    ) {
      return null;
    }
    session.refreshTokenHash = data.newTokenHash;
    session.expiresAt = data.expiresAt;
    return session;
  }

  async revokeSession(id: string, userId: string, now: Date): Promise<void> {
    const session = this.sessions.get(id);
    if (session?.userId === userId && !session.revokedAt) session.revokedAt = now;
  }

  async getActiveSession(id: string, userId: string, now: Date): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE'
    ) {
      return null;
    }
    return session;
  }

  async getCustomerProfile(userId: string): Promise<CustomerAuthUser | null> {
    return this.users.get(userId) ?? null;
  }

  async updateCustomerProfile(
    userId: string,
    data: CustomerProfileUpdate,
  ): Promise<CustomerAuthUser | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    if (data.firstName !== undefined) user.firstName = data.firstName;
    if (data.lastName !== undefined) user.lastName = data.lastName;
    if (data.email !== undefined) user.email = data.email;
    if (data.profileImageUrl !== undefined) user.profileImageUrl = data.profileImageUrl;
    return user;
  }
}

function createHarness() {
  const repository = new InMemoryAuthRepository();
  const otpProvider = new FakeOtpProvider();
  let time = new Date('2026-11-10T00:00:00.000Z');
  const service = new CustomerAuthService(repository, otpProvider, {
    accessTokenSecret: 'test-access-token-secret-0123456789abcdef',
    otpHashSecret: 'test-otp-hash-secret-0123456789abcdef',
    now: () => new Date(time),
  });
  return {
    repository,
    otpProvider,
    service,
    advanceTime(milliseconds: number) {
      time = new Date(time.getTime() + milliseconds);
    },
  };
}

test('OTP values are generated as six numeric digits', () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.match(generateOtp(), /^\d{6}$/);
  }
});

async function assertAppError(action: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.equal(
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code: string }).code
        : undefined,
      code,
    );
    return true;
  });
}

test('invalid OTP is rejected and failed attempts are capped', async () => {
  const { service, otpProvider } = createHarness();
  const phone = '+919876543210';
  await service.sendOtp(phone);
  const incorrectCode = otpProvider.code === '999999' ? '000000' : '999999';

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assertAppError(
      service.verifyOtp({ phone, otp: incorrectCode, fullName: 'Test User' }),
      'INVALID_OTP',
    );
  }
  await assertAppError(
    service.verifyOtp({ phone, otp: incorrectCode, fullName: 'Test User' }),
    'OTP_ATTEMPTS_EXCEEDED',
  );
});

test('expired OTP is rejected', async () => {
  const { service, otpProvider, advanceTime } = createHarness();
  const phone = '+919876543211';
  await service.sendOtp(phone);
  advanceTime(5 * 60 * 1000);
  await assertAppError(
    service.verifyOtp({ phone, otp: otpProvider.code, fullName: 'Test User' }),
    'OTP_EXPIRED',
  );
});

test('OTP cannot be reused after successful registration', async () => {
  const { service, otpProvider } = createHarness();
  const phone = '+919876543212';
  await service.sendOtp(phone);
  const result = await service.verifyOtp({
    phone,
    otp: otpProvider.code,
    fullName: 'First Customer',
  });
  assert.equal(result.customer.phone, phone);
  assert.equal(result.customer.isPhoneVerified, true);
  await assertAppError(
    service.verifyOtp({ phone, otp: otpProvider.code, fullName: 'First Customer' }),
    'OTP_NOT_FOUND',
  );
});

test('resend cooldown prevents immediate OTP delivery', async () => {
  const { service, advanceTime } = createHarness();
  const phone = '+919876543213';
  await service.sendOtp(phone);
  await assertAppError(service.sendOtp(phone), 'OTP_RESEND_COOLDOWN');
  advanceTime(60 * 1000);
  await service.sendOtp(phone);
});

test('send rate limit caps repeated requests for a phone number', async () => {
  const { service, advanceTime } = createHarness();
  const phone = '+919876543214';
  for (let count = 0; count < 5; count += 1) {
    await service.sendOtp(phone);
    advanceTime(60 * 1000);
  }
  await assertAppError(service.sendOtp(phone), 'OTP_SEND_LIMIT_EXCEEDED');
});

test('a verified new customer is registered and an existing customer can log in', async () => {
  const { service, otpProvider, advanceTime, repository } = createHarness();
  const phone = '+919876543215';

  await service.sendOtp(phone);
  const registration = await service.verifyOtp({
    phone,
    otp: otpProvider.code,
    fullName: 'Ravero Customer',
    email: 'customer@example.com',
  });
  assert.equal(repository.users.size, 1);
  assert.equal(registration.customer.fullName, 'Ravero Customer');

  advanceTime(60 * 1000);
  await service.sendOtp(phone);
  const login = await service.verifyOtp({ phone, otp: otpProvider.code });
  assert.equal(repository.users.size, 1);
  assert.equal(login.customer.id, registration.customer.id);
});

test('refresh tokens rotate and replay revokes the session', async () => {
  const { service, otpProvider } = createHarness();
  const phone = '+919876543216';
  await service.sendOtp(phone);
  const initial = await service.verifyOtp({ phone, otp: otpProvider.code, fullName: 'Test Customer' });
  const rotated = await service.refresh(initial.refreshToken);
  assert.notEqual(rotated.refreshToken, initial.refreshToken);
  await assertAppError(service.refresh(initial.refreshToken), 'REFRESH_TOKEN_REUSED');
  await assertAppError(service.refresh(rotated.refreshToken), 'INVALID_REFRESH_TOKEN');
});

test('expired refresh sessions cannot be used', async () => {
  const { service, otpProvider, advanceTime } = createHarness();
  const phone = '+919876543221';
  await service.sendOtp(phone);
  const tokens = await service.verifyOtp({ phone, otp: otpProvider.code, fullName: 'Test Customer' });
  advanceTime(31 * 24 * 60 * 60 * 1000);
  await assertAppError(service.refresh(tokens.refreshToken), 'INVALID_REFRESH_TOKEN');
});

test('expired and revoked access sessions are rejected', async () => {
  const { service, otpProvider, advanceTime } = createHarness();
  const phone = '+919876543217';
  await service.sendOtp(phone);
  const result = await service.verifyOtp({ phone, otp: otpProvider.code, fullName: 'Test Customer' });
  advanceTime(16 * 60 * 1000);
  await assertAppError(service.authenticateAccessToken(result.accessToken), 'INVALID_ACCESS_TOKEN');

  const anotherPhone = '+919876543220';
  await service.sendOtp(anotherPhone);
  const anotherResult = await service.verifyOtp({
    phone: anotherPhone,
    otp: otpProvider.code,
    fullName: 'Another Customer',
  });
  const claims = JSON.parse(
    Buffer.from(anotherResult.accessToken.split('.')[1], 'base64url').toString('utf8'),
  ) as { sid: string; sub: string };
  await service.logout(claims.sub, claims.sid);
  await assertAppError(service.authenticateAccessToken(anotherResult.accessToken), 'SESSION_EXPIRED');
});

test('customer profile can be retrieved and updated', async () => {
  const { service, otpProvider } = createHarness();
  const phone = '+919876543218';
  await service.sendOtp(phone);
  const tokens = await service.verifyOtp({ phone, otp: otpProvider.code, fullName: 'Old Name' });
  const profile = await service.getProfile(tokens.customer.id);
  assert.equal(profile.fullName, 'Old Name');

  const updated = await service.updateProfile(tokens.customer.id, {
    fullName: 'New Customer Name',
    email: 'new@example.com',
    profileImageUrl: 'https://example.com/avatar.png',
  });
  assert.equal(updated.fullName, 'New Customer Name');
  assert.equal(updated.email, 'new@example.com');
  assert.equal(updated.profileImageUrl, 'https://example.com/avatar.png');
  assert.equal(updated.phone, phone);
});

test('authentication endpoints support registration, profile, refresh, and logout', async () => {
  const { service, otpProvider } = createHarness();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth/customer', createAuthRouter(service));
  app.use('/api/v1/customer', createCustomerRouter(service));
  app.use(errorHandler);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const invalidPhone = await fetch(`${baseUrl}/api/v1/auth/customer/send-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '9876543219' }),
    });
    assert.equal(invalidPhone.status, 400);

    const send = await fetch(`${baseUrl}/api/v1/auth/customer/send-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+91 98765-43219' }),
    });
    assert.equal(send.status, 200);
    const sendPayload = (await send.json()) as { data: { developmentOtp?: string } };
    assert.equal(sendPayload.data.developmentOtp, otpProvider.code);

    const verify = await fetch(`${baseUrl}/api/v1/auth/customer/verify-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '+919876543219',
        otp: otpProvider.code,
        fullName: 'API Customer',
      }),
    });
    assert.equal(verify.status, 200);
    const authPayload = (await verify.json()) as {
      data: { accessToken: string; refreshToken: string; customer: { id: string } };
    };
    const accessToken = authPayload.data.accessToken;

    const profile = await fetch(`${baseUrl}/api/v1/customer/profile`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(profile.status, 200);

    const update = await fetch(`${baseUrl}/api/v1/customer/profile`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fullName: 'Updated API Customer' }),
    });
    assert.equal(update.status, 200);

    const refresh = await fetch(`${baseUrl}/api/v1/auth/customer/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: authPayload.data.refreshToken }),
    });
    assert.equal(refresh.status, 200);
    const logout = await fetch(`${baseUrl}/api/v1/auth/customer/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(logout.status, 200);

    const afterLogout = await fetch(`${baseUrl}/api/v1/customer/profile`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    server.close();
  }
});
