import { expectedPath, mixReturn, planMix, type MarketPath } from "./market.ts";
import { annuityPayment, presentValue, realRate, solveMonotonic } from "./money.ts";
import { incomeStreams, pensionAccessAge, profileOf, spendingAtAge, statePensionAge, type PlanInputs } from "./plan.ts";
import { taxSchedule, type AccountRule, type Jurisdiction, type TaxSchedule } from "./profiles/index.ts";
import { acquisitionCost, completePurchase, growProperty, initialPropertyState, propertyYear, type PropertyState } from "./property.ts";
import { allowanceRoom, incomeTax, marginalTax } from "./tax.ts";

export type PhaseKey = "build" | "bridge" | "pension" | "state";

export type YearResult = {
  age: number;
  phase: PhaseKey;
  balances: Record<string, number>;
  totalInvestments: number;
  propertyEquity: number;
  propertyIncome: number;
  guaranteedIncome: number;
  /** Everything taken out of accounts this year, gross. */
  withdrawals: number;
  withdrawalsByAccount: Record<string, number>;
  /** Contributions added this year across all accounts. */
  contributions: number;
  /** Income left over after spending, saved to cash. */
  surplusSaved: number;
  /** Net proceeds of property sales this year, added to cash. */
  saleProceeds: number;
  /** Deposit and costs actually paid from accounts for property bought this year. */
  purchaseOutlay: number;
  /** Cost of a purchase planned for this year that could not be funded; the plan continues without that property. */
  purchaseShortfall: number;
  /** The year's market and what it did to invested money: zero in the starting year, which carries the balances as entered. */
  market: { stockReturnPercent: number; bondReturnPercent: number; inflationPercent: number; investedOpen: number; investedGrowth: number };
  /** Total tax: income tax plus flat taxes plus tax settled inside property income. */
  tax: number;
  /** The part of `tax` already deducted inside `propertyIncome` (flat rental regimes, gains tax on sale). */
  propertyTax: number;
  spending: number;
  oneOffSpending: number;
  shortfall: number;
  detail: YearDetail;
};

/** How each figure in a year was derived — the audit trail behind the cash-flow table. */
export type YearDetail = {
  spending: {
    planned: number;
    /** Signed change applied by the spending rule this year (a protect cut, or a flex raise/cut). */
    adjustment: number;
    oneOffs: number;
    /** Flex: the cumulative multiplier on planned spending after this year's step. */
    flexMultiplier: number;
    /** Flex: portfolio-funded need ÷ investments, the figure the rule compares to the anchor. */
    withdrawalRate: number | null;
    anchorRate: number | null;
    atFloor: boolean;
    atCeiling: boolean;
    /** Amortise: the sums behind this year's payment. */
    amortisation: { investments: number; futureIncomeValue: number; targetValue: number; yearsLeft: number; payment: number; unsmoothed: number; /** The level payment out of the pot before tax. */ grossPayment: number; /** Cap applied while locked accounts are closed: what accessible money can sustain until they open. */ bridgeCap: number | null } | null;
  };
  /** Income before any withdrawals: each property and each guaranteed income. */
  income: { label: string; cash: number; taxable: number; note?: string }[];
  tax: { taxableIncome: number; allowance: number; incomeTax: number; /** Income tax due on rent and guaranteed income alone, before any withdrawals. */ taxOnIncome: number; financeCredit: number; flatTax: number; propertyTax: number; surchargePercent: number };
  /** Each account's year: open → growth → added → drawn (+ inflows) → close. */
  accounts: { id: string; open: number; realReturnPercent: number; growth: number; contribution: number; inflow: number; withdrawal: number; taxFree: number; taxable: number; close: number }[];
};

export type UnfundedPurchase = { age: number; name: string; cost: number; available: number };

export type Projection = {
  years: YearResult[];
  firstShortfall: number | null;
  /** Planned purchases that could not be paid for; the projection carries on without them. */
  unfundedPurchases: UnfundedPurchase[];
  totalTax: number;
  taxFreeUsed: number;
};

