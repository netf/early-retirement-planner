import { clamp } from "./money.ts";
import { PROFILES, isProfileId, stateIncomeRule, type AccountRule, type Jurisdiction, type ProfileId } from "./profiles/index.ts";

/**
 * fixed      – the same real amount every year.
 * guardrails – protect only: cut after a severe down year, never below the floor.
 * flex       – Guyton–Klinger style: raise or cut in steps when the withdrawal rate leaves a band around its starting value, bounded by floor and ceiling.
 * amortise   – each year spend the level payment that would run the pot (plus the value of future income) down to a chosen
 *              amount by the end of the plan, at a conservative real return; smoothed, bounded by floor and ceiling.
 */
export type SpendingStrategy = "fixed" | "guardrails" | "flex" | "amortise";
export type SpendingMode = "level" | "phased";
export type PropertyIncomeMode = "net" | "detailed";

export type AccountInput = {
  balance: number;
  monthlyContribution: number;
  /** Override of the rule's access age, only meaningful for age-gated accounts. */
  accessAge?: number;
};

export type GuaranteedIncomeInput = { annual: number; fromAge: number };

/** One account as the user owns it — "Vanguard SIPP", "old employer pension" — of a profile-defined type that carries the rules. */
export type Pot = { id: string; type: string; name: string; balance: number; monthlyContribution: number };

export type AccountFamily = "pension" | "taxfree" | "taxable" | "cash";

/** A workplace, defined-benefit or private pension (or annuity): a fixed amount, in today's money, from a set age, taxed as income. */
export type PensionIncome = { id: string; name: string; annual: number; fromAge: number };

/** One age of the forecast frozen at baseline time, in the money of that day. */
export type BaselineYear = { age: number; p10: number; p25: number; median: number; p75: number; p90: number; central: number; /** Money added minus money taken on the central path that year; used to work out realised returns. */ flows: number };

/** The forecast the plan is tracked against: set once, deliberately, when the plan is "the plan". */
export type Baseline = { setAt: string; age: number; startTotal: number; successRate: number; targetConfidencePercent: number; monthlySpending: number; years: BaselineYear[] };

/** A dated snapshot of the real balances, logged by the user. */
export type CheckIn = { id: string; date: string; age: number; total: number; balances: Record<string, number> };

/** One row of guaranteed income the engine applies: the state rule plus every pension, on a common shape. */
export type IncomeStream = { id: string; label: string; annual: number; fromAge: number; taxableShare: number };

export type SpendingPhase = { id: string; label: string; startAge: number; endAge: number; monthlyAmount: number };
export type OneOffExpense = { id: string; label: string; age: number; amount: number };

export type PropertyAsset = {
  id: string;
  name: string;
  purchaseAge: number;
  value: number;
  purchaseCostBasis: number;
  mortgage: number;
  mortgageRatePercent: number;
  monthlyMortgagePayment: number;
  incomeMode: PropertyIncomeMode;
  monthlyNetIncome: number;
  monthlyRent: number;
  vacancyPercent: number;
  runningCostsPercent: number;
  rentGrowthPercent: number;
  annualGrowthPercent: number;
  rentFromAge: number;
  sellAtAge: number;
  purchaseCostsPercent: number;
  saleCostsPercent: number;
  estimatedCgtPercent: number;
};

export type PortfolioAssumptions = {
  stocksPercent: number;
  bondsPercent: number;
  stockReturnPercent: number;
  bondReturnPercent: number;
  cashReturnPercent: number;
  inflationPercent: number;
  annualFeePercent: number;
  /** Annual drag on accounts whose growth tax is of kind "drag". */
  taxableDragPercent: number;
  stockVolatilityPercent: number;
  bondVolatilityPercent: number;
  inflationVolatilityPercent: number;
};

