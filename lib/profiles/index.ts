import { PL } from "./pl.ts";
import { RO } from "./ro.ts";
import type { AccountRule, GuaranteedIncomeRule, Jurisdiction, ProfileId, TaxSchedule } from "./types.ts";
import { UK } from "./uk.ts";
import { US } from "./us.ts";

export const PROFILES: Record<ProfileId, Jurisdiction> = { uk: UK, us: US, pl: PL, ro: RO };
export const PROFILE_IDS: ProfileId[] = ["uk", "us", "pl", "ro"];

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === "string" && value in PROFILES;
}

export function accountRule(profile: Jurisdiction, id: string): AccountRule {
  const rule = profile.accounts.find((item) => item.id === id);
  if (!rule) throw new Error(`Unknown account "${id}" for profile ${profile.id}`);
  return rule;
}

export function incomeRule(profile: Jurisdiction, id: string): GuaranteedIncomeRule {
  const rule = profile.guaranteedIncome.find((item) => item.id === id);
  if (!rule) throw new Error(`Unknown income "${id}" for profile ${profile.id}`);
  return rule;
}

export function taxSchedule(profile: Jurisdiction, variantId: string): TaxSchedule {
  return (profile.taxVariants.find((item) => item.id === variantId) ?? profile.taxVariants[0]!).schedule;
}

export function stateIncomeRule(profile: Jurisdiction): GuaranteedIncomeRule {
  return profile.guaranteedIncome.find((item) => item.isState) ?? profile.guaranteedIncome[0]!;
}

export type { AccountRule, GuaranteedIncomeRule, Jurisdiction, ProfileId, SourceNote, TaxSchedule } from "./types.ts";
