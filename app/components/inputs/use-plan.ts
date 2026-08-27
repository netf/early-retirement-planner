"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { createPot, profileOf, withPots, type GuaranteedIncomeInput, type OneOffExpense, type PensionIncome, type PlanInputs, type PortfolioAssumptions, type Pot, type PropertyAsset, type SpendingPhase } from "../../../lib/planner";

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

  const addPot = useCallback((type: string) => {
    setPlan((current) => withPots(current, [...current.pots, createPot(profileOf(current), type, current.pots)]));
  }, [setPlan]);

  const removePot = useCallback((id: string) => {
    setPlan((current) => withPots(current, current.pots.filter((pot) => pot.id !== id)));
  }, [setPlan]);

  /** Type-level setting: when a locked type opens. */
  const updateAccessAge = useCallback((type: string, accessAge: number) => {
    setPlan((current) => ({ ...current, accounts: { ...current.accounts, [type]: { ...current.accounts[type]!, accessAge } } }));
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

  return { update, updatePot, addPot, removePot, updateAccessAge, updateIncome, updatePortfolio, updatePhase, updateOneOff, updateProperty, updatePension, removeListItem, setPlan };
}

export type PlanUpdaters = ReturnType<typeof usePlanUpdaters>;
