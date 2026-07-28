"use client";

import { useMemo, useState } from "react";

type BrewingStep = {
  id: string;
  label: string;
  vessel: string;
  metric: string;
  output: string;
  detail: string;
};

const steps: BrewingStep[] = [
  { id: "grain", label: "Grain", vessel: "Mill + grist case", metric: "Crush set for flow", output: "Malted grain", detail: "The grist is cracked open so hot liquor can reach the starch without turning the mash into paste." },
  { id: "mash", label: "Mash", vessel: "Mash tun", metric: "148-156 F", output: "Sweet wort", detail: "Water and grain settle into the mash schedule, converting starches into the sugars yeast can later ferment." },
  { id: "lauter", label: "Lauter", vessel: "Lauter tun", metric: "Clear runoff", output: "Separated wort", detail: "The grain bed becomes a natural filter while the brewhouse pulls clear wort away from spent grain." },
  { id: "kettle", label: "Boil", vessel: "Kettle + whirlpool", metric: "60+ minutes", output: "Hopped wort", detail: "The boil locks in bitterness and timing additions, then the whirlpool gathers hop material before cooling." },
  { id: "cellar", label: "Ferment", vessel: "Fermenter", metric: "Yeast at work", output: "Young beer", detail: "Yeast takes the controls, converting sugar into alcohol and building the character of the finished beer." },
  { id: "package", label: "Pour", vessel: "Brite tank + package", metric: "Carbonation check", output: "Ready beer", detail: "The beer settles, clears, carbonates, and moves toward draft lines, cans, or the next Aviator pour." },
];

export function BrewingDiagram() {
  const [activeId, setActiveId] = useState(steps[0].id);
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));
  const active = steps[activeIndex] || steps[0];
  const progress = useMemo(() => `${(activeIndex / (steps.length - 1)) * 100}%`, [activeIndex]);

  return <div className="brewing-diagram" aria-label="Interactive brewing process diagram">
    <div className="brewing-diagram-track" aria-hidden="true"><span style={{ width: progress }} /></div>
    <div className="brewing-diagram-controls" role="tablist" aria-label="Brewing process stages">
      {steps.map((step, index) => <button key={step.id} type="button" role="tab" aria-selected={step.id === active.id} className={step.id === active.id ? "is-active" : ""} onClick={() => setActiveId(step.id)}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{step.label}</strong>
      </button>)}
    </div>
    <div className="brewing-diagram-stage">
      <div className={"brewing-diagram-vessel vessel-" + active.id} aria-hidden="true">
        <span className="vessel-cap" />
        <span className="vessel-body"><i /></span>
        <span className="vessel-base" />
      </div>
      <article>
        <p className="eyebrow">Active checkpoint {String(activeIndex + 1).padStart(2, "0")}</p>
        <h3>{active.vessel}</h3>
        <dl>
          <div><dt>Control</dt><dd>{active.metric}</dd></div>
          <div><dt>Output</dt><dd>{active.output}</dd></div>
        </dl>
        <p>{active.detail}</p>
      </article>
    </div>
  </div>;
}
