import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AuthRepository,
  CustomerAuthUser,
  CustomerProfileUpdate,
  OtpChallengeCreationResult,
  CustomerSessionResult,
  OtpChallengeRecord,
  SessionRecord,
} from './types.js';

type UserWithProfile = Prisma.UserGetPayload<{ include: { customerProfile: true } }>;

function mapCustomerUser(user: UserWithProfile): CustomerAuthUser {
  return {
    id: user.id,
    phone: user.phone ?? '',
    email: user.email,
    status: user.status,
    isPhoneVerified: user.isPhoneVerified,
    firstName: user.customerProfile?.firstName ?? null,
    lastName: user.customerProfile?.lastName ?? null,
    profileImageUrl: user.customerProfile?.profileImageUrl ?? null,
  };
}

function mapSession(
  session: Prisma.UserSessionGetPayload<{ include: { user: { include: { customerProfile: true } } } }>,
): SessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    refreshTokenHash: session.refreshTokenHash,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    user: mapCustomerUser(session.user),
  };
}

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const [firstName, ...remainingName] = fullName.trim().split(/\s+/);
  return {
    firstName,
    lastName: remainingName.length > 0 ? remainingName.join(' ') : null,
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getActiveOtpChallenge(phone: string): Promise<OtpChallengeRecord | null> {
    return this.prisma.otpChallenge.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  createOtpChallenge(data: {
    phone: string;
    codeHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMilliseconds: number;
    sendWindowStart: Date;
    maxSends: number;
  }): Promise<OtpChallengeCreationResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.phone}, 0))::text`;
      const latest = await transaction.otpChallenge.findFirst({
        where: { phone: data.phone },
        orderBy: { createdAt: 'desc' },
      });
      if (
        latest &&
        data.now.getTime() - latest.createdAt.getTime() < data.cooldownMilliseconds
      ) {
        return { kind: 'cooldown' };
      }

      const recentSends = await transaction.otpChallenge.count({
        where: { phone: data.phone, createdAt: { gte: data.sendWindowStart } },
      });
      if (recentSends >= data.maxSends) {
        return { kind: 'limit' };
      }

      await transaction.otpChallenge.updateMany({
        where: { phone: data.phone, consumedAt: null },
        data: { consumedAt: data.now },
      });

      const challenge = await transaction.otpChallenge.create({
        data: {
          phone: data.phone,
          codeHash: data.codeHash,
          expiresAt: data.expiresAt,
          createdAt: data.now,
          updatedAt: data.now,
        },
      });
      return { kind: 'created', challenge };
    });
  }

  async cancelOtpChallenge(id: string, now: Date): Promise<void> {
    await this.prisma.otpChallenge.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: now },
    });
  }

  async incrementOtpAttempts(id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.otpChallenge.updateMany({
      where: {
        id,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: 5 },
      },
      data: { attempts: { increment: 1 } },
    });
    return result.count === 1;
  }

  async consumeOtpChallenge(id: string, codeHash: string, now: Date): Promise<boolean> {
    const result = await this.prisma.otpChallenge.updateMany({
      where: {
        id,
        codeHash,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: 5 },
      },
      data: { consumedAt: now },
    });
    return result.count === 1;
  }

  async getCustomerByPhone(phone: string): Promise<CustomerAuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { customerProfile: true },
    });
    return user ? mapCustomerUser(user) : null;
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
    return this.prisma.$transaction(async (transaction) => {
      let user = await transaction.user.findUnique({
        where: { phone: data.phone },
        include: {
          customerProfile: true,
          userRoles: { include: { role: true } },
          driverProfile: true,
          adminProfile: true,
        },
      });

      if (user) {
        const hasCustomerRole = user.userRoles.some(({ role }) => role.name === 'CUSTOMER');
        const hasOtherRole = user.userRoles.some(({ role }) => role.name !== 'CUSTOMER');
        if (hasOtherRole || user.driverProfile || user.adminProfile) {
          return { kind: 'account-type' };
        }
        if (user.status !== 'ACTIVE') {
          return { kind: 'inactive' };
        }
        if (!user.customerProfile && !data.fullName) {
          return { kind: 'missing-name' };
        }

        if (!user.customerProfile && data.fullName) {
          const name = splitName(data.fullName);
          await transaction.customerProfile.create({
            data: {
              userId: user.id,
              ...name,
            },
          });
        }
        if (!hasCustomerRole) {
          const role = await transaction.role.upsert({
            where: { name: 'CUSTOMER' },
            update: {},
            create: { name: 'CUSTOMER', description: 'Customer access' },
          });
          await transaction.userRoleAssignment.create({
            data: { userId: user.id, roleId: role.id },
          });
        }
        user = await transaction.user.update({
          where: { id: user.id },
          data: { isPhoneVerified: true },
          include: {
            customerProfile: true,
            userRoles: { include: { role: true } },
            driverProfile: true,
            adminProfile: true,
          },
        });
      } else {
        if (!data.fullName) {
          return { kind: 'missing-name' };
        }

        const role = await transaction.role.upsert({
          where: { name: 'CUSTOMER' },
          update: {},
          create: { name: 'CUSTOMER', description: 'Customer access' },
        });
        const name = splitName(data.fullName);
        user = await transaction.user.create({
          data: {
            phone: data.phone,
            email: data.email,
            isPhoneVerified: true,
            userRoles: { create: { roleId: role.id } },
            customerProfile: { create: name },
          },
          include: {
            customerProfile: true,
            userRoles: { include: { role: true } },
            driverProfile: true,
            adminProfile: true,
          },
        });
      }

      const session = await transaction.userSession.create({
        data: {
          id: data.sessionId,
          userId: user.id,
          refreshTokenHash: data.refreshTokenHash,
          expiresAt: data.expiresAt,
          createdAt: data.now,
          lastUsedAt: data.now,
        },
        include: { user: { include: { customerProfile: true } } },
      });

      return { kind: 'created', session: mapSession(session) };
    });
  }

  async getSessionById(id: string): Promise<SessionRecord | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { id },
      include: { user: { include: { customerProfile: true } } },
    });
    return session ? mapSession(session) : null;
  }

  async rotateSession(data: {
    id: string;
    oldTokenHash: string;
    newTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<SessionRecord | null> {
    const result = await this.prisma.userSession.updateMany({
      where: {
        id: data.id,
        refreshTokenHash: data.oldTokenHash,
        revokedAt: null,
        expiresAt: { gt: data.now },
        user: {
          status: 'ACTIVE',
          isPhoneVerified: true,
          userRoles: { some: { role: { name: 'CUSTOMER' } } },
        },
      },
      data: {
        refreshTokenHash: data.newTokenHash,
        expiresAt: data.expiresAt,
        lastUsedAt: data.now,
      },
    });
    if (result.count !== 1) {
      return null;
    }

    return this.getSessionById(data.id);
  }

  async revokeSession(id: string, userId: string, now: Date): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async getActiveSession(id: string, userId: string, now: Date): Promise<SessionRecord | null> {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        user: {
          status: 'ACTIVE',
          isPhoneVerified: true,
          userRoles: { some: { role: { name: 'CUSTOMER' } } },
        },
      },
      include: { user: { include: { customerProfile: true } } },
    });
    return session ? mapSession(session) : null;
  }

  async getCustomerProfile(userId: string): Promise<CustomerAuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
        isPhoneVerified: true,
        userRoles: { some: { role: { name: 'CUSTOMER' } } },
      },
      include: { customerProfile: true },
    });
    return user ? mapCustomerUser(user) : null;
  }

  async updateCustomerProfile(
    userId: string,
    data: CustomerProfileUpdate,
  ): Promise<CustomerAuthUser | null> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: {
          id: userId,
          status: 'ACTIVE',
          isPhoneVerified: true,
          userRoles: { some: { role: { name: 'CUSTOMER' } } },
        },
      });
      if (!user) {
        return null;
      }

      const profileUpdate: Prisma.CustomerProfileUpdateInput = {};
      if (data.firstName !== undefined) profileUpdate.firstName = data.firstName;
      if (data.lastName !== undefined) profileUpdate.lastName = data.lastName;
      if (data.profileImageUrl !== undefined) profileUpdate.profileImageUrl = data.profileImageUrl;
      const profileCreate = {
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        profileImageUrl: data.profileImageUrl ?? null,
      };

      await transaction.customerProfile.upsert({
        where: { userId },
        create: { userId, ...profileCreate },
        update: profileUpdate,
      });

      if (data.email !== undefined) {
        await transaction.user.update({
          where: { id: userId },
          data: { email: data.email },
        });
      }

      const updatedUser = await transaction.user.findUnique({
        where: { id: userId },
        include: { customerProfile: true },
      });
      return updatedUser ? mapCustomerUser(updatedUser) : null;
    });
  }
}