export type PlanInputs = {
  profile: ProfileId;
  taxVariant: string;
  taxSurchargePercent: number;
  currentAge: number;
  retirementAge: number;
  planToAge: number;
  targetConfidencePercent: number;
  desiredMonthlySpending: number;
  spendingMode: SpendingMode;
  essentialMonthlySpending: number;
  spendingStrategy: SpendingStrategy;
  guardrailCutPercent: number;
  /** Flex only: the most you would want to spend per month, in today's money. */
  spendingCeilingMonthly: number;
  /** Flex only: how far the withdrawal rate may drift from its starting value before a step, in percent (20 = ±20%). */
  flexBandPercent: number;
  /** Flex only: the size of each raise or cut, in percent. */
  flexStepPercent: number;
  /**
   * Flex only, once retired: the withdrawal rate the rule compares against, fixed in the year
   * you stopped work. Kept in the plan so re-entering balances later never re-anchors the rule.
   */
  flexAnchor: { rate: number; fromAge: number } | null;
  /** Amortise only: what you want left at the plan-to age, in today's money (0 = spend it all). */
  amortiseTargetAtEnd: number;
  /** Amortise only: the real return the payment is worked out at. Lower is more cautious. */
  amortiseRealReturnPercent: number;
  /** Amortise only: the most spending may change from one year to the next, in percent (0 = no smoothing). */
  amortiseSmoothingPercent: number;
  /** ISO date the balances were last entered, or null if never stamped. */
  balancesAsOf: string | null;
  spendingPhases: SpendingPhase[];
  oneOffExpenses: OneOffExpense[];
  /** What the user owns, one entry per real account. The engine works on `accounts`, the per-type sum of these. */
  pots: Pot[];
  /** Per account type: the aggregate of `pots` plus type-level settings (access age). Derived; keep it via `withPots`. */
  accounts: Record<string, AccountInput>;
  guaranteedIncome: Record<string, GuaranteedIncomeInput>;
  /** Any number of pensions beyond the state one, each with its own start age. */
  pensions: PensionIncome[];
  /** The frozen forecast this plan is tracked against, if the user has set one. */
  baseline: Baseline | null;
  /** Real balances logged over time, oldest first. */
  checkIns: CheckIn[];
  /** When the user last copied a link or exported a file — the only copies that outlive this browser. */
  savedAt: string | null;
  /** When data worth keeping last changed: a baseline set, a check-in logged, balances entered. */
  changedAt: string | null;
  /** Tax-free withdrawal allowance already consumed (UK lump-sum allowance). */
  taxFreeUsed: number;
  portfolio: PortfolioAssumptions;
  properties: PropertyAsset[];
};

export const STORAGE_KEY = "retirement-plan-v3";
export const LEGACY_STORAGE_KEYS = ["harbour-retirement-plan-v2", "harbour-retirement-plan-v1"];

export const DEFAULT_PORTFOLIO: PortfolioAssumptions = {
  stocksPercent: 80,
  bondsPercent: 15,
  stockReturnPercent: 7.5,
  bondReturnPercent: 4.2,
  cashReturnPercent: 3,
  inflationPercent: 2.5,
  annualFeePercent: 0.25,
  taxableDragPercent: 0.4,
  stockVolatilityPercent: 18,
  bondVolatilityPercent: 7,
  inflationVolatilityPercent: 1.5,
};

type UnknownRecord = Record<string, unknown>;

let idCounter = 0;
/** Stable, render-safe ids: no Date.now() or Math.random() in the render path. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function profileOf(plan: PlanInputs): Jurisdiction {
  return PROFILES[plan.profile];
}

export function createProperty(profile: Jurisdiction, index: number, currentAge: number): PropertyAsset {
  const d = profile.defaults.property;
  return {
    id: newId("property"),
    name: `Rental property ${index}`,
    purchaseAge: currentAge,
    value: d.value,
    purchaseCostBasis: d.purchaseCostBasis,
    mortgage: d.mortgage,
    mortgageRatePercent: d.mortgageRatePercent,
    monthlyMortgagePayment: d.monthlyMortgagePayment,
    incomeMode: "detailed",
    monthlyNetIncome: d.monthlyNetIncome,
    monthlyRent: d.monthlyRent,
    vacancyPercent: 8,
    runningCostsPercent: 18,
    rentGrowthPercent: 0,
    annualGrowthPercent: 2.5,
    rentFromAge: Math.max(currentAge, profile.defaults.retirementAge),
    sellAtAge: 0,
    purchaseCostsPercent: 5,
    saleCostsPercent: 2,
    estimatedCgtPercent: profile.property.defaultGainRatePercent,
  };
}

export function createDefaultPlan(profileId: ProfileId): PlanInputs {
  const profile = PROFILES[profileId];
  const d = profile.defaults;
  return {
    profile: profileId,
    taxVariant: profile.taxVariants[0]!.id,
    taxSurchargePercent: 0,
    currentAge: d.currentAge,
    retirementAge: d.retirementAge,
    planToAge: d.planToAge,
    targetConfidencePercent: 85,
    desiredMonthlySpending: d.desiredMonthlySpending,
    spendingMode: "level",
    essentialMonthlySpending: d.essentialMonthlySpending,
    spendingStrategy: "guardrails",
    guardrailCutPercent: 10,
    spendingCeilingMonthly: Math.round(d.desiredMonthlySpending * 1.5),
    flexBandPercent: 20,
    flexStepPercent: 10,
    flexAnchor: null,
    amortiseTargetAtEnd: 0,
    amortiseRealReturnPercent: 3,
    amortiseSmoothingPercent: 10,
    balancesAsOf: null,
    spendingPhases: d.spendingPhases.map((phase, index) => ({ ...phase, id: `phase-${index + 1}` })),
    oneOffExpenses: [],
    pots: potsFromAccounts(profile, Object.fromEntries(profile.accounts.map((rule) => [rule.id, { ...rule.defaults }]))),
    accounts: Object.fromEntries(profile.accounts.map((rule) => [rule.id, { ...rule.defaults, ...(rule.accessAge === null ? {} : { accessAge: rule.accessAge }) }])),
    guaranteedIncome: Object.fromEntries(profile.guaranteedIncome.map((rule) => [rule.id, { ...rule.defaults }])),
    pensions: [],
    baseline: null,
    checkIns: [],
    savedAt: null,
    changedAt: null,
    taxFreeUsed: 0,
    portfolio: { ...DEFAULT_PORTFOLIO },
    properties: [{ ...createProperty(profile, 1, d.currentAge), id: "property-1", name: "Rental property" }],
  };
}

export const DEFAULT_PLAN: PlanInputs = createDefaultPlan("uk");

/* ── derived facts ──────────────────────────────────────────────────── */