type Ledger = {
  balances: Map<string, number>;
  taxFreeUsed: number;
  /** Taxable income accumulated so far this year. */
  taxableIncome: number;
  flatTax: number;
  withdrawals: number;
  withdrawalsByAccount: Map<string, number>;
  taxableByAccount: Map<string, number>;
  taxFreeByAccount: Map<string, number>;
};

function phaseFor(age: number, plan: PlanInputs, accessAge: number, stateAge: number): PhaseKey {
  if (age < plan.retirementAge) return "build";
  if (age < accessAge) return "bridge";
  if (age < stateAge) return "pension";
  return "state";
}

/** The age an account unlocks: the user's override, else the rule's; null when it is always accessible. */
function accountAccessAge(rule: AccountRule, plan: PlanInputs): number | null {
  return rule.accessAge === null ? null : plan.accounts[rule.id]?.accessAge ?? rule.accessAge;
}

function isAccessible(rule: AccountRule, plan: PlanInputs, age: number): boolean {
  const accessAge = accountAccessAge(rule, plan);
  return accessAge === null || age >= accessAge;
}

/** Split a withdrawal from an income-taxed account into taxable and tax-free parts. */
function taxablePart(gross: number, rule: AccountRule, taxFreeUsed: number): { taxable: number; taxFree: number } {
  if (rule.withdrawal.kind !== "income") return { taxable: 0, taxFree: gross };
  const share = rule.withdrawal.taxFreeShare ?? 0;
  const capRemaining = rule.withdrawal.taxFreeCap === undefined ? Number.POSITIVE_INFINITY : Math.max(0, rule.withdrawal.taxFreeCap - taxFreeUsed);
  const taxFree = Math.min(gross * share, capRemaining);
  return { taxable: gross - taxFree, taxFree };
}

/** Net cash received from withdrawing `gross` given what has already been earned this year. */
function netOfWithdrawal(gross: number, rule: AccountRule, ledger: Ledger, schedule: TaxSchedule, surcharge: number): number {
  switch (rule.withdrawal.kind) {
    case "free": return gross;
    case "flat": return gross * (1 - rule.withdrawal.rate);
    case "income": return gross - marginalTax(ledger.taxableIncome, taxablePart(gross, rule, ledger.taxFreeUsed).taxable, schedule, surcharge);
  }
}

/** Take `gross` out of an account, recording the tax consequences. */
function withdraw(gross: number, rule: AccountRule, ledger: Ledger): void {
  if (gross <= 0) return;
  ledger.balances.set(rule.id, (ledger.balances.get(rule.id) ?? 0) - gross);
  ledger.withdrawals += gross;
  ledger.withdrawalsByAccount.set(rule.id, (ledger.withdrawalsByAccount.get(rule.id) ?? 0) + gross);
  if (rule.withdrawal.kind === "income") {
    const parts = taxablePart(gross, rule, ledger.taxFreeUsed);
    ledger.taxableIncome += parts.taxable;
    ledger.taxFreeUsed += parts.taxFree;
    ledger.taxableByAccount.set(rule.id, (ledger.taxableByAccount.get(rule.id) ?? 0) + parts.taxable);
    ledger.taxFreeByAccount.set(rule.id, (ledger.taxFreeByAccount.get(rule.id) ?? 0) + parts.taxFree);
  } else if (rule.withdrawal.kind === "flat") {
    ledger.flatTax += gross * rule.withdrawal.rate;
  }
}

/** Withdraw enough to deliver `netNeeded` after tax; returns the net actually delivered. */
function withdrawForNet(netNeeded: number, rule: AccountRule, ledger: Ledger, schedule: TaxSchedule, surcharge: number): number {
  const available = ledger.balances.get(rule.id) ?? 0;
  if (netNeeded <= 0 || available <= 0) return 0;
  let gross: number;
  if (rule.withdrawal.kind === "free") gross = Math.min(available, netNeeded);
  else if (rule.withdrawal.kind === "flat") gross = Math.min(available, netNeeded / (1 - rule.withdrawal.rate));
  else gross = solveMonotonic((candidate) => netOfWithdrawal(candidate, rule, ledger, schedule, surcharge), netNeeded, available);
  const net = netOfWithdrawal(gross, rule, ledger, schedule, surcharge);
  withdraw(gross, rule, ledger);
  return net;
}

