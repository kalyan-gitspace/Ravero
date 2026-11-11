import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import {
  accessTokenLifetimeSeconds,
  createRefreshToken,
  hashOtp,
  hashRefreshToken,
  issueAccessToken,
  safeEqualHex,
  verifyAccessToken,
} from './crypto.js';
import { generateOtp } from './crypto.js';
import type { OtpDeliveryResult, OtpProvider } from './otpProvider.js';
import type { AuthRepository, CustomerAuthUser, CustomerSessionResult } from './types.js';

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 5;
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthServiceOptions {
  accessTokenSecret: string;
  otpHashSecret: string;
  now?: () => Date;
}

export interface CustomerProfileResponse {
  id: string;
  fullName: string | null;
  phone: string;
  email: string | null;
  profileImageUrl: string | null;
  status: string;
  isPhoneVerified: boolean;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  customer: CustomerProfileResponse;
}

function toCustomerResponse(user: CustomerAuthUser): CustomerProfileResponse {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return {
    id: user.id,
    fullName: fullName || null,
    phone: user.phone,
    email: user.email,
    profileImageUrl: user.profileImageUrl,
    status: user.status,
    isPhoneVerified: user.isPhoneVerified,
  };
}

function isPrismaUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class CustomerAuthService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: AuthRepository,
    private readonly otpProvider: OtpProvider,
    private readonly options: AuthServiceOptions = {
      accessTokenSecret: env.ACCESS_TOKEN_SECRET,
      otpHashSecret: env.OTP_HASH_SECRET,
    },
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async sendOtp(phone: string): Promise<{ expiresIn: number; developmentCode?: string }> {
    const now = this.now();
    const code = generateOtp();
    const creation = await this.repository.createOtpChallenge({
      phone,
      codeHash: hashOtp(phone, code, this.options.otpHashSecret),
      expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
      now,
      cooldownMilliseconds: OTP_RESEND_COOLDOWN_MS,
      sendWindowStart: new Date(now.getTime() - OTP_SEND_WINDOW_MS),
      maxSends: OTP_MAX_SENDS_PER_WINDOW,
    });
    if (creation.kind === 'cooldown') {
      throw new AppError(429, 'OTP_RESEND_COOLDOWN', 'Please wait before requesting another code.');
    }
    if (creation.kind === 'limit') {
      throw new AppError(429, 'OTP_SEND_LIMIT_EXCEEDED', 'Too many codes requested. Try again later.');
    }

    let delivery: OtpDeliveryResult;
    try {
      delivery = await this.otpProvider.send(phone, code);
    } catch (error) {
      await this.repository.cancelOtpChallenge(creation.challenge.id, now);
      throw error;
    }

    return {
      expiresIn: OTP_LIFETIME_MS / 1000,
      developmentCode: delivery.developmentCode,
    };
  }

  async verifyOtp(data: {
    phone: string;
    otp: string;
    fullName?: string;
    email?: string;
  }): Promise<AuthTokenResponse> {
    const now = this.now();
    const challenge = await this.repository.getActiveOtpChallenge(data.phone);
    if (!challenge) {
      throw new AppError(400, 'OTP_NOT_FOUND', 'No active code is available for this number.');
    }
    if (challenge.expiresAt <= now) {
      throw new AppError(400, 'OTP_EXPIRED', 'The code has expired. Request a new code.');
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.');
    }

    const candidateHash = hashOtp(data.phone, data.otp, this.options.otpHashSecret);
    if (!safeEqualHex(challenge.codeHash, candidateHash)) {
      const incremented = await this.repository.incrementOtpAttempts(challenge.id, now);
      if (!incremented) {
        throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.');
      }

      const afterAttempt = await this.repository.getActiveOtpChallenge(data.phone);
      if (afterAttempt && afterAttempt.attempts >= afterAttempt.maxAttempts) {
        throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.');
      }
      throw new AppError(400, 'INVALID_OTP', 'The code is incorrect.');
    }

    const existingCustomer = await this.repository.getCustomerByPhone(data.phone);
    if ((!existingCustomer || !existingCustomer.firstName) && !data.fullName) {
      throw new AppError(400, 'CUSTOMER_DETAILS_REQUIRED', 'Full name is required to create an account.');
    }

    const consumed = await this.repository.consumeOtpChallenge(challenge.id, candidateHash, now);
    if (!consumed) {
      throw new AppError(400, 'OTP_ALREADY_USED', 'The code is no longer valid. Request a new code.');
    }

    const refresh = createRefreshToken();
    let result: CustomerSessionResult;
    try {
      result = await this.repository.createCustomerSession({
        phone: data.phone,
        fullName: data.fullName,
        email: data.email,
        sessionId: refresh.id,
        refreshTokenHash: hashRefreshToken(refresh.token),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
        now,
      });
    } catch (error) {
      if (isPrismaUniqueError(error) && data.email) {
        throw new AppError(409, 'EMAIL_ALREADY_IN_USE', 'That email address is already associated with an account.');
      }
      throw error;
    }

    if (result.kind === 'account-type') {
      throw new AppError(403, 'CUSTOMER_ACCOUNT_REQUIRED', 'This number is not registered as a customer account.');
    }
    if (result.kind === 'inactive') {
      throw new AppError(403, 'CUSTOMER_ACCOUNT_UNAVAILABLE', 'This customer account is unavailable.');
    }
    if (result.kind === 'missing-name') {
      throw new AppError(400, 'CUSTOMER_DETAILS_REQUIRED', 'Full name is required to create an account.');
    }

    return this.createTokenResponse(result.session.user, result.session.id, refresh.token, now);
  }

  async refresh(refreshToken: string): Promise<AuthTokenResponse> {
    const now = this.now();
    const tokenParts = refreshToken.split('.');
    const sessionId = tokenParts[0];
    if (
      tokenParts.length !== 2 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    ) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    const session = await this.repository.getSessionById(sessionId);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE' ||
      !session.user.isPhoneVerified
    ) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    const oldTokenHash = hashRefreshToken(refreshToken);
    if (!safeEqualHex(session.refreshTokenHash, oldTokenHash)) {
      await this.repository.revokeSession(session.id, session.userId, now);
      throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'The refresh token is invalid or expired.');
    }

    const nextRefresh = createRefreshToken(session.id);
    const rotatedSession = await this.repository.rotateSession({
      id: session.id,
      oldTokenHash,
      newTokenHash: hashRefreshToken(nextRefresh.token),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
      now,
    });
    if (!rotatedSession) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    return this.createTokenResponse(
      rotatedSession.user,
      rotatedSession.id,
      nextRefresh.token,
      now,
    );
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.repository.revokeSession(sessionId, userId, this.now());
  }

  async authenticateAccessToken(token: string): Promise<{ userId: string; sessionId: string }> {
    const now = this.now();
    const claims = verifyAccessToken(token, this.options.accessTokenSecret, now);
    if (!claims) {
      throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Authentication is required.');
    }

    const session = await this.repository.getActiveSession(claims.sid, claims.sub, now);
    if (!session) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Authentication is required.');
    }

    return { userId: claims.sub, sessionId: claims.sid };
  }

  async getProfile(userId: string): Promise<CustomerProfileResponse> {
    const user = await this.repository.getCustomerProfile(userId);
    if (!user) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer profile was not found.');
    }
    return toCustomerResponse(user);
  }

  async updateProfile(
    userId: string,
    data: { fullName?: string; email?: string | null; profileImageUrl?: string | null },
  ): Promise<CustomerProfileResponse> {
    const profileUpdate: {
      firstName?: string;
      lastName?: string | null;
      email?: string | null;
      profileImageUrl?: string | null;
    } = {};
    if (data.fullName !== undefined) {
      const [firstName, ...remainingName] = data.fullName.trim().split(/\s+/);
      profileUpdate.firstName = firstName;
      profileUpdate.lastName = remainingName.length > 0 ? remainingName.join(' ') : null;
    }
    if (data.email !== undefined) profileUpdate.email = data.email;
    if (data.profileImageUrl !== undefined) profileUpdate.profileImageUrl = data.profileImageUrl;

    try {
      const user = await this.repository.updateCustomerProfile(userId, profileUpdate);
      if (!user) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer profile was not found.');
      }
      return toCustomerResponse(user);
    } catch (error) {
      if (isPrismaUniqueError(error) && data.email) {
        throw new AppError(409, 'EMAIL_ALREADY_IN_USE', 'That email address is already associated with an account.');
      }
      throw error;
    }
  }

  private createTokenResponse(
    user: CustomerAuthUser,
    sessionId: string,
    refreshToken: string,
    now: Date,
  ): AuthTokenResponse {
    const access = issueAccessToken(user.id, sessionId, this.options.accessTokenSecret, now);
    return {
      accessToken: access.token,
      refreshToken,
      expiresIn: accessTokenLifetimeSeconds,
      customer: toCustomerResponse(user),
    };
  }
}
