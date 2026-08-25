/**
 * A second, deliberately different implementation of each country's income tax, plus
 * published worked examples and property checks over 100,000 random incomes. If this file and
 * lib/tax.ts ever disagree, one of them is wrong — the published examples say which.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES, incomeTax, taxSchedule } from "../lib/planner.ts";

/** Marginal-rate layers in TOTAL income terms, the way tax tables are printed. */
type Layer = { from: number; to: number; rate: number };

function layeredTax(income: number, layers: Layer[]): number {
  let tax = 0;
  for (const layer of layers) tax += Math.max(0, Math.min(income, layer.to) - layer.from) * layer.rate;
  return tax;
}

/** UK rest-of-UK 2026/27: personal allowance £12,570 tapering £1 per £2 above £100,000; 20/40/45 at £50,270 and £125,140 of income. */
function ukRestOfUk(income: number): number {
  const allowance = Math.max(0, 12_570 - Math.max(0, income - 100_000) / 2);
  const shift = 12_570 - allowance; // the taper pulls every threshold down by the lost allowance
  return layeredTax(income, [
    { from: allowance, to: 50_270 - shift, rate: 0.2 },
    { from: 50_270 - shift, to: 125_140, rate: 0.4 },
    { from: 125_140, to: Number.POSITIVE_INFINITY, rate: 0.45 },
  ]);
}

/** Scotland 2026/27, written as income thresholds: 19% to £16,537, 20% to £29,526, 21% to £43,662, 42% to £75,000, 45% to £125,140, 48% above. */
function ukScotland(income: number): number {
  const allowance = Math.max(0, 12_570 - Math.max(0, income - 100_000) / 2);
  const shift = 12_570 - allowance;
  const t = (value: number) => value - shift;
  return layeredTax(income, [
    { from: allowance, to: t(16_537), rate: 0.19 },
    { from: t(16_537), to: t(29_526), rate: 0.2 },
    { from: t(29_526), to: t(43_662), rate: 0.21 },
    { from: t(43_662), to: t(75_000), rate: 0.42 },
    { from: t(75_000), to: 125_140, rate: 0.45 },
    { from: 125_140, to: Number.POSITIVE_INFINITY, rate: 0.48 },
  ]);
}

/** US federal 2026, single: standard deduction then bracket tops in taxable-income terms, expressed here as income thresholds. */
function usSingle(income: number, statePercent = 0): number {
  const d = 16_100;
  const federal = layeredTax(income, [
    { from: d, to: d + 12_400, rate: 0.1 },
    { from: d + 12_400, to: d + 50_400, rate: 0.12 },
    { from: d + 50_400, to: d + 105_700, rate: 0.22 },
    { from: d + 105_700, to: d + 201_775, rate: 0.24 },
    { from: d + 201_775, to: d + 256_225, rate: 0.32 },
    { from: d + 256_225, to: d + 640_600, rate: 0.35 },
    { from: d + 640_600, to: Number.POSITIVE_INFINITY, rate: 0.37 },
  ]);
  return federal + Math.max(0, income - d) * statePercent / 100;
}

function usMarried(income: number): number {
  const d = 32_200;
  return layeredTax(income, [
    { from: d, to: d + 24_800, rate: 0.1 },
    { from: d + 24_800, to: d + 100_800, rate: 0.12 },
    { from: d + 100_800, to: d + 211_400, rate: 0.22 },
    { from: d + 211_400, to: d + 403_550, rate: 0.24 },
    { from: d + 403_550, to: d + 512_450, rate: 0.32 },
    { from: d + 512_450, to: d + 768_700, rate: 0.35 },
    { from: d + 768_700, to: Number.POSITIVE_INFINITY, rate: 0.37 },
  ]);
}

/** Poland PIT scale: 12% on income to 120,000 zł less the 3,600 zł reduction (= 30,000 zł tax-free), 32% above. */
function polandScale(income: number): number {
  if (income <= 30_000) return 0;
  if (income <= 120_000) return income * 0.12 - 3_600;
  return 10_800 + (income - 120_000) * 0.32;
}

const uk = PROFILES.uk, us = PROFILES.us, pl = PROFILES.pl;
const near = (actual: number, expected: number, message: string, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);

test("published worked examples — UK (gov.uk/income-tax-rates)", () => {
  const ruk = taxSchedule(uk, "rest-of-uk");
  near(incomeTax(60_000, ruk), 11_432, "£60,000: 20% of 37,700 + 40% of 9,730");
  near(incomeTax(12_570, ruk), 0, "at the personal allowance");
  near(incomeTax(50_270, ruk), 7_540, "top of basic rate");
  near(incomeTax(110_000, ruk), 7_540 + (110_000 - 50_270 + 5_000) * 0.4, "£110,000: allowance tapered by £5,000 → 60% effective band");
  near(incomeTax(150_000, ruk), 7_540 + 87_440 * 0.4 + (150_000 - 125_140) * 0.45, "£150,000: no allowance, 45% above 125,140");
});

