import {
  allocateDiscountAmount,
  isExplicitDiscountPercentage,
  resolveDiscountFromAmountOrPercentage,
} from './resolve-discount';

const roundAmount = (value: number) => Math.round(value * 100) / 100;

describe('isExplicitDiscountPercentage', () => {
  it.each([5, 10, 12.5, 12.25, 99.99, 1, 9.9])(
    'treats %s as explicit user percentage',
    (pct) => {
      expect(isExplicitDiscountPercentage(pct)).toBe(true);
    },
  );

  it.each([0, 0.03, 0.02765957, 0.5, 12.345678, 100, -5, NaN, null, undefined, ''])(
    'rejects %s as non-explicit',
    (pct) => {
      expect(isExplicitDiscountPercentage(pct as never)).toBe(false);
    },
  );
});

describe('resolveDiscountFromAmountOrPercentage', () => {
  const base = 235_000;

  it('uses percentage when explicit (e.g. 10%)', () => {
    expect(
      resolveDiscountFromAmountOrPercentage({
        baseAmount: base,
        discountPercentage: 10,
        roundAmount,
      }),
    ).toEqual({ discountPercentage: 10, discountAmount: 23_500 });
  });

  it('uses percentage when explicit with decimals (12.5%)', () => {
    expect(
      resolveDiscountFromAmountOrPercentage({
        baseAmount: base,
        discountPercentage: 12.5,
        roundAmount,
      }),
    ).toEqual({ discountPercentage: 12.5, discountAmount: 29_375 });
  });

  it('prefers amount when % is tiny/lossy (SO 65 / DN case)', () => {
    expect(
      resolveDiscountFromAmountOrPercentage({
        baseAmount: base,
        discountPercentage: 0.03,
        discountAmount: 65,
        roundAmount,
      }),
    ).toEqual({ discountPercentage: 0.03, discountAmount: 65 });
  });

  it('does not recalculate 70.50 from rounded 0.03% when amount exists', () => {
    const resolved = resolveDiscountFromAmountOrPercentage({
      baseAmount: base,
      discountPercentage: 0.03,
      discountAmount: 65,
      roundAmount,
    });
    expect(resolved.discountAmount).not.toBe(70.5);
    expect(resolved.discountAmount).toBe(65);
  });

  it('uses amount only when amount is provided without explicit %', () => {
    expect(
      resolveDiscountFromAmountOrPercentage({
        baseAmount: base,
        discountAmount: 65,
        roundAmount,
      }),
    ).toEqual({ discountPercentage: 0, discountAmount: 65 });
  });

  it('legacy: converts precise tiny % once when amount is missing', () => {
    expect(
      resolveDiscountFromAmountOrPercentage({
        baseAmount: base,
        discountPercentage: 0.02765957,
        roundAmount,
      }),
    ).toEqual({ discountPercentage: 0.02765957, discountAmount: 65 });
  });

  it('does not round the percentage value itself', () => {
    const pct = 12.345678; // not explicit → amount path / legacy
    const resolved = resolveDiscountFromAmountOrPercentage({
      baseAmount: base,
      discountPercentage: pct,
      discountAmount: 100,
      roundAmount,
    });
    expect(resolved.discountPercentage).toBe(pct);
    expect(resolved.discountAmount).toBe(100);
  });
});

describe('allocateDiscountAmount', () => {
  it('allocates SO header discount proportionally to DN line base', () => {
    expect(
      allocateDiscountAmount(65, 235_000, 235_000, roundAmount),
    ).toBe(65);

    expect(allocateDiscountAmount(65, 235_000, 117_500, roundAmount)).toBe(
      32.5,
    );
  });
});
