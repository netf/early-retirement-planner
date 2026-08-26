/**
 * Property-style checks over many randomised plans for every profile. These do not know
 * the "right answer"; they assert accounting identities that must hold in every year of
 * every simulation, on the expected path and on random market paths.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  PROFILES, PROFILE_IDS, createDefaultPlan, createProperty, expectedPath, generateMarketPath, normalisePlan,
  realRate, simulatePlan, spendingAtAge, type MarketPath, type PlanInputs, type ProfileId, type YearResult,
} from "../lib/planner.ts";

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1_664_525 + 1_013_904_223) >>> 0; return state / 4_294_967_296; };
}
const between = (random: () => number, low: number, high: number) => low + random() * (high - low);
const intBetween = (random: () => number, low: number, high: number) => Math.floor(between(random, low, high + 1));

function randomPlan(profileId: ProfileId, seed: number): PlanInputs {
  const random = rng(seed);
  const profile = PROFILES[profileId];
  const base = createDefaultPlan(profileId);
  const currentAge = intBetween(random, 25, 64);
  const retirementAge = intBetween(random, currentAge, Math.min(currentAge + 25, 75));
  const planToAge = intBetween(random, retirementAge + 5, 100);
  const scale = profileId === "pl" ? 4 : 1;
  const properties = Array.from({ length: intBetween(random, 0, 2) }, (_, index) => {
    const purchaseAge = random() < 0.4 ? intBetween(random, currentAge + 1, Math.min(retirementAge + 10, planToAge - 1)) : intBetween(random, 20, currentAge);
    const property = createProperty(profile, index + 1, currentAge);
    return {
      ...property,
      id: `p${index}`,
      purchaseAge,
      value: between(random, 100_000, 600_000) * scale,
      purchaseCostBasis: between(random, 80_000, 500_000) * scale,
      mortgage: random() < 0.5 ? 0 : between(random, 20_000, 300_000) * scale,
      mortgageRatePercent: between(random, 2, 8),
      monthlyMortgagePayment: random() < 0.3 ? 0 : between(random, 300, 2_500) * scale,
      incomeMode: random() < 0.5 ? "net" as const : "detailed" as const,
      monthlyNetIncome: between(random, 0, 1_500) * scale,
      monthlyRent: between(random, 500, 3_000) * scale,
      vacancyPercent: between(random, 0, 20),
      runningCostsPercent: between(random, 0, 40),
      rentGrowthPercent: between(random, -2, 3),
      annualGrowthPercent: between(random, -2, 6),
      rentFromAge: intBetween(random, currentAge, retirementAge + 5),
      sellAtAge: random() < 0.4 ? intBetween(random, Math.max(purchaseAge, retirementAge), planToAge) : 0,
      estimatedCgtPercent: between(random, 0, 30),
    };
  });
  const plan: PlanInputs = {
    ...base,
    taxVariant: profile.taxVariants[intBetween(random, 0, profile.taxVariants.length - 1)]!.id,
    taxSurchargePercent: profile.surchargeInput ? between(random, 0, 8) : 0,
    currentAge,
    retirementAge,
    planToAge,
    desiredMonthlySpending: between(random, 500, 8_000) * scale,
    essentialMonthlySpending: between(random, 300, 500) * scale,
    spendingMode: random() < 0.5 ? "level" : "phased",
    spendingStrategy: (["fixed", "guardrails", "flex", "amortise"] as const)[intBetween(random, 0, 3)],
    amortiseTargetAtEnd: random() < 0.5 ? 0 : between(random, 0, 400_000) * scale,
    amortiseRealReturnPercent: between(random, 0, 5),
    amortiseSmoothingPercent: random() < 0.3 ? 0 : between(random, 5, 30),
    spendingCeilingMonthly: between(random, 500, 12_000) * scale,
    flexBandPercent: between(random, 5, 50),
    flexStepPercent: between(random, 1, 30),
    guardrailCutPercent: between(random, 0, 30),
    spendingPhases: [
      { id: "a", label: "a", startAge: retirementAge, endAge: retirementAge + 10, monthlyAmount: between(random, 500, 6_000) * scale },
      { id: "b", label: "b", startAge: retirementAge + 11, endAge: planToAge, monthlyAmount: between(random, 500, 6_000) * scale },
    ],
    oneOffExpenses: random() < 0.5 ? [{ id: "o", label: "o", age: intBetween(random, currentAge, planToAge), amount: between(random, 1_000, 80_000) * scale }] : [],
    accounts: Object.fromEntries(profile.accounts.map((rule) => [rule.id, {
      balance: random() < 0.15 ? 0 : between(random, 0, 600_000) * scale,
      monthlyContribution: random() < 0.3 ? 0 : between(random, 0, 3_000) * scale,
      ...(rule.accessAge === null ? {} : { accessAge: intBetween(random, 55, 67) }),
    }])),
    guaranteedIncome: Object.fromEntries(profile.guaranteedIncome.map((rule) => [rule.id, { annual: random() < 0.3 ? 0 : between(random, 0, 40_000) * scale, fromAge: intBetween(random, 60, 70) }])),
    pensions: random() < 0.5 ? [] : Array.from({ length: intBetween(random, 1, 3) }, (_, index) => ({ id: `p${index}`, name: `Pension ${index + 1}`, annual: between(random, 0, 30_000) * scale, fromAge: intBetween(random, 50, 72) })),
    taxFreeUsed: random() < 0.8 ? 0 : between(random, 0, 300_000),
    portfolio: { ...base.portfolio, stocksPercent: between(random, 0, 100), bondsPercent: between(random, 0, 30), annualFeePercent: between(random, 0, 1), inflationPercent: between(random, 0, 6), taxableDragPercent: between(random, 0, 1) },
    properties,
  };
  return normalisePlan(plan);
}

/** The mix every invested account holds, worked out independently of the engine from the plan. */
function mixOf(plan: PlanInputs): { stocks: number; bonds: number; cash: number; fee: number } {
  const stocks = Math.min(100, plan.portfolio.stocksPercent) / 100;
  const bonds = Math.min(100 - stocks * 100, plan.portfolio.bondsPercent) / 100;
  return { stocks, bonds, cash: 1 - stocks - bonds, fee: plan.portfolio.annualFeePercent };
}