function cloneLedger(ledger: Ledger): Ledger {
  return { ...ledger, balances: new Map(ledger.balances), withdrawalsByAccount: new Map(ledger.withdrawalsByAccount), taxableByAccount: new Map(ledger.taxableByAccount), taxFreeByAccount: new Map(ledger.taxFreeByAccount) };
}

/** Net cash that drawing `gross` through the normal waterfall would deliver this year — computed on a copy, nothing is withdrawn. */
function netOfGrossDraw(gross: number, profile: Jurisdiction, plan: PlanInputs, age: number, ledger: Ledger, schedule: TaxSchedule, surcharge: number): number {
  const trial = cloneLedger(ledger);
  let remaining = Math.max(0, gross);
  let net = 0;
  const take = (rule: AccountRule, amount: number) => {
    if (amount <= 0) return;
    net += netOfWithdrawal(amount, rule, trial, schedule, surcharge);
    withdraw(amount, rule, trial);
    remaining -= amount;
  };
  for (const rule of profile.accounts) {
    if (remaining <= 0 || !rule.fillsAllowanceFirst || rule.withdrawal.kind !== "income" || !isAccessible(rule, plan, age)) continue;
    const share = taxablePart(1, rule, trial.taxFreeUsed).taxable;
    const grossToFill = share > 0 ? allowanceRoom(trial.taxableIncome, schedule) / share : allowanceRoom(trial.taxableIncome, schedule);
    take(rule, Math.min(trial.balances.get(rule.id) ?? 0, remaining, grossToFill));
  }
  for (const id of profile.withdrawalOrder) {
    if (remaining <= 0) break;
    const rule = profile.accounts.find((item) => item.id === id)!;
    if (!isAccessible(rule, plan, age)) continue;
    take(rule, Math.min(trial.balances.get(rule.id) ?? 0, remaining));
  }
  return net;
}

/** Cover a cash need from accessible accounts in the profile's order, ignoring tax (used before retirement). */
function coverFromAccessible(amount: number, profile: Jurisdiction, plan: PlanInputs, age: number, ledger: Ledger): number {
  amount = Math.max(0, amount);
  let remaining = amount;
  for (const id of profile.withdrawalOrder) {
    if (remaining <= 0) break;
    const rule = profile.accounts.find((item) => item.id === id)!;
    if (!isAccessible(rule, plan, age) || rule.withdrawal.kind !== "free") continue;
    const draw = Math.min(ledger.balances.get(id) ?? 0, remaining);
    withdraw(draw, rule, ledger);
    remaining -= draw;
  }
  return amount - remaining;
}

export type SimulateOptions = {
  /** False skips the per-year audit detail (account ledger, income and tax breakdown); the totals, spending flags and balances are unchanged. Used for the thousands of throwaway runs behind the Monte Carlo and solvers. */
  detail?: boolean;
};

const NO_TAX_DETAIL: YearDetail["tax"] = { taxableIncome: 0, allowance: 0, incomeTax: 0, taxOnIncome: 0, financeCredit: 0, flatTax: 0, propertyTax: 0, surchargePercent: 0 };

