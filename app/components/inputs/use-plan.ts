"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { AccountInput, GuaranteedIncomeInput, OneOffExpense, PensionIncome, PlanInputs, PortfolioAssumptions, PropertyAsset, SpendingPhase } from "../../../lib/planner";

export type SetPlan = Dispatch<SetStateAction<PlanInputs>>;

/** Small, typed updaters over the plan so each input section stays declarative. */
export function usePlanUpdaters(setPlan: SetPlan) {
  const update = useCallback(<Key extends keyof PlanInputs>(key: Key, value: PlanInputs[Key]) => {
    setPlan((current) => ({ ...current, [key]: value }));
  }, [setPlan]);

  const updateAccount = useCallback((id: string, patch: Partial<AccountInput>) => {
    setPlan((current) => {
      const next: AccountInput = { ...current.accounts[id]!, ...patch };
      const balancesAsOf = "balance" in patch ? new Date().toISOString().slice(0, 10) : current.balancesAsOf;
      return { ...current, balancesAsOf, accounts: { ...current.accounts, [id]: next } };
    });
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

  return { update, updateAccount, updateIncome, updatePortfolio, updatePhase, updateOneOff, updateProperty, updatePension, removeListItem, setPlan };
}

export type PlanUpdaters = ReturnType<typeof usePlanUpdaters>;
