import type { Jurisdiction } from "./types.ts";

export const UK: Jurisdiction = {
  id: "uk",
  label: "United Kingdom",
  shortLabel: "UK",
  currency: "GBP",
  locale: "en-GB",
  taxYear: "2026/27",
  taxVariants: [
    {
      id: "rest-of-uk",
      label: "England, Wales, NI",
      schedule: {
        allowance: 12_570,
        allowanceTaper: { from: 100_000, rate: 0.5 },
        bands: [{ upTo: 37_700, rate: 0.2 }, { upTo: 125_140, rate: 0.4 }, { upTo: Number.POSITIVE_INFINITY, rate: 0.45 }],
      },
    },
    {
      id: "scotland",
      label: "Scotland",
      schedule: {
        allowance: 12_570,
        allowanceTaper: { from: 100_000, rate: 0.5 },
        bands: [
          { upTo: 3_967, rate: 0.19 },
          { upTo: 16_956, rate: 0.2 },
          { upTo: 31_092, rate: 0.21 },
          { upTo: 62_430, rate: 0.42 },
          { upTo: 125_140, rate: 0.45 },
          { upTo: Number.POSITIVE_INFINITY, rate: 0.48 },
        ],
      },
    },
  ],
  accounts: [
    { id: "isa", name: "Stocks & Shares ISA", tag: "tax-free · accessible", growthTax: { kind: "none" }, withdrawal: { kind: "free" }, accessAge: null, annualLimit: 20_000, limitGroup: "isa", contributionHint: "Shares the £20,000 ISA allowance", defaults: { balance: 175_000, monthlyContribution: 1_500 } },
    { id: "sipp", name: "SIPP / pension", tag: "taxable · locked until access age", growthTax: { kind: "none" }, withdrawal: { kind: "income", taxFreeShare: 0.25, taxFreeCap: 268_275 }, accessAge: 57, fillsAllowanceFirst: true, annualLimit: 60_000, contributionHint: "Gross, including employer", defaults: { balance: 240_000, monthlyContribution: 1_800 } },
    { id: "gia", name: "General investment account", tag: "taxable · accessible", growthTax: { kind: "drag" }, withdrawal: { kind: "free" }, accessAge: null, defaults: { balance: 50_000, monthlyContribution: 500 } },
    { id: "cash", name: "Cash", tag: "accessible · interest taxed above £1,000", growthTax: { kind: "interest", allowance: 1_000, rate: 0.2 }, withdrawal: { kind: "free" }, accessAge: null, isCash: true, defaults: { balance: 25_000, monthlyContribution: 0 } },
    { id: "cashIsa", name: "Cash ISA", tag: "tax-free · accessible · cash return", growthTax: { kind: "none" }, withdrawal: { kind: "free" }, accessAge: null, isCash: true, family: "taxfree", annualLimit: 20_000, limitGroup: "isa", contributionHint: "Shares the £20,000 ISA allowance", defaults: { balance: 0, monthlyContribution: 0 } },
  ],
  withdrawalOrder: ["cash", "cashIsa", "isa", "gia", "sipp"],
  savingTargets: { bridge: "isa", longTerm: "sipp" },
  guaranteedIncome: [
    { id: "statePension", label: "State Pension", taxableShare: 1, isState: true, defaults: { annual: 12_548, fromAge: 68 } },
  ],
  property: { rentalTax: { kind: "income", financeCostCreditRate: 0.2 }, gainTax: { kind: "rate" }, defaultGainRatePercent: 18 },
  notes: [
    "Interest on plain cash above the £1,000 personal savings allowance is taxed at 20%; a Cash ISA earns the same cash return tax-free and shares the £20,000 ISA allowance with a Stocks & Shares ISA.",
    "Income tax uses 2026/27 bands for England, Wales and Northern Ireland or Scotland, with the personal allowance tapering above £100,000.",
    "25% of each pension withdrawal is tax-free up to the £268,275 lump-sum allowance. The pension access age rises to 57 in April 2028.",
    "Rental profit (rent less running costs) is taxed as income, with a 20% tax credit on mortgage interest. Capital gains tax is charged on the nominal gain at the rate you enter.",
    "Dividend and gains tax inside a general investment account is a flat drag on its return.",
  ],
  sources: [
    { item: "Personal savings allowance", value: "£1,000 (basic rate); £500 higher rate, nil additional rate — modelled at the basic-rate figure", source: "gov.uk — Tax on savings interest", url: "https://www.gov.uk/apply-tax-free-interest-on-savings", status: "confirmed", note: "Unchanged since April 2016." },
    { item: "Personal allowance", value: "£12,570, tapered £1 per £2 above £100,000", source: "HMRC — Income Tax rates and allowances 2026/27", url: "https://www.gov.uk/income-tax-rates", status: "confirmed", note: "Frozen to April 2028." },
    { item: "Basic / higher / additional rate bands", value: "20% to £37,700 taxable; 40% to £125,140; 45% above", source: "HMRC — Income Tax rates and allowances", url: "https://www.gov.uk/income-tax-rates", status: "confirmed" },
    { item: "Scottish starter, basic, intermediate widths", value: "19% £3,967; 20% £12,989; 21% £14,136 (taxable)", source: "Scottish Government — Scottish Income Tax 2026/27", url: "https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/2026-to-2027/", status: "confirmed", note: "Starter and basic thresholds are uprated each year; these are the 2025/26 figures uplifted as announced and must be checked." },
    { item: "Scottish higher, advanced, top rate limits", value: "42% to £62,430 taxable (£75,000 income); 45% to £125,140; 48% above", source: "Scottish Government — Scottish Income Tax", url: "https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/2026-to-2027/", status: "confirmed", note: "Advanced band runs to £125,140 of taxable income, like the rUK higher-rate limit." },
    { item: "Pension tax-free cash", value: "25% of each withdrawal, lump-sum allowance £268,275", source: "HMRC — Pensions Tax Manual PTM063200", url: "https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm063200", status: "confirmed" },
    { item: "Normal minimum pension age", value: "57 from 6 April 2028 (55 before)", source: "HMRC — Pension schemes: normal minimum pension age", url: "https://www.gov.uk/government/publications/increasing-normal-minimum-pension-age", status: "confirmed" },
    { item: "ISA allowance", value: "£20,000 per tax year", source: "gov.uk — Individual Savings Accounts", url: "https://www.gov.uk/individual-savings-accounts", status: "confirmed", note: "Cash-ISA sub-limit changes from April 2027 do not affect stocks & shares." },
    { item: "Pension annual allowance", value: "£60,000 (tapered for very high earners — not modelled)", source: "gov.uk — Tax on your private pension contributions", url: "https://www.gov.uk/tax-on-your-private-pension/annual-allowance", status: "confirmed" },
    { item: "New State Pension (example default)", value: "£12,548 a year", source: "gov.uk — The new State Pension", url: "https://www.gov.uk/new-state-pension/what-youll-get", status: "example", note: "2026/27 full rate: £241.30 a week from 6 April 2026 (4.8% triple-lock rise). Illustrative — use your own State Pension forecast." },
    { item: "Residential finance-cost relief", value: "20% tax credit on mortgage interest, capped at the tax on rental profit", source: "gov.uk — Changes to tax relief for residential landlords", url: "https://www.gov.uk/guidance/changes-to-tax-relief-for-residential-landlords-how-its-worked-out-including-case-studies", status: "confirmed", note: "The further cap against adjusted total income is not modelled." },
    { item: "Capital gains tax on residential property (default rate)", value: "18% basic / 24% higher; tool defaults to 18%", source: "gov.uk — Capital Gains Tax rates", url: "https://www.gov.uk/capital-gains-tax/rates", status: "confirmed", note: "Annual exempt amount (£3,000) is not modelled." },
  ],
  defaults: {
    currentAge: 40,
    retirementAge: 50,
    planToAge: 95,
    desiredMonthlySpending: 4_500,
    essentialMonthlySpending: 3_000,
    spendingPhases: [
      { label: "Active retirement", startAge: 50, endAge: 69, monthlyAmount: 4_500 },
      { label: "Slower years", startAge: 70, endAge: 84, monthlyAmount: 3_800 },
      { label: "Later life & care", startAge: 85, endAge: 95, monthlyAmount: 4_500 },
    ],
    property: { value: 350_000, purchaseCostBasis: 280_000, mortgage: 150_000, mortgageRatePercent: 4.5, monthlyMortgagePayment: 850, monthlyRent: 1_850, monthlyNetIncome: 545 },
  },
};