test("published worked examples — Scotland (gov.scot income tax 2026/27 — VERIFY starter/basic thresholds)", () => {
  const scot = taxSchedule(uk, "scotland");
  near(incomeTax(16_537, scot), 3_967 * 0.19, "top of starter rate");
  near(incomeTax(43_662, scot), 3_967 * 0.19 + 12_989 * 0.2 + 14_136 * 0.21, "top of intermediate rate");
  near(incomeTax(75_000, scot), 3_967 * 0.19 + 12_989 * 0.2 + 14_136 * 0.21 + 31_338 * 0.42, "top of higher rate");
});

test("published worked examples — US federal 2026 (IRS Rev. Proc. 2025-32 — VERIFY)", () => {
  const single = taxSchedule(us, "single");
  near(incomeTax(16_100, single), 0, "standard deduction");
  near(incomeTax(28_500, single), 1_240, "single: 10% on the first 12,400 of taxable income");
  near(incomeTax(100_000, single), 1_240 + 38_000 * 0.12 + (100_000 - 16_100 - 50_400) * 0.22, "single at $100,000");
  const married = taxSchedule(us, "married");
  near(incomeTax(57_000, married), 2_480, "married: 10% on the first 24,800 of taxable income");
});

test("published worked examples — Poland PIT (podatki.gov.pl skala podatkowa)", () => {
  const scale = taxSchedule(pl, "standard");
  near(incomeTax(30_000, scale), 0, "kwota wolna");
  near(incomeTax(60_000, scale), 60_000 * 0.12 - 3_600, "12% less 3,600 zł reduction");
  near(incomeTax(120_000, scale), 10_800, "top of the first band");
  near(incomeTax(200_000, scale), 10_800 + 80_000 * 0.32, "32% above 120,000");
});

test("the engine agrees with the independent implementation on 100,000 random incomes per schedule", () => {
  let seed = 12_345;
  const random = () => { seed = (seed * 1_664_525 + 1_013_904_223) >>> 0; return seed / 4_294_967_296; };
  const cases: { label: string; engine: (income: number) => number; reference: (income: number) => number }[] = [
    { label: "UK rest-of-UK", engine: (income) => incomeTax(income, taxSchedule(uk, "rest-of-uk")), reference: ukRestOfUk },
    { label: "UK Scotland", engine: (income) => incomeTax(income, taxSchedule(uk, "scotland")), reference: ukScotland },
    { label: "US single", engine: (income) => incomeTax(income, taxSchedule(us, "single")), reference: (income) => usSingle(income) },
    { label: "US single + 5% state", engine: (income) => incomeTax(income, taxSchedule(us, "single"), 5), reference: (income) => usSingle(income, 5) },
    { label: "US married", engine: (income) => incomeTax(income, taxSchedule(us, "married")), reference: usMarried },
    { label: "Poland", engine: (income) => incomeTax(income, taxSchedule(pl, "standard")), reference: polandScale },
  ];
  for (const { label, engine, reference } of cases) {
    for (let index = 0; index < 100_000; index += 1) {
      const income = random() < 0.2 ? random() * 20_000 : random() * 1_000_000;
      near(engine(income), reference(income), `${label} at ${income.toFixed(2)}`, 0.005);
    }
  }
});

test("tax is monotonic, never exceeds income, and the marginal rate never exceeds the top rate plus the UK taper", () => {
  for (const [profileId, variant, topMarginal] of [["uk", "rest-of-uk", 0.6], ["uk", "scotland", 0.675], ["us", "single", 0.37], ["us", "married", 0.37], ["pl", "standard", 0.32]] as const) {
    const schedule = taxSchedule(PROFILES[profileId], variant);
    let previous = 0;
    for (let income = 0; income <= 400_000; income += 50) {
      const tax = incomeTax(income, schedule);
      assert.ok(tax >= previous - 1e-9, `${profileId}/${variant}: tax fell at ${income}`);
      assert.ok(tax <= income + 1e-9, `${profileId}/${variant}: tax above income at ${income}`);
      assert.ok(tax - previous <= 50 * topMarginal + 1e-6, `${profileId}/${variant}: marginal rate ${(tax - previous) / 50} at ${income}`);
      previous = tax;
    }
  }
});
