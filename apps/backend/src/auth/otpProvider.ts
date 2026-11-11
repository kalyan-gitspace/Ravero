import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

export interface OtpDeliveryResult {
  developmentCode?: string;
}

export interface OtpProvider {
  send(phone: string, code: string): Promise<OtpDeliveryResult>;
}

export class DevelopmentOtpProvider implements OtpProvider {
  async send(_phone: string, code: string): Promise<OtpDeliveryResult> {
    if (env.NODE_ENV === 'production') {
      throw new AppError(503, 'OTP_PROVIDER_UNAVAILABLE', 'OTP delivery is unavailable.');
    }

    return { developmentCode: code };
  }
}

export class SmsOtpProvider implements OtpProvider {
  async send(): Promise<OtpDeliveryResult> {
    throw new AppError(503, 'SMS_PROVIDER_NOT_CONFIGURED', 'SMS delivery is not configured.');
  }
}

export function createOtpProvider(): OtpProvider {
  return env.OTP_PROVIDER === 'development'
    ? new DevelopmentOtpProvider()
    : new SmsOtpProvider();
}
