/**
 * Discount resolution rule (no entity/schema changes):
 * 1. Default: use discountAmount (not a tiny/lossy derived %).
 * 2. If discountPercentage is user-entered style (1–2 digits, optional 1–2
 *    decimals — e.g. 5, 10.5, 12.25), compute amount from that percentage.
 * 3. Legacy: if only a non-explicit % is sent (no amount), convert that % once.
 * Percentage itself is never rounded/truncated before amount conversion.
 */

const EXPLICIT_PERCENTAGE_PATTERN = /^\d{1,2}(\.\d{1,2})?$/;

export function isExplicitDiscountPercentage(
  value: number | string | null | undefined,
): boolean {
  if (value == null || value === '') {
    return false;
  }
  const pct = Number(value);
  // 1–99 with at most 2 decimal places (5, 10.5, 12.25). Not 0.03 / 0.0277.
  if (!Number.isFinite(pct) || pct < 1 || pct >= 100) {
    return false;
  }
  // Reject values that need >2 decimals (do not round first — toFixed would lie).
  const scaled = pct * 100;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    return false;
  }
  const trimmed = pct.toFixed(2).replace(/\.?0+$/, '');
  return EXPLICIT_PERCENTAGE_PATTERN.test(trimmed);
}

export function resolveDiscountFromAmountOrPercentage(options: {
  baseAmount: number;
  discountAmount?: number | null;
  discountPercentage?: number | null;
  roundAmount: (value: number) => number;
}): { discountPercentage: number; discountAmount: number } {
  const baseAmount = Number(options.baseAmount) || 0;
  const incomingPercentage = Number(options.discountPercentage ?? 0);
  const hasAmount = options.discountAmount != null;

  if (isExplicitDiscountPercentage(incomingPercentage)) {
    return {
      discountPercentage: incomingPercentage,
      discountAmount: options.roundAmount(
        (baseAmount * incomingPercentage) / 100,
      ),
    };
  }

  if (hasAmount) {
    return {
      discountPercentage: incomingPercentage,
      discountAmount: options.roundAmount(Number(options.discountAmount)),
    };
  }

  return {
    discountPercentage: incomingPercentage,
    discountAmount: options.roundAmount(
      (baseAmount * incomingPercentage) / 100,
    ),
  };
}

export function allocateDiscountAmount(
  sourceDiscountAmount: number,
  sourceBase: number,
  targetBase: number,
  roundAmount: (value: number) => number,
): number {
  if (sourceBase <= 0) {
    return 0;
  }
  return roundAmount((Number(sourceDiscountAmount) * targetBase) / sourceBase);
}
