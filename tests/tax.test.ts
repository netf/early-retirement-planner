import assert from "node:assert/strict";
import test from "node:test";
import { PROFILES, incomeTax, moneyFormat, taxSchedule } from "../lib/planner.ts";

test("UK: allowance, basic, higher and additional rates with the £100k taper", () => {
  const ruk = taxSchedule(PROFILES.uk, "rest-of-uk");
  assert.equal(incomeTax(12_570, ruk), 0);
  assert.equal(incomeTax(20_000, ruk), (20_000 - 12_570) * 0.2);
  assert.ok(Math.abs(incomeTax(130_000, ruk) - (37_700 * 0.2 + 87_440 * 0.4 + 4_860 * 0.45)) < 0.01);
});

test("UK Scotland: the advanced band runs to £125,140 of taxable income, so a £125,140 earner pays no top rate", () => {
  const scotland = taxSchedule(PROFILES.uk, "scotland");
  const belowTop = 3_967 * 0.19 + 12_989 * 0.2 + 14_136 * 0.21 + 31_338 * 0.42 + 62_710 * 0.45;
  assert.ok(Math.abs(incomeTax(125_140, scotland) - belowTop) < 0.01);
  assert.ok(Math.abs(incomeTax(130_000, scotland) - (belowTop + 4_860 * 0.48)) < 0.01);
});

test("US: single filer standard deduction and 2026 brackets, plus a flat state surcharge", () => {
  const single = taxSchedule(PROFILES.us, "single");
  assert.equal(incomeTax(16_100, single), 0);
  assert.ok(Math.abs(incomeTax(66_100, single) - (12_400 * 0.1 + 37_600 * 0.12)) < 0.01);
  assert.ok(Math.abs(incomeTax(66_100, single, 5) - (12_400 * 0.1 + 37_600 * 0.12 + 50_000 * 0.05)) < 0.01);
});

test("Poland: 30,000 zł tax-free, 12% to 120,000 zł, 32% above", () => {
  const pl = taxSchedule(PROFILES.pl, "standard");
  assert.equal(incomeTax(30_000, pl), 0);
  assert.ok(Math.abs(incomeTax(120_000, pl) - 90_000 * 0.12) < 0.01);
  assert.ok(Math.abs(incomeTax(150_000, pl) - (90_000 * 0.12 + 30_000 * 0.32)) < 0.01);
});

test("money formatting is deterministic and follows the profile's currency", () => {
  const gbp = moneyFormat("en-GB", "GBP");
  assert.equal(gbp.compact(200_000), "£200k");
  assert.equal(gbp.compact(1_234_567), "£1.2m");
  assert.equal(gbp.compact(950), "£950");
  const usd = moneyFormat("en-US", "USD");
  assert.equal(usd.compact(12_500), "$12.5k");
  const pln = moneyFormat("pl-PL", "PLN");
  assert.equal(pln.compact(1_500_000), "1.5m zł");
});

test("every profile documents its thresholds with a source and a status", () => {
  for (const profile of Object.values(PROFILES)) {
    assert.ok(profile.sources.length >= 6, `${profile.id} has ${profile.sources.length} sources`);
    for (const item of profile.sources) {
      assert.ok(item.url.startsWith("https://"), `${profile.id}: ${item.item} has no URL`);
      assert.ok(["confirmed", "verify", "example"].includes(item.status));
      // Nothing ships from memory: every fact is checked against its source, or is labelled as an illustrative example.
      assert.notEqual(item.status, "verify", `${profile.id}: "${item.item}" has not been checked against its source`);
    }
  }
});