/** Earliest age any age-gated account opens; the end of the bridge years. */
export function pensionAccessAge(plan: PlanInputs): number {
  const profile = profileOf(plan);
  const ages = profile.accounts
    .filter((rule) => rule.accessAge !== null)
    .map((rule) => plan.accounts[rule.id]?.accessAge ?? rule.accessAge ?? plan.retirementAge);
  return ages.length > 0 ? Math.min(...ages) : plan.retirementAge;
}

export function statePensionAge(plan: PlanInputs): number {
  const rule = stateIncomeRule(profileOf(plan));
  return plan.guaranteedIncome[rule.id]?.fromAge ?? rule.defaults.fromAge;
}

export function spendingAtAge(plan: PlanInputs, age: number): number {
  if (plan.spendingMode === "level") return Math.max(0, plan.desiredMonthlySpending) * 12;
  const ordered = [...plan.spendingPhases].sort((left, right) => left.startAge - right.startAge);
  const phase = ordered.filter((item) => age >= item.startAge && age <= item.endAge).sort((left, right) => right.startAge - left.startAge)[0];
  const fallback = age < (ordered[0]?.startAge ?? age) ? ordered[0] : ordered.at(-1);
  return Math.max(0, phase?.monthlyAmount ?? fallback?.monthlyAmount ?? plan.essentialMonthlySpending) * 12;
}

export function activeMonthlySpending(plan: PlanInputs): number {
  return spendingAtAge(plan, plan.retirementAge) / 12;
}

export function totalCurrentInvestments(plan: PlanInputs): number {
  return Object.values(plan.accounts).reduce((sum, account) => sum + account.balance, 0);
}

export function totalMonthlyContributions(plan: PlanInputs): number {
  return Object.values(plan.accounts).reduce((sum, account) => sum + account.monthlyContribution, 0);
}

export function allocationCashPercent(plan: PlanInputs): number {
  return Math.max(0, 100 - plan.portfolio.stocksPercent - plan.portfolio.bondsPercent);
}