/** Real growth factor the engine should have applied to an account this year. */
function realGrowth(plan: PlanInputs, ruleId: string, path: MarketPath, index: number): number {
  const rule = PROFILES[plan.profile].accounts.find((item) => item.id === ruleId)!;
  const mix = mixOf(plan);
  const nominal = rule.isCash ? path.cashReturns[index]! : mix.stocks * path.stockReturns[index]! + mix.bonds * path.bondReturns[index]! + mix.cash * path.cashReturns[index]! - mix.fee;
  let taxed = nominal;
  if (rule.growthTax.kind === "drag") taxed = nominal - plan.portfolio.taxableDragPercent;
  if (rule.growthTax.kind === "share-of-return" && nominal > 0) taxed = nominal * (1 - rule.growthTax.rate);
  return 1 + realRate(taxed, path.inflation[index]!);
}

/** Balance-weighted real return of the invested accounts this year, from the previous year's balances. */
function investedRealReturn(plan: PlanInputs, path: MarketPath, previous: YearResult | undefined, index: number): number {
  if (!previous) return realRate(path.portfolioReturns[index]!, path.inflation[index]!);
  let total = 0, weighted = 0;
  for (const rule of PROFILES[plan.profile].accounts) {
    if (rule.isCash) continue;
    const balance = previous.balances[rule.id]!;
    total += balance;
    weighted += balance * (realGrowth(plan, rule.id, path, index) - 1);
  }
  return total > 0 ? weighted / total : realRate(path.portfolioReturns[index]!, path.inflation[index]!);
}

