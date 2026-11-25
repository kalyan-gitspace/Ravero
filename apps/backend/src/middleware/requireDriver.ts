import type { RequestHandler } from 'express';
import type { DriverAuthService } from '../auth/driverService.js';
import { AppError } from '../errors/AppError.js';

export function requireDriver(authService: DriverAuthService): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) {
      next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Driver authentication is required.'));
      return;
    }

    try {
      request.driverAuth = await authService.authenticateAccessToken(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
