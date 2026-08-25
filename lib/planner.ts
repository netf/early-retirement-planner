/** Public surface of the planning engine. UI code imports from here only. */
export * from "./backtest.ts";
export * from "./bridge.ts";
export * from "./history.ts";
export * from "./checks.ts";
export * from "./goals.ts";
export * from "./market.ts";
export * from "./money.ts";
export * from "./monteCarlo.ts";
export * from "./plan.ts";
export { PROFILES, PROFILE_IDS, accountRule, incomeRule, isProfileId, stateIncomeRule, taxSchedule } from "./profiles/index.ts";
export type { AccountRule, GuaranteedIncomeRule, Jurisdiction, ProfileId, SourceNote, TaxSchedule } from "./profiles/index.ts";
export { acquisitionCost, estimatedPropertyMonthlyCashIncome } from "./property.ts";
export * from "./simulate.ts";
export * from "./stress.ts";
export { incomeTax } from "./tax.ts";
export * from "./share.ts";
