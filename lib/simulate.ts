import { expectedPath, mixReturn, planMix, type MarketPath } from "./market.ts";
import { annuityPayment, presentValue, realRate, solveMonotonic } from "./money.ts";
import { accountSlots, incomeStreams, partnerAgeAt, ownerAccounts, pensionAccessAge, profileOf, spendingAtAge, statePensionAge, toHolderAge, type AccountSlot, type Owner, type PlanInputs } from "./plan.ts";
import { taxSchedule, type AccountRule, type TaxSchedule } from "./profiles/index.ts";
import { acquisitionCost, completePurchase, growProperty, initialPropertyState, propertyYear, type PropertyState } from "./property.ts";
import { allowanceRoom, incomeTax, marginalTax } from "./tax.ts";

export type PhaseKey = "build" | "bridge" | "pension" | "state";

export type YearResult = {
  age: number;
  phase: PhaseKey;
  /** Keyed by account slot: the rule id for the plan holder, `partner:<rule>` for a partner. */
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
    amortisation: { investments: number; futureIncomeValue: number; targetValue: number; yearsLeft: number; payment: number; unsmoothed: number; /** The level payment out of the pot before tax. */ grossPayment: number; /** Cap applied while locked accounts are still shut, null once everything is open. */ bridgeCap: number | null } | null;
  };
  /** Income before any withdrawals: each property and each guaranteed income. */
  income: { label: string; cash: number; taxable: number; note?: string }[];
  tax: { taxableIncome: number; allowance: number; incomeTax: number; /** Income tax due on rent and guaranteed income alone, before any withdrawals. */ taxOnIncome: number; financeCredit: number; flatTax: number; propertyTax: number; surchargePercent: number; /** Present for a household: each person's own figures. */ byOwner?: { owner: Owner; taxableIncome: number; allowance: number; incomeTax: number }[] };
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

/** Per-person tax state: each has their own allowance, bands and tax-free-cash allowance. */
type PersonTax = { taxableIncome: number; taxFreeUsed: number };

type Ledger = {
  balances: Map<string, number>;
  tax: Record<Owner, PersonTax>;
  flatTax: number;
  withdrawals: number;
  withdrawalsByAccount: Map<string, number>;
  taxableByAccount: Map<string, number>;
  taxFreeByAccount: Map<string, number>;
};

const OWNERS: Owner[] = ["you", "partner"];

function phaseFor(age: number, plan: PlanInputs, accessAge: number, stateAge: number): PhaseKey {
  if (age < plan.retirementAge) return "build";
  if (age < accessAge) return "bridge";
  if (age < stateAge) return "pension";
  return "state";
}

/** Split a withdrawal from an income-taxed account into taxable and tax-free parts. */
function taxablePart(gross: number, rule: AccountRule, taxFreeUsed: number): { taxable: number; taxFree: number } {
  if (rule.withdrawal.kind !== "income") return { taxable: 0, taxFree: gross };
  const share = rule.withdrawal.taxFreeShare ?? 0;
  const capRemaining = rule.withdrawal.taxFreeCap === undefined ? Number.POSITIVE_INFINITY : Math.max(0, rule.withdrawal.taxFreeCap - taxFreeUsed);
  const taxFree = Math.min(gross * share, capRemaining);
  return { taxable: gross - taxFree, taxFree };
}

/** Net cash received from withdrawing `gross` from a slot given what its owner has already earned this year. */
function netOfWithdrawal(gross: number, slot: AccountSlot, ledger: Ledger, schedule: TaxSchedule, surcharge: number): number {
  const person = ledger.tax[slot.owner];
  switch (slot.rule.withdrawal.kind) {
    case "free": return gross;
    case "flat": return gross * (1 - slot.rule.withdrawal.rate);
    case "income": return gross - marginalTax(person.taxableIncome, taxablePart(gross, slot.rule, person.taxFreeUsed).taxable, schedule, surcharge);
  }
}

