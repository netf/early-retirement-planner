/**
 * The engine, run in the test process. The app is deterministic (seeded futures), so the
 * numbers on screen must equal what the engine says for the same plan — not merely look plausible.
 */
import { analyse, type Analysis } from "../app/analysis/analyse";
import { PROFILES, moneyFormat, normalisePlan, type MoneyFormat, type PlanInputs } from "../lib/planner";

const cache = new Map<string, Analysis>();

export function expectedFor(plan: PlanInputs): Analysis {
  const normalised = normalisePlan(plan);
  const key = JSON.stringify(normalised);
  let result = cache.get(key);
  if (!result) { result = analyse(normalised); cache.set(key, result); }
  return result;
}

export function moneyFor(plan: PlanInputs): MoneyFormat {
  const profile = PROFILES[plan.profile];
  return moneyFormat(profile.locale, profile.currency);
}

/** Digits only, so "£1,234" and "1 234 zł" both read as 1234. */
export function digits(text: string): number {
  const cleaned = text.replace(/[^\d.-]/g, "");
  return cleaned === "" ? 0 : Number(cleaned);
}
