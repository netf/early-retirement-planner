"use client";

import { createContext, useContext, useMemo } from "react";
import { moneyFormat, type Jurisdiction, type MoneyFormat } from "../../lib/planner";

const MoneyContext = createContext<MoneyFormat>(moneyFormat("en-GB", "GBP"));

export function MoneyProvider({ profile, children }: { profile: Jurisdiction; children: React.ReactNode }) {
  const money = useMemo(() => moneyFormat(profile.locale, profile.currency), [profile.locale, profile.currency]);
  return <MoneyContext.Provider value={money}>{children}</MoneyContext.Provider>;
}

/** Currency formatters for the active profile. */
export function useMoney(): MoneyFormat {
  return useContext(MoneyContext);
}
