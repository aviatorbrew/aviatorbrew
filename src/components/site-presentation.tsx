"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { activeSiteSkin, defaultSiteTheme, skinAllowedOnPath, themeDateLabel, themeTimeLabel, type SiteTheme } from "@/lib/site-skins";
import {resolveScheduledSiteTheme} from '@/lib/site-skin-schedule';
import {SkinImageCommunity} from '@/components/skin-image-community';
import { ArrowUpRight, MapPin } from "@/components/icons";

const ThemeContext = createContext<SiteTheme>(defaultSiteTheme);

export function SitePresentation({ initial, children }: { initial: SiteTheme; children: ReactNode }) {
  const [theme, setTheme] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const allowed = skinAllowedOnPath(usePathname() || "/");
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/site-theme", { cache: "no-store", signal: controller.signal });
        if (response.ok) { const next = await response.json(); setTheme(next); setNow(Date.now()); }
      } catch { /* Keep the last known settings during a network interruption. */ }
    }
    refresh();
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    function update(event: Event) { setTheme((event as CustomEvent<SiteTheme>).detail); setNow(Date.now()); }
    window.addEventListener("aviator-site-theme-updated", update);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("aviator-site-theme-updated", update); };
  }, [allowed]);
  useEffect(() => {
    if (!theme.expiresAt || activeSiteSkin(theme) === "classic") return;
    const remaining = Date.parse(theme.expiresAt) - Date.now();
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(remaining, 1), 2147483647));
    return () => clearTimeout(timer);
  }, [theme, now]);
  const scheduled=resolveScheduledSiteTheme(theme,new Date(now));
  const skin = allowed ? activeSiteSkin(scheduled, now) : "classic";
  const effective = { ...scheduled, skin };
  return <ThemeContext.Provider value={effective}><div className="site-presentation" data-site-skin={skin}>
    {skin !== "classic" && <div className="skin-ribbon"><Link href={effective.promotion.href}><span aria-hidden="true">✦</span><strong>{effective.promotion.title}</strong><span>{themeDateLabel(effective)}{effective.promotion.kind!=='seasonal'&&<> · {themeTimeLabel(effective.promotion.startTime)}–{themeTimeLabel(effective.promotion.endTime)}</>}</span><span className="skin-ribbon-opening">{effective.promotion.openingNote}</span><ArrowUpRight /></Link></div>}
    {children}
  </div></ThemeContext.Provider>;
}

export function ThemedHomeHero({ children }: { children: ReactNode }) {
  const theme = useContext(ThemeContext), p = theme.promotion;
  if (theme.skin === "classic") return children;
  return <section className={"skin-show-hero"+(p.kind==='seasonal'?' skin-seasonal-hero':'')} aria-labelledby="skin-show-title">
    <div className="skin-orbit skin-orbit-one" aria-hidden="true" /><div className="skin-orbit skin-orbit-two" aria-hidden="true" />
    <div className="content-wrap skin-show-layout">
      <div className="skin-show-copy">
        <p className="skin-show-kicker"><span aria-hidden="true">✦</span> {p.eyebrow}</p>
        <p className="skin-show-presenter">AVIATOR BREWING COMPANY PRESENTS</p>
        <h1 id="skin-show-title">{p.title}</h1>
        <div className="skin-show-date"><span>{themeDateLabel(theme)}</span>{p.kind!=='seasonal'&&<strong>{themeTimeLabel(p.startTime)} – {themeTimeLabel(p.endTime)}</strong>}</div>
        {p.openingNote && <p className="skin-show-opening">{p.openingNote}</p>}
        <p className="skin-show-description">{p.description}</p>
        <p className="skin-show-venue"><MapPin /> {p.venue} <span>Fuquay-Varina, NC</span></p>
        <div className="skin-show-actions"><Link className="button" href={p.href}>{p.linkLabel} <ArrowUpRight /></Link><Link className="button button-outline" href="/locations#hangar-bar">Food + drinks at the Hangar Bar <ArrowUpRight /></Link></div>
        <p className="skin-show-address">688 Brewing Drive · Bring your crew. Make a day of it.</p>
      </div>
      {p.imageUrl && <figure className="skin-show-poster"><div className="skin-poster-frame"><Image src={p.imageUrl} alt={p.imageAlt} fill priority unoptimized sizes="(max-width: 760px) 85vw, 420px" /></div><figcaption>{p.kind==='seasonal'?'CRAFT BEER · COMMUNITY · AVIATOR':'LIVE MUSIC · FRESH BEER · GOOD COMPANY'}</figcaption>{theme.communityEnabled&&<SkinImageCommunity skin={theme.skin} imageUrl={p.imageUrl}/>}</figure>}
    </div>
    <div className="skin-show-bottom" aria-hidden="true"><span>{p.kind==='seasonal'?'BRING YOUR CREW':'COME EARLY'}</span><i>✦</i><span>{p.kind==='seasonal'?'RAISE A GLASS':'STAY FOR THE MUSIC'}</span><i>✦</i><span>AVIATOR BREWING CO.</span></div>
  </section>;
}
