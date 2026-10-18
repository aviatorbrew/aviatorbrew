"use client";

import { useId } from "react";
import type { CateringPackage } from "@/lib/event-plan";
import { money } from "@/lib/event-plan";

export function packagePrice(cents: number) { return money(cents).replace(/\.00$/, ""); }
export function packageChoices(pkg: CateringPackage) {
  return [
    pkg.appetizers ? `${pkg.appetizers} appetizer${pkg.appetizers === 1 ? "" : "s"}` : "",
    pkg.entrees ? `${pkg.entrees} ${pkg.premiumEntreesIncluded ? "premium " : ""}entrée${pkg.entrees === 1 ? "" : "s"}` : "",
    pkg.salads ? `${pkg.salads} salad${pkg.salads === 1 ? "" : "s"}` : "",
    pkg.sides ? `${pkg.sides} side${pkg.sides === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
}

export function CateringPackageCards({ packages, minimumGuests, selectedId, disabled, onSelect }: {
  packages: CateringPackage[]; minimumGuests: number; selectedId: string; disabled?: boolean; onSelect: (id: string) => void;
}) {
  const group = useId();
  return <div className="catering-package-cards" role="radiogroup" aria-label="Choose your catering package">
    {packages.map((pkg, index) => {
      const selected = pkg.id === selectedId, id = `${group}-${pkg.id}`;
      const words = pkg.name.trim().split(/\s+/), last = words.pop();
      const tone = pkg.id === "feast" ? "green" : pkg.id === "dinner" ? "rust" : "navy";
      return <label className={`catering-package-card package-tone-${tone}${selected ? " is-selected" : ""}`} key={pkg.id} htmlFor={id}>
        <input className="package-card-radio" type="radio" name={group} id={id} checked={selected} disabled={disabled} value={pkg.id} onChange={() => onSelect(pkg.id)} aria-labelledby={`${id}-name ${id}-price`} aria-describedby={`${id}-choices ${id}-footer`} />
        <span className="package-card-top"><span className="package-card-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="package-card-top-note">{pkg.id === "feast" ? "Great for Celebrations" : "Ready Room buffet"}</span></span>
        <span className="package-card-description">{pkg.premiumEntreesIncluded ? "Premium entrée choices for a memorable gathering." : "A shared buffet. Good company. Your kind of gathering."}</span>
        <span className="package-card-name" role="heading" aria-level={3} id={`${id}-name`}><span>{words.join(" ")}</span>{" "}<span>{last}</span></span>
        <span className="package-card-price" id={`${id}-price`}><strong>{packagePrice(pkg.priceCents)}</strong><span>/ guest</span></span>
        <span className="package-card-divider" aria-hidden="true" />
        <span className="package-card-choices" role="list" id={`${id}-choices`}>{packageChoices(pkg).map(choice => <span role="listitem" key={choice}><span aria-hidden="true">✦</span>Choose {choice}</span>)}</span>
        <span className="package-card-footer" id={`${id}-footer`}><span>Tea, soft drinks &amp; water included</span><span>{minimumGuests} guest minimum · Buffet service &amp; dedicated bartender</span></span>
        <span className="package-card-select" aria-hidden="true"><span>{selected ? "✓ Selected" : "Select package"}</span><span>{selected ? "✓" : "↗"}</span></span>
      </label>;
    })}
  </div>;
}

export function CateringPackageSummary({ pkg, onChange }: { pkg: CateringPackage; onChange: () => void }) {
  return <section className="catering-package-summary" aria-label="Your selected package"><p>Your package</p><h3>{pkg.name}</h3><p className="package-summary-price">{packagePrice(pkg.priceCents)} <span>/ guest</span></p><ul>{packageChoices(pkg).map(choice => <li key={choice}>{choice}</li>)}</ul><button type="button" onClick={onChange}>Change package</button></section>;
}
