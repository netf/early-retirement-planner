/**
 * A jurisdiction profile is pure data: everything the engine needs to know about a
 * country's tax and account rules. The simulation never mentions an ISA or a 401(k);
 * it only reads these rules.
 */

export type ProfileId = "uk" | "us" | "pl" | "ro";

export type TaxBand = { upTo: number; rate: number };

export type TaxSchedule = {
  /** Zero-rate allowance (personal allowance, standard deduction, kwota wolna). */
  allowance: number;
  /** Optional withdrawal of the allowance above an income level (UK £100k taper). */
  allowanceTaper?: { from: number; rate: number };
  /** Bands in taxable income above the allowance, ascending; the last must be Infinity. */
  bands: TaxBand[];
};

export type TaxVariant = { id: string; label: string; schedule: TaxSchedule };

export type WithdrawalRule =
  | { kind: "income"; taxFreeShare?: number; taxFreeCap?: number }
  | { kind: "flat"; rate: number }
  | { kind: "free" };

export type GrowthTaxRule =
  | { kind: "none" }
  /** An annual drag in percentage points, taken from the plan (UK GIA, US brokerage). */
  | { kind: "drag" }
  /** A share of each year's positive return taxed annually (Polish Belka tax). */
  | { kind: "share-of-return"; rate: number }
  /** Interest above a yearly allowance is taxed at a flat rate (UK personal savings allowance, basic rate). */
  | { kind: "interest"; allowance: number; rate: number };

export type AccountRule = {
  id: string;
  name: string;
  tag: string;
  growthTax: GrowthTaxRule;
  withdrawal: WithdrawalRule;
  /** Earliest age money can be taken; null means any time. */
  accessAge: number | null;
  /** Draw from this account first each year up to the zero-rate allowance. */
  fillsAllowanceFirst?: boolean;
  /** Holds cash rather than the invested portfolio. */
  isCash?: boolean;
  annualLimit?: number;
  /** Rules sharing an allowance: the limit applies to their contributions added together (ISA family). */
  limitGroup?: string;
  /** This rule keeps its own annual limit but its contributions also use up another group's allowance (LISA inside the ISA allowance). */
  countsTowardGroup?: string;
  /** Contributions stop at this age of the holder even if they are still working (LISA: 50). */
  contributeUntilAge?: number;
  /** A top-up added to every contribution while the holder is under `untilAge` (LISA: 25% to 50). */
  bonus?: { rate: number; untilAge: number };
  /** Colour family shown in the UI when the heuristic (locked / tax-free / taxable / cash) would mislead. */
  family?: "pension" | "taxfree" | "taxable" | "cash";
  contributionHint?: string;
  defaults: { balance: number; monthlyContribution: number };
};

export type GuaranteedIncomeRule = {
  id: string;
  label: string;
  /** Share of the payment counted as taxable income (US Social Security: 0.85). */
  taxableShare: number;
  /** The state-provided one; it names the final life phase. */
  isState?: boolean;
  defaults: { annual: number; fromAge: number };
};

export type PropertyRules = {
  rentalTax:
    /** Profit (rent − running costs) taxed as income; optionally a credit of `financeCostCreditRate` × mortgage interest (UK). */
    | { kind: "income"; financeCostCreditRate?: number }
    /** Flat rates on gross collected rent, tiered at a threshold (Polish ryczałt). */
    | { kind: "flat-on-gross"; threshold: number; lowRate: number; highRate: number };
  gainTax:
    | { kind: "rate" }
    /** Taxed only when sold within N years of purchase (Poland). */
    | { kind: "rate-within-years"; years: number };
  defaultGainRatePercent: number;
};

/** Where a figure in the profile comes from, and whether a person has confirmed it against the primary source. */
export type SourceNote = {
  item: string;
  value: string;
  source: string;
  url: string;
  /** "confirmed" = checked against the official document for the stated tax year; "verify" = from memory, needs checking; "example" = an illustrative default, not a fact. */
  status: "confirmed" | "verify" | "example";
  note?: string;
};

export type Jurisdiction = {
  id: ProfileId;
  label: string;
  shortLabel: string;
  currency: string;
  locale: string;
  taxYear: string;
  taxVariants: TaxVariant[];
  /** Show a flat-percentage surcharge input (US state income tax). */
  surchargeInput?: { label: string; hint: string };
  accounts: AccountRule[];
  /** Order to draw from once the allowance-filling step is done. */
  withdrawalOrder: string[];
  /** Where extra saving is recommended: accessible account for the bridge years, then a locked one. */
  savingTargets: { bridge: string; longTerm: string };
  guaranteedIncome: GuaranteedIncomeRule[];
  property: PropertyRules;
  /** Sentences shown under Method describing simplifications. */
  /** How many more years the allowance and band thresholds stay fixed in cash terms before uprating with inflation. */
  thresholdFreezeYears: number;
  /** Period life expectancy at 65 by sex, from the national statistics office — the mortality overlay is calibrated to it. */
  mortality: { e65Male: number; e65Female: number; source: string };
  notes: string[];
  /** Every threshold the profile uses, with its provenance. Rendered under Method. */
  sources: SourceNote[];
  defaults: {
    currentAge: number;
    retirementAge: number;
    planToAge: number;
    desiredMonthlySpending: number;
    essentialMonthlySpending: number;
    spendingPhases: { label: string; startAge: number; endAge: number; monthlyAmount: number }[];
    property: {
      value: number;
      purchaseCostBasis: number;
      mortgage: number;
      mortgageRatePercent: number;
      monthlyMortgagePayment: number;
      monthlyRent: number;
      monthlyNetIncome: number;
    };
  };
};
