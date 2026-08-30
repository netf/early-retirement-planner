/**
 * How likely you are to still be around at each age — the missing half of "will the money last?".
 *
 * A Gompertz–Makeham hazard (a constant background rate plus one that doubles every ~7 years)
 * reproduces national period life tables closely from 40 onwards. Rather than shipping four
 * countries' tables, each profile carries life expectancy at 65 by sex and the curve is calibrated
 * to it. Results are within a year or two of the official tables, which is all a plan needs.
 */
import { PROFILES } from "./profiles/index.ts";
import { partnerAgeAt, type PlanInputs } from "./plan.ts";
import type { MonteCarloYear } from "./monteCarlo.ts";

const MAKEHAM = 0.0004;
const GOMPERTZ_SLOPE = 0.1;
const LAST_AGE = 115;

/** Survival from age 65 to each later age for a hazard a + b·e^(c·x), by numerical integration. */
function survivalFrom65(b: number): number[] {
  const out = [1];
  let s = 1;
  for (let age = 65; age < LAST_AGE; age += 1) {
    const hazard = MAKEHAM + b * Math.exp(GOMPERTZ_SLOPE * (age + 0.5));
    s *= Math.exp(-hazard);
    out.push(s);
  }
  return out;
}

const cache = new Map<number, number>();

/** The Gompertz scale that gives the requested life expectancy at 65. */
function calibrate(e65: number): number {
  const hit = cache.get(e65);
  if (hit !== undefined) return hit;
  let lo = 1e-8, hi = 1e-2;
  for (let step = 0; step < 60; step += 1) {
    const mid = Math.sqrt(lo * hi);
    const expectancy = survivalFrom65(mid).reduce((sum, s) => sum + s, 0) - 0.5;
    if (expectancy > e65) lo = mid; else hi = mid;
  }
  const b = Math.sqrt(lo * hi);
  cache.set(e65, b);
  return b;
}

/** Probability that someone aged `from` today is alive at `to`, for one sex's life expectancy at 65. */
function survive(e65: number, from: number, to: number): number {
  if (to <= from) return 1;
  const b = calibrate(e65);
  let s = 1;
  for (let age = from; age < to; age += 1) s *= Math.exp(-(MAKEHAM + b * Math.exp(GOMPERTZ_SLOPE * (age + 0.5))));
  return s;
}

/** Unisex: the average of the male and female survival curves (the plan does not ask for sex). */
export function aliveAt(plan: PlanInputs, age: number): number {
  const { e65Male, e65Female } = PROFILES[plan.profile].mortality;
  const one = (from: number, to: number) => (survive(e65Male, from, to) + survive(e65Female, from, to)) / 2;
  const you = one(plan.currentAge, age);
  if (!plan.partner) return you;
  // A household needs the money while either of them is alive.
  const partner = one(plan.partner.currentAge, partnerAgeAt(plan, age));
  return 1 - (1 - you) * (1 - partner);
}

/** The age at which the chance of still being alive first drops below one half. */
export function medianLifespan(plan: PlanInputs): number {
  for (let age = plan.currentAge; age < LAST_AGE; age += 1) if (aliveAt(plan, age) < 0.5) return age;
  return LAST_AGE;
}

/**
 * Chance of running out of money while still alive — the failure rate that matters.
 * Each year's newly failed futures count only with the probability of being there to suffer them.
 */
export function ruinWhileAlive(plan: PlanInputs, years: MonteCarloYear[]): number {
  let risk = 0;
  let previous = 0;
  for (const year of years) {
    const newlyFailed = Math.max(0, year.failedByNow - previous);
    risk += newlyFailed * aliveAt(plan, year.age);
    previous = Math.max(previous, year.failedByNow);
  }
  return risk;
}
