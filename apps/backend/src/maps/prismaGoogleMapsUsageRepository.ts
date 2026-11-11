import type { PrismaClient } from '@prisma/client';
import type { GoogleMapsSku, GoogleMapsUsageRepository } from './types.js';

export class PrismaGoogleMapsUsageRepository implements GoogleMapsUsageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveMonthlyUsage(
    sku: GoogleMapsSku,
    month: Date,
    monthlyLimit: number,
  ): Promise<boolean> {
    const reservations = await this.prisma.$queryRaw<{ requestCount: number }[]>`
      INSERT INTO "google_maps_monthly_usage" ("month", "sku", "request_count", "updated_at")
      VALUES (${month}::date, ${sku}, 1, NOW())
      ON CONFLICT ("month", "sku") DO UPDATE
      SET "request_count" = "google_maps_monthly_usage"."request_count" + 1,
          "updated_at" = NOW()
      WHERE "google_maps_monthly_usage"."request_count" < ${monthlyLimit}
      RETURNING "request_count" AS "requestCount"
    `;

    return reservations.length === 1;
  }
}
