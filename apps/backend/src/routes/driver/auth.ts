import { Router } from 'express';
import { env } from '../../config/env.js';
import { driverAuthService } from '../../auth/runtime.js';
import {
  refreshTokenSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from '../../auth/schemas.js';
import type { DriverAuthService } from '../../auth/driverService.js';
import { AppError } from '../../errors/AppError.js';
import { createRateLimit } from '../../middleware/rateLimit.js';
import { requireDriver } from '../../middleware/requireDriver.js';
import { validateBody } from '../../middleware/validateRequest.js';

function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function createDriverAuthRouter(authService: DriverAuthService): Router {
  const router = Router();

  router.post(
    '/send-otp',
    createRateLimit({
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      code: 'OTP_RATE_LIMITED',
      message: 'Too many code requests. Try again later.',
    }),
    validateBody(sendOtpSchema),
    async (request, response) => {
      const { phone } = request.body as { phone: string };
      const result = await authService.sendOtp(phone);
      const localDevelopmentRequest =
        env.NODE_ENV === 'development' && isLoopbackAddress(request.socket.remoteAddress);
      response.json({
        success: true,
        data: {
          message: 'If this number can receive a code, one has been sent.',
          expiresIn: result.expiresIn,
          ...(localDevelopmentRequest && result.developmentCode
            ? { developmentOtp: result.developmentCode }
            : {}),
        },
      });
    },
  );

  router.post(
    '/verify-otp',
    createRateLimit({
      windowMs: 15 * 60 * 1000,
      maxRequests: 10,
      code: 'OTP_VERIFY_RATE_LIMITED',
      message: 'Too many verification attempts. Try again later.',
    }),
    validateBody(verifyOtpSchema),
    async (request, response) => {
      const result = await authService.verifyOtp(request.body as {
        phone: string;
        otp: string;
        fullName?: string;
      });
      response.json({ success: true, data: result });
    },
  );

  router.post('/refresh', validateBody(refreshTokenSchema), async (request, response) => {
    const { refreshToken } = request.body as { refreshToken: string };
    const result = await authService.refresh(refreshToken);
    response.json({ success: true, data: result });
  });

  router.post('/logout', requireDriver(authService), async (request, response) => {
    const auth = request.driverAuth;
    if (!auth) {
      throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Driver authentication is required.');
    }
    await authService.logout(auth.userId, auth.sessionId);
    response.json({ success: true, data: { loggedOut: true } });
  });

  return router;
}

export const driverAuthRouter = createDriverAuthRouter(driverAuthService);