function checkYear(plan: PlanInputs, path: MarketPath, previous: YearResult | undefined, year: YearResult, index: number): void {
  const profile = PROFILES[plan.profile];
  const where = `${plan.profile} age ${year.age}`;
  const finite = [year.totalInvestments, year.propertyEquity, year.propertyIncome, year.guaranteedIncome, year.withdrawals, year.tax, year.spending, year.shortfall, year.surplusSaved, ...Object.values(year.balances)];
  for (const value of finite) {
    assert.ok(Number.isFinite(value), `${where}: non-finite value`);
    assert.ok(value >= -1e-6, `${where}: negative value ${value}`);
  }

  // Spending identity: everything spent came from income, withdrawals or was a shortfall.
  if (year.age >= plan.retirementAge) {
    const sources = year.propertyIncome + year.guaranteedIncome + year.withdrawals - (year.tax - year.propertyTax) + year.shortfall;
    assert.ok(Math.abs(year.spending + year.surplusSaved + year.purchaseOutlay - sources) < 0.05, `${where}: spending identity off by ${year.spending + year.surplusSaved + year.purchaseOutlay - sources} ${JSON.stringify(year)}`);
    assert.ok(year.spending >= year.oneOffSpending - 1e-6, where);
    // Guardrails only cut in a severe real down year, and never below the essential floor.
    const planned = spendingAtAge(plan, year.age);
    const real = investedRealReturn(plan, path, previous, index);
    if (plan.spendingStrategy === "flex") {
      const floor = Math.min(planned, plan.essentialMonthlySpending * 12);
      const ceiling = Math.max(planned, plan.spendingCeilingMonthly * 12);
      const base = year.spending - year.oneOffSpending;
      assert.ok(base >= floor - 1e-6 && base <= ceiling + 1e-6, `${where}: flex spending ${base} outside [${floor}, ${ceiling}]`);
    } else if (plan.spendingStrategy === "amortise") {
      const base = year.spending - year.oneOffSpending;
      const a = year.detail.spending.amortisation!;
      assert.ok(base <= Math.max(plan.spendingCeilingMonthly * 12, 0) + 1e-6, `${where}: amortised spending above ceiling`);
      assert.ok(base >= 0 && Number.isFinite(a.payment) && a.yearsLeft === plan.planToAge - year.age + 1, `${where}: amortisation detail`);
      if (previous?.detail.spending.amortisation && plan.amortiseSmoothingPercent > 0) {
        const prior = previous.spending - previous.oneOffSpending;
        const band = plan.amortiseSmoothingPercent / 100 + 1e-9;
        const withinBand = base <= prior * (1 + band) + 1e-6 && base >= prior * (1 - band) - 1e-6;
        assert.ok(withinBand || year.detail.spending.atFloor || year.detail.spending.atCeiling || base <= a.investments + 1e-6, `${where}: smoothing breached ${prior} → ${base}`);
      }
    } else if (plan.spendingStrategy === "fixed" || real >= -0.1) assert.ok(Math.abs(year.spending - planned - year.oneOffSpending) < 1e-6, `${where}: spending should be planned + one-offs`);
    else {
      const floor = Math.min(planned, plan.essentialMonthlySpending * 12);
      assert.ok(year.spending - year.oneOffSpending >= floor - 1e-6 && year.spending - year.oneOffSpending <= planned + 1e-6, `${where}: guardrail out of range`);
    }
  } else {
    assert.equal(year.spending, 0, where);
    assert.equal(year.surplusSaved, 0, where);
    // Before retirement the only withdrawals are one-off costs and property deposits.
    // withdrawals = funded purchases + one-offs actually covered
    const fundedPurchase = year.purchaseOutlay;
    const oneOffCovered = year.oneOffSpending - year.shortfall;
    assert.ok(Math.abs(year.withdrawals - fundedPurchase - oneOffCovered) < 0.05, `${where}: build-year withdrawals ${year.withdrawals} vs ${fundedPurchase} + ${oneOffCovered}`);
    assert.ok(year.tax - year.propertyTax < 1e-6, `${where}: income tax before retirement`);
  }

  // Account roll-forward: balance = grown previous balance + contributions − withdrawals (+ cash inflows).
  if (previous) {
    let cashInflows = year.surplusSaved + year.saleProceeds;
    for (const rule of profile.accounts) {
      const contribution = year.age <= plan.retirementAge ? plan.accounts[rule.id]!.monthlyContribution * 12 : 0;
      const expected = previous.balances[rule.id]! * realGrowth(plan, rule.id, path, index) + contribution - year.withdrawalsByAccount[rule.id]! + (rule.isCash ? cashInflows : 0);
      if (rule.isCash) cashInflows = 0;
      assert.ok(Math.abs(Math.max(0, expected) - year.balances[rule.id]!) < 0.05, `${where} ${rule.id}: expected ${expected}, got ${year.balances[rule.id]}`);
      assert.ok(year.withdrawalsByAccount[rule.id]! <= previous.balances[rule.id]! * realGrowth(plan, rule.id, path, index) + contribution + (rule.isCash ? year.surplusSaved + year.saleProceeds : 0) + 0.05, `${where} ${rule.id}: overdrawn`);
      // Locked accounts are never touched before their access age.
      if (rule.accessAge !== null && year.age < plan.accounts[rule.id]!.accessAge!) assert.equal(year.withdrawalsByAccount[rule.id], 0, `${where} ${rule.id}: drawn before access age`);
    }
  } else {
    // Starting year: no growth, no contributions.
    for (const rule of profile.accounts) assert.ok(year.balances[rule.id]! <= plan.accounts[rule.id]!.balance + year.surplusSaved + year.saleProceeds + 1e-6, where);
  }

  // A shortfall means every accessible account is empty.
  if (year.shortfall > 1) {
    for (const rule of profile.accounts) {
      const accessible = rule.accessAge === null || year.age >= plan.accounts[rule.id]!.accessAge!;
      if (accessible && year.age >= plan.retirementAge) assert.ok(year.balances[rule.id]! < 1, `${where} ${rule.id}: shortfall with money left (${year.balances[rule.id]})`);
    }
  }
  assert.ok(Math.abs(Object.values(year.balances).reduce((sum, value) => sum + value, 0) - year.totalInvestments) < 1e-6, where);

  // The audit trail must reconcile with the headline figures.
  const detail = year.detail;
  assert.ok(Math.abs(detail.spending.planned + detail.spending.adjustment + detail.spending.oneOffs - year.spending) < 1e-6 || year.age < plan.retirementAge, `${where}: spending detail`);
  assert.ok(Math.abs(detail.tax.incomeTax - detail.tax.financeCredit + detail.tax.flatTax + detail.tax.propertyTax - year.tax) < 1e-6, `${where}: tax detail ${JSON.stringify(detail.tax)} vs ${year.tax}`);
  if (year.age >= plan.retirementAge) assert.ok(Math.abs(detail.income.reduce((sum, item) => sum + item.cash, 0) - year.propertyIncome - year.guaranteedIncome) < 1e-6, `${where}: income detail`);
  for (const account of detail.accounts) {
    assert.ok(Math.abs(account.open + account.growth + account.contribution + account.inflow - account.withdrawal - account.close) < 0.05 || account.close === 0, `${where} ${account.id}: account detail`);
    assert.ok(Math.abs(account.withdrawal - year.withdrawalsByAccount[account.id]!) < 1e-6, where);
    assert.ok(Math.abs(account.close - year.balances[account.id]!) < 1e-6, where);
    assert.ok(account.taxable + account.taxFree <= account.withdrawal + 1e-6, where);
  }
}

