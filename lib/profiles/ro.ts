import type { Jurisdiction } from "./types.ts";

export const RO: Jurisdiction = {
  id: "ro",
  label: "Romania",
  shortLabel: "RO",
  currency: "RON",
  locale: "ro-RO",
  taxYear: "2026",
  taxVariants: [
    {
      id: "standard",
      label: "Impozit pe venit",
      schedule: {
        // Pensions (state, Pilon II and Pilon III alike) are untouched up to 3,000 lei a month; the excess pays
        // 10% CASS and then 10% income tax on what is left — together exactly 19% of the excess.
        allowance: 36_000,
        bands: [{ upTo: Number.POSITIVE_INFINITY, rate: 0.19 }],
      },
    },
  ],
  accounts: [
    { id: "pilon3", name: "Pilon III (pensie facultativă)", tag: "deductible in · taxed above 3,000 lei/mo · from 60", growthTax: { kind: "none" }, withdrawal: { kind: "income" }, accessAge: 60, contributionHint: "Deductible up to €400/year (~2,000 lei); employer can add the same", defaults: { balance: 60_000, monthlyContribution: 400 } },
    { id: "pilon2", name: "Pilon II (pensie obligatorie)", tag: "funded from payroll · taxed above 3,000 lei/mo · from 65", growthTax: { kind: "none" }, withdrawal: { kind: "income" }, accessAge: 65, contributionHint: "Fed by 4.75% of gross salary while you work", defaults: { balance: 90_000, monthlyContribution: 300 } },
    { id: "brokerage", name: "Cont de brokeraj", tag: "gains ~1–3% via intermediaries · accessible", growthTax: { kind: "share-of-return", rate: 0.03 }, withdrawal: { kind: "free" }, accessAge: null, defaults: { balance: 600_000, monthlyContribution: 3_000 } },
    { id: "cash", name: "Numerar / depozite", tag: "interest taxed 10% · accessible", growthTax: { kind: "share-of-return", rate: 0.1 }, withdrawal: { kind: "free" }, accessAge: null, isCash: true, defaults: { balance: 50_000, monthlyContribution: 0 } },
  ],
  withdrawalOrder: ["cash", "brokerage", "pilon3", "pilon2"],
  savingTargets: { bridge: "brokerage", longTerm: "pilon3" },
  guaranteedIncome: [
    { id: "statePension", label: "Pensie de stat", taxableShare: 1, isState: true, defaults: { annual: 36_000, fromAge: 65 } },
  ],
  // Long-term rent: 10% on gross less the 20% flat deduction = 8% of gross; the stepped CASS on rental income
  // is approximated by the higher rate above the ~120,000 lei band where it bites hardest.
  property: { rentalTax: { kind: "flat-on-gross", threshold: 121_500, lowRate: 0.08, highRate: 0.16 }, gainTax: { kind: "rate" }, defaultGainRatePercent: 3 },
  thresholdFreezeYears: 5,
  mortality: { e65Male: 14.8, e65Female: 18.2, source: 'Eurostat / INS life tables 2023 (period)' },
  notes: [
    "The pension exemption (3,000 lei a month) is a fixed amount with no indexation rule; the planner assumes it stays frozen for five more years and then keeps pace with inflation.",
    "Pensions — state, Pilon II and Pilon III — are untouched up to 3,000 lei a month (Law 244/2024); the excess pays 10% CASS and then 10% income tax, modelled together as 19% of the excess. Pilon III's exemption of own contributions at withdrawal is not modelled separately.",
    "Brokerage gains via Romanian or EU intermediaries are withheld at 1% (held over a year), 3% (180–365 days) or 6% (under 180 days); dividends pay 16% from 2026. The model charges 3% of each year's positive return as a blended simplification.",
    "Interest on deposits is taxed at 10%. The stepped CASS on investment and rental income (10% of 6/12/24 minimum wages by band) is only approximated, through the higher rental rate above ~120,000 lei of rent.",
    "Long-term rent is taxed at 10% of gross after a 20% flat deduction — 8% of gross rent. Property sales are taxed at 1% (held over 3 years) or 3% of the sale price, not the gain: enter a gains-tax rate that approximates this for your property.",
  ],
  sources: [
    { item: "Income tax on pensions", value: "Tax-free to 3,000 lei/month; 10% CASS + 10% income tax on the excess (Law 244/2024)", source: "ANAF / Casa Națională de Pensii Publice", url: "https://www.cnpp.ro/", status: "confirmed", note: "In force since October 2024; verified for 2026." },
    { item: "Dividend tax 2026", value: "16% (up from 10%) from 1 January 2026", source: "EY — Romanian tax changes (Law 141/2025)", url: "https://www.ey.com/en_gl/technical/tax-alerts/romanian-tax-changes-introduced-by-new-fiscal-and-budgetary-measures", status: "confirmed" },
    { item: "Capital gains via intermediaries", value: "1% held >365 days; 3% 180–365 days; 6% <180 days; 16% outside intermediaries", source: "Codul Fiscal art. 97; EY alert", url: "https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2026.htm", status: "confirmed", note: "Modelled as a blended 3% of each year's positive return." },
    { item: "Interest on deposits", value: "10%", source: "Codul Fiscal art. 97", url: "https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2026.htm", status: "confirmed" },
    { item: "Pilon III", value: "Access from 60 (90 contributions); deductible up to €400/year each for employee and employer", source: "Legea 204/2006; APAPR", url: "https://apapr.ro/pilonul-3-facultativ/", status: "confirmed" },
    { item: "Pilon II", value: "Mandatory private pillar, 4.75% of gross salary; payout rules per Law 2/2026", source: "Legea 411/2004; ASF", url: "https://asfromania.ro/", status: "confirmed", note: "Payout modelled as ordinary drawdown rather than the 8-year programmed schedule." },
    { item: "Rental income", value: "10% on gross less a 20% flat deduction (8% of gross) for long-term lets", source: "Codul Fiscal art. 84 (2026)", url: "https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2026.htm", status: "confirmed", note: "Stepped CASS on rental income approximated by the higher band above ~120,000 lei." },
    { item: "Property sale tax", value: "1% of the sale price held >3 years; 3% within 3 years", source: "Codul Fiscal art. 111", url: "https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2026.htm", status: "confirmed", note: "The model taxes the gain, not the price — set the rate to approximate your case." },
    { item: "CASS bands on investment/rental income", value: "10% of 6 / 12 / 24 minimum wages (24,300 / 48,600 / 97,200 lei at the 4,050 lei minimum wage)", source: "Codul Fiscal art. 170", url: "https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2026.htm", status: "confirmed", note: "Approximated, not modelled band by band." },
    { item: "State pension (example default)", value: "36,000 lei a year (3,000 lei/month)", source: "CNPP — indicatori statistici", url: "https://www.cnpp.ro/indicatori-statistici/", status: "example", note: "Close to the average pension after the 2024 recalculation; use your own CNPP estimate. Standard retirement age 65 (women transitioning to 65 by 2035)." },
  ],
  defaults: {
    currentAge: 40,
    retirementAge: 50,
    planToAge: 95,
    desiredMonthlySpending: 10_000,
    essentialMonthlySpending: 7_000,
    spendingPhases: [
      { label: "Pensionare activă", startAge: 50, endAge: 69, monthlyAmount: 10_000 },
      { label: "Ani mai liniștiți", startAge: 70, endAge: 84, monthlyAmount: 10_000 },
      { label: "Bătrânețe și îngrijire", startAge: 85, endAge: 95, monthlyAmount: 10_000 },
    ],
    property: { value: 500_000, purchaseCostBasis: 350_000, mortgage: 150_000, mortgageRatePercent: 6.5, monthlyMortgagePayment: 1_800, monthlyRent: 2_500, monthlyNetIncome: 500 },
  },
};
