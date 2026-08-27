"use client";

import { useState } from "react";
import { PROFILES, buildStarterPlan, type PlanInputs, type ProfileId, type StarterInputs } from "../../lib/planner";
import { CountryPicker } from "./CountryPicker";
import { NumberField } from "./fields";
import { useMoney } from "./money";

const STARTERS: Record<ProfileId, Omit<StarterInputs, "balancesAsOf">> = {
  uk: { currentAge: 40, retirementAge: 55, monthlySpending: 2_500, pensionBalance: 150_000, accessibleBalance: 60_000, monthlySaving: 1_000 },
  us: { currentAge: 40, retirementAge: 55, monthlySpending: 4_500, pensionBalance: 300_000, accessibleBalance: 100_000, monthlySaving: 1_500 },
  pl: { currentAge: 40, retirementAge: 55, monthlySpending: 8_000, pensionBalance: 300_000, accessibleBalance: 200_000, monthlySaving: 3_000 },
  ro: { currentAge: 40, retirementAge: 55, monthlySpending: 10_000, pensionBalance: 100_000, accessibleBalance: 250_000, monthlySaving: 3_000 },
};

/** Six numbers and a country: enough to build a first plan. Everything else can be refined afterwards. */
export function Welcome({ profileId, onProfile, onBuild, onExplore }: { profileId: ProfileId; onProfile: (id: ProfileId) => void; onBuild: (plan: PlanInputs) => void; onExplore: () => void }) {
  const money = useMoney();
  const profile = PROFILES[profileId];
  const [form, setForm] = useState(STARTERS[profileId]);
  const set = <Key extends keyof typeof form>(key: Key, value: number) => setForm((current) => ({ ...current, [key]: value }));
  const longTerm = profile.accounts.find((rule) => rule.id === profile.savingTargets.longTerm)?.name ?? "pension";
  const bridge = profile.accounts.find((rule) => rule.id === profile.savingTargets.bridge)?.name ?? "savings";
  const switchProfile = (id: ProfileId) => { onProfile(id); setForm(STARTERS[id]); };
  return (
    <section className="welcome card" aria-label="Start a plan">
      <div className="welcome-head">
        <h2>Will your money last if you stop work early?</h2>
        <p>Six numbers build a first plan. It runs 1,000 possible futures of markets and inflation and tells you how often the money lasts — then you can add property, pensions and one-off costs. Nothing you enter leaves this browser.</p>
      </div>
      <div className="welcome-profile"><span className="field-label">Country</span><CountryPicker value={profileId} onChange={switchProfile} /></div>
      <div className="grid three">
        <NumberField label="Age now" value={form.currentAge} min={18} max={90} onChange={(value) => set("currentAge", value)} />
        <NumberField label="Stop work at" value={form.retirementAge} min={form.currentAge} max={90} onChange={(value) => set("retirementAge", value)} />
        <NumberField label="Spending per month" value={form.monthlySpending} prefix={money.symbol} step={100} onChange={(value) => set("monthlySpending", value)} hint="After tax, today's money" />
      </div>
      <div className="grid three">
        <NumberField label={`In ${longTerm}`} value={form.pensionBalance} prefix={money.symbol} step={5_000} onChange={(value) => set("pensionBalance", value)} hint="Locked until pension age" />
        <NumberField label={`In ${bridge} and cash`} value={form.accessibleBalance} prefix={money.symbol} step={5_000} onChange={(value) => set("accessibleBalance", value)} hint="Money you could spend tomorrow" />
        <NumberField label="Saving per month" value={form.monthlySaving} prefix={money.symbol} step={100} onChange={(value) => set("monthlySaving", value)} hint="Until you stop work" />
      </div>
      <div className="welcome-actions">
        <button type="button" className="button primary" onClick={() => onBuild(buildStarterPlan(profileId, { ...form, balancesAsOf: new Date().toISOString().slice(0, 10) }))}>Build my plan</button>
        <button type="button" className="add" onClick={onExplore}>Or explore the example plan</button>
      </div>
    </section>
  );
}
