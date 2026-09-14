"use client";

import { useId, useMemo, useState } from "react";
import { ArrowUpRight } from "@/components/icons";
import { beerMenuSources, flavorChoices, type Flavor } from "@/data/beer-picker";
import { defaultPreferences, getBeerMatches, type PickerPreferences } from "@/lib/beer-picker";
import { money, priceForPackage, type KegItem, type PackageSize } from "@/lib/keg-packages";
import styles from "./beer-picker.module.css";

export function BeerPicker({ items, onChoose }: { items: KegItem[]; onChoose: (item: KegItem, size: PackageSize) => void }) {
  const id = useId();
  const [preferences, setPreferences] = useState<PickerPreferences>(defaultPreferences);
  const [showAll, setShowAll] = useState(false);
  const matches = useMemo(() => getBeerMatches(items, preferences), [items, preferences]);
  const visible = showAll ? matches : matches.slice(0, 3);
  function update(next: Partial<PickerPreferences>) { setPreferences((previous) => ({ ...previous, ...next })); setShowAll(false); }
  function reset() { setPreferences(defaultPreferences); setShowAll(false); }
  const filtered = preferences.flavor !== "any" || preferences.strength !== "any" || preferences.format !== "any";

  return <section id="beer-picker" className={styles.picker} aria-labelledby={`${id}-title`}>
    <div className={styles.heading}>
      <div><p className="eyebrow">Find your flight</p><h2 id={`${id}-title`}>Your taste. <em>Your beer.</em></h2><p>No beer expertise needed. Tell us what sounds good and we&apos;ll help you find a match.</p></div>
      <a href="#all-keg-inventory" className={styles.browse}>Browse all availability <ArrowUpRight /></a>
    </div>
    <div className={styles.controls}>
      <fieldset className={styles.flavors}>
        <legend><span>01</span> What flavors do you enjoy?</legend>
        <div>{flavorChoices.map((choice) => <label key={choice.value} className={styles.chip}><input type="radio" name={`${id}-flavor`} value={choice.value} checked={preferences.flavor === choice.value} onChange={() => update({ flavor: choice.value as Flavor })} /><span>{choice.label}</span></label>)}</div>
      </fieldset>
      <div className={styles.selects}>
        <label><span><b>02</b> Alcohol preference</span><select value={preferences.strength} onChange={(event) => update({ strength: event.target.value as PickerPreferences["strength"] })}><option value="any">Any ABV</option><option value="lower">5.5% ABV or less</option><option value="middle">Over 5.5% to under 7% ABV</option><option value="higher">7% ABV and up</option></select></label>
        <label><span><b>03</b> How would you like it?</span><select value={preferences.format} onChange={(event) => update({ format: event.target.value as PickerPreferences["format"] })}><option value="any">Kegs or packaged beer</option><option value="kegs">Kegs only</option><option value="packs">Cases &amp; packs only</option></select></label>
      </div>
    </div>
    <div className={styles.resultBar}><p role="status" aria-live="polite">{matches.length ? `${matches.length} ${filtered ? "matching" : "menu-listed"} beer${matches.length === 1 ? "" : "s"} available${!showAll && matches.length > 3 ? " · showing 3" : ""}` : "No available beers match these preferences."}</p>{filtered ? <button type="button" onClick={reset}>Reset preferences</button> : null}</div>
    {matches.length ? <div className={styles.results}>{visible.map(({ item, profile, packages }) => {
      const source = beerMenuSources[profile.source];
      const prices = packages.map((option) => priceForPackage(item, option.value) || 0).filter((price) => price > 0);
      return <article key={item.beerName} className={styles.card}>
        <div className={styles.cardTop}><p>{profile.style}</p><span>{profile.abv.toFixed(1)}% ABV</span></div>
        <h3>{profile.name}</h3>
        <p className={styles.notes}>{profile.notes}</p>
        <a className={styles.source} href={source.url} target="_blank" rel="noreferrer">{source.label} <span className="sr-only">(PDF, opens in a new tab)</span><ArrowUpRight /></a>
        <div className={styles.packages}><span>Available to request</span><p>{packages.map((option) => option.label).join(" · ")}</p><strong>From {money(Math.min(...prices))} <small>per package</small></strong></div>
        <button type="button" onClick={() => onChoose(item, packages[0].value)} aria-label={`Choose ${profile.name}`}>Choose this beer <ArrowUpRight /></button>
      </article>;
    })}</div> : <div className={styles.empty}><h3>Let&apos;s find another flight.</h3><p>Try a different flavor, alcohol range, or package type. You can also browse the full inventory or ask our team for help.</p><a href="mailto:orders@aviatorbrew.com?subject=Help%20choosing%20a%20beer">Help me choose <ArrowUpRight /></a></div>}
    {!showAll && matches.length > 3 ? <button type="button" className={styles.showMore} onClick={() => setShowAll(true)}>Show all {matches.length} matches</button> : null}
    <p className={styles.footnote}>Tasting notes and ABVs come from our beer menus. Matches use current package availability; our team confirms every order. More beers and other drinks may be listed below.</p>
  </section>;
}
