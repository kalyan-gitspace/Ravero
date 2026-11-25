import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import {
  accessTokenLifetimeSeconds,
  createRefreshToken,
  generateOtp,
  hashOtp,
  hashRefreshToken,
  issueAccessToken,
  safeEqualHex,
  verifyAccessToken,
} from './crypto.js';
import type { OtpProvider } from './otpProvider.js';
import type { DriverAuthRepository, DriverAuthUser } from './types.js';

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 5;
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DriverProfileResponse {
  id: string;
  phone: string;
  fullName: string | null;
  accountStatus: string;
  verificationStatus: string;
  isPhoneVerified: boolean;
  driverLicenseNumber: string | null;
}

export interface DriverAuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  driver: DriverProfileResponse;
}

function toDriverResponse(user: DriverAuthUser): DriverProfileResponse {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return {
    id: user.id,
    phone: user.phone,
    fullName: fullName || null,
    accountStatus: user.status,
    verificationStatus: user.driverVerificationStatus,
    isPhoneVerified: user.isPhoneVerified,
    driverLicenseNumber: user.driverLicenseNumber,
  };
}

export class DriverAuthService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: DriverAuthRepository,
    private readonly otpProvider: OtpProvider,
    private readonly options: {
      accessTokenSecret: string;
      otpHashSecret: string;
      now?: () => Date;
    } = {
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

    try {
      const delivery = await this.otpProvider.send(phone, code);
      return {
        expiresIn: OTP_LIFETIME_MS / 1000,
        developmentCode: delivery.developmentCode,
      };
    } catch (error) {
      await this.repository.cancelOtpChallenge(creation.challenge.id, now);
      throw error;
    }
  }

  async verifyOtp(data: {
    phone: string;
    otp: string;
    fullName?: string;
  }): Promise<DriverAuthTokenResponse> {
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
      const updatedChallenge = await this.repository.getActiveOtpChallenge(data.phone);
      if (updatedChallenge && updatedChallenge.attempts >= updatedChallenge.maxAttempts) {
        throw new AppError(429, 'OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.');
      }
      throw new AppError(400, 'INVALID_OTP', 'The code is incorrect.');
    }

    const existingDriver = await this.repository.getDriverByPhone(data.phone);
    if ((!existingDriver || !existingDriver.firstName) && !data.fullName) {
      throw new AppError(400, 'DRIVER_DETAILS_REQUIRED', 'Full name is required to create a driver profile.');
    }

    const consumed = await this.repository.consumeOtpChallenge(challenge.id, candidateHash, now);
    if (!consumed) {
      throw new AppError(400, 'OTP_ALREADY_USED', 'The code is no longer valid. Request a new code.');
    }

    const refresh = createRefreshToken();
    const result = await this.repository.createDriverSession({
      phone: data.phone,
      fullName: data.fullName,
      sessionId: refresh.id,
      refreshTokenHash: hashRefreshToken(refresh.token),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
      now,
    });
    if (result.kind === 'account-type') {
      throw new AppError(403, 'DRIVER_ACCOUNT_REQUIRED', 'This number is registered for a different account type.');
    }
    if (result.kind === 'inactive') {
      throw new AppError(403, 'DRIVER_ACCOUNT_UNAVAILABLE', 'This driver account is unavailable.');
    }
    if (result.kind === 'missing-name') {
      throw new AppError(400, 'DRIVER_DETAILS_REQUIRED', 'Full name is required to create a driver profile.');
    }
    return this.createTokenResponse(result.session.user, result.session.id, refresh.token, now);
  }

  async refresh(refreshToken: string): Promise<DriverAuthTokenResponse> {
    const now = this.now();
    const [sessionId, randomPart, ...extraParts] = refreshToken.split('.');
    if (!sessionId || !randomPart || extraParts.length > 0 || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
    }

    const session = await this.repository.getDriverSessionById(sessionId);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !['ACTIVE', 'PENDING_VERIFICATION'].includes(session.user.status) ||
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
    const rotatedSession = await this.repository.rotateDriverSession({
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
    const claims = verifyAccessToken(token, this.options.accessTokenSecret, now, 'DRIVER');
    if (!claims) {
      throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Driver authentication is required.');
    }
    const session = await this.repository.getActiveDriverSession(claims.sid, claims.sub, now);
    if (!session) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Driver authentication is required.');
    }
    return { userId: claims.sub, sessionId: claims.sid };
  }

  private createTokenResponse(
    user: DriverAuthUser,
    sessionId: string,
    refreshToken: string,
    now: Date,
  ): DriverAuthTokenResponse {
    const access = issueAccessToken(
      user.id,
      sessionId,
      this.options.accessTokenSecret,
      now,
      'DRIVER',
    );
    return {
      accessToken: access.token,
      refreshToken,
      expiresIn: accessTokenLifetimeSeconds,
      driver: toDriverResponse(user),
    };
  }
}
