import { AppError } from '../errors/AppError.js';

const PAISE_PER_RUPEE = 100n;
const CENTIMETERS_PER_KILOMETER = 100_000n;
const BASE_FARE_PAISE = 3_000n;

const progressiveSlabs = [
  { upperBoundCm: 500_000, ratePaisePerKm: 1_300, label: '1.6–5 km at ₹13/km' },
  { upperBoundCm: 1_000_000, ratePaisePerKm: 1_100, label: '5–10 km at ₹11/km' },
  { upperBoundCm: 2_000_000, ratePaisePerKm: 1_050, label: '10–20 km at ₹10.50/km' },
  { upperBoundCm: Number.POSITIVE_INFINITY, ratePaisePerKm: 1_000, label: 'Above 20 km at ₹10/km' },
] as const;

export const AUTO_FARE_ROUNDING_POLICY = 'NEAREST_PAISE_HALF_UP_FINAL_TOTAL' as const;

export interface FareSlabBreakdown {
  label: string;
  distanceKm: number;
  ratePerKm: number | null;
  amount: number;
}

export interface AutoFare {
  distanceMeters: number;
  distanceKm: number;
  baseAmount: number;
  distanceAmount: number;
  timeAmount: 0;
  platformFeeAmount: 0;
  driverCommissionAmount: 0;
  totalAmount: number;
  roundingPolicy: typeof AUTO_FARE_ROUNDING_POLICY;
  distanceBreakdown: FareSlabBreakdown[];
}

export function calculateAutoFare(distanceMeters: unknown): AutoFare {
  if (
    typeof distanceMeters !== 'number' ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0
  ) {
    throw new AppError(400, 'INVALID_ROUTE_DISTANCE', 'A positive, finite ORS route distance is required.');
  }

  const distanceCm = Math.round(distanceMeters * 100);
  if (!Number.isSafeInteger(distanceCm) || distanceCm <= 0) {
    throw new AppError(400, 'INVALID_ROUTE_DISTANCE', 'The ORS route distance is outside the supported range.');
  }

  let remainingCm = distanceCm - 160_000;
  let previousUpperBoundCm = 160_000;
  let distancePaiseNumerator = 0n;
  const slabNumerators: { label: string; distanceCm: number; ratePaisePerKm: number; numerator: bigint }[] = [];

  for (const slab of progressiveSlabs) {
    if (remainingCm <= 0) break;
    const availableCm = slab.upperBoundCm - previousUpperBoundCm;
    const slabDistanceCm = Math.min(remainingCm, availableCm);
    if (slabDistanceCm <= 0) break;
    const numerator = BigInt(slabDistanceCm) * BigInt(slab.ratePaisePerKm);
    distancePaiseNumerator += numerator;
    slabNumerators.push({
      label: slab.label,
      distanceCm: slabDistanceCm,
      ratePaisePerKm: slab.ratePaisePerKm,
      numerator,
    });
    remainingCm -= slabDistanceCm;
    previousUpperBoundCm = slab.upperBoundCm;
  }

  const denominator = CENTIMETERS_PER_KILOMETER;
  const distancePaise = (distancePaiseNumerator + denominator / 2n) / denominator;
  const totalPaise = BASE_FARE_PAISE + distancePaise;
  const roundedSlabAmounts = slabNumerators.map((slab) =>
    Number((slab.numerator + denominator / 2n) / denominator),
  );
  const roundedSlabTotal = roundedSlabAmounts.reduce((sum, amount) => sum + amount, 0);
  if (roundedSlabAmounts.length > 0) {
    roundedSlabAmounts[roundedSlabAmounts.length - 1] += Number(distancePaise) - roundedSlabTotal;
  }

  return {
    distanceMeters: distanceCm / 100,
    distanceKm: distanceCm / 100_000,
    baseAmount: Number(BASE_FARE_PAISE) / Number(PAISE_PER_RUPEE),
    distanceAmount: Number(distancePaise) / Number(PAISE_PER_RUPEE),
    timeAmount: 0,
    platformFeeAmount: 0,
    driverCommissionAmount: 0,
    totalAmount: Number(totalPaise) / Number(PAISE_PER_RUPEE),
    roundingPolicy: AUTO_FARE_ROUNDING_POLICY,
    distanceBreakdown: [
      {
        label: 'First 1.6 km fixed fare',
        distanceKm: Math.min(distanceCm, 160_000) / 100_000,
        ratePerKm: null,
        amount: Number(BASE_FARE_PAISE) / Number(PAISE_PER_RUPEE),
      },
      ...slabNumerators.map((slab, index) => ({
        label: slab.label,
        distanceKm: slab.distanceCm / 100_000,
        ratePerKm: slab.ratePaisePerKm / Number(PAISE_PER_RUPEE),
        amount: roundedSlabAmounts[index] / Number(PAISE_PER_RUPEE),
      })),
    ],
  };
}