/** Take `gross` out of a slot, recording the tax consequences for its owner. */
function withdraw(gross: number, slot: AccountSlot, ledger: Ledger): void {
  if (gross <= 0) return;
  ledger.balances.set(slot.id, (ledger.balances.get(slot.id) ?? 0) - gross);
  ledger.withdrawals += gross;
  ledger.withdrawalsByAccount.set(slot.id, (ledger.withdrawalsByAccount.get(slot.id) ?? 0) + gross);
  const person = ledger.tax[slot.owner];
  if (slot.rule.withdrawal.kind === "income") {
    const parts = taxablePart(gross, slot.rule, person.taxFreeUsed);
    person.taxableIncome += parts.taxable;
    person.taxFreeUsed += parts.taxFree;
    ledger.taxableByAccount.set(slot.id, (ledger.taxableByAccount.get(slot.id) ?? 0) + parts.taxable);
    ledger.taxFreeByAccount.set(slot.id, (ledger.taxFreeByAccount.get(slot.id) ?? 0) + parts.taxFree);
  } else if (slot.rule.withdrawal.kind === "flat") {
    ledger.flatTax += gross * slot.rule.withdrawal.rate;
  }
}

/** Withdraw enough to deliver `netNeeded` after tax; returns the net actually delivered. */
function withdrawForNet(netNeeded: number, slot: AccountSlot, ledger: Ledger, schedule: TaxSchedule, surcharge: number): number {
  const available = ledger.balances.get(slot.id) ?? 0;
  if (netNeeded <= 0 || available <= 0) return 0;
  let gross: number;
  if (slot.rule.withdrawal.kind === "free") gross = Math.min(available, netNeeded);
  else if (slot.rule.withdrawal.kind === "flat") gross = Math.min(available, netNeeded / (1 - slot.rule.withdrawal.rate));
  else gross = solveMonotonic((candidate) => netOfWithdrawal(candidate, slot, ledger, schedule, surcharge), netNeeded, available);
  const net = netOfWithdrawal(gross, slot, ledger, schedule, surcharge);
  withdraw(gross, slot, ledger);
  return net;
}

function cloneLedger(ledger: Ledger): Ledger {
  return {
    ...ledger,
    balances: new Map(ledger.balances),
    tax: { you: { ...ledger.tax.you }, partner: { ...ledger.tax.partner } },
    withdrawalsByAccount: new Map(ledger.withdrawalsByAccount),
    taxableByAccount: new Map(ledger.taxableByAccount),
    taxFreeByAccount: new Map(ledger.taxFreeByAccount),
  };
}

export type SimulateOptions = {
  /** False skips the per-year audit detail (account ledger, income and tax breakdown); the totals, spending flags and balances are unchanged. Used for the thousands of throwaway runs behind the Monte Carlo and solvers. */
  detail?: boolean;
};

/** The same schedule with every threshold multiplied by `factor` — how a cash-frozen schedule looks in today's money. */
export function scaleSchedule(schedule: TaxSchedule, factor: number): TaxSchedule {
  return {
    allowance: schedule.allowance * factor,
    allowanceTaper: schedule.allowanceTaper ? { from: schedule.allowanceTaper.from * factor, rate: schedule.allowanceTaper.rate } : undefined,
    bands: schedule.bands.map((band) => ({ ...band, upTo: Number.isFinite(band.upTo) ? band.upTo * factor : band.upTo })),
  };
}

const NO_TAX_DETAIL: YearDetail["tax"] = { taxableIncome: 0, allowance: 0, incomeTax: 0, taxOnIncome: 0, financeCredit: 0, flatTax: 0, propertyTax: 0, surchargePercent: 0 };