export function simulatePlan(plan: PlanInputs, suppliedPath?: MarketPath, options: SimulateOptions = {}): Projection {
  const wantDetail = options.detail !== false;
  const profile = profileOf(plan);
  const schedule = taxSchedule(profile, plan.taxVariant);
  const surcharge = plan.taxSurchargePercent;
  const path = suppliedPath ?? expectedPath(plan);
  const accessAge = pensionAccessAge(plan);
  const stateAge = statePensionAge(plan);
  const streams = incomeStreams(plan);
  const ledger: Ledger = {
    balances: new Map(profile.accounts.map((rule) => [rule.id, Math.max(0, plan.accounts[rule.id]?.balance ?? 0)])),
    taxFreeUsed: Math.max(0, plan.taxFreeUsed),
    taxableIncome: 0,
    flatTax: 0,
    withdrawals: 0,
    withdrawalsByAccount: new Map(),
    taxableByAccount: new Map(),
    taxFreeByAccount: new Map(),
  };
  const properties: PropertyState[] = plan.properties.map((asset) => initialPropertyState(asset, plan.currentAge));
  const years: YearResult[] = [];
  let priceLevel = 1;
  let cumulativeTax = 0;
  let firstShortfall: number | null = null;
  const unfundedPurchases: UnfundedPurchase[] = [];
  let flexMultiplier = 1;
  // A retired plan carries its anchor from the year work stopped; a projection sets it on arrival.
  let anchorRate: number | null = plan.currentAge >= plan.retirementAge && plan.flexAnchor ? plan.flexAnchor.rate : null;
  const flex = plan.spendingStrategy === "flex";
  const amortise = plan.spendingStrategy === "amortise";
  const amortiseRate = plan.amortiseRealReturnPercent / 100;
  let previousRuleSpending: number | null = null;
  const floorAnnual = Math.max(0, plan.essentialMonthlySpending) * 12;
  const ceilingAnnual = Math.max(floorAnnual, plan.spendingCeilingMonthly * 12);
  const cashRule = profile.accounts.find((rule) => rule.isCash) ?? profile.accounts[0]!;

  for (let age = plan.currentAge; age <= plan.planToAge; age += 1) {
    const index = age - plan.currentAge;
    const stockReturn = path.stockReturns[index] ?? path.stockReturns.at(-1) ?? 0;
    const bondReturn = path.bondReturns[index] ?? path.bondReturns.at(-1) ?? 0;
    const nominalCashReturn = path.cashReturns[index] ?? plan.portfolio.cashReturnPercent;
    const inflation = path.inflation[index] ?? plan.portfolio.inflationPercent;
    /** Real return of what is actually invested, weighted by balance — the guardrail trigger. */
    let portfolioRealReturn = realRate(path.portfolioReturns[index] ?? 0, inflation);
    ledger.taxableIncome = 0;
    ledger.flatTax = 0;
    ledger.withdrawals = 0;
    ledger.withdrawalsByAccount = new Map();
    ledger.taxableByAccount = new Map();
    ledger.taxFreeByAccount = new Map();
    const opening = new Map(ledger.balances);
    const growthByAccount = new Map<string, number>();
    const returnByAccount = new Map<string, number>();
    const contributionByAccount = new Map<string, number>();
    let shortfall = 0;
    let contributions = 0;
    let surplusSaved = 0;
    let purchaseOutlay = 0;
    let purchaseShortfall = 0;

    // 1. Growth and contributions (none in the starting year).
    let investedOpen = 0;
    let investedGrowth = 0;
    if (age > plan.currentAge) {
      priceLevel *= 1 + inflation / 100;
      let investedBefore = 0;
      let investedReturn = 0;
      for (const rule of profile.accounts) {
        const balance = ledger.balances.get(rule.id) ?? 0;
        const nominal = rule.isCash ? nominalCashReturn : mixReturn(planMix(plan), stockReturn, bondReturn, nominalCashReturn);
        if (!rule.isCash) { investedBefore += balance; investedReturn += balance * realRate(nominal, inflation); }
        let taxed = nominal;
        if (rule.growthTax.kind === "drag") taxed = nominal - plan.portfolio.taxableDragPercent;
        if (rule.growthTax.kind === "share-of-return" && nominal > 0) taxed = nominal * (1 - rule.growthTax.rate);
        const contribution = age <= plan.retirementAge ? (plan.accounts[rule.id]?.monthlyContribution ?? 0) * 12 : 0;
        contributions += contribution;
        const real = realRate(taxed, inflation);
        growthByAccount.set(rule.id, balance * real);
        returnByAccount.set(rule.id, real * 100);
        contributionByAccount.set(rule.id, contribution);
        ledger.balances.set(rule.id, balance * (1 + real) + contribution);
      }
      if (investedBefore > 0) portfolioRealReturn = investedReturn / investedBefore;
      investedOpen = investedBefore;
      for (const rule of profile.accounts) if (!rule.isCash) investedGrowth += growthByAccount.get(rule.id) ?? 0;
    }

    // 2. Property purchases, growth and amortisation.
    for (const state of properties) {
      state.purchasedThisYear = false;
      if (!state.active && age === state.asset.purchaseAge) {
        const cost = acquisitionCost(state.asset);
        const accessible = profile.withdrawalOrder.reduce((sum, id) => {
          const rule = profile.accounts.find((item) => item.id === id)!;
          return sum + (isAccessible(rule, plan, age) && rule.withdrawal.kind === "free" ? ledger.balances.get(id) ?? 0 : 0);
        }, 0);
        if (accessible + 1 >= cost) {
          purchaseOutlay += coverFromAccessible(cost, profile, plan, age, ledger);
          completePurchase(state, priceLevel);
          state.ownedSinceAge = age;
        } else {
          // Cannot afford it: the purchase does not happen and savings stay untouched. Reported, not fatal.
          purchaseShortfall += cost;
          unfundedPurchases.push({ age, name: state.asset.name, cost, available: accessible });
          state.asset = { ...state.asset, purchaseAge: Number.POSITIVE_INFINITY };
        }
      }
      if (state.active && age > plan.currentAge && !state.purchasedThisYear) growProperty(state, inflation, path.propertyShocks[index] ?? 0);
    }

    // 3. Property income and sales.
    let propertyCash = 0;
    let propertyTaxable = 0;
    let propertyEquity = 0;
    let propertyFlatTax = 0;
    let mortgageInterest = 0;
    let saleProceeds = 0;
    const incomeDetail: YearDetail["income"] = [];
    for (const state of properties) {
      if (!state.active) continue;
      const rentActive = age >= Math.max(plan.retirementAge, state.asset.rentFromAge);
      const year = propertyYear(state, age, priceLevel, profile.property, rentActive, path.vacancyMultipliers[index] ?? 1);
      if (year.saleProceeds > 0) incomeDetail.push({ label: `${state.asset.name} sold`, cash: 0, taxable: 0, note: `proceeds to cash after costs, mortgage and ${Math.round(year.flatTax).toLocaleString()} gains tax` });
      else if (rentActive && age >= plan.retirementAge) incomeDetail.push({ label: state.asset.name, cash: year.cashIncome, taxable: year.taxableIncome, note: year.flatTax > 0 ? `after ${Math.round(year.flatTax).toLocaleString()} flat tax` : year.mortgageInterest > 0 ? `after mortgage; interest ${Math.round(year.mortgageInterest).toLocaleString()}` : undefined });
      propertyCash += year.cashIncome;
      propertyTaxable += year.taxableIncome;
      propertyEquity += year.equity;
      propertyFlatTax += year.flatTax;
      mortgageInterest += year.mortgageInterest;
      if (year.saleProceeds > 0) {
        saleProceeds += year.saleProceeds;
        ledger.balances.set(cashRule.id, (ledger.balances.get(cashRule.id) ?? 0) + year.saleProceeds);
      }
    }

    // 4. Spending.
    const oneOffSpending = plan.oneOffExpenses.filter((expense) => expense.age === age).reduce((sum, expense) => sum + Math.max(0, expense.amount), 0);
    let spending = 0;
    let guaranteed = 0;
    let tax = propertyFlatTax;
    let plannedSpending = 0;
    let adjustment = 0;
    let withdrawalRate: number | null = null;
    let atFloor = false;
    let atCeiling = false;
    let amortisation: YearDetail["spending"]["amortisation"] = null;
    let credit = 0;
    let taxOnIncome = 0;
    // UK-style relief: a credit of rate × mortgage interest, never more than the tax due on the rental profit.
    const creditRate = profile.property.rentalTax.kind === "income" ? profile.property.rentalTax.financeCostCreditRate ?? 0 : 0;
    const financeCredit = (taxableTotal: number) => creditRate > 0
      ? Math.min(mortgageInterest * creditRate, marginalTax(Math.max(0, taxableTotal - propertyTaxable), propertyTaxable, schedule, surcharge))
      : 0;

    if (age < plan.retirementAge) {
      if (oneOffSpending > 0) shortfall += oneOffSpending - coverFromAccessible(oneOffSpending, profile, plan, age, ledger);
    } else {
      plannedSpending = spendingAtAge(plan, age);

      let guaranteedTaxable = 0;
      for (const stream of streams) {
        if (age < stream.fromAge) continue;
        guaranteed += stream.annual;
        guaranteedTaxable += stream.annual * stream.taxableShare;
        if (stream.annual > 0) incomeDetail.push({ label: stream.label, cash: stream.annual, taxable: stream.annual * stream.taxableShare, note: stream.taxableShare < 1 ? `${Math.round(stream.taxableShare * 100)}% taxable` : undefined });
      }
      ledger.taxableIncome = propertyTaxable + guaranteedTaxable;
      credit = financeCredit(ledger.taxableIncome);
      const baseTax = incomeTax(ledger.taxableIncome, schedule, surcharge) - credit;
      taxOnIncome = baseTax;
      const baseNet = propertyCash + guaranteed - baseTax;

      // The spending rule decides this year's spending before anything is drawn.
      if (plan.spendingStrategy === "guardrails") {
        spending = plannedSpending;
        if (portfolioRealReturn < -0.1) {
          spending = Math.max(Math.min(spending, floorAnnual), spending * (1 - plan.guardrailCutPercent / 100));
          adjustment = spending - plannedSpending;
        }
      } else if (amortise) {
        // Total-wealth amortisation: spend the level payment that runs (investments + value of future income − target) to zero over the years left.
        let investments = 0;
        for (const rule of profile.accounts) investments += ledger.balances.get(rule.id) ?? 0;
        const yearsLeft = plan.planToAge - age + 1;
        let futureIncomeValue = 0;
        for (let future = age + 1; future <= plan.planToAge; future += 1) {
          let gross = 0;
          let taxable = 0;
          for (const stream of streams) if (future >= stream.fromAge) { gross += stream.annual; taxable += stream.annual * stream.taxableShare; }
          // Rent is assumed to continue at this year's level; guaranteed income is taxed on top of it.
          const net = gross - incomeTax(taxable + propertyTaxable, schedule, surcharge) + propertyCash;
          futureIncomeValue += presentValue(Math.max(0, net), amortiseRate, future - age);
        }
        const targetValue = presentValue(plan.amortiseTargetAtEnd, amortiseRate, yearsLeft - 1);
        const grossPayment = Math.max(0, annuityPayment(investments + futureIncomeValue - targetValue, amortiseRate, yearsLeft));
        // The payment is what comes OUT of the pot; what you can spend is that net of the tax the withdrawals cause.
        let unsmoothed = baseNet + netOfGrossDraw(Math.max(0, grossPayment - baseNet), profile, plan, age, ledger, schedule, surcharge);
        // Liquidity: while anything is still locked, the payment cannot exceed what the money reachable before each unlock
        // (plus income meanwhile) can sustain until that unlock. Every future access age is a barrier; the tightest one binds.
        let bridgeCap: number | null = null;
        const barriers = [...new Set(profile.accounts.map((rule) => accountAccessAge(rule, plan)).filter((unlock): unlock is number => unlock !== null && unlock > age))].sort((left, right) => left - right);
        if (barriers.length > 0) {
          let reachable = 0;
          for (const rule of profile.accounts) if (isAccessible(rule, plan, age)) reachable += ledger.balances.get(rule.id) ?? 0;
          let bridgeIncome = 0;
          let future = age + 1;
          let grossCap = Infinity;
          for (const barrier of barriers) {
            for (; future < barrier; future += 1) {
              let gross = 0, taxable = 0;
              for (const stream of streams) if (future >= stream.fromAge) { gross += stream.annual; taxable += stream.annual * stream.taxableShare; }
              bridgeIncome += presentValue(Math.max(0, gross - incomeTax(taxable + propertyTaxable, schedule, surcharge) + propertyCash), amortiseRate, future - age);
            }
            grossCap = Math.min(grossCap, Math.max(0, annuityPayment(reachable + bridgeIncome, amortiseRate, barrier - age)));
            // Whatever unlocks at this barrier is reachable for every later one.
            for (const rule of profile.accounts) if (accountAccessAge(rule, plan) === barrier) reachable += ledger.balances.get(rule.id) ?? 0;
          }
          bridgeCap = baseNet + netOfGrossDraw(grossCap, profile, plan, age, ledger, schedule, surcharge);
          unsmoothed = Math.min(unsmoothed, bridgeCap);
        }
        let payment = unsmoothed;
        if (previousRuleSpending !== null && plan.amortiseSmoothingPercent > 0) {
          const band = plan.amortiseSmoothingPercent / 100;
          payment = Math.min(previousRuleSpending * (1 + band), Math.max(previousRuleSpending * (1 - band), payment));
        }
        // Bounds: never below the floor (if the pot allows), never above the ceiling.
        payment = Math.min(Math.max(ceilingAnnual, 0), Math.max(Math.min(floorAnnual, investments + baseNet), payment));
        atFloor = payment <= floorAnnual + 1e-9 && unsmoothed < floorAnnual;
        atCeiling = payment >= ceilingAnnual - 1e-9 && unsmoothed > ceilingAnnual;
        spending = payment;
        previousRuleSpending = payment;
        amortisation = { investments, futureIncomeValue, targetValue, yearsLeft, payment, unsmoothed, bridgeCap, grossPayment };
        adjustment = spending - plannedSpending;
      } else if (flex) {
        let investments = 0;
        for (const rule of profile.accounts) investments += ledger.balances.get(rule.id) ?? 0;
        const candidate = plannedSpending * flexMultiplier;
        const candidateNeed = Math.max(0, candidate - baseNet);
        if (anchorRate === null) anchorRate = investments > 0 && candidateNeed > 0 ? candidateNeed / investments : 0.04;
        withdrawalRate = investments > 0 ? candidateNeed / investments : Number.POSITIVE_INFINITY;
        const band = plan.flexBandPercent / 100;
        const step = plan.flexStepPercent / 100;
        if (withdrawalRate > anchorRate * (1 + band)) flexMultiplier *= 1 - step;
        else if (withdrawalRate < anchorRate * (1 - band)) flexMultiplier *= 1 + step;
        // Keep the multiplier within what the floor and ceiling allow, so it cannot drift off the bounds.
        const lowest = plannedSpending > 0 ? Math.min(floorAnnual, plannedSpending) / plannedSpending : 1;
        const highest = plannedSpending > 0 ? Math.max(ceilingAnnual, plannedSpending) / plannedSpending : 1;
        flexMultiplier = Math.min(highest, Math.max(lowest, flexMultiplier));
        spending = plannedSpending * flexMultiplier;
        atFloor = flexMultiplier <= lowest + 1e-9 && lowest < 1;
        atCeiling = flexMultiplier >= highest - 1e-9 && highest > 1;
        adjustment = spending - plannedSpending;
      } else {
        spending = plannedSpending;
      }
      spending += oneOffSpending;
      let need = Math.max(0, spending - baseNet);
      // Income not spent is saved, never lost.
      if (baseNet > spending) {
        surplusSaved = baseNet - spending;
        ledger.balances.set(cashRule.id, (ledger.balances.get(cashRule.id) ?? 0) + surplusSaved);
      }

      // 4a. Use up the zero-rate allowance from income-taxed accounts first: that money is free.
      for (const rule of profile.accounts) {
        if (need <= 0 || !rule.fillsAllowanceFirst || rule.withdrawal.kind !== "income" || !isAccessible(rule, plan, age)) continue;
        const room = allowanceRoom(ledger.taxableIncome, schedule);
        const share = taxablePart(1, rule, ledger.taxFreeUsed).taxable; // taxable fraction of £1
        const grossToFill = share > 0 ? room / share : room;
        const gross = Math.min(ledger.balances.get(rule.id) ?? 0, need, grossToFill);
        const net = netOfWithdrawal(gross, rule, ledger, schedule, surcharge);
        withdraw(gross, rule, ledger);
        need = Math.max(0, need - net);
      }

      // 4b. Then the profile's order, tax-aware.
      for (const id of profile.withdrawalOrder) {
        if (need <= 0) break;
        const rule = profile.accounts.find((item) => item.id === id)!;
        if (!isAccessible(rule, plan, age)) continue;
        need = Math.max(0, need - withdrawForNet(need, rule, ledger, schedule, surcharge));
      }

      shortfall += need;
      tax += incomeTax(ledger.taxableIncome, schedule, surcharge) - credit + ledger.flatTax;
      cumulativeTax += tax;
    }

    // 5. Record the year.
    const balances: Record<string, number> = {};
    let totalInvestments = 0;
    for (const rule of profile.accounts) {
      const balance = Math.max(0, ledger.balances.get(rule.id) ?? 0);
      ledger.balances.set(rule.id, balance);
      balances[rule.id] = balance;
      totalInvestments += balance;
    }
    if (shortfall > 1 && firstShortfall === null) firstShortfall = age;
    const spendingDetail: YearDetail["spending"] = { planned: plannedSpending, adjustment, oneOffs: oneOffSpending, flexMultiplier, withdrawalRate: withdrawalRate !== null && Number.isFinite(withdrawalRate) ? withdrawalRate : null, anchorRate: flex ? anchorRate : null, atFloor, atCeiling, amortisation };
    let detail: YearDetail;
    if (wantDetail) {
    const allowanceNow = Math.max(0, schedule.allowance - (schedule.allowanceTaper && ledger.taxableIncome > schedule.allowanceTaper.from ? (ledger.taxableIncome - schedule.allowanceTaper.from) * schedule.allowanceTaper.rate : 0));
      detail = {
        spending: spendingDetail,
        income: incomeDetail,
      tax: { taxableIncome: age >= plan.retirementAge ? ledger.taxableIncome : 0, allowance: allowanceNow, incomeTax: age >= plan.retirementAge ? incomeTax(ledger.taxableIncome, schedule, surcharge) : 0, taxOnIncome, financeCredit: credit, flatTax: ledger.flatTax, propertyTax: propertyFlatTax, surchargePercent: surcharge },
      accounts: profile.accounts.map((rule) => {
        const open = opening.get(rule.id) ?? 0;
        const close = balances[rule.id]!;
        const growth = growthByAccount.get(rule.id) ?? 0;
        const contribution = contributionByAccount.get(rule.id) ?? 0;
        const withdrawal = ledger.withdrawalsByAccount.get(rule.id) ?? 0;
        return { id: rule.id, open, realReturnPercent: returnByAccount.get(rule.id) ?? 0, growth, contribution, inflow: Math.max(0, close - (open + growth + contribution - withdrawal)), withdrawal, taxFree: ledger.taxFreeByAccount.get(rule.id) ?? 0, taxable: ledger.taxableByAccount.get(rule.id) ?? 0, close };
      }),
    };
    } else {
      detail = { spending: spendingDetail, income: [], tax: NO_TAX_DETAIL, accounts: [] };
    }
    years.push({
      age,
      phase: phaseFor(age, plan, accessAge, stateAge),
      balances,
      totalInvestments,
      propertyEquity,
      propertyIncome: propertyCash,
      guaranteedIncome: guaranteed,
      withdrawals: ledger.withdrawals,
      withdrawalsByAccount: wantDetail ? Object.fromEntries(profile.accounts.map((rule) => [rule.id, ledger.withdrawalsByAccount.get(rule.id) ?? 0])) : {},
      contributions,
      surplusSaved,
      saleProceeds,
      purchaseOutlay,
      purchaseShortfall,
      market: { stockReturnPercent: age > plan.currentAge ? stockReturn : 0, bondReturnPercent: age > plan.currentAge ? bondReturn : 0, inflationPercent: age > plan.currentAge ? inflation : 0, investedOpen, investedGrowth },
      tax,
      propertyTax: propertyFlatTax,
      spending,
      oneOffSpending,
      shortfall,
      detail,
    });
  }

  return { years, firstShortfall, unfundedPurchases, totalTax: cumulativeTax, taxFreeUsed: ledger.taxFreeUsed };
}
