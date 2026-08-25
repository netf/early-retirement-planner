import { analyseBridge, assembleGoalMetrics, earliestRetirementAge, extraSavingRequired, generateMarketPath, runBacktests, runMonteCarlo, runStressTests, simulatePlan, sustainableMonthlySpending, type BacktestResult, type BridgeAnalysis, type GoalMetrics, type MonteCarloResult, type PlanInputs, type Projection, type StressTest } from "../../lib/planner";

export type PathKey = "central" | "typical" | "poor";

/** Everything the results side of the page needs for one plan. */
export type Analysis = {
  /** The central-assumptions path: average returns every year. */
  projection: Projection;
  /** Two of the simulated futures, year by year: the one nearest the median ending and the one nearest the 10th percentile. */
  paths: Record<PathKey, Projection>;
  monteCarlo: MonteCarloResult;
  /** Absent for quick experiments, which skip the solvers. */
  goals: GoalMetrics | null;
  stressTests: StressTest[];
  bridge: BridgeAnalysis;
  backtests: BacktestResult | null;
  /** True while this is the fast Monte-Carlo-only pass and the solvers are still running. */
  preview?: boolean;
};

/** The fast part: what the verdict and the charts need. About a quarter of a second. */
export function analyseQuick(plan: PlanInputs): Analysis {
  const projection = simulatePlan(plan);
  const monteCarlo = runMonteCarlo(plan);
  return {
    projection,
    paths: {
      central: projection,
      typical: simulatePlan(plan, generateMarketPath(plan, monteCarlo.representativeSeeds.typical)),
      poor: simulatePlan(plan, generateMarketPath(plan, monteCarlo.representativeSeeds.poor)),
    },
    monteCarlo,
    goals: null,
    stressTests: runStressTests(plan),
    bridge: analyseBridge(plan),
    backtests: null,
  };
}

/** The slow parts, each independent so they can run on separate workers at once. */
export const SLOW_PARTS = ["earliestAge", "extraSaving", "spending", "backtests"] as const;
export type SlowPart = typeof SLOW_PARTS[number];
export type SlowResults = { earliestAge: number | null; extraSaving: number | null; spending: number; backtests: BacktestResult };

export function analysePart<Part extends SlowPart>(plan: PlanInputs, part: Part): SlowResults[Part] {
  switch (part) {
    case "earliestAge": return earliestRetirementAge(plan) as SlowResults[Part];
    case "extraSaving": return extraSavingRequired(plan) as SlowResults[Part];
    case "spending": return sustainableMonthlySpending(plan) as SlowResults[Part];
    default: return runBacktests(plan) as SlowResults[Part];
  }
}

export function assemble(plan: PlanInputs, quick: Analysis, slow: SlowResults): Analysis {
  return { ...quick, goals: assembleGoalMetrics(plan, { earliestRetirementAge: slow.earliestAge, extraMonthlyRequired: slow.extraSaving, sustainableMonthlySpending: slow.spending }), backtests: slow.backtests, preview: false };
}

/** Everything in one go, on one thread: used by the inline fallback and by tests. */
export function analyse(plan: PlanInputs, quick = false): Analysis {
  const fast = analyseQuick(plan);
  if (quick) return fast;
  return assemble(plan, fast, { earliestAge: analysePart(plan, "earliestAge"), extraSaving: analysePart(plan, "extraSaving"), spending: analysePart(plan, "spending"), backtests: analysePart(plan, "backtests") });
}
