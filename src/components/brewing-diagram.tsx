"use client";

import { useMemo, useState } from "react";

type Recipe = {
  id: string;
  name: string;
  color: string;
  colorName: string;
  malt: string;
  grainRole: string;
  hops: string;
  yeast: string;
  abv: string;
  co2: string;
  temp: string;
};

type BrewingStep = {
  id: string;
  label: string;
  vessel: string;
  metric: string;
  output: string;
  detail: string;
  recipeNote: string;
  tankNote: string;
};

const recipes: Recipe[] = [
  { id: "lager", name: "Clean lager", color: "#efc96b", colorName: "Pale gold", malt: "Pilsner malt with a light specialty touch", grainRole: "Pale malt keeps the body crisp and the color bright.", hops: "Low bitterness, floral finish", yeast: "Lager yeast works cool and clean", abv: "4.8%", co2: "2.55 vols", temp: "50-54 F" },
  { id: "ipa", name: "Hop-forward IPA", color: "#d99335", colorName: "Deep amber", malt: "2-row base malt plus caramel support", grainRole: "A small caramel addition deepens color and gives hops a malt backbone.", hops: "High late-hop aroma", yeast: "Ale yeast keeps fruit and hop oils expressive", abv: "6.7%", co2: "2.45 vols", temp: "66-70 F" },
  { id: "stout", name: "Dark stout", color: "#2a1710", colorName: "Near black", malt: "Pale malt, chocolate malt, roasted barley", grainRole: "Roasted grain drives the dark color and adds coffee/cocoa edges.", hops: "Firm balance, low aroma", yeast: "Ale yeast leaves body and roast roundness", abv: "7.2%", co2: "2.25 vols", temp: "64-68 F" },
];

const steps: BrewingStep[] = [
  { id: "grain", label: "Recipe", vessel: "Recipe + grain bill", metric: "Color starts here", output: "Malt plan", detail: "A recipe starts with the target beer: style, strength, color, bitterness, aroma, finish, and where it will be poured. Brewers choose base malt for fermentable sugar, then add specialty grain for color, body, toast, caramel, chocolate, or roast.", recipeNote: "Move between sample recipes to see how the grain bill changes the beer color before the first tank is filled.", tankNote: "No yeast yet. This is the blueprint: grain weight, water profile, hop timing, yeast strain, target ABV, and carbonation." },
  { id: "mash", label: "Mash", vessel: "Mash tun", metric: "148-156 F", output: "Sweet wort", detail: "Hot brewing liquor hydrates the milled grain. Enzymes in the malt convert starch into fermentable sugars. Lower mash temperatures make a drier beer; warmer mash temperatures leave more body.", recipeNote: "Base malt does most of the sugar work. Specialty malts ride along for color, body, and flavor.", tankNote: "The tank is full of grain and hot water. The brewer is watching temperature, thickness, pH, and conversion." },
  { id: "lauter", label: "Separate", vessel: "Lauter tun", metric: "Clear runoff", output: "Separated wort", detail: "The grain bed becomes a filter. Sweet wort runs away from spent grain while sparge water rinses remaining sugars into the kettle path.", recipeNote: "A well-built grain bill lauteres cleanly, balancing flavor impact with flow through the grain bed.", tankNote: "The liquid brightens as solids stay behind. Flow rate matters: too fast can compact the bed, too slow wastes time." },
  { id: "kettle", label: "Boil", vessel: "Kettle + whirlpool", metric: "60+ minutes", output: "Hopped wort", detail: "Boiling sterilizes wort, drives off unwanted volatiles, concentrates sugars, and extracts hop bitterness. Whirlpool additions add hop flavor and aroma before chilling.", recipeNote: "Hop timing changes the beer: early hops add bitterness, late hops add flavor, whirlpool and dry-hop additions push aroma.", tankNote: "The wort is hot, moving, and aromatic. After whirlpool, it heads through chilling on the way to fermentation." },
  { id: "cellar", label: "Ferment", vessel: "Fermenter", metric: "Yeast + CO2", output: "Young beer", detail: "Yeast consumes wort sugars and produces alcohol, CO2, heat, and flavor compounds. Fermentation temperature and yeast strain decide whether the beer lands clean, fruity, spicy, soft, or bold.", recipeNote: "The recipe chooses the yeast for a reason: lager strains stay clean, ale strains can build fruit, and specialty strains can add spice or acidity.", tankNote: "CO2 rises through the beer while yeast works. Brewers track gravity, temperature, pressure, aroma, and cleanup before the beer moves on." },
  { id: "package", label: "Pour", vessel: "Brite tank + package", metric: "Carbonation check", output: "Ready beer", detail: "Finished beer settles into balance. The crew checks clarity, carbonation, flavor, and recipe targets before sending it to draft, package, or the next pour across Aviator.", recipeNote: "The finished pour should match the original recipe target: color, aroma, body, bitterness, ABV, and carbonation.", tankNote: "CO2 is now controlled for service. Too little tastes flat; too much foams and hides aroma." },
];

