"use client";

import { acquisitionCost, createProperty, estimatedPropertyMonthlyCashIncome, profileOf, type PlanInputs, type PropertyIncomeMode } from "../../../lib/planner";
import { NumberField, Switch, TextField } from "../fields";
import { useMoney } from "../money";
import { Info } from "../Info";
import { Block } from "./Block";
import type { PlanUpdaters } from "./use-plan";

export function Property({ plan, updaters }: { plan: PlanInputs; updaters: PlanUpdaters }) {
  const money = useMoney();
  const profile = profileOf(plan);
  const { updateProperty, removeListItem, setPlan } = updaters;
  const rentalTaxNote = profile.property.rentalTax.kind === "income" ? "Rental profit is taxed as income" : "Rent is taxed flat on the gross amount";
  const gainNote = profile.property.gainTax.kind === "rate" ? "On the nominal gain" : `Only if sold within ${profile.property.gainTax.years} years of purchase`;

  const addProperty = () => setPlan((current) => ({ ...current, properties: [...current.properties, createProperty(profileOf(current), current.properties.length + 1, current.currentAge)] }));
  const setIncomeMode = (id: string, incomeMode: PropertyIncomeMode) => setPlan((current) => ({
    ...current,
    properties: current.properties.map((property) => property.id === id
      ? { ...property, incomeMode, monthlyNetIncome: incomeMode === "net" ? estimatedPropertyMonthlyCashIncome(property) : property.monthlyNetIncome }
      : property),
  }));

  return (
    <Block title="Property" note={`${plan.properties.length} ${plan.properties.length === 1 ? "asset" : "assets"}`} info={<Info title="Property"><span>Rental property is income the market can’t take away as fast as shares, but it’s taxed and can sit empty. The planner counts the rent from the age you choose, pays the mortgage, and handles the sale and its tax if you plan one.</span><em>Example: a flat renting for £1,850 with costs and a mortgage might put ~£550 a month in your pocket before your income tax.</em></Info>} action={<button type="button" className="add" onClick={addProperty}>+ Add</button>}>
      {plan.properties.length === 0 ? <p className="empty">No rental property. Add one you own or plan to buy.</p> : null}
      {plan.properties.map((property) => (
        <details className="property" key={property.id}>
          <summary>
            <span className="property-name">{property.name}</span>
            <span className="property-stat">{property.purchaseAge > plan.currentAge ? `buy at ${property.purchaseAge} · needs ${money.compact(acquisitionCost(property))} · ` : ""}{money.format(estimatedPropertyMonthlyCashIncome(property))}/mo · {money.compact(Math.max(0, property.value - property.mortgage))} equity</span>
          </summary>
          <div className="property-body">
            <div className="item-head">
              <TextField label="Name" value={property.name} onChange={(value) => updateProperty(property.id, { name: value })} />
              <button type="button" className="x" aria-label={`Remove ${property.name}`} onClick={() => removeListItem("properties", property.id)}>×</button>
            </div>
            <div className="sub-head"><span>Purchase &amp; mortgage</span></div>
            <div className="grid two">
              <NumberField label="Owned from / buy at age" value={property.purchaseAge} min={18} max={plan.planToAge} onChange={(value) => updateProperty(property.id, { purchaseAge: value })} hint={property.purchaseAge <= plan.currentAge ? "Owned today" : "Deposit and costs come from savings that year"} />
              <NumberField label="Value / price" value={property.value} prefix={money.symbol} step={5_000} onChange={(value) => updateProperty(property.id, { value })} />
              <NumberField label="Mortgage balance" value={property.mortgage} prefix={money.symbol} step={5_000} onChange={(value) => updateProperty(property.id, { mortgage: value })} hint={property.mortgage > 0 ? undefined : "0 = owned outright"} />
              {property.mortgage > 0 ? <NumberField label="Mortgage rate" value={property.mortgageRatePercent} suffix="%" max={20} step={0.1} onChange={(value) => updateProperty(property.id, { mortgageRatePercent: value })} /> : null}
              {property.mortgage > 0 ? <NumberField label="Mortgage payment per month" value={property.monthlyMortgagePayment} prefix={money.symbol} step={50} onChange={(value) => updateProperty(property.id, { monthlyMortgagePayment: value })} hint="0 = interest only" /> : null}
              {property.purchaseAge > plan.currentAge ? <NumberField label="Purchase costs" value={property.purchaseCostsPercent} suffix="%" max={20} step={0.5} onChange={(value) => updateProperty(property.id, { purchaseCostsPercent: value })} hint="Stamp duty, legal and survey fees" /> : null}
            </div>
            <div className="sub-head"><span>Rent</span><span className="note">{rentalTaxNote}</span></div>
            <Switch label={`${property.name} income method`} value={property.incomeMode} onChange={(value) => setIncomeMode(property.id, value)} options={[{ value: "net", label: "I know the net cash" }, { value: "detailed", label: "Work it out from gross rent" }]} />
            <div className="grid two">
              {property.incomeMode === "net"
                ? <NumberField label="Net income per month" value={property.monthlyNetIncome} prefix={money.symbol} step={50} onChange={(value) => updateProperty(property.id, { monthlyNetIncome: value })} hint="After costs and mortgage, before your income tax" />
                : <NumberField label="Gross rent per month" value={property.monthlyRent} prefix={money.symbol} step={50} onChange={(value) => updateProperty(property.id, { monthlyRent: value })} />}
              <NumberField label="Rent counts from age" value={property.rentFromAge} min={plan.currentAge} max={110} onChange={(value) => updateProperty(property.id, { rentFromAge: value })} hint="Before retirement, rent is assumed spent" />
              {property.incomeMode === "detailed" ? <NumberField label="Vacancy" value={property.vacancyPercent} suffix="%" max={100} onChange={(value) => updateProperty(property.id, { vacancyPercent: value })} /> : null}
              {property.incomeMode === "detailed" ? <NumberField label="Running costs" value={property.runningCostsPercent} suffix="%" max={100} onChange={(value) => updateProperty(property.id, { runningCostsPercent: value })} hint="Share of collected rent" /> : null}
              <NumberField label="Rent growth above inflation" value={property.rentGrowthPercent} suffix="%" min={-10} max={15} step={0.1} onChange={(value) => updateProperty(property.id, { rentGrowthPercent: value })} />
              <NumberField label="Value growth per year" value={property.annualGrowthPercent} suffix="%" min={-10} max={15} step={0.1} onChange={(value) => updateProperty(property.id, { annualGrowthPercent: value })} hint="Nominal" />
            </div>
            <div className="sub-head"><span>Sale</span>{property.sellAtAge > 0 ? <span className="note">{gainNote}</span> : null}</div>
            <div className={`grid ${property.sellAtAge > 0 ? "two" : "three"}`}>
              <NumberField label="Sell at age" value={property.sellAtAge} min={0} max={110} onChange={(value) => updateProperty(property.id, { sellAtAge: value })} hint="0 = keep for life" />
              {property.sellAtAge > 0 ? <NumberField label="Sale costs" value={property.saleCostsPercent} suffix="%" max={20} step={0.5} onChange={(value) => updateProperty(property.id, { saleCostsPercent: value })} /> : null}
              {property.sellAtAge > 0 ? <NumberField label="Cost basis for gains tax" value={property.purchaseCostBasis} prefix={money.symbol} step={5_000} onChange={(value) => updateProperty(property.id, { purchaseCostBasis: value })} hint="What you paid, for the taxable gain" /> : null}
              {property.sellAtAge > 0 ? <NumberField label="Gains tax rate" value={property.estimatedCgtPercent} suffix="%" max={60} step={1} onChange={(value) => updateProperty(property.id, { estimatedCgtPercent: value })} /> : null}
            </div>
          </div>
        </details>
      ))}
    </Block>
  );
}