for (const profileId of PROFILE_IDS) {
  test(`${profileId}: accounting identities hold on 60 random plans × expected and random paths`, () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const plan = randomPlan(profileId, seed * 101 + profileId.length);
      for (const path of [expectedPath(plan), generateMarketPath(plan, seed)]) {
        const projection = simulatePlan(plan, path);
        assert.equal(projection.years.length, plan.planToAge - plan.currentAge + 1);
        projection.years.forEach((year, index) => checkYear(plan, path, projection.years[index - 1], year, index));
        const firstShort = projection.years.find((year) => year.shortfall > 1)?.age ?? null;
        assert.equal(projection.firstShortfall, firstShort);
        assert.ok(Math.abs(projection.totalTax - projection.years.reduce((sum, year) => sum + (year.age >= plan.retirementAge ? year.tax : 0), 0)) < 0.01);
      }
    }
  });

  test(`${profileId}: more money never makes a plan fail earlier`, () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const plan = randomPlan(profileId, seed * 7_919);
      const richer: PlanInputs = { ...plan, accounts: Object.fromEntries(Object.entries(plan.accounts).map(([id, account]) => [id, { ...account, balance: account.balance * 2 + 10_000 }])) };
      const poorerRun = simulatePlan(plan);
      const richRun = simulatePlan(richer);
      // Extra money can make a previously unaffordable purchase go ahead, which spends capital; compare like with like.
      if (poorerRun.unfundedPurchases.length !== richRun.unfundedPurchases.length) continue;
      const poorer = poorerRun.firstShortfall;
      const rich = richRun.firstShortfall;
      assert.ok(poorer === null ? rich === null : rich === null || rich >= poorer, `${profileId} seed ${seed}: ${poorer} → ${rich}`);
    }
  });

  test(`${profileId}: same inputs always give the same result`, () => {
    const plan = randomPlan(profileId, 42);
    assert.deepEqual(simulatePlan(plan), simulatePlan(structuredClone(plan)));
    assert.deepEqual(generateMarketPath(plan, 5), generateMarketPath(plan, 5));
  });

  test(`${profileId}: normalisePlan is idempotent`, () => {
    const plan = randomPlan(profileId, 9);
    assert.deepEqual(normalisePlan(plan), plan);
    assert.deepEqual(normalisePlan(JSON.parse(JSON.stringify(plan))), plan);
  });
}