export function simulatePlan(plan: PlanInputs, suppliedPath?: MarketPath, options: SimulateOptions = {}): Projection {
  const wantDetail = options.detail !== false;
  const profile = profileOf(plan);
  const baseSchedule = taxSchedule(profile, plan.taxVariant);
  /** This year's schedule in today's money: while thresholds are frozen in cash terms they shrink in real terms. */
  let schedule = baseSchedule;
  let frozenDeflator = 1;
  const surcharge = plan.taxSurchargePercent;
  const path = suppliedPath ?? expectedPath(plan);
  const accessAge = pensionAccessAge(plan);
  const stateAge = statePensionAge(plan);
  const streams = incomeStreams(plan);
  const slots = accountSlots(plan);
  const owners: Owner[] = plan.partner ? OWNERS : ["you"];
  /** Each person's share of jointly held property income and its taxable profit. */
  const propertyShare = plan.partner ? 0.5 : 1;

  // Everything below is in the plan holder's age. A partner's own ages are converted once, here.
  const slotAccessAge = (slot: AccountSlot): number | null => {
    if (slot.rule.accessAge === null) return null;
    const own = ownerAccounts(plan, slot.owner)[slot.rule.id]?.accessAge ?? slot.rule.accessAge;
    return slot.owner === "partner" ? toHolderAge(plan, own) : own;
  };
  const isAccessible = (slot: AccountSlot, age: number): boolean => { const unlock = slotAccessAge(slot); return unlock === null || age >= unlock; };
  const lastContributionAge = (owner: Owner): number => owner === "partner" && plan.partner ? toHolderAge(plan, plan.partner.retirementAge) : plan.retirementAge;
  const slotsFor = (id: string) => slots.filter((slot) => slot.rule.id === id);

  const ledger: Ledger = {
    balances: new Map(slots.map((slot) => [slot.id, Math.max(0, ownerAccounts(plan, slot.owner)[slot.rule.id]?.balance ?? 0)])),
    tax: { you: { taxableIncome: 0, taxFreeUsed: Math.max(0, plan.taxFreeUsed) }, partner: { taxableIncome: 0, taxFreeUsed: Math.max(0, plan.partner?.taxFreeUsed ?? 0) } },
    flatTax: 0,
    withdrawals: 0,
    withdrawalsByAccount: new Map(),
    taxableByAccount: new Map(),
    taxFreeByAccount: new Map(),
  };

  /** Net cash that drawing `gross` through the normal waterfall would deliver this year — computed on a copy, nothing is withdrawn. */
  const netOfGrossDraw = (gross: number, age: number, base: Ledger): number => {
    const trial = cloneLedger(base);
    let remaining = Math.max(0, gross);
    let net = 0;
    const take = (slot: AccountSlot, amount: number) => {
      if (amount <= 0) return;
      net += netOfWithdrawal(amount, slot, trial, schedule, surcharge);
      withdraw(amount, slot, trial);
      remaining -= amount;
    };
    for (const slot of slots) {
      if (remaining <= 0 || !slot.rule.fillsAllowanceFirst || slot.rule.withdrawal.kind !== "income" || !isAccessible(slot, age)) continue;
      const person = trial.tax[slot.owner];
      const share = taxablePart(1, slot.rule, person.taxFreeUsed).taxable;
      const grossToFill = share > 0 ? allowanceRoom(person.taxableIncome, schedule) / share : allowanceRoom(person.taxableIncome, schedule);
      take(slot, Math.min(trial.balances.get(slot.id) ?? 0, remaining, grossToFill));
    }
    for (const id of profile.withdrawalOrder) {
      for (const slot of slotsFor(id)) {
        if (remaining <= 0) break;
        if (!isAccessible(slot, age)) continue;
        take(slot, Math.min(trial.balances.get(slot.id) ?? 0, remaining));
      }
    }
    return net;
  };

  /** Cover a cash need from accessible accounts in the profile's order, ignoring tax (used before retirement). */
  const coverFromAccessible = (amount: number, age: number): number => {
    amount = Math.max(0, amount);
    let remaining = amount;
    for (const id of profile.withdrawalOrder) {
      for (const slot of slotsFor(id)) {
        if (remaining <= 0) break;
        if (!isAccessible(slot, age) || slot.rule.withdrawal.kind !== "free") continue;
        const draw = Math.min(ledger.balances.get(slot.id) ?? 0, remaining);
        withdraw(draw, slot, ledger);
        remaining -= draw;
      }
    }
    return amount - remaining;
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
  const cashSlot = slots.find((slot) => slot.owner === "you" && slot.rule.isCash) ?? slots[0]!;

  for (let age = plan.currentAge; age <= plan.planToAge; age += 1) {
    const index = age - plan.currentAge;
    const stockReturn = path.stockReturns[index] ?? path.stockReturns.at(-1) ?? 0;
    const bondReturn = path.bondReturns[index] ?? path.bondReturns.at(-1) ?? 0;
    const nominalCashReturn = path.cashReturns[index] ?? plan.portfolio.cashReturnPercent;
    const inflation = path.inflation[index] ?? plan.portfolio.inflationPercent;
    if (index > 0 && index <= plan.thresholdFreezeYears) frozenDeflator *= 1 + inflation / 100;
    schedule = frozenDeflator === 1 ? baseSchedule : scaleSchedule(baseSchedule, 1 / frozenDeflator);
    /** Real return of what is actually invested, weighted by balance — the guardrail trigger. */
    let portfolioRealReturn = realRate(path.portfolioReturns[index] ?? 0, inflation);
    for (const owner of OWNERS) ledger.tax[owner].taxableIncome = 0;
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
      for (const slot of slots) {
        const rule = slot.rule;
        const balance = ledger.balances.get(slot.id) ?? 0;
        const nominal = rule.isCash ? nominalCashReturn : mixReturn(planMix(plan), stockReturn, bondReturn, nominalCashReturn);
        if (!rule.isCash) { investedBefore += balance; investedReturn += balance * realRate(nominal, inflation); }
        let taxed = nominal;
        if (rule.growthTax.kind === "drag") taxed = nominal - plan.portfolio.taxableDragPercent;
        if (rule.growthTax.kind === "share-of-return" && nominal > 0) taxed = nominal * (1 - rule.growthTax.rate);
        if (rule.growthTax.kind === "interest" && nominal > 0 && balance > 0) {
          const interest = balance * nominal / 100;
          taxed = nominal - Math.max(0, interest - rule.growthTax.allowance) * rule.growthTax.rate / balance * 100;
        }
        const ownerAge = slot.owner === "partner" ? partnerAgeAt(plan, age) : age;
        const stillPays = age <= lastContributionAge(slot.owner) && (rule.contributeUntilAge === undefined || ownerAge < rule.contributeUntilAge);
        const paidIn = stillPays ? (ownerAccounts(plan, slot.owner)[rule.id]?.monthlyContribution ?? 0) * 12 : 0;
        const contribution = paidIn * (rule.bonus && ownerAge < rule.bonus.untilAge ? 1 + rule.bonus.rate : 1);
        contributions += contribution;
        const real = realRate(taxed, inflation);
        growthByAccount.set(slot.id, balance * real);
        returnByAccount.set(slot.id, real * 100);
        contributionByAccount.set(slot.id, contribution);
        ledger.balances.set(slot.id, balance * (1 + real) + contribution);
      }
      if (investedBefore > 0) portfolioRealReturn = investedReturn / investedBefore;
      investedOpen = investedBefore;
      for (const slot of slots) if (!slot.rule.isCash) investedGrowth += growthByAccount.get(slot.id) ?? 0;
    }

    // 2. Property purchases, growth and amortisation.
    for (const state of properties) {
      state.purchasedThisYear = false;
      if (!state.active && age === state.asset.purchaseAge) {
        const cost = acquisitionCost(state.asset);
        const accessible = slots.reduce((sum, slot) => sum + (isAccessible(slot, age) && slot.rule.withdrawal.kind === "free" ? ledger.balances.get(slot.id) ?? 0 : 0), 0);
        if (accessible + 1 >= cost) {
          purchaseOutlay += coverFromAccessible(cost, age);
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
        ledger.balances.set(cashSlot.id, (ledger.balances.get(cashSlot.id) ?? 0) + year.saleProceeds);
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
    // UK-style relief: a credit of rate × mortgage interest, never more than the tax due on the rental profit — per person, on their share.
    const creditRate = profile.property.rentalTax.kind === "income" ? profile.property.rentalTax.financeCostCreditRate ?? 0 : 0;
    const financeCredit = (taxableTotal: number, share: number) => creditRate > 0
      ? Math.min(mortgageInterest * share * creditRate, marginalTax(Math.max(0, taxableTotal - propertyTaxable * share), propertyTaxable * share, schedule, surcharge))
      : 0;
    /** Net income at a future age if today's rent continued and each person's guaranteed income had started — the amortise rule's view of the future. */
    const netIncomeAt = (future: number): number => {
      let net = propertyCash;
      for (const owner of owners) {
        let gross = 0, taxable = 0;
        for (const stream of streams) if (stream.owner === owner && future >= stream.fromAge) { gross += stream.annual; taxable += stream.annual * stream.taxableShare; }
        net += gross - incomeTax(taxable + propertyTaxable * propertyShare, schedule, surcharge);
      }
      return net;
    };

    if (age < plan.retirementAge) {
      if (oneOffSpending > 0) shortfall += oneOffSpending - coverFromAccessible(oneOffSpending, age);
    } else {
      plannedSpending = spendingAtAge(plan, age);

      for (const stream of streams) {
        if (age < stream.fromAge) continue;
        guaranteed += stream.annual;
        ledger.tax[stream.owner].taxableIncome += stream.annual * stream.taxableShare;
        if (stream.annual > 0) incomeDetail.push({ label: stream.label, cash: stream.annual, taxable: stream.annual * stream.taxableShare, note: stream.taxableShare < 1 ? `${Math.round(stream.taxableShare * 100)}% taxable` : undefined });
      }
      let baseTax = 0;
      for (const owner of owners) {
        const person = ledger.tax[owner];
        person.taxableIncome += propertyTaxable * propertyShare;
        const ownerCredit = financeCredit(person.taxableIncome, propertyShare);
        credit += ownerCredit;
        baseTax += incomeTax(person.taxableIncome, schedule, surcharge) - ownerCredit;
      }
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
        for (const slot of slots) investments += ledger.balances.get(slot.id) ?? 0;
        const yearsLeft = plan.planToAge - age + 1;
        let futureIncomeValue = 0;
        for (let future = age + 1; future <= plan.planToAge; future += 1) futureIncomeValue += presentValue(Math.max(0, netIncomeAt(future)), amortiseRate, future - age);
        const targetValue = presentValue(plan.amortiseTargetAtEnd, amortiseRate, yearsLeft - 1);
        const grossPayment = Math.max(0, annuityPayment(investments + futureIncomeValue - targetValue, amortiseRate, yearsLeft));
        // The payment is what comes OUT of the pot; what you can spend is that net of the tax the withdrawals cause.
        let unsmoothed = baseNet + netOfGrossDraw(Math.max(0, grossPayment - baseNet), age, ledger);
        // Liquidity: while anything is still locked, the payment cannot exceed what the money reachable before each unlock
        // (plus income meanwhile) can sustain until that unlock. Every future access age is a barrier; the tightest one binds.
        let bridgeCap: number | null = null;
        const barriers = [...new Set(slots.map(slotAccessAge).filter((unlock): unlock is number => unlock !== null && unlock > age))].sort((left, right) => left - right);
        if (barriers.length > 0) {
          let reachable = 0;
          for (const slot of slots) if (isAccessible(slot, age)) reachable += ledger.balances.get(slot.id) ?? 0;
          let bridgeIncome = 0;
          let future = age + 1;
          let grossCap = Infinity;
          for (const barrier of barriers) {
            for (; future < barrier; future += 1) bridgeIncome += presentValue(Math.max(0, netIncomeAt(future)), amortiseRate, future - age);
            grossCap = Math.min(grossCap, Math.max(0, annuityPayment(reachable + bridgeIncome, amortiseRate, barrier - age)));
            // Whatever unlocks at this barrier is reachable for every later one.
            for (const slot of slots) if (slotAccessAge(slot) === barrier) reachable += ledger.balances.get(slot.id) ?? 0;
          }
          bridgeCap = baseNet + netOfGrossDraw(grossCap, age, ledger);
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
        for (const slot of slots) investments += ledger.balances.get(slot.id) ?? 0;
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
        ledger.balances.set(cashSlot.id, (ledger.balances.get(cashSlot.id) ?? 0) + surplusSaved);
      }

      // 4a. Use up each person's zero-rate allowance from income-taxed accounts first: that money is free.
      for (const slot of slots) {
        if (need <= 0 || !slot.rule.fillsAllowanceFirst || slot.rule.withdrawal.kind !== "income" || !isAccessible(slot, age)) continue;
        const person = ledger.tax[slot.owner];
        const room = allowanceRoom(person.taxableIncome, schedule);
        const share = taxablePart(1, slot.rule, person.taxFreeUsed).taxable; // taxable fraction of one unit
        const grossToFill = share > 0 ? room / share : room;
        const gross = Math.min(ledger.balances.get(slot.id) ?? 0, need, grossToFill);
        const net = netOfWithdrawal(gross, slot, ledger, schedule, surcharge);
        withdraw(gross, slot, ledger);
        need = Math.max(0, need - net);
      }

      // 4b. Then the profile's order, tax-aware. Where both people hold the type, draw in small steps from
      //     whichever of them pays the lower marginal rate right now — a couple's cheapest way to fund a year.
      for (const id of profile.withdrawalOrder) {
        if (need <= 0) break;
        const group = slotsFor(id).filter((slot) => isAccessible(slot, age));
        if (group.length > 1 && group[0]!.rule.withdrawal.kind === "income") {
          const costOf = (slot: AccountSlot) => { const person = ledger.tax[slot.owner]; return marginalTax(person.taxableIncome, taxablePart(1, slot.rule, person.taxFreeUsed).taxable, schedule, surcharge); };
          while (need > 0.005) {
            const candidates = group.filter((slot) => (ledger.balances.get(slot.id) ?? 0) > 0.005);
            if (candidates.length === 0) break;
            const cheapest = candidates.reduce((best, slot) => {
              const cost = costOf(slot), bestCost = costOf(best);
              return cost < bestCost - 1e-12 || (Math.abs(cost - bestCost) <= 1e-12 && ledger.tax[slot.owner].taxableIncome < ledger.tax[best.owner].taxableIncome) ? slot : best;
            });
            const delivered = withdrawForNet(Math.min(need, Math.max(500, need / 12)), cheapest, ledger, schedule, surcharge);
            if (delivered <= 0) break;
            need = Math.max(0, need - delivered);
          }
        } else {
          for (const slot of group) {
            if (need <= 0) break;
            need = Math.max(0, need - withdrawForNet(need, slot, ledger, schedule, surcharge));
          }
        }
      }

      shortfall += need;
      for (const owner of owners) tax += incomeTax(ledger.tax[owner].taxableIncome, schedule, surcharge);
      tax += ledger.flatTax - credit;
      cumulativeTax += tax;
    }

    // 5. Record the year.
    const balances: Record<string, number> = {};
    let totalInvestments = 0;
    for (const slot of slots) {
      const balance = Math.max(0, ledger.balances.get(slot.id) ?? 0);
      ledger.balances.set(slot.id, balance);
      balances[slot.id] = balance;
      totalInvestments += balance;
    }
    if (shortfall > 1 && firstShortfall === null) firstShortfall = age;
    const spendingDetail: YearDetail["spending"] = { planned: plannedSpending, adjustment, oneOffs: oneOffSpending, flexMultiplier, withdrawalRate: withdrawalRate !== null && Number.isFinite(withdrawalRate) ? withdrawalRate : null, anchorRate: flex ? anchorRate : null, atFloor, atCeiling, amortisation };
    let detail: YearDetail;
    if (wantDetail) {
      const retired = age >= plan.retirementAge;
      const allowanceFor = (taxable: number) => Math.max(0, schedule.allowance - (schedule.allowanceTaper && taxable > schedule.allowanceTaper.from ? (taxable - schedule.allowanceTaper.from) * schedule.allowanceTaper.rate : 0));
      const byOwner = owners.map((owner) => ({ owner, taxableIncome: retired ? ledger.tax[owner].taxableIncome : 0, allowance: allowanceFor(ledger.tax[owner].taxableIncome), incomeTax: retired ? incomeTax(ledger.tax[owner].taxableIncome, schedule, surcharge) : 0 }));
      detail = {
        spending: spendingDetail,
        income: incomeDetail,
        tax: {
          taxableIncome: byOwner.reduce((sum, person) => sum + person.taxableIncome, 0),
          allowance: byOwner.reduce((sum, person) => sum + person.allowance, 0),
          incomeTax: byOwner.reduce((sum, person) => sum + person.incomeTax, 0),
          taxOnIncome, financeCredit: credit, flatTax: ledger.flatTax, propertyTax: propertyFlatTax, surchargePercent: surcharge,
          ...(plan.partner ? { byOwner } : {}),
        },
        accounts: slots.map((slot) => {
          const open = opening.get(slot.id) ?? 0;
          const close = balances[slot.id]!;
          const growth = growthByAccount.get(slot.id) ?? 0;
          const contribution = contributionByAccount.get(slot.id) ?? 0;
          const withdrawal = ledger.withdrawalsByAccount.get(slot.id) ?? 0;
          return { id: slot.id, open, realReturnPercent: returnByAccount.get(slot.id) ?? 0, growth, contribution, inflow: Math.max(0, close - (open + growth + contribution - withdrawal)), withdrawal, taxFree: ledger.taxFreeByAccount.get(slot.id) ?? 0, taxable: ledger.taxableByAccount.get(slot.id) ?? 0, close };
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
      withdrawalsByAccount: wantDetail ? Object.fromEntries(slots.map((slot) => [slot.id, ledger.withdrawalsByAccount.get(slot.id) ?? 0])) : {},
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

  return { years, firstShortfall, unfundedPurchases, totalTax: cumulativeTax, taxFreeUsed: ledger.tax.you.taxFreeUsed };
}
