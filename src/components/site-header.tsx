"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Calendar, MapPin, Phone } from "@/components/icons";
import { BrandLogo } from "@/components/brand-logo";
import { orderFoodUrl, primaryNav } from "@/data/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="Aviator Brewing Company home"><BrandLogo className="brand-logo" decorative /> <span className="wordmark-copy">AVIATOR <b>BREWING CO.</b></span></Link>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {primaryNav.map((item) => <div className={"desktop-nav-item" + (item.children?.length ? " has-submenu" : "")} key={item.href}>
          <Link href={item.href} aria-haspopup={item.children?.length ? "true" : undefined}>{item.label}</Link>
          {item.children?.length ? <div className="desktop-submenu">{item.children.map((child) => <Link href={child.href} key={child.href}>{child.label}</Link>)}</div> : null}
        </div>)}
      </nav>
      <div className="header-actions">
        <a className="button button-small button-order-food" href={orderFoodUrl} data-analytics="order_food_header">Order food <ArrowUpRight /></a>
        <Link className="text-action header-newsletter-link" href="/#updates" data-analytics="newsletter_header">Flight Crew</Link>
        <a className="text-action" href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" data-analytics="directions_header" target="_blank" rel="noreferrer"><MapPin /> Directions</a>
      </div>
      <button className="mobile-toggle" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
        <span className="sr-only">{open ? "Close" : "Open"} menu</span><i /><i />
      </button>
      <div id="mobile-nav" className={`mobile-panel ${open ? "is-open" : ""}`}>
        <nav aria-label="Mobile navigation">
          {primaryNav.map((item) => <div className="mobile-nav-group" key={item.href}>
            <Link href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
            {item.children?.map((child) => <Link className="mobile-submenu-link" href={child.href} onClick={() => setOpen(false)} key={child.href}>{child.label}</Link>)}
          </div>)}
          <Link href="/#updates" onClick={() => setOpen(false)}>Join the Flight Crew</Link>
        </nav>
        <a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="directions_mobile">Get directions <ArrowUpRight /></a>
      </div>
    </header>
    <nav className="mobile-action-bar" aria-label="Quick actions">
      <a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics="directions_mobile_bar"><MapPin />Directions</a>
      <a href={orderFoodUrl} data-analytics="order_food_mobile_bar"><span className="menu-glyph">+</span>Order Food</a>
      <Link href="/events" data-analytics="events_mobile_bar"><Calendar />Events</Link>
      <a href="tel:+19195672337" data-analytics="call_mobile_bar"><Phone />Call</a>
    </nav>
  </>;
}
