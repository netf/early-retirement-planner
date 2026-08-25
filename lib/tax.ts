import type { TaxSchedule } from "./profiles/types.ts";

/**
 * Progressive income tax for one year. `income` is gross taxable income; the schedule
 * supplies a zero-rate allowance (optionally tapered away above a threshold), the bands
 * measured in taxable income above that allowance, and an optional flat surcharge
 * (used for a US state tax entered as a percentage).
 */
export function incomeTax(income: number, schedule: TaxSchedule, surchargePercent = 0): number {
  const gross = Math.max(0, income);
  let allowance = schedule.allowance;
  if (schedule.allowanceTaper && gross > schedule.allowanceTaper.from) {
    allowance = Math.max(0, allowance - (gross - schedule.allowanceTaper.from) * schedule.allowanceTaper.rate);
  }
  const taxable = Math.max(0, gross - allowance);
  let remaining = taxable;
  let floor = 0;
  let tax = 0;
  for (const band of schedule.bands) {
    const width = band.upTo - floor;
    const amount = Math.min(remaining, width);
    tax += amount * band.rate;
    remaining -= amount;
    floor = band.upTo;
    if (remaining <= 0) break;
  }
  return tax + taxable * surchargePercent / 100;
}

/** Extra tax caused by adding `extra` on top of `base` income. */
export function marginalTax(base: number, extra: number, schedule: TaxSchedule, surchargePercent = 0): number {
  return Math.max(0, incomeTax(base + extra, schedule, surchargePercent) - incomeTax(base, schedule, surchargePercent));
}

/** Room left in the zero-rate allowance given income already earned this year. */
export function allowanceRoom(baseIncome: number, schedule: TaxSchedule): number {
  return Math.max(0, schedule.allowance - Math.max(0, baseIncome));
}
