"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { createPartner, createPot, profileOf, withPots, type GuaranteedIncomeInput, type OneOffExpense, type Owner, type Partner, type PensionIncome, type PlanInputs, type PortfolioAssumptions, type Pot, type PropertyAsset, type SpendingPhase } from "../../../lib/planner";

export type SetPlan = Dispatch<SetStateAction<PlanInputs>>;

/** Small, typed updaters over the plan so each input section stays declarative. */
export function usePlanUpdaters(setPlan: SetPlan) {
  const update = useCallback(<Key extends keyof PlanInputs>(key: Key, value: PlanInputs[Key]) => {
    setPlan((current) => ({ ...current, [key]: value }));
  }, [setPlan]);

  /** Edit one pot; the per-type accounts follow. A balance edit also dates the balances and marks the plan changed. */
  const updatePot = useCallback((id: string, patch: Partial<Pot>) => {
    setPlan((current) => {
      const now = new Date().toISOString();
      const next = withPots(current, current.pots.map((pot) => pot.id === id ? { ...pot, ...patch } : pot));
      return "balance" in patch ? { ...next, balancesAsOf: now.slice(0, 10), changedAt: now } : next;
    });
  }, [setPlan]);

  const addPot = useCallback((type: string, owner: Owner = "you") => {
    setPlan((current) => withPots(current, [...current.pots, createPot(profileOf(current), type, current.pots, current.partner ? owner : "you")]));
  }, [setPlan]);

  /** Add or remove the second person. Removing one hands their pots and pensions to the plan holder rather than deleting them. */
  const setHousehold = useCallback((withPartner: boolean) => {
    setPlan((current) => {
      if (withPartner) return current.partner ? current : { ...current, partner: createPartner(current) };
      if (!current.partner) return current;
      const pensions = current.pensions.map((pension) => ({ ...pension, owner: "you" as const }));
      return withPots({ ...current, partner: null, pensions }, current.pots.map((pot) => ({ ...pot, owner: "you" as const })));
    });
  }, [setPlan]);

  const updatePartner = useCallback((patch: Partial<Pick<Partner, "name" | "currentAge" | "retirementAge" | "taxFreeUsed">>) => {
    setPlan((current) => current.partner ? { ...current, partner: { ...current.partner, ...patch } } : current);
  }, [setPlan]);

  const updatePartnerIncome = useCallback((id: string, patch: Partial<GuaranteedIncomeInput>) => {
    setPlan((current) => current.partner ? { ...current, partner: { ...current.partner, guaranteedIncome: { ...current.partner.guaranteedIncome, [id]: { ...current.partner.guaranteedIncome[id]!, ...patch } } } } : current);
  }, [setPlan]);

  const removePot = useCallback((id: string) => {
    setPlan((current) => withPots(current, current.pots.filter((pot) => pot.id !== id)));
  }, [setPlan]);

  /** Type-level setting, per person: when a locked type opens for them. */
  const updateAccessAge = useCallback((type: string, accessAge: number, owner: Owner = "you") => {
    setPlan((current) => owner === "partner" && current.partner
      ? { ...current, partner: { ...current.partner, accounts: { ...current.partner.accounts, [type]: { ...current.partner.accounts[type]!, accessAge } } } }
      : { ...current, accounts: { ...current.accounts, [type]: { ...current.accounts[type]!, accessAge } } });
  }, [setPlan]);

  const updateIncome = useCallback((id: string, patch: Partial<GuaranteedIncomeInput>) => {
    setPlan((current) => ({ ...current, guaranteedIncome: { ...current.guaranteedIncome, [id]: { ...current.guaranteedIncome[id]!, ...patch } } }));
  }, [setPlan]);

  const updatePortfolio = useCallback((field: keyof PortfolioAssumptions, value: number) => {
    setPlan((current) => ({ ...current, portfolio: { ...current.portfolio, [field]: value } }));
  }, [setPlan]);

  const updateListItem = useCallback(<Key extends "spendingPhases" | "oneOffExpenses" | "properties" | "pensions">(key: Key, id: string, patch: Partial<PlanInputs[Key][number]>) => {
    setPlan((current) => ({ ...current, [key]: (current[key] as { id: string }[]).map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }, [setPlan]);

  const removeListItem = useCallback((key: "spendingPhases" | "oneOffExpenses" | "properties" | "pensions", id: string) => {
    setPlan((current) => ({ ...current, [key]: (current[key] as { id: string }[]).filter((item) => item.id !== id) }));
  }, [setPlan]);

  const updatePhase = useCallback((id: string, patch: Partial<SpendingPhase>) => updateListItem("spendingPhases", id, patch), [updateListItem]);
  const updateOneOff = useCallback((id: string, patch: Partial<OneOffExpense>) => updateListItem("oneOffExpenses", id, patch), [updateListItem]);
  const updateProperty = useCallback((id: string, patch: Partial<PropertyAsset>) => updateListItem("properties", id, patch), [updateListItem]);
  const updatePension = useCallback((id: string, patch: Partial<PensionIncome>) => updateListItem("pensions", id, patch), [updateListItem]);

  return { update, updatePot, addPot, removePot, updateAccessAge, setHousehold, updatePartner, updatePartnerIncome, updateIncome, updatePortfolio, updatePhase, updateOneOff, updateProperty, updatePension, removeListItem, setPlan };
}

export type PlanUpdaters = ReturnType<typeof usePlanUpdaters>;