/* ── normalisation and migration ────────────────────────────────────── */

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** Lift a plan saved by the UK-only v1/v2 model into the v3 shape before normalising. */
function liftLegacy(raw: UnknownRecord): UnknownRecord {
  if ("accounts" in raw || "profile" in raw) return raw;
  const legacyAccount = (key: string, balanceKey: string, contributionKey: string) => {
    const nested = asRecord(raw[key]);
    return {
      balance: asNumber(nested.balance, asNumber(raw[balanceKey], Number.NaN)),
      monthlyContribution: asNumber(nested.monthlyContribution, asNumber(raw[contributionKey], Number.NaN)),
    };
  };
  const portfolio = asRecord(raw.portfolio);
  return {
    ...raw,
    profile: "uk",
    taxVariant: raw.taxRegion === "scotland" ? "scotland" : "rest-of-uk",
    accounts: {
      isa: legacyAccount("isa", "isaBalance", "isaMonthlyContribution"),
      sipp: { ...legacyAccount("sipp", "sippBalance", "sippMonthlyContribution"), accessAge: asNumber(raw.pensionAccessAge, 57) },
      gia: legacyAccount("gia", "accessibleBalance", "accessibleMonthlyContribution"),
      cash: legacyAccount("cash", "", ""),
    },
    guaranteedIncome: {
      statePension: { annual: asNumber(raw.statePensionAnnual, Number.NaN), fromAge: asNumber(raw.statePensionAge, Number.NaN) },
      definedBenefit: { annual: asNumber(raw.definedBenefitAnnual, Number.NaN), fromAge: asNumber(raw.definedBenefitAge, Number.NaN) },
    },
    taxFreeUsed: asNumber(raw.taxFreePensionUsed, 0),
    portfolio: { ...portfolio, taxableDragPercent: asNumber(portfolio.taxableDragPercent, asNumber(portfolio.giaTaxDragPercent, Number.NaN)) },
    desiredMonthlySpending: asNumber(raw.desiredMonthlySpending, asNumber(raw.monthlySpending, Number.NaN)),
  };
}

function normaliseProperty(raw: unknown, index: number, profile: Jurisdiction, currentAge: number): PropertyAsset {
  const value = asRecord(raw);
  const base = createProperty(profile, index + 1, currentAge);
  const numeric = <Key extends keyof PropertyAsset>(key: Key) => asNumber(value[key], base[key] as number);
  const propertyValue = Math.max(0, numeric("value"));
  return {
    ...base,
    id: asString(value.id, `property-${index + 1}`),
    name: asString(value.name, base.name),
    purchaseAge: numeric("purchaseAge"),
    value: propertyValue,
    purchaseCostBasis: Math.max(0, numeric("purchaseCostBasis")),
    mortgage: clamp(numeric("mortgage"), 0, propertyValue),
    mortgageRatePercent: numeric("mortgageRatePercent"),
    monthlyMortgagePayment: numeric("monthlyMortgagePayment"),
    incomeMode: value.incomeMode === "net" ? "net" : "detailed",
    monthlyNetIncome: numeric("monthlyNetIncome"),
    monthlyRent: numeric("monthlyRent"),
    vacancyPercent: numeric("vacancyPercent"),
    runningCostsPercent: numeric("runningCostsPercent"),
    rentGrowthPercent: numeric("rentGrowthPercent"),
    annualGrowthPercent: numeric("annualGrowthPercent"),
    rentFromAge: numeric("rentFromAge"),
    sellAtAge: numeric("sellAtAge"),
    purchaseCostsPercent: numeric("purchaseCostsPercent"),
    saleCostsPercent: numeric("saleCostsPercent"),
    estimatedCgtPercent: numeric("estimatedCgtPercent"),
  };
}

/**
 * Turn anything (stored JSON, an import, a partial object) into a valid plan. Unknown
 * fields are dropped, missing ones take the profile's defaults, corrupt numbers are replaced.
 */
/** The single non-state slot each profile used to have; a saved amount there becomes the first pension in the list. */
const LEGACY_PENSION_SLOT: Record<ProfileId, { id: string; name: string }> = {
  uk: { id: "definedBenefit", name: "Defined benefit pension" },
  us: { id: "pension", name: "Employer pension" },
  pl: { id: "other", name: "Other pension" },
};

function legacyPensions(profileId: ProfileId, rawIncome: UnknownRecord): PensionIncome[] {
  const slot = LEGACY_PENSION_SLOT[profileId];
  const stored = asRecord(rawIncome[slot.id]);
  const annual = asNumber(stored.annual, 0);
  return annual > 0 ? [{ id: `pension-${slot.id}`, name: slot.name, annual, fromAge: asNumber(stored.fromAge, 65) }] : [];
}

