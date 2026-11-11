import { z } from 'zod';

const normalizedPhoneSchema = z
  .string()
  .trim()
  .min(9)
  .max(32)
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone number must use international E.164 format.'));

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(255);

const profileImageSchema = z
  .string()
  .url()
  .max(512)
  .refine((value) => new URL(value).protocol === 'https:', 'Profile image URL must use HTTPS.');

export const sendOtpSchema = z.object({
  phone: normalizedPhoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: normalizedPhoneSchema,
  otp: z.string().regex(/^\d{6}$/),
  fullName: z.string().trim().min(2).max(150).optional(),
  email: emailSchema.optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(40).max(128),
});

export const updateCustomerProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150).optional(),
    email: emailSchema.nullable().optional(),
    profileImageUrl: profileImageSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field must be provided.');
