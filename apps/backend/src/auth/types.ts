export interface CustomerAuthUser {
  id: string;
  phone: string;
  email: string | null;
  status: string;
  isPhoneVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface OtpChallengeRecord {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  user: CustomerAuthUser;
}

export type OtpChallengeCreationResult =
  | { kind: 'created'; challenge: OtpChallengeRecord }
  | { kind: 'cooldown' }
  | { kind: 'limit' };

export interface CustomerProfileUpdate {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
}

export type CustomerSessionResult =
  | { kind: 'created'; session: SessionRecord }
  | { kind: 'account-type' }
  | { kind: 'inactive' }
  | { kind: 'missing-name' };

export interface AuthRepository {
  getActiveOtpChallenge(phone: string): Promise<OtpChallengeRecord | null>;
  createOtpChallenge(data: {
    phone: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMilliseconds: number;
    sendWindowStart: Date;
    maxSends: number;
  }): Promise<OtpChallengeCreationResult>;
  cancelOtpChallenge(id: string, now: Date): Promise<void>;
  incrementOtpAttempts(id: string, now: Date): Promise<boolean>;
  consumeOtpChallenge(id: string, codeHash: string, now: Date): Promise<boolean>;
  getCustomerByPhone(phone: string): Promise<CustomerAuthUser | null>;
  createCustomerSession(data: {
    phone: string;
    fullName?: string;
    email?: string;
    sessionId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<CustomerSessionResult>;
  getSessionById(id: string): Promise<SessionRecord | null>;
  rotateSession(data: {
    id: string;
    oldTokenHash: string;
    newTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<SessionRecord | null>;
  revokeSession(id: string, userId: string, now: Date): Promise<void>;
  getActiveSession(id: string, userId: string, now: Date): Promise<SessionRecord | null>;
  getCustomerProfile(userId: string): Promise<CustomerAuthUser | null>;
  updateCustomerProfile(userId: string, data: CustomerProfileUpdate): Promise<CustomerAuthUser | null>;
}