function normalisePension(item: unknown, index: number): PensionIncome {
  const raw = asRecord(item);
  return { id: asString(raw.id, `pension-${index + 1}`), name: asString(raw.name, `Pension ${index + 1}`), annual: Math.max(0, asNumber(raw.annual, 0)), fromAge: clamp(asNumber(raw.fromAge, 65), 18, 110) };
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** A baseline is only kept whole: every year must carry every figure, or the plan is treated as untracked. */
function normaliseBaseline(value: unknown): Baseline | null {
  const raw = asRecord(value);
  if (!Array.isArray(raw.years) || raw.years.length === 0 || typeof raw.setAt !== "string" || Number.isNaN(Date.parse(raw.setAt))) return null;
  const years: BaselineYear[] = [];
  for (const item of raw.years) {
    const year = asRecord(item);
    const keys = ["age", "p10", "p25", "median", "p75", "p90", "central", "flows"] as const;
    if (!keys.every((key) => isFiniteNumber(year[key]))) return null;
    years.push(Object.fromEntries(keys.map((key) => [key, year[key] as number])) as BaselineYear);
  }
  if (!isFiniteNumber(raw.age) || !isFiniteNumber(raw.startTotal) || !isFiniteNumber(raw.successRate)) return null;
  return { setAt: raw.setAt, age: raw.age, startTotal: raw.startTotal, successRate: raw.successRate, targetConfidencePercent: asNumber(raw.targetConfidencePercent, 85), monthlySpending: asNumber(raw.monthlySpending, 0), years };
}

function normaliseCheckIn(item: unknown, index: number): CheckIn | null {
  const raw = asRecord(item);
  if (typeof raw.date !== "string" || Number.isNaN(Date.parse(raw.date)) || !isFiniteNumber(raw.total)) return null;
  const balances = Object.fromEntries(Object.entries(asRecord(raw.balances)).filter((entry): entry is [string, number] => isFiniteNumber(entry[1])));
  return { id: asString(raw.id, `checkin-${index + 1}`), date: raw.date.slice(0, 10), age: asNumber(raw.age, 0), total: raw.total, balances };
}

/** Which colour family an account type belongs to: what the timeline already teaches. */
export function accountFamily(rule: AccountRule): AccountFamily {
  if (rule.isCash) return "cash";
  if (rule.accessAge !== null) return "pension";
  if (rule.withdrawal.kind === "free" && rule.growthTax.kind === "none") return "taxfree";
  return "taxable";
}

/** The engine's per-type view: every rule present, balances and contributions summed across the pots of that type, access age kept. */
export function aggregatePots(profile: Jurisdiction, pots: Pot[], previous: Record<string, AccountInput> = {}): Record<string, AccountInput> {
  return Object.fromEntries(profile.accounts.map((rule) => {
    const mine = pots.filter((pot) => pot.type === rule.id);
    const account: AccountInput = { balance: mine.reduce((sum, pot) => sum + Math.max(0, pot.balance), 0), monthlyContribution: mine.reduce((sum, pot) => sum + Math.max(0, pot.monthlyContribution), 0) };
    if (rule.accessAge !== null) account.accessAge = previous[rule.id]?.accessAge ?? rule.accessAge;
    return [rule.id, account];
  }));
}

/** A plan with these pots and its per-type accounts brought back in step. */
export function withPots(plan: PlanInputs, pots: Pot[]): PlanInputs {
  return { ...plan, pots, accounts: aggregatePots(profileOf(plan), pots, plan.accounts) };
}

/** Pots for a per-type record: one per type that holds money or receives contributions (how older plans and the starter migrate). */
export function potsFromAccounts(profile: Jurisdiction, accounts: Record<string, AccountInput>): Pot[] {
  return profile.accounts.flatMap((rule) => {
    const account = accounts[rule.id];
    return account && (account.balance > 0 || account.monthlyContribution > 0) ? [{ id: `pot-${rule.id}`, type: rule.id, name: rule.name, balance: account.balance, monthlyContribution: account.monthlyContribution }] : [];
  });
}

export function createPot(profile: Jurisdiction, type: string, existing: Pot[]): Pot {
  const rule = profile.accounts.find((item) => item.id === type) ?? profile.accounts[0]!;
  const sameType = existing.filter((pot) => pot.type === rule.id).length;
  return { id: newId("pot"), type: rule.id, name: sameType === 0 ? rule.name : `${rule.name} ${sameType + 1}`, balance: 0, monthlyContribution: 0 };
}

/** Move money between account types, taking from the pots of the source type in proportion and adding to the first pot of the target (creating one if needed). */
export function transferBetweenTypes(plan: PlanInputs, fromType: string, toType: string, amount: number): PlanInputs {
  const profile = profileOf(plan);
  // A plan assembled by hand may carry per-type accounts that its pots do not add up to; trust the accounts and rebuild the pots.
  const inSync = profile.accounts.every((rule) => { const mine = plan.pots.filter((pot) => pot.type === rule.id); return Math.abs(mine.reduce((sum, pot) => sum + pot.balance, 0) - (plan.accounts[rule.id]?.balance ?? 0)) < 0.5; });
  const basePots = inSync ? plan.pots : potsFromAccounts(profile, plan.accounts);
  const sources = basePots.filter((pot) => pot.type === fromType);
  const available = sources.reduce((sum, pot) => sum + pot.balance, 0);
  const moved = Math.min(Math.max(0, amount), available);
  if (moved <= 0) return plan;
  let pots = basePots.map((pot) => pot.type === fromType ? { ...pot, balance: pot.balance - moved * (pot.balance / available) } : pot);
  const target = pots.find((pot) => pot.type === toType);
  pots = target ? pots.map((pot) => pot.id === target.id ? { ...pot, balance: pot.balance + moved } : pot) : [...pots, { ...createPot(profile, toType, pots), balance: moved }];
  return withPots(plan, pots);
}

function normalisePot(item: unknown, index: number, profile: Jurisdiction): Pot | null {
  const raw = asRecord(item);
  const rule = profile.accounts.find((candidate) => candidate.id === raw.type);
  if (!rule) return null;
  return { id: asString(raw.id, `pot-${index + 1}`), type: rule.id, name: asString(raw.name, rule.name), balance: Math.max(0, asNumber(raw.balance, 0)), monthlyContribution: Math.max(0, asNumber(raw.monthlyContribution, 0)) };
}

export function createPension(index: number): PensionIncome {
  return { id: newId("pension"), name: index === 1 ? "Workplace pension" : `Pension ${index}`, annual: 6_000, fromAge: 65 };
}

/** Every guaranteed income the plan pays: the state rule first, then each pension, all in today's money. */
export function incomeStreams(plan: PlanInputs): IncomeStream[] {
  const profile = profileOf(plan);
  const state = profile.guaranteedIncome.map((rule) => { const input = plan.guaranteedIncome[rule.id]; return { id: rule.id, label: rule.label, annual: input?.annual ?? 0, fromAge: input?.fromAge ?? rule.defaults.fromAge, taxableShare: rule.taxableShare }; });
  return [...state, ...plan.pensions.map((pension) => ({ id: pension.id, label: pension.name, annual: pension.annual, fromAge: pension.fromAge, taxableShare: 1 }))];
}

export function normalisePlan(input: unknown): PlanInputs {
  const raw = liftLegacy(asRecord(input));
  const profileId: ProfileId = isProfileId(raw.profile) ? raw.profile : "uk";
  const profile = PROFILES[profileId];
  const base = createDefaultPlan(profileId);
  const currentAge = asNumber(raw.currentAge, base.currentAge);
  const retirementAge = Math.max(currentAge, asNumber(raw.retirementAge, base.retirementAge));
  const planToAge = Math.max(retirementAge + 1, asNumber(raw.planToAge, base.planToAge));
  const rawAccounts = asRecord(raw.accounts);
  const storedAccounts: Record<string, AccountInput> = Object.fromEntries(profile.accounts.map((rule) => {
      const stored = asRecord(rawAccounts[rule.id]);
      const fallback = base.accounts[rule.id]!;
      const account: AccountInput = {
        balance: Math.max(0, asNumber(stored.balance, fallback.balance)),
        monthlyContribution: Math.max(0, asNumber(stored.monthlyContribution, fallback.monthlyContribution)),
      };
      if (rule.accessAge !== null) account.accessAge = asNumber(stored.accessAge, rule.accessAge);
      return [rule.id, account];
    }));
  const pots: Pot[] = Array.isArray(raw.pots) ? raw.pots.map((item, index) => normalisePot(item, index, profile)).filter((pot): pot is Pot => pot !== null) : potsFromAccounts(profile, storedAccounts);
  const rawIncome = asRecord(raw.guaranteedIncome);
  const rawPortfolio = asRecord(raw.portfolio);
  const rawPhases = Array.isArray(raw.spendingPhases) ? raw.spendingPhases : null;
  const desiredMonthlySpending = asNumber(raw.desiredMonthlySpending, base.desiredMonthlySpending);
  const spendingMode: SpendingMode = raw.spendingMode === "phased" ? "phased" : "level";

  return {
    profile: profileId,
    taxVariant: profile.taxVariants.some((variant) => variant.id === raw.taxVariant) ? raw.taxVariant as string : base.taxVariant,
    taxSurchargePercent: clamp(asNumber(raw.taxSurchargePercent, 0), 0, 20),
    currentAge,
    retirementAge,
    planToAge,
    targetConfidencePercent: clamp(asNumber(raw.targetConfidencePercent, base.targetConfidencePercent), 50, 99),
    desiredMonthlySpending,
    spendingMode,
    essentialMonthlySpending: Math.max(0, asNumber(raw.essentialMonthlySpending, Math.min(base.essentialMonthlySpending, desiredMonthlySpending))),
    spendingStrategy: raw.spendingStrategy === "fixed" ? "fixed" : raw.spendingStrategy === "flex" ? "flex" : raw.spendingStrategy === "amortise" ? "amortise" : "guardrails",
    guardrailCutPercent: clamp(asNumber(raw.guardrailCutPercent, base.guardrailCutPercent), 0, 30),
    spendingCeilingMonthly: Math.max(0, asNumber(raw.spendingCeilingMonthly, Math.round(desiredMonthlySpending * 1.5))),
    flexBandPercent: clamp(asNumber(raw.flexBandPercent, base.flexBandPercent), 5, 50),
    flexStepPercent: clamp(asNumber(raw.flexStepPercent, base.flexStepPercent), 1, 30),
    amortiseTargetAtEnd: Math.max(0, asNumber(raw.amortiseTargetAtEnd, 0)),
    amortiseRealReturnPercent: clamp(asNumber(raw.amortiseRealReturnPercent, 3), -2, 8),
    amortiseSmoothingPercent: clamp(asNumber(raw.amortiseSmoothingPercent, 10), 0, 50),
    flexAnchor: (() => { const anchor = asRecord(raw.flexAnchor); const rate = asNumber(anchor.rate, Number.NaN); return Number.isFinite(rate) && rate > 0 ? { rate, fromAge: asNumber(anchor.fromAge, retirementAge) } : null; })(),
    balancesAsOf: typeof raw.balancesAsOf === "string" && !Number.isNaN(Date.parse(raw.balancesAsOf)) ? raw.balancesAsOf : null,
    spendingPhases: rawPhases
      ? rawPhases.map((item, index) => {
        const phase = asRecord(item);
        const startAge = asNumber(phase.startAge, retirementAge);
        return {
          id: asString(phase.id, `phase-${index + 1}`),
          label: asString(phase.label, `Phase ${index + 1}`),
          startAge,
          endAge: Math.max(startAge, asNumber(phase.endAge, planToAge)),
          monthlyAmount: asNumber(phase.monthlyAmount, desiredMonthlySpending),
        };
      })
      : base.spendingPhases.map((phase, index) => ({ ...phase, monthlyAmount: index === 0 ? desiredMonthlySpending : phase.monthlyAmount })),
    oneOffExpenses: Array.isArray(raw.oneOffExpenses)
      ? raw.oneOffExpenses.map((item, index) => {
        const expense = asRecord(item);
        return { id: asString(expense.id, `expense-${index + 1}`), label: asString(expense.label, "One-off cost"), age: asNumber(expense.age, retirementAge), amount: asNumber(expense.amount, 0) };
      })
      : [],
    pots,
    accounts: aggregatePots(profile, pots, storedAccounts),
    guaranteedIncome: Object.fromEntries(profile.guaranteedIncome.map((rule) => {
      const stored = asRecord(rawIncome[rule.id]);
      return [rule.id, { annual: Math.max(0, asNumber(stored.annual, rule.defaults.annual)), fromAge: asNumber(stored.fromAge, rule.defaults.fromAge) }];
    })),
    pensions: [...legacyPensions(profileId, rawIncome), ...(Array.isArray(raw.pensions) ? raw.pensions.map((item, index) => normalisePension(item, index)) : [])],
    baseline: normaliseBaseline(raw.baseline),
    savedAt: typeof raw.savedAt === "string" && !Number.isNaN(Date.parse(raw.savedAt)) ? raw.savedAt : null,
    changedAt: typeof raw.changedAt === "string" && !Number.isNaN(Date.parse(raw.changedAt)) ? raw.changedAt : null,
    checkIns: Array.isArray(raw.checkIns) ? raw.checkIns.map((item, index) => normaliseCheckIn(item, index)).filter((item): item is CheckIn => item !== null) : [],
    taxFreeUsed: Math.max(0, asNumber(raw.taxFreeUsed, 0)),
    portfolio: Object.fromEntries(
      (Object.keys(DEFAULT_PORTFOLIO) as (keyof PortfolioAssumptions)[]).map((key) => [key, asNumber(rawPortfolio[key], DEFAULT_PORTFOLIO[key])]),
    ) as PortfolioAssumptions,
    properties: Array.isArray(raw.properties) ? raw.properties.map((item, index) => normaliseProperty(item, index, profile, currentAge)) : [],
  };
}

/** Switch a plan to another country: keep ages, spending style and market assumptions, reset money to that profile's defaults. */
export function switchProfile(plan: PlanInputs, profileId: ProfileId): PlanInputs {
  const fresh = createDefaultPlan(profileId);
  return {
    ...fresh,
    currentAge: plan.currentAge,
    retirementAge: plan.retirementAge,
    planToAge: plan.planToAge,
    targetConfidencePercent: plan.targetConfidencePercent,
    spendingStrategy: plan.spendingStrategy,
    guardrailCutPercent: plan.guardrailCutPercent,
    flexBandPercent: plan.flexBandPercent,
    flexStepPercent: plan.flexStepPercent,
    amortiseRealReturnPercent: plan.amortiseRealReturnPercent,
    amortiseSmoothingPercent: plan.amortiseSmoothingPercent,
    portfolio: { ...plan.portfolio },
  };
}

/** Whether a parsed value is plausibly a plan (ours or a legacy one) rather than some other JSON. */
export function looksLikePlan(value: unknown): boolean {
  const raw = asRecord(value);
  const candidate = typeof raw.plan === "object" && raw.plan !== null ? asRecord(raw.plan) : raw;
  return typeof candidate.currentAge === "number" && typeof candidate.retirementAge === "number" && (typeof candidate.accounts === "object" || typeof candidate.desiredMonthlySpending === "number");
}

export type StarterInputs = {
  currentAge: number;
  retirementAge: number;
  monthlySpending: number;
  /** Money in locked pension accounts today. */
  pensionBalance: number;
  /** Money you could spend tomorrow: ISA, brokerage, cash. */
  accessibleBalance: number;
  /** What you add to accessible savings each month. */
  monthlySaving: number;
  balancesAsOf: string;
};

/**
 * A first plan from six numbers: no property, no phases, the profile's example state pension, everything else zero.
 * The pension goes to the profile's long-term account and accessible money to its bridge account.
 */
export function buildStarterPlan(profileId: ProfileId, starter: StarterInputs): PlanInputs {
  const profile = PROFILES[profileId];
  const base = createDefaultPlan(profileId);
  const accounts: PlanInputs["accounts"] = Object.fromEntries(profile.accounts.map((rule) => [rule.id, { balance: 0, monthlyContribution: 0, ...(rule.accessAge === null ? {} : { accessAge: rule.accessAge }) }]));
  accounts[profile.savingTargets.longTerm]!.balance = Math.max(0, starter.pensionBalance);
  accounts[profile.savingTargets.bridge]!.balance = Math.max(0, starter.accessibleBalance);
  accounts[profile.savingTargets.bridge]!.monthlyContribution = Math.max(0, starter.monthlySaving);
  const spending = Math.max(0, starter.monthlySpending);
  return normalisePlan({
    ...base,
    currentAge: starter.currentAge,
    retirementAge: starter.retirementAge,
    desiredMonthlySpending: spending,
    // A first plan answers the question people arrive with: "can I spend this much?" — the flexible rules are a discovery, not an assumption.
    spendingStrategy: "fixed",
    essentialMonthlySpending: Math.round(spending * 0.7 / 50) * 50,
    spendingCeilingMonthly: Math.round(spending * 1.3 / 50) * 50,
    spendingMode: "level",
    spendingPhases: [],
    oneOffExpenses: [],
    properties: [],
    pensions: [],
    baseline: null,
    checkIns: [],
    savedAt: null,
    changedAt: starter.balancesAsOf,
    pots: potsFromAccounts(profile, accounts),
    accounts,
    balancesAsOf: starter.balancesAsOf,
  });
}

/** True when data worth keeping changed after the last copy left this browser. Only meaningful once the plan is tracked. */
export function hasUnsavedData(plan: PlanInputs): boolean {
  if (plan.baseline === null || plan.changedAt === null) return false;
  return plan.savedAt === null || plan.changedAt > plan.savedAt;
}
