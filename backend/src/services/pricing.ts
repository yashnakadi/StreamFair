import { PricingConfig, DEFAULT_PRICING } from '../types';

/**
 * 1:1 proportional pricing.
 *
 * totalPrice = base × (avgWatchRatioPercent / 100)
 *
 * - avgWatchRatioPercent is 0–100 (community engagement level).
 * - At 100% ratio → full base price.
 * - At 50% ratio  → half the base price.
 * - At 0% ratio   → free.
 *
 * If an overridePrice is set, it replaces the base price.
 * Otherwise, base price = baseCentsPerSecond × durationSeconds
 */
export function computePrice(
  avgWatchRatioPercent: number,
  durationSeconds: number,
  overridePrice: number | null,
  config: PricingConfig = DEFAULT_PRICING
): number {
  const base = (overridePrice !== null && overridePrice !== undefined)
    ? overridePrice
    : config.baseCentsPerSecond * durationSeconds;

  return Math.round(base * (avgWatchRatioPercent / 100));
}