export function BrewingDiagram() {
  const [activeId, setActiveId] = useState(steps[0].id);
  const [recipeId, setRecipeId] = useState(recipes[1].id);
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));
  const active = steps[activeIndex] || steps[0];
  const recipe = recipes.find((item) => item.id === recipeId) || recipes[0];
  const progress = useMemo(() => `${(activeIndex / (steps.length - 1)) * 100}%`, [activeIndex]);

  return <div className="brewing-diagram" aria-label="Interactive brewing process diagram">
    <div className="brewing-diagram-track" aria-hidden="true"><span style={{ width: progress }} /></div>
    <div className="brewing-diagram-controls" role="tablist" aria-label="Brewing process stages">
      {steps.map((step, index) => <button key={step.id} type="button" role="tab" aria-selected={step.id === active.id} className={step.id === active.id ? "is-active" : ""} onClick={() => setActiveId(step.id)}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{step.label}</strong>
      </button>)}
    </div>

    <div className="brewing-recipe-lab">
      <div>
        <p className="eyebrow">Recipe builder</p>
        <h3>Choose a target beer.</h3>
        <p>A beer recipe is built backward from the finished glass: color, strength, malt body, hop impact, yeast character, carbonation, and where the beer will be served.</p>
      </div>
      <div className="brewing-recipe-buttons" aria-label="Sample beer recipes">
        {recipes.map((item) => <button key={item.id} type="button" className={item.id === recipe.id ? "is-active" : ""} onClick={() => setRecipeId(item.id)}>
          <span style={{ background: item.color }} aria-hidden="true" />
          {item.name}
        </button>)}
      </div>
    </div>

    <div className="brewing-diagram-stage">
      <div className="brewing-visual-stack">
        {active.id === "package" ? <div className="brewing-pint-glass" aria-hidden="true">
          <span className="pint-foam" />
          <span className="pint-beer" style={{ background: `linear-gradient(180deg, ${recipe.color}, #7b4427)` }} />
          <span className="pint-shine" />
        </div> : <div className={"brewing-diagram-vessel vessel-" + active.id} aria-hidden="true">
          <span className="vessel-cap" />
          <span className="vessel-body" style={{ background: `linear-gradient(180deg, rgba(184, 217, 236, .16), ${recipe.color}55)` }}><i style={{ background: `linear-gradient(180deg, ${recipe.color}, #7b4427)` }} /></span>
          <span className="vessel-base" />
        </div>}
        <div className="beer-color-card">
          <span style={{ background: recipe.color }} />
          <div><b>{recipe.colorName}</b><small>{recipe.grainRole}</small></div>
        </div>
      </div>
      <article>
        <p className="eyebrow">Active checkpoint {String(activeIndex + 1).padStart(2, "0")}</p>
        <h3>{active.vessel}</h3>
        <dl>
          <div><dt>Control</dt><dd>{active.metric}</dd></div>
          <div><dt>Output</dt><dd>{active.output}</dd></div>
        </dl>
        <p>{active.detail}</p>
        <p>{active.recipeNote}</p>
      </article>
    </div>

    <div className="brewing-detail-grid">
      <article>
        <p className="eyebrow">Grain + color</p>
        <h4>{recipe.malt}</h4>
        <p>{recipe.grainRole}</p>
      </article>
      <article>
        <p className="eyebrow">Hop plan</p>
        <h4>{recipe.hops}</h4>
        <p>Bitterness, flavor, and aroma come from when hops enter the process and how much contact time they get.</p>
      </article>
      <article className="fermenter-detail">
        <p className="eyebrow">Fermenter watch</p>
        <h4>{recipe.yeast}</h4>
        <dl>
          <div><dt>Target ABV</dt><dd>{recipe.abv}</dd></div>
          <div><dt>Temp</dt><dd>{recipe.temp}</dd></div>
          <div><dt>CO2</dt><dd>{recipe.co2}</dd></div>
        </dl>
        <p>{active.tankNote}</p>
      </article>
    </div>
  </div>;
}
