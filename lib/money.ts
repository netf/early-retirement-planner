/** Small numeric helpers shared by the engine. Pure functions, no state. */

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

/** Convert a nominal annual rate into a real one: (1 + n) / (1 + i) − 1. */
export function realRate(nominalPercent: number, inflationPercent: number): number {
  return (1 + nominalPercent / 100) / (1 + inflationPercent / 100) - 1;
}

/** Linear-interpolated percentile of an ascending array. */
export function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower] ?? 0;
  const weight = position - lower;
  return (sortedValues[lower] ?? 0) * (1 - weight) + (sortedValues[upper] ?? 0) * weight;
}

/**
 * Find the smallest `x` in [0, high] with `f(x) >= target`, assuming `f` is monotonic.
 * Returns `high` when even f(high) falls short.
 */
export function solveMonotonic(f: (x: number) => number, target: number, high: number, iterations = 30): number {
  if (target <= 0 || high <= 0) return 0;
  let low = 0;
  let upper = high;
  for (let index = 0; index < iterations; index += 1) {
    const midpoint = (low + upper) / 2;
    if (f(midpoint) >= target) upper = midpoint;
    else low = midpoint;
  }
  return upper;
}

export type MoneyFormat = {
  /** Full figure with thousands separators and no decimals, e.g. £12,548. */
  format(value: number): string;
  /** Deterministic compact figure, e.g. £1.2m — identical on server and client. */
  compact(value: number): string;
  /** Number only, for tables that state the unit once. */
  plain(value: number): string;
  symbol: string;
};

/**
 * Currency formatters for a locale/currency pair. Compact notation is hand-rolled because
 * Intl's differs between ICU builds (Node renders "£200K", browsers "£200k"), which breaks hydration.
 */
export function moneyFormat(locale: string, currency: string): MoneyFormat {
  const full = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const symbol = full.formatToParts(1).find((part) => part.type === "currency")?.value ?? currency;
  const symbolFirst = full.formatToParts(1)[0]?.type === "currency";
  const wrap = (text: string) => symbolFirst ? `${symbol}${text}` : `${text} ${symbol}`;
  return {
    symbol,
    format: (value) => full.format(value),
    plain: (value) => number.format(value),
    compact(value) {
      const sign = value < 0 ? "-" : "";
      const magnitude = Math.abs(value);
      const scaled = (divisor: number, unit: string) => {
        const number = magnitude / divisor;
        return `${sign}${wrap(`${number.toFixed(number >= 100 ? 0 : 1).replace(/\.0$/, "")}${unit}`)}`;
      };
      if (magnitude >= 1_000_000) return scaled(1_000_000, "m");
      if (magnitude >= 1_000) return scaled(1_000, "k");
      return `${sign}${wrap(String(Math.round(magnitude)))}`;
    },
  };
}

/**
 * Level payment, taken at the START of each of `years` years, that exhausts `principal` at real
 * rate `rate` (as a fraction) — an annuity-due, matching a plan that spends before the year's growth.
 */
export function annuityPayment(principal: number, rate: number, years: number): number {
  if (years <= 0) return principal;
  if (Math.abs(rate) < 1e-12) return principal / years;
  return principal * rate / (1 - (1 + rate) ** -years) / (1 + rate);
}

/** Present value of `amount` received `years` from now at real rate `rate`. */
export function presentValue(amount: number, rate: number, years: number): number {
  return amount / (1 + rate) ** years;
}
