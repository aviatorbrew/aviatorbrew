"use client";

import { useEffect, useState } from "react";

const openedAt = new Date("2008-11-28T00:00:00-05:00");

function elapsedParts(now: Date) {
  let years = now.getFullYear() - openedAt.getFullYear();
  let months = now.getMonth() - openedAt.getMonth();
  let days = now.getDate() - openedAt.getDate();
  let hours = now.getHours() - openedAt.getHours();
  let minutes = now.getMinutes() - openedAt.getMinutes();
  let seconds = now.getSeconds() - openedAt.getSeconds();

  if (seconds < 0) { seconds += 60; minutes -= 1; }
  if (minutes < 0) { minutes += 60; hours -= 1; }
  if (hours < 0) { hours += 24; days -= 1; }
  if (days < 0) {
    const previousMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += previousMonth.getDate();
    months -= 1;
  }
  if (months < 0) { months += 12; years -= 1; }

  return { years, months, days, hours, minutes, seconds };
}

const units = [
  ["years", "Years"],
  ["months", "Months"],
  ["days", "Days"],
  ["hours", "Hours"],
  ["minutes", "Minutes"],
  ["seconds", "Seconds"],
] as const;

export function OpenSinceCounter() {
  const [parts, setParts] = useState(() => elapsedParts(openedAt));

  useEffect(() => {
    setParts(elapsedParts(new Date()));
    const timer = window.setInterval(() => setParts(elapsedParts(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <section className="brewery-open-counter" aria-label="How long Aviator Brewing Company has been open">
    <div className="content-wrap brewery-open-counter-inner">
      <div><p className="eyebrow">Open since November 28, 2008</p><h2>Time in flight.</h2></div>
      <dl>{units.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{String(parts[key]).padStart(2, "0")}</dd></div>)}</dl>
    </div>
  </section>;
}
