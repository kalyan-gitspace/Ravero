import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { createOtpProvider } from './otpProvider.js';
import { PrismaAuthRepository } from './prismaAuthRepository.js';
import { CustomerAuthService } from './service.js';

export const customerAuthService = new CustomerAuthService(
  new PrismaAuthRepository(prisma),
  createOtpProvider(),
  {
    accessTokenSecret: env.ACCESS_TOKEN_SECRET,
    otpHashSecret: env.OTP_HASH_SECRET,
  },
);
