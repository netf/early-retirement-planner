import { analyseBridge, calculateGoalMetrics, generateMarketPath, runBacktests, runMonteCarlo, runStressTests, simulatePlan, type BacktestResult, type BridgeAnalysis, type GoalMetrics, type MonteCarloResult, type PlanInputs, type Projection, type StressTest } from "../../lib/planner";

/** Everything the results side of the page needs for one plan. */
export type PathKey = "central" | "typical" | "poor";

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

/** Pure and serialisable, so it runs identically in a worker or inline. */
export function analyse(plan: PlanInputs, quick = false): Analysis {
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
    goals: quick ? null : calculateGoalMetrics(plan),
    stressTests: runStressTests(plan),
    bridge: analyseBridge(plan),
    backtests: quick ? null : runBacktests(plan),
  };
}
