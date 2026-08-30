import assert from "node:assert/strict";
import test from "node:test";
import { accountSlots, createPartner, incomeStreams, normalisePlan, planChecks, simulatePlan, totalCurrentInvestments, withPots, type PlanInputs, type Pot } from "../lib/planner.ts";
import { FLAT_PORTFOLIO, noAccounts, noIncome, ukScenario } from "./helpers.ts";

const close = (actual: number, expected: number, message: string, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
const pot = (id: string, type: string, balance: number, owner: "you" | "partner", monthlyContribution = 0): Pot => ({ id, type, name: id, balance, monthlyContribution, owner });

/** A retired couple, same age, no other income, flat markets: tax is the only thing that differs. */
function couple(pots: Pot[], overrides: Partial<PlanInputs> = {}): PlanInputs {
  const base = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 61, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [], pensions: [], ...overrides });
  const partner = { ...createPartner(base), name: "Sam", currentAge: 60, retirementAge: 60, guaranteedIncome: noIncome("uk") };
  return withPots({ ...base, partner }, pots);
}

test("a household has one slot per person per type; a single plan keeps the old ids", () => {
  const single = ukScenario();
  assert.deepEqual(accountSlots(single).map((slot) => slot.id), ["isa", "sipp", "gia", "cash", "cashIsa"]);
  const both = couple([]);
  assert.deepEqual(accountSlots(both).map((slot) => slot.id).slice(5), ["partner:isa", "partner:sipp", "partner:gia", "partner:cash", "partner:cashIsa"]);
});

test("two people, two personal allowances: the same pension income split across a couple is taxed less", () => {
  const spend = 40_000;
  const one = couple([pot("mine", "sipp", 1_000_000, "you")], { desiredMonthlySpending: spend / 12, essentialMonthlySpending: spend / 12 });
  const split = couple([pot("mine", "sipp", 500_000, "you"), pot("theirs", "sipp", 500_000, "partner")], { desiredMonthlySpending: spend / 12, essentialMonthlySpending: spend / 12 });
  const yearOne = simulatePlan(one).years[0]!;
  const yearSplit = simulatePlan(split).years[0]!;
  assert.equal(yearOne.shortfall, 0); assert.equal(yearSplit.shortfall, 0);
  assert.ok(yearSplit.tax < yearOne.tax, `couple ${yearSplit.tax} vs one person ${yearOne.tax}`);
  // Each person draws the gross that yields half the spend; 25% tax-free, allowance 12,570 each.
  const drawn = yearSplit.withdrawalsByAccount;
  // Same marginal rate on both sides, so the draw is shared evenly (to within one step of the cheapest-first walk).
  close(drawn["sipp"]!, drawn["partner:sipp"]!, "each person funds about half", 1_500);
  assert.deepEqual(yearSplit.detail.tax.byOwner!.map((person) => person.owner), ["you", "partner"]);
  close(yearSplit.detail.tax.byOwner![0]!.incomeTax, yearSplit.detail.tax.byOwner![1]!.incomeTax, "and they pay about the same tax", 400);
  close(yearSplit.detail.tax.incomeTax, yearSplit.detail.tax.byOwner![0]!.incomeTax + yearSplit.detail.tax.byOwner![1]!.incomeTax, "the total is the sum of both", 0.01);
  // The point of the household model: the same money split across two allowances and two basic-rate bands costs roughly half the tax of one person drawing it all.
  assert.ok(yearSplit.tax < yearOne.tax * 0.6, `${yearSplit.tax} vs ${yearOne.tax}`);
});

test("each person has their own tax-free cash allowance", () => {
  const plan = couple([pot("mine", "sipp", 600_000, "you"), pot("theirs", "sipp", 600_000, "partner")], { desiredMonthlySpending: 5_000, essentialMonthlySpending: 5_000, taxFreeUsed: 268_275 });
  const year = simulatePlan(plan).years[0]!;
  const mine = year.detail.accounts.find((account) => account.id === "sipp")!;
  const theirs = year.detail.accounts.find((account) => account.id === "partner:sipp")!;
  assert.ok(mine.withdrawal > 0 && theirs.withdrawal > 0);
  assert.equal(mine.taxFree, 0, "the plan holder has used their allowance");
  close(theirs.taxFree, theirs.withdrawal * 0.25, "the partner still gets 25% tax-free", 0.5);
});

