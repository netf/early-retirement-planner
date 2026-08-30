import type { Jurisdiction } from "./types.ts";

export const PL: Jurisdiction = {
  id: "pl",
  label: "Poland",
  shortLabel: "PL",
  currency: "PLN",
  locale: "pl-PL",
  taxYear: "2026",
  taxVariants: [
    {
      id: "standard",
      label: "Skala podatkowa",
      schedule: {
        allowance: 30_000,
        bands: [{ upTo: 90_000, rate: 0.12 }, { upTo: Number.POSITIVE_INFINITY, rate: 0.32 }],
      },
    },
  ],
  accounts: [
    { id: "ike", name: "IKE", tag: "tax-free after 60", growthTax: { kind: "none" }, withdrawal: { kind: "free" }, accessAge: 60, annualLimit: 28_260, contributionHint: "Limit 28,260 zł/year", defaults: { balance: 150_000, monthlyContribution: 1_500 } },
    { id: "ikze", name: "IKZE", tag: "deductible · 10% flat on withdrawal after 65", growthTax: { kind: "none" }, withdrawal: { kind: "flat", rate: 0.1 }, accessAge: 65, annualLimit: 11_304, contributionHint: "Limit 11,304 zł/year (16,956 zł self-employed)", defaults: { balance: 80_000, monthlyContribution: 800 } },
    { id: "ppk", name: "PPK", tag: "employee + employer · from 60", growthTax: { kind: "none" }, withdrawal: { kind: "free" }, accessAge: 60, contributionHint: "Your and your employer's contributions together", defaults: { balance: 60_000, monthlyContribution: 600 } },
    { id: "brokerage", name: "Rachunek maklerski", tag: "19% Belka tax · accessible", growthTax: { kind: "share-of-return", rate: 0.19 }, withdrawal: { kind: "free" }, accessAge: null, defaults: { balance: 700_000, monthlyContribution: 3_500 } },
    { id: "cash", name: "Gotówka / lokaty", tag: "accessible", growthTax: { kind: "share-of-return", rate: 0.19 }, withdrawal: { kind: "free" }, accessAge: null, isCash: true, defaults: { balance: 60_000, monthlyContribution: 0 } },
  ],
  withdrawalOrder: ["cash", "brokerage", "ike", "ppk", "ikze"],
  savingTargets: { bridge: "brokerage", longTerm: "ike" },
  guaranteedIncome: [
    { id: "zus", label: "Emerytura ZUS", taxableShare: 1, isState: true, defaults: { annual: 36_000, fromAge: 65 } },
  ],
  property: { rentalTax: { kind: "flat-on-gross", threshold: 100_000, lowRate: 0.085, highRate: 0.125 }, gainTax: { kind: "rate-within-years", years: 5 }, defaultGainRatePercent: 19 },
  thresholdFreezeYears: 5,
  mortality: { e65Male: 15.4, e65Female: 19.7, source: 'Eurostat / GUS life tables 2023 (period)' },
  notes: [
    "Kwota wolna (30 000 zł) and the 120 000 zł threshold are fixed amounts with no indexation rule; the planner assumes they stay frozen for five more years and then keep pace with inflation.",
    "PIT uses the 12% / 32% scale with the 30,000 zł tax-free amount and the 120,000 zł threshold. Verify against the current year's rules.",
    "IKE and PPK withdrawals after 60 are tax-free; IKZE withdrawals after 65 pay a flat 10%. The tax deduction on IKZE contributions while working is not modelled.",
    "Gains in a brokerage account and interest on cash are taxed at 19% (podatek Belki) each year as a share of the return.",
    "Private rental income is taxed on the ryczałt: 8.5% of gross rent, 12.5% above 100,000 zł. A property sold within five years of purchase pays 19% on the nominal gain; later sales are tax-free.",
  ],
  sources: [
    { item: "PIT scale", value: "12% to 120,000 zł less 3,600 zł (30,000 zł tax-free); 32% above", source: "podatki.gov.pl — Skala podatkowa", url: "https://www.podatki.gov.pl/pit/abc-pit/skala-podatkowa/", status: "confirmed", note: "The 4% solidarity levy above 1,000,000 zł is not modelled." },
    { item: "IKE limit 2026", value: "28,260 zł", source: "Obwieszczenie MRPiPS w sprawie limitu wpłat na IKE", url: "https://www.gov.pl/web/rodzina/ike", status: "confirmed", note: "Three times the forecast average monthly wage; obwieszczenie of November 2025 (26,019 zł in 2025)." },
    { item: "IKZE limit 2026", value: "11,304 zł (16,956 zł self-employed)", source: "Obwieszczenie MRPiPS w sprawie limitu wpłat na IKZE", url: "https://www.gov.pl/web/rodzina/ikze", status: "confirmed" },
    { item: "IKZE withdrawal", value: "10% flat after 65 with 5 years of contributions", source: "Ustawa o IKE oraz IKZE, art. 34a", url: "https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20040991205", status: "confirmed" },
    { item: "IKE and PPK withdrawal", value: "Tax-free after 60 (PPK: 25% lump sum then 120 instalments to stay tax-free — simplified)", source: "Ustawa o IKE oraz IKZE; Ustawa o PPK", url: "https://www.mojeppk.pl/", status: "confirmed" },
    { item: "Belka tax", value: "19% on capital gains and interest", source: "Ustawa o PIT art. 30a/30b", url: "https://www.podatki.gov.pl/pit/", status: "confirmed" },
    { item: "Private rental (ryczałt)", value: "8.5% of gross rent, 12.5% above 100,000 zł", source: "Ustawa o zryczałtowanym podatku dochodowym art. 12", url: "https://www.podatki.gov.pl/pit/ryczalt-od-przychodow-ewidencjonowanych/", status: "confirmed" },
    { item: "Property sale", value: "19% on the gain if sold within 5 years of the end of the purchase year; exempt after", source: "Ustawa o PIT art. 10 ust. 1 pkt 8, art. 30e", url: "https://www.podatki.gov.pl/pit/", status: "confirmed", note: "The own-housing-purpose exemption is not modelled." },
    { item: "ZUS pension (example default)", value: "36,000 zł a year", source: "ZUS — kalkulator emerytalny", url: "https://www.zus.pl/swiadczenia/emerytury", status: "example", note: "Illustrative only; use your own ZUS forecast (PUE)." },
  ],
  defaults: {
    currentAge: 40,
    retirementAge: 50,
    planToAge: 95,
    desiredMonthlySpending: 10_000,
    essentialMonthlySpending: 7_000,
    spendingPhases: [
      { label: "Aktywna emerytura", startAge: 50, endAge: 69, monthlyAmount: 10_000 },
      { label: "Spokojniejsze lata", startAge: 70, endAge: 84, monthlyAmount: 10_000 },
      { label: "Późna starość i opieka", startAge: 85, endAge: 95, monthlyAmount: 10_000 },
    ],
    property: { value: 800_000, purchaseCostBasis: 600_000, mortgage: 300_000, mortgageRatePercent: 7, monthlyMortgagePayment: 2_800, monthlyRent: 3_500, monthlyNetIncome: 300 },
  },
};
