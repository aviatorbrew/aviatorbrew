"use client";
import { useMemo, useState } from "react";
import { BeerCard } from "@/components/cards";
import type { Beer } from "@/data/site";

const filters = ["All", "IPA", "Lager", "Ale", "Dark Beer", "High Gravity", "Seasonal", "Limited Release"];

export function BeerGallery({ beers }: { beers: Beer[] }) {
  const [filter, setFilter] = useState("All");
  const visible = useMemo(() => beers.filter((beer) => filter === "All" || beer.category === filter || (filter === "Seasonal" && beer.status === "Seasonal")), [beers, filter]);
  return <section className="beer-deck">
    <div className="beer-deck-controls">
      <div><p className="eyebrow">Flight filters</p><p className="beer-readout"><b>{String(visible.length).padStart(2, "0")}</b> brews cleared for takeoff</p></div>
      <div className="filter-row" role="group" aria-label="Filter beers">{filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
    </div>
    <div className="hangar-beer-grid">{visible.map((beer, index) => <BeerCard key={beer.slug} beer={beer} />)}</div>
    {visible.length === 0 && <p className="form-message">No beers match that filter right now. Check back soon.</p>}
  </section>;
}
