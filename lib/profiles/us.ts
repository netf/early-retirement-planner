import type { Jurisdiction } from "./types.ts";

export const US: Jurisdiction = {
  id: "us",
  label: "United States",
  shortLabel: "US",
  currency: "USD",
  locale: "en-US",
  taxYear: "2026",
  taxVariants: [
    {
      id: "single",
      label: "Single",
      schedule: {
        allowance: 16_100,
        bands: [
          { upTo: 12_400, rate: 0.1 },
          { upTo: 50_400, rate: 0.12 },
          { upTo: 105_700, rate: 0.22 },
          { upTo: 201_775, rate: 0.24 },
          { upTo: 256_225, rate: 0.32 },
          { upTo: 640_600, rate: 0.35 },
          { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
        ],
      },
    },
    {
      id: "married",
      label: "Married filing jointly",
      schedule: {
        allowance: 32_200,
        bands: [
          { upTo: 24_800, rate: 0.1 },
          { upTo: 100_800, rate: 0.12 },
          { upTo: 211_400, rate: 0.22 },
          { upTo: 403_550, rate: 0.24 },
          { upTo: 512_450, rate: 0.32 },
          { upTo: 768_700, rate: 0.35 },
          { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
        ],
      },
    },
  ],
  surchargeInput: { label: "State income tax", hint: "Your state's effective rate on taxable income; 0 where there is none" },
  accounts: [
    { id: "traditional", name: "401(k) / Traditional IRA", tag: "pre-tax · taxed on withdrawal · from 59½", growthTax: { kind: "none" }, withdrawal: { kind: "income" }, accessAge: 60, fillsAllowanceFirst: true, annualLimit: 24_500, contributionHint: "Including employer match", defaults: { balance: 450_000, monthlyContribution: 1_800 } },
    { id: "roth", name: "Roth IRA / Roth 401(k)", tag: "tax-free · from 59½", growthTax: { kind: "none" }, withdrawal: { kind: "free" }, accessAge: 60, annualLimit: 7_500, defaults: { balance: 120_000, monthlyContribution: 600 } },
    { id: "brokerage", name: "Brokerage account", tag: "taxable · accessible", growthTax: { kind: "drag" }, withdrawal: { kind: "free" }, accessAge: null, defaults: { balance: 250_000, monthlyContribution: 1_200 } },
    { id: "cash", name: "Cash", tag: "accessible", growthTax: { kind: "none" }, withdrawal: { kind: "free" }, accessAge: null, isCash: true, defaults: { balance: 40_000, monthlyContribution: 0 } },
  ],
  withdrawalOrder: ["cash", "brokerage", "roth", "traditional"],
  savingTargets: { bridge: "brokerage", longTerm: "traditional" },
  guaranteedIncome: [
    { id: "socialSecurity", label: "Social Security", taxableShare: 0.85, isState: true, defaults: { annual: 28_000, fromAge: 67 } },
  ],
  property: { rentalTax: { kind: "income" }, gainTax: { kind: "rate" }, defaultGainRatePercent: 15 },
  notes: [
    "Federal income tax uses 2026 brackets and the standard deduction for your filing status; state tax is the flat rate you enter. Verify the brackets against the IRS tables for your year.",
    "Retirement accounts are treated as inaccessible before 59½ (modelled as 60), so the 10% early-withdrawal penalty never applies. Required minimum distributions are not modelled.",
    "85% of Social Security is counted as taxable income. Rental profit is taxed as ordinary income; capital gains on a sale use the long-term rate you enter.",
    "Dividend and gains tax in a brokerage account is a flat drag on its return.",
  ],
  sources: [
    { item: "Standard deduction 2026", value: "$16,100 single / $32,200 married filing jointly", source: "IRS Rev. Proc. 2025-32 (2026 inflation adjustments)", url: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill", status: "confirmed" },
    { item: "Federal brackets 2026 (single)", value: "10% to $12,400; 12% to $50,400; 22% to $105,700; 24% to $201,775; 32% to $256,225; 35% to $640,600; 37% above (taxable)", source: "IRS Rev. Proc. 2025-32", url: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill", status: "confirmed" },
    { item: "Federal brackets 2026 (married filing jointly)", value: "10% to $24,800; 12% to $100,800; 22% to $211,400; 24% to $403,550; 32% to $512,450; 35% to $768,700; 37% above", source: "IRS Rev. Proc. 2025-32", url: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill", status: "confirmed" },
    { item: "401(k) and IRA contribution limits 2026", value: "$24,500 elective deferral; $7,500 IRA ($8,600 age 50+)", source: "IRS — 401(k) and IRA contribution limits (Notice 2025-67)", url: "https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits", status: "confirmed" },
    { item: "Early-withdrawal age", value: "59½, modelled as 60; 10% penalty before that is not modelled", source: "IRS — Retirement topics: exceptions to tax on early distributions", url: "https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-exceptions-to-tax-on-early-distributions", status: "confirmed" },
    { item: "Social Security taxation", value: "85% of benefits treated as taxable (simplified; the real share depends on combined income)", source: "IRS Publication 915", url: "https://www.irs.gov/publications/p915", status: "confirmed", note: "Up to 85% is taxable above $34,000 single / $44,000 joint combined income; lower incomes pay less." },
    { item: "Long-term capital gains (property default)", value: "15% default; 0/15/20% by income", source: "IRS Topic 409", url: "https://www.irs.gov/taxtopics/tc409", status: "confirmed", note: "Depreciation recapture and NIIT are not modelled." },
    { item: "Required minimum distributions", value: "Not modelled (age 73, rising to 75 in 2033)", source: "IRS — Retirement plan and IRA required minimum distributions FAQs", url: "https://www.irs.gov/retirement-plans/retirement-plan-and-ira-required-minimum-distributions-faqs", status: "confirmed" },
  ],
  defaults: {
    currentAge: 40,
    retirementAge: 50,
    planToAge: 95,
    desiredMonthlySpending: 5_500,
    essentialMonthlySpending: 4_000,
    spendingPhases: [
      { label: "Active retirement", startAge: 50, endAge: 69, monthlyAmount: 5_500 },
      { label: "Slower years", startAge: 70, endAge: 84, monthlyAmount: 5_000 },
      { label: "Later life & care", startAge: 85, endAge: 95, monthlyAmount: 6_500 },
    ],
    property: { value: 450_000, purchaseCostBasis: 380_000, mortgage: 250_000, mortgageRatePercent: 6.5, monthlyMortgagePayment: 1_900, monthlyRent: 2_800, monthlyNetIncome: 350 },
  },
};
