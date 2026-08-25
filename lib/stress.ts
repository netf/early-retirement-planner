import { expectedPath, mixReturn, planMix, type MarketPath } from "./market.ts";
import type { PlanInputs } from "./plan.ts";
import { simulatePlan } from "./simulate.ts";

/** One year of a stress sequence: nominal % returns, % inflation, % property value shock, rent as a share of normal. */
export type Shock = { market?: number; cash?: number; inflation?: number; property?: number; rent?: number; /** Percentage points taken off the stock and bond returns you entered. */ shift?: number };

export type StressTest = {
  key: string;
  label: string;
  /** The real-world episode the sequence is modelled on. */
  mimics: string;
  /** Age the sequence starts: the year you stop work (or today, if already retired). */
  fromAge: number;
  /** The sequence in words, consecutive identical years merged. Year 1 is fromAge. */
  sequence: { from: number; to: number; text: string }[];
  passes: boolean;
  endingBalance: number;
  firstShortfall: number | null;
  /** What the central path leaves at the end, for comparison. */
  centralEnding: number;
};

const repeat = (shock: Shock, years: number): Shock[] => Array.from({ length: years }, () => shock);

/** `years` may depend on the horizon so a shock can run for the whole retirement. */
export const STRESS_DEFINITIONS: { key: string; label: string; mimics: string; years: Shock[] | ((retirementYears: number) => Shock[]) }[] = [
  { key: "market-crash", label: "Early market crash", mimics: "A 2008-style crash in your first year of retirement, a weak second year, then a slow start to the recovery — the worst possible timing for a portfolio being drawn on.", years: [{ market: -30 }, { market: -12 }, { market: 4 }] },
  { key: "inflation-shock", label: "Five-year inflation shock", mimics: "A 1970s-style burst: prices rise 7% a year for five years while markets return only 3% — about −4% a year in real terms, with spending lifted to keep pace.", years: repeat({ market: 3, cash: 4, inflation: 7 }, 5) },
  { key: "property-shock", label: "Property and vacancy shock", mimics: "A housing slump the year you stop: values fall 22% and the rental stands empty for much of two years, so rent arrives at 35% then 65% of normal.", years: [{ property: -22, rent: 0.35 }, { rent: 0.65 }] },
  { key: "lower-returns", label: "Lower returns for life", mimics: "Your assumptions are simply 1.5% a year too optimistic: stocks and bonds each return 1.5 points less than entered, every year to the end. The quiet failure mode — no crash, just less than hoped.", years: (retirementYears) => repeat({ shift: -1.5 }, retirementYears) },
  { key: "lost-decade", label: "Lost decade", mimics: "Japan after 1990 or the US in 2000–2009: ten years of 2% returns against 3.5% inflation — the pot loses about 1.5% of its buying power every year for a decade.", years: repeat({ market: 2, inflation: 3.5 }, 10) },
];

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}%`;

function describe(shock: Shock): string {
  const parts: string[] = [];
  if (shock.market !== undefined) parts.push(`markets ${signed(shock.market)}`);
  if (shock.cash !== undefined) parts.push(`cash ${signed(shock.cash)}`);
  if (shock.inflation !== undefined) parts.push(`inflation ${shock.inflation}%`);
  if (shock.property !== undefined) parts.push(`property value ${signed(shock.property)}`);
  if (shock.rent !== undefined) parts.push(`rent at ${Math.round(shock.rent * 100)}% of normal`);
  if (shock.shift !== undefined) parts.push(`stocks and bonds ${signed(shock.shift)} a year vs entered`);
  return parts.join(" · ");
}

/** Merge consecutive identical years so a ten-year shock reads as one line. */
export function describeSequence(years: Shock[]): StressTest["sequence"] {
  const out: StressTest["sequence"] = [];
  years.forEach((shock, index) => {
    const text = describe(shock);
    const last = out.at(-1);
    if (last && last.text === text && last.to === index) last.to = index + 1;
    else out.push({ from: index + 1, to: index + 1, text });
  });
  return out;
}

function stressPath(plan: PlanInputs, years: Shock[]): MarketPath {
  const path = expectedPath(plan);
  const start = Math.max(0, plan.retirementAge - plan.currentAge);
  years.forEach((shock, offset) => {
    const index = start + offset;
    if (index >= path.inflation.length) return;
    // Market shocks are the return of an all-invested mix: stocks and bonds move together, a deliberately harsh simplification.
    if (shock.market !== undefined) { path.stockReturns[index] = shock.market; path.bondReturns[index] = shock.market; path.portfolioReturns[index] = shock.market; }
    if (shock.cash !== undefined) path.cashReturns[index] = shock.cash;
    if (shock.inflation !== undefined) path.inflation[index] = shock.inflation;
    if (shock.property !== undefined) path.propertyShocks[index] = shock.property;
    if (shock.rent !== undefined) path.vacancyMultipliers[index] = shock.rent;
    if (shock.shift !== undefined) {
      path.stockReturns[index] = path.stockReturns[index]! + shock.shift;
      path.bondReturns[index] = path.bondReturns[index]! + shock.shift;
      path.portfolioReturns[index] = mixReturn(planMix(plan), path.stockReturns[index]!, path.bondReturns[index]!, path.cashReturns[index]!);
    }
  });
  return path;
}

/** The years a definition applies to this plan: from the year work stops to the end. */
export function stressYears(definition: typeof STRESS_DEFINITIONS[number], plan: PlanInputs): Shock[] {
  const retirementYears = plan.planToAge - Math.max(plan.retirementAge, plan.currentAge) + 1;
  return typeof definition.years === "function" ? definition.years(retirementYears) : definition.years;
}

export function runStressTests(plan: PlanInputs): StressTest[] {
  const centralEnding = simulatePlan(plan).years.at(-1)?.totalInvestments ?? 0;
  const fromAge = Math.max(plan.retirementAge, plan.currentAge);
  return STRESS_DEFINITIONS.map((definition) => {
    const { key, label, mimics } = definition;
    const years = stressYears(definition, plan);
    const result = simulatePlan(plan, stressPath(plan, years), { detail: false });
    return { key, label, mimics, fromAge, sequence: describeSequence(years), passes: result.firstShortfall === null, endingBalance: result.years.at(-1)?.totalInvestments ?? 0, firstShortfall: result.firstShortfall, centralEnding };
  });
}