test("a partner's ages are their own: access age, state pension and contributions follow their birthday", () => {
  const base = ukScenario({ currentAge: 50, retirementAge: 52, planToAge: 60, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), properties: [], pensions: [], desiredMonthlySpending: 1_000, essentialMonthlySpending: 1_000 });
  // Partner is 5 years older: their SIPP (access 57) opens when the plan holder is 52, their state pension (68) when the holder is 63.
  const partner = { ...createPartner(base), name: "Sam", currentAge: 55, retirementAge: 56, guaranteedIncome: { ...noIncome("uk"), statePension: { annual: 12_000, fromAge: 68 } } };
  const plan = withPots({ ...base, partner }, [pot("theirs", "sipp", 300_000, "partner", 1_000), pot("mine", "isa", 0, "you", 500)]);
  const streams = incomeStreams(plan);
  assert.equal(streams.find((stream) => stream.owner === "partner")!.fromAge, 63, "state pension age converted to the plan holder's age");
  const years = simulatePlan(plan).years;
  const at = (age: number) => years.find((year) => year.age === age)!;
  assert.equal(at(51).withdrawals, 0, "nothing needed before retirement");
  assert.equal(at(52).shortfall, 0, "at 52 the partner is 57 and their SIPP pays for the year");
  assert.ok(at(52).withdrawalsByAccount["partner:sipp"]! > 0);
  // Contributions: the partner stops at their 56 (holder 51), the holder at 52.
  const contributionOf = (age: number, id: string) => at(age).detail.accounts.find((account) => account.id === id)!.contribution;
  assert.equal(contributionOf(51, "partner:sipp"), 12_000);
  assert.equal(contributionOf(52, "partner:sipp"), 0);
  assert.equal(contributionOf(52, "isa"), 6_000);
  assert.equal(contributionOf(53, "isa"), 0);
});

test("rent is shared: each person is taxed on half, so a couple keeps more of it", () => {
  const single = ukScenario({ currentAge: 60, retirementAge: 60, planToAge: 61, portfolio: FLAT_PORTFOLIO, accounts: noAccounts("uk"), guaranteedIncome: noIncome("uk"), pensions: [], desiredMonthlySpending: 0, essentialMonthlySpending: 0 });
  const both = couple([], { properties: single.properties, desiredMonthlySpending: 0, essentialMonthlySpending: 0 });
  const rentSingle = simulatePlan(single).years[0]!;
  const rentBoth = simulatePlan(both).years[0]!;
  assert.equal(rentBoth.propertyIncome, rentSingle.propertyIncome, "the same rent arrives");
  assert.ok(rentBoth.tax <= rentSingle.tax, `${rentBoth.tax} vs ${rentSingle.tax}`);
  assert.equal(rentBoth.detail.tax.byOwner!.length, 2);
});

test("annual limits are checked per person, and the partner's breach is named", () => {
  const plan = couple([pot("mine", "isa", 0, "you", 1_000), pot("theirs", "isa", 0, "partner", 2_000)]);
  const texts = planChecks(plan).map((check) => check.text);
  assert.ok(texts.some((text) => text.startsWith("Sam's") && text.includes("annual limit")), texts.join(" | "));
  assert.ok(!texts.some((text) => !text.startsWith("Sam's") && text.includes("annual limit")), "the plan holder's £12,000 a year is fine");
});

test("partners and owners survive normalisation; a single plan claims any partner-owned pots", () => {
  const plan = couple([pot("mine", "isa", 10_000, "you"), pot("theirs", "sipp", 20_000, "partner")]);
  const round = normalisePlan(JSON.parse(JSON.stringify(plan)));
  assert.equal(round.partner?.name, "Sam");
  assert.deepEqual(round.pots.map((item) => item.owner), ["you", "partner"]);
  assert.equal(round.accounts.sipp!.balance, 0);
  assert.equal(round.partner!.accounts.sipp!.balance, 20_000);
  assert.equal(totalCurrentInvestments(round), 30_000);
  const single = normalisePlan({ ...JSON.parse(JSON.stringify(plan)), partner: null });
  assert.deepEqual(single.pots.map((item) => item.owner), ["you", "you"], "without a partner every pot is the plan holder's");
  assert.equal(single.accounts.sipp!.balance, 20_000);
});
