"use client";
import { changeEventPackage, emptyFlightPlan, money, readyRoomAppetizers, readyRoomExtraPrices, readyRoomMenu, readyRoomPackages, type EventPlanDetails, type FlightPlan } from "@/lib/event-plan";

type Props = { details: EventPlanDetails; onChange: (plan: FlightPlan) => void };
const pizzaName = "Aviator Pizzeria Pizza Bar";
export function EventFlightPlanFields({ details, onChange }: Props) {
  const f = { ...emptyFlightPlan(), ...details.flightPlan };
  const pkg = readyRoomPackages.find(p => p.id === f.packageId);
  const entrees = f.packageId === "dinner" ? readyRoomMenu.premiumEntrees : readyRoomMenu.entrees;
  const hasPizza = [...f.entrees, ...f.extraEntrees].includes(pizzaName) || f.pizzaExtra;
  function update(values: Partial<FlightPlan>) {
    const next = { ...f, ...values };
    if (![...next.entrees, ...next.extraEntrees].includes(pizzaName) && !next.pizzaExtra) Object.assign(next, { pizzas: [], glutenFreeCount: 0, pizzaTime: "", pizzaNotes: "" });
    if (![...next.entrees, ...next.extraEntrees].includes("Aviator Smoked Wings")) next.wingSauce = "";
    onChange(next);
  }
  function text(key: keyof FlightPlan, label: string, type = "text") {
    return <label key={key}>{label}<input type={type} maxLength={2000} value={String(f[key])} onChange={e => update({ [key]: e.target.value })} /></label>;
  }
  function foodOptions(options: string[], appetizers = false) {
    if (!appetizers) return options.map(name => <option key={name} value={name}>{name}</option>);
    return <><optgroup label="Appetizers">{readyRoomMenu.appetizers.map(name => <option key={name} value={name}>{name}</option>)}</optgroup><optgroup label="Premium appetizers (+$3 / guest per selection)">{readyRoomMenu.premiumAppetizers.map(name => <option key={name} value={name}>{name} (+$3 / guest)</option>)}</optgroup></>;
  }
  function choices(key: "appetizers" | "entrees" | "sides" | "salads", label: string, options: string[], count: number) {
    return count ? <div className="event-menu-group"><h4>{label} <small>Choose {count}</small></h4>{Array.from({ length: count }, (_, i) => <label key={i}>{label.replace(/s$/, "")} {i + 1}<select value={f[key][i] || ""} required onChange={e => { const next = Array.from({ length: count }, (_, n) => f[key][n] || ""); next[i] = e.target.value; update({ [key]: next }); }}><option value="">Choose {label.toLowerCase().replace(/s$/, "")}…</option>{foodOptions(options, key === "appetizers")}</select></label>)}</div> : null;
  }
  function extras(key: "extraAppetizers" | "extraEntrees" | "extraSides" | "extraSalads", label: string, options: string[], price: number | null, buttonLabel: string, priceKey?: "extraSidePriceCents" | "extraSaladPriceCents") {
    const limit = 12;
    return <div className="event-menu-group"><h4>{label} <small>{price === null ? "Set price per guest" : `+${money(price)} / guest each`}</small></h4>{f[key].map((value, i) => <div className="event-extra-choice" key={i}><label>{label} {i + 1}<select value={value} required onChange={e => update({ [key]: f[key].map((v, n) => n === i ? e.target.value : v) })}><option value="">Choose…</option>{key === "extraAppetizers" ? foodOptions(options, true) : options.map(name => <option key={name} value={name} disabled={key === "extraEntrees" && f.pizzaExtra && name === pizzaName}>{name}</option>)}</select></label><button type="button" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => update({ [key]: f[key].filter((_, n) => n !== i) })}>×</button></div>)}{priceKey && f[key].length ? <label>{label} price / guest ($)<input type="number" min={0} max={100000} step="0.01" required value={price === null ? "" : price / 100} onChange={e => update({ [priceKey]: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} /></label> : null}<button type="button" disabled={f[key].length >= limit} onClick={() => update({ [key]: [...f[key], ""] })}>+ {buttonLabel}</button></div>;
  }
  return <>
    <fieldset><legend>Package & food selections</legend>
      <div className="event-fields"><label className="event-field-wide">Ready Room package<select value={f.packageId} onChange={e => { const next = changeEventPackage(f, e.target.value); if (!next.packageId) Object.assign(next, { extraAppetizers: [], extraEntrees: [], extraSides: [], extraSalads: [], extraHours: 0, dessert: false, coffee: false, pizzaExtra: false }); else { next.extraAppetizers = []; next.extraEntrees = []; next.extraSides = []; next.extraSalads = []; } update(next); }}><option value="">Custom event / choose a package…</option>{readyRoomPackages.map(p => <option value={p.id} key={p.id}>{p.name} — {money(p.priceCents)} / guest</option>)}</select></label></div>
      {pkg ? <><p className="event-package-hint">{pkg.appetizers} appetizers · {pkg.entrees} {pkg.id === "dinner" ? "premium " : ""}entrees · {pkg.sides} sides{pkg.salads ? " · 1 salad" : ""}. Food choices below are included, following the Flight Plan. Tea, soft drinks, water & bartender included. 30-guest minimum. Food slots may repeat the same choice. Each added selection is charged separately. Premium appetizers add $3 / guest per selection, including when chosen within your package.</p>
        <div className="event-menu-grid">
          <div className="event-menu-group">{choices("appetizers", "Appetizers", readyRoomAppetizers, pkg.appetizers)}{extras("extraAppetizers", "Additional appetizer", readyRoomAppetizers, readyRoomExtraPrices.appetizer, "Add appetizer")}</div>
          <div className="event-menu-group">{choices("entrees", pkg.id === "dinner" ? "Premium entrees" : "Entrees", entrees, pkg.entrees)}{extras("extraEntrees", "Additional entree", entrees, readyRoomExtraPrices.entree, "Add entree")}</div>
          <div className="event-menu-group">{choices("sides", "Sides", readyRoomMenu.sides, pkg.sides)}{extras("extraSides", "Additional side", readyRoomMenu.sides, f.extraSidePriceCents, "Add side", "extraSidePriceCents")}</div>
          <div className="event-menu-group">{pkg.salads ? choices("salads", "Salads", readyRoomMenu.salads, pkg.salads) : <h4>Salads <small>Optional extra</small></h4>}{extras("extraSalads", "Additional salad", readyRoomMenu.salads, f.extraSaladPriceCents, "Add salad", "extraSaladPriceCents")}</div>
        </div>
        <details className="event-compact-details"><summary>Other extras — coffee, dessert & hours</summary><div className="event-fields event-extra-options"><label>Additional hours ($100 each)<input type="number" min={0} max={24} step={1} value={f.extraHours} onChange={e => update({ extraHours: Number(e.target.value) })} /></label><label className="event-check"><input type="checkbox" checked={f.dessert} onChange={e => update({ dessert: e.target.checked })} />Dessert display (+$6 / guest)</label><label className="event-check"><input type="checkbox" checked={f.coffee} onChange={e => update({ coffee: e.target.checked })} />Coffee service (+$3 / guest)</label><label className="event-check"><input type="checkbox" checked={f.pizzaExtra} disabled={[...f.entrees, ...f.extraEntrees].includes(pizzaName)} onChange={e => update({ pizzaExtra: e.target.checked })} />Extra Pizza Bar (+$5 / guest)</label></div></details>
        {hasPizza ? <div className="event-pizza-options"><h4>Pizza Bar — choose 1 to 3 styles <small>2 slices / guest per Pizza Bar entree · classic & specialty included in the Flight Plan</small></h4><div className="event-pizza-styles">{readyRoomMenu.pizzas.map(name => <label className="event-check" key={name}><input type="checkbox" checked={f.pizzas.includes(name)} disabled={!f.pizzas.includes(name) && f.pizzas.length >= 3} onChange={e => update({ pizzas: e.target.checked ? [...f.pizzas, name] : f.pizzas.filter(v => v !== name) })} />{name}</label>)}</div><div className="event-fields"><label>Gluten-free pizza quantity<input type="number" min={0} max={10000} value={f.glutenFreeCount} onChange={e => update({ glutenFreeCount: Number(e.target.value) })} /></label>{text("pizzaTime", "Pizza service time", "time")}{text("pizzaNotes", "Pizza notes")}</div></div> : null}
        {[...f.entrees, ...f.extraEntrees].includes("Aviator Smoked Wings") ? <label className="event-wing-sauce">Wing sauce<select value={f.wingSauce} onChange={e => update({ wingSauce: e.target.value })}><option value="">Confirm sauce later</option>{["Dry Rub", "Aviator", "Buffalo", "BlackMamba", "Monster"].map(s => <option key={s}>{s}</option>)}</select></label> : null}
      </> : <p className="event-package-hint">Pick a package to see its required food choices, or enter a custom order below.</p>}
      <div className="event-fields event-food-notes">{text("dietaryNeeds", "Allergies / dietary needs")}{text("foodNotes", "Food notes / requested changes")}</div>
    </fieldset>
    <details className="event-compact-details"><summary>Flight Plan details — billing, bar, decorating & AV</summary>
      <div className="event-fields">{text("eventType", "Event type")}{text("organization", "Company / organization")}{text("billingName", "Billing contact")}{text("billingAddress", "Billing address")}{text("appetizerTime", "Appetizers served", "time")}{text("outsideSeating", "Outside seating request")}
        <label>Bar setup<select value={f.barMode} onChange={e => update({ barMode: e.target.value })}><option value="">Confirm later</option>{["Guest-paid bar", "Hosted tab", "Drink tickets"].map(s => <option key={s}>{s}</option>)}</select></label><label>Hosted tab cap ($)<input type="number" min={0} step="0.01" value={f.barCapCents / 100} onChange={e => update({ barCapCents: Math.round(Number(e.target.value) * 100) })} /></label><label>Drink ticket count<input type="number" min={0} max={10000} value={f.ticketCount} onChange={e => update({ ticketCount: Number(e.target.value) })} /></label>{text("barContact", "Authorized bar contact")}
        {text("decorContact", "Decorator / vendor contact")}{text("decorPhone", "Decorator phone", "tel")}{text("decorCompany", "Decorating company")}{text("decorNotes", "Decorating / room setup notes")}
      </div><p className="event-package-hint">Drink tickets are billed at actual drink prices, typically $6–$17. Tab caps are planning limits; enter actual or estimated charges below when known.</p><div className="event-pizza-styles">{readyRoomMenu.av.map(name => <label className="event-check" key={name}><input type="checkbox" checked={f.av.includes(name)} onChange={e => update({ av: e.target.checked ? [...f.av, name] : f.av.filter(v => v !== name) })} />{name} (included)</label>)}</div>
    </details>
  </>;
}
