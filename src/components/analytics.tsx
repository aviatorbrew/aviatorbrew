"use client";

import { useEffect } from "react";

export function AnalyticsHooks() {
  useEffect(() => {
    const track = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-analytics]");
      if (!target) return;
      const name = target.dataset.analytics;
      if (name) window.dispatchEvent(new CustomEvent("aviator:conversion", { detail: { name, href: target.getAttribute("href") } }));
    };
    document.addEventListener("click", track);
    return () => document.removeEventListener("click", track);
  }, []);
  return null;
}
